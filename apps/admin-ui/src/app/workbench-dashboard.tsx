"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@brand/ui";
import {
  AssetsContextPanel,
  AssetsSecondaryNavigation,
  AssetsView,
  AssetsWorkspaceProvider,
} from "./workbench/assets-view";
import { prettyJson } from "./workbench/format";
import { OverviewView } from "./workbench/overview-view";
import { RunnerView, type ToolInventoryRow } from "./workbench/runner-view";
import { ServersView } from "./workbench/servers-view";
import { StorageView } from "./workbench/storage-view";
import type {
  AssetRecord,
  DashboardPayload,
  StorageBrowse,
  ViewKey,
} from "./workbench/types";
import { WorkbenchShell } from "./workbench/workbench-shell";

export type { DashboardPayload } from "./workbench/types";

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

const responseExcerpt = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, 140);

const readJsonPayload = async <T,>(
  response: Response,
  fallbackMessage: string,
) => {
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`${fallbackMessage} (${response.status})`);
    }
    return {} as T & { error?: string };
  }

  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    const excerpt = responseExcerpt(text);
    const suffix = excerpt ? `: ${excerpt}` : "";
    throw new Error(`${fallbackMessage} (${response.status})${suffix}`);
  }
};

const expectJsonPayload = async <T,>(
  response: Response,
  fallbackMessage: string,
) => {
  const payload = await readJsonPayload<T>(response, fallbackMessage);
  if (!response.ok) {
    throw new Error(payload.error ?? `${fallbackMessage} (${response.status})`);
  }
  return payload;
};

