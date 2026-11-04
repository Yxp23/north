-- North: database schema.
--
-- How to apply: open your Supabase project > SQL Editor > New query, paste this whole file, Run.
-- (Or with the Supabase CLI: `supabase db push`.) Safe to read first; it only creates new things.
--
-- Security model:
--  * The app talks to Supabase only from the server, with the SECRET key. Never from the browser.
--  * Row Level Security is ON for every table with NO policies, so the publishable/anon key can read
--    and write nothing, even if someone finds it. The secret key bypasses RLS by design.
--  * The three ledger_* functions are the only way the app changes data. Only the service role
--    (secret key) may run them.
--  * Money is whole cents (bigint). Never floats.

-- ---------------------------------------------------------------------------------------------
-- users: one row per person. Holds the money settings and the saved PayPal token (server-only).
-- ---------------------------------------------------------------------------------------------
create table public.users (
  id                  uuid primary key default gen_random_uuid(),
  display_name        text        not null default 'Demo user',
  time_zone           text        not null default 'America/New_York',  -- "late at night" and "this week" use this
  base_balance_cents  bigint      not null check (base_balance_cents >= 0),  -- money in the account before North buys
  protected_cents     bigint      not null check (protected_cents >= 0),     -- rent and bills: never spendable
  weekly_budget_cents bigint      not null check (weekly_budget_cents >= 0),
  paypal_vault_id     text,       -- PayPal's permanent token for the saved account. Never sent to a browser.
  paypal_customer_id  text,
  paypal_saved_at     timestamptz,
  version             bigint      not null default 0,  -- optimistic lock: two writers can't overwrite each other
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- rules: the user's rules, kept as VERSIONS (append-only). Ready for the one-day delay.
--   created_at   = when the user asked for the change
--   effective_at = when it starts to count (a change is created_at + 24 hours)
-- The rule in force at time T is the newest version with effective_at <= T.
-- ---------------------------------------------------------------------------------------------
create table public.rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references public.users(id) on delete cascade,
  kind         text        not null check (kind in ('wait_over_amount', 'wait_after_hour', 'essentials')),
  enabled      boolean     not null default true,   -- false = this rule is turned off
  params       jsonb       not null,                -- {"cents":5000} | {"afterHour":22,"untilHour":5} | {"categories":["groceries"]}
  source_text  text,                                -- the user's own words, if they wrote them
  created_at   timestamptz not null default now(),
  effective_at timestamptz not null,
  check (effective_at >= created_at)
);
create index rules_user_kind_idx on public.rules (user_id, kind, effective_at desc);

-- ---------------------------------------------------------------------------------------------
-- purchases: every buy North tried. Status: pending -> paid -> refunded (or failed).
-- ---------------------------------------------------------------------------------------------
create table public.purchases (
  id                   text primary key,           -- our id ("pur_..."), also sent to PayPal as custom_id
  user_id              uuid        not null references public.users(id) on delete cascade,
  attempt_id           text        not null,       -- one per tap on Buy. Also PayPal's request id.
  product_id           text        not null,
  name                 text        not null,
  category             text        not null,
  image_url            text        not null,
  amount_cents         bigint      not null check (amount_cents > 0),
  currency             text        not null default 'USD',
  status               text        not null check (status in ('pending', 'paid', 'refunded', 'failed')),
  created_at           timestamptz not null default now(),
  paid_at              timestamptz,
  refunded_at          timestamptz,
  paypal_order_id      text,
  capture_id           text,
  paid_via             text        check (paid_via in ('checkout', 'webhook')),
  webhook_confirmed_at timestamptz,
  overrode_wait        boolean     not null default false,
  decision_code        text        not null,       -- the Guardian's code, e.g. 'ok' or 'ok_override'
  failure_reason       text,
  unique (user_id, attempt_id)                     -- a repeated tap can never create a second buy
);
create index purchases_user_created_idx on public.purchases (user_id, created_at desc);
create index purchases_capture_idx on public.purchases (capture_id);

-- ---------------------------------------------------------------------------------------------
-- audit_log: what happened and why (Guardian decisions, payments, webhooks). Append-only.
-- Never put tokens in here.
-- ---------------------------------------------------------------------------------------------
create table public.audit_log (
  id       bigint generated always as identity primary key,
  user_id  uuid        not null references public.users(id) on delete cascade,
  at       timestamptz not null default now(),
  type     text        not null,
  detail   text        not null
);
create index audit_log_user_idx on public.audit_log (user_id, id desc);

-- ---------------------------------------------------------------------------------------------
-- webhook_events: PayPal event ids we have already handled, so a repeated event does nothing.
-- ---------------------------------------------------------------------------------------------
create table public.webhook_events (
  event_id     text primary key,
  user_id      uuid        not null references public.users(id) on delete cascade,
  received_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Lock the tables down: RLS on, no policies, and no direct access for the public roles.
-- ---------------------------------------------------------------------------------------------
alter table public.users          enable row level security;
alter table public.rules          enable row level security;
alter table public.purchases      enable row level security;
alter table public.audit_log      enable row level security;
alter table public.webhook_events enable row level security;

revoke all on table public.users, public.rules, public.purchases, public.audit_log, public.webhook_events
  from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- ledger_load: everything about one user, in one consistent snapshot.
-- Creates the user (and their starting rules) from p_seed the first time.
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
    'audit', coalesce((select jsonb_agg(to_jsonb(a) order by a.id)
                         from (select * from public.audit_log where user_id = p_user_id order by id desc limit 300) a), '[]'::jsonb),
    'webhook_event_ids', coalesce((select jsonb_agg(w.event_id)
                                     from (select event_id from public.webhook_events where user_id = p_user_id
                                           order by received_at desc, event_id limit 500) w), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- ledger_apply: save a set of changes in ONE transaction, only if nobody else changed the user
-- since we loaded them (p_expected_version). Returns the new version, or -1 if someone else
-- got there first (the app then reloads and tries again).
-- Purchases can change status and PayPal ids, but never their amount, product or owner.
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
-- ledger_reset: demo "Start over". Clears purchases, audit log, webhook ids and rule history, and
-- puts the starting money and rules back. KEEPS the saved PayPal.
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

-- Only the service role (the secret key) may run the ledger functions.
revoke all on function public.ledger_load(uuid, jsonb)          from public, anon, authenticated;
revoke all on function public.ledger_apply(uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.ledger_reset(uuid, jsonb)         from public, anon, authenticated;
grant execute on function public.ledger_load(uuid, jsonb)          to service_role;
grant execute on function public.ledger_apply(uuid, bigint, jsonb) to service_role;
grant execute on function public.ledger_reset(uuid, jsonb)         to service_role;
