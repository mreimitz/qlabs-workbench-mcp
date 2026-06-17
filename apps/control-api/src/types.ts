import type { Express } from "express";
import type { RunRecord } from "@qlabs/contracts";

export type McpServerRef = { name: string; url: string };
export type RegistryServer = McpServerRef & { enabled: boolean };
export type RegistryState = { servers: RegistryServer[] };
export type Tool = { name: string; description?: string; inputSchema?: unknown };

export type HealthPayload = {
  ok?: boolean;
  configured?: boolean;
  note?: string;
};

export type ServerHealth = {
  server: RegistryServer;
  healthUrl: string;
  ok: boolean;
  status: "healthy" | "attention" | "disabled" | "setup-required";
  configured: boolean;
  latencyMs: number | null;
  enabled: boolean;
  tools: Tool[];
  error?: string;
  note?: string;
};

export type ControlStore = {
  initialize(defaultServers: McpServerRef[]): Promise<void>;
  ensureRegistry(defaultServers: McpServerRef[]): Promise<RegistryState>;
  setServerEnabled(defaultServers: McpServerRef[], name: string, enabled: boolean): Promise<RegistryState>;
  listRuns(): Promise<RunRecord[]>;
  appendRun(record: RunRecord): Promise<void>;
  getMigrationVersion?(): Promise<number>;
  close(): Promise<void>;
};

export type McpClientFacade = {
  listToolsForServer(server: McpServerRef): Promise<Tool[]>;
  callToolOnServer(server: McpServerRef, toolName: string, args: unknown): Promise<unknown>;
  fetchHealth(healthUrl: string): Promise<HealthPayload | undefined>;
};

export type ControlApiContext = {
  app: Express;
  controlDataRoot: string;
  dbPath: string;
  bootstrapFromJson: boolean;
  servers: McpServerRef[];
  store: ControlStore;
  mcpClient: McpClientFacade;
};
