"use client";

import { useMemo } from "react";
import {
  ColumnPicker,
  DataTable,
  FilterBar,
  SearchInput,
  type ColumnDef,
} from "@brand/data";
import { Button, Label, StatusBadge } from "@brand/ui";
import {
  AlertTriangle,
  Copy,
  Database,
  ExternalLink,
  FolderTree,
  Server,
} from "lucide-react";
import {
  CompactBadge,
  EnterpriseHeader,
  EnterprisePage,
  MetricPill,
  MetricStrip,
  Panel,
} from "./enterprise";
import { formatDateTime, prettyJson } from "./format";
import type { DashboardPayload, EndpointRow, RunRecord } from "./types";

export function OverviewView(props: {
  endpointRows: EndpointRow[];
  endpointsSearch: string;
  onCopyEndpoint: (label: string, value: string) => void;
  onEndpointsSearchChange: (value: string) => void;
  onRunsSearchChange: (value: string) => void;
  onSelectRun: (runId: string) => void;
  payload: DashboardPayload;
  rootStats: { folders: number; files: number };
  runsSearch: string;
  selectedRun: RunRecord | null;
}) {
  const filteredRuns = useMemo(() => {
    const query = props.runsSearch.trim().toLowerCase();
    const runs = props.payload.dashboard.runs;
    if (!query) return runs;
    return runs.filter((run) =>
      `${run.serverName} ${run.toolName} ${run.status} ${run.error ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [props.payload.dashboard.runs, props.runsSearch]);

  const filteredEndpoints = useMemo(() => {
    const query = props.endpointsSearch.trim().toLowerCase();
    if (!query) return props.endpointRows;
    return props.endpointRows.filter((row) =>
      `${row.name} ${row.url}`.toLowerCase().includes(query),
    );
  }, [props.endpointRows, props.endpointsSearch]);

  const runColumns = useMemo<ColumnDef<RunRecord>[]>(
    () => [
      {
        accessorKey: "startedAt",
        header: "Started",
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-xs">
            {formatDateTime(row.original.startedAt)}
          </span>
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
        accessorKey: "toolName",
        header: "Tool",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.toolName}</span>
        ),
      },
      {
        accessorKey: "durationMs",
        header: "Duration",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.durationMs} ms</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusBadge
            status={row.original.status === "success" ? "complete" : "failed"}
            size="sm"
          />
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
            onClick={() => props.onSelectRun(row.original.id)}
          >
            Inspect
          </Button>
        ),
      },
    ],
    [props],
  );

  const endpointColumns = useMemo<ColumnDef<EndpointRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "url",
        header: "URL",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.url}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Open endpoint">
              <a href={row.original.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy endpoint"
              onClick={() => props.onCopyEndpoint(row.original.name, row.original.url)}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [props],
  );

  return (
    <EnterprisePage>
      <EnterpriseHeader
        eyebrow="Operations"
        title="Overview"
        description="Control-plane health, recent tool activity, and stable local entry points."
        meta={
          <>
            <CompactBadge variant="secondary">
              {props.payload.dashboard.summary.totalRuns} runs
            </CompactBadge>
            <CompactBadge variant="secondary">
              {props.payload.dashboard.summary.totalTools} tools
            </CompactBadge>
          </>
        }
      />

      <section id="overview-health" className="scroll-mt-4">
        <MetricStrip>
          <MetricPill
            icon={Server}
            label="Healthy servers"
            value={`${props.payload.dashboard.summary.healthyServers}/${props.payload.dashboard.summary.enabledServers}`}
            description="Healthy among enabled services"
            tone={
              props.payload.dashboard.summary.healthyServers ===
              props.payload.dashboard.summary.enabledServers
                ? "success"
                : "warning"
            }
          />
          <MetricPill
            icon={Database}
            label="Storage root"
            value={props.payload.storageHealth.ok ? "Healthy" : "Attention"}
            description={props.payload.storageHealth.storageRoot}
            tone={props.payload.storageHealth.ok ? "success" : "danger"}
          />
          <MetricPill
            icon={FolderTree}
            label="Current folder"
            value={props.payload.rootBrowse.path || "/"}
            description={`${props.rootStats.folders} folders / ${props.rootStats.files} files`}
          />
          <MetricPill
            icon={AlertTriangle}
            label="Attention"
            value={props.payload.dashboard.diagnostics.attentionCount}
            description="Servers needing operator review"
            tone={
              props.payload.dashboard.diagnostics.attentionCount > 0
                ? "warning"
                : "success"
            }
          />
        </MetricStrip>
      </section>

      <section
        id="overview-activity"
        className="grid scroll-mt-4 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
      >
        <Panel
          title="Recent runs"
          description="Latest MCP tool executions recorded by the control plane."
        >
          <DataTable
            className="p-4"
            columns={runColumns}
            data={filteredRuns}
            enablePagination
            pageSize={8}
            emptyMessage="No runs match the current search."
            toolbar={(table) => (
              <FilterBar actions={<ColumnPicker table={table} />}>
                <SearchInput
                  value={props.runsSearch}
                  onValueChange={props.onRunsSearchChange}
                  containerClassName="w-72 max-w-full"
                  placeholder="Filter runs..."
                />
              </FilterBar>
            )}
          />
        </Panel>

        <Panel
          title="Selected run"
          description="Arguments and response for the active execution."
        >
          <div className="p-4">
            {props.selectedRun ? (
              <div className="space-y-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {props.selectedRun.serverName} / {props.selectedRun.toolName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(props.selectedRun.startedAt)} ·{" "}
                      {props.selectedRun.durationMs} ms
                    </div>
                  </div>
                  <StatusBadge
                    status={
                      props.selectedRun.status === "success"
                        ? "complete"
                        : "failed"
                    }
                    size="sm"
                  />
                </div>
                <RunPayload
                  label="Arguments"
                  value={props.selectedRun.arguments}
                />
                <RunPayload
                  label="Response / error"
                  value={props.selectedRun.error ?? props.selectedRun.response}
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Select a run to inspect its payload.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <Panel
        id="overview-endpoints"
        title="Endpoints"
        description="Stable local entry points for UI checks and tooling."
        actions={
          <CompactBadge variant="secondary">
            {filteredEndpoints.length} endpoints
          </CompactBadge>
        }
      >
        <DataTable
          className="p-4"
          columns={endpointColumns}
          data={filteredEndpoints}
          emptyMessage="No endpoints match the current search."
          toolbar={(table) => (
            <FilterBar actions={<ColumnPicker table={table} />}>
              <SearchInput
                value={props.endpointsSearch}
                onValueChange={props.onEndpointsSearchChange}
                containerClassName="w-72 max-w-full"
                placeholder="Filter endpoints..."
              />
            </FilterBar>
          )}
        />
      </Panel>
    </EnterprisePage>
  );
}

function RunPayload(props: { label: string; value: unknown }) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <div className="h-40 overflow-auto rounded-md border bg-surface-muted/40 p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
          {typeof props.value === "string"
            ? props.value
            : prettyJson(props.value)}
        </pre>
      </div>
    </div>
  );
}
