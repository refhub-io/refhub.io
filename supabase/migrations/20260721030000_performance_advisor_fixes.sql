-- 20260721030000_performance_advisor_fixes.sql
--
-- Addresses Supabase Performance Advisor findings.
--
-- Part A: auth_rls_initplan (WARN, 53 policies). Every RLS policy in this
-- schema called "auth"."uid"() directly inside its USING/WITH CHECK
-- expression. Postgres cannot treat a directly-referenced function call as a
-- one-time InitPlan, so it gets re-evaluated once per row scanned instead of
-- once per query. Wrapping it as (select auth.uid()) makes it a scalar
-- subquery, which the planner *can* cache for the statement -- this is
-- Supabase's own documented fix and is semantically identical: auth.uid()
-- is STABLE (same result for the whole statement), so caching it changes
-- nothing about which rows match, only how many times the function runs.
-- Every policy below is DROP + CREATE with the exact same USING/WITH
-- CHECK/FOR/TO as before, only the auth.uid() calls are wrapped.
--
-- (One exception: "Users can manage vault papers" on vault_papers uses the
-- already-corrected definition from 20260721010000_security_advisor_fixes.sql
-- -- not the original schema.sql text -- since that migration rewrote this
-- policy's USING/FOR/TO already.)

DROP POLICY IF EXISTS "Authenticated users can fork public vaults" ON "public"."vault_forks";
CREATE POLICY "Authenticated users can fork public vaults" ON "public"."vault_forks" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() ) = "forked_by") AND (EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_forks"."original_vault_id") AND ("v"."visibility" = 'public'::"public"."vault_visibility"))))));

DROP POLICY IF EXISTS "Users can access publication tags for accessible publications" ON "public"."publication_tags";
CREATE POLICY "Users can access publication tags for accessible publications" ON "public"."publication_tags" FOR SELECT TO "authenticated", "anon" USING (((("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."publications" "p"
  WHERE (("p"."id" = "publication_tags"."publication_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() )))))) OR (("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((("public"."publications" "p"
     LEFT JOIN "public"."vault_papers" "vp" ON (("p"."id" = "vp"."publication_id")))
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("p"."id" = "publication_tags"."publication_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() )) OR (("v"."id" IS NOT NULL) AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL)) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))))) OR (("vault_publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (("public"."vault_publications" "vp"
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."id" = "publication_tags"."vault_publication_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL)) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))))));

DROP POLICY IF EXISTS "Users can add favorites" ON "public"."vault_favorites";
CREATE POLICY "Users can add favorites" ON "public"."vault_favorites" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can add favorites for accessible vaults" ON "public"."vault_favorites";
CREATE POLICY "Users can add favorites for accessible vaults" ON "public"."vault_favorites" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() ) = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_favorites"."vault_id") AND ("v"."visibility" = ANY (ARRAY['public'::"public"."vault_visibility", 'protected'::"public"."vault_visibility"])))))));

DROP POLICY IF EXISTS "Users can delete own fork records" ON "public"."vault_forks";
CREATE POLICY "Users can delete own fork records" ON "public"."vault_forks" FOR DELETE TO "authenticated" USING (("forked_by" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can delete own notifications" ON "public"."notifications";
CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can delete their own forks" ON "public"."vault_forks";
CREATE POLICY "Users can delete their own forks" ON "public"."vault_forks" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "forked_by"));

DROP POLICY IF EXISTS "Users can delete their own google drive link" ON "public"."user_google_drive_links";
CREATE POLICY "Users can delete their own google drive link" ON "public"."user_google_drive_links" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can delete their own publication pdf assets" ON "public"."publication_pdf_assets";
CREATE POLICY "Users can delete their own publication pdf assets" ON "public"."publication_pdf_assets" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can fork public vaults" ON "public"."vault_forks";
CREATE POLICY "Users can fork public vaults" ON "public"."vault_forks" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() ) = "forked_by") AND (EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_forks"."original_vault_id") AND ("v"."visibility" = 'public'::"public"."vault_visibility") AND ("v"."user_id" <> ( SELECT "auth"."uid"() )))))));

DROP POLICY IF EXISTS "Users can insert their own google drive link" ON "public"."user_google_drive_links";
CREATE POLICY "Users can insert their own google drive link" ON "public"."user_google_drive_links" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can insert their own publication pdf assets" ON "public"."publication_pdf_assets";
CREATE POLICY "Users can insert their own publication pdf assets" ON "public"."publication_pdf_assets" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can manage own publications and publications in editable " ON "public"."publications";
CREATE POLICY "Users can manage own publications and publications in editable " ON "public"."publications" TO "authenticated" USING (((( SELECT "auth"."uid"() ) = "user_id") OR (EXISTS ( SELECT 1
   FROM (("public"."vault_papers" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."publication_id" = "publications"."id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))))) WITH CHECK (((( SELECT "auth"."uid"() ) = "user_id") OR (EXISTS ( SELECT 1
   FROM (("public"."vault_papers" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."publication_id" = "publications"."id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))));

DROP POLICY IF EXISTS "Users can manage own tags and tags in editable vaults" ON "public"."tags";
CREATE POLICY "Users can manage own tags and tags in editable vaults" ON "public"."tags" TO "authenticated" USING (((( SELECT "auth"."uid"() ) = "user_id") OR (("vault_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "tags"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))))) WITH CHECK (((( SELECT "auth"."uid"() ) = "user_id") OR (("vault_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "tags"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))))));

DROP POLICY IF EXISTS "Users can manage own vaults" ON "public"."vaults";
CREATE POLICY "Users can manage own vaults" ON "public"."vaults" TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can manage publication tags for own publications and acce" ON "public"."publication_tags";
CREATE POLICY "Users can manage publication tags for own publications and acce" ON "public"."publication_tags" TO "authenticated" USING (((("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."publications" "p"
  WHERE (("p"."id" = "publication_tags"."publication_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() )))))) OR (("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((("public"."publications" "p"
     LEFT JOIN "public"."vault_papers" "vp" ON (("p"."id" = "vp"."publication_id")))
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("p"."id" = "publication_tags"."publication_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() )) OR (("v"."id" IS NOT NULL) AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))))) OR (("vault_publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (("public"."vault_publications" "vp"
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."id" = "publication_tags"."vault_publication_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))))) WITH CHECK (((("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."publications" "p"
  WHERE (("p"."id" = "publication_tags"."publication_id") AND ("p"."user_id" = ( SELECT "auth"."uid"() )))))) OR (("publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((("public"."publications" "p"
     LEFT JOIN "public"."vault_papers" "vp" ON (("p"."id" = "vp"."publication_id")))
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("p"."id" = "publication_tags"."publication_id") AND (("p"."user_id" = ( SELECT "auth"."uid"() )) OR (("v"."id" IS NOT NULL) AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))))) OR (("vault_publication_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (("public"."vault_publications" "vp"
     LEFT JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."id" = "publication_tags"."vault_publication_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))))));

DROP POLICY IF EXISTS "Users can manage vault publications in editable vaults" ON "public"."vault_publications";
CREATE POLICY "Users can manage vault publications in editable vaults" ON "public"."vault_publications" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "vault_publications"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "vault_publications"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL) AND ("vs"."role" <> 'viewer'::"public"."vault_permission")) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))));

DROP POLICY IF EXISTS "Users can remove own favorites" ON "public"."vault_favorites";
CREATE POLICY "Users can remove own favorites" ON "public"."vault_favorites" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can remove their own favorites" ON "public"."vault_favorites";
CREATE POLICY "Users can remove their own favorites" ON "public"."vault_favorites" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can request access to vaults" ON "public"."vault_access_requests";
CREATE POLICY "Users can request access to vaults" ON "public"."vault_access_requests" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() ) = "requester_id"));

DROP POLICY IF EXISTS "Users can select their own google drive link" ON "public"."user_google_drive_links";
CREATE POLICY "Users can select their own google drive link" ON "public"."user_google_drive_links" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can select their own publication pdf assets" ON "public"."publication_pdf_assets";
CREATE POLICY "Users can select their own publication pdf assets" ON "public"."publication_pdf_assets" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can update own notifications" ON "public"."notifications";
CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can update own profile" ON "public"."profiles";
CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can update their own google drive link" ON "public"."user_google_drive_links";
CREATE POLICY "Users can update their own google drive link" ON "public"."user_google_drive_links" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() ))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can update their own publication pdf assets" ON "public"."publication_pdf_assets";
CREATE POLICY "Users can update their own publication pdf assets" ON "public"."publication_pdf_assets" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() ))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can view favorites for accessible vaults" ON "public"."vault_favorites";
CREATE POLICY "Users can view favorites for accessible vaults" ON "public"."vault_favorites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_favorites"."vault_id") AND (("vaults"."user_id" = ( SELECT "auth"."uid"() )) OR "public"."user_can_access_vault"("vaults"."id", 'viewer'::"text"))))));

DROP POLICY IF EXISTS "Users can view fork relationships" ON "public"."vault_forks";
CREATE POLICY "Users can view fork relationships" ON "public"."vault_forks" FOR SELECT TO "authenticated" USING ((("forked_by" = ( SELECT "auth"."uid"() )) OR (EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_forks"."original_vault_id") AND (("v"."visibility" = 'public'::"public"."vault_visibility") OR ("v"."user_id" = ( SELECT "auth"."uid"() ))))))));

DROP POLICY IF EXISTS "Users can view forks for accessible vaults" ON "public"."vault_forks";
CREATE POLICY "Users can view forks for accessible vaults" ON "public"."vault_forks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_forks"."original_vault_id") AND (("vaults"."user_id" = ( SELECT "auth"."uid"() )) OR "public"."user_can_access_vault"("vaults"."id", 'viewer'::"text"))))));

DROP POLICY IF EXISTS "Users can view notifications" ON "public"."notifications";
CREATE POLICY "Users can view notifications" ON "public"."notifications" FOR SELECT USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can view own access requests" ON "public"."vault_access_requests";
CREATE POLICY "Users can view own access requests" ON "public"."vault_access_requests" FOR SELECT USING ((( SELECT "auth"."uid"() ) = "requester_id"));

DROP POLICY IF EXISTS "Users can view own favorites" ON "public"."vault_favorites";
CREATE POLICY "Users can view own favorites" ON "public"."vault_favorites" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can view own fork records" ON "public"."vault_forks";
CREATE POLICY "Users can view own fork records" ON "public"."vault_forks" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "forked_by"));

DROP POLICY IF EXISTS "Users can view own publications and publications in accessible " ON "public"."publications";
CREATE POLICY "Users can view own publications and publications in accessible " ON "public"."publications" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() ) = "user_id") OR (EXISTS ( SELECT 1
   FROM (("public"."vault_papers" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."publication_id" = "publications"."id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL)) OR ("v"."visibility" = 'public'::"public"."vault_visibility")))))));

DROP POLICY IF EXISTS "Users can view own tags and tags in accessible vaults" ON "public"."tags";
CREATE POLICY "Users can view own tags and tags in accessible vaults" ON "public"."tags" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() ) = "user_id") OR (("vault_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "tags"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL)) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))))));

DROP POLICY IF EXISTS "Users can view relevant shares" ON "public"."vault_shares";
CREATE POLICY "Users can view relevant shares" ON "public"."vault_shares" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() ) = "shared_by") OR (( SELECT "auth"."uid"() ) = "shared_with_user_id")));

