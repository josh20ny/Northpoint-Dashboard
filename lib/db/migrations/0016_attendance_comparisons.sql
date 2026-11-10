-- Expose ONLY accepted in-person weekly totals, never the raw workbook.
-- The workbook explicitly aligns 2025 column P with the 2026 dates in B.
CREATE FUNCTION public.np_attendance_year_reference(p_week date)
RETURNS TABLE(batch_id uuid, source_cell text, source_value bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE caller_role text;
BEGIN
  caller_role := current_setting('np.role',true);
  IF caller_role IS NULL OR caller_role NOT IN ('staff','leadership','admin')
    OR EXTRACT(YEAR FROM p_week) <> 2026
    OR NOT EXISTS (
      SELECT 1 FROM public.users u WHERE u.id::text=current_setting('np.user_id',true)
      AND u.status='active' AND u.role=caller_role
    ) THEN RETURN; END IF;
  PERFORM set_config('np.role','admin',true);
  RETURN QUERY
    SELECT b.id, 'Historical - Adults!' || v.coordinate,
      (CASE WHEN coalesce(v.cell->>'value',v.cell->>'cachedValue') ~ '^[0-9]+(\.0+)?$'
        THEN coalesce(v.cell->>'value',v.cell->>'cachedValue')::numeric END)::bigint
    FROM public.import_batches b
    JOIN public.workbook_source_authorities authority ON authority.batch_id=b.id AND authority.sha256=b.sha256
    JOIN public.import_cells header ON header.batch_id=b.id AND header.sheet='Historical - Adults' AND header.coordinate='P34'
    JOIN public.import_cells v ON v.batch_id=b.id AND v.sheet=header.sheet AND v.coordinate ~ '^P[0-9]+$'
    JOIN public.import_cells d ON d.batch_id=b.id AND d.sheet=v.sheet AND d.coordinate='B' || substring(v.coordinate FROM 2)
    JOIN public.import_cells w ON w.batch_id=b.id AND w.sheet=v.sheet AND w.coordinate='A' || substring(v.coordinate FROM 2)
    WHERE b.state='active' AND header.cell->>'type'='n'
      AND coalesce(header.cell->>'value',header.cell->>'cachedValue') ~ '^2025(\.0+)?$'
      AND v.cell->>'type'='n' AND d.cell->>'type'='n' AND w.cell->>'type'='n'
      AND (CASE WHEN coalesce(v.cell->>'value',v.cell->>'cachedValue') ~ '^[0-9]+(\.0+)?$'
        THEN coalesce(v.cell->>'value',v.cell->>'cachedValue')::numeric END) BETWEEN 0 AND 4294967294
      AND (CASE WHEN coalesce(d.cell->>'value',d.cell->>'cachedValue') ~ '^[0-9]{5}(\.0+)?$'
        THEN coalesce(d.cell->>'value',d.cell->>'cachedValue')::numeric END) = (p_week-date '1899-12-30')
      AND (CASE WHEN coalesce(w.cell->>'value',w.cell->>'cachedValue') ~ '^[0-9]{1,2}(\.0+)?$'
        THEN coalesce(w.cell->>'value',w.cell->>'cachedValue')::numeric END) =
        ((p_week - (date '2026-01-01' + ((7 - EXTRACT(DOW FROM date '2026-01-01')::integer) % 7))) / 7 + 1)
    ORDER BY b.created_at DESC,b.id;
  PERFORM set_config('np.role',caller_role,true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('np.role',coalesce(caller_role,''),true);
  RAISE;
END $$;
-- Custom SQL migration file, put your code below! --