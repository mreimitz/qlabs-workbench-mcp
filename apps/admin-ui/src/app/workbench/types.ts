export type Tool = { name: string; description?: string; inputSchema?: unknown };

export type ServerRef = { name: string; url: string; enabled: boolean };

export type RunRecord = {
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

export type ServerStatus = {
  server: ServerRef;
  healthUrl: string;
  ok: boolean;
  status: "healthy" | "attention" | "disabled" | "setup-required";
  configured: boolean;
  enabled: boolean;
  latencyMs: number | null;
  tools: Tool[];
  error?: string;
  note?: string;
};

export type DashboardData = {
  summary: {
    totalServers: number;
    enabledServers: number;
    disabledServers: number;
    healthyServers: number;
    setupRequiredServers: number;
    unhealthyServers: number;
    totalTools: number;
    totalRuns: number;
  };
  diagnostics: {
    attentionCount: number;
    disabledCount: number;
    setupRequiredCount: number;
  };
  servers: ServerStatus[];
  runs: RunRecord[];
};

export type StorageHealth = {
  ok: boolean;
  storageRoot: string;
  seeded?: boolean;
};

export type StorageBrowse = {
  path: string;
  entries: { name: string; kind: "folder" | "file" }[];
};

export type AssetRecord = {
  path: string;
  filename: string;
  title: string;
  kind: string;
  tags: string[];
  keywords?: string[];
  mime: string;
  source: string;
  sourcePath?: string;
  size: number;
  mtimeMs: number;
  url: string;
  slots?: string[];
  area?: string;
  type?: string;
  variant?: string;
  useWhen?: string;
  aliases?: string[];
  categories?: string[];
  qlikCategory?: string;
  license?: string;
  hex?: string;
};

export type DashboardPayload = {
  dashboard: DashboardData;
  storageHealth: StorageHealth;
  rootBrowse: StorageBrowse;
  assets: { assets: AssetRecord[] };
  error?: string;
};

export type ViewKey = "overview" | "servers" | "runner" | "assets" | "storage";

export type EndpointRow = {
  name: string;
  url: string;
};

export type StorageRow = StorageBrowse["entries"][number] & {
  path: string;
};
