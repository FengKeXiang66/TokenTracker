import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_DASHBOARD_REFRESH_OPTIONS,
  refreshDashboardAggregates,
} from "./dashboard-refresh";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("dashboard refresh", () => {
  it("uses the bounded all-local sync profile", () => {
    expect(LOCAL_DASHBOARD_REFRESH_OPTIONS).toEqual({
      auto: true,
      background: true,
      allLocalSources: true,
    });
  });

  it("does not keep the visible refresh waiting for provider limits", async () => {
    const usage = deferred();
    const limits = deferred();
    const refreshUsageStats = vi.fn(() => usage.promise);
    const refreshUsageLimits = vi.fn(() => limits.promise);

    const refresh = refreshDashboardAggregates({ refreshUsageStats, refreshUsageLimits });
    expect(refreshUsageStats).toHaveBeenCalledOnce();
    expect(refreshUsageLimits).toHaveBeenCalledOnce();

    let settled = false;
    void refresh.then(() => {
      settled = true;
    });
    usage.resolve();
    await refresh;
    expect(settled).toBe(true);

    // The quota request is deliberately still pending at this point.
    limits.resolve();
  });
});