const assertJsonOk = async (response: Response, fallbackMessage: string) => {
  if (response.ok) return;
  const payload = await readJsonPayload<{ error?: string }>(
    response,
    fallbackMessage,
  );
  throw new Error(payload.error ?? `${fallbackMessage} (${response.status})`);
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
  const [lastRunOutput, setLastRunOutput] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(props.initialData.dashboard.runs[0]?.id ?? "");
  const [assetKeywordFilter, setAssetKeywordFilter] = useState("");
  const [assetUploadTags, setAssetUploadTags] = useState<string[]>([]);

  const flashVariant =
    flash && /failed|error/i.test(flash)
      ? "destructive"
      : flash && /created|uploaded|added|enabled|disabled|tagged|ran|copied/i.test(flash)
        ? "success"
        : "info";

  const refreshDashboard = async () => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await expectJsonPayload<DashboardPayload>(
        response,
        "Failed to refresh dashboard",
      );
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

  const toolInventoryRows = useMemo<ToolInventoryRow[]>(
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
        asset.path.toLowerCase().includes(filter) ||
        asset.title.toLowerCase().includes(filter) ||
        asset.kind.toLowerCase().includes(filter) ||
        (asset.tags ?? asset.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(filter)),
    );
  }, [assetKeywordFilter, dashboardData.assets.assets]);

  const endpointRows = useMemo(() => {
    const entries = { ...staticEndpointMap } satisfies Record<string, string>;
    for (const server of dashboardData.dashboard.servers) {
      const mappedUrl = serverEndpointMap[server.server.name];
      if (mappedUrl) entries[server.server.name] = mappedUrl;
    }
    return Object.entries(entries).map(([name, url]) => ({ name, url }));
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

  const storageRows = useMemo(
    () =>
      browseData.entries.map((entry) => ({
        ...entry,
        path: joinPath(browseData.path, entry.name),
      })),
    [browseData.entries, browseData.path],
  );

  const browsePath = async (path: string) => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/storage/browse?path=${encodeURIComponent(path)}`, {
        cache: "no-store",
      });
      const payload = await expectJsonPayload<StorageBrowse>(
        response,
        "Failed to browse storage",
      );
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
      await assertJsonOk(response, "Failed to create folder");
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
      await assertJsonOk(response, "Failed to upload file");
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
      await assertJsonOk(response, "Failed to update server");
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
      const payload = await expectJsonPayload<{
        error?: string;
        run?: DashboardPayload["dashboard"]["runs"][number];
      }>(response, "Failed to run tool");
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
      setLastRunOutput(prettyJson(run.error ?? run.response));
      setFlash(`Ran ${selectedTool} on ${selectedServer}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to run tool");
    } finally {
      setBusy(false);
    }
  };

  const uploadAsset = async (
    assetPath: string,
    file: File,
    metadata: { tags: string[] },
  ) => {
    setBusy(true);
    setFlash(null);

    try {
      const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());

      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: assetPath,
          contentBase64,
          metadata,
        }),
      });
      await expectJsonPayload<{ error?: string; asset?: AssetRecord }>(
        response,
        "Failed to upload asset",
      );
      setAssetUploadTags([]);
      await refreshDashboard();
      setFlash(`Added asset: ${assetPath}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to upload asset");
    } finally {
      setBusy(false);
    }
  };

  const updateAssetMetadata = async (
    assetPath: string,
    metadata: { title?: string; kind?: string; tags?: string[] },
  ) => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/assets/meta?path=${encodeURIComponent(assetPath)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metadata }),
      });
      await assertJsonOk(response, "Failed to update asset metadata");
      await refreshDashboard();
      setFlash(`Updated asset: ${assetPath}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to update asset metadata");
    } finally {
      setBusy(false);
    }
  };

  const deleteAsset = async (assetPath: string) => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch(`/api/assets?path=${encodeURIComponent(assetPath)}`, {
        method: "DELETE",
      });
      await assertJsonOk(response, "Failed to delete asset");
      await refreshDashboard();
      setFlash(`Deleted asset: ${assetPath}`);
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to delete asset");
    } finally {
      setBusy(false);
    }
  };

  const importQpsAssets = async () => {
    setBusy(true);
    setFlash(null);

    try {
      const response = await fetch("/api/assets/import/qps", { method: "POST" });
      const payload = await expectJsonPayload<{
        imported?: number;
        skipped?: number;
        total?: number;
      }>(response, "Failed to import QPS assets");
      await refreshDashboard();
      setFlash(
        `Imported ${payload.imported ?? 0} QPS assets; skipped ${payload.skipped ?? 0} existing assets.`,
      );
    } catch (error) {
      setFlash(error instanceof Error ? error.message : "Failed to import QPS assets");
    } finally {
      setBusy(false);
    }
  };

  const selectTool = (serverName: string, toolName: string) => {
    setSelectedServer(serverName);
    setSelectedTool(toolName);
  };

  return (
    <AssetsWorkspaceProvider
      allAssets={dashboardData.assets.assets}
      assetKeywordFilter={assetKeywordFilter}
      assetUploadTags={assetUploadTags}
      busy={busy}
      filteredAssets={filteredAssets}
      onAssetKeywordFilterChange={setAssetKeywordFilter}
      onAssetUploadTagsChange={setAssetUploadTags}
      onDeleteAsset={deleteAsset}
      onImportQpsAssets={importQpsAssets}
      onUpdateAssetMetadata={updateAssetMetadata}
      onUploadAsset={uploadAsset}
      totalAssets={dashboardData.assets.assets.length}
    >
      <WorkbenchShell
        activeView={activeView}
        busy={busy}
        contextPanel={activeView === "assets" ? <AssetsContextPanel /> : undefined}
        onRefresh={refreshDashboard}
        onViewChange={setActiveView}
        secondaryContent={
          activeView === "assets" ? <AssetsSecondaryNavigation /> : undefined
        }
        secondaryWidthClassName={activeView === "assets" ? "w-80" : undefined}
      >
        {flash ? (
          <Alert variant={flashVariant} className="mb-6">
            <AlertTitle>Workbench update</AlertTitle>
            <AlertDescription>{flash}</AlertDescription>
          </Alert>
        ) : null}

      {activeView === "overview" ? (
        <OverviewView
          endpointRows={endpointRows}
          endpointsSearch={endpointsSearch}
          onCopyEndpoint={copyToClipboard}
          onEndpointsSearchChange={setEndpointsSearch}
          onRunsSearchChange={setRunsSearch}
          onSelectRun={setSelectedRunId}
          payload={dashboardData}
          rootStats={rootStats}
          runsSearch={runsSearch}
          selectedRun={selectedRun}
        />
      ) : null}

      {activeView === "servers" ? (
        <ServersView
          busy={busy}
          dashboard={dashboardData.dashboard}
          onSearchChange={setServersSearch}
          onToggleServer={toggleServer}
          search={serversSearch}
        />
      ) : null}

      {activeView === "runner" ? (
        <RunnerView
          activeServer={activeServer}
          activeTool={activeTool}
          busy={busy}
          lastRunOutput={lastRunOutput}
          onCopyCurl={copyRunCurl}
          onCopyOutput={() =>
            copyToClipboard("last run output", lastRunOutput || "Run a tool to inspect output here.")
          }
          onCopyPayload={copyRunPayload}
          onRunSelectedTool={runSelectedTool}
          onSelectServer={setSelectedServer}
          onSelectedToolChange={setSelectedTool}
          onSelectTool={selectTool}
          onToolArgsChange={setToolArgs}
          onToolFilterChange={setToolFilter}
          parsedToolArgs={parsedToolArgs}
          runnableServers={runnableServers}
          selectedServer={selectedServer}
          selectedTool={selectedTool}
          toolArgs={toolArgs}
          toolFilter={toolFilter}
          toolInventoryRows={toolInventoryRows}
        />
      ) : null}

      {activeView === "assets" ? (
        <AssetsView />
      ) : null}

      {activeView === "storage" ? (
        <StorageView
          browseData={browseData}
          busy={busy}
          currentPath={currentPath}
          dashboardData={dashboardData}
          folderName={folderName}
          onBrowsePath={browsePath}
          onCreateFolder={createFolder}
          onCurrentPathChange={setCurrentPath}
          onFolderNameChange={setFolderName}
          onStorageSearchChange={setStorageSearch}
          onUploadFile={uploadFile}
          rootStats={rootStats}
          storageRows={storageRows}
          storageSearch={storageSearch}
        />
      ) : null}
      </WorkbenchShell>
    </AssetsWorkspaceProvider>
  );
}
