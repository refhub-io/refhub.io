-- Make requester fields more flexible and notify owners when a request is created

-- Allow anonymous requests by making requester_id nullable and adding email/name/note
ALTER TABLE public.vault_access_requests
  DROP CONSTRAINT IF EXISTS vault_access_requests_requester_id_fkey;

ALTER TABLE public.vault_access_requests
  ALTER COLUMN requester_id DROP NOT NULL;

ALTER TABLE public.vault_access_requests
  ADD COLUMN IF NOT EXISTS requester_email text,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS note text;

-- Create notification on new access request
CREATE OR REPLACE FUNCTION public.notify_vault_access_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vault_name TEXT;
  vault_owner_id UUID;
  requester_display TEXT;
BEGIN
  SELECT name, user_id INTO vault_name, vault_owner_id FROM public.vaults WHERE id = NEW.vault_id;

  IF NEW.requester_name IS NOT NULL THEN
    requester_display := NEW.requester_name;
  ELSIF NEW.requester_email IS NOT NULL THEN
    requester_display := NEW.requester_email;
  ELSIF NEW.requester_id IS NOT NULL THEN
    SELECT COALESCE(display_name, email) INTO requester_display FROM public.profiles WHERE user_id = NEW.requester_id;
  ELSE
    requester_display := 'Someone';
  END IF;

  IF vault_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      vault_owner_id,
      'vault_access_requested',
      'New access request',
      requester_display || ' requested access to "' || vault_name || '"',
      jsonb_build_object('vault_id', NEW.vault_id, 'request_id', NEW.id, 'requester_id', NEW.requester_id, 'requester_email', NEW.requester_email)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Add trigger
DROP TRIGGER IF EXISTS trg_notify_vault_access_requested ON public.vault_access_requests;
CREATE TRIGGER trg_notify_vault_access_requested
AFTER INSERT ON public.vault_access_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_vault_access_requested();

-- RLS policies: allow insertion (anyone can request), allow vault owner to view/update requests
ALTER TABLE public.vault_access_requests ENABLE ROW LEVEL SECURITY;

-- Allow insert from authenticated or anon clients (we accept email-based anonymous requests)
CREATE POLICY "Allow insert for requests" ON public.vault_access_requests
  FOR INSERT
  WITH CHECK (true);

-- Allow vault owner to select requests for their vault
CREATE POLICY "Vault owners can view requests" ON public.vault_access_requests
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = vault_access_requests.vault_id AND v.user_id = auth.uid())
  );

-- Allow vault owner to update status
CREATE POLICY "Vault owners can update requests" ON public.vault_access_requests
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.vaults v WHERE v.id = vault_access_requests.vault_id AND v.user_id = auth.uid())
  );

-- Allow requester to update (e.g., cancel their own request)
CREATE POLICY "Requesters can update their own request" ON public.vault_access_requests
  FOR UPDATE
  USING (requester_id = auth.uid())
  WITH CHECK (true);

-- Notify requester on status change (approved/rejected)
CREATE OR REPLACE FUNCTION public.notify_vault_access_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vault_name TEXT;
  requester_user_id UUID;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW; -- no change
  END IF;

  IF NEW.requester_id IS NULL THEN
    RETURN NEW; -- can't notify anonymous requesters in-app
  END IF;

  SELECT name INTO vault_name FROM public.vaults WHERE id = NEW.vault_id;
  requester_user_id := NEW.requester_id;

  IF NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      requester_user_id,
      'vault_access_approved',
      'Access request approved',
      'Your request to access "' || vault_name || '" was approved',
      jsonb_build_object('vault_id', NEW.vault_id, 'request_id', NEW.id)
    );
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      requester_user_id,
      'vault_access_rejected',
      'Access request rejected',
      'Your request to access "' || vault_name || '" was rejected',
      jsonb_build_object('vault_id', NEW.vault_id, 'request_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_vault_access_status_changed ON public.vault_access_requests;
CREATE TRIGGER trg_notify_vault_access_status_changed
AFTER UPDATE OF status ON public.vault_access_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_vault_access_status_changed();
