import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getProjectUsageDetail } from "../lib/api";
import { useProjectUsageDetail } from "./use-project-usage-detail";

vi.mock("../lib/api", () => ({ getProjectUsageDetail: vi.fn() }));
vi.mock("../lib/mock-data", () => ({ isMockEnabled: () => false }));

afterEach(() => { vi.clearAllMocks(); });

it("reloads for a new range and rejects an older range's late response", async () => {
  let resolveOld: (value: any) => void = () => {};
  const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
  vi.mocked(getProjectUsageDetail).mockReturnValueOnce(oldResponse as any).mockResolvedValueOnce({ from: "2026-07-08", total_tokens: 100 } as any);
  const { result, rerender } = renderHook(({ from }) => useProjectUsageDetail({ projectKey: "acme/alpha", from, to: "2026-07-31" }), { initialProps: { from: "2026-07-01" } });
  rerender({ from: "2026-07-08" });
  await waitFor(() => expect(result.current.data).toEqual({ from: "2026-07-08", total_tokens: 100 }));
  await act(async () => { resolveOld({ from: "2026-07-01", total_tokens: 1000 }); });
  expect(result.current.data).toEqual({ from: "2026-07-08", total_tokens: 100 });
  expect(getProjectUsageDetail).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-07-08" }));
});
