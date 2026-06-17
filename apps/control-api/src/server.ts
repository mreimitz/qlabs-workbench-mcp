import express, { type Express } from "express";
import { createMcpClient } from "./mcp-client.js";
import { registerRegistryRoutes } from "./registry.js";
import { registerRunRoutes } from "./runs.js";
import { registerHealthRoutes } from "./health.js";
import { createSqliteStore } from "./sqlite-store.js";
import type { ControlApiContext, McpClientFacade, McpServerRef } from "./types.js";

export type ControlApiRuntimeOptions = {
  port: number;
  controlDataRoot: string;
  dbPath: string;
  bootstrapFromJson: boolean;
  servers: McpServerRef[];
  mcpTimeoutMs: number;
  mcpClient?: McpClientFacade;
};

export type ControlApiRuntime = {
  app: Express;
  close(): Promise<void>;
};

export const createControlApiApp = (ctx: Omit<ControlApiContext, "app">) => {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  const fullContext: ControlApiContext = { ...ctx, app };
  registerHealthRoutes(app, fullContext);
  registerRegistryRoutes(app, fullContext);
  registerRunRoutes(app, fullContext);

  return app;
};

export const createControlApiRuntime = async (
  options: ControlApiRuntimeOptions,
): Promise<ControlApiRuntime> => {
  const store = createSqliteStore({
    dbPath: options.dbPath,
    controlDataRoot: options.controlDataRoot,
    bootstrapFromJson: options.bootstrapFromJson,
  });
  await store.initialize(options.servers);

  const app = createControlApiApp({
    controlDataRoot: options.controlDataRoot,
    dbPath: options.dbPath,
    bootstrapFromJson: options.bootstrapFromJson,
    servers: options.servers,
    store,
    mcpClient: options.mcpClient ?? createMcpClient(options.mcpTimeoutMs),
  });

  return {
    app,
    async close() {
      await store.close();
    },
  };
};

export const listenControlApiRuntime = async (
  options: ControlApiRuntimeOptions & { host: string },
) => {
  const runtime = await createControlApiRuntime(options);
  const server = runtime.app.listen(options.port, options.host);

  return {
    ...runtime,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await runtime.close();
    },
  };
};
