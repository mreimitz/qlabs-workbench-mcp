"use client";

import Image from "next/image";
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  MetricCard,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  StatusBadge,
  Textarea,
} from "@brand/ui";
import { MetricGrid } from "@brand/charts";
import { ColumnPicker, DataTable, FilterBar, SearchInput, type ColumnDef } from "@brand/data";
import { FolderOpen, Home, Images, Play, Server } from "lucide-react";

type Tool = { name: string; description?: string; inputSchema?: unknown };
type ServerRef = { name: string; url: string; enabled: boolean };
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
type ServerStatus = {
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
type DashboardData = {
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
type StorageHealth = {
  ok: boolean;
  storageRoot: string;
  seeded?: boolean;
};
type StorageBrowse = {
  path: string;
  entries: { name: string; kind: "folder" | "file" }[];
};
type AssetRecord = {
  filename: string;
  keywords: string[];
  url: string;
};

export type DashboardPayload = {
  dashboard: DashboardData;
  storageHealth: StorageHealth;
  rootBrowse: StorageBrowse;
  assets: { assets: AssetRecord[] };
  error?: string;
};

type ViewKey = "overview" | "servers" | "runner" | "assets" | "storage";
const staticEndpointMap: Record<string, string> = {
  "admin-ui": "http://localhost:3000",
  "control-api": "http://localhost:4000",
  "storage-api": "http://localhost:4100",
};
const serverEndpointMap: Record<string, string> = {
  "mcp-playwright": "http://localhost:7010/mcp",
  "mcp-markitdown": "http://localhost:7020/mcp",
  "mcp-textops": "http://localhost:7030/mcp",
  "mcp-assets": "http://localhost:7040/mcp",
  "mcp-qps-toolkit": "http://localhost:7050/mcp",
};

const navItems: Array<{ id: ViewKey; label: string; icon: typeof Home }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "servers", label: "Servers", icon: Server },
  { id: "runner", label: "Tool Runner", icon: Play },
  { id: "assets", label: "Assets", icon: Images },
  { id: "storage", label: "Storage", icon: FolderOpen },
];

const defaultArgsByTool: Record<string, Record<string, unknown>> = {
  pw_get_title: { url: "https://example.com" },
  pw_screenshot: { url: "https://example.com", filename: "playwright/example-shot.png" },
  markitdown_convert: { input_path: "docs/example.html", output_path: "docs/example.md" },
  text_uppercase: { text: "hello world" },
  text_lowercase: { text: "HELLO WORLD" },
  text_trim: { text: "  padded text  " },
  text_regex_extract: { text: "order-123 user-456", pattern: "\\d+" },
  assets_search: { keyword: "hero" },
  assets_add: { filename: "banner.png", keyword: "hero", contentBase64: "<base64>" },
  assets_tag: { filename: "banner.png", keyword: "hero" },
};

const joinPath = (basePath: string, name: string) => {
  const left = basePath.replace(/\/+$/, "");
  return left ? `${left}/${name}` : name;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const formatLatency = (latencyMs: number | null) => {
  if (latencyMs === null) return "n/a";
  if (latencyMs < 1000) return `${latencyMs} ms`;
  return `${(latencyMs / 1000).toFixed(1)} s`;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });

const isImageFile = (filename: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
const prettyJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);
const describeServerStatus = (server: ServerStatus) => {
  if (server.status === "healthy") return server.note ?? "Ready for execution";
  if (server.status === "disabled") return "Disabled from the local registry";
  if (server.status === "setup-required") {
    return server.note ?? "Additional local content is required before this integration can run";
  }
  return server.error ?? "Needs operator attention";
};

