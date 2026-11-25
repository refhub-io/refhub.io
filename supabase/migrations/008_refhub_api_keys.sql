create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  scopes text[] not null check (cardinality(scopes) > 0),
  description text,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_api_keys_owner_user_id on public.api_keys(owner_user_id);
create index if not exists idx_api_keys_active on public.api_keys(owner_user_id, revoked_at, expires_at);

create table if not exists public.api_key_vaults (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  vault_id uuid not null references public.vaults(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (api_key_id, vault_id)
);

create index if not exists idx_api_key_vaults_vault_id on public.api_key_vaults(vault_id);

create table if not exists public.api_request_audit_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.api_keys(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  method text not null,
  path text not null,
  response_status integer not null,
  vault_id uuid references public.vaults(id) on delete set null,
  ip_address text,
  user_agent text,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_request_audit_logs_api_key_id on public.api_request_audit_logs(api_key_id, created_at desc);
create index if not exists idx_api_request_audit_logs_owner_user_id on public.api_request_audit_logs(owner_user_id, created_at desc);
create index if not exists idx_api_request_audit_logs_vault_id on public.api_request_audit_logs(vault_id, created_at desc);

alter table public.api_keys enable row level security;
alter table public.api_key_vaults enable row level security;
alter table public.api_request_audit_logs enable row level security;

create policy "service_role manages api_keys"
on public.api_keys
for all
to service_role
using (true)
with check (true);

create policy "service_role manages api_key_vaults"
on public.api_key_vaults
for all
to service_role
using (true)
with check (true);

create policy "service_role manages api_request_audit_logs"
on public.api_request_audit_logs
for all
to service_role
using (true)
with check (true);

grant all on table public.api_keys to service_role;
grant all on table public.api_key_vaults to service_role;
grant all on table public.api_request_audit_logs to service_role;
