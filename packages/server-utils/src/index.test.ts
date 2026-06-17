import { describe, expect, test } from "vitest";
import { decodeMcpTextJson, parseBase64Strict, safePathUnder } from "./index";

describe("safePathUnder", () => {
  test("normalizes a relative path inside the configured root", () => {
    expect(safePathUnder("/data/storage", "docs/example.md")).toBe("/data/storage/docs/example.md");
  });

  test("rejects parent traversal outside the configured root", () => {
    expect(() => safePathUnder("/data/storage", "../secret.txt")).toThrow(/invalid path/i);
  });

  test("rejects absolute traversal outside the configured root", () => {
    expect(() => safePathUnder("/data/storage", "/../secret.txt")).toThrow(/invalid path/i);
  });
});

describe("parseBase64Strict", () => {
  test("decodes valid base64 and returns bytes", () => {
    expect(parseBase64Strict("aGVsbG8=").toString("utf8")).toBe("hello");
  });

  test("rejects malformed base64 instead of silently decoding it", () => {
    expect(() => parseBase64Strict("not base64!")).toThrow(/invalid base64/i);
  });

  test("rejects payloads larger than the configured limit", () => {
    expect(() => parseBase64Strict("aGVsbG8=", 3)).toThrow(/too large/i);
  });
});

describe("decodeMcpTextJson", () => {
  test("decodes JSON text content from an MCP tool response", () => {
    expect(
      decodeMcpTextJson({
        content: [{ type: "text", text: "{\"ok\":true,\"count\":2}" }],
      }),
    ).toEqual({ ok: true, count: 2 });
  });

  test("keeps non-JSON text content as text", () => {
    expect(decodeMcpTextJson({ content: [{ type: "text", text: "plain" }] })).toEqual("plain");
  });

  test("returns the original value when no MCP text content is present", () => {
    const value = { ok: true };
    expect(decodeMcpTextJson(value)).toBe(value);
  });
});
