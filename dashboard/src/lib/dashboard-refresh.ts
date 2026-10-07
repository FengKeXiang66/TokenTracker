export const LOCAL_DASHBOARD_REFRESH_OPTIONS = Object.freeze({
  auto: true,
  background: true,
  allLocalSources: true,
});

interface DashboardAggregateRefreshers {
  refreshUsageStats: () => Promise<unknown>;
  refreshUsageLimits: () => Promise<unknown>;
}

// Provider limits can involve several network-bound readers. Start that work
// with the local aggregates, but let the visible dashboard refresh settle as
// soon as local usage is ready.
export async function refreshDashboardAggregates({
  refreshUsageStats,
  refreshUsageLimits,
}: DashboardAggregateRefreshers) {
  const usagePromise = refreshUsageStats();
  void refreshUsageLimits();
  await usagePromise;
}
