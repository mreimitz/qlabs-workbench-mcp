import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createSqliteStore, type RunRecord } from "./sqlite-store.js";

const defaultServers = [
  { name: "mcp-textops", url: "http://mcp-textops:7030/mcp" },
  { name: "mcp-assets", url: "http://mcp-assets:7040/mcp" },
];

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "control-api-store-"));
});

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

const openStore = (bootstrapFromJson = false) =>
  createSqliteStore({
    dbPath: path.join(tempRoot, "control-api.sqlite"),
    controlDataRoot: tempRoot,
    bootstrapFromJson,
  });

const makeRun = (id: string, startedAt: string): RunRecord => ({
  id,
  startedAt,
  finishedAt: startedAt,
  durationMs: 10,
  serverName: "mcp-textops",
  toolName: "text_uppercase",
  status: "success",
  arguments: { text: id },
  response: { content: [{ type: "text", text: id.toUpperCase() }] },
});

describe("createSqliteStore", () => {
  test("runs migrations and persists registry enabled state across store instances", async () => {
    const store = openStore();
    await store.initialize(defaultServers);

    await store.setServerEnabled(defaultServers, "mcp-textops", false);
    expect(await store.ensureRegistry(defaultServers)).toEqual({
      servers: [
        { name: "mcp-textops", url: "http://mcp-textops:7030/mcp", enabled: false },
        { name: "mcp-assets", url: "http://mcp-assets:7040/mcp", enabled: true },
      ],
    });
    await store.close();

    const reopened = openStore();
    await reopened.initialize(defaultServers);
    expect(await reopened.ensureRegistry(defaultServers)).toEqual({
      servers: [
        { name: "mcp-textops", url: "http://mcp-textops:7030/mcp", enabled: false },
        { name: "mcp-assets", url: "http://mcp-assets:7040/mcp", enabled: true },
      ],
    });
    expect(await reopened.getMigrationVersion()).toBe(1);
    await reopened.close();
  });

  test("keeps only the newest 50 run records in reverse chronological order", async () => {
    const store = openStore();
    await store.initialize(defaultServers);

    for (let index = 0; index < 55; index += 1) {
      await store.appendRun(
        makeRun(`run-${index.toString().padStart(2, "0")}`, `2026-06-17T00:${index.toString().padStart(2, "0")}:00.000Z`),
      );
    }

    const runs = await store.listRuns();
    expect(runs).toHaveLength(50);
    expect(runs[0]?.id).toBe("run-54");
    expect(runs.at(-1)?.id).toBe("run-05");
    await store.close();
  });

  test("bootstraps registry and runs from JSON files only when explicitly enabled", async () => {
    await fs.writeFile(
      path.join(tempRoot, "registry.json"),
      JSON.stringify({
        servers: [
          { name: "mcp-textops", url: "http://old-textops:7030/mcp", enabled: false },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(tempRoot, "runs.json"),
      JSON.stringify([makeRun("legacy-run", "2026-06-17T12:00:00.000Z")]),
      "utf8",
    );

    const withoutBootstrap = openStore(false);
    await withoutBootstrap.initialize(defaultServers);
    expect(await withoutBootstrap.ensureRegistry(defaultServers)).toEqual({
      servers: [
        { name: "mcp-textops", url: "http://mcp-textops:7030/mcp", enabled: true },
        { name: "mcp-assets", url: "http://mcp-assets:7040/mcp", enabled: true },
      ],
    });
    expect(await withoutBootstrap.listRuns()).toEqual([]);
    await withoutBootstrap.close();

    await fs.rm(path.join(tempRoot, "control-api.sqlite"), { force: true });

    const withBootstrap = openStore(true);
    await withBootstrap.initialize(defaultServers);
    expect(await withBootstrap.ensureRegistry(defaultServers)).toEqual({
      servers: [
        { name: "mcp-textops", url: "http://mcp-textops:7030/mcp", enabled: false },
        { name: "mcp-assets", url: "http://mcp-assets:7040/mcp", enabled: true },
      ],
    });
    expect((await withBootstrap.listRuns()).map((run) => run.id)).toEqual(["legacy-run"]);
    await withBootstrap.close();
  });
});
