import { afterEach, describe, expect, it, vi } from "vitest";
import { toDisplayNumber, toDisplayNumberWithOptions } from "./format";

afterEach(() => vi.restoreAllMocks());

describe("exact number grouping compatibility", () => {
  it("preserves the default formatter precision and special values", () => {
    for (const value of [1.23456, NaN, Infinity, -Infinity, 12345n]) {
      const expected = new Intl.NumberFormat().format(value);
      expect(toDisplayNumber(value)).toBe(expected);
      expect(toDisplayNumberWithOptions(value)).toBe(expected);
    }
  });

  it("preserves special values when four-digit grouping is selected", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(toDisplayNumberWithOptions(value, { groupSize: 4 }))
        .toBe(new Intl.NumberFormat(undefined, { useGrouping: false }).format(value));
    }
  });

  it("disables grouping consistently for bigint, number and numeric strings", () => {
    for (const groupSize of [-1, 0, 1]) {
      for (const value of [12345n, 12345, "12345"]) {
        expect(toDisplayNumberWithOptions(value, { groupSize })).toBe("12345");
      }
    }
  });

  it("falls back safely for invalid group sizes", () => {
    for (const groupSize of [NaN, Infinity, 0.5, -0.5]) {
      expect(toDisplayNumberWithOptions(12345n, { groupSize })).toBe(toDisplayNumber(12345n));
    }
  });

  it("preserves localized grouping, decimal marks and default precision", () => {
    const NumberFormat = Intl.NumberFormat;
    vi.spyOn(Intl, "NumberFormat").mockImplementation(function (locales, options) {
      return new NumberFormat(locales ?? "de-DE", options);
    });
    expect(toDisplayNumber(1234567.23456)).toBe("1.234.567,235");
    expect(toDisplayNumberWithOptions(1234567.23456)).toBe("1.234.567,235");
    expect(toDisplayNumberWithOptions(1234567.23456, { groupSize: 4 })).toBe("123.4567,235");
    expect(toDisplayNumberWithOptions(-12345678n, { groupSize: 4 })).toBe("-1234.5678");
  });
});