DROP POLICY IF EXISTS "Users can view stats for accessible vaults" ON "public"."vault_stats";
CREATE POLICY "Users can view stats for accessible vaults" ON "public"."vault_stats" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_stats"."vault_id") AND (("vaults"."user_id" = ( SELECT "auth"."uid"() )) OR ("vaults"."visibility" = 'public'::"public"."vault_visibility") OR "public"."user_can_access_vault"("vaults"."id", 'viewer'::"text"))))));

DROP POLICY IF EXISTS "Users can view their own favorites" ON "public"."vault_favorites";
CREATE POLICY "Users can view their own favorites" ON "public"."vault_favorites" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "user_id"));

DROP POLICY IF EXISTS "Users can view their own forks" ON "public"."vault_forks";
CREATE POLICY "Users can view their own forks" ON "public"."vault_forks" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() ) = "forked_by"));

DROP POLICY IF EXISTS "Users can view vault papers" ON "public"."vault_papers";
CREATE POLICY "Users can view vault papers" ON "public"."vault_papers" FOR SELECT USING (((( SELECT "auth"."uid"() ) = "added_by") OR (EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_papers"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR ("v"."visibility" = 'public'::"public"."vault_visibility") OR (EXISTS ( SELECT 1
           FROM "public"."vault_shares" "vs"
          WHERE (("vs"."vault_id" = "v"."id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))))))));

DROP POLICY IF EXISTS "Users can view vault publications in accessible vaults" ON "public"."vault_publications";
CREATE POLICY "Users can view vault publications in accessible vaults" ON "public"."vault_publications" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."vaults" "v"
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("v"."id" = "vault_publications"."vault_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" IS NOT NULL)) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))));

