-- The public total leaderboard used to regroup every closed-day rollup row on
-- every refresh. By 2026-09-04 that meant 421k daily rows -> 54k model groups,
-- and the JSON RPC repeatedly exceeded its 25s edge/database budget (#575).
--
-- Keep an all-time aggregate keyed by the exact dimensions required for edge
-- pricing. Statement-level transition-table triggers apply every closed-day
-- repair incrementally, so the online total refresh reads the compact aggregate
-- plus only the current live tail. Bounded week/month requests retain the daily
-- rollup path and therefore preserve their existing date semantics.

CREATE TABLE IF NOT EXISTS public.tokentracker_leaderboard_rollup_total_v2 (
  user_id uuid NOT NULL,
  source text NOT NULL,
  model text NOT NULL,
  pricing_tier text NOT NULL,
  total_tokens bigint NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  cached_input_tokens bigint NOT NULL DEFAULT 0,
  cache_creation_input_tokens bigint NOT NULL DEFAULT 0,
  reasoning_output_tokens bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, source, model, pricing_tier)
);

ALTER TABLE public.tokentracker_leaderboard_rollup_total_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tokentracker_leaderboard_rollup_total_v2
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tokentracker_leaderboard_rollup_total_v2 TO project_admin;

-- Close the backfill/trigger installation race: no closed-day writer may
-- commit between the snapshot used below and the trigger creation later in
-- this transaction.
LOCK TABLE public.tokentracker_leaderboard_rollup_daily_v2
  IN SHARE ROW EXCLUSIVE MODE;

TRUNCATE public.tokentracker_leaderboard_rollup_total_v2;
INSERT INTO public.tokentracker_leaderboard_rollup_total_v2 (
  user_id, source, model, pricing_tier,
  total_tokens, input_tokens, output_tokens,
  cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
)
SELECT
  user_id, source, model, pricing_tier,
  SUM(total_tokens)::bigint,
  SUM(input_tokens)::bigint,
  SUM(output_tokens)::bigint,
  SUM(cached_input_tokens)::bigint,
  SUM(cache_creation_input_tokens)::bigint,
  SUM(reasoning_output_tokens)::bigint
FROM public.tokentracker_leaderboard_rollup_daily_v2
GROUP BY user_id, source, model, pricing_tier;

CREATE OR REPLACE FUNCTION public.leaderboard_rollup_total_v2_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $func$
BEGIN
  INSERT INTO public.tokentracker_leaderboard_rollup_total_v2 AS total (
    user_id, source, model, pricing_tier,
    total_tokens, input_tokens, output_tokens,
    cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
  )
  SELECT
    user_id, source, model, pricing_tier,
    SUM(total_tokens)::bigint,
    SUM(input_tokens)::bigint,
    SUM(output_tokens)::bigint,
    SUM(cached_input_tokens)::bigint,
    SUM(cache_creation_input_tokens)::bigint,
    SUM(reasoning_output_tokens)::bigint
  FROM new_rows
  GROUP BY user_id, source, model, pricing_tier
  ON CONFLICT (user_id, source, model, pricing_tier) DO UPDATE SET
    total_tokens = total.total_tokens + EXCLUDED.total_tokens,
    input_tokens = total.input_tokens + EXCLUDED.input_tokens,
    output_tokens = total.output_tokens + EXCLUDED.output_tokens,
    cached_input_tokens = total.cached_input_tokens + EXCLUDED.cached_input_tokens,
    cache_creation_input_tokens = total.cache_creation_input_tokens
      + EXCLUDED.cache_creation_input_tokens,
    reasoning_output_tokens = total.reasoning_output_tokens
      + EXCLUDED.reasoning_output_tokens;
  RETURN NULL;
END
$func$;