export function WorkbenchDashboard(props: { initialData: DashboardPayload }) {
  const initialServerName =
    props.initialData.dashboard.servers.find(
      (server) => server.enabled && server.status !== "setup-required" && server.tools.length > 0,
    )?.server.name ?? "";
  const initialToolName =
    props.initialData.dashboard.servers.find((server) => server.server.name === initialServerName)
      ?.tools[0]?.name ?? "";

  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [dashboardData, setDashboardData] = useState(props.initialData);
  const [currentPath, setCurrentPath] = useState(props.initialData.rootBrowse.path || "");
  const [browseData, setBrowseData] = useState(props.initialData.rootBrowse);
  const [toolFilter, setToolFilter] = useState("");
  const [serversSearch, setServersSearch] = useState("");
  const [runsSearch, setRunsSearch] = useState("");
  const [endpointsSearch, setEndpointsSearch] = useState("");
  const [storageSearch, setStorageSearch] = useState("");
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(props.initialData.error ?? null);
  const [selectedServer, setSelectedServer] = useState(initialServerName);
  const [selectedTool, setSelectedTool] = useState(initialToolName);
  const [toolArgs, setToolArgs] = useState(prettyJson(defaultArgsByTool[initialToolName] ?? {}));
  const [lastRunOutput, setLastRunOutput] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState(props.initialData.dashboard.runs[0]?.id ?? "");
  const [assetKeywordFilter, setAssetKeywordFilter] = useState("");
  const [assetKeywords, setAssetKeywords] = useState("");
  const [assetTagDrafts, setAssetTagDrafts] = useState<Record<string, string>>({});

  const flashVariant =
    flash && /failed|error/i.test(flash)
      ? "destructive"
      : flash && /created|uploaded|added|enabled|disabled|tagged|ran/i.test(flash)
        ? "success"
        : "info";

  const refreshDashboard = async () => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = (await response.json()) as DashboardPayload & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to refresh dashboard");
      }
      setDashboardData(payload);
      if (currentPath === "") {
        setBrowseData(payload.rootBrowse);
      }
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to refresh dashboard");
    } finally {
      setBusy(false);
    }
  };

  const runnableServers = useMemo(
    () =>
      dashboardData.dashboard.servers.filter(
        (server) => server.server.enabled && server.status !== "setup-required",
      ),
    [dashboardData.dashboard.servers],
  );

  useEffect(() => {
    if (!selectedServer && runnableServers.length > 0) {
      setSelectedServer(runnableServers[0].server.name);
    }
  }, [runnableServers, selectedServer]);

  useEffect(() => {
    const selectedServerStillRunnable = runnableServers.some(
      (server) => server.server.name === selectedServer,
    );
    if (!selectedServerStillRunnable) {
      setSelectedServer(runnableServers[0]?.server.name ?? "");
    }
  }, [runnableServers, selectedServer]);

  const activeServer = useMemo(
    () =>
      dashboardData.dashboard.servers.find((server) => server.server.name === selectedServer) ?? null,
    [dashboardData.dashboard.servers, selectedServer],
  );
  const activeTool = useMemo(
    () => activeServer?.tools.find((tool) => tool.name === selectedTool) ?? null,
    [activeServer, selectedTool],
  );

  useEffect(() => {
    const firstTool = activeServer?.tools[0]?.name ?? "";
    const toolStillExists = activeServer?.tools.some((tool) => tool.name === selectedTool) ?? false;
    if (!toolStillExists) {
      setSelectedTool(firstTool);
    }
  }, [activeServer, selectedTool]);

  useEffect(() => {
    if (!selectedTool) {
      setToolArgs("{}");
      return;
    }
    setToolArgs(prettyJson(defaultArgsByTool[selectedTool] ?? {}));
  }, [selectedTool]);

  const toolInventoryRows = useMemo(
    () =>
      dashboardData.dashboard.servers.flatMap((server) =>
        server.tools.map((tool) => ({
          id: `${server.server.name}:${tool.name}`,
          serverName: server.server.name,
          toolName: tool.name,
          description: tool.description ?? "",
          status: server.status,
          enabled: server.server.enabled,
        })),
      ),
    [dashboardData.dashboard.servers],
  );

  const rootStats = useMemo(() => {
    const folders = browseData.entries.filter((entry) => entry.kind === "folder").length;
    const files = browseData.entries.filter((entry) => entry.kind === "file").length;
    return { folders, files };
  }, [browseData.entries]);

  const filteredAssets = useMemo(() => {
    const filter = assetKeywordFilter.trim().toLowerCase();
    const assets = dashboardData.assets.assets;
    if (!filter) return assets;
    return assets.filter(
      (asset) =>
        asset.filename.toLowerCase().includes(filter) ||
        asset.keywords.some((keyword) => keyword.toLowerCase().includes(filter)),
    );
  }, [assetKeywordFilter, dashboardData.assets.assets]);

  const endpointEntries = useMemo(() => {
    const entries = { ...staticEndpointMap } satisfies Record<string, string>;
    for (const server of dashboardData.dashboard.servers) {
      const mappedUrl = serverEndpointMap[server.server.name];
      if (mappedUrl) {
        entries[server.server.name] = mappedUrl;
      }
    }
    return Object.entries(entries);
  }, [dashboardData.dashboard.servers]);

  const selectedRun = useMemo(
    () => dashboardData.dashboard.runs.find((run) => run.id === selectedRunId) ?? dashboardData.dashboard.runs[0] ?? null,
    [dashboardData.dashboard.runs, selectedRunId],
  );

  useEffect(() => {
    if (!selectedRunId && dashboardData.dashboard.runs.length > 0) {
      setSelectedRunId(dashboardData.dashboard.runs[0].id);
      return;
    }

    if (
      selectedRunId &&
      dashboardData.dashboard.runs.length > 0 &&
      !dashboardData.dashboard.runs.some((run) => run.id === selectedRunId)
    ) {
      setSelectedRunId(dashboardData.dashboard.runs[0].id);
    }
  }, [dashboardData.dashboard.runs, selectedRunId]);

  const parsedToolArgs = useMemo(() => {
    if (!toolArgs.trim()) {
      return { value: {}, error: "Arguments JSON cannot be empty." };
    }

    try {
      return { value: JSON.parse(toolArgs) as unknown, error: null };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Arguments JSON is invalid.",
      };
    }
  }, [toolArgs]);

  const browsePath = async (path: string) => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/storage/browse?path=${encodeURIComponent(path)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as StorageBrowse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to browse storage");
      }
      setCurrentPath(payload.path);
      setBrowseData(payload);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to browse storage");
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async () => {
    const trimmed = folderName.trim();
    if (!trimmed) return;

    setBusy(true);
    setFlash(null);

    try {
      const path = joinPath(currentPath, trimmed);
      const response = await fetch("/api/storage/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to create folder");
      }
      setFolderName("");
      await browsePath(currentPath);
      setFlash(`Created folder: ${path}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to create folder");
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setFlash(null);

    try {
      const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const path = joinPath(currentPath, file.name);
      const response = await fetch("/api/storage/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, contentBase64 }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Failed to upload file");
      }
      await browsePath(currentPath);
      setFlash(`Uploaded file: ${path}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  };

  const toggleServer = async (serverName: string, enabled: boolean) => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/servers/${encodeURIComponent(serverName)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update server");
      }
      await refreshDashboard();
      setFlash(`${enabled ? "Enabled" : "Disabled"} ${serverName}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to update server");
    } finally {
      setBusy(false);
    }
  };

  const copyToClipboard = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFlash(`Copied ${label}`);
    } catch {
      setFlash(`Failed to copy ${label}`);
    }
  };

  const copyRunPayload = async () => {
    if (!selectedServer || !selectedTool || parsedToolArgs.error) return;
    await copyToClipboard(
      "run payload",
      prettyJson({
        serverName: selectedServer,
        toolName: selectedTool,
        arguments: parsedToolArgs.value,
      }),
    );
  };

  const copyRunCurl = async () => {
    if (!selectedServer || !selectedTool || parsedToolArgs.error) return;
    const payload = JSON.stringify({
      serverName: selectedServer,
      toolName: selectedTool,
      arguments: parsedToolArgs.value,
    });
    await copyToClipboard(
      "curl command",
      `curl -sS -X POST http://localhost:3000/api/runs -H 'content-type: application/json' -d '${payload}'`,
    );
  };

  const runSelectedTool = async () => {
    if (!selectedServer || !selectedTool || parsedToolArgs.error) return;

    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serverName: selectedServer,
          toolName: selectedTool,
          arguments: parsedToolArgs.value,
        }),
      });
      const payload = (await response.json()) as { error?: string; run?: RunRecord };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to run tool");
      }
      if (!payload.run) {
        throw new Error("Run completed without a returned record");
      }
      const run = payload.run;
      setDashboardData((current) => ({
        ...current,
        dashboard: {
          ...current.dashboard,
          summary: {
            ...current.dashboard.summary,
            totalRuns: current.dashboard.summary.totalRuns + 1,
          },
          runs: [run, ...current.dashboard.runs].slice(0, 12),
        },
      }));
      setSelectedRunId(run.id);
      setLastRunOutput(prettyJson(run.response));
      setFlash(`Ran ${selectedTool} on ${selectedServer}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to run tool");
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setFlash(null);

    try {
      const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
      const keywords = assetKeywords
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentBase64,
          keywords,
        }),
      });
      const payload = (await response.json()) as { error?: string; asset?: AssetRecord };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to upload asset");
      }
      setAssetKeywords("");
      await refreshDashboard();
      setFlash(`Added asset: ${file.name}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to upload asset");
    } finally {
      event.target.value = "";
      setBusy(false);
    }
  };

  const addAssetTags = async (filename: string) => {
    const keywords = (assetTagDrafts[filename] ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (keywords.length === 0) return;

    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(filename)}/tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to tag asset");
      }
      setAssetTagDrafts((current) => ({ ...current, [filename]: "" }));
      await refreshDashboard();
      setFlash(`Tagged asset: ${filename}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to tag asset");
    } finally {
      setBusy(false);
    }
  };

  const activeNavItem = navItems.find((item) => item.id === activeView) ?? navItems[0];

  const endpointRows = useMemo(
    () => endpointEntries.map(([name, url]) => ({ name, url })),
    [endpointEntries],
  );

  const storageRows = useMemo(
    () =>
      browseData.entries.map((entry) => ({
        ...entry,
        path: joinPath(browseData.path, entry.name),
      })),
    [browseData.entries, browseData.path],
  );

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="px-3 py-2 font-semibold">QLabs</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeView === item.id}
                      tooltip={item.label}
                      onClick={() => setActiveView(item.id)}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <h1 className="text-sm font-medium">{activeNavItem.label}</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline-subtle" size="sm" onClick={refreshDashboard} disabled={busy}>
              {busy ? "Refreshing..." : "Refresh"}
            </Button>
            <Button asChild variant="outline-subtle" size="sm">
              <a href="http://localhost:3000" target="_blank" rel="noreferrer">
                Open Clean Tab
              </a>
            </Button>
          </div>
        </header>

        <main className="flex flex-col gap-6 p-6">
          {flash ? (
            <Alert variant={flashVariant}>
              <AlertTitle>Workbench update</AlertTitle>
              <AlertDescription>{flash}</AlertDescription>
            </Alert>
          ) : null}

          {activeView === "overview" ? (
            <div className="flex flex-col gap-6">
              <section aria-label="Key metrics">
                <MetricGrid columns={4}>
                  <MetricCard
                    label="Healthy servers"
                    value={`${dashboardData.dashboard.summary.healthyServers}/${dashboardData.dashboard.summary.enabledServers}`}
                    description="Currently healthy among enabled services"
                    emphasis="headline"
                  />
                  <MetricCard
                    label="Storage root"
                    value={dashboardData.storageHealth.storageRoot}
                    description={dashboardData.storageHealth.ok ? "Storage API healthy" : "Storage API needs attention"}
                    className="font-mono"
                  />
                  <MetricCard
                    label="Current folder"
                    value={browseData.path || "/"}
                    description={`${rootStats.folders} folders / ${rootStats.files} files`}
                    className="font-mono"
                  />
                  <MetricCard
                    label="Attention signals"
                    value={String(dashboardData.dashboard.diagnostics.attentionCount)}
                    description="Servers that need operator review"
                  />
                </MetricGrid>
              </section>

              <section aria-label="Chart area" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Chart row goes here.
              </section>

              <Card>
                <CardHeader className="gap-2">
                  <CardTitle>Recent runs</CardTitle>
                  <CardDescription>Latest tool executions recorded by the control plane.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DataTable
                    columns={
                      [
                        {
                          id: "run",
                          header: "Run",
                          accessorFn: (row) =>
                            `${row.serverName} ${row.toolName} ${row.error ?? ""}`.trim(),
                          cell: ({ row }) => (
                            <div className="space-y-1">
                              <div className="font-medium">
                                {row.original.serverName} / {row.original.toolName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.original.error ?? "Completed and recorded."}
                              </div>
                            </div>
                          ),
                        },
                        {
                          id: "started",
                          header: "Started",
                          accessorFn: (row) => row.startedAt,
                          cell: ({ row }) => formatDateTime(row.original.startedAt),
                        },
                        {
                          id: "duration",
                          header: "Duration",
                          accessorFn: (row) => row.durationMs,
                          cell: ({ row }) => (
                            <span className="tabular-nums">{row.original.durationMs} ms</span>
                          ),
                        },
                        {
                          id: "status",
                          header: "Status",
                          accessorFn: (row) => row.status,
                          cell: ({ row }) => (
                            <StatusBadge
                              status={row.original.status === "success" ? "complete" : "failed"}
                            />
                          ),
                        },
                        {
                          id: "inspect",
                          header: "",
                          cell: ({ row }) => (
                            <Button
                              variant="outline-subtle"
                              size="sm"
                              onClick={() => setSelectedRunId(row.original.id)}
                            >
                              Inspect
                            </Button>
                          ),
                        },
                      ] satisfies ColumnDef<RunRecord>[]
                    }
                    data={dashboardData.dashboard.runs}
                    enablePagination
                    globalFilter={runsSearch}
                    onGlobalFilterChange={setRunsSearch}
                    toolbar={(table) => (
                      <FilterBar actions={<ColumnPicker table={table} />}>
                        <SearchInput value={runsSearch} onValueChange={setRunsSearch} />
                      </FilterBar>
                    )}
                  />

                  {selectedRun ? (
                    <Card className="border-dashed">
                      <CardHeader className="gap-2">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <CardTitle className="truncate text-base">
                              {selectedRun.serverName} / {selectedRun.toolName}
                            </CardTitle>
                            <CardDescription>
                              {formatDateTime(selectedRun.startedAt)} • {selectedRun.durationMs} ms
                            </CardDescription>
                          </div>
                          <StatusBadge
                            status={selectedRun.status === "success" ? "complete" : "failed"}
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="grid gap-4 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Arguments</Label>
                          <ScrollArea className="h-48 rounded-md border border-border bg-surface-muted/40 p-4">
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                              {prettyJson(selectedRun.arguments)}
                            </pre>
                          </ScrollArea>
                        </div>
                        <div className="space-y-2">
                          <Label>Response / error</Label>
                          <ScrollArea className="h-48 rounded-md border border-border bg-surface-muted/40 p-4">
                            <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                              {selectedRun.error ?? prettyJson(selectedRun.response)}
                            </pre>
                          </ScrollArea>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="gap-2">
                  <CardTitle>Endpoints</CardTitle>
                  <CardDescription>Stable local entry points for UI checks and tooling.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable
                    columns={
                      [
                        {
                          accessorKey: "name",
                          header: "Name",
                        },
                        {
                          accessorKey: "url",
                          header: "URL",
                          cell: ({ row }) => (
                            <a
                              href={row.original.url}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all font-mono text-xs text-primary underline-offset-4 hover:underline"
                            >
                              {row.original.url}
                            </a>
                          ),
                        },
                        {
                          id: "actions",
                          header: "",
                          cell: ({ row }) => (
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button asChild variant="outline-subtle" size="sm">
                                <a href={row.original.url} target="_blank" rel="noreferrer">
                                  Open
                                </a>
                              </Button>
                              <Button
                                variant="outline-subtle"
                                size="sm"
                                onClick={() => copyToClipboard(row.original.name, row.original.url)}
                              >
                                Copy
                              </Button>
                            </div>
                          ),
                        },
                      ] satisfies ColumnDef<(typeof endpointRows)[number]>[]
                    }
                    data={endpointRows}
                    enablePagination
                    globalFilter={endpointsSearch}
                    onGlobalFilterChange={setEndpointsSearch}
                    toolbar={(table) => (
                      <FilterBar actions={<ColumnPicker table={table} />}>
                        <SearchInput value={endpointsSearch} onValueChange={setEndpointsSearch} />
                      </FilterBar>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          ) : null}

          {activeView === "servers" ? (
            <Card>
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle>Service registry</CardTitle>
                    <CardDescription>Enable, disable, and inspect the health of each registered server.</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">Enabled {dashboardData.dashboard.summary.enabledServers}</Badge>
                    <Badge variant="secondary">Disabled {dashboardData.dashboard.summary.disabledServers}</Badge>
                    <Badge variant="warning">Setup {dashboardData.dashboard.summary.setupRequiredServers}</Badge>
                    <Badge variant="destructive">Attention {dashboardData.dashboard.diagnostics.attentionCount}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={
                    [
                      {
                        id: "server",
                        header: "Server",
                        accessorFn: (row) => `${row.server.name} ${row.server.url}`,
                        cell: ({ row }) => (
                          <div className="space-y-1">
                            <div className="font-medium">{row.original.server.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.original.server.url}
                            </div>
                            {row.original.note ? (
                              <div className="text-xs text-muted-foreground">{row.original.note}</div>
                            ) : null}
                            {row.original.error ? (
                              <div className="text-xs text-destructive">{row.original.error}</div>
                            ) : null}
                          </div>
                        ),
                      },
                      {
                        id: "status",
                        header: "Status",
                        accessorFn: (row) => row.status,
                        cell: ({ row }) => (
                          <div className="space-y-2">
                            <ServerStatusBadge status={row.original.status} />
                            <p className="max-w-xs text-xs text-muted-foreground">
                              {describeServerStatus(row.original)}
                            </p>
                          </div>
                        ),
                      },
                      {
                        id: "latency",
                        header: "Latency",
                        accessorFn: (row) => row.latencyMs ?? -1,
                        cell: ({ row }) => formatLatency(row.original.latencyMs),
                      },
                      {
                        id: "tools",
                        header: "Tools",
                        accessorFn: (row) => row.tools.length,
                        cell: ({ row }) => <span className="tabular-nums">{row.original.tools.length}</span>,
                      },
                      {
                        id: "links",
                        header: "Links",
                        cell: ({ row }) => (
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline-subtle" size="sm">
                              <a href={row.original.healthUrl} target="_blank" rel="noreferrer">
                                Health
                              </a>
                            </Button>
                            <Button asChild variant="outline-subtle" size="sm">
                              <a href={row.original.server.url} target="_blank" rel="noreferrer">
                                MCP
                              </a>
                            </Button>
                          </div>
                        ),
                      },
                      {
                        id: "action",
                        header: "",
                        cell: ({ row }) => (
                          <div className="flex justify-end">
                            <Button
                              variant="outline-subtle"
                              size="sm"
                              onClick={() => toggleServer(row.original.server.name, !row.original.server.enabled)}
                              disabled={busy}
                            >
                              {row.original.server.enabled ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        ),
                      },
                    ] satisfies ColumnDef<ServerStatus>[]
                  }
                  data={dashboardData.dashboard.servers}
                  enablePagination
                  globalFilter={serversSearch}
                  onGlobalFilterChange={setServersSearch}
                  toolbar={(table) => (
                    <FilterBar actions={<ColumnPicker table={table} />}>
                      <SearchInput value={serversSearch} onValueChange={setServersSearch} />
                    </FilterBar>
                  )}
                />
              </CardContent>
            </Card>
          ) : null}

          {activeView === "runner" ? (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Run MCP tools</CardTitle>
                  <CardDescription>Choose a server, inspect the tool surface, and execute with explicit JSON arguments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="server-select">Server</Label>
                    <Select value={selectedServer} onValueChange={setSelectedServer}>
                      <SelectTrigger id="server-select">
                        <SelectValue placeholder="Select a server" />
                      </SelectTrigger>
                      <SelectContent>
                        {runnableServers.map((server) => (
                          <SelectItem key={server.server.name} value={server.server.name}>
                            {server.server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tool-select">Tool</Label>
                    <Select value={selectedTool} onValueChange={setSelectedTool}>
                      <SelectTrigger id="tool-select">
                        <SelectValue placeholder="Select a tool" />
                      </SelectTrigger>
                      <SelectContent>
                        {(activeServer?.tools ?? []).map((tool) => (
                          <SelectItem key={tool.name} value={tool.name}>
                            {tool.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tool-args">Arguments JSON</Label>
                    <Textarea
                      id="tool-args"
                      className="min-h-64 font-mono text-xs"
                      value={toolArgs}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                        setToolArgs(event.target.value)
                      }
                    />
                  </div>

                  {parsedToolArgs.error ? (
                    <Alert variant="destructive">
                      <AlertTitle>Invalid JSON</AlertTitle>
                      <AlertDescription>{parsedToolArgs.error}</AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={runSelectedTool} disabled={busy || !selectedServer || !selectedTool || !!parsedToolArgs.error}>
                      Run selected tool
                    </Button>
                    <Button
                      variant="outline-subtle"
                      onClick={copyRunPayload}
                      disabled={!selectedServer || !selectedTool || !!parsedToolArgs.error}
                    >
                      Copy payload
                    </Button>
                    <Button
                      variant="outline-subtle"
                      onClick={copyRunCurl}
                      disabled={!selectedServer || !selectedTool || !!parsedToolArgs.error}
                    >
                      Copy curl
                    </Button>
                  </div>

                  {activeTool ? (
                    <Card className="border-dashed">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-base">{activeTool.name}</CardTitle>
                        <CardDescription>
                          {activeTool.description ?? "No description available for this tool."}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Label>Input schema</Label>
                        <ScrollArea className="h-40 rounded-md border border-border bg-surface-muted/40 p-4">
                          <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                            {prettyJson(activeTool.inputSchema ?? {})}
                          </pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  ) : null}
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card>
                  <CardHeader className="gap-2">
                    <CardTitle>Tool inventory</CardTitle>
                    <CardDescription>All exposed tools, searchable across servers.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      columns={
                        [
                          {
                            accessorKey: "serverName",
                            header: "Server",
                          },
                          {
                            accessorKey: "toolName",
                            header: "Tool",
                          },
                          {
                            id: "status",
                            header: "Status",
                            accessorFn: (row) => row.status,
                            cell: ({ row }) => <ServerStatusBadge status={row.original.status} />,
                          },
                          {
                            accessorKey: "description",
                            header: "Description",
                            cell: ({ row }) =>
                              row.original.description ? (
                                <span className="block max-w-[60ch] truncate text-sm text-muted-foreground">
                                  {row.original.description}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              ),
                          },
                          {
                            id: "select",
                            header: "",
                            cell: ({ row }) => (
                              <div className="flex justify-end">
                                <Button
                                  variant="outline-subtle"
                                  size="sm"
                                  disabled={!row.original.enabled || row.original.status === "setup-required"}
                                  onClick={() => {
                                    setSelectedServer(row.original.serverName);
                                    setSelectedTool(row.original.toolName);
                                  }}
                                >
                                  Select
                                </Button>
                              </div>
                            ),
                          },
                        ] satisfies ColumnDef<(typeof toolInventoryRows)[number]>[]
                      }
                      data={toolInventoryRows}
                      enablePagination
                      globalFilter={toolFilter}
                      onGlobalFilterChange={setToolFilter}
                      toolbar={(table) => (
                        <FilterBar actions={<ColumnPicker table={table} />}>
                          <SearchInput value={toolFilter} onValueChange={setToolFilter} />
                        </FilterBar>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <CardTitle>Last tool result</CardTitle>
                        <CardDescription>Structured responses stay visible for follow-up runs and debugging.</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {selectedTool || "No tool selected"}
                        </Badge>
                        <Button
                          variant="outline-subtle"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              "last run output",
                              lastRunOutput || "Run a tool to inspect output here.",
                            )
                          }
                        >
                          Copy output
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-80 rounded-md border border-border bg-surface-muted/40 p-4">
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                        {lastRunOutput || "Run a tool to inspect output here."}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {activeView === "assets" ? (
            <>
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <CardTitle>Asset registry</CardTitle>
                      <CardDescription>Upload files once, tag them, and keep the shared keyword catalog organized.</CardDescription>
                    </div>
                    <Input
                      className="w-72"
                      placeholder="Filter assets by file or keyword"
                      value={assetKeywordFilter}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setAssetKeywordFilter(event.target.value)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <Label htmlFor="asset-file">Upload asset</Label>
                    <Input id="asset-file" type="file" onChange={uploadAsset} disabled={busy} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="asset-keywords">Keywords</Label>
                    <Input
                      id="asset-keywords"
                      placeholder="hero, screenshot, dark"
                      value={assetKeywords}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setAssetKeywords(event.target.value)
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Badge variant="secondary">
                      {dashboardData.assets.assets.length} total asset
                      {dashboardData.assets.assets.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
                {filteredAssets.map((asset) => (
                  <Card key={asset.filename}>
                    <div className="border-b border-border">
                      {isImageFile(asset.filename) ? (
                        <div className="relative aspect-[16/10] bg-surface-muted">
                          <Image
                            fill
                            unoptimized
                            alt={asset.filename}
                            src={`/api/assets/files/${encodeURIComponent(asset.filename)}`}
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex aspect-[16/10] items-center justify-center bg-surface-muted text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                          File
                        </div>
                      )}
                    </div>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{asset.filename}</CardTitle>
                      <CardDescription className="break-all font-mono text-xs">
                        {asset.url}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {asset.keywords.length === 0 ? (
                          <span className="text-sm text-muted-foreground">No keywords yet.</span>
                        ) : (
                          asset.keywords.map((keyword) => (
                            <Badge key={keyword} variant="secondary">
                              {keyword}
                            </Badge>
                          ))
                        )}
                      </div>
                      <Separator />
                      <div className="flex gap-2">
                        <Input
                          placeholder="add,tags"
                          value={assetTagDrafts[asset.filename] ?? ""}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            setAssetTagDrafts((current) => ({
                              ...current,
                              [asset.filename]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          variant="outline-subtle"
                          onClick={() => addAssetTags(asset.filename)}
                          disabled={busy}
                        >
                          Tag
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredAssets.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No assets match the current filter.
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}

          {activeView === "storage" ? (
            <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Folder manager</CardTitle>
                  <CardDescription>Browse the mounted storage root, create folders, and upload files into the current path.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="storage-path">Current path</Label>
                    <Input
                      id="storage-path"
                      placeholder="examples/screenshots"
                      value={currentPath}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setCurrentPath(event.target.value)
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline-subtle" onClick={() => browsePath(currentPath)} disabled={busy}>
                      Browse
                    </Button>
                    <Button variant="outline-subtle" onClick={() => browsePath("")} disabled={busy}>
                      Root
                    </Button>
                    <Button variant="outline-subtle" onClick={() => browsePath(currentPath)} disabled={busy}>
                      Refresh folder
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="folder-name">Create folder</Label>
                    <div className="flex gap-2">
                      <Input
                        id="folder-name"
                        placeholder="new-folder"
                        value={folderName}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setFolderName(event.target.value)
                        }
                      />
                      <Button onClick={createFolder} disabled={busy}>
                        Create
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="storage-upload">Upload file into current path</Label>
                    <Input id="storage-upload" type="file" onChange={uploadFile} disabled={busy} />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <CardTitle>Current directory</CardTitle>
                        <CardDescription>Only paths inside the configured storage root are exposed.</CardDescription>
                      </div>
                      <Badge variant="secondary" className="font-mono">
                        {browseData.path || "/"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Folders"
                      value={String(rootStats.folders)}
                      description="Immediate child folders"
                    />
                    <MetricCard
                      label="Files"
                      value={String(rootStats.files)}
                      description="Immediate child files"
                    />
                    <MetricCard
                      label="Storage health"
                      value={dashboardData.storageHealth.ok ? "Healthy" : "Attention"}
                      description={dashboardData.storageHealth.storageRoot}
                    />
                    <MetricCard
                      label="Browse target"
                      value={browseData.path || "/"}
                      description="Active operator context"
                      className="font-mono"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Folder contents</CardTitle>
                    <CardDescription>Open folders inline or download individual files.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {browseData.entries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">This folder is empty.</p>
                    ) : (
                      <DataTable
                        columns={
                          [
                            {
                              accessorKey: "name",
                              header: "Name",
                              cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
                            },
                            {
                              accessorKey: "kind",
                              header: "Kind",
                              cell: ({ row }) => (
                                <Badge variant={row.original.kind === "folder" ? "secondary" : "outline"}>
                                  {row.original.kind}
                                </Badge>
                              ),
                            },
                            {
                              id: "action",
                              header: "",
                              cell: ({ row }) => (
                                <div className="flex justify-end">
                                  {row.original.kind === "folder" ? (
                                    <Button
                                      variant="outline-subtle"
                                      size="sm"
                                      onClick={() => browsePath(row.original.path)}
                                      disabled={busy}
                                    >
                                      Open
                                    </Button>
                                  ) : (
                                    <Button asChild variant="outline-subtle" size="sm">
                                      <a href={`/api/storage/files?path=${encodeURIComponent(row.original.path)}`}>
                                        Download
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              ),
                            },
                          ] satisfies ColumnDef<(typeof storageRows)[number]>[]
                        }
                        data={storageRows
                          .slice()
                          .sort(
                            (left, right) =>
                              left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
                          )}
                        enablePagination
                        globalFilter={storageSearch}
                        onGlobalFilterChange={setStorageSearch}
                        toolbar={(table) => (
                          <FilterBar actions={<ColumnPicker table={table} />}>
                            <SearchInput value={storageSearch} onValueChange={setStorageSearch} />
                          </FilterBar>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ServerStatusBadge(props: { status: ServerStatus["status"] }) {
  if (props.status === "healthy") {
    return <Badge variant="success">Healthy</Badge>;
  }
  if (props.status === "disabled") {
    return <Badge variant="secondary">Disabled</Badge>;
  }
  if (props.status === "setup-required") {
    return <Badge variant="warning">Setup required</Badge>;
  }
  return <Badge variant="destructive">Attention</Badge>;
}
