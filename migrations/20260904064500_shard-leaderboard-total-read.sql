-- The trigger-maintained total rollup removes the 421k-row regroup, but one
-- 52k-row JSON response still exceeds the Edge database client's fixed 10s
-- request timeout. Split only the all-time read into UUID ranges. Each
-- range remains independently complete for its users, so Edge can concatenate
-- the responses and keep its single canonical pricing implementation.

CREATE OR REPLACE FUNCTION public.leaderboard_usage_grouped_total_shard(
  p_to timestamptz,
  p_user_from uuid,
  p_user_to uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO public, pg_temp
SET work_mem TO '48MB'
SET hash_mem_multiplier TO '2'
SET statement_timeout TO '8s'
AS $func$
DECLARE
  v_through timestamptz;
  v_cut timestamptz;
  v_result jsonb;
BEGIN
  SELECT m.through INTO v_through
  FROM public.tokentracker_leaderboard_rollup_meta_v2 m
  WHERE m.id = 1;

  IF v_through IS NULL THEN
    RAISE EXCEPTION 'leaderboard v2 rollup is not initialized';
  END IF;

  v_cut := date_trunc(
    'day',
    LEAST(v_through, p_to) AT TIME ZONE 'UTC'
  ) AT TIME ZONE 'UTC';

  SELECT COALESCE(jsonb_agg(to_jsonb(per_usm.*)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      u.user_id, u.source, u.model, u.pricing_tier,
      SUM(u.total_tokens)::bigint AS total_tokens,
      SUM(u.input_tokens)::bigint AS input_tokens,
      SUM(u.output_tokens)::bigint AS output_tokens,
      SUM(u.cached_input_tokens)::bigint AS cached_input_tokens,
      SUM(u.cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
      SUM(u.reasoning_output_tokens)::bigint AS reasoning_output_tokens
    FROM (
      SELECT
        r.user_id, r.source, r.model, r.pricing_tier,
        r.total_tokens, r.input_tokens, r.output_tokens,
        r.cached_input_tokens, r.cache_creation_input_tokens,
        r.reasoning_output_tokens
      FROM public.tokentracker_leaderboard_rollup_total_v2 r
      WHERE (p_user_from IS NULL OR r.user_id >= p_user_from)
        AND (p_user_to IS NULL OR r.user_id < p_user_to)

      UNION ALL

      SELECT
        t.user_id, t.source, t.model,
        public.leaderboard_pricing_tier(t.model, t.hour_start) AS pricing_tier,
        t.total_tokens, t.input_tokens, t.output_tokens,
        t.cached_input_tokens, t.cache_creation_input_tokens,
        t.reasoning_output_tokens
      FROM public.leaderboard_hourly_dedup_v2(v_cut, p_to) t
      WHERE (p_user_from IS NULL OR t.user_id >= p_user_from)
        AND (p_user_to IS NULL OR t.user_id < p_user_to)
    ) u
    GROUP BY u.user_id, u.source, u.model, u.pricing_tier
  ) per_usm;

  RETURN COALESCE(v_result, '[]'::jsonb);
END
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_usage_grouped_total_shard(
  timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_usage_grouped_total_shard(
  timestamptz, uuid, uuid
) TO project_admin;