CREATE OR REPLACE FUNCTION public.leaderboard_rollup_total_v2_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $func$
BEGIN
  UPDATE public.tokentracker_leaderboard_rollup_total_v2 AS total
  SET
    total_tokens = total.total_tokens - removed.total_tokens,
    input_tokens = total.input_tokens - removed.input_tokens,
    output_tokens = total.output_tokens - removed.output_tokens,
    cached_input_tokens = total.cached_input_tokens - removed.cached_input_tokens,
    cache_creation_input_tokens = total.cache_creation_input_tokens
      - removed.cache_creation_input_tokens,
    reasoning_output_tokens = total.reasoning_output_tokens
      - removed.reasoning_output_tokens
  FROM (
    SELECT
      user_id, source, model, pricing_tier,
      SUM(total_tokens)::bigint AS total_tokens,
      SUM(input_tokens)::bigint AS input_tokens,
      SUM(output_tokens)::bigint AS output_tokens,
      SUM(cached_input_tokens)::bigint AS cached_input_tokens,
      SUM(cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
      SUM(reasoning_output_tokens)::bigint AS reasoning_output_tokens
    FROM old_rows
    GROUP BY user_id, source, model, pricing_tier
  ) AS removed
  WHERE total.user_id = removed.user_id
    AND total.source = removed.source
    AND total.model = removed.model
    AND total.pricing_tier = removed.pricing_tier;

  DELETE FROM public.tokentracker_leaderboard_rollup_total_v2
  WHERE total_tokens = 0
    AND input_tokens = 0
    AND output_tokens = 0
    AND cached_input_tokens = 0
    AND cache_creation_input_tokens = 0
    AND reasoning_output_tokens = 0;
  RETURN NULL;
END
$func$;

CREATE OR REPLACE FUNCTION public.leaderboard_rollup_total_v2_after_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $func$
BEGIN
  UPDATE public.tokentracker_leaderboard_rollup_total_v2 AS total
  SET
    total_tokens = total.total_tokens - removed.total_tokens,
    input_tokens = total.input_tokens - removed.input_tokens,
    output_tokens = total.output_tokens - removed.output_tokens,
    cached_input_tokens = total.cached_input_tokens - removed.cached_input_tokens,
    cache_creation_input_tokens = total.cache_creation_input_tokens
      - removed.cache_creation_input_tokens,
    reasoning_output_tokens = total.reasoning_output_tokens
      - removed.reasoning_output_tokens
  FROM (
    SELECT
      user_id, source, model, pricing_tier,
      SUM(total_tokens)::bigint AS total_tokens,
      SUM(input_tokens)::bigint AS input_tokens,
      SUM(output_tokens)::bigint AS output_tokens,
      SUM(cached_input_tokens)::bigint AS cached_input_tokens,
      SUM(cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
      SUM(reasoning_output_tokens)::bigint AS reasoning_output_tokens
    FROM old_rows
    GROUP BY user_id, source, model, pricing_tier
  ) AS removed
  WHERE total.user_id = removed.user_id
    AND total.source = removed.source
    AND total.model = removed.model
    AND total.pricing_tier = removed.pricing_tier;

  INSERT INTO public.tokentracker_leaderboard_rollup_total_v2 AS total (
    user_id, source, model, pricing_tier,
    total_tokens, input_tokens, output_tokens,
    cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens
  )
  SELECT
    user_id, source, model, pricing_tier,
    SUM(total_tokens)::bigint,
    SUM(input_tokens)::bigint,
    SUM(output_tokens)::bigint,
    SUM(cached_input_tokens)::bigint,
    SUM(cache_creation_input_tokens)::bigint,
    SUM(reasoning_output_tokens)::bigint
  FROM new_rows
  GROUP BY user_id, source, model, pricing_tier
  ON CONFLICT (user_id, source, model, pricing_tier) DO UPDATE SET
    total_tokens = total.total_tokens + EXCLUDED.total_tokens,
    input_tokens = total.input_tokens + EXCLUDED.input_tokens,
    output_tokens = total.output_tokens + EXCLUDED.output_tokens,
    cached_input_tokens = total.cached_input_tokens + EXCLUDED.cached_input_tokens,
    cache_creation_input_tokens = total.cache_creation_input_tokens
      + EXCLUDED.cache_creation_input_tokens,
    reasoning_output_tokens = total.reasoning_output_tokens
      + EXCLUDED.reasoning_output_tokens;

  DELETE FROM public.tokentracker_leaderboard_rollup_total_v2
  WHERE total_tokens = 0
    AND input_tokens = 0
    AND output_tokens = 0
    AND cached_input_tokens = 0
    AND cache_creation_input_tokens = 0
    AND reasoning_output_tokens = 0;
  RETURN NULL;
END
$func$;

DROP TRIGGER IF EXISTS tokentracker_leaderboard_rollup_daily_v2_total_insert
  ON public.tokentracker_leaderboard_rollup_daily_v2;
CREATE TRIGGER tokentracker_leaderboard_rollup_daily_v2_total_insert
AFTER INSERT ON public.tokentracker_leaderboard_rollup_daily_v2
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.leaderboard_rollup_total_v2_after_insert();

DROP TRIGGER IF EXISTS tokentracker_leaderboard_rollup_daily_v2_total_delete
  ON public.tokentracker_leaderboard_rollup_daily_v2;
CREATE TRIGGER tokentracker_leaderboard_rollup_daily_v2_total_delete
AFTER DELETE ON public.tokentracker_leaderboard_rollup_daily_v2
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.leaderboard_rollup_total_v2_after_delete();

DROP TRIGGER IF EXISTS tokentracker_leaderboard_rollup_daily_v2_total_update
  ON public.tokentracker_leaderboard_rollup_daily_v2;
CREATE TRIGGER tokentracker_leaderboard_rollup_daily_v2_total_update
AFTER UPDATE ON public.tokentracker_leaderboard_rollup_daily_v2
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.leaderboard_rollup_total_v2_after_update();

REVOKE ALL ON FUNCTION public.leaderboard_rollup_total_v2_after_insert()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leaderboard_rollup_total_v2_after_delete()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.leaderboard_rollup_total_v2_after_update()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.leaderboard_usage_grouped(
  p_from timestamptz,
  p_to timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO public, pg_temp
SET work_mem TO '96MB'
SET hash_mem_multiplier TO '4'
SET statement_timeout TO '25s'
AS $func$
DECLARE
  v_through timestamptz;
  v_cut timestamptz;
  v_base jsonb;
BEGIN
  SELECT m.through INTO v_through
  FROM public.tokentracker_leaderboard_rollup_meta_v2 m
  WHERE m.id = 1;
  v_cut := date_trunc(
    'day',
    LEAST(v_through, p_to) AT TIME ZONE 'UTC'
  ) AT TIME ZONE 'UTC';

  IF v_through IS NOT NULL
     AND p_from = date_trunc('day', p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
     AND v_cut > p_from THEN
    IF p_from = TIMESTAMPTZ '1970-01-01 00:00:00+00'
       AND p_to >= v_through THEN
      -- The all-time period is the only caller allowed to use the aggregate
      -- without a day predicate. It still merges the open live tail so today
      -- remains current before the next closed-day rollup advance.
      SELECT COALESCE(jsonb_agg(to_jsonb(per_usm.*)), '[]'::jsonb)
      INTO v_base
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
          UNION ALL
          SELECT
            t.user_id, t.source, t.model,
            public.leaderboard_pricing_tier(t.model, t.hour_start) AS pricing_tier,
            t.total_tokens, t.input_tokens, t.output_tokens,
            t.cached_input_tokens, t.cache_creation_input_tokens,
            t.reasoning_output_tokens
          FROM public.leaderboard_hourly_dedup_v2(v_cut, p_to) t
        ) u
        GROUP BY u.user_id, u.source, u.model, u.pricing_tier
      ) per_usm;
    ELSE
      SELECT COALESCE(jsonb_agg(to_jsonb(per_usm.*)), '[]'::jsonb)
      INTO v_base
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
          FROM public.tokentracker_leaderboard_rollup_daily_v2 r
          WHERE r.day >= (p_from AT TIME ZONE 'UTC')::date
            AND r.day < (v_cut AT TIME ZONE 'UTC')::date
          UNION ALL
          SELECT
            t.user_id, t.source, t.model,
            public.leaderboard_pricing_tier(t.model, t.hour_start) AS pricing_tier,
            t.total_tokens, t.input_tokens, t.output_tokens,
            t.cached_input_tokens, t.cache_creation_input_tokens,
            t.reasoning_output_tokens
          FROM public.leaderboard_hourly_dedup_v2(v_cut, p_to) t
        ) u
        GROUP BY u.user_id, u.source, u.model, u.pricing_tier
      ) per_usm;
    END IF;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(per_usm.*)), '[]'::jsonb)
    INTO v_base
    FROM (
      SELECT
        d.user_id, d.source, d.model,
        public.leaderboard_pricing_tier(d.model, d.hour_start) AS pricing_tier,
        SUM(d.total_tokens)::bigint AS total_tokens,
        SUM(d.input_tokens)::bigint AS input_tokens,
        SUM(d.output_tokens)::bigint AS output_tokens,
        SUM(d.cached_input_tokens)::bigint AS cached_input_tokens,
        SUM(d.cache_creation_input_tokens)::bigint AS cache_creation_input_tokens,
        SUM(d.reasoning_output_tokens)::bigint AS reasoning_output_tokens
      FROM public.leaderboard_hourly_dedup_v2(p_from, p_to) d
      GROUP BY
        d.user_id, d.source, d.model,
        public.leaderboard_pricing_tier(d.model, d.hour_start)
    ) per_usm;
  END IF;

  RETURN COALESCE(v_base, '[]'::jsonb);
END
$func$;

REVOKE ALL ON FUNCTION public.leaderboard_usage_grouped(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leaderboard_usage_grouped(timestamptz, timestamptz)
  TO project_admin;

ANALYZE public.tokentracker_leaderboard_rollup_total_v2;
