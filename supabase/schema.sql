


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  user_id_to_delete UUID;
BEGIN
  -- Get the current user's ID
  user_id_to_delete := auth.uid();
  
  IF user_id_to_delete IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Delete all user data in order (respecting foreign key constraints)
  DELETE FROM public.publication_tags 
  WHERE publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  );
  
  DELETE FROM public.publication_relations 
  WHERE publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  ) OR related_publication_id IN (
    SELECT id FROM public.publications WHERE user_id = user_id_to_delete
  );
  
  DELETE FROM public.publications WHERE user_id = user_id_to_delete;
  
  DELETE FROM public.vault_shares WHERE shared_by = user_id_to_delete;
  DELETE FROM public.vault_favorites WHERE user_id = user_id_to_delete;
  DELETE FROM public.vault_forks WHERE forked_by = user_id_to_delete;
  DELETE FROM public.tags WHERE user_id = user_id_to_delete;
  DELETE FROM public.vaults WHERE user_id = user_id_to_delete;
  DELETE FROM public.profiles WHERE user_id = user_id_to_delete;
  
  -- Delete the auth user (requires auth schema access)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
END;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delete_user"() IS 'Allows a user to delete their own account and all associated data';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_vault_downloads"("vault_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, download_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    download_count = vault_stats.download_count + 1,
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."increment_vault_downloads"("vault_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_vault_views"("vault_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.vault_stats (vault_id, view_count)
  VALUES (vault_uuid, 1)
  ON CONFLICT (vault_id)
  DO UPDATE SET 
    view_count = vault_stats.view_count + 1,
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."increment_vault_views"("vault_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vault_access_requested"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."notify_vault_access_requested"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vault_access_status_changed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."notify_vault_access_status_changed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vault_favorited"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  vault_name TEXT;
  vault_owner_id UUID;
  favoriter_name TEXT;
BEGIN
  -- Get vault info
  SELECT name, user_id INTO vault_name, vault_owner_id 
  FROM public.vaults WHERE id = NEW.vault_id;
  
  -- Don't notify if user favorites their own vault
  IF vault_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get favoriter display name
  SELECT COALESCE(display_name, email) INTO favoriter_name 
  FROM public.profiles WHERE user_id = NEW.user_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    vault_owner_id,
    'vault_favorited',
    'Your vault was favorited',
    favoriter_name || ' favorited your vault "' || vault_name || '"',
    jsonb_build_object('vault_id', NEW.vault_id, 'from_user_id', NEW.user_id)
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_vault_favorited"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vault_forked"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  vault_name TEXT;
  vault_owner_id UUID;
  forker_name TEXT;
BEGIN
  -- Get original vault info
  SELECT name, user_id INTO vault_name, vault_owner_id 
  FROM public.vaults WHERE id = NEW.original_vault_id;
  
  -- Don't notify if user forks their own vault
  IF vault_owner_id = NEW.forked_by THEN
    RETURN NEW;
  END IF;
  
  -- Get forker display name
  SELECT COALESCE(display_name, email) INTO forker_name 
  FROM public.profiles WHERE user_id = NEW.forked_by;
  
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    vault_owner_id,
    'vault_forked',
    'Your vault was forked',
    forker_name || ' forked your vault "' || vault_name || '"',
    jsonb_build_object('vault_id', NEW.original_vault_id, 'forked_vault_id', NEW.forked_vault_id, 'from_user_id', NEW.forked_by)
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_vault_forked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_vault_shared"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  vault_name TEXT;
  sharer_name TEXT;
  target_user_id UUID;
BEGIN
  -- Get vault name
  SELECT name INTO vault_name FROM public.vaults WHERE id = NEW.vault_id;
  
  -- Get sharer display name
  SELECT COALESCE(display_name, email) INTO sharer_name 
  FROM public.profiles WHERE user_id = NEW.shared_by;
  
  -- Determine target user
  IF NEW.shared_with_user_id IS NOT NULL THEN
    target_user_id := NEW.shared_with_user_id;
  ELSE
    -- Lookup user by email
    SELECT id INTO target_user_id FROM auth.users WHERE email = NEW.shared_with_email;
  END IF;
  
  -- Only create notification if we found a user
  IF target_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      target_user_id,
      'vault_shared',
      'New vault shared with you',
      sharer_name || ' shared "' || vault_name || '" with you',
      jsonb_build_object('vault_id', NEW.vault_id, 'from_user_id', NEW.shared_by, 'permission', NEW.permission)
    );
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_vault_shared"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tag_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
  ELSE
    SELECT depth + 1 INTO NEW.depth FROM public.tags WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_tag_depth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_access_vault"("vault_uuid" "uuid", "required_permission" "text" DEFAULT 'viewer'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  vault_owner_id UUID;
  user_share_permission TEXT;
BEGIN
  -- Check if user is vault owner (most direct check)
  SELECT user_id INTO vault_owner_id FROM vaults WHERE id = vault_uuid;
  IF vault_owner_id = auth.uid() THEN RETURN TRUE; END IF;
  
  -- Check share permissions
  SELECT permission INTO user_share_permission 
  FROM vault_shares 
  WHERE vault_id = vault_uuid 
  AND (shared_with_user_id = auth.uid() 
       OR (shared_with_email = auth.email() AND shared_with_user_id IS NULL));
  
  -- Check if user has required permission level
  IF required_permission = 'viewer' AND user_share_permission IN ('viewer', 'editor') THEN RETURN TRUE; END IF;
  IF required_permission = 'editor' AND user_share_permission = 'editor' THEN RETURN TRUE; END IF;
  
  -- Check public access
  IF EXISTS (SELECT 1 FROM vaults WHERE id = vault_uuid AND is_public = TRUE) 
     AND required_permission IN ('viewer', 'editor') THEN RETURN TRUE; END IF;
  
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."user_can_access_vault"("vault_uuid" "uuid", "required_permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_username"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF NEW.username IS NOT NULL THEN
    IF LENGTH(NEW.username) < 3 OR LENGTH(NEW.username) > 30 THEN
      RAISE EXCEPTION 'Username must be between 3 and 30 characters';
    END IF;
    IF NEW.username !~ '^[a-zA-Z0-9_]+$' THEN
      RAISE EXCEPTION 'Username can only contain letters, numbers, and underscores';
    END IF;
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_username"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "data" "jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "email" "text",
    "avatar_url" "text",
    "username" "text",
    "bio" "text",
    "github_url" "text",
    "linkedin_url" "text",
    "bluesky_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_setup" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publication_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "publication_id" "uuid" NOT NULL,
    "related_publication_id" "uuid" NOT NULL,
    "relation_type" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "no_self_reference" CHECK (("publication_id" <> "related_publication_id"))
);


ALTER TABLE "public"."publication_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publication_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "publication_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL
);


ALTER TABLE "public"."publication_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."publications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "vault_id" "uuid",
    "title" "text" NOT NULL,
    "authors" "text"[] DEFAULT '{}'::"text"[],
    "year" integer,
    "journal" "text",
    "volume" "text",
    "issue" "text",
    "pages" "text",
    "doi" "text",
    "url" "text",
    "abstract" "text",
    "pdf_url" "text",
    "bibtex_key" "text",
    "publication_type" "text" DEFAULT 'article'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booktitle" "text",
    "chapter" "text",
    "edition" "text",
    "editor" "text"[] DEFAULT '{}'::"text"[],
    "howpublished" "text",
    "institution" "text",
    "number" "text",
    "organization" "text",
    "publisher" "text",
    "school" "text",
    "series" "text",
    "type" "text",
    "eid" "text",
    "isbn" "text",
    "issn" "text",
    "keywords" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."publications" OWNER TO "postgres";


COMMENT ON COLUMN "public"."publications"."booktitle" IS 'Title of a book, part of which is being cited';



COMMENT ON COLUMN "public"."publications"."chapter" IS 'A chapter (or section) number';



COMMENT ON COLUMN "public"."publications"."edition" IS 'The edition of a book';



COMMENT ON COLUMN "public"."publications"."editor" IS 'Editor(s) of the book or collection';



COMMENT ON COLUMN "public"."publications"."howpublished" IS 'How something strange has been published';



COMMENT ON COLUMN "public"."publications"."institution" IS 'The sponsoring institution of a technical report';



COMMENT ON COLUMN "public"."publications"."number" IS 'The number of a journal, magazine, technical report, or work in a series';



COMMENT ON COLUMN "public"."publications"."organization" IS 'The organization that sponsors a conference or publishes a manual';



COMMENT ON COLUMN "public"."publications"."publisher" IS 'The publisher name';



COMMENT ON COLUMN "public"."publications"."school" IS 'The name of the academic institution where a thesis was written';



COMMENT ON COLUMN "public"."publications"."series" IS 'The name of a series or set of books';



COMMENT ON COLUMN "public"."publications"."type" IS 'The type of a technical report or thesis';



COMMENT ON COLUMN "public"."publications"."eid" IS 'Electronic identifier for electronic journals';



COMMENT ON COLUMN "public"."publications"."isbn" IS 'International Standard Book Number';



COMMENT ON COLUMN "public"."publications"."issn" IS 'International Standard Serial Number';



COMMENT ON COLUMN "public"."publications"."keywords" IS 'Keywords for searching or annotation';



CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6366f1'::"text",
    "parent_id" "uuid",
    "depth" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vault_id" "uuid"
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


COMMENT ON TABLE "public"."tags" IS 'Tags can be user-scoped (for personal vaults) or vault-scoped (for shared vaults).';



COMMENT ON COLUMN "public"."tags"."vault_id" IS 'References to vault this tag belongs to. NULL for user-scoped tags, UUID for vault-scoped tags.';



CREATE TABLE IF NOT EXISTS "public"."vault_access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vault_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "requester_email" "text",
    "requester_name" "text",
    "note" "text",
    "requester_id" "uuid" NOT NULL
);


ALTER TABLE "public"."vault_access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vault_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vault_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vault_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vault_forks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_vault_id" "uuid" NOT NULL,
    "forked_vault_id" "uuid" NOT NULL,
    "forked_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vault_forks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vault_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vault_id" "uuid" NOT NULL,
    "shared_with_email" "text",
    "shared_with_user_id" "uuid",
    "shared_by" "uuid" NOT NULL,
    "permission" "text" DEFAULT 'viewer'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "vault_shares_permission_check" CHECK (("permission" = ANY (ARRAY['viewer'::"text", 'editor'::"text"])))
);


