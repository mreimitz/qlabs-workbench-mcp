import path from "node:path";
import { listenControlApiRuntime } from "./server.js";
import { envFlag, parseServers, requiredEnv } from "./registry.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const serversJson = process.env.MCP_SERVERS_JSON ?? "[]";
const controlDataRoot = requiredEnv("CONTROL_DATA_ROOT");
const dbPath = process.env.CONTROL_DB_PATH ?? path.posix.join(controlDataRoot, "control-api.sqlite");
const enableQpsToolkit = envFlag(process.env.ENABLE_QPS_TOOLKIT);
const qpsToolkitUrl = process.env.MCP_QPS_TOOLKIT_URL ?? "http://mcp-qps-toolkit:7050/mcp";
const mcpTimeoutMs = Number.parseInt(process.env.MCP_TIMEOUT_MS ?? "15000", 10);
const bootstrapFromJson = envFlag(process.env.CONTROL_BOOTSTRAP_FROM_JSON, true);

const servers = parseServers({
  serversJson,
  enableQpsToolkit,
  qpsToolkitUrl,
});

const runtime = await listenControlApiRuntime({
  port,
  host: "0.0.0.0",
  controlDataRoot,
  dbPath,
  bootstrapFromJson,
  servers,
  mcpTimeoutMs,
});

const shutdown = async () => {
  await runtime.close();
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
