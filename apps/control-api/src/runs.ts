import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { runRequestSchema, type RunRecord } from "@qlabs/contracts";
import type { ControlApiContext } from "./types.js";

const summarizeArguments = (value: unknown) => {
  try {
    const raw = JSON.stringify(value ?? {});
    return raw.length > 2000 ? `${raw.slice(0, 2000)}...` : JSON.parse(raw);
  } catch {
    return { note: "Arguments were not serializable" };
  }
};

export const registerRunRoutes = (app: Express, ctx: ControlApiContext) => {
  app.post("/runs", async (req: Request, res: Response) => {
    const parsed = runRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "serverName and toolName are required", details: parsed.error.flatten() });
      return;
    }
    const { serverName, toolName, arguments: toolArguments } = parsed.data;

    const registry = await ctx.store.ensureRegistry(ctx.servers);
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
      const responsePayload = await ctx.mcpClient.callToolOnServer(server, toolName, toolArguments);
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
      await ctx.store.appendRun(record);
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
      await ctx.store.appendRun(record);
      res.status(500).json({ error: record.error, run: record });
    }
  });

  app.get("/runs", async (_req: Request, res: Response) => {
    const runs = await ctx.store.listRuns();
    res.json({ runs });
  });
};