ALTER TABLE "public"."vault_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vault_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vault_id" "uuid" NOT NULL,
    "view_count" integer DEFAULT 0,
    "download_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vault_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vaults" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#6366f1'::"text",
    "is_shared" boolean DEFAULT false,
    "is_public" boolean DEFAULT false,
    "public_slug" "text",
    "category" "text",
    "abstract" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vaults" OWNER TO "postgres";


ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."publication_relations"
    ADD CONSTRAINT "publication_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publication_tags"
    ADD CONSTRAINT "publication_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publication_tags"
    ADD CONSTRAINT "publication_tags_publication_id_tag_id_key" UNIQUE ("publication_id", "tag_id");



ALTER TABLE ONLY "public"."publications"
    ADD CONSTRAINT "publications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."publication_relations"
    ADD CONSTRAINT "unique_relation" UNIQUE ("publication_id", "related_publication_id");



ALTER TABLE ONLY "public"."vault_access_requests"
    ADD CONSTRAINT "unique_vault_requester_id" UNIQUE ("vault_id", "requester_id");



ALTER TABLE ONLY "public"."vault_access_requests"
    ADD CONSTRAINT "vault_access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vault_favorites"
    ADD CONSTRAINT "vault_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vault_favorites"
    ADD CONSTRAINT "vault_favorites_vault_id_user_id_key" UNIQUE ("vault_id", "user_id");



