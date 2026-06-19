import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createAssetStore,
  normalizeAssetPath,
  type AssetMetadataPatch,
} from "./asset-store.js";

let tmpRoot = "";

const writeJson = async (targetPath: string, value: unknown) => {
  await fs.mkdir(path.posix.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "managed-assets-"));
});

afterEach(async () => {
  if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("normalizeAssetPath", () => {
  test("rejects unsafe or empty asset paths", () => {
    for (const candidate of ["", ".", "/absolute.svg", "../x.svg", "icons/../x.svg", "bad\u0000.svg"]) {
      expect(() => normalizeAssetPath(candidate)).toThrow("Invalid asset path");
    }
  });

  test("normalizes safe nested paths", () => {
    expect(normalizeAssetPath("icons/data-pipelines/warehouse.svg")).toBe(
      "icons/data-pipelines/warehouse.svg",
    );
    expect(normalizeAssetPath("icons\\data-pipelines\\warehouse.svg")).toBe(
      "icons/data-pipelines/warehouse.svg",
    );
  });
});

describe("managed asset store", () => {
  test("migrates legacy keyword index into v2 records", async () => {
    await fs.writeFile(path.join(tmpRoot, "hero-demo.svg"), "<svg/>");
    await writeJson(path.join(tmpRoot, "index.json"), {
      keywords: {
        hero: ["hero-demo.svg"],
        dashboard: ["hero-demo.svg"],
      },
    });

    const store = createAssetStore({ assetsRoot: tmpRoot });
    const index = await store.readIndex();

    expect(index.version).toBe(2);
    expect(index.assets["hero-demo.svg"]).toMatchObject({
      path: "hero-demo.svg",
      title: "hero-demo",
      tags: ["dashboard", "hero"],
      kind: "image",
      mime: "image/svg+xml",
      source: "legacy",
    });
    expect(index.keywords.hero).toEqual(["hero-demo.svg"]);
  });

  test("syncs migrated indexes and compatibility catalogs to disk", async () => {
    await fs.mkdir(path.join(tmpRoot, "icons", "data-pipelines"), { recursive: true });
    await fs.writeFile(path.join(tmpRoot, "icons", "data-pipelines", "warehouse.svg"), "<svg/>");
    await writeJson(path.join(tmpRoot, "index.json"), {
      keywords: {
        warehouse: ["icons/data-pipelines/warehouse.svg"],
      },
    });

    const store = createAssetStore({ assetsRoot: tmpRoot });
    await store.syncIndex();

    const persisted = JSON.parse(await fs.readFile(path.join(tmpRoot, "index.json"), "utf8"));
    const iconsPack = JSON.parse(await fs.readFile(path.join(tmpRoot, "icons.pack.json"), "utf8"));

    expect(persisted.version).toBe(2);
    expect(persisted.assets["icons/data-pipelines/warehouse.svg"].tags).toEqual(["warehouse"]);
    expect(iconsPack.catalog.icons[0]).toMatchObject({
      category: "data-pipelines",
      slug: "warehouse",
      tags: ["warehouse"],
    });
  });

  test("writes files, metadata, and QPS-compatible icon catalogs", async () => {
    const store = createAssetStore({ assetsRoot: tmpRoot });

    await store.writeAsset({
      path: "icons/data-pipelines/warehouse.svg",
      content: Buffer.from("<svg/>"),
      metadata: {
        title: "Warehouse",
        kind: "icon",
        tags: ["storage", "warehouse"],
        source: "upload",
      },
    });

    const index = await store.readIndex();
    expect(index.assets["icons/data-pipelines/warehouse.svg"]).toMatchObject({
      title: "Warehouse",
      kind: "icon",
      tags: ["storage", "warehouse"],
      mime: "image/svg+xml",
    });
    expect(index.keywords.storage).toEqual(["icons/data-pipelines/warehouse.svg"]);

    const iconsPack = JSON.parse(await fs.readFile(path.join(tmpRoot, "icons.pack.json"), "utf8"));
    const iconsMetadata = JSON.parse(
      await fs.readFile(path.join(tmpRoot, "icons", "_metadata.json"), "utf8"),
    );
    const iconsCatalog = JSON.parse(
      await fs.readFile(path.join(tmpRoot, "icons", "catalog.json"), "utf8"),
    );

    expect(iconsPack.catalog.icons).toContainEqual({
      category: "data-pipelines",
      path: "icons/data-pipelines/warehouse.svg",
      slug: "warehouse",
      tags: ["storage", "warehouse"],
      source_file: "warehouse.svg",
    });
    expect(iconsMetadata["data-pipelines/warehouse.svg"].tags).toEqual([
      "storage",
      "warehouse",
    ]);
    expect(iconsCatalog.icons).toHaveLength(1);
  });

  test("generates resolvable icon catalog entries for managed icons outside the icons tree", async () => {
    const store = createAssetStore({ assetsRoot: tmpRoot });

    await store.writeAsset({
      path: "tests/runtime-icon.svg",
      content: Buffer.from("<svg/>"),
      metadata: {
        title: "Runtime Icon",
        kind: "icon",
        tags: ["runtime"],
      },
    });

    const iconsCatalog = JSON.parse(
      await fs.readFile(path.join(tmpRoot, "icons", "catalog.json"), "utf8"),
    );
    const iconsMetadata = JSON.parse(
      await fs.readFile(path.join(tmpRoot, "icons", "_metadata.json"), "utf8"),
    );

    expect(iconsCatalog.icons).toContainEqual({
      category: "tests",
      path: "tests/runtime-icon.svg",
      slug: "runtime-icon",
      tags: ["runtime"],
      source_file: "runtime-icon.svg",
    });
    expect(iconsMetadata["tests/runtime-icon.svg"]).toMatchObject({
      path: "tests/runtime-icon.svg",
      tags: ["runtime"],
    });
  });

  test("updates metadata and removes deleted assets from index and catalogs", async () => {
    const store = createAssetStore({ assetsRoot: tmpRoot });
    await store.writeAsset({
      path: "art/hero.png",
      content: Buffer.from("png"),
      metadata: {
        kind: "brand-art",
        tags: ["hero"],
        slots: ["hero", "cover"],
      },
    });

    const patch: AssetMetadataPatch = {
      tags: ["cover", "abstract"],
      title: "Hero Wash",
    };
    await store.updateMetadata("art/hero.png", patch);

    const afterPatch = await store.readIndex();
    expect(afterPatch.assets["art/hero.png"]).toMatchObject({
      title: "Hero Wash",
      tags: ["abstract", "cover"],
      slots: ["hero", "cover"],
    });
    expect(afterPatch.keywords.hero).toEqual(["art/hero.png"]);
    expect(afterPatch.keywords.abstract).toEqual(["art/hero.png"]);

    const manifest = JSON.parse(await fs.readFile(path.join(tmpRoot, "art", "manifest.json"), "utf8"));
    expect(manifest.files["hero.png"]).toEqual({
      slot: ["hero", "cover"],
      tags: ["abstract", "cover"],
    });

    await store.deleteAsset("art/hero.png");
    const afterDelete = await store.readIndex();
    expect(afterDelete.assets["art/hero.png"]).toBeUndefined();
    expect(afterDelete.keywords.abstract).toBeUndefined();
    await expect(fs.access(path.join(tmpRoot, "art", "hero.png"))).rejects.toThrow();

    const manifestAfterDelete = JSON.parse(
      await fs.readFile(path.join(tmpRoot, "art", "manifest.json"), "utf8"),
    );
    expect(manifestAfterDelete.files["hero.png"]).toBeUndefined();
  });

  test("preserves existing optional metadata when patch fields are undefined", async () => {
    const store = createAssetStore({ assetsRoot: tmpRoot });
    await store.writeAsset({
      path: "art/hero.png",
      content: Buffer.from("png"),
      metadata: {
        kind: "brand-art",
        tags: ["hero"],
        slots: ["hero", "cover"],
        source: "qps-import",
        sourcePath: "art/hero.png",
      },
    });

    await store.updateMetadata("art/hero.png", {
      tags: ["edited"],
      slots: undefined,
      source: undefined,
      sourcePath: undefined,
    });

    const index = await store.readIndex();
    expect(index.assets["art/hero.png"]).toMatchObject({
      tags: ["edited"],
      slots: ["hero", "cover"],
      source: "qps-import",
      sourcePath: "art/hero.png",
    });

    const manifest = JSON.parse(await fs.readFile(path.join(tmpRoot, "art", "manifest.json"), "utf8"));
    expect(manifest.files["hero.png"]).toEqual({
      slot: ["hero", "cover"],
      tags: ["edited"],
    });
  });

  test("imports QPS assets idempotently without overwriting managed edits", async () => {
    const qpsRoot = path.join(tmpRoot, "qps-source");
    const assetsRoot = path.join(tmpRoot, "managed");
    await fs.mkdir(path.join(qpsRoot, "icons", "data-pipelines"), { recursive: true });
    await fs.writeFile(path.join(qpsRoot, "icons", "data-pipelines", "warehouse.svg"), "<svg>seed</svg>");
    await writeJson(path.join(qpsRoot, "icons.pack.json"), {
      catalog: {
        icons: [
          {
            category: "data-pipelines",
            slug: "warehouse",
            tags: ["seeded", "warehouse"],
            source_file: "Qlik Icons_Warehouse.svg",
          },
        ],
      },
    });

    const store = createAssetStore({ assetsRoot, qpsAssetsRoot: qpsRoot });
    const first = await store.importQpsAssets();
    expect(first).toMatchObject({ imported: 1, skipped: 0 });

    await store.updateMetadata("icons/data-pipelines/warehouse.svg", {
      title: "Edited Warehouse",
      tags: ["edited"],
    });
    await fs.writeFile(
      path.join(qpsRoot, "icons", "data-pipelines", "warehouse.svg"),
      "<svg>changed seed</svg>",
    );

    const second = await store.importQpsAssets();
    expect(second).toMatchObject({ imported: 0, skipped: 1 });

    const importedFile = await fs.readFile(
      path.join(assetsRoot, "icons", "data-pipelines", "warehouse.svg"),
      "utf8",
    );
    expect(importedFile).toBe("<svg>seed</svg>");
    const index = await store.readIndex();
    expect(index.assets["icons/data-pipelines/warehouse.svg"]).toMatchObject({
      title: "Edited Warehouse",
      tags: ["edited"],
      source: "qps-import",
      sourcePath: "icons/data-pipelines/warehouse.svg",
    });
  });

  test("reports missing QPS import root clearly", async () => {
    const store = createAssetStore({
      assetsRoot: path.join(tmpRoot, "managed"),
      qpsAssetsRoot: path.join(tmpRoot, "missing-qps-assets"),
    });

    await expect(store.importQpsAssets()).rejects.toThrow("QPS assets root is not configured");
  });
});
