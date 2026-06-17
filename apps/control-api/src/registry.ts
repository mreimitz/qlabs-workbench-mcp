import type { Express, Request, Response } from "express";
import type { ControlApiContext, McpServerRef } from "./types.js";
import { getServerHealth } from "./health.js";

export const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

export const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const parseServers = (input: {
  serversJson: string;
  enableQpsToolkit: boolean;
  qpsToolkitUrl: string;
}): McpServerRef[] => {
  try {
    const parsed = JSON.parse(input.serversJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    const baseServers = parsed
      .map((server) => ({
        name: typeof server?.name === "string" ? server.name : "",
        url: typeof server?.url === "string" ? server.url : "",
      }))
      .filter((server) => server.name.length > 0 && server.url.length > 0);

    if (input.enableQpsToolkit) {
      baseServers.push({ name: "mcp-qps-toolkit", url: input.qpsToolkitUrl });
    }

    return baseServers;
  } catch {
    return [];
  }
};

export const registerRegistryRoutes = (app: Express, ctx: ControlApiContext) => {
  app.get("/servers", async (_req: Request, res: Response) => {
    const registry = await ctx.store.ensureRegistry(ctx.servers);
    res.json({ servers: registry.servers });
  });

  app.patch("/servers/:name", async (req: Request, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    const registry = await ctx.store.setServerEnabled(ctx.servers, req.params.name, enabled);
    res.json({ ok: true, servers: registry.servers });
  });

  app.get("/tools", async (_req: Request, res: Response) => {
    const registry = await ctx.store.ensureRegistry(ctx.servers);
    const checks = await Promise.all(registry.servers.map((server) => getServerHealth(ctx, server)));
    res.json({
      toolsByServer: checks.map((check) => ({
        server: check.server,
        tools: check.tools,
        error: check.error,
      })),
    });
  });
};