ALTER TABLE ONLY "public"."vault_forks"
    ADD CONSTRAINT "vault_forks_forked_vault_id_key" UNIQUE ("forked_vault_id");



ALTER TABLE ONLY "public"."vault_forks"
    ADD CONSTRAINT "vault_forks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vault_shares"
    ADD CONSTRAINT "vault_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vault_stats"
    ADD CONSTRAINT "vault_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vault_stats"
    ADD CONSTRAINT "vault_stats_vault_id_key" UNIQUE ("vault_id");



ALTER TABLE ONLY "public"."vaults"
    ADD CONSTRAINT "vaults_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vaults"
    ADD CONSTRAINT "vaults_public_slug_key" UNIQUE ("public_slug");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("user_id", "read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_publication_relations_publication" ON "public"."publication_relations" USING "btree" ("publication_id");



CREATE INDEX "idx_publication_relations_related" ON "public"."publication_relations" USING "btree" ("related_publication_id");



CREATE INDEX "idx_tags_parent_id" ON "public"."tags" USING "btree" ("parent_id");



CREATE INDEX "idx_tags_vault_id" ON "public"."tags" USING "btree" ("vault_id");



CREATE UNIQUE INDEX "idx_unique_pending_requester_email" ON "public"."vault_access_requests" USING "btree" ("vault_id", "requester_email") WHERE (("status" = 'pending'::"text") AND ("requester_email" IS NOT NULL));



CREATE INDEX "idx_vault_access_requests_vault_id" ON "public"."vault_access_requests" USING "btree" ("vault_id");



CREATE INDEX "idx_vault_favorites_user" ON "public"."vault_favorites" USING "btree" ("user_id");



CREATE INDEX "idx_vault_favorites_vault" ON "public"."vault_favorites" USING "btree" ("vault_id");



CREATE INDEX "idx_vault_forks_original" ON "public"."vault_forks" USING "btree" ("original_vault_id");



CREATE INDEX "idx_vault_shares_user_id" ON "public"."vault_shares" USING "btree" ("shared_with_user_id");



CREATE INDEX "idx_vaults_is_public" ON "public"."vaults" USING "btree" ("is_public") WHERE ("is_public" = true);



CREATE INDEX "idx_vaults_public_slug" ON "public"."vaults" USING "btree" ("public_slug") WHERE ("public_slug" IS NOT NULL);



CREATE OR REPLACE TRIGGER "on_vault_favorited" AFTER INSERT ON "public"."vault_favorites" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vault_favorited"();



CREATE OR REPLACE TRIGGER "on_vault_forked" AFTER INSERT ON "public"."vault_forks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vault_forked"();



CREATE OR REPLACE TRIGGER "on_vault_shared" AFTER INSERT ON "public"."vault_shares" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vault_shared"();



CREATE OR REPLACE TRIGGER "trg_notify_vault_access_requested" AFTER INSERT ON "public"."vault_access_requests" FOR EACH ROW EXECUTE FUNCTION "public"."notify_vault_access_requested"();



CREATE OR REPLACE TRIGGER "trg_notify_vault_access_status_changed" AFTER UPDATE OF "status" ON "public"."vault_access_requests" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."notify_vault_access_status_changed"();



CREATE OR REPLACE TRIGGER "trigger_update_tag_depth" BEFORE INSERT OR UPDATE OF "parent_id" ON "public"."tags" FOR EACH ROW EXECUTE FUNCTION "public"."update_tag_depth"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_publications_updated_at" BEFORE UPDATE ON "public"."publications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_vaults_updated_at" BEFORE UPDATE ON "public"."vaults" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_username_trigger" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_username"();



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publication_relations"
    ADD CONSTRAINT "publication_relations_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publication_relations"
    ADD CONSTRAINT "publication_relations_related_publication_id_fkey" FOREIGN KEY ("related_publication_id") REFERENCES "public"."publications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publication_tags"
    ADD CONSTRAINT "publication_tags_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publication_tags"
    ADD CONSTRAINT "publication_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publications"
    ADD CONSTRAINT "publications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."publications"
    ADD CONSTRAINT "publications_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."tags"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_access_requests"
    ADD CONSTRAINT "vault_access_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_access_requests"
    ADD CONSTRAINT "vault_access_requests_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_favorites"
    ADD CONSTRAINT "vault_favorites_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_forks"
    ADD CONSTRAINT "vault_forks_forked_vault_id_fkey" FOREIGN KEY ("forked_vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_forks"
    ADD CONSTRAINT "vault_forks_original_vault_id_fkey" FOREIGN KEY ("original_vault_id") REFERENCES "public"."vaults"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vault_shares"
    ADD CONSTRAINT "vault_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_shares"
    ADD CONSTRAINT "vault_shares_shared_with_user_id_fkey" FOREIGN KEY ("shared_with_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."vault_shares"
    ADD CONSTRAINT "vault_shares_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vault_stats"
    ADD CONSTRAINT "vault_stats_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vaults"
    ADD CONSTRAINT "vaults_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow insert for requests" ON "public"."vault_access_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow select for all users" ON "public"."vaults" FOR SELECT USING (true);



CREATE POLICY "Anyone can view fork info for public vaults" ON "public"."vault_forks" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_forks"."original_vault_id") AND ("v"."is_public" = true)))) OR ("auth"."uid"() = "forked_by")));



CREATE POLICY "Anyone can view profiles of public vault owners" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."user_id" = "profiles"."user_id") AND ("v"."is_public" = true)))));



