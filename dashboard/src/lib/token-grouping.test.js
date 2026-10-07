import { describe, expect, it } from "vitest";
import {
  TOKEN_FORMAT_MODES,
  TOKEN_GROUPINGS,
  formatTokenCount,
  formatTokenTooltip,
} from "./token-format";

describe("token grouping", () => {
  it("keeps the default three-digit grouping", () => {
    expect(formatTokenCount(12_345_678, { mode: TOKEN_FORMAT_MODES.FULL })).toBe("12,345,678");
  });

  it("uses Chinese four-digit grouping", () => {
    expect(
      formatTokenCount(12_345_678, { mode: TOKEN_FORMAT_MODES.FULL, grouping: TOKEN_GROUPINGS.WAN }),
    ).toBe("1234,5678");
    expect(
      formatTokenCount(123_456_789, { mode: TOKEN_FORMAT_MODES.FULL, grouping: TOKEN_GROUPINGS.WAN }),
    ).toBe("1,2345,6789");
    expect(
      formatTokenCount("12345678", { mode: TOKEN_FORMAT_MODES.FULL, grouping: TOKEN_GROUPINGS.WAN }),
    ).toBe("1234,5678");
  });

  it("applies grouping to the exact value in compact tooltips", () => {
    expect(formatTokenTooltip(12_345_678, { grouping: TOKEN_GROUPINGS.WAN })).toBe("12.3M · 1234,5678");
  });
});