DROP POLICY IF EXISTS "Vault owners can manage shares" ON "public"."vault_shares";
CREATE POLICY "Vault owners can manage shares" ON "public"."vault_shares" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_shares"."vault_id") AND ("v"."user_id" = ( SELECT "auth"."uid"() )))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_shares"."vault_id") AND ("v"."user_id" = ( SELECT "auth"."uid"() ))))));

DROP POLICY IF EXISTS "Vault owners can update access requests" ON "public"."vault_access_requests";
CREATE POLICY "Vault owners can update access requests" ON "public"."vault_access_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_access_requests"."vault_id") AND ("vaults"."user_id" = ( SELECT "auth"."uid"() ))))));

DROP POLICY IF EXISTS "Vault owners can view access requests" ON "public"."vault_access_requests";
CREATE POLICY "Vault owners can view access requests" ON "public"."vault_access_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."vaults"
  WHERE (("vaults"."id" = "vault_access_requests"."vault_id") AND ("vaults"."user_id" = ( SELECT "auth"."uid"() ))))));

DROP POLICY IF EXISTS "Vault owners can view forks of their vault" ON "public"."vault_forks";
CREATE POLICY "Vault owners can view forks of their vault" ON "public"."vault_forks" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vaults" "v"
  WHERE (("v"."id" = "vault_forks"."original_vault_id") AND ("v"."user_id" = ( SELECT "auth"."uid"() ))))));