CREATE POLICY "Anyone can view stats for public vaults" ON "public"."vault_stats" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_stats"."vault_id") AND ("vaults"."is_public" = true)))));



CREATE POLICY "Owners can manage vault stats" ON "public"."vault_stats" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_stats"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))));



CREATE POLICY "Requesters can update their own request" ON "public"."vault_access_requests" FOR UPDATE USING (("requester_id" = "auth"."uid"())) WITH CHECK (true);



CREATE POLICY "Users can add favorites" ON "public"."vault_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create forks" ON "public"."vault_forks" FOR INSERT WITH CHECK (("auth"."uid"() = "forked_by"));



CREATE POLICY "Users can create relations for own publications" ON "public"."publication_relations" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."publications"
  WHERE (("publications"."id" = "publication_relations"."publication_id") AND ("publications"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own publications or from shared vaults with ed" ON "public"."publications" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."vaults"
     JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
  WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = 'editor'::"text"))))));



CREATE POLICY "Users can delete own relations" ON "public"."publication_relations" FOR DELETE USING (("created_by" = "auth"."uid"()));



CREATE POLICY "Users can delete own tags" ON "public"."tags" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own vaults" ON "public"."vaults" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete publication tags from own publications or shar" ON "public"."publication_tags" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."publications"
  WHERE (("publications"."id" = "publication_tags"."publication_id") AND (("publications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."vaults"
          WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM ("public"."vaults"
             JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
          WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = 'editor'::"text")))))))));



