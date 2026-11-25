-- Migration: Fix ambiguous column reference in create_user_profile
--
-- ON CONFLICT (user_id) is ambiguous in PL/pgSQL because "user_id" matches
-- both the table column and could be confused with local variable names.
-- Fix: use ON CONFLICT ON CONSTRAINT profiles_user_id_key instead.

DROP FUNCTION IF EXISTS "public"."create_user_profile"("uuid", "text", "text");

CREATE OR REPLACE FUNCTION "public"."create_user_profile"(
  "p_user_id" "uuid",
  "p_email" "text",
  "p_display_name" "text"
) RETURNS TABLE(
  "id" "uuid", "user_id" "uuid", "display_name" "text", "email" "text",
  "avatar_url" "text", "username" "text", "bio" "text",
  "github_url" "text", "linkedin_url" "text", "bluesky_url" "text",
  "created_at" timestamp with time zone, "updated_at" timestamp with time zone,
  "is_setup" boolean
)
  LANGUAGE "plpgsql" SECURITY DEFINER
  AS $$
BEGIN
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