DROP POLICY IF EXISTS "publication_relations_delete" ON "public"."publication_relations";
CREATE POLICY "publication_relations_delete" ON "public"."publication_relations" FOR DELETE TO "authenticated" USING ((("created_by" = ( SELECT "auth"."uid"() )) OR (EXISTS ( SELECT 1
   FROM ("public"."vault_publications" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
  WHERE ((("vp"."id" = "publication_relations"."publication_id") OR ("vp"."id" = "publication_relations"."related_publication_id")) AND ("v"."user_id" = ( SELECT "auth"."uid"() )))))));

DROP POLICY IF EXISTS "publication_relations_insert" ON "public"."publication_relations";
CREATE POLICY "publication_relations_insert" ON "public"."publication_relations" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() )) AND (EXISTS ( SELECT 1
   FROM (("public"."vault_publications" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE (("vp"."id" = "publication_relations"."publication_id") AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR (("vs"."shared_with_user_id" IS NOT NULL) AND ("vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"])))))))));

DROP POLICY IF EXISTS "publication_relations_select" ON "public"."publication_relations";
CREATE POLICY "publication_relations_select" ON "public"."publication_relations" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM (("public"."vault_publications" "vp"
     JOIN "public"."vaults" "v" ON (("vp"."vault_id" = "v"."id")))
     LEFT JOIN "public"."vault_shares" "vs" ON ((("v"."id" = "vs"."vault_id") AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() )))))
  WHERE ((("vp"."id" = "publication_relations"."publication_id") OR ("vp"."id" = "publication_relations"."related_publication_id")) AND (("v"."user_id" = ( SELECT "auth"."uid"() )) OR ("vs"."shared_with_user_id" IS NOT NULL) OR ("v"."visibility" = 'public'::"public"."vault_visibility"))))));

DROP POLICY IF EXISTS "publication_relations_update" ON "public"."publication_relations";
CREATE POLICY "publication_relations_update" ON "public"."publication_relations" FOR UPDATE TO "authenticated" USING (("created_by" = ( SELECT "auth"."uid"() ))) WITH CHECK (("created_by" = ( SELECT "auth"."uid"() )));

DROP POLICY IF EXISTS "Users can manage vault papers" ON "public"."vault_papers";
CREATE POLICY "Users can manage vault papers" ON "public"."vault_papers"
    FOR ALL TO "authenticated"
    USING (
        (( SELECT "auth"."uid"() ) = "added_by")
        OR (EXISTS (
            SELECT 1 FROM "public"."vaults" "v"
            WHERE ("v"."id" = "vault_papers"."vault_id")
              AND (
                ("v"."user_id" = ( SELECT "auth"."uid"() ))
                OR (EXISTS (
                    SELECT 1 FROM "public"."vault_shares" "vs"
                    WHERE ("vs"."vault_id" = "v"."id")
                      AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() ))
                      AND ("vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"]))
                ))
              )
        ))
    )
    WITH CHECK (
        (( SELECT "auth"."uid"() ) = "added_by")
        OR (EXISTS (
            SELECT 1 FROM "public"."vaults" "v"
            WHERE ("v"."id" = "vault_papers"."vault_id")
              AND (
                ("v"."user_id" = ( SELECT "auth"."uid"() ))
                OR (EXISTS (
                    SELECT 1 FROM "public"."vault_shares" "vs"
                    WHERE ("vs"."vault_id" = "v"."id")
                      AND ("vs"."shared_with_user_id" = ( SELECT "auth"."uid"() ))
                      AND ("vs"."role" = ANY (ARRAY['editor'::"public"."vault_permission", 'owner'::"public"."vault_permission"]))
                ))
              )
        ))
    );

