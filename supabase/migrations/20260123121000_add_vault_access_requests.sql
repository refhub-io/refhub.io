-- Table to store access requests for protected vaults
create table if not exists vault_access_requests (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid references vaults(id) on delete cascade,
  requester_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending', -- 'pending', 'approved', 'rejected'
  created_at timestamp with time zone default timezone('utc', now()),
  updated_at timestamp with time zone default timezone('utc', now())
);

-- Index for quick lookup
create index if not exists idx_vault_access_requests_vault_id on vault_access_requests(vault_id);
create index if not exists idx_vault_access_requests_requester_id on vault_access_requests(requester_id);