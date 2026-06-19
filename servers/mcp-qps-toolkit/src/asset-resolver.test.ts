import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createQpsAssetResolver } from "./asset-resolver.js";

let tmpRoot: string;

const writeJson = async (filePath: string, value: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeIconCatalog = async (tags: string[]) => {
  await writeJson(path.join(tmpRoot, "icons.pack.json"), {
    catalog: {
      icons: [
        {
          category: "data-pipelines",
          path: "icons/data-pipelines/warehouse.svg",
          slug: "warehouse",
          tags,
        },
      ],
    },
  });
};

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qps-assets-"));
  await fs.mkdir(path.join(tmpRoot, "icons", "data-pipelines"), { recursive: true });
  await fs.writeFile(
    path.join(tmpRoot, "icons", "data-pipelines", "warehouse.svg"),
    "<svg />",
    "utf8",
  );
  await writeIconCatalog(["warehouse"]);
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe("managed QPS asset resolver", () => {
  test("resolves icons from managed catalogs without a qps-toolkit checkout", async () => {
    const resolver = createQpsAssetResolver({
      assetsRoot: tmpRoot,
      qpsPluginRoot: path.join(tmpRoot, "missing-qps-plugin"),
    });

    await expect(resolver.resolveAsset("icon", "warehouse")).resolves.toMatchObject({
      ok: true,
      abs_path: path.join(tmpRoot, "icons", "data-pipelines", "warehouse.svg"),
      rel_path: "framework/assets/icons/data-pipelines/warehouse.svg",
      label: "data-pipelines/warehouse",
      kind: "icon",
    });
  });

  test("reloads managed icon catalog when metadata changes", async () => {
    const resolver = createQpsAssetResolver({
      assetsRoot: tmpRoot,
      qpsPluginRoot: path.join(tmpRoot, "missing-qps-plugin"),
    });

    const before = await resolver.resolveAsset("icon", "governance");
    expect(before.kind).toBe("icon");
    expect((before.details as { score: number }).score).toBe(0);

    await writeIconCatalog(["governance"]);

    await expect(resolver.resolveAsset("icon", "governance")).resolves.toMatchObject({
      ok: true,
      label: "data-pipelines/warehouse",
      details: {
        score: 2,
        reasons: ["tag_hits=1"],
      },
    });
  });

  test("returns no usable asset after managed file delete", async () => {
    const resolver = createQpsAssetResolver({
      assetsRoot: tmpRoot,
      qpsPluginRoot: path.join(tmpRoot, "missing-qps-plugin"),
    });

    await fs.rm(path.join(tmpRoot, "icons", "data-pipelines", "warehouse.svg"));

    await expect(resolver.resolveAsset("icon", "warehouse")).resolves.toMatchObject({
      ok: false,
      abs_path: null,
      rel_path: "framework/assets/icons/data-pipelines/warehouse.svg",
    });
  });
});
