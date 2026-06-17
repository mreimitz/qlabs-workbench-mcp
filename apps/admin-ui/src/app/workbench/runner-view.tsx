"use client";

import type { ChangeEvent } from "react";
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
  ScrollArea,
  SectionHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SplitPanel,
  Textarea,
} from "@brand/ui";
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
  const filteredTools = props.toolInventoryRows.filter((row) => {
    const query = props.toolFilter.trim().toLowerCase();
    if (!query) return true;
    return `${row.serverName} ${row.toolName} ${row.description} ${row.status}`.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Tool Runner"
        description="Compose explicit MCP calls, inspect schemas, and review output without leaving the workbench."
      />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <CardHeader>
            <CardTitle>Compose run</CardTitle>
            <CardDescription>Choose a server and tool, then provide JSON arguments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-select">Server</Label>
              <Select value={props.selectedServer} onValueChange={props.onSelectServer}>
                <SelectTrigger id="server-select">
                  <SelectValue placeholder="Select a server" />
                </SelectTrigger>
                <SelectContent>
                  {props.runnableServers.map((server) => (
                    <SelectItem key={server.server.name} value={server.server.name}>
                      {server.server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tool-select">Tool</Label>
              <Select value={props.selectedTool} onValueChange={props.onSelectedToolChange}>
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

            <div className="space-y-2">
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
                <AlertDescription>{props.parsedToolArgs.error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={props.onRunSelectedTool}
                disabled={
                  props.busy ||
                  !props.selectedServer ||
                  !props.selectedTool ||
                  Boolean(props.parsedToolArgs.error)
                }
              >
                Run tool
              </Button>
              <Button
                variant="outline-subtle"
                onClick={props.onCopyPayload}
                disabled={!props.selectedServer || !props.selectedTool || Boolean(props.parsedToolArgs.error)}
              >
                Copy payload
              </Button>
              <Button
                variant="outline-subtle"
                onClick={props.onCopyCurl}
                disabled={!props.selectedServer || !props.selectedTool || Boolean(props.parsedToolArgs.error)}
              >
                Copy curl
              </Button>
            </div>

            {props.activeTool ? (
              <Card className="border-dashed">
                <CardHeader className="pb-4">
                  <CardTitle className="text-base">{props.activeTool.name}</CardTitle>
                  <CardDescription>
                    {props.activeTool.description ?? "No description available for this tool."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Label>Input schema</Label>
                  <ScrollArea className="h-40 rounded-md border bg-surface-muted/40 p-4">
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                      {prettyJson(props.activeTool.inputSchema ?? {})}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : null}
          </CardContent>
        </Card>

        <div className="h-[36rem] min-w-0 overflow-hidden rounded-lg border bg-background">
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
        </div>
      </div>
    </div>
  );
}

function ToolInventory(props: {
  filter: string;
  onFilterChange: (value: string) => void;
  onSelectTool: (serverName: string, toolName: string) => void;
  tools: ToolInventoryRow[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-4">
        <CardTitle className="text-base">Tool inventory</CardTitle>
        <CardDescription>Searchable list of exposed tools across runnable services.</CardDescription>
        <Input
          className="mt-3 max-w-sm"
          placeholder="Search tools..."
          value={props.filter}
          onChange={(event) => props.onFilterChange(event.target.value)}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1 p-4">
        <div className="space-y-2">
          {props.tools.map((row) => (
            <button
              key={row.id}
              type="button"
              className="flex w-full min-w-0 items-start justify-between gap-3 rounded-md border bg-surface-elevated p-3 text-start transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!row.enabled || row.status === "setup-required"}
              onClick={() => props.onSelectTool(row.serverName, row.toolName)}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.toolName}</div>
                <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{row.serverName}</div>
                {row.description ? (
                  <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.description}</div>
                ) : null}
              </div>
              <ServerStatusBadge status={row.status} />
            </button>
          ))}
          {props.tools.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No tools match the current filter.
            </div>
          ) : null}
        </div>
      </ScrollArea>
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
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b p-4">
        <div>
          <CardTitle className="text-base">Last tool result</CardTitle>
          <CardDescription>Structured responses stay visible for follow-up runs.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-mono">
            {props.selectedTool || "No tool selected"}
          </Badge>
          <Button variant="outline-subtle" size="sm" onClick={props.onCopyOutput}>
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
