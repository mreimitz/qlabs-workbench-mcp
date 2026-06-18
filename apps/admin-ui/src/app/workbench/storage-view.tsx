"use client";

import type { ChangeEvent } from "react";
import { useMemo } from "react";
import {
  ColumnPicker,
  DataTable,
  FilterBar,
  SearchInput,
  type ColumnDef,
} from "@brand/data";
import { Badge, Button, Input, Label } from "@brand/ui";
import { Database, Download, FolderOpen, FolderPlus, Upload } from "lucide-react";
import {
  CompactBadge,
  EnterpriseHeader,
  EnterprisePage,
  MetricPill,
  MetricStrip,
  Panel,
} from "./enterprise";
import type { DashboardPayload, StorageBrowse, StorageRow } from "./types";

export function StorageView(props: {
  browseData: StorageBrowse;
  busy: boolean;
  currentPath: string;
  dashboardData: DashboardPayload;
  folderName: string;
  onBrowsePath: (path: string) => void;
  onCreateFolder: () => void;
  onCurrentPathChange: (value: string) => void;
  onFolderNameChange: (value: string) => void;
  onStorageSearchChange: (value: string) => void;
  onUploadFile: (event: ChangeEvent<HTMLInputElement>) => void;
  rootStats: { folders: number; files: number };
  storageRows: StorageRow[];
  storageSearch: string;
}) {
  const filteredRows = useMemo(() => {
    const query = props.storageSearch.trim().toLowerCase();
    return props.storageRows
      .filter((row) =>
        query
          ? `${row.name} ${row.kind} ${row.path}`.toLowerCase().includes(query)
          : true,
      )
      .slice()
      .sort(
        (left, right) =>
          left.kind.localeCompare(right.kind) ||
          left.name.localeCompare(right.name),
      );
  }, [props.storageRows, props.storageSearch]);

  const columns = useMemo<ColumnDef<StorageRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{row.original.name}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.path}
            </div>
          </div>
        ),
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
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {row.original.kind === "folder" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Open folder"
                onClick={() => props.onBrowsePath(row.original.path)}
                disabled={props.busy}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild variant="ghost" size="icon-sm" aria-label="Download file">
                <a
                  href={`/api/storage/files?path=${encodeURIComponent(row.original.path)}`}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [props],
  );

  return (
    <EnterprisePage>
      <EnterpriseHeader
        eyebrow="Files"
        title="Storage"
        description="Browse the mounted storage root, create folders, and upload files into the active path."
        meta={
          <>
            <CompactBadge variant="secondary">
              {props.browseData.path || "/"}
            </CompactBadge>
            <CompactBadge
              variant={props.dashboardData.storageHealth.ok ? "success" : "destructive"}
            >
              {props.dashboardData.storageHealth.ok ? "Healthy" : "Attention"}
            </CompactBadge>
          </>
        }
      />

      <section id="storage-health" className="scroll-mt-4">
        <MetricStrip>
          <MetricPill
            icon={FolderOpen}
            label="Folders"
            value={props.rootStats.folders}
            description="Immediate child folders"
          />
          <MetricPill
            icon={Database}
            label="Files"
            value={props.rootStats.files}
            description="Immediate child files"
          />
          <MetricPill
            icon={Database}
            label="Storage"
            value={props.dashboardData.storageHealth.ok ? "Healthy" : "Attention"}
            description={props.dashboardData.storageHealth.storageRoot}
            tone={props.dashboardData.storageHealth.ok ? "success" : "danger"}
          />
          <MetricPill
            icon={FolderOpen}
            label="Browse target"
            value={props.browseData.path || "/"}
            description="Active operator context"
          />
        </MetricStrip>
      </section>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel
          id="storage-operations"
          title="Folder manager"
          description="Operations are scoped to the configured storage root."
        >
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="storage-path">Current path</Label>
              <Input
                id="storage-path"
                placeholder="examples/screenshots"
                value={props.currentPath}
                onChange={(event) =>
                  props.onCurrentPathChange(event.target.value)
                }
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={() => props.onBrowsePath(props.currentPath)}
                disabled={props.busy}
              >
                Browse
              </Button>
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={() => props.onBrowsePath("")}
                disabled={props.busy}
              >
                Root
              </Button>
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={() => props.onBrowsePath(props.currentPath)}
                disabled={props.busy}
              >
                Refresh
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Create folder</Label>
              <div className="flex gap-2">
                <Input
                  id="folder-name"
                  placeholder="new-folder"
                  value={props.folderName}
                  onChange={(event) =>
                    props.onFolderNameChange(event.target.value)
                  }
                />
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Create folder"
                  onClick={props.onCreateFolder}
                  disabled={props.busy}
                >
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="storage-upload">Upload file</Label>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="storage-upload"
                  type="file"
                  onChange={props.onUploadFile}
                  disabled={props.busy}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          id="storage-browser"
          title="Folder contents"
          description="Open folders inline or download individual files."
          actions={<CompactBadge variant="secondary">{filteredRows.length} entries</CompactBadge>}
        >
          <DataTable
            className="p-4"
            columns={columns}
            data={filteredRows}
            enablePagination
            pageSize={12}
            emptyMessage={
              props.browseData.entries.length === 0
                ? "This folder is empty."
                : "No entries match the current search."
            }
            toolbar={(table) => (
              <FilterBar actions={<ColumnPicker table={table} />}>
                <SearchInput
                  value={props.storageSearch}
                  onValueChange={props.onStorageSearchChange}
                  containerClassName="w-72 max-w-full"
                  placeholder="Filter contents..."
                />
              </FilterBar>
            )}
          />
        </Panel>
      </div>
    </EnterprisePage>
  );
}
