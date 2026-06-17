"use client";

import type { ChangeEvent } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SectionHeader,
  Separator,
  StatePanel,
} from "@brand/ui";
import { MetricCard, MetricGrid } from "@brand/charts";
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
  const filteredRows = props.storageRows
    .filter((row) => {
      const query = props.storageSearch.trim().toLowerCase();
      if (!query) return true;
      return `${row.name} ${row.kind} ${row.path}`
        .toLowerCase()
        .includes(query);
    })
    .slice()
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.name.localeCompare(right.name),
    );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Storage"
        description="Browse the mounted storage root, create folders, and upload files into the active path."
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card id="storage-operations" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>Folder manager</CardTitle>
            <CardDescription>
              Operations are constrained to the configured storage root.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
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

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline-subtle"
                onClick={() => props.onBrowsePath(props.currentPath)}
                disabled={props.busy}
              >
                Browse
              </Button>
              <Button
                variant="outline-subtle"
                onClick={() => props.onBrowsePath("")}
                disabled={props.busy}
              >
                Root
              </Button>
              <Button
                variant="outline-subtle"
                onClick={() => props.onBrowsePath(props.currentPath)}
                disabled={props.busy}
              >
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
                  value={props.folderName}
                  onChange={(event) =>
                    props.onFolderNameChange(event.target.value)
                  }
                />
                <Button
                  variant="secondary"
                  onClick={props.onCreateFolder}
                  disabled={props.busy}
                >
                  Create
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="storage-upload">
                Upload file into current path
              </Label>
              <Input
                id="storage-upload"
                type="file"
                onChange={props.onUploadFile}
                disabled={props.busy}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card id="storage-health" className="scroll-mt-4">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle>Current directory</CardTitle>
                  <CardDescription>
                    Immediate contents and health for the active storage path.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono">
                  {props.browseData.path || "/"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <MetricGrid columns={2}>
                <MetricCard
                  label="Folders"
                  value={String(props.rootStats.folders)}
                  description="Immediate child folders"
                />
                <MetricCard
                  label="Files"
                  value={String(props.rootStats.files)}
                  description="Immediate child files"
                />
                <MetricCard
                  label="Storage health"
                  value={
                    props.dashboardData.storageHealth.ok
                      ? "Healthy"
                      : "Attention"
                  }
                  description={props.dashboardData.storageHealth.storageRoot}
                />
                <MetricCard
                  label="Browse target"
                  value={props.browseData.path || "/"}
                  description="Active operator context"
                  className="font-mono"
                />
              </MetricGrid>
            </CardContent>
          </Card>

          <Card id="storage-browser" className="scroll-mt-4">
            <CardHeader className="gap-3">
              <div>
                <CardTitle>Folder contents</CardTitle>
                <CardDescription>
                  Open folders inline or download individual files.
                </CardDescription>
              </div>
              <Input
                className="max-w-sm"
                placeholder="Search contents..."
                value={props.storageSearch}
                onChange={(event) =>
                  props.onStorageSearchChange(event.target.value)
                }
              />
            </CardHeader>
            <CardContent>
              {filteredRows.length === 0 ? (
                <StatePanel
                  kind="empty"
                  title={
                    props.browseData.entries.length === 0
                      ? "This folder is empty"
                      : "No entries found"
                  }
                  description={
                    props.browseData.entries.length === 0
                      ? "Create a folder or upload a file to populate the current path."
                      : "Try a different search term."
                  }
                />
              ) : (
                <div className="grid gap-2">
                  {filteredRows.map((row) => (
                    <div
                      key={row.path}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border bg-surface-elevated p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {row.name}
                        </div>
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          {row.path}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={
                            row.kind === "folder" ? "secondary" : "outline"
                          }
                        >
                          {row.kind}
                        </Badge>
                        {row.kind === "folder" ? (
                          <Button
                            variant="outline-subtle"
                            size="sm"
                            onClick={() => props.onBrowsePath(row.path)}
                            disabled={props.busy}
                          >
                            Open
                          </Button>
                        ) : (
                          <Button asChild variant="outline-subtle" size="sm">
                            <a
                              href={`/api/storage/files?path=${encodeURIComponent(row.path)}`}
                            >
                              Download
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