-- Part B: unindexed_foreign_keys (INFO)
CREATE INDEX IF NOT EXISTS "idx_api_keys_created_by" ON "public"."api_keys" USING "btree" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_publication_pdf_assets_user_id" ON "public"."publication_pdf_assets" USING "btree" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_publication_tags_tag_id" ON "public"."publication_tags" USING "btree" ("tag_id");
CREATE INDEX IF NOT EXISTS "idx_publications_user_id" ON "public"."publications" USING "btree" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_tags_user_id" ON "public"."tags" USING "btree" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_vault_access_requests_requester_id" ON "public"."vault_access_requests" USING "btree" ("requester_id");
CREATE INDEX IF NOT EXISTS "idx_vault_publications_created_by" ON "public"."vault_publications" USING "btree" ("created_by");
CREATE INDEX IF NOT EXISTS "idx_vault_shares_shared_by" ON "public"."vault_shares" USING "btree" ("shared_by");
CREATE INDEX IF NOT EXISTS "idx_vault_shares_vault_id" ON "public"."vault_shares" USING "btree" ("vault_id");
CREATE INDEX IF NOT EXISTS "idx_vaults_user_id" ON "public"."vaults" USING "btree" ("user_id");

-- Part C: multiple_permissive_policies -- drop policies proven redundant or, in one
-- case, an outright access-control gap. See migration comments for the proof per policy.

-- profiles/SELECT: "Authenticated users can view profiles" is USING (true), a strict
-- superset of "...view set up profiles"'s USING (is_setup = true).
DROP POLICY IF EXISTS "Authenticated users can view set up profiles" ON "public"."profiles";

-- vault_favorites: exact duplicates under a different name (same USING clause, verified
-- byte-for-byte).
DROP POLICY IF EXISTS "Users can remove their own favorites" ON "public"."vault_favorites";
DROP POLICY IF EXISTS "Users can view their own favorites" ON "public"."vault_favorites";

-- vault_forks: same duplication pattern.
DROP POLICY IF EXISTS "Users can delete their own forks" ON "public"."vault_forks";
DROP POLICY IF EXISTS "Users can view their own forks" ON "public"."vault_forks";

-- vault_forks/INSERT: "Users can create forks" only checks (auth.uid() = forked_by),
-- with NO restriction on the original vault's visibility. Since permissive policies are
-- OR'd, this alone was already sufficient to let any authenticated user insert a
-- vault_forks row against ANY vault_id (private included) -- it fully defeated the
-- "public vaults only" restriction that "Authenticated users can fork public vaults" and
-- "Users can fork public vaults" were written to enforce (confirmed against
-- src/lib/vaultFork.ts, which only ever forks vaults fetched with
-- .eq('visibility', 'public'), and enforce_forked_vaults_public's own "forked vaults
-- must remain public" intent). Dropping it; the two visibility-gated policies already
-- cover every legitimate fork path.
DROP POLICY IF EXISTS "Users can create forks" ON "public"."vault_forks";

-- vaults/SELECT: "Users can view own vaults" (auth.uid() = user_id) is a strict subset
-- of "Users can view shared vaults" (public.user_can_access_vault(id, 'viewer')), whose
-- body checks vault ownership first and returns true immediately -- see
-- supabase/schema.sql's user_can_access_vault definition.
DROP POLICY IF EXISTS "Users can view own vaults" ON "public"."vaults";

-- publications: "Users can manage own publications" (auth.uid() = user_id) is textually
-- the first disjunct inside "...manage own publications and publications in editable "'s
-- own USING/WITH CHECK OR-chain, so it can never permit anything the latter doesn't
-- already permit.
DROP POLICY IF EXISTS "Users can manage own publications" ON "public"."publications";
