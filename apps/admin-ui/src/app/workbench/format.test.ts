import { describe, expect, it } from "vitest";
import { formatDateTime, formatFileTimestamp, formatLatency, prettyJson } from "./format";

describe("workbench formatting", () => {
  it("formats run timestamps deterministically for SSR and hydration", () => {
    expect(formatDateTime("2026-06-17T12:42:00.000Z")).toBe("Jun 17, 12:42");
  });

  it("formats file mtimes deterministically from epoch milliseconds", () => {
    expect(formatFileTimestamp(Date.UTC(2026, 5, 17, 8, 40))).toBe("Jun 17, 08:40");
  });

  it("formats latency and json consistently", () => {
    expect(formatLatency(null)).toBe("n/a");
    expect(formatLatency(250)).toBe("250 ms");
    expect(formatLatency(1250)).toBe("1.3 s");
    expect(prettyJson({ ok: true })).toBe("{\n  \"ok\": true\n}");
  });
});
