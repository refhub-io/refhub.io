-- Prevent duplicate pending access requests by the same requester (by profile id or email)

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_requester_id
ON public.vault_access_requests (vault_id, requester_id)
WHERE status = 'pending' AND requester_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_requester_email
ON public.vault_access_requests (vault_id, requester_email)
WHERE status = 'pending' AND requester_email IS NOT NULL;
