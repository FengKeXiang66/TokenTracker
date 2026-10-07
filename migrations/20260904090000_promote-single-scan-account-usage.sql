-- Promote the verified single-scan candidate without copying its large SQL
-- body. Replacing account_usage_grouped_v2 makes its SQL-language binding
-- resolve the promoted function OID; the cached wrapper keeps its own stable
-- OID and therefore needs no recreation or cache-key churn.

ALTER FUNCTION public.account_usage_grouped(
  uuid, uuid[], timestamptz, timestamptz, text, text, integer
) RENAME TO account_usage_grouped_pre_single_scan;

ALTER FUNCTION public.account_usage_grouped_single_scan_candidate(
  uuid, uuid[], timestamptz, timestamptz, text, text, integer
) RENAME TO account_usage_grouped;

CREATE OR REPLACE FUNCTION public.account_usage_grouped_v2(
  p_user_id uuid,
  p_device_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_trunc text,
  p_tz text,
  p_offset_min integer
) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO public, pg_temp
SET statement_timeout TO '8s'
AS $func$
  WITH active AS (
    SELECT COALESCE(array_agg(d.id ORDER BY d.id), ARRAY[]::uuid[]) AS ids
    FROM public.tokentracker_devices d
    WHERE d.user_id = p_user_id AND d.revoked_at IS NULL
  ), scoped AS (
    SELECT ids,
      CASE WHEN p_device_id IS NOT NULL AND p_device_id = ANY(ids)
        THEN ARRAY[p_device_id]::uuid[] ELSE ids END AS selected_ids
    FROM active
  )
  SELECT CASE WHEN cardinality(ids) = 0 THEN '[]'::jsonb
    ELSE public.account_usage_grouped(
      p_user_id, selected_ids, p_from, p_to, p_trunc, p_tz, p_offset_min
    ) END
  FROM scoped
$func$;

DROP FUNCTION public.account_usage_grouped_pre_single_scan(
  uuid, uuid[], timestamptz, timestamptz, text, text, integer
);

REVOKE ALL ON FUNCTION public.account_usage_grouped(
  uuid, uuid[], timestamptz, timestamptz, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage_grouped(
  uuid, uuid[], timestamptz, timestamptz, text, text, integer
) TO project_admin;
REVOKE ALL ON FUNCTION public.account_usage_grouped_v2(
  uuid, uuid, timestamptz, timestamptz, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage_grouped_v2(
  uuid, uuid, timestamptz, timestamptz, text, text, integer
) TO project_admin;
