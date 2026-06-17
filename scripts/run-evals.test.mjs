import { describe, expect, test } from "vitest";
import { assertExpectation, normalizeRunBody, readJsonPath } from "./run-evals.mjs";

describe("normalizeRunBody", () => {
  test("decodes JSON text returned by MCP tool content", () => {
    const body = {
      ok: true,
      run: {
        response: {
          content: [{ type: "text", text: "{\"pass\":false,\"counts\":{\"p0\":1}}" }],
        },
      },
    };

    expect(normalizeRunBody(body).run.response).toEqual({ pass: false, counts: { p0: 1 } });
  });

  test("keeps plain MCP text as a string", () => {
    const body = {
      run: {
        response: {
          content: [{ type: "text", text: "ABC" }],
        },
      },
    };

    expect(normalizeRunBody(body).run.response).toBe("ABC");
  });
});

describe("readJsonPath", () => {
  test("reads nested object paths", () => {
    expect(readJsonPath({ run: { response: { pass: false } } }, "run.response.pass")).toBe(false);
  });

  test("reads array indexes", () => {
    expect(readJsonPath({ candidates: [{ slug: "hero" }] }, "candidates.0.slug")).toBe("hero");
  });
});

describe("assertExpectation", () => {
  test("passes when a path equals the expected value", () => {
    expect(
      assertExpectation(
        { run: { response: { pass: false } } },
        { path: "run.response.pass", equals: false },
      ),
    ).toEqual({ ok: true });
  });

  test("fails when a path does not equal the expected value", () => {
    expect(
      assertExpectation(
        { run: { response: { pass: true } } },
        { path: "run.response.pass", equals: false },
      ),
    ).toMatchObject({ ok: false });
  });
});
