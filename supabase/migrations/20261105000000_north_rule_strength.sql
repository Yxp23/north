-- North: rule strength (gentle / firm / locked) and the waiting list.
--
-- How to apply: SQL Editor > New query > paste > Run. Run it AFTER the first two migrations.
--
-- What changes:
--  * Rule strength needs no new column: it lives inside rules.params as {"strength":"gentle|firm|locked",
--    "waitHours":24}. Old rows with no strength are read as gentle.
--  * New table waiting_list: buys saved by a FIRM rule, until the wait is over.
--  * The three ledger_* functions are replaced so they also load, save and clear the waiting list.

create table public.waiting_list (
  id          text primary key,
  user_id     uuid        not null references public.users(id) on delete cascade,
  product_id  text        not null,
  name        text        not null,
  category    text        not null,
  image_url   text        not null,
  amount_cents bigint     not null check (amount_cents > 0),   -- the price when saved; the real price is read again at purchase
  currency    text        not null default 'USD',
  created_at  timestamptz not null default now(),
  remind_at   timestamptz not null,                            -- when the wait is over
  wait_hours  numeric     not null check (wait_hours > 0),
  rules       jsonb       not null default '[]'::jsonb,        -- which rules made it wait: ["big_buy","late_night"]
  status      text        not null check (status in ('waiting', 'bought', 'dropped')),
  purchase_id text                                             -- the buy it became
);
-- A product can only be waiting once at a time.
create unique index waiting_list_one_active_idx on public.waiting_list (user_id, product_id) where status = 'waiting';
create index waiting_list_user_idx on public.waiting_list (user_id, remind_at);

alter table public.waiting_list enable row level security;   -- on, with no policies: the browser key gets nothing
revoke all on table public.waiting_list from anon, authenticated;
grant select, insert, update, delete on table public.waiting_list to service_role;  -- needed since Supabase's 2026 change

-- ---------------------------------------------------------------------------------------------
-- ledger_load: now also returns the waiting list.
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
    'user', to_jsonb(v_user),
    'rules', coalesce((select jsonb_agg(to_jsonb(r) order by r.effective_at, r.created_at)
                         from public.rules r where r.user_id = p_user_id), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at)
                             from public.purchases p where p.user_id = p_user_id), '[]'::jsonb),
    'waiting_list', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at, w.id)
                                from public.waiting_list w where w.user_id = p_user_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
                         from (select * from public.audit_log where user_id = p_user_id order by id desc limit 300) a), '[]'::jsonb),
    'webhook_event_ids', coalesce((select jsonb_agg(w.event_id)
                                     from (select event_id from public.webhook_events where user_id = p_user_id
                                           order by received_at desc, event_id limit 500) w), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ledger_apply: now also saves waiting-list changes. Existing items can change status and the buy they
-- became, never anything else. Changes to existing items are applied before new ones are added, so
-- "this one is done, and the same product is waiting again" can't trip the one-active-item rule.
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
  u jsonb := coalesce(p_changes->'user', '{}'::jsonb);
begin
  update public.users set
    time_zone           = coalesce(u->>'time_zone', time_zone),
    base_balance_cents  = coalesce((u->>'base_balance_cents')::bigint, base_balance_cents),
    protected_cents     = coalesce((u->>'protected_cents')::bigint, protected_cents),
    weekly_budget_cents = coalesce((u->>'weekly_budget_cents')::bigint, weekly_budget_cents),
    paypal_vault_id     = case when u ? 'paypal_vault_id'    then u->>'paypal_vault_id'    else paypal_vault_id end,
    paypal_customer_id  = case when u ? 'paypal_customer_id' then u->>'paypal_customer_id' else paypal_customer_id end,
    paypal_saved_at     = case when u ? 'paypal_saved_at'    then (u->>'paypal_saved_at')::timestamptz else paypal_saved_at end,
    version             = version + 1,
    updated_at          = now()
  where id = p_user_id and version = p_expected_version
  returning version into v_new;

  if v_new is null then
    return -1;
  end if;

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

  insert into public.audit_log (user_id, at, type, detail)
  select p_user_id, x.at, x.type, x.detail
  from jsonb_to_recordset(p_changes->'audit') as x(at timestamptz, type text, detail text);

  insert into public.webhook_events (event_id, user_id)
  select e, p_user_id from jsonb_array_elements_text(p_changes->'webhook_event_ids') e
  on conflict (event_id) do nothing;

  insert into public.rules (user_id, kind, enabled, params, source_text, created_at, effective_at)
  select p_user_id, x.kind, x.enabled, x.params, x.source_text, x.created_at, x.effective_at
  from jsonb_to_recordset(p_changes->'rules') as x(
    kind text, enabled boolean, params jsonb, source_text text, created_at timestamptz, effective_at timestamptz);

  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ledger_reset: now also clears the waiting list. Still keeps the saved PayPal.
-- ---------------------------------------------------------------------------------------------
create or replace function public.ledger_reset(p_user_id uuid, p_seed jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.users (id, time_zone, base_balance_cents, protected_cents, weekly_budget_cents)
  values (p_user_id, p_seed->>'time_zone', (p_seed->>'base_balance_cents')::bigint,
          (p_seed->>'protected_cents')::bigint, (p_seed->>'weekly_budget_cents')::bigint)
  on conflict (id) do update set
    time_zone = excluded.time_zone,
    base_balance_cents = excluded.base_balance_cents,
    protected_cents = excluded.protected_cents,
    weekly_budget_cents = excluded.weekly_budget_cents,
    version = public.users.version + 1,
    updated_at = now();

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
