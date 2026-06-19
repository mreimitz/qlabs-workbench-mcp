"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadList,
  Input,
  Label,
  ScrollArea,
  StatePanel,
  TagInput,
  ToggleGroup,
  ToggleGroupItem,
  Tree,
  type TreeNode,
  type UploadFile,
} from "@brand/ui";
import {
  Download,
  Eye,
  File,
  Folder,
  Grid2X2,
  ImageIcon,
  Info,
  List,
  Save,
  Search,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import {
  CommandBar,
  CompactBadge,
  EnterprisePage,
  Panel,
} from "./enterprise";
import {
  assetTags,
  buildAssetFolderTree,
  formatAssetFolderPath,
  folderIdToPath,
  IMAGE_LIBRARY_NODE_ID,
  joinAssetPath,
  pathToFolderId,
  TEMPLATE_LIBRARY_NODE_ID,
  type AssetFolderNode,
} from "./assets-helpers";
import { formatFileTimestamp } from "./format";
import type { AssetRecord } from "./types";

type AssetMetadataPatch = {
  title?: string;
  kind?: string;
  tags?: string[];
};

type MetadataDraft = {
  title: string;
  kind: string;
  tags: string[];
};

const isImageAsset = (asset: AssetRecord) =>
  asset.mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.path);

export type AssetsWorkspaceProps = {
  allAssets: AssetRecord[];
  assetKeywordFilter: string;
  assetUploadTags: string[];
  busy: boolean;
  filteredAssets: AssetRecord[];
  onAssetKeywordFilterChange: (value: string) => void;
  onAssetUploadTagsChange: (value: string[]) => void;
  onDeleteAsset: (path: string) => Promise<void>;
  onImportQpsAssets: () => Promise<void>;
  onUpdateAssetMetadata: (path: string, metadata: AssetMetadataPatch) => Promise<void>;
  onUploadAsset: (
    path: string,
    file: File,
    metadata: { tags: string[] },
  ) => Promise<void>;
  totalAssets: number;
};

type AssetsWorkspaceProviderProps = AssetsWorkspaceProps & {
  children: ReactNode;
};

type AssetsWorkspaceContextValue = AssetsWorkspaceProps & {
  currentFolder: string;
  deleteSelectedAsset: () => Promise<void>;
  folderTree: TreeNode<{ path: string }>[];
  folderTreeExpandedIds: string[];
  galleryAssets: AssetRecord[];
  metadataDraft: MetadataDraft;
  onUploadFilesChange: (files: UploadFile[]) => void;
  saveSelectedMetadata: () => Promise<void>;
  selectedAsset: AssetRecord | null;
  selectedAssetPath: string | null;
  setCurrentFolder: (path: string) => void;
  setFolderTreeExpandedIds: (ids: string[]) => void;
  setMetadataDraft: (draft: MetadataDraft) => void;
  setSelectedAssetPath: (path: string | null) => void;
  setUploadDialogOpen: (open: boolean) => void;
  setViewMode: (mode: "grid" | "list") => void;
  uploadDialogOpen: boolean;
  uploadFiles: UploadFile[];
  viewMode: "grid" | "list";
};

const AssetsWorkspaceContext = createContext<AssetsWorkspaceContextValue | null>(null);

const useAssetsWorkspace = () => {
  const context = useContext(AssetsWorkspaceContext);
  if (!context) {
    throw new Error("Assets workspace components must be rendered inside AssetsWorkspaceProvider");
  }
  return context;
};

const decorateFolderTree = (nodes: AssetFolderNode[]): TreeNode<{ path: string }>[] =>
  nodes.map((node) => ({
    id: node.id,
    label: node.label,
    icon: <Folder className="size-4 text-muted-foreground" aria-hidden="true" />,
    data: { path: folderIdToPath(node.id) },
    children: node.children ? decorateFolderTree(node.children) : undefined,
  }));

