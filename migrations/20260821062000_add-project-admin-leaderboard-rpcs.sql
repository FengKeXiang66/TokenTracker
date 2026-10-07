CREATE OR REPLACE FUNCTION public.leaderboard_hourly_dedup_v3(
  p_from timestamptz, p_to timestamptz
) RETURNS TABLE (
  user_id uuid, source text, model text, hour_start timestamptz,
  total_tokens bigint, input_tokens bigint, output_tokens bigint,
  cached_input_tokens bigint, cache_creation_input_tokens bigint,
  reasoning_output_tokens bigint
)
LANGUAGE sql STABLE
AS $func$
  WITH cfg AS (
    SELECT ARRAY['cursor', 'trae-cn']::text[] AS account_sources
  )
  SELECT mac.user_id, mac.source, mac.model, mac.hour_start,
    SUM(mac.total_tokens)::bigint, SUM(mac.input_tokens)::bigint,
    SUM(mac.output_tokens)::bigint, SUM(mac.cached_input_tokens)::bigint,
    SUM(mac.cache_creation_input_tokens)::bigint,
    SUM(mac.reasoning_output_tokens)::bigint
  FROM (
    SELECT DISTINCT ON (
      h.user_id, COALESCE(dm.machine_cluster_id, h.device_id::text),
      h.source, h.model, h.hour_start
    )
      h.user_id, COALESCE(dm.machine_cluster_id, h.device_id::text) AS machine_cluster_id,
      h.source, h.model, h.hour_start, h.total_tokens::bigint AS total_tokens,
      h.input_tokens::bigint AS input_tokens, h.output_tokens::bigint AS output_tokens,
      h.cached_input_tokens::bigint AS cached_input_tokens,
      h.cache_creation_input_tokens::bigint AS cache_creation_input_tokens,
      h.reasoning_output_tokens::bigint AS reasoning_output_tokens
    FROM public.tokentracker_hourly h
    CROSS JOIN cfg
    JOIN public.tokentracker_devices d ON d.id = h.device_id AND d.revoked_at IS NULL
    LEFT JOIN public.tokentracker_device_machine dm ON dm.device_id = h.device_id
    WHERE h.hour_start >= p_from AND h.hour_start < p_to
      AND NOT (h.source = ANY(cfg.account_sources))
    ORDER BY h.user_id, COALESCE(dm.machine_cluster_id, h.device_id::text),
      h.source, h.model, h.hour_start, h.total_tokens DESC, h.updated_at DESC
  ) mac
  GROUP BY mac.user_id, mac.source, mac.model, mac.hour_start

  UNION ALL

  SELECT acct.user_id, acct.source, acct.model, acct.hour_start,
    acct.total_tokens, acct.input_tokens, acct.output_tokens,
    acct.cached_input_tokens, acct.cache_creation_input_tokens,
    acct.reasoning_output_tokens
  FROM (
    SELECT DISTINCT ON (h.user_id, h.source, h.model, h.hour_start)
      h.user_id, h.source, h.model, h.hour_start,
      h.total_tokens::bigint AS total_tokens, h.input_tokens::bigint AS input_tokens,
      h.output_tokens::bigint AS output_tokens,
      h.cached_input_tokens::bigint AS cached_input_tokens,
      h.cache_creation_input_tokens::bigint AS cache_creation_input_tokens,
      h.reasoning_output_tokens::bigint AS reasoning_output_tokens
    FROM public.tokentracker_hourly h
    WHERE h.hour_start >= p_from AND h.hour_start < p_to AND h.source = 'cursor'
    ORDER BY h.user_id, h.source, h.model, h.hour_start, h.total_tokens DESC, h.updated_at DESC
  ) acct

  UNION ALL

  SELECT s.user_id, s.source, s.model, s.bucket_start,
    SUM(s.total_tokens)::bigint, SUM(s.input_tokens)::bigint,
    SUM(s.output_tokens)::bigint, SUM(s.cached_input_tokens)::bigint,
    SUM(s.cache_creation_input_tokens)::bigint,
    SUM(s.reasoning_output_tokens)::bigint
  FROM public.tokentracker_account_session_states s
  WHERE s.bucket_start >= p_from AND s.bucket_start < p_to AND s.source = 'trae-cn'
  GROUP BY s.user_id, s.source, s.model, s.bucket_start
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_hourly_dedup_v3(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leaderboard_hourly_dedup_v3(timestamptz, timestamptz)
  TO project_admin;

CREATE OR REPLACE FUNCTION public.leaderboard_rollup_daily_replace_v3(
  p_from timestamptz, p_to timestamptz
) RETURNS void
LANGUAGE plpgsql
SET work_mem TO '16MB'
SET hash_mem_multiplier TO '2'
SET statement_timeout TO '25s'
AS $func$
DECLARE v_day timestamptz;
BEGIN
  v_day := date_trunc('day', p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  WHILE v_day < p_to LOOP
    DELETE FROM public.tokentracker_leaderboard_rollup_daily_v2
    WHERE day = (v_day AT TIME ZONE 'UTC')::date;
    INSERT INTO public.tokentracker_leaderboard_rollup_daily_v2 (
      user_id, source, model, day, total_tokens, input_tokens, output_tokens,
      cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
    )
    SELECT d.user_id, d.source, d.model,
      (d.hour_start AT TIME ZONE 'UTC')::date,
      SUM(d.total_tokens), SUM(d.input_tokens), SUM(d.output_tokens),
      SUM(d.cached_input_tokens), SUM(d.cache_creation_input_tokens),
      SUM(d.reasoning_output_tokens)
    FROM public.leaderboard_hourly_dedup_v3(v_day, v_day + interval '1 day') d
    GROUP BY d.user_id, d.source, d.model, (d.hour_start AT TIME ZONE 'UTC')::date;
    v_day := v_day + interval '1 day';
  END LOOP;
END
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_rollup_daily_replace_v3(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leaderboard_rollup_daily_replace_v3(timestamptz, timestamptz)
  TO project_admin;

CREATE OR REPLACE FUNCTION public.leaderboard_rollup_daily_advance_v3()
RETURNS void
LANGUAGE plpgsql
SET work_mem TO '16MB'
SET hash_mem_multiplier TO '2'
SET statement_timeout TO '25s'
AS $func$
DECLARE
  v_from timestamptz;
  v_target timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_until timestamptz;
  v_min_day date;
  v_repair_from date;
  v_seed_gap_day date;
BEGIN
  SELECT (date_trunc('day', MIN(h.hour_start) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::date
  INTO v_min_day FROM public.tokentracker_hourly h;
  v_min_day := COALESCE(v_min_day, (v_target AT TIME ZONE 'UTC')::date);

  SELECT m.through, m.repair_from INTO v_from, v_repair_from
  FROM public.tokentracker_leaderboard_rollup_meta_v2 m WHERE m.id = 1 FOR UPDATE;
  IF v_from IS NULL THEN
    v_from := v_min_day::timestamp AT TIME ZONE 'UTC';
    v_repair_from := v_min_day;
    INSERT INTO public.tokentracker_leaderboard_rollup_meta_v2
      (id, through, repair_from, rebuilt_at)
    VALUES (1, v_from, v_repair_from, now());
  END IF;
  IF v_from < v_target THEN
    v_until := LEAST(v_target, v_from + interval '7 days');
    PERFORM public.leaderboard_rollup_daily_replace_v3(v_from, v_until);
    UPDATE public.tokentracker_leaderboard_rollup_meta_v2
    SET through = v_until, rebuilt_at = now() WHERE id = 1;
    RETURN;
  END IF;
  IF v_repair_from >= (v_target AT TIME ZONE 'UTC')::date THEN
    v_repair_from := v_min_day;
  END IF;
  SELECT MIN((s.bucket_start AT TIME ZONE 'UTC')::date) INTO v_seed_gap_day
  FROM public.tokentracker_account_session_states s
  WHERE s.source = 'trae-cn'
    AND (s.bucket_start AT TIME ZONE 'UTC')::date < (v_target AT TIME ZONE 'UTC')::date
    AND NOT EXISTS (
      SELECT 1 FROM public.tokentracker_leaderboard_rollup_daily_v2 r
      WHERE r.user_id = s.user_id AND r.source = 'trae-cn'
        AND r.day = (s.bucket_start AT TIME ZONE 'UTC')::date
    );
  IF v_seed_gap_day IS NOT NULL THEN v_repair_from := v_seed_gap_day; END IF;
  v_until := LEAST(v_target,
    (v_repair_from::timestamp AT TIME ZONE 'UTC') + interval '7 days');
  PERFORM public.leaderboard_rollup_daily_replace_v3(
    v_repair_from::timestamp AT TIME ZONE 'UTC', v_until
  );
  UPDATE public.tokentracker_leaderboard_rollup_meta_v2
  SET repair_from = CASE WHEN v_until >= v_target THEN v_min_day
      ELSE (v_until AT TIME ZONE 'UTC')::date END, rebuilt_at = now()
  WHERE id = 1;
END
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_rollup_daily_advance_v3()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leaderboard_rollup_daily_advance_v3() TO project_admin;

CREATE OR REPLACE FUNCTION public.leaderboard_usage_grouped_v3(
  p_from timestamptz, p_to timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET work_mem TO '96MB'
SET hash_mem_multiplier TO '4'
SET statement_timeout TO '25s'
AS $func$
DECLARE v_through timestamptz; v_cut timestamptz; v_result jsonb;
BEGIN
  SELECT m.through INTO v_through
  FROM public.tokentracker_leaderboard_rollup_meta_v2 m WHERE m.id = 1;
  v_cut := date_trunc('day', LEAST(v_through, p_to) AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  IF v_through IS NOT NULL
     AND p_from = (date_trunc('day', p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
     AND v_cut > p_from THEN
    SELECT jsonb_agg(to_jsonb(x.*) ORDER BY x.user_id, x.source, x.model) INTO v_result
    FROM (
      SELECT u.user_id, u.source, u.model, SUM(u.total_tokens)::bigint total_tokens,
        SUM(u.input_tokens)::bigint input_tokens, SUM(u.output_tokens)::bigint output_tokens,
        SUM(u.cached_input_tokens)::bigint cached_input_tokens,
        SUM(u.cache_creation_input_tokens)::bigint cache_creation_input_tokens,
        SUM(u.reasoning_output_tokens)::bigint reasoning_output_tokens
      FROM (
        SELECT r.user_id, r.source, r.model, r.total_tokens, r.input_tokens,
          r.output_tokens, r.cached_input_tokens, r.cache_creation_input_tokens,
          r.reasoning_output_tokens
        FROM public.tokentracker_leaderboard_rollup_daily_v2 r
        WHERE r.day >= (p_from AT TIME ZONE 'UTC')::date
          AND r.day < (v_cut AT TIME ZONE 'UTC')::date
        UNION ALL
        SELECT t.user_id, t.source, t.model, t.total_tokens, t.input_tokens,
          t.output_tokens, t.cached_input_tokens, t.cache_creation_input_tokens,
          t.reasoning_output_tokens
        FROM public.leaderboard_hourly_dedup_v3(v_cut, p_to) t
      ) u GROUP BY u.user_id, u.source, u.model
    ) x;
  ELSE
    SELECT jsonb_agg(to_jsonb(x.*) ORDER BY x.user_id, x.source, x.model) INTO v_result
    FROM (
      SELECT d.user_id, d.source, d.model, SUM(d.total_tokens)::bigint total_tokens,
        SUM(d.input_tokens)::bigint input_tokens, SUM(d.output_tokens)::bigint output_tokens,
        SUM(d.cached_input_tokens)::bigint cached_input_tokens,
        SUM(d.cache_creation_input_tokens)::bigint cache_creation_input_tokens,
        SUM(d.reasoning_output_tokens)::bigint reasoning_output_tokens
      FROM public.leaderboard_hourly_dedup_v3(p_from, p_to) d
      GROUP BY d.user_id, d.source, d.model
    ) x;
  END IF;
  RETURN COALESCE(v_result, '[]'::jsonb);
END
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_usage_grouped_v3(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leaderboard_usage_grouped_v3(timestamptz, timestamptz)
  TO project_admin;
