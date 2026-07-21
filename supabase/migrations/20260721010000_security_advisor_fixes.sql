-- 20260721010000_security_advisor_fixes.sql
--
-- Addresses Supabase Security Advisor findings.

-- ---------------------------------------------------------------------------
-- ERRORS: rls_disabled_in_public
--
-- Both tables already REVOKE ALL FROM PUBLIC and GRANT only to service_role
-- (see 20260709120000/20260709130000), so anon/authenticated have no table
-- privileges regardless. service_role bypasses RLS entirely, so enabling RLS
-- here with no policies changes no application behavior -- it just removes
-- the "any future permissive GRANT is immediately exploitable" exposure the
-- linter flags on any public-schema table without RLS enabled.
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."semantic_scholar_rate_limit_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."openalex_budget_state" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- WARN: rls_policy_always_true on public.vault_papers
--
-- "Users can manage vault papers" was created with only a WITH CHECK clause,
-- no USING clause, no FOR, and no TO. That means: FOR ALL (every command),
-- TO public (every role, including anon -- which also holds GRANT ALL on
-- this table), and USING defaults to `true` since WITH CHECK doesn't backfill
-- it. WITH CHECK is never consulted for DELETE, so the net effect was that
-- *any* role could delete *any* row in vault_papers, and USING(true) also let
-- UPDATE/SELECT target rows outside the intended ownership/share checks
-- before WITH CHECK (or the separate SELECT policy) ever got a say.
--
-- Fix: give it an explicit USING clause identical to the WITH CHECK logic,
-- and scope it to authenticated (matching every other vault policy in this
-- schema -- vault_papers has no legitimate anon write path).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can manage vault papers" ON "public"."vault_papers";

CREATE POLICY "Users can manage vault papers" ON "public"."vault_papers"
    FOR ALL TO "authenticated"
    USING (
        ("auth"."uid"() = "added_by")
        OR (EXISTS (
            SELECT 1 FROM "public"."vaults" "v"
            WHERE ("v"."id" = "vault_papers"."vault_id")
              AND (
                ("v"."user_id" = "auth"."uid"())
                OR (EXISTS (
                    SELECT 1 FROM "public"."vault_shares" "vs"
                    WHERE ("vs"."vault_id" = "v"."id")
                      AND ("vs"."shared_with_user_id" = "auth"."uid"())
                      AND ("vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"]))
                ))
              )
        ))
    )
    WITH CHECK (
        ("auth"."uid"() = "added_by")
        OR (EXISTS (
            SELECT 1 FROM "public"."vaults" "v"
            WHERE ("v"."id" = "vault_papers"."vault_id")
              AND (
                ("v"."user_id" = "auth"."uid"())
                OR (EXISTS (
                    SELECT 1 FROM "public"."vault_shares" "vs"
                    WHERE ("vs"."vault_id" = "v"."id")
                      AND ("vs"."shared_with_user_id" = "auth"."uid"())
                      AND ("vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"]))
                ))
              )
        ))
    );

-- ---------------------------------------------------------------------------
-- WARN: function_search_path_mutable
--
-- These functions had no SET search_path, so an attacker able to create
-- objects earlier in a caller's search_path (e.g. a same-named function/table
-- in a schema that precedes "public") could hijack unqualified references at
-- call time. Pin each to the schema it actually needs.
-- ---------------------------------------------------------------------------

ALTER FUNCTION "public"."enforce_forked_vaults_public"() SET "search_path" TO 'public';
ALTER FUNCTION "public"."set_updated_at"() SET "search_path" TO 'public';
ALTER FUNCTION "public"."copy_publication_to_vault"("pub_id" "uuid", "target_vault_id" "uuid", "user_id" "uuid") SET "search_path" TO 'public';
ALTER FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_display_name" "text") SET "search_path" TO 'public';
ALTER FUNCTION "public"."has_vault_access"("p_user_id" "uuid", "p_vault_id" "uuid", "p_required_role" "text") SET "search_path" TO 'public';
ALTER FUNCTION "public"."user_can_access_vault"("p_vault_uuid" "uuid", "p_required_permission" "text") SET "search_path" TO 'public';
ALTER FUNCTION "public"."get_researcher_stats"("p_user_ids" "uuid"[]) SET "search_path" TO 'public';
ALTER FUNCTION "public"."update_vault_publication_with_rollup"("p_vault_publication_id" "uuid", "p_vault_id" "uuid", "p_patch" "jsonb", "p_actor_user_id" "uuid") SET "search_path" TO 'public';
ALTER FUNCTION "public"."take_semantic_scholar_rate_limit"("p_bucket_key" "text", "p_max_requests" integer, "p_window_ms" integer) SET "search_path" TO 'public';
ALTER FUNCTION "public"."take_openalex_budget"("p_bucket_key" "text", "p_cost_usd" numeric, "p_daily_budget_usd" numeric) SET "search_path" TO 'public';

