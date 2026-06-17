import { describe, expect, test } from "vitest";
import { assertUrlAllowed, parseAllowedOrigins } from "./url-policy";

describe("parseAllowedOrigins", () => {
  test("parses a comma-separated origin list", () => {
    expect(parseAllowedOrigins("https://example.com, http://localhost:3000")).toEqual(
      new Set(["https://example.com", "http://localhost:3000"]),
    );
  });
});

describe("assertUrlAllowed", () => {
  test("allows URLs from the configured origin set", async () => {
    await expect(
      assertUrlAllowed("https://example.com/some/path", new Set(["https://example.com"]), false),
    ).resolves.toEqual(new URL("https://example.com/some/path"));
  });

  test("rejects URLs outside the configured origin set", async () => {
    await expect(
      assertUrlAllowed("https://openai.com", new Set(["https://example.com"]), true),
    ).rejects.toThrow(/not allowed/i);
  });

  test("allows explicitly allowlisted localhost for local evals", async () => {
    await expect(
      assertUrlAllowed("http://localhost:3000", new Set(["http://localhost:3000"]), true),
    ).resolves.toEqual(new URL("http://localhost:3000/"));
  });

  test("rejects localhost when it is not explicitly allowlisted", async () => {
    await expect(
      assertUrlAllowed("http://localhost:3000", new Set(["https://example.com"]), true),
    ).rejects.toThrow(/not allowed/i);
  });
});
