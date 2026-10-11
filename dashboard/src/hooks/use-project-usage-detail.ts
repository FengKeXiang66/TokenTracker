import { useEffect, useState } from "react";
import { isMockEnabled } from "../lib/mock-data";
import { getProjectUsageDetail } from "../lib/api";
import { useLatestRequestGuard } from "./use-latest-request-guard";

// Drill-down data for the Project Usage modal. Local-only endpoint — no
// auth token needed (mirrors the summary hook's local mode) and only
// fetched while a project is actually open (projectKey != null).
export function useProjectUsageDetail({
  projectKey,
  from,
  to,
  timeZone,
  tzOffsetMinutes,
}: any = {}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mockEnabled = isMockEnabled();
  const beginRequest = useLatestRequestGuard([projectKey, from, to, timeZone, tzOffsetMinutes, mockEnabled]);

  useEffect(() => {
    const isCurrent = beginRequest();
    if (!projectKey) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setData(null);
    setError(null);
    getProjectUsageDetail({ projectKey, from, to, timeZone, tzOffsetMinutes })
      .then((res) => {
        if (!isCurrent()) return;
        setData(res || null);
      })
      .catch((err) => {
        if (!isCurrent()) return;
        setError((err as any)?.message || String(err));
        setData(null);
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [projectKey, from, to, timeZone, tzOffsetMinutes, mockEnabled, beginRequest]);

  return { data, loading, error };
}
