-- North: security hardening (Nov 8).
--
-- How to apply: SQL Editor > New query > paste > Run. Run it AFTER the first six migrations. Safe to read first.
--
-- What changes:
--  1. approval_nonces + consume_approval_nonce(): a Guardian approval can be spent ONCE, ever, even across servers.
--  2. ledger_apply now enforces the money rules AGAIN, inside the same transaction that saves a new purchase:
--     the weekly budget and the protected money. The app already checks them; this is the database refusing too, so a
--     bug or a bypass in the app still cannot overspend. Everything is all-or-nothing.
--  3. audit_log is tamper-evident: every entry carries the HMAC of the entry before it (hash, prev_hash). The app
--     computes the HMAC with a secret the database does not have. The database checks the chain links up, and a trigger
--     refuses UPDATE, DELETE and TRUNCATE (the demo "Start over" and deleting a whole user are the only exceptions).
--  4. rate_limit_buckets + rate_limit_hit(): rate limits that survive restarts and are shared by every server.
--  5. A webhook event that was already handled is refused (and nothing else in that call is saved).

-- ---------------------------------------------------------------------------------------------
-- 1. Spent approvals
-- ---------------------------------------------------------------------------------------------
create table public.approval_nonces (
  nonce       text primary key check (length(nonce) between 1 and 120),
  user_id     uuid        not null references public.users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz not null default now()
);
create index approval_nonces_expiry_idx on public.approval_nonces (expires_at);
alter table public.approval_nonces enable row level security;
revoke all on table public.approval_nonces from anon, authenticated;
grant select, insert, delete on table public.approval_nonces to service_role;

-- True the first time a nonce is spent, false after. An approval that has expired cannot be used anyway (the app checks
-- its signed expiry), so old rows can be forgotten after a day.
create or replace function public.consume_approval_nonce(p_nonce text, p_user_id uuid, p_expires_at timestamptz)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows integer;
begin
  delete from public.approval_nonces where expires_at < now() - interval '1 day';
  insert into public.approval_nonces (nonce, user_id, expires_at) values (p_nonce, p_user_id, p_expires_at)
  on conflict (nonce) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Has this nonce been spent? (Used for logged-out sessions: logging out spends "session:<id>".)
create or replace function public.approval_nonce_spent(p_nonce text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from public.approval_nonces where nonce = p_nonce);
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Rate limits (fixed windows). One row per key and window; hits are counted atomically.
-- ---------------------------------------------------------------------------------------------
create table public.rate_limit_buckets (
  key          text        not null check (length(key) between 1 and 200),
  bucket_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, bucket_start)
);
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

-- True if this hit is allowed. Every call counts, allowed or not, so hammering a limit keeps it shut.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return false; -- nonsense settings: fail closed
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_buckets as b (key, bucket_start, hits) values (p_key, v_start, 1)
  on conflict (key, bucket_start) do update set hits = b.hits + 1
  returning b.hits into v_hits;
  if random() < 0.02 then
    delete from public.rate_limit_buckets where bucket_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Tamper-evident audit log
-- ---------------------------------------------------------------------------------------------
alter table public.audit_log add column prev_hash text, add column hash text;

create or replace function public.audit_log_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'audit_log is append-only: entries cannot be edited';
  end if;
  if tg_op = 'DELETE' then
    -- Allowed only for the demo "Start over" (it says so first), or when the whole user is being deleted.
    if current_setting('north.allow_audit_reset', true) = 'on' or not exists (select 1 from public.users where id = old.user_id) then
      return old;
    end if;
    raise exception 'audit_log is append-only: entries cannot be deleted';
  end if;
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_edit_delete before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_guard();

-- ---------------------------------------------------------------------------------------------
-- 2, 3, 5. ledger_apply: now checks the money rules, the audit chain and repeated webhook events.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ledger_apply(p_user_id uuid, p_expected_version bigint, p_changes jsonb)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_new bigint;
  v_rows integer;
  v_expected integer := coalesce(jsonb_array_length(p_changes->'purchases'), 0);
  v_waiting integer := coalesce(jsonb_array_length(p_changes->'waiting_list'), 0);
  v_events integer := coalesce(jsonb_array_length(p_changes->'webhook_event_ids'), 0);
  u jsonb := coalesce(p_changes->'user', '{}'::jsonb);
  v_new_ids text[];
  v_user public.users;
  v_total bigint;
  v_spent bigint;
  v_week record;
  v_prev text;
  v_entry record;
