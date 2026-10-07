-- Operator-confirmed leaderboard manipulation from the 2026-08-21 05:41 UTC scan.
--
-- Keep the account identity out of source control: the evidence predicate
-- selects the one reviewed account that repeatedly submitted the exact same
-- synthetic token-column template under multiple model names. The transaction
-- preserves every hourly row in quarantine before removing leaderboard data
-- and revoking credentials.
DO $ban$
DECLARE
  v_target_users integer;
  v_target_flags integer;
  v_hourly_rows bigint;
  v_quarantined_rows bigint;
  v_deleted_rows bigint;
  v_banned_flags integer;
BEGIN
  LOCK TABLE public.tokentracker_hourly IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE tt_confirmed_template_ban_targets ON COMMIT DROP AS
  SELECT DISTINCT f.user_id
  FROM public.tokentracker_leaderboard_anomaly_flags f
  WHERE f.status = 'review'
    AND f.reviewed_at IS NULL
    AND f.detected_at >= '2026-08-21 05:41:00+00'::timestamptz
    AND f.detected_at <  '2026-08-21 05:42:00+00'::timestamptz
    AND EXISTS (
      SELECT 1
      FROM public.tokentracker_hourly h
      WHERE h.user_id = f.user_id
        AND h.source = 'codex'
        AND h.total_tokens = 713570000
        AND h.input_tokens = 57200000
        AND h.output_tokens = 5720000
        AND h.cached_input_tokens = 650650000
        AND h.cache_creation_input_tokens = 0
        AND h.reasoning_output_tokens = 1430000
      GROUP BY h.user_id
      HAVING count(*) >= 10 AND count(DISTINCT h.model) >= 2
    );

  SELECT count(*) INTO v_target_users FROM tt_confirmed_template_ban_targets;
  SELECT count(*) INTO v_target_flags
  FROM public.tokentracker_leaderboard_anomaly_flags f
  JOIN tt_confirmed_template_ban_targets t USING (user_id)
  WHERE f.status IN ('auto_excluded', 'review');

  IF v_target_users <> 1 OR v_target_flags <> 3 THEN
    RAISE EXCEPTION
      'template ban target drift: expected 1 user/3 flags, got % users/% flags',
      v_target_users, v_target_flags;
  END IF;

  SELECT count(*) INTO v_hourly_rows
  FROM public.tokentracker_hourly h
  JOIN tt_confirmed_template_ban_targets t USING (user_id);

  IF v_hourly_rows = 0 THEN
    RAISE EXCEPTION 'template ban target has no hourly evidence';
  END IF;

  INSERT INTO public.tokentracker_hourly_quarantine (
    user_id, device_id, source, model, hour_start,
    input_tokens, cached_input_tokens, cache_creation_input_tokens,
    output_tokens, reasoning_output_tokens, total_tokens,
    billable_total_tokens, conversations, created_at, updated_at,
    total_cost_usd, quarantined_at, quarantine_reason
  )
  SELECT
    h.user_id, h.device_id, h.source, h.model, h.hour_start,
    h.input_tokens, h.cached_input_tokens, h.cache_creation_input_tokens,
    h.output_tokens, h.reasoning_output_tokens, h.total_tokens,
    h.billable_total_tokens, h.conversations, h.created_at, h.updated_at,
    h.total_cost_usd, clock_timestamp(),
    'confirmed repeated token-template manipulation; operator ban 2026-08-21'
  FROM public.tokentracker_hourly h
  JOIN tt_confirmed_template_ban_targets t USING (user_id);

  GET DIAGNOSTICS v_quarantined_rows = ROW_COUNT;
  IF v_quarantined_rows <> v_hourly_rows THEN
    RAISE EXCEPTION
      'quarantine mismatch: expected %, copied %',
      v_hourly_rows, v_quarantined_rows;
  END IF;

  DELETE FROM public.tokentracker_hourly h
  USING tt_confirmed_template_ban_targets t
  WHERE h.user_id = t.user_id;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

  IF v_deleted_rows <> v_hourly_rows THEN
    RAISE EXCEPTION
      'hourly deletion mismatch: expected %, deleted %',
      v_hourly_rows, v_deleted_rows;
  END IF;

  UPDATE public.tokentracker_device_tokens dt
  SET revoked_at = COALESCE(dt.revoked_at, clock_timestamp())
  FROM tt_confirmed_template_ban_targets t
  WHERE dt.user_id = t.user_id;

  UPDATE public.tokentracker_devices d
  SET revoked_at = COALESCE(d.revoked_at, clock_timestamp())
  FROM tt_confirmed_template_ban_targets t
  WHERE d.user_id = t.user_id;

  DELETE FROM public.tokentracker_leaderboard_rollup_daily r
  USING tt_confirmed_template_ban_targets t
  WHERE r.user_id = t.user_id;

  DELETE FROM public.tokentracker_leaderboard_rollup_daily_v2 r
  USING tt_confirmed_template_ban_targets t
  WHERE r.user_id = t.user_id;

  DELETE FROM public.tokentracker_leaderboard_snapshots s
  USING tt_confirmed_template_ban_targets t
  WHERE s.user_id = t.user_id;

  DELETE FROM public.agentmeter_leaderboard_snapshots s
  USING tt_confirmed_template_ban_targets t
  WHERE s.user_id = t.user_id;

  UPDATE public.tokentracker_leaderboard_anomaly_flags f
  SET status = 'banned',
      reviewed_at = clock_timestamp(),
      note = 'confirmed repeated token-template manipulation; usage quarantined, credentials revoked, and account blocklisted by operator on 2026-08-21'
  FROM tt_confirmed_template_ban_targets t
  WHERE f.user_id = t.user_id
    AND f.status IN ('auto_excluded', 'review');

  GET DIAGNOSTICS v_banned_flags = ROW_COUNT;
  IF v_banned_flags <> v_target_flags THEN
    RAISE EXCEPTION
      'flag transition mismatch: expected %, banned %',
      v_target_flags, v_banned_flags;
  END IF;
END
$ban$;
