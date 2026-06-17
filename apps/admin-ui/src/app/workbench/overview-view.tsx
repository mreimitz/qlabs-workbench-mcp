"use client";

import { useMemo } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SectionHeader,
  StatusBadge,
} from "@brand/ui";
import { MetricCard, MetricGrid } from "@brand/charts";
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
      `${run.serverName} ${run.toolName} ${run.status} ${run.error ?? ""}`.toLowerCase().includes(query),
    );
  }, [props.payload.dashboard.runs, props.runsSearch]);

  const filteredEndpoints = useMemo(() => {
    const query = props.endpointsSearch.trim().toLowerCase();
    if (!query) return props.endpointRows;
    return props.endpointRows.filter((row) => `${row.name} ${row.url}`.toLowerCase().includes(query));
  }, [props.endpointRows, props.endpointsSearch]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Overview"
        description="Operational health, recent tool activity, and local service entry points."
      />

      <MetricGrid columns={2}>
        <MetricCard
          label="Healthy servers"
          value={`${props.payload.dashboard.summary.healthyServers}/${props.payload.dashboard.summary.enabledServers}`}
          description="Currently healthy among enabled services"
          emphasis="headline"
        />
        <MetricCard
          label="Storage root"
          value={props.payload.storageHealth.storageRoot}
          description={props.payload.storageHealth.ok ? "Storage API healthy" : "Storage API needs attention"}
          className="font-mono"
        />
        <MetricCard
          label="Current folder"
          value={props.payload.rootBrowse.path || "/"}
          description={`${props.rootStats.folders} folders / ${props.rootStats.files} files`}
          className="font-mono"
        />
        <MetricCard
          label="Attention signals"
          value={String(props.payload.dashboard.diagnostics.attentionCount)}
          description="Servers that need operator review"
        />
      </MetricGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card className="min-w-0">
          <CardHeader className="gap-3">
            <div>
              <CardTitle>Recent runs</CardTitle>
              <CardDescription>Latest tool executions recorded by the control plane.</CardDescription>
            </div>
            <Input
              className="max-w-sm"
              placeholder="Search runs..."
              value={props.runsSearch}
              onChange={(event) => props.onRunsSearchChange(event.target.value)}
            />
          </CardHeader>
          <CardContent>
            <div className="h-[28rem] overflow-y-auto pe-2">
              <div className="space-y-2">
                {filteredRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className="flex w-full min-w-0 items-start justify-between gap-3 rounded-md border bg-surface-elevated p-3 text-start transition-colors hover:bg-surface-muted"
                    onClick={() => props.onSelectRun(run.id)}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {run.serverName} / {run.toolName}
                      </div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {run.error ?? "Completed and recorded."}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(run.startedAt)} · {run.durationMs} ms
                      </div>
                    </div>
                    <StatusBadge status={run.status === "success" ? "complete" : "failed"} size="sm" />
                  </button>
                ))}
                {filteredRuns.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    No runs match the current search.
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Selected run</CardTitle>
            <CardDescription>Arguments and response for the active run.</CardDescription>
          </CardHeader>
          <CardContent>
            {props.selectedRun ? (
              <div className="space-y-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {props.selectedRun.serverName} / {props.selectedRun.toolName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(props.selectedRun.startedAt)} · {props.selectedRun.durationMs} ms
                    </div>
                  </div>
                  <StatusBadge status={props.selectedRun.status === "success" ? "complete" : "failed"} size="sm" />
                </div>
                <RunPayload label="Arguments" value={props.selectedRun.arguments} />
                <RunPayload
                  label="Response / error"
                  value={props.selectedRun.error ?? props.selectedRun.response}
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Select a run to inspect its payload.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Endpoints</CardTitle>
              <CardDescription>Stable local entry points for UI checks and tooling.</CardDescription>
            </div>
            <Input
              className="max-w-sm"
              placeholder="Search endpoints..."
              value={props.endpointsSearch}
              onChange={(event) => props.onEndpointsSearchChange(event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2">
            {filteredEndpoints.map((row) => (
              <div key={row.name} className="min-w-0 rounded-md border bg-surface-elevated p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{row.name}</div>
                    <div className="truncate font-mono text-xs text-muted-foreground">{row.url}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild variant="outline-subtle" size="sm">
                      <a href={row.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                    <Button
                      variant="outline-subtle"
                      size="sm"
                      onClick={() => props.onCopyEndpoint(row.name, row.url)}
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RunPayload(props: { label: string; value: unknown }) {
  return (
    <div className="space-y-2">
      <Label>{props.label}</Label>
      <div className="h-44 overflow-auto rounded-md border bg-surface-muted/40 p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
          {typeof props.value === "string" ? props.value : prettyJson(props.value)}
        </pre>
      </div>
    </div>
  );
}
