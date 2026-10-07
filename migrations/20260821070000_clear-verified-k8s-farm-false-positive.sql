-- Clear the verified multi-node K8s farm caught by the 2026-08-21 05:41 UTC
-- threshold-splitting heuristic. Cleared (user, day) rows are terminal review
-- decisions and the detector deliberately never re-flags them.
DO $clear$
DECLARE
  v_target_users integer;
  v_target_flags integer;
  v_cleared_flags integer;
BEGIN
  CREATE TEMP TABLE tt_verified_k8s_targets ON COMMIT DROP AS
  SELECT f.user_id
  FROM public.tokentracker_leaderboard_anomaly_flags f
  WHERE f.detected_at >= '2026-08-21 05:41:00+00'::timestamptz
    AND f.detected_at <  '2026-08-21 05:42:00+00'::timestamptz
    AND f.status = 'auto_excluded'
    AND f.reviewed_at IS NULL
    AND f.peak_source = 'codex'
    AND f.peak_model = 'gpt-5.6-sol'
    AND f.note LIKE 'automatic threshold-splitting signal:%'
    AND EXISTS (
      SELECT 1
      FROM public.tokentracker_devices d
      WHERE d.user_id = f.user_id
      GROUP BY d.user_id
      HAVING count(*) >= 4
    );

  SELECT count(*) INTO v_target_users FROM tt_verified_k8s_targets;
  SELECT count(*) INTO v_target_flags
  FROM public.tokentracker_leaderboard_anomaly_flags f
  JOIN tt_verified_k8s_targets t USING (user_id)
  WHERE f.detected_at >= '2026-08-21 05:41:00+00'::timestamptz
    AND f.detected_at <  '2026-08-21 05:42:00+00'::timestamptz
    AND f.status IN ('auto_excluded', 'review')
    AND f.reviewed_at IS NULL;

  IF v_target_users <> 1 OR v_target_flags <> 2 THEN
    RAISE EXCEPTION
      'verified K8s target drift: expected 1 user/2 flags, got % users/% flags',
      v_target_users, v_target_flags;
  END IF;

  UPDATE public.tokentracker_leaderboard_anomaly_flags f
  SET status = 'cleared',
      reviewed_at = clock_timestamp(),
      note = 'verified legitimate multi-node K8s agent farm; false positive cleared by operator on 2026-08-21'
  FROM tt_verified_k8s_targets t
  WHERE f.user_id = t.user_id
    AND f.detected_at >= '2026-08-21 05:41:00+00'::timestamptz
    AND f.detected_at <  '2026-08-21 05:42:00+00'::timestamptz
    AND f.status IN ('auto_excluded', 'review')
    AND f.reviewed_at IS NULL;

  GET DIAGNOSTICS v_cleared_flags = ROW_COUNT;
  IF v_cleared_flags <> v_target_flags THEN
    RAISE EXCEPTION
      'verified K8s clear mismatch: expected %, cleared %',
      v_target_flags, v_cleared_flags;
  END IF;
END
$clear$;
