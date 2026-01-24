-- Migration: Convert vault_access_requests from profile IDs to user IDs
-- Purpose: Fix HTTP 406 access errors by ensuring consistent user ID usage
-- Created: 2026-01-25
-- Impact: Fixes shared vault access for users with approved requests

-- Step 1: Add temporary column for migration
ALTER TABLE vault_access_requests ADD COLUMN IF NOT EXISTS requester_user_id uuid;

-- Step 2: Migrate data from profile IDs to user IDs
-- This updates all existing records to use auth user IDs instead of profile IDs
UPDATE vault_access_requests 
SET requester_user_id = profiles.user_id
FROM profiles 
WHERE vault_access_requests.requester_id = profiles.id;

-- Step 3: Make requester_user_id NOT NULL after data migration
ALTER TABLE vault_access_requests ALTER COLUMN requester_user_id SET NOT NULL;

-- Step 4: Drop RLS policies that depend on requester_id
DROP POLICY IF EXISTS "Requesters can update their own request" ON vault_access_requests;

-- Step 5: Drop old foreign key constraint
ALTER TABLE vault_access_requests DROP CONSTRAINT IF EXISTS vault_access_requests_requester_id_fkey;

-- Step 6: Drop old column
ALTER TABLE vault_access_requests DROP COLUMN IF EXISTS requester_id;

-- Step 6: Rename column back to requester_id
ALTER TABLE vault_access_requests RENAME COLUMN requester_user_id TO requester_id;

-- Step 7: Add proper foreign key constraint to auth.users
-- This ensures data integrity and aligns with RLS policies that use auth.uid()
ALTER TABLE vault_access_requests 
ADD CONSTRAINT vault_access_requests_requester_id_fkey 
FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 8: Update unique constraints
-- Drop and recreate unique constraint for new column type
ALTER TABLE vault_access_requests DROP CONSTRAINT IF EXISTS unique_vault_requester_id;
ALTER TABLE vault_access_requests 
ADD CONSTRAINT unique_vault_requester_id 
UNIQUE (vault_id, requester_id);

-- Step 9: Add missing RLS policy to allow users to view their own access requests
-- This fixes HTTP 406 error when users try to check their approved requests
CREATE POLICY "Users can view their own access requests" 
ON public.vault_access_requests
FOR SELECT
USING (requester_id = auth.uid());

-- Step 10: Recreate the policy that was dropped
CREATE POLICY "Requesters can update their own request" ON public.vault_access_requests
  FOR UPDATE
  USING (requester_id = auth.uid())
  WITH CHECK (true);