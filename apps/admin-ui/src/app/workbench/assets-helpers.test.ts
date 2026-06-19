import { describe, expect, test } from "vitest";
import {
  assetTags,
  buildAssetFolderTree,
  folderIdToPath,
  joinAssetPath,
  splitAssetTags,
} from "./assets-helpers";

describe("asset helpers", () => {
  test("normalizes comma separated tags", () => {
    expect(splitAssetTags(" Beta, alpha, beta ,,QLIK ")).toEqual(["alpha", "beta", "qlik"]);
  });

  test("falls back from tags to legacy keywords", () => {
    expect(assetTags({ tags: ["managed"], keywords: ["legacy"] })).toEqual(["managed"]);
    expect(assetTags({ keywords: ["legacy"] })).toEqual(["legacy"]);
  });

  test("joins upload filenames into the selected folder", () => {
    expect(joinAssetPath("", "logo.svg")).toBe("logo.svg");
    expect(joinAssetPath("/icons/product/", "logo.svg")).toBe("icons/product/logo.svg");
  });

  test("builds a selectable folder tree with a stable root id", () => {
    const nodes = buildAssetFolderTree([
      { path: "icons/data/warehouse.svg" },
      { path: "icons/ui/filter.svg" },
      { path: "hero.svg" },
    ]);

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: "/", label: "/" });
    expect(nodes[0].children?.map((node) => node.id)).toEqual(["icons"]);
    expect(nodes[0].children?.[0].children?.map((node) => node.id)).toEqual([
      "icons/data",
      "icons/ui",
    ]);
    expect(folderIdToPath("/")).toBe("");
    expect(folderIdToPath("icons/data")).toBe("icons/data");
  });
});
