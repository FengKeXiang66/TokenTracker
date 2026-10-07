import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrendMonitorZoomModal } from "./TrendMonitorZoomModal.jsx";

vi.mock("../../../hooks/use-trend-data", () => ({
  useTrendData: () => ({ rows: [], from: null, to: null, loading: false }),
}));

vi.mock("./DateRangePopover.jsx", () => ({
  DateRangePopover: () => null,
}));

describe("TrendMonitorZoomModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderModal(onClose) {
    return render(
      <TrendMonitorZoomModal
        zoomConfig={{ now: new Date("2026-09-01T10:00:00.000Z") }}
        period="month"
        from="2026-08-01"
        to="2026-09-01"
        timeZoneLabel="UTC"
        onClose={onClose}
        renderChart={() => null}
      />,
    );
  }

  it("finishes closing when CSS animationend is not delivered", () => {
    const onClose = vi.fn();
    renderModal(onClose);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("finishes once when the exit animation completes normally", () => {
    const onClose = vi.fn();
    const { container } = renderModal(onClose);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    const overlay = container.querySelector(".fixed.inset-0");
    expect(overlay).not.toBeNull();
    fireEvent.animationEnd(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(250));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
