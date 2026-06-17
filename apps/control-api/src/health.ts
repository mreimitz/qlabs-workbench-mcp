import type { Express, Request, Response } from "express";
import type { ControlApiContext, HealthPayload, RegistryServer, ServerHealth } from "./types.js";

export const healthUrlForServer = (server: { url: string }) => server.url.replace(/\/mcp\/?$/, "/health");

export const getServerHealth = async (
  ctx: ControlApiContext,
  server: RegistryServer,
): Promise<ServerHealth> => {
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
    const tools = await ctx.mcpClient.listToolsForServer(server);
    let healthOk = false;
    let healthPayload: HealthPayload | undefined;

    try {
      healthPayload = await ctx.mcpClient.fetchHealth(healthUrl);
      healthOk = healthPayload?.ok ?? false;
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

export const registerHealthRoutes = (app: Express, ctx: ControlApiContext) => {
  app.get("/health", async (_req: Request, res: Response) => {
    res.json({
      ok: true,
      controlDataRoot: ctx.controlDataRoot,
      persistence: {
        type: "sqlite",
        dbPath: ctx.dbPath,
        bootstrapFromJson: ctx.bootstrapFromJson,
        migrationVersion: ctx.store.getMigrationVersion ? await ctx.store.getMigrationVersion() : null,
      },
    });
  });

  app.get("/dashboard", async (_req: Request, res: Response) => {
    const registry = await ctx.store.ensureRegistry(ctx.servers);
    const checks = await Promise.all(registry.servers.map((server) => getServerHealth(ctx, server)));
    const healthyServers = checks.filter((check) => check.status === "healthy").length;
    const setupRequiredServers = checks.filter((check) => check.status === "setup-required").length;
    const unhealthyServers = checks.filter((check) => check.status === "attention").length;
    const enabledServers = checks.filter((check) => check.enabled).length;
    const totalTools = checks.reduce((sum, check) => sum + check.tools.length, 0);
    const runs = await ctx.store.listRuns();

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
};