const collectFolderIds = (nodes: TreeNode<{ path: string }>[]) => {
  const ids: string[] = [];
  const visit = (node: TreeNode<{ path: string }>) => {
    ids.push(node.id);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return ids;
};

export function AssetsWorkspaceProvider(props: AssetsWorkspaceProviderProps) {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentFolder, setCurrentFolder] = useState("");
  const [folderTreeExpandedIds, setFolderTreeExpandedIds] = useState<string[]>([
    IMAGE_LIBRARY_NODE_ID,
    TEMPLATE_LIBRARY_NODE_ID,
  ]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [selectedAssetPath, setSelectedAssetPath] = useState<string | null>(
    props.filteredAssets[0]?.path ?? null,
  );
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft>({
    title: "",
    kind: "",
    tags: [],
  });

  const folderTree = useMemo(
    () => decorateFolderTree(buildAssetFolderTree(props.allAssets)),
    [props.allAssets],
  );
  const folderIds = useMemo(() => collectFolderIds(folderTree), [folderTree]);
  const galleryAssets = useMemo(
    () =>
      props.filteredAssets
        .filter((asset) => {
          if (!currentFolder) return !asset.path.includes("/");
          return asset.path.startsWith(`${currentFolder}/`) &&
            !asset.path.slice(currentFolder.length + 1).includes("/");
        })
        .sort((left, right) => left.path.localeCompare(right.path)),
    [currentFolder, props.filteredAssets],
  );
  const selectedAsset =
    props.allAssets.find((asset) => asset.path === selectedAssetPath) ?? null;

  useEffect(() => {
    if (selectedAssetPath && props.allAssets.some((asset) => asset.path === selectedAssetPath)) {
      return;
    }
    setSelectedAssetPath(galleryAssets[0]?.path ?? props.filteredAssets[0]?.path ?? null);
  }, [galleryAssets, props.allAssets, props.filteredAssets, selectedAssetPath]);

  useEffect(() => {
    setMetadataDraft({
      title: selectedAsset?.title ?? "",
      kind: selectedAsset?.kind ?? "",
      tags: selectedAsset ? assetTags(selectedAsset) : [],
    });
  }, [selectedAsset]);

  useEffect(() => {
    setFolderTreeExpandedIds((current) =>
      Array.from(
        new Set([
          IMAGE_LIBRARY_NODE_ID,
          TEMPLATE_LIBRARY_NODE_ID,
          ...current.filter((id) => folderIds.includes(id)),
        ]),
      ),
    );
  }, [folderIds]);

  const onUploadFilesChange = (files: UploadFile[]) => {
    setUploadFiles(files);
    const uploadFile = files.at(-1);
    if (!uploadFile) return;
    try {
      void props
        .onUploadAsset(joinAssetPath(currentFolder, uploadFile.file.name), uploadFile.file, {
          tags: props.assetUploadTags,
        })
        .finally(() => {
          setUploadFiles([]);
          setUploadDialogOpen(false);
        });
    } catch {
      setUploadFiles([]);
    }
  };

  const saveSelectedMetadata = async () => {
    if (!selectedAsset) return;
    await props.onUpdateAssetMetadata(selectedAsset.path, {
      title: metadataDraft.title,
      kind: metadataDraft.kind,
      tags: metadataDraft.tags,
    });
  };

  const deleteSelectedAsset = async () => {
    if (!selectedAsset) return;
    await props.onDeleteAsset(selectedAsset.path);
  };

  return (
    <AssetsWorkspaceContext.Provider
      value={{
        ...props,
        currentFolder,
        deleteSelectedAsset,
        folderTree,
        folderTreeExpandedIds,
        galleryAssets,
        metadataDraft,
        onUploadFilesChange,
        saveSelectedMetadata,
        selectedAsset,
        selectedAssetPath,
        setCurrentFolder,
        setFolderTreeExpandedIds,
        setMetadataDraft,
        setSelectedAssetPath,
        setUploadDialogOpen,
        setViewMode,
        uploadDialogOpen,
        uploadFiles,
        viewMode,
      }}
    >
      {props.children}
    </AssetsWorkspaceContext.Provider>
  );
}

export function AssetsView() {
  const workspace = useAssetsWorkspace();

  return (
    <EnterprisePage>
      <section id="assets-library" className="scroll-mt-4">
        <Panel
          title="Asset library"
          description="Browse, upload, inspect, and edit managed assets."
          actions={
            <div className="flex items-center gap-2">
              <CompactBadge variant="success">ASSETS_ROOT</CompactBadge>
              <CompactBadge variant="secondary">{workspace.galleryAssets.length} shown</CompactBadge>
              <CompactBadge variant="secondary">{workspace.totalAssets} assets</CompactBadge>
            </div>
          }
          className="flex h-[calc(100dvh-6rem)] min-h-[38rem] flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <CommandBar className="gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="w-full pl-8"
                  placeholder="Search paths, titles, or tags..."
                  value={workspace.assetKeywordFilter}
                  onChange={(event) =>
                    workspace.onAssetKeywordFilterChange(event.target.value)
                  }
                />
              </div>
              <UploadAssetDialog />
              <ToggleGroup
                type="single"
                value={workspace.viewMode}
                onValueChange={(value) => {
                  if (value === "grid" || value === "list") workspace.setViewMode(value);
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
            </CommandBar>

            <ManagedContentPane
              assets={workspace.galleryAssets}
              selectedPath={workspace.selectedAssetPath}
              viewMode={workspace.viewMode}
              onSelect={workspace.setSelectedAssetPath}
            />
          </div>
        </Panel>
      </section>
    </EnterprisePage>
  );
}

function UploadAssetDialog() {
  const workspace = useAssetsWorkspace();

  return (
    <Dialog open={workspace.uploadDialogOpen} onOpenChange={workspace.setUploadDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline-subtle" size="sm" disabled={workspace.busy}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload asset</DialogTitle>
          <DialogDescription>
            Upload a file to {formatAssetFolderPath(workspace.currentFolder)}.
          </DialogDescription>
        </DialogHeader>
        <FileUpload
          files={workspace.uploadFiles}
          onFilesChange={workspace.onUploadFilesChange}
          maxFiles={1}
          disabled={workspace.busy}
        >
          <FileUploadDropzone className="min-h-32 rounded-md border border-dashed">
            <Upload className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Drop a file here or browse</span>
          </FileUploadDropzone>
          <FileUploadList>
            {workspace.uploadFiles.map((uploadFile) => (
              <FileUploadItem
                key={uploadFile.id}
                uploadFile={uploadFile}
                status={workspace.busy ? "uploading" : uploadFile.status}
              />
            ))}
          </FileUploadList>
        </FileUpload>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline-subtle" size="sm">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAssetButton(props: {
  asset: AssetRecord | null;
  busy: boolean;
  onDelete: () => void;
}) {
  if (!props.asset) {
    return (
      <Button variant="outline-subtle" size="sm" disabled>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        Delete
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline-subtle" size="sm" disabled={props.busy}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete managed asset?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes {props.asset.path} from ASSETS_ROOT and regenerates the MCP-facing
            catalogs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AssetsSecondaryNavigation() {
  const workspace = useAssetsWorkspace();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-b p-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">Folders</div>
        <div className="mt-1 truncate text-sm">
          {formatAssetFolderPath(workspace.currentFolder)}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 p-3">
        <Tree
          nodes={workspace.folderTree}
          expandedIds={workspace.folderTreeExpandedIds}
          selectedIds={[pathToFolderId(workspace.currentFolder)]}
          onExpandedChange={workspace.setFolderTreeExpandedIds}
          onSelectionChange={(ids) => {
            const selectedId = ids.at(-1) ?? IMAGE_LIBRARY_NODE_ID;
            workspace.setCurrentFolder(folderIdToPath(selectedId));
          }}
          selectionMode="single"
        />
      </ScrollArea>
    </div>
  );
}

export function AssetsContextPanel() {
  const workspace = useAssetsWorkspace();

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-5">Inspector</h3>
          <p className="truncate text-xs text-muted-foreground">
            {workspace.selectedAsset?.path ?? "No file selected"}
          </p>
        </div>
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <ScrollArea className="min-h-0 flex-1 p-4">
        <AssetInspectorBody
          asset={workspace.selectedAsset}
          busy={workspace.busy}
          draft={workspace.metadataDraft}
          onDraftChange={workspace.setMetadataDraft}
          onDelete={() => void workspace.deleteSelectedAsset()}
          onSave={() => void workspace.saveSelectedMetadata()}
        />
      </ScrollArea>
    </div>
  );
}

function ManagedContentPane(props: {
  assets: AssetRecord[];
  selectedPath: string | null;
  viewMode: "grid" | "list";
  onSelect: (path: string) => void;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1 p-4">
      {props.assets.length === 0 ? (
        <StatePanel
          kind="empty"
          title="No assets found"
          description="Upload a file or change the current folder/search."
        />
      ) : props.viewMode === "grid" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
          {props.assets.map((asset) => (
            <FileTile
              key={asset.path}
              asset={asset}
              selected={props.selectedPath === asset.path}
              onSelect={() => props.onSelect(asset.path)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {props.assets.map((asset) => (
            <FileRow
              key={asset.path}
              asset={asset}
              selected={props.selectedPath === asset.path}
              onSelect={() => props.onSelect(asset.path)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

function AssetInspectorBody(props: {
  asset: AssetRecord | null;
  busy: boolean;
  draft: MetadataDraft;
  onDraftChange: (draft: MetadataDraft) => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  if (!props.asset) {
    return (
      <StatePanel
        kind="empty"
        title="Select an asset"
        description="Choose a managed asset to preview and edit metadata."
      />
    );
  }

  const fileUrl = `/api/assets/files?path=${encodeURIComponent(props.asset.path)}`;

  return (
    <div className="space-y-4">
      <PreviewFrame asset={props.asset} />
      <MetadataBlock asset={props.asset} />
      <div className="flex flex-wrap gap-2">
        <AssetPreviewDialog asset={props.asset}>
          <Button variant="outline-subtle" size="sm">
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview
          </Button>
        </AssetPreviewDialog>
        <Button asChild variant="outline-subtle" size="sm">
          <a href={fileUrl} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" aria-hidden="true" />
            Open file
          </a>
        </Button>
        <DeleteAssetButton asset={props.asset} busy={props.busy} onDelete={props.onDelete} />
      </div>
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label htmlFor="asset-title">Title</Label>
              <Input
                id="asset-title"
                value={props.draft.title}
                onChange={(event) =>
                  props.onDraftChange({ ...props.draft, title: event.target.value })
                }
                disabled={props.busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-kind">Kind</Label>
              <Input
                id="asset-kind"
                value={props.draft.kind}
                onChange={(event) =>
                  props.onDraftChange({ ...props.draft, kind: event.target.value })
                }
                disabled={props.busy}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asset-tags">Tags</Label>
              <TagInput
                id="asset-tags"
                value={props.draft.tags}
                onValueChange={(tags) => props.onDraftChange({ ...props.draft, tags })}
                placeholder="Add tag..."
                disabled={props.busy}
              />
            </div>
          </div>
          <Button size="sm" onClick={props.onSave} disabled={props.busy}>
            <Save className="h-4 w-4" aria-hidden="true" />
            Save metadata
          </Button>
        </CardContent>
      </Card>
      <TagList tags={assetTags(props.asset)} />
    </div>
  );
}

function FileTile(props: { asset: AssetRecord; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      className="min-w-0 cursor-pointer p-0 text-start transition-colors hover:bg-surface-muted/40 data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
      data-selected={props.selected}
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
    >
      <CardContent className="p-2">
        <div className="relative aspect-square overflow-hidden rounded border bg-surface-muted">
          {isImageAsset(props.asset) ? (
            <Image
              fill
              unoptimized
              alt={props.asset.title}
              src={`/api/assets/files?path=${encodeURIComponent(props.asset.path)}`}
              className="object-contain"
              sizes="(min-width: 1280px) 14vw, 45vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <File className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
          <AssetPreviewDialog asset={props.asset}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-2 top-2 bg-background/60 text-foreground/80 backdrop-blur hover:bg-background/85 hover:text-foreground"
              aria-label={`Preview ${props.asset.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </Button>
          </AssetPreviewDialog>
        </div>
        <div className="mt-2 min-w-0">
          <div className="truncate text-sm font-medium">{props.asset.title}</div>
          <div className="truncate text-xs text-muted-foreground">{props.asset.path}</div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Badge variant="secondary">{props.asset.kind}</Badge>
          <span className="text-xs text-muted-foreground">{assetTags(props.asset).length} tags</span>
        </div>
      </CardContent>
    </Card>
  );
}

function FileRow(props: { asset: AssetRecord; selected: boolean; onSelect: () => void }) {
  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-surface-muted/40 data-[selected=true]:bg-surface-muted"
      data-selected={props.selected}
      role="button"
      tabIndex={0}
      onClick={props.onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
    >
      <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3">
        <div className="flex min-w-0 items-center gap-3">
          {isImageAsset(props.asset) ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{props.asset.title}</div>
            <div className="truncate text-xs text-muted-foreground">{props.asset.path}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{props.asset.kind}</Badge>
          <span className="text-xs text-muted-foreground">{assetTags(props.asset).length} tags</span>
          <AssetPreviewDialog asset={props.asset}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Preview ${props.asset.title}`}
              onClick={(event) => event.stopPropagation()}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </Button>
          </AssetPreviewDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetPreviewDialog(props: { asset: AssetRecord; children: ReactNode }) {
  const fileUrl = `/api/assets/files?path=${encodeURIComponent(props.asset.path)}`;

  return (
    <Dialog>
      <DialogTrigger asChild>{props.children}</DialogTrigger>
      <DialogContent size="full" className="grid grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{props.asset.title}</DialogTitle>
          <DialogDescription>{props.asset.path}</DialogDescription>
        </DialogHeader>
        <Card className="min-h-0 overflow-hidden bg-surface-muted">
          <CardContent className="relative h-full min-h-[20rem] p-0">
            {isImageAsset(props.asset) ? (
              <Image
                fill
                unoptimized
                src={fileUrl}
                alt={props.asset.title}
                className="object-contain"
                sizes="95vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <File className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </CardContent>
        </Card>
        <DialogFooter>
          <Button asChild variant="outline-subtle" size="sm">
            <a href={fileUrl} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4" aria-hidden="true" />
              Open file
            </a>
          </Button>
          <DialogClose asChild>
            <Button size="sm">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewFrame(props: { asset: AssetRecord }) {
  const fileUrl = `/api/assets/files?path=${encodeURIComponent(props.asset.path)}`;
  return (
    <Card className="overflow-hidden bg-surface-muted">
      <CardContent className="p-0">
        <div className="relative aspect-video">
          {isImageAsset(props.asset) ? (
            <Image
              fill
              unoptimized
              src={fileUrl}
              alt={props.asset.title}
              className="object-contain"
              sizes="20rem"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <File className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MetadataBlock(props: { asset: AssetRecord }) {
  const rows = [
    ["Path", props.asset.path],
    ["MIME", props.asset.mime],
    ["Source", props.asset.source],
    ["Size", `${props.asset.size.toLocaleString()} bytes`],
    ["Modified", formatFileTimestamp(props.asset.mtimeMs)],
  ];

  return (
    <Card>
      <CardContent className="space-y-2 p-3">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 text-xs">
          <div className="text-muted-foreground">{label}</div>
          <div className="min-w-0 truncate">{value}</div>
        </div>
      ))}
      </CardContent>
    </Card>
  );
}

function TagList(props: { tags: string[] }) {
  if (props.tags.length === 0) {
    return <p className="text-xs text-muted-foreground">No tags yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {props.tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          <Tag className="h-3 w-3" aria-hidden="true" />
          {tag}
        </Badge>
      ))}
    </div>
  );
}
