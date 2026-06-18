"use client";

import Image from "next/image";
import type {
  ChangeEvent,
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
} from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
  StatePanel,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@brand/ui";
import {
  ChevronRight,
  ExternalLink,
  File,
  Folder,
  Grid2X2,
  ImageIcon,
  Info,
  List,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import {
  CommandBar,
  CompactBadge,
  EnterpriseHeader,
  EnterprisePage,
  Panel,
} from "./enterprise";
import { formatFileTimestamp } from "./format";
import type { AssetRecord, ServerStatus } from "./types";

type AssetSource = "qps" | "uploaded";
type BrowseEntry = { name: string; kind: "folder" | "file"; path: string };
type BrowsePayload = { path: string; entries: BrowseEntry[] };
type QpsMeta = {
  ok: boolean;
  write_mode?: "read-only" | "metadata";
  kind?: "icon" | "product" | "brand-art" | string;
  stat?: { size: number; mtimeMs: number };
  icon?: { tags?: string[] };
  product?: { tags?: string[] };
  art?: { tags?: string[] };
};

const isImageFile = (filename: string) =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);

const responseExcerpt = (text: string) =>
  text.replace(/\s+/g, " ").trim().slice(0, 140);

const readJsonResponse = async <T,>(
  response: Response,
  fallbackMessage: string,
) => {
  const text = await response.text();
  if (!text) {
    if (!response.ok) throw new Error(`${fallbackMessage} (${response.status})`);
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

const expectJsonResponse = async <T,>(
  response: Response,
  fallbackMessage: string,
) => {
  const payload = await readJsonResponse<T>(response, fallbackMessage);
  if (!response.ok) {
    throw new Error(payload.error ?? `${fallbackMessage} (${response.status})`);
  }
  return payload;
};

const fetchBrowse = async (targetPath: string) => {
  const response = await fetch(
    `/api/qps-assets/browse?path=${encodeURIComponent(targetPath)}`,
    { cache: "no-store" },
  );
  return expectJsonResponse<BrowsePayload>(response, "Browse failed");
};

const fetchMeta = async (targetPath: string) => {
  const response = await fetch(
    `/api/qps-assets/meta?path=${encodeURIComponent(targetPath)}`,
    { cache: "no-store" },
  );
  const payload = await expectJsonResponse<QpsMeta>(response, "Meta failed");
  if (!payload.ok) throw new Error(payload.error ?? "Meta failed");
  return payload;
};

const saveMeta = async (targetPath: string, patch: unknown) => {
  const response = await fetch(
    `/api/qps-assets/meta?path=${encodeURIComponent(targetPath)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  const payload = await expectJsonResponse<QpsMeta>(response, "Save failed");
  if (!payload.ok) throw new Error(payload.error ?? "Save failed");
  return payload;
};

const normTag = (value: string) => value.trim().toLowerCase();

export type AssetsWorkspaceProps = {
  assetKeywordFilter: string;
  assetKeywords: string;
  assetTagDrafts: Record<string, string>;
  assetViewMode: AssetSource;
  busy: boolean;
  filteredAssets: AssetRecord[];
  onAddAssetTags: (filename: string) => void;
  onAssetKeywordFilterChange: (value: string) => void;
  onAssetKeywordsChange: (value: string) => void;
  onAssetTagDraftChange: (filename: string, value: string) => void;
  onAssetViewModeChange: (value: AssetSource) => void;
  onDeleteAsset: (filename: string) => void;
  onUploadAsset: (event: ChangeEvent<HTMLInputElement>) => void;
  qpsToolkitServer: ServerStatus | null;
  totalAssets: number;
};

type AssetsWorkspaceProviderProps = AssetsWorkspaceProps & {
  active: boolean;
  children: ReactNode;
};

type AssetsWorkspaceContextValue = AssetsWorkspaceProps & {
  deleteSelectedUploadedAsset: () => void;
  loadQpsPath: (path: string) => Promise<void>;
  qpsBrowseByPath: Record<string, BrowsePayload>;
  qpsBusy: boolean;
  qpsEnabled: boolean;
  qpsError: string | null;
  qpsExpanded: Record<string, boolean>;
  qpsGalleryEntries: BrowseEntry[];
  qpsMeta: QpsMeta | null;
  qpsSelectedAsset: string | null;
  qpsSelectedFolder: string;
  qpsTagsDraft: string;
  saveQpsTags: () => Promise<void>;
  selectedQpsEntry: BrowseEntry | null;
  selectedName?: string;
  selectedUploadedAsset: AssetRecord | null;
  selectedUploadedFilename: string | null;
  setQpsExpanded: Dispatch<SetStateAction<Record<string, boolean>>>;
  setQpsSelectedAsset: (path: string | null) => void;
  setQpsSelectedFolder: (path: string) => void;
  setQpsTagsDraft: (value: string) => void;
  setSelectedUploadedFilename: (filename: string | null) => void;
  setViewMode: (mode: "grid" | "list") => void;
  uploadedKeywords: string[];
  uploadInputRef: RefObject<HTMLInputElement>;
  viewMode: "grid" | "list";
};

const AssetsWorkspaceContext = createContext<AssetsWorkspaceContextValue | null>(
  null,
);

const useAssetsWorkspace = () => {
  const context = useContext(AssetsWorkspaceContext);
  if (!context) {
    throw new Error("Assets workspace components must be rendered inside AssetsWorkspaceProvider");
  }
  return context;
};

export function AssetsWorkspaceProvider(props: AssetsWorkspaceProviderProps) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [qpsBusy, setQpsBusy] = useState(false);
  const [qpsError, setQpsError] = useState<string | null>(null);
  const [qpsExpanded, setQpsExpanded] = useState<Record<string, boolean>>({
    "": true,
  });
  const [qpsBrowseByPath, setQpsBrowseByPath] = useState<
    Record<string, BrowsePayload>
  >({});
  const [qpsSelectedFolder, setQpsSelectedFolder] = useState("");
  const [qpsSelectedAsset, setQpsSelectedAsset] = useState<string | null>(null);
  const [qpsMeta, setQpsMeta] = useState<QpsMeta | null>(null);
  const [qpsTagsDraft, setQpsTagsDraft] = useState("");
  const [selectedUploadedFilename, setSelectedUploadedFilename] = useState<
    string | null
  >(props.filteredAssets[0]?.filename ?? null);

  const qpsEnabled = Boolean(
    props.qpsToolkitServer?.enabled && props.qpsToolkitServer?.configured,
  );

  const loadQpsPath = async (path: string) => {
    setQpsBusy(true);
    setQpsError(null);
    try {
      const payload = await fetchBrowse(path);
      setQpsBrowseByPath((current) => ({ ...current, [path]: payload }));
    } catch (error) {
      setQpsError(error instanceof Error ? error.message : "Failed to browse");
    } finally {
      setQpsBusy(false);
    }
  };

  useEffect(() => {
    if (!props.active || !qpsEnabled) return;
    void loadQpsPath(qpsSelectedFolder);
  }, [props.active, qpsEnabled, qpsSelectedFolder]);

  const qpsGalleryEntries = useMemo(() => {
    const query = props.assetKeywordFilter.trim().toLowerCase();
    return (qpsBrowseByPath[qpsSelectedFolder]?.entries ?? [])
      .filter((entry) => entry.kind === "file")
      .filter((entry) =>
        query ? `${entry.name} ${entry.path}`.toLowerCase().includes(query) : true,
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [props.assetKeywordFilter, qpsBrowseByPath, qpsSelectedFolder]);

  useEffect(() => {
    if (
      qpsSelectedAsset &&
      qpsGalleryEntries.some((entry) => entry.path === qpsSelectedAsset)
    ) {
      return;
    }
    setQpsSelectedAsset(qpsGalleryEntries[0]?.path ?? null);
  }, [qpsGalleryEntries, qpsSelectedAsset]);

  useEffect(() => {
    if (
      selectedUploadedFilename &&
      props.filteredAssets.some(
        (asset) => asset.filename === selectedUploadedFilename,
      )
    ) {
      return;
    }
    setSelectedUploadedFilename(props.filteredAssets[0]?.filename ?? null);
  }, [props.filteredAssets, selectedUploadedFilename]);

  useEffect(() => {
    if (!qpsSelectedAsset || !qpsEnabled) {
      setQpsMeta(null);
      setQpsTagsDraft("");
      return;
    }

    setQpsBusy(true);
    setQpsError(null);
    setQpsMeta(null);
    fetchMeta(qpsSelectedAsset)
      .then((payload) => {
        setQpsMeta(payload);
        const tags =
          payload.kind === "icon"
            ? payload.icon?.tags ?? []
            : payload.kind === "product"
              ? payload.product?.tags ?? []
              : payload.kind === "brand-art"
                ? payload.art?.tags ?? []
                : [];
        setQpsTagsDraft(tags.join(", "));
      })
      .catch((error) =>
        setQpsError(
          error instanceof Error ? error.message : "Failed to load metadata",
        ),
      )
      .finally(() => setQpsBusy(false));
  }, [qpsEnabled, qpsSelectedAsset]);

  const selectedQpsEntry =
    qpsGalleryEntries.find((entry) => entry.path === qpsSelectedAsset) ?? null;
  const selectedUploadedAsset =
    props.filteredAssets.find(
      (asset) => asset.filename === selectedUploadedFilename,
    ) ?? null;
  const selectedName =
    props.assetViewMode === "qps" ? selectedQpsEntry?.name : selectedUploadedAsset?.filename;

  const uploadedKeywords = useMemo(
    () =>
      Array.from(
        new Set(props.filteredAssets.flatMap((asset) => asset.keywords)),
      ).sort((left, right) => left.localeCompare(right)),
    [props.filteredAssets],
  );

  const saveQpsTags = async () => {
    if (!qpsSelectedAsset || !qpsMeta) return;
    const tags = qpsTagsDraft
      .split(",")
      .map(normTag)
      .filter(Boolean);

    setQpsBusy(true);
    setQpsError(null);
    try {
      await saveMeta(qpsSelectedAsset, { tags });
      setQpsMeta(await fetchMeta(qpsSelectedAsset));
    } catch (error) {
      setQpsError(error instanceof Error ? error.message : "Failed to save tags");
    } finally {
      setQpsBusy(false);
    }
  };

  const deleteSelectedUploadedAsset = () => {
    if (!selectedUploadedAsset) return;
    const confirmed = window.confirm(
      `Delete uploaded asset "${selectedUploadedAsset.filename}"?`,
    );
    if (confirmed) props.onDeleteAsset(selectedUploadedAsset.filename);
  };

  const value: AssetsWorkspaceContextValue = {
    ...props,
    deleteSelectedUploadedAsset,
    loadQpsPath,
    qpsBrowseByPath,
    qpsBusy,
    qpsEnabled,
    qpsError,
    qpsExpanded,
    qpsGalleryEntries,
    qpsMeta,
    qpsSelectedAsset,
    qpsSelectedFolder,
    qpsTagsDraft,
    saveQpsTags,
    selectedName,
    selectedQpsEntry,
    selectedUploadedAsset,
    selectedUploadedFilename,
    setQpsExpanded,
    setQpsSelectedAsset,
    setQpsSelectedFolder,
    setQpsTagsDraft,
    setSelectedUploadedFilename,
    setViewMode,
    uploadedKeywords,
    uploadInputRef,
    viewMode,
  };

  return (
    <AssetsWorkspaceContext.Provider value={value}>
      {props.children}
    </AssetsWorkspaceContext.Provider>
  );
}

export function AssetsView() {
  const workspace = useAssetsWorkspace();
  const source = workspace.assetViewMode;

  return (
    <EnterprisePage>
      <EnterpriseHeader
        eyebrow="Documents"
        title="Assets"
        description="Manage QPS toolkit assets and uploaded files from one document-library workspace."
        meta={
          <>
            <CompactBadge
              variant={workspace.qpsEnabled ? "success" : "warning"}
            >
              {workspace.qpsEnabled ? "Toolkit mounted" : "Toolkit unavailable"}
            </CompactBadge>
            <CompactBadge variant="secondary">
              {workspace.totalAssets} uploaded
            </CompactBadge>
          </>
        }
      />

      <section id="assets-library" className="scroll-mt-4">
        <Panel
          title="Document gallery"
          description="Search, inspect, upload, delete, and tag files in the selected asset source."
          actions={
            <div className="flex items-center gap-2">
              <CompactBadge variant="secondary">
                {source === "qps"
                  ? `${workspace.qpsGalleryEntries.length} files`
                  : `${workspace.filteredAssets.length} shown`}
              </CompactBadge>
            </div>
          }
          className="flex h-[calc(100dvh-11rem)] min-h-[38rem] flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col">
              <CommandBar
                className="gap-2"
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline-subtle"
                      size="sm"
                      disabled={source !== "uploaded" || workspace.busy}
                      onClick={() => workspace.uploadInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      Upload
                    </Button>
                    <Button
                      variant="outline-subtle"
                      size="sm"
                      disabled={source !== "uploaded" || !workspace.selectedUploadedAsset || workspace.busy}
                      onClick={workspace.deleteSelectedUploadedAsset}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Refresh assets"
                      onClick={() => {
                        if (source === "qps") {
                          void workspace.loadQpsPath(workspace.qpsSelectedFolder);
                        }
                      }}
                      disabled={source === "uploaded" || workspace.qpsBusy}
                    >
                      <RefreshCw
                        className={cn("h-4 w-4", workspace.qpsBusy && "animate-spin")}
                        aria-hidden="true"
                      />
                    </Button>
                    <ToggleGroup
                      type="single"
                      value={workspace.viewMode}
                      onValueChange={(value) => {
                        if (value === "grid" || value === "list") {
                          workspace.setViewMode(value);
                        }
                      }}
                      variant="segmented"
                      size="sm"
                    >
                      <ToggleGroupItem value="grid" aria-label="Grid view">
                        <Grid2X2 className="h-4 w-4" aria-hidden="true" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="list" aria-label="List view">
                        <List className="h-4 w-4" aria-hidden="true" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                }
              >
                <Input
                  className="w-72 max-w-full"
                  placeholder="Search files or tags..."
                  value={workspace.assetKeywordFilter}
                  onChange={(event) =>
                    workspace.onAssetKeywordFilterChange(event.target.value)
                  }
                />
                {source === "uploaded" ? (
                  <>
                    <Input
                      className="w-64 max-w-full"
                      placeholder="Default upload tags..."
                      value={workspace.assetKeywords}
                      onChange={(event) =>
                        workspace.onAssetKeywordsChange(event.target.value)
                      }
                    />
                    <input
                      ref={workspace.uploadInputRef}
                      type="file"
                      className="hidden"
                      onChange={workspace.onUploadAsset}
                      disabled={workspace.busy}
                    />
                  </>
                ) : (
                  <CompactBadge variant="secondary">
                    QPS files are read-only except metadata tags
                  </CompactBadge>
                )}
              </CommandBar>

              {source === "qps" ? (
                <QpsContentPane
                  enabled={workspace.qpsEnabled}
                  error={workspace.qpsError}
                  entries={workspace.qpsGalleryEntries}
                  selectedPath={workspace.qpsSelectedAsset}
                  viewMode={workspace.viewMode}
                  onSelect={workspace.setQpsSelectedAsset}
                  note={workspace.qpsToolkitServer?.note}
                />
              ) : (
                <UploadedContentPane
                  assets={workspace.filteredAssets}
                  selectedFilename={workspace.selectedUploadedFilename}
                  viewMode={workspace.viewMode}
                  onSelect={workspace.setSelectedUploadedFilename}
                />
              )}
          </div>
        </Panel>
      </section>
    </EnterprisePage>
  );
}

export function AssetsSecondaryNavigation() {
  const workspace = useAssetsWorkspace();

  return (
    <AssetNavigationPane
      source={workspace.assetViewMode}
      onSourceChange={workspace.onAssetViewModeChange}
      qpsEnabled={workspace.qpsEnabled}
      qpsExpanded={workspace.qpsExpanded}
      qpsBrowseByPath={workspace.qpsBrowseByPath}
      qpsSelectedFolder={workspace.qpsSelectedFolder}
      onQpsFolderSelect={workspace.setQpsSelectedFolder}
      onQpsFolderToggle={async (folderPath) => {
        const next = !workspace.qpsExpanded[folderPath];
        workspace.setQpsExpanded((current) => ({
          ...current,
          [folderPath]: next,
        }));
        if (next && !workspace.qpsBrowseByPath[folderPath]) {
          await workspace.loadQpsPath(folderPath);
        }
      }}
      uploadedKeywords={workspace.uploadedKeywords}
      activeUploadedFilter={workspace.assetKeywordFilter}
      onUploadedFilterChange={workspace.onAssetKeywordFilterChange}
    />
  );
}

export function AssetsContextPanel() {
  const workspace = useAssetsWorkspace();
  const source = workspace.assetViewMode;
  const selectedUploadedAsset = workspace.selectedUploadedAsset;

  return (
    <AssetInspector
      source={source}
      selectedName={workspace.selectedName}
      qpsBusy={workspace.qpsBusy}
      qpsError={workspace.qpsError}
      qpsEntry={workspace.selectedQpsEntry}
      qpsMeta={workspace.qpsMeta}
      qpsTagsDraft={workspace.qpsTagsDraft}
      onQpsTagsDraftChange={workspace.setQpsTagsDraft}
      onSaveQpsTags={workspace.saveQpsTags}
      uploadedAsset={selectedUploadedAsset}
      uploadedTagDraft={
        selectedUploadedAsset
          ? workspace.assetTagDrafts[selectedUploadedAsset.filename] ?? ""
          : ""
      }
      onUploadedTagDraftChange={(value) => {
        if (selectedUploadedAsset) {
          workspace.onAssetTagDraftChange(
            selectedUploadedAsset.filename,
            value,
          );
        }
      }}
      onAddUploadedTags={() => {
        if (selectedUploadedAsset) {
          workspace.onAddAssetTags(selectedUploadedAsset.filename);
        }
      }}
      onDeleteUploadedAsset={workspace.deleteSelectedUploadedAsset}
      busy={workspace.busy}
    />
  );
}

function AssetNavigationPane(props: {
  source: AssetSource;
  onSourceChange: (source: AssetSource) => void;
  qpsEnabled: boolean;
  qpsExpanded: Record<string, boolean>;
  qpsBrowseByPath: Record<string, BrowsePayload>;
  qpsSelectedFolder: string;
  onQpsFolderSelect: (path: string) => void;
  onQpsFolderToggle: (path: string) => Promise<void>;
  uploadedKeywords: string[];
  activeUploadedFilter: string;
  onUploadedFilterChange: (filter: string) => void;
}) {
  const rootFolders =
    props.qpsBrowseByPath[""]?.entries.filter((entry) => entry.kind === "folder") ??
    [];

  const renderFolder = (entry: BrowseEntry, depth: number): JSX.Element => {
    const isExpanded = Boolean(props.qpsExpanded[entry.path]);
    const children =
      props.qpsBrowseByPath[entry.path]?.entries.filter(
        (child) => child.kind === "folder",
      ) ?? [];
    const isSelected = props.qpsSelectedFolder === entry.path;

    return (
      <div key={entry.path}>
        <div className="flex items-center gap-1" style={{ paddingLeft: depth * 12 }}>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            onClick={() => void props.onQpsFolderToggle(entry.path)}
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 transition-transform",
                isExpanded && "rotate-90",
              )}
              aria-hidden="true"
            />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "ghost"}
            className="h-7 min-w-0 flex-1 justify-start gap-2 px-2"
            onClick={() => props.onQpsFolderSelect(entry.path)}
          >
            <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{entry.name}</span>
          </Button>
        </div>
        {isExpanded
          ? children.map((child) => renderFolder(child, depth + 1))
          : null}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-b p-3">
        <ToggleGroup
          type="single"
          value={props.source}
          onValueChange={(value) => {
            if (value === "qps" || value === "uploaded") props.onSourceChange(value);
          }}
          variant="segmented"
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="qps" className="min-w-0 flex-1">
            QPS
          </ToggleGroupItem>
          <ToggleGroupItem value="uploaded" className="min-w-0 flex-1">
            Uploaded
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1 p-3">
        {props.source === "qps" ? (
          props.qpsEnabled ? (
            <div className="space-y-1">
              <Button
                type="button"
                size="sm"
                variant={props.qpsSelectedFolder === "" ? "secondary" : "ghost"}
                className="h-7 w-full justify-start gap-2 px-2"
                onClick={() => props.onQpsFolderSelect("")}
              >
                <Folder className="h-4 w-4" aria-hidden="true" />
                /
              </Button>
              {rootFolders.map((entry) => renderFolder(entry, 0))}
            </div>
          ) : (
            <StatePanel
              kind="empty"
              size="sm"
              title="QPS unavailable"
              description="The toolkit source is not mounted."
            />
          )
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Button
                type="button"
                size="sm"
                variant={!props.activeUploadedFilter ? "secondary" : "ghost"}
                className="h-7 w-full justify-start gap-2 px-2"
                onClick={() => props.onUploadedFilterChange("")}
              >
                <Folder className="h-4 w-4" aria-hidden="true" />
                Uploaded assets
              </Button>
            </div>
            <div>
              <div className="px-2 pb-1 text-[11px] font-medium uppercase text-muted-foreground">
                Tags
              </div>
              <div className="space-y-1">
                {props.uploadedKeywords.slice(0, 18).map((keyword) => (
                  <Button
                    key={keyword}
                    type="button"
                    size="sm"
                    variant={
                      props.activeUploadedFilter === keyword ? "secondary" : "ghost"
                    }
                    className="h-7 w-full justify-start gap-2 px-2"
                    onClick={() => props.onUploadedFilterChange(keyword)}
                  >
                    <Tag className="h-4 w-4" aria-hidden="true" />
                    <span className="truncate">{keyword}</span>
                  </Button>
                ))}
                {props.uploadedKeywords.length === 0 ? (
                  <p className="px-2 text-xs text-muted-foreground">
                    No uploaded tags yet.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function QpsContentPane(props: {
  enabled: boolean;
  error: string | null;
  entries: BrowseEntry[];
  selectedPath: string | null;
  viewMode: "grid" | "list";
  onSelect: (path: string) => void;
  note?: string;
}) {
  if (!props.enabled) {
    return (
      <div className="p-4">
        <StatePanel
          kind="empty"
          title="QPS toolkit is not available"
          description={props.note ?? "mcp-qps-toolkit is not enabled or configured."}
        />
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="p-4">
        <StatePanel kind="error" title="QPS toolkit error" description={props.error} />
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1 p-4">
      {props.entries.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No files found"
          description="Try a different folder or change the search."
        />
      ) : props.viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
          {props.entries.map((entry) => (
            <FileTile
              key={entry.path}
              name={entry.name}
              path={entry.path}
              previewUrl={`/api/qps-assets/file?path=${encodeURIComponent(entry.path)}`}
              selected={props.selectedPath === entry.path}
              onSelect={() => props.onSelect(entry.path)}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {props.entries.map((entry) => (
            <FileRow
              key={entry.path}
              name={entry.name}
              path={entry.path}
              badge={isImageFile(entry.name) ? "Preview" : "File"}
              selected={props.selectedPath === entry.path}
              onSelect={() => props.onSelect(entry.path)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

function UploadedContentPane(props: {
  assets: AssetRecord[];
  selectedFilename: string | null;
  viewMode: "grid" | "list";
  onSelect: (filename: string) => void;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1 p-4">
      {props.assets.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No uploaded assets found"
          description="Upload a file or clear the current search."
        />
      ) : props.viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
          {props.assets.map((asset) => (
            <FileTile
              key={asset.filename}
              name={asset.filename}
              path={asset.url}
              previewUrl={`/api/assets/files/${encodeURIComponent(asset.filename)}`}
              selected={props.selectedFilename === asset.filename}
              tagCount={asset.keywords.length}
              onSelect={() => props.onSelect(asset.filename)}
            />
          ))}
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {props.assets.map((asset) => (
            <FileRow
              key={asset.filename}
              name={asset.filename}
              path={asset.url}
              badge={`${asset.keywords.length} tags`}
              selected={props.selectedFilename === asset.filename}
              onSelect={() => props.onSelect(asset.filename)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

function AssetInspector(props: {
  source: AssetSource;
  selectedName?: string;
  qpsBusy: boolean;
  qpsError: string | null;
  qpsEntry: BrowseEntry | null;
  qpsMeta: QpsMeta | null;
  qpsTagsDraft: string;
  onQpsTagsDraftChange: (value: string) => void;
  onSaveQpsTags: () => void;
  uploadedAsset: AssetRecord | null;
  uploadedTagDraft: string;
  onUploadedTagDraftChange: (value: string) => void;
  onAddUploadedTags: () => void;
  onDeleteUploadedAsset: () => void;
  busy: boolean;
}) {
  const qpsTags =
    props.qpsMeta?.kind === "icon"
      ? props.qpsMeta.icon?.tags ?? []
      : props.qpsMeta?.kind === "product"
        ? props.qpsMeta.product?.tags ?? []
        : props.qpsMeta?.kind === "brand-art"
          ? props.qpsMeta.art?.tags ?? []
          : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-5">Inspector</h3>
          <p className="truncate text-xs text-muted-foreground">
            {props.selectedName ?? "No file selected"}
          </p>
        </div>
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <ScrollArea className="min-h-0 flex-1 p-4">
        {props.source === "qps" ? (
          <QpsInspectorBody
            busy={props.qpsBusy}
            error={props.qpsError}
            entry={props.qpsEntry}
            meta={props.qpsMeta}
            tags={qpsTags}
            tagsDraft={props.qpsTagsDraft}
            onTagsDraftChange={props.onQpsTagsDraftChange}
            onSaveTags={props.onSaveQpsTags}
          />
        ) : (
          <UploadedInspectorBody
            asset={props.uploadedAsset}
            busy={props.busy}
            tagDraft={props.uploadedTagDraft}
            onTagDraftChange={props.onUploadedTagDraftChange}
            onAddTags={props.onAddUploadedTags}
            onDelete={props.onDeleteUploadedAsset}
          />
        )}
      </ScrollArea>
    </div>
  );
}

function QpsInspectorBody(props: {
  busy: boolean;
  error: string | null;
  entry: BrowseEntry | null;
  meta: QpsMeta | null;
  tags: string[];
  tagsDraft: string;
  onTagsDraftChange: (value: string) => void;
  onSaveTags: () => void;
}) {
  if (props.error) {
    return <StatePanel kind="error" title="QPS toolkit error" description={props.error} />;
  }

  if (!props.entry) {
    return (
      <StatePanel
        kind="empty"
        title="Select a file"
        description="Choose a QPS asset to preview metadata."
      />
    );
  }

  return (
    <div className="space-y-4">
      {props.busy ? <StatePanel kind="loading" size="sm" loadingLabel="Loading..." /> : null}
      <PreviewFrame
        name={props.entry.name}
        src={`/api/qps-assets/file?path=${encodeURIComponent(props.entry.path)}`}
      />
      <MetadataBlock
        name={props.entry.name}
        path={props.entry.path}
        kind={props.meta?.kind}
        size={props.meta?.stat?.size}
        modified={props.meta?.stat?.mtimeMs}
      />
      <Button asChild variant="outline-subtle" size="sm">
        <a
          href={`/api/qps-assets/file?path=${encodeURIComponent(props.entry.path)}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open file
        </a>
      </Button>
      <TagEditor
        title="Metadata tags"
        tags={props.tags}
        draft={props.tagsDraft}
        onDraftChange={props.onTagsDraftChange}
        onSave={props.onSaveTags}
        disabled={props.busy || props.meta?.write_mode !== "metadata"}
        actionLabel="Save"
        note={
          props.meta?.write_mode === "metadata"
            ? "Metadata writes are enabled."
            : "This QPS file is read-only."
        }
      />
    </div>
  );
}

function UploadedInspectorBody(props: {
  asset: AssetRecord | null;
  busy: boolean;
  tagDraft: string;
  onTagDraftChange: (value: string) => void;
  onAddTags: () => void;
  onDelete: () => void;
}) {
  if (!props.asset) {
    return (
      <StatePanel
        kind="empty"
        title="Select a file"
        description="Choose an uploaded asset to preview and manage tags."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PreviewFrame
        name={props.asset.filename}
        src={`/api/assets/files/${encodeURIComponent(props.asset.filename)}`}
      />
      <MetadataBlock
        name={props.asset.filename}
        path={props.asset.url}
        kind="uploaded"
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline-subtle" size="sm">
          <a
            href={`/api/assets/files/${encodeURIComponent(props.asset.filename)}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open file
          </a>
        </Button>
        <Button
          variant="outline-subtle"
          size="sm"
          onClick={props.onDelete}
          disabled={props.busy}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
      <TagEditor
        title="Keywords"
        tags={props.asset.keywords}
        draft={props.tagDraft}
        onDraftChange={props.onTagDraftChange}
        onSave={props.onAddTags}
        disabled={props.busy}
        actionLabel="Add"
        note="Tags improve search and grouping in the uploaded library."
      />
    </div>
  );
}

function FileTile(props: {
  name: string;
  path: string;
  previewUrl: string;
  selected: boolean;
  tagCount?: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="min-w-0 rounded-md border bg-background p-2 text-start transition-colors hover:bg-surface-muted data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
      data-selected={props.selected}
      onClick={props.onSelect}
    >
      <div className="relative aspect-square overflow-hidden rounded border bg-surface-muted">
        {isImageFile(props.name) ? (
          <Image
            fill
            unoptimized
            alt={props.name}
            src={props.previewUrl}
            className="object-contain"
            sizes="(min-width: 1280px) 14vw, 45vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <File className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-medium">{props.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {props.path}
        </div>
        {typeof props.tagCount === "number" ? (
          <Badge variant="secondary" className="mt-2">
            {props.tagCount} tags
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function FileRow(props: {
  name: string;
  path: string;
  badge: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-start transition-colors hover:bg-surface-muted data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      data-selected={props.selected}
      onClick={props.onSelect}
    >
      <div className="flex min-w-0 items-center gap-2">
        <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{props.name}</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {props.path}
          </div>
        </div>
      </div>
      <Badge variant="secondary">{props.badge}</Badge>
    </button>
  );
}

function PreviewFrame(props: { name: string; src: string }) {
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-md border bg-surface-muted">
      {isImageFile(props.name) ? (
        <Image
          fill
          unoptimized
          alt={props.name}
          src={props.src}
          className="object-contain"
          sizes="320px"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function MetadataBlock(props: {
  name: string;
  path: string;
  kind?: string;
  size?: number;
  modified?: number;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="truncate text-sm font-semibold">{props.name}</div>
      <div className="break-all font-mono text-xs text-muted-foreground">
        {props.path}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {props.kind ? <Badge variant="secondary">{props.kind}</Badge> : null}
        {typeof props.size === "number" ? (
          <Badge variant="outline">{props.size} bytes</Badge>
        ) : null}
      </div>
      {typeof props.modified === "number" ? (
        <div className="text-xs text-muted-foreground">
          Modified {formatFileTimestamp(props.modified)}
        </div>
      ) : null}
    </div>
  );
}

function TagEditor(props: {
  title: string;
  tags: string[];
  draft: string;
  note: string;
  actionLabel: string;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3 border-t pt-3">
      <div>
        <Label>{props.title}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{props.note}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.tags.length === 0 ? (
          <span className="text-xs text-muted-foreground">No tags yet.</span>
        ) : (
          props.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          placeholder="comma,separated,tags"
          disabled={props.disabled}
        />
        <Button
          variant="outline-subtle"
          size="sm"
          onClick={props.onSave}
          disabled={props.disabled}
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {props.actionLabel}
        </Button>
      </div>
    </div>
  );
}
