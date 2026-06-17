import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createControlApiRuntime, type ControlApiRuntime } from "./server.js";

const servers = [
  { name: "mcp-textops", url: "http://mcp-textops:7030/mcp" },
  { name: "mcp-assets", url: "http://mcp-assets:7040/mcp" },
];

let tempRoot = "";
let runtimes: ControlApiRuntime[] = [];

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "control-api-runtime-"));
  runtimes = [];
});

afterEach(async () => {
  await Promise.all(runtimes.map((runtime) => runtime.close()));
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

const startRuntime = async () => {
  const runtime = await createControlApiRuntime({
    port: 0,
    controlDataRoot: tempRoot,
    dbPath: path.join(tempRoot, "control-api.sqlite"),
    bootstrapFromJson: false,
    servers,
    mcpTimeoutMs: 250,
    mcpClient: {
      listToolsForServer: async (server) =>
        server.name === "mcp-textops"
          ? [{ name: "text_uppercase", description: "Uppercase text" }]
          : [],
      callToolOnServer: async (_server, toolName, args) => ({
        content: [{ type: "text", text: JSON.stringify({ toolName, args }) }],
      }),
      fetchHealth: async () => ({ ok: true, configured: true }),
    },
  });
  runtimes.push(runtime);
  return runtime;
};

describe("createControlApiRuntime", () => {
  test("persists server enabled state in SQLite across app instances", async () => {
    const first = await startRuntime();
    await request(first.app).patch("/servers/mcp-textops").send({ enabled: false }).expect(200);

    const second = await startRuntime();
    const response = await request(second.app).get("/servers").expect(200);

    expect(response.body).toEqual({
      servers: [
        { name: "mcp-textops", url: "http://mcp-textops:7030/mcp", enabled: false },
        { name: "mcp-assets", url: "http://mcp-assets:7040/mcp", enabled: true },
      ],
    });
  });

  test("validates run requests and persists successful run records", async () => {
    const runtime = await startRuntime();

    await request(runtime.app).post("/runs").send({ serverName: "mcp-textops" }).expect(400);

    const runResponse = await request(runtime.app)
      .post("/runs")
      .send({
        serverName: "mcp-textops",
        toolName: "text_uppercase",
        arguments: { text: "hello" },
      })
      .expect(200);

    expect(runResponse.body.ok).toBe(true);
    expect(runResponse.body.run).toMatchObject({
      serverName: "mcp-textops",
      toolName: "text_uppercase",
      status: "success",
      arguments: { text: "hello" },
    });

    const second = await startRuntime();
    const runsResponse = await request(second.app).get("/runs").expect(200);
    expect(runsResponse.body.runs).toHaveLength(1);
    expect(runsResponse.body.runs[0]).toMatchObject({
      id: runResponse.body.run.id,
      serverName: "mcp-textops",
      toolName: "text_uppercase",
      status: "success",
      arguments: { text: "hello" },
    });
  });
});