CREATE POLICY "Users can delete shares from own vaults" ON "public"."vault_shares" FOR DELETE USING (("shared_by" = "auth"."uid"()));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own publications or into shared vaults with ed" ON "public"."publications" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."vaults"
     JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
  WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = 'editor'::"text"))))));



CREATE POLICY "Users can insert own tags" ON "public"."tags" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own vaults" ON "public"."vaults" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert publication tags for own publications or share" ON "public"."publication_tags" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."publications"
  WHERE (("publications"."id" = "publication_tags"."publication_id") AND (("publications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."vaults"
          WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM ("public"."vaults"
             JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
          WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = 'editor'::"text")))))))));



CREATE POLICY "Users can remove their favorites" ON "public"."vault_favorites" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can share own vaults" ON "public"."vault_shares" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_shares"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own publications or shared vaults with editor " ON "public"."publications" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."vaults"
     JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
  WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = 'editor'::"text"))))));



CREATE POLICY "Users can update own tags" ON "public"."tags" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own vaults" ON "public"."vaults" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update shares for own vaults" ON "public"."vault_shares" FOR UPDATE USING (("shared_by" = "auth"."uid"())) WITH CHECK (("shared_by" = "auth"."uid"()));



CREATE POLICY "Users can view accessible tags" ON "public"."tags" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM (("public"."publication_tags"
     JOIN "public"."publications" ON (("publications"."id" = "publication_tags"."publication_id")))
     JOIN "public"."vaults" ON (("vaults"."id" = "publications"."vault_id")))
  WHERE (("publication_tags"."tag_id" = "tags"."id") AND (("vaults"."is_public" = true) OR (EXISTS ( SELECT 1
           FROM "public"."vault_shares"
          WHERE (("vault_shares"."vault_id" = "vaults"."id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())))))))))));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own publications or shared vaults" ON "public"."publications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."vaults"
     JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
  WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = ANY (ARRAY['viewer'::"text", 'editor'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."is_public" = true))))));



CREATE POLICY "Users can view own vaults or public vaults" ON "public"."vaults" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_public" = true) OR (EXISTS ( SELECT 1
   FROM "public"."vault_shares"
  WHERE (("vault_shares"."vault_id" = "vaults"."id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can view publication tags for accessible publications" ON "public"."publication_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."publications"
  WHERE (("publications"."id" = "publication_tags"."publication_id") AND (("publications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."vaults"
          WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM ("public"."vaults"
             JOIN "public"."vault_shares" ON (("vault_shares"."vault_id" = "vaults"."id")))
          WHERE (("vaults"."id" = "publications"."vault_id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())) AND ("vault_shares"."permission" = ANY (ARRAY['viewer'::"text", 'editor'::"text"]))))) OR (EXISTS ( SELECT 1
           FROM "public"."vaults"
          WHERE (("vaults"."id" = "publications"."vault_id") AND ("vaults"."is_public" = true)))))))));



CREATE POLICY "Users can view publications in accessible vaults" ON "public"."publications" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "publications"."vault_id") AND (("vaults"."is_public" = true) OR (EXISTS ( SELECT 1
           FROM "public"."vault_shares"
          WHERE (("vault_shares"."vault_id" = "vaults"."id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"())))))))))));



