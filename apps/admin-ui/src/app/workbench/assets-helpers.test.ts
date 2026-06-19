import { describe, expect, test } from "vitest";
import {
  IMAGE_LIBRARY_NODE_ID,
  TEMPLATE_LIBRARY_NODE_ID,
  assetTags,
  buildAssetFolderTree,
  formatAssetFolderPath,
  folderIdToPath,
  joinAssetPath,
  pathToFolderId,
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

  test("joins upload filenames into the selected storage folder", () => {
    expect(joinAssetPath("", "logo.svg")).toBe("logo.svg");
    expect(joinAssetPath("/icons/product/", "logo.svg")).toBe("icons/product/logo.svg");
    expect(joinAssetPath("templates/markdown", "release-notes.md")).toBe(
      "templates/markdown/release-notes.md",
    );
  });

  test("builds virtual Images and Templates roots without moving image paths", () => {
    const nodes = buildAssetFolderTree([
      { path: "icons/data/warehouse.svg" },
      { path: "icons/ui/filter.svg" },
      { path: "hero.svg" },
      { path: "templates/markdown/release-notes.md" },
      { path: "templates/office/powerpoint/sales-deck.pptx" },
      { path: "templates/web/dashboard.html" },
    ]);

    expect(nodes.map((node) => [node.id, node.label])).toEqual([
      [IMAGE_LIBRARY_NODE_ID, "Images"],
      [TEMPLATE_LIBRARY_NODE_ID, "Templates"],
    ]);

    const images = nodes[0];
    const templates = nodes[1];

    expect(images.children?.map((node) => node.id)).toEqual(["icons"]);
    expect(images.children?.[0].children?.map((node) => node.id)).toEqual([
      "icons/data",
      "icons/ui",
    ]);

    expect(templates.children?.map((node) => [node.id, node.label])).toEqual([
      ["templates/markdown", "Markdown"],
      ["templates/office", "Office"],
      ["templates/web", "Web"],
    ]);
    expect(templates.children?.[1].children?.map((node) => [node.id, node.label])).toEqual([
      ["templates/office/word", "Word"],
      ["templates/office/powerpoint", "PowerPoint"],
    ]);

    expect(JSON.stringify(images)).not.toContain("templates");
  });

  test("maps virtual folder ids to storage paths and user-facing labels", () => {
    expect(folderIdToPath(IMAGE_LIBRARY_NODE_ID)).toBe("");
    expect(folderIdToPath(TEMPLATE_LIBRARY_NODE_ID)).toBe("templates");
    expect(folderIdToPath("icons/data")).toBe("icons/data");
    expect(folderIdToPath("templates/office/powerpoint")).toBe(
      "templates/office/powerpoint",
    );

    expect(pathToFolderId("")).toBe(IMAGE_LIBRARY_NODE_ID);
    expect(pathToFolderId("templates")).toBe(TEMPLATE_LIBRARY_NODE_ID);
    expect(pathToFolderId("icons/data")).toBe("icons/data");
    expect(pathToFolderId("templates/markdown")).toBe("templates/markdown");

    expect(formatAssetFolderPath("")).toBe("Images");
    expect(formatAssetFolderPath("icons/data")).toBe("Images/icons/data");
    expect(formatAssetFolderPath("templates")).toBe("Templates");
    expect(formatAssetFolderPath("templates/markdown")).toBe("Templates/Markdown");
    expect(formatAssetFolderPath("templates/office/powerpoint")).toBe(
      "Templates/Office/PowerPoint",
    );
  });
});