-- ---------------------------------------------------------------------------
-- WARN: anon/authenticated_security_definer_function_executable
--
-- Every function in "public" gets EXECUTE granted to anon/authenticated by
-- default (ALTER DEFAULT PRIVILEGES in schema.sql). That's wrong for
-- SECURITY DEFINER functions meant only to fire as triggers, or that aren't
-- called by the app at all -- both cases mean the function is exposed at
-- /rest/v1/rpc/<name> for no reason, which is unnecessary attack surface for
-- code that bypasses RLS by design.
--
-- Trigger-only functions: revoking anon/authenticated EXECUTE does not stop
-- them from firing as triggers (trigger invocation isn't gated by the
-- invoking role's EXECUTE privilege), it only removes the direct RPC path.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION "public"."handle_new_user"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."notify_vault_access_requested"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."notify_vault_access_status_changed"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."notify_vault_favorited"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."notify_vault_forked"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."notify_vault_shared"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."set_vault_publication_updated_by"() FROM "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."validate_username"() FROM "anon", "authenticated";

-- has_vault_access has no callers anywhere in the schema or app (superseded
-- by user_can_access_vault) and is SECURITY DEFINER, so leaving it publicly
-- executable would let anon probe arbitrary user/vault access relationships
-- for free. Lock it down to service_role like the other internal-only
-- SECURITY DEFINER helpers in this schema.
REVOKE EXECUTE ON FUNCTION "public"."has_vault_access"("p_user_id" "uuid", "p_vault_id" "uuid", "p_required_role" "text") FROM "anon", "authenticated";

-- user_can_access_vault is referenced from several RLS policies scoped
-- `TO authenticated`, so authenticated still needs EXECUTE for those policies
-- to evaluate. Nothing calls it as anon (no `TO public`/`TO anon` policy
-- uses it, and the app never calls it directly via .rpc()).
REVOKE EXECUTE ON FUNCTION "public"."user_can_access_vault"("p_vault_uuid" "uuid", "p_required_permission" "text") FROM "anon";

-- delete_user requires auth.uid() internally and raises for an unauthenticated
-- caller, but anon never has a legitimate reason to call it.
REVOKE EXECUTE ON FUNCTION "public"."delete_user"() FROM "anon";

-- create_user_profile is only ever called by the client with an active
-- session (src/lib/profile.ts), never as anon.
REVOKE EXECUTE ON FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_display_name" "text") FROM "anon";

-- ---------------------------------------------------------------------------
-- CRITICAL, found while auditing the above (not from the linter -- it only
-- flags SECURITY DEFINER functions, and this one isn't).
--
-- update_vault_publication_with_rollup runs as SECURITY INVOKER (the
-- caller's own RLS applies), but it does
-- `PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true)`
-- before its UPDATEs -- spoofing auth.uid() to an arbitrary caller-supplied
-- value for the rest of the transaction. Its own source migration
-- (20260706000000_publication_bibliographic_rollup.sql) already revokes
-- PUBLIC and grants only service_role for exactly this reason ("this
-- function trusts its caller completely... must only be reachable through
-- .netlify's own auth/scope/vault-access checks"), but a live grant check
-- against production (information_schema.role_routine_grants) confirmed
-- anon and authenticated both currently also hold EXECUTE.
--
-- Impact: any authenticated user can call this RPC directly, pass an
-- arbitrary victim's user id as p_actor_user_id, and have "Users can manage
-- vault publications in editable vaults" (TO authenticated, checks
-- auth.uid() against vault ownership/share role) evaluate against the
-- *spoofed* auth.uid() instead of the real caller -- gaining unauthorized
-- write access to any vault_publication the impersonated victim can edit,
-- which then fans out into the canonical publications row and every sibling
-- vault_publication. (anon is not exploitable here: that policy is scoped
-- TO authenticated only, so an anon-role connection has no applicable
-- UPDATE policy regardless of the spoofed value.)
--
-- Re-issuing the revoke to restore the function's intended service_role-only
-- reachability.
REVOKE EXECUTE ON FUNCTION "public"."update_vault_publication_with_rollup"("p_vault_publication_id" "uuid", "p_vault_id" "uuid", "p_patch" "jsonb", "p_actor_user_id" "uuid") FROM "anon", "authenticated";

-- ---------------------------------------------------------------------------
-- Hardening found while auditing the above: create_user_profile is SECURITY
-- DEFINER (bypasses RLS) and trusted its p_user_id argument outright, so any
-- authenticated caller could create/attach a profile row for someone else's
-- user_id. Restrict it to the caller's own uid, while still allowing the
-- trigger-internal call from handle_new_user (which runs with no request JWT
-- context, so auth.uid() is NULL there, not the new user's id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_display_name" "text") RETURNS TABLE("id" "uuid", "user_id" "uuid", "display_name" "text", "email" "text", "avatar_url" "text", "username" "text", "bio" "text", "github_url" "text", "linkedin_url" "text", "bluesky_url" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "is_setup" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF "auth"."uid"() IS NOT NULL AND "auth"."uid"() <> p_user_id THEN
    RAISE EXCEPTION 'Cannot create a profile for another user';
  END IF;

  INSERT INTO public.profiles (
    user_id, email, display_name, username, bio, avatar_url,
    github_url, linkedin_url, bluesky_url, is_setup
  ) VALUES (
    p_user_id, p_email, p_display_name, null, null, null,
    null, null, null, false
  )
  ON CONFLICT ON CONSTRAINT "profiles_user_id_key" DO NOTHING;

  RETURN QUERY
  SELECT * FROM public.profiles p
  WHERE p.user_id = p_user_id;
END;
$$;

ALTER FUNCTION "public"."create_user_profile"("p_user_id" "uuid", "p_email" "text", "p_display_name" "text") OWNER TO "postgres";
