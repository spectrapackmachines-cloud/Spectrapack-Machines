begin;
create table if not exists public.developer_funds_snapshots (
  provider text primary key check(provider in ('google','meta')),
  amount numeric(18,2) not null check(amount>=0 and amount<=1000000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(), recorded_by text not null
);
alter table public.developer_funds_snapshots enable row level security;
revoke all on public.developer_funds_snapshots from public,anon,authenticated;
grant select,insert,update on public.developer_funds_snapshots to service_role;
comment on table public.developer_funds_snapshots is 'Developer-entered billing observations only; not an automatically measured wallet balance.';
create table if not exists public.developer_search_snapshots (
  site_url text primary key, payload jsonb not null check(jsonb_typeof(payload)='object'),
  recorded_at timestamptz not null default now(), recorded_by text not null
);
alter table public.developer_search_snapshots enable row level security;
revoke all on public.developer_search_snapshots from public,anon,authenticated;
grant select,insert,update on public.developer_search_snapshots to service_role;
commit;
