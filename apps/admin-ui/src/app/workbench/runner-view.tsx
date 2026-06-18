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
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SplitPanel,
  Textarea,
} from "@brand/ui";
import { Copy, Play, Wrench } from "lucide-react";
import {
  CompactBadge,
  EnterpriseHeader,
  EnterprisePage,
  Panel,
} from "./enterprise";
import { prettyJson } from "./format";
import { ServerStatusBadge } from "./status";
import type { ServerStatus, Tool } from "./types";

export type ToolInventoryRow = {
  description: string;
  enabled: boolean;
  id: string;
  serverName: string;
  status: ServerStatus["status"];
  toolName: string;
};

export function RunnerView(props: {
  activeServer: ServerStatus | null;
  activeTool: Tool | null;
  busy: boolean;
  lastRunOutput: string;
  onCopyCurl: () => void;
  onCopyOutput: () => void;
  onCopyPayload: () => void;
  onRunSelectedTool: () => void;
  onSelectServer: (serverName: string) => void;
  onSelectTool: (serverName: string, toolName: string) => void;
  onSelectedToolChange: (toolName: string) => void;
  onToolArgsChange: (value: string) => void;
  onToolFilterChange: (value: string) => void;
  parsedToolArgs: { value: unknown; error: string | null };
  runnableServers: ServerStatus[];
  selectedServer: string;
  selectedTool: string;
  toolArgs: string;
  toolFilter: string;
  toolInventoryRows: ToolInventoryRow[];
}) {
  const filteredTools = useMemo(() => {
    const query = props.toolFilter.trim().toLowerCase();
    return props.toolInventoryRows.filter((row) => {
      if (!query) return true;
      return `${row.serverName} ${row.toolName} ${row.description} ${row.status}`
        .toLowerCase()
        .includes(query);
    });
  }, [props.toolFilter, props.toolInventoryRows]);

  return (
    <EnterprisePage>
      <EnterpriseHeader
        eyebrow="Execution"
        title="Tool Runner"
        description="Compose explicit MCP calls, inspect schemas, and review output without leaving the workbench."
        meta={
          <>
            <CompactBadge variant="secondary">
              {props.runnableServers.length} runnable servers
            </CompactBadge>
            <CompactBadge variant="secondary">
              {props.toolInventoryRows.length} tools
            </CompactBadge>
          </>
        }
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel
          id="runner-compose"
          title="Compose run"
          description="Choose a server and tool, then provide JSON arguments."
          className="self-start"
        >
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-1.5">
                <Label htmlFor="server-select">Server</Label>
                <Select
                  value={props.selectedServer}
                  onValueChange={props.onSelectServer}
                >
                  <SelectTrigger id="server-select">
                    <SelectValue placeholder="Select a server" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.runnableServers.map((serverStatus) => (
                      <SelectItem
                        key={serverStatus.server.name}
                        value={serverStatus.server.name}
                      >
                        {serverStatus.server.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tool-select">Tool</Label>
                <Select
                  value={props.selectedTool}
                  onValueChange={props.onSelectedToolChange}
                >
                  <SelectTrigger id="tool-select">
                    <SelectValue placeholder="Select a tool" />
                  </SelectTrigger>
                  <SelectContent>
                    {(props.activeServer?.tools ?? []).map((tool) => (
                      <SelectItem key={tool.name} value={tool.name}>
                        {tool.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tool-args">Arguments JSON</Label>
              <Textarea
                id="tool-args"
                className="min-h-64 font-mono text-xs"
                value={props.toolArgs}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  props.onToolArgsChange(event.target.value)
                }
              />
            </div>

            {props.parsedToolArgs.error ? (
              <Alert variant="destructive">
                <AlertTitle>Invalid JSON</AlertTitle>
                <AlertDescription>
                  {props.parsedToolArgs.error}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={props.onRunSelectedTool}
                disabled={
                  props.busy ||
                  !props.selectedServer ||
                  !props.selectedTool ||
                  Boolean(props.parsedToolArgs.error)
                }
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                Run
              </Button>
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={props.onCopyPayload}
                disabled={
                  !props.selectedServer ||
                  !props.selectedTool ||
                  Boolean(props.parsedToolArgs.error)
                }
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Payload
              </Button>
              <Button
                variant="outline-subtle"
                size="sm"
                onClick={props.onCopyCurl}
                disabled={
                  !props.selectedServer ||
                  !props.selectedTool ||
                  Boolean(props.parsedToolArgs.error)
                }
              >
                Curl
              </Button>
            </div>

            {props.activeTool ? (
              <div id="runner-schema" className="space-y-2 rounded-md border border-dashed p-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {props.activeTool.name}
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {props.activeTool.description ??
                      "No description available for this tool."}
                  </p>
                </div>
                <Label>Input schema</Label>
                <ScrollArea className="h-40 rounded-md border bg-surface-muted/40 p-4">
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                    {prettyJson(props.activeTool.inputSchema ?? {})}
                  </pre>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          id="runner-inventory"
          title="Inventory and result"
          description="Search available tools and keep the latest response visible."
          className="h-[calc(100dvh-12rem)] min-h-[34rem]"
        >
          <SplitPanel
            direction="vertical"
            startSize="minmax(20rem, 1fr)"
            divider
            start={
              <ToolInventory
                filter={props.toolFilter}
                onFilterChange={props.onToolFilterChange}
                tools={filteredTools}
                onSelectTool={props.onSelectTool}
              />
            }
            end={
              <LastRunResult
                lastRunOutput={props.lastRunOutput}
                onCopyOutput={props.onCopyOutput}
                selectedTool={props.selectedTool}
              />
            }
          />
        </Panel>
      </div>
    </EnterprisePage>
  );
}

function ToolInventory(props: {
  filter: string;
  onFilterChange: (value: string) => void;
  onSelectTool: (serverName: string, toolName: string) => void;
  tools: ToolInventoryRow[];
}) {
  const columns = useMemo<ColumnDef<ToolInventoryRow>[]>(
    () => [
      {
        accessorKey: "toolName",
        header: "Tool",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {row.original.toolName}
            </div>
            {row.original.description ? (
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "serverName",
        header: "Server",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.serverName}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <ServerStatusBadge status={row.original.status} />,
      },
      {
        id: "enabled",
        header: "Runnable",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.enabled && row.original.status !== "setup-required"
                ? "success"
                : "outline"
            }
          >
            {row.original.enabled && row.original.status !== "setup-required"
              ? "Yes"
              : "No"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={!row.original.enabled || row.original.status === "setup-required"}
            onClick={() =>
              props.onSelectTool(row.original.serverName, row.original.toolName)
            }
          >
            Select
          </Button>
        ),
      },
    ],
    [props],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable
        className="p-4"
        columns={columns}
        data={props.tools}
        emptyMessage="No tools match the current filter."
        enableRowVirtualization
        estimateRowHeight={52}
        maxBodyHeight="100%"
        toolbar={(table) => (
          <FilterBar actions={<ColumnPicker table={table} />}>
            <SearchInput
              value={props.filter}
              onValueChange={props.onFilterChange}
              containerClassName="w-72 max-w-full"
              placeholder="Filter tools..."
            />
          </FilterBar>
        )}
      />
    </div>
  );
}

function LastRunResult(props: {
  lastRunOutput: string;
  onCopyOutput: () => void;
  selectedTool: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="truncate text-sm font-semibold">Last result</h3>
          </div>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Structured responses stay visible for follow-up runs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-mono">
            {props.selectedTool || "No tool selected"}
          </Badge>
          <Button
            variant="outline-subtle"
            size="sm"
            onClick={props.onCopyOutput}
          >
            Copy output
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs">
          {props.lastRunOutput || "Run a tool to inspect output here."}
        </pre>
      </ScrollArea>
    </div>
  );
}
