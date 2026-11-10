CREATE TABLE "giving_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minimum_gifts" integer NOT NULL,
	"tolerance_days" integer NOT NULL,
	"missed_expected" integer NOT NULL,
	"grouping" text NOT NULL,
	"cadences" jsonb NOT NULL,
	"note" text NOT NULL,
	"previous_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giving_policy_limits" CHECK ("giving_policy_versions"."minimum_gifts" BETWEEN 3 AND 24 AND "giving_policy_versions"."tolerance_days" BETWEEN 0 AND 3 AND "giving_policy_versions"."missed_expected" BETWEEN 1 AND 12),
	CONSTRAINT "giving_policy_grouping" CHECK ("giving_policy_versions"."grouping" IN ('person','joint_giving_unit'))
);
--> statement-breakpoint
ALTER TABLE "giving_policy_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "giving_policy_versions" ADD CONSTRAINT "giving_policy_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "giving_policy_admin" ON "giving_policy_versions" AS PERMISSIVE FOR ALL TO public USING (current_setting('np.role',true)='admin') WITH CHECK (current_setting('np.role',true)='admin');
--> statement-breakpoint
ALTER TABLE public.giving_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.giving_policy_versions ADD CONSTRAINT giving_policy_previous_fk
  FOREIGN KEY(previous_id) REFERENCES public.giving_policy_versions(id);
CREATE UNIQUE INDEX giving_policy_single_successor ON public.giving_policy_versions(previous_id)
  WHERE previous_id IS NOT NULL;
CREATE UNIQUE INDEX giving_policy_single_initial ON public.giving_policy_versions((previous_id IS NULL))
  WHERE previous_id IS NULL;
CREATE TRIGGER giving_policy_immutable BEFORE UPDATE OR DELETE ON public.giving_policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.np_ministry_immutable();
CREATE TRIGGER giving_policy_no_truncate BEFORE TRUNCATE ON public.giving_policy_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.np_ministry_immutable();
--> statement-breakpoint
ALTER FUNCTION public.np_ministry_publication_valid(uuid) RENAME TO np_ministry_publication_source_valid;
CREATE FUNCTION public.np_ministry_publication_valid(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caller_role text; result boolean; current_policy text; source_policy text; product_name text;
BEGIN
  IF NOT public.np_ministry_publication_source_valid(p_id) THEN RETURN false; END IF;
  caller_role := current_setting('np.role',true);
  SELECT product INTO product_name FROM public.ministry_publications WHERE id=p_id;
  IF product_name<>'giving' THEN RETURN true; END IF;
  PERFORM set_config('np.role','admin',true);
  SELECT p.id::text INTO current_policy FROM public.giving_policy_versions p
    WHERE NOT EXISTS(SELECT 1 FROM public.giving_policy_versions n WHERE n.previous_id=p.id)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 1;
  SELECT evidence->>'givingPolicyId' INTO source_policy FROM public.ministry_publication_evidence WHERE publication_id=p_id;
  result := source_policy=coalesce(current_policy,'owner-default');
  PERFORM set_config('np.role',caller_role,true);
  RETURN coalesce(result,false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('np.role',coalesce(caller_role,''),true);
  RAISE;
END $$;