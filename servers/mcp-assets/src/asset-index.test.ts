import { describe, expect, test } from "vitest";
import { removeAssetFromIndex } from "./asset-index.js";

describe("removeAssetFromIndex", () => {
  test("removes a deleted asset from every keyword bucket", () => {
    const next = removeAssetFromIndex(
      {
        keywords: {
          hero: ["hero-demo.svg", "obsolete.svg"],
          qlik: ["obsolete.svg"],
          empty: [],
        },
      },
      "obsolete.svg",
    );

    expect(next).toEqual({
      keywords: {
        hero: ["hero-demo.svg"],
      },
    });
  });
});
