import express, { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type McpServerRef = { name: string; url: string };
type RegistryServer = McpServerRef & { enabled: boolean };
type ServerHealth = {
  server: RegistryServer;
  healthUrl: string;
  ok: boolean;
  status: "healthy" | "attention" | "disabled" | "setup-required";
  configured: boolean;
  latencyMs: number | null;
  enabled: boolean;
  tools: { name: string; description?: string; inputSchema?: unknown }[];
  error?: string;
  note?: string;
};
type HealthPayload = {
  ok?: boolean;
  configured?: boolean;
  note?: string;
};
type RunRecord = {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  serverName: string;
  toolName: string;
  status: "success" | "error";
  arguments: unknown;
  response: unknown;
  error?: string;
};
type RegistryState = { servers: RegistryServer[] };

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const serversJson = process.env.MCP_SERVERS_JSON ?? "[]";
const controlDataRoot = requiredEnv("CONTROL_DATA_ROOT");
const enableQpsToolkit = envFlag(process.env.ENABLE_QPS_TOOLKIT);
const qpsToolkitUrl = process.env.MCP_QPS_TOOLKIT_URL ?? "http://mcp-qps-toolkit:7050/mcp";
const registryPath = path.posix.join(controlDataRoot, "registry.json");
const runsPath = path.posix.join(controlDataRoot, "runs.json");

const app = express();
app.use(express.json({ limit: "4mb" }));

const parseServers = (): McpServerRef[] => {
  try {
    const parsed = JSON.parse(serversJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    const baseServers = parsed
      .map((s) => ({
        name: typeof s?.name === "string" ? s.name : "",
        url: typeof s?.url === "string" ? s.url : "",
      }))
      .filter((s) => s.name.length > 0 && s.url.length > 0);

    if (enableQpsToolkit) {
      baseServers.push({ name: "mcp-qps-toolkit", url: qpsToolkitUrl });
    }

    return baseServers;
  } catch {
    return [];
  }
};

const ensureControlData = async () => {
  await fs.mkdir(controlDataRoot, { recursive: true });
};

const writeJson = async (filePath: string, value: unknown) => {
  await ensureControlData();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
};

const readJson = async <T,>(filePath: string, fallback: T): Promise<T> => {
  await ensureControlData();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const ensureRegistry = async (): Promise<RegistryState> => {
  const defaults = parseServers().map((server) => ({ ...server, enabled: true }));
  const existing = await readJson<RegistryState>(registryPath, { servers: defaults });
  const merged = defaults.map((server) => {
    const found = existing.servers.find((candidate) => candidate.name === server.name);
    return found ? { ...server, enabled: found.enabled } : server;
  });
  const next = { servers: merged };
  await writeJson(registryPath, next);
  return next;
};

const listRuns = async () => {
  const runs = await readJson<RunRecord[]>(runsPath, []);
  return runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
};

const appendRun = async (record: RunRecord) => {
  const runs = await listRuns();
  const next = [record, ...runs].slice(0, 50);
  await writeJson(runsPath, next);
};

const withServerClient = async <T,>(server: McpServerRef, fn: (client: Client) => Promise<T>) => {
  const client = new Client({ name: "control-api", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url));
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await transport.close();
  }
};

const listToolsForServer = async (server: McpServerRef) =>
  withServerClient(server, async (client) => {
    const res = await client.listTools();
    return res.tools ?? [];
  });

const callToolOnServer = async (server: McpServerRef, toolName: string, args: unknown) =>
  withServerClient(server, async (client) => {
    const res = await client.callTool({
      name: toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    return res;
  });

const healthUrlForServer = (server: McpServerRef) => server.url.replace(/\/mcp\/?$/, "/health");

const getServerHealth = async (server: RegistryServer): Promise<ServerHealth> => {
  if (!server.enabled) {
    return {
      server,
      healthUrl: healthUrlForServer(server),
      ok: false,
      status: "disabled",
      configured: true,
      latencyMs: null,
      enabled: false,
      tools: [],
      note: "Disabled in workbench",
    };
  }

  const startedAt = Date.now();
  const healthUrl = healthUrlForServer(server);

  try {
    const tools = await listToolsForServer(server);
    let healthOk = false;
    let healthPayload: HealthPayload | undefined;

    try {
      const healthRes = await fetch(healthUrl);
      healthOk = healthRes.ok;
      try {
        healthPayload = (await healthRes.json()) as HealthPayload;
      } catch {
        healthPayload = undefined;
      }
    } catch {
      healthOk = false;
    }

    const latencyMs = Date.now() - startedAt;
    const configured = healthPayload?.configured ?? true;
    const ok = healthOk || tools.length > 0;
    const status = configured ? (ok ? "healthy" : "attention") : "setup-required";

    return {
      server,
      healthUrl,
      ok,
      status,
      configured,
      latencyMs,
      enabled: true,
      tools,
      error: status === "attention" ? "Health check failed and no tools were discovered" : undefined,
      note: healthPayload?.note,
    };
  } catch (error) {
    return {
      server,
      healthUrl,
      ok: false,
      status: "attention",
      configured: true,
      latencyMs: Date.now() - startedAt,
      enabled: true,
      tools: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const summarizeArguments = (value: unknown) => {
  try {
    const raw = JSON.stringify(value ?? {});
    return raw.length > 2000 ? `${raw.slice(0, 2000)}...` : JSON.parse(raw);
  } catch {
    return { note: "Arguments were not serializable" };
  }
};

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, controlDataRoot });
});

app.get("/servers", async (_req: Request, res: Response) => {
  const registry = await ensureRegistry();
  res.json({ servers: registry.servers });
});

app.patch("/servers/:name", async (req: Request, res: Response) => {
  const registry = await ensureRegistry();
  const enabled = Boolean(req.body?.enabled);
  const nextServers = registry.servers.map((server) =>
    server.name === req.params.name ? { ...server, enabled } : server
  );
  await writeJson(registryPath, { servers: nextServers });
  res.json({ ok: true, servers: nextServers });
});

app.get("/tools", async (_req: Request, res: Response) => {
  const registry = await ensureRegistry();
  const checks = await Promise.all(registry.servers.map((server) => getServerHealth(server)));
  res.json({
    toolsByServer: checks.map((check) => ({
      server: check.server,
      tools: check.tools,
      error: check.error,
    })),
  });
});

app.post("/runs", async (req: Request, res: Response) => {
  const { serverName, toolName, arguments: toolArguments } = req.body ?? {};
  if (typeof serverName !== "string" || typeof toolName !== "string") {
    res.status(400).json({ error: "serverName and toolName are required" });
    return;
  }

  const registry = await ensureRegistry();
  const server = registry.servers.find((candidate) => candidate.name === serverName);
  if (!server) {
    res.status(404).json({ error: `Unknown server: ${serverName}` });
    return;
  }
  if (!server.enabled) {
    res.status(409).json({ error: `${serverName} is currently disabled` });
    return;
  }

  const startedAt = new Date();

  try {
    const responsePayload = await callToolOnServer(server, toolName, toolArguments);
    const finishedAt = new Date();
    const record: RunRecord = {
      id: randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      serverName,
      toolName,
      status: "success",
      arguments: summarizeArguments(toolArguments),
      response: responsePayload,
    };
    await appendRun(record);
    res.json({ ok: true, run: record });
  } catch (error) {
    const finishedAt = new Date();
    const record: RunRecord = {
      id: randomUUID(),
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      serverName,
      toolName,
      status: "error",
      arguments: summarizeArguments(toolArguments),
      response: null,
      error: error instanceof Error ? error.message : String(error),
    };
    await appendRun(record);
    res.status(500).json({ error: record.error, run: record });
  }
});

app.get("/runs", async (_req: Request, res: Response) => {
  const runs = await listRuns();
  res.json({ runs });
});

app.get("/dashboard", async (_req: Request, res: Response) => {
  const registry = await ensureRegistry();
  const checks = await Promise.all(registry.servers.map((server) => getServerHealth(server)));
  const healthyServers = checks.filter((check) => check.status === "healthy").length;
  const setupRequiredServers = checks.filter((check) => check.status === "setup-required").length;
  const unhealthyServers = checks.filter((check) => check.status === "attention").length;
  const enabledServers = checks.filter((check) => check.enabled).length;
  const totalTools = checks.reduce((sum, check) => sum + check.tools.length, 0);
  const runs = await listRuns();

  res.json({
    summary: {
      totalServers: checks.length,
      enabledServers,
      disabledServers: checks.length - enabledServers,
      healthyServers,
      setupRequiredServers,
      unhealthyServers,
      totalTools,
      totalRuns: runs.length,
    },
    diagnostics: {
      attentionCount: unhealthyServers,
      disabledCount: checks.filter((check) => !check.enabled).length,
      setupRequiredCount: setupRequiredServers,
    },
    servers: checks,
    runs: runs.slice(0, 12),
  });
});

app.listen(port, "0.0.0.0");