begin
  update public.users set
    time_zone           = coalesce(u->>'time_zone', time_zone),
    base_balance_cents  = coalesce((u->>'base_balance_cents')::bigint, base_balance_cents),
    protected_cents     = coalesce((u->>'protected_cents')::bigint, protected_cents),
    weekly_budget_cents = coalesce((u->>'weekly_budget_cents')::bigint, weekly_budget_cents),
    paypal_vault_id     = case when u ? 'paypal_vault_id'    then u->>'paypal_vault_id'    else paypal_vault_id end,
    paypal_customer_id  = case when u ? 'paypal_customer_id' then u->>'paypal_customer_id' else paypal_customer_id end,
    paypal_saved_at     = case when u ? 'paypal_saved_at'    then (u->>'paypal_saved_at')::timestamptz else paypal_saved_at end,
    price_watch         = case when u ? 'price_watch'        then u->'price_watch' else price_watch end,
    agent_checkpoint    = case when u ? 'agent_checkpoint'   then u->'agent_checkpoint' else agent_checkpoint end,
    version             = version + 1,
    updated_at          = now()
  where id = p_user_id and version = p_expected_version
  returning version into v_new;

  if v_new is null then
    return -1;
  end if;
  -- From here on this transaction holds the user's row lock, so no other save for this user runs at the same time.

  -- Which purchases are NEW (not saved before)? Only those are checked against the money rules below.
  select coalesce(array_agg(x.id), '{}') into v_new_ids
  from jsonb_to_recordset(p_changes->'purchases') as x(id text)
  where not exists (select 1 from public.purchases p where p.id = x.id);

  insert into public.purchases (
    id, user_id, attempt_id, product_id, name, category, image_url, amount_cents, currency, status,
    created_at, paid_at, refunded_at, paypal_order_id, capture_id, paid_via, webhook_confirmed_at,
    overrode_wait, decision_code, failure_reason)
  select x.id, p_user_id, x.attempt_id, x.product_id, x.name, x.category, x.image_url, x.amount_cents, x.currency, x.status,
         x.created_at, x.paid_at, x.refunded_at, x.paypal_order_id, x.capture_id, x.paid_via, x.webhook_confirmed_at,
         x.overrode_wait, x.decision_code, x.failure_reason
  from jsonb_to_recordset(p_changes->'purchases') as x(
    id text, attempt_id text, product_id text, name text, category text, image_url text, amount_cents bigint,
    currency text, status text, created_at timestamptz, paid_at timestamptz, refunded_at timestamptz,
    paypal_order_id text, capture_id text, paid_via text, webhook_confirmed_at timestamptz,
    overrode_wait boolean, decision_code text, failure_reason text)
  on conflict (id) do update set
    status               = excluded.status,
    paid_at              = excluded.paid_at,
    refunded_at          = excluded.refunded_at,
    paypal_order_id      = excluded.paypal_order_id,
    capture_id           = excluded.capture_id,
    paid_via             = excluded.paid_via,
    webhook_confirmed_at = excluded.webhook_confirmed_at,
    failure_reason       = excluded.failure_reason
  where public.purchases.user_id = p_user_id;

  -- A purchase id that already belongs to someone else would be skipped by the WHERE above.
  -- Never skip silently: stop, and nothing in this transaction is saved.
  get diagnostics v_rows = row_count;
  if v_rows <> v_expected then
    raise exception 'purchase id belongs to another user or could not be saved';
  end if;

  -- THE MONEY RULES, AGAIN. The app's Guardian has already decided; the database refuses anything that breaks the walls.
  if exists (select 1 from public.purchases p where p.id = any(v_new_ids) and p.status in ('pending', 'paid')) then
    select * into v_user from public.users where id = p_user_id;
    select coalesce(sum(amount_cents), 0) into v_total from public.purchases where user_id = p_user_id and status in ('pending', 'paid');
    if v_user.base_balance_cents - v_total < v_user.protected_cents then
      raise exception 'guardrail: this would use protected money';
    end if;
    for v_week in
      select distinct date_trunc('week', (p.created_at at time zone v_user.time_zone))::date as w
      from public.purchases p where p.id = any(v_new_ids) and p.status in ('pending', 'paid')
    loop
      select coalesce(sum(amount_cents), 0) into v_spent from public.purchases
      where user_id = p_user_id and status in ('pending', 'paid')
        and date_trunc('week', (created_at at time zone v_user.time_zone))::date = v_week.w;
      if v_spent > v_user.weekly_budget_cents then
        raise exception 'guardrail: this would go over the weekly budget';
      end if;
    end loop;
  end if;

  -- Waiting list: first update the items that already exist, then add the new ones.
  update public.waiting_list w set status = x.status, purchase_id = x.purchase_id
  from jsonb_to_recordset(p_changes->'waiting_list') as x(id text, status text, purchase_id text)
  where w.id = x.id and w.user_id = p_user_id;

  insert into public.waiting_list (
    id, user_id, product_id, name, category, image_url, amount_cents, currency, created_at, remind_at,
    wait_hours, rules, status, purchase_id)
  select x.id, p_user_id, x.product_id, x.name, x.category, x.image_url, x.amount_cents, x.currency, x.created_at, x.remind_at,
         x.wait_hours, x.rules, x.status, x.purchase_id
  from jsonb_to_recordset(p_changes->'waiting_list') as x(
    id text, product_id text, name text, category text, image_url text, amount_cents bigint, currency text,
    created_at timestamptz, remind_at timestamptz, wait_hours numeric, rules jsonb, status text, purchase_id text)
  where not exists (select 1 from public.waiting_list w where w.id = x.id);

  -- Every id we were given must now be ours. If one belongs to someone else, stop (nothing is saved).
  select count(*) into v_rows
  from public.waiting_list w
  join jsonb_to_recordset(p_changes->'waiting_list') as x(id text) on w.id = x.id
  where w.user_id = p_user_id;
  if v_rows <> v_waiting then
    raise exception 'waiting-list id belongs to another user or could not be saved';
  end if;

  insert into public.flagged_sellers (user_id, domain, flagged_at, reason)
  select p_user_id, lower(x.domain), x.flagged_at, x.reason
  from jsonb_to_recordset(p_changes->'flagged_sellers') as x(domain text, flagged_at timestamptz, reason text)
  on conflict (user_id, domain) do nothing;

  -- The audit log: each new entry must point at the one before it (the app signs the link with a secret we don't have).
  select a.hash into v_prev from public.audit_log a where a.user_id = p_user_id and a.hash is not null order by a.id desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');
  for v_entry in
    select t.elem->>'at' as at, t.elem->>'type' as type, t.elem->>'detail' as detail,
           t.elem->>'prev_hash' as prev_hash, t.elem->>'hash' as hash
    from jsonb_array_elements(coalesce(p_changes->'audit', '[]'::jsonb)) with ordinality as t(elem, ord)
    order by t.ord
  loop
    if v_entry.hash is null or v_entry.prev_hash is distinct from v_prev then
      raise exception 'audit chain broken: an entry does not follow the one before it';
    end if;
    insert into public.audit_log (user_id, at, type, detail, prev_hash, hash)
    values (p_user_id, v_entry.at::timestamptz, v_entry.type, v_entry.detail, v_entry.prev_hash, v_entry.hash);
    v_prev := v_entry.hash;
  end loop;

  -- An event we already handled is refused for good (the app only remembers the latest 500; the table remembers all).
  insert into public.webhook_events (event_id, user_id)
  select e, p_user_id from jsonb_array_elements_text(p_changes->'webhook_event_ids') e
  on conflict (event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows <> v_events then
    raise exception 'duplicate webhook event';
  end if;

  insert into public.rules (user_id, kind, enabled, params, source_text, created_at, effective_at)
  select p_user_id, x.kind, x.enabled, x.params, x.source_text, x.created_at, x.effective_at
  from jsonb_to_recordset(p_changes->'rules') as x(
    kind text, enabled boolean, params jsonb, source_text text, created_at timestamptz, effective_at timestamptz);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ledger_load: the same snapshot as before, plus the schema version, so the app can refuse to run (and say why) against a
-- database that has not had this migration. Without it the audit chain, the budget guard and the one-time approvals would
-- silently not exist.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ledger_load(p_user_id uuid, p_seed jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user public.users;
begin
  if not exists (select 1 from public.users where id = p_user_id) then
    insert into public.users (id, time_zone, base_balance_cents, protected_cents, weekly_budget_cents)
    values (
      p_user_id,
      p_seed->>'time_zone',
      (p_seed->>'base_balance_cents')::bigint,
      (p_seed->>'protected_cents')::bigint,
      (p_seed->>'weekly_budget_cents')::bigint
    )
    on conflict (id) do nothing;

    if found then  -- we just created the user, so give them the starting rules
      insert into public.rules (user_id, kind, enabled, params, created_at, effective_at)
      select p_user_id, r->>'kind', (r->>'enabled')::boolean, r->'params',
             (r->>'created_at')::timestamptz, (r->>'effective_at')::timestamptz
      from jsonb_array_elements(p_seed->'rules') r;
    end if;
  end if;

  select * into v_user from public.users where id = p_user_id;

  return jsonb_build_object(
    'schema_version', 9,
    'user', to_jsonb(v_user),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_at, r.created_at)
                         from public.rules r where r.user_id = p_user_id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at)
                             from public.purchases p where p.user_id = p_user_id), '[]'::jsonb),
    'waiting_list', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at, w.id)
                                from public.waiting_list w where w.user_id = p_user_id), '[]'::jsonb),
    'flagged_sellers', coalesce((select jsonb_agg(to_jsonb(f) order by f.flagged_at, f.domain)
                                   from public.flagged_sellers f where f.user_id = p_user_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
                         from (select * from public.audit_log where user_id = p_user_id order by id desc limit 300) a), '[]'::jsonb),
    'webhook_event_ids', coalesce((select jsonb_agg(w.event_id)
                                     from (select event_id from public.webhook_events where user_id = p_user_id
                                           order by received_at desc, event_id limit 500) w), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ledger_reset: the demo "Start over". It says out loud that it is clearing the audit log (the trigger allows it only then).
-- ---------------------------------------------------------------------------------------------
create or replace function public.ledger_reset(p_user_id uuid, p_seed jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('north.allow_audit_reset', 'on', true);

  insert into public.users (id, time_zone, base_balance_cents, protected_cents, weekly_budget_cents)
  values (p_user_id, p_seed->>'time_zone', (p_seed->>'base_balance_cents')::bigint,
          (p_seed->>'protected_cents')::bigint, (p_seed->>'weekly_budget_cents')::bigint)
  on conflict (id) do update set
    time_zone = excluded.time_zone,
    base_balance_cents = excluded.base_balance_cents,
    protected_cents = excluded.protected_cents,
    weekly_budget_cents = excluded.weekly_budget_cents,
    price_watch = '{"watches":[],"notices":[]}'::jsonb,
    agent_checkpoint = '{"agents":[],"requests":[],"permission":{"value":null,"changedAt":"1970-01-01T00:00:00.000Z","previous":null}}'::jsonb,
    version = public.users.version + 1,
    updated_at = now();

  delete from public.flagged_sellers where user_id = p_user_id;
  delete from public.waiting_list   where user_id = p_user_id;
  delete from public.purchases      where user_id = p_user_id;
  delete from public.audit_log      where user_id = p_user_id;
  delete from public.webhook_events where user_id = p_user_id;
  delete from public.rules          where user_id = p_user_id;

  insert into public.rules (user_id, kind, enabled, params, created_at, effective_at)
  select p_user_id, r->>'kind', (r->>'enabled')::boolean, r->'params',
         (r->>'created_at')::timestamptz, (r->>'effective_at')::timestamptz
  from jsonb_array_elements(p_seed->'rules') r;
end;
$$;

-- Only the service role (the secret key) may run these.
revoke all on function public.ledger_load(uuid, jsonb)                        from public, anon, authenticated;
revoke all on function public.ledger_apply(uuid, bigint, jsonb)               from public, anon, authenticated;
revoke all on function public.ledger_reset(uuid, jsonb)                       from public, anon, authenticated;
revoke all on function public.consume_approval_nonce(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, integer, integer)          from public, anon, authenticated;
revoke all on function public.approval_nonce_spent(text)                      from public, anon, authenticated;
grant execute on function public.ledger_load(uuid, jsonb)                        to service_role;
grant execute on function public.ledger_apply(uuid, bigint, jsonb)               to service_role;
grant execute on function public.ledger_reset(uuid, jsonb)                       to service_role;
grant execute on function public.consume_approval_nonce(text, uuid, timestamptz) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer)          to service_role;
grant execute on function public.approval_nonce_spent(text)                      to service_role;