CREATE POLICY "Users can view relations for accessible publications" ON "public"."publication_relations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."publications" "p"
  WHERE (("p"."id" = "publication_relations"."publication_id") AND (("p"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."vaults" "v"
          WHERE (("v"."id" = "p"."vault_id") AND (("v"."is_public" = true) OR (EXISTS ( SELECT 1
                   FROM "public"."vault_shares" "vs"
                  WHERE (("vs"."vault_id" = "v"."id") AND (("vs"."shared_with_email" = "auth"."email"()) OR ("vs"."shared_with_user_id" = "auth"."uid"()))))))))))))));



CREATE POLICY "Users can view shares for own vaults" ON "public"."vault_shares" FOR SELECT USING ((("shared_by" = "auth"."uid"()) OR ("shared_with_email" = "auth"."email"()) OR ("shared_with_user_id" = "auth"."uid"())));



CREATE POLICY "Users can view tags for accessible publications" ON "public"."publication_tags" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."publications"
  WHERE (("publications"."id" = "publication_tags"."publication_id") AND (("publications"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."vaults"
          WHERE (("vaults"."id" = "publications"."vault_id") AND (("vaults"."is_public" = true) OR (EXISTS ( SELECT 1
                   FROM "public"."vault_shares"
                  WHERE (("vault_shares"."vault_id" = "vaults"."id") AND (("vault_shares"."shared_with_email" = "auth"."email"()) OR ("vault_shares"."shared_with_user_id" = "auth"."uid"()))))))))))))));



CREATE POLICY "Users can view their own access requests" ON "public"."vault_access_requests" FOR SELECT USING (("requester_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own favorites" ON "public"."vault_favorites" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Vault owners can update requests" ON "public"."vault_access_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_access_requests"."vault_id") AND ("v"."user_id" = "auth"."uid"())))));



CREATE POLICY "Vault owners can view requests" ON "public"."vault_access_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_access_requests"."vault_id") AND ("v"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publication_relations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publication_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."publications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vault_access_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vault_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vault_forks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vault_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vault_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vaults" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_vault_downloads"("vault_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_vault_downloads"("vault_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_vault_downloads"("vault_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_vault_views"("vault_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_vault_views"("vault_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_vault_views"("vault_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vault_access_requested"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vault_access_requested"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vault_access_requested"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vault_access_status_changed"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vault_access_status_changed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vault_access_status_changed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vault_favorited"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vault_favorited"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vault_favorited"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vault_forked"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vault_forked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vault_forked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_vault_shared"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_vault_shared"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_vault_shared"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tag_depth"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_tag_depth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tag_depth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_access_vault"("vault_uuid" "uuid", "required_permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_access_vault"("vault_uuid" "uuid", "required_permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_access_vault"("vault_uuid" "uuid", "required_permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_username"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_username"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_username"() TO "service_role";


















GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."publication_relations" TO "anon";
GRANT ALL ON TABLE "public"."publication_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."publication_relations" TO "service_role";



GRANT ALL ON TABLE "public"."publication_tags" TO "anon";
GRANT ALL ON TABLE "public"."publication_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."publication_tags" TO "service_role";



GRANT ALL ON TABLE "public"."publications" TO "anon";
GRANT ALL ON TABLE "public"."publications" TO "authenticated";
GRANT ALL ON TABLE "public"."publications" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."vault_access_requests" TO "anon";
GRANT ALL ON TABLE "public"."vault_access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."vault_favorites" TO "anon";
GRANT ALL ON TABLE "public"."vault_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."vault_forks" TO "anon";
GRANT ALL ON TABLE "public"."vault_forks" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_forks" TO "service_role";



GRANT ALL ON TABLE "public"."vault_shares" TO "anon";
GRANT ALL ON TABLE "public"."vault_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_shares" TO "service_role";



GRANT ALL ON TABLE "public"."vault_stats" TO "anon";
GRANT ALL ON TABLE "public"."vault_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."vault_stats" TO "service_role";



GRANT ALL ON TABLE "public"."vaults" TO "anon";
GRANT ALL ON TABLE "public"."vaults" TO "authenticated";
GRANT ALL ON TABLE "public"."vaults" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































