"use client";

import { useMemo, useState } from "react";
import {
  ColumnPicker,
  DataTable,
  FacetFilter,
  FilterBar,
  SearchInput,
  type ColumnDef,
} from "@brand/data";
import { Badge, Button } from "@brand/ui";
import { AlertTriangle, ExternalLink, Power, Server, Wrench } from "lucide-react";
import {
  CompactBadge,
  EnterpriseHeader,
  EnterprisePage,
  MetricPill,
  MetricStrip,
  Panel,
} from "./enterprise";
import { formatLatency } from "./format";
import { describeServerStatus, ServerStatusBadge } from "./status";
import type { DashboardData, ServerStatus } from "./types";

export function ServersView(props: {
  busy: boolean;
  dashboard: DashboardData;
  onSearchChange: (value: string) => void;
  onToggleServer: (serverName: string, enabled: boolean) => void;
  search: string;
}) {
  const [statusFilters, setStatusFilters] = useState<string[]>([]);

  const filteredServers = useMemo(() => {
    const query = props.search.trim().toLowerCase();
    return props.dashboard.servers.filter((server) => {
      const matchesQuery =
        !query ||
        `${server.server.name} ${server.server.url} ${server.status} ${server.note ?? ""} ${server.error ?? ""}`
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        statusFilters.length === 0 || statusFilters.includes(server.status);
      return matchesQuery && matchesStatus;
    });
  }, [props.dashboard.servers, props.search, statusFilters]);

  const columns = useMemo<ColumnDef<ServerStatus>[]>(
    () => [
      {
        accessorKey: "server.name",
        header: "Server",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {row.original.server.name}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {row.original.server.url}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-1">
            <ServerStatusBadge status={row.original.status} />
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {describeServerStatus(row.original)}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "latencyMs",
        header: "Latency",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {formatLatency(row.original.latencyMs)}
          </span>
        ),
      },
      {
        id: "tools",
        header: "Tools",
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.tools.length}</Badge>
        ),
      },
      {
        id: "enabled",
        header: "Enabled",
        cell: ({ row }) => (
          <Badge variant={row.original.server.enabled ? "success" : "outline"}>
            {row.original.server.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button asChild variant="ghost" size="icon-sm" aria-label="Open health">
              <a href={row.original.healthUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" aria-label="Open MCP endpoint">
              <a href={row.original.server.url} target="_blank" rel="noreferrer">
                <Server className="h-4 w-4" aria-hidden="true" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                row.original.server.enabled ? "Disable server" : "Enable server"
              }
              onClick={() =>
                props.onToggleServer(
                  row.original.server.name,
                  !row.original.server.enabled,
                )
              }
              disabled={props.busy}
            >
              <Power className="h-4 w-4" aria-hidden="true" />
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
        eyebrow="Registry"
        title="Servers"
        description="Enable, disable, and inspect local MCP services from a single operational registry."
        meta={
          <>
            <CompactBadge variant="secondary">
              {props.dashboard.summary.totalServers} total
            </CompactBadge>
            <CompactBadge variant="secondary">
              {props.dashboard.summary.totalTools} tools
            </CompactBadge>
          </>
        }
      />

      <section id="servers-registry" className="scroll-mt-4">
        <MetricStrip>
          <MetricPill
            icon={Server}
            label="Enabled"
            value={props.dashboard.summary.enabledServers}
            description={`${props.dashboard.summary.disabledServers} disabled`}
          />
          <MetricPill
            icon={Server}
            label="Healthy"
            value={props.dashboard.summary.healthyServers}
            description="Passing health checks"
            tone={
              props.dashboard.summary.unhealthyServers > 0 ? "warning" : "success"
            }
          />
          <MetricPill
            icon={AlertTriangle}
            label="Attention"
            value={props.dashboard.diagnostics.attentionCount}
            description="Needs operator review"
            tone={
              props.dashboard.diagnostics.attentionCount > 0
                ? "warning"
                : "success"
            }
          />
          <MetricPill
            icon={Wrench}
            label="Setup required"
            value={props.dashboard.summary.setupRequiredServers}
            description="Missing configuration"
            tone={
              props.dashboard.summary.setupRequiredServers > 0
                ? "warning"
                : "success"
            }
          />
        </MetricStrip>
      </section>

      <Panel
        id="servers-links"
        title="Service registry"
        description="Searchable service state, latency, endpoints, and controls."
        actions={<CompactBadge variant="secondary">{filteredServers.length} shown</CompactBadge>}
      >
        <DataTable
          className="p-4"
          columns={columns}
          data={filteredServers}
          enablePagination
          pageSize={10}
          emptyMessage="No servers match the current search."
          toolbar={(table) => (
            <FilterBar actions={<ColumnPicker table={table} />}>
              <SearchInput
                value={props.search}
                onValueChange={props.onSearchChange}
                containerClassName="w-72 max-w-full"
                placeholder="Filter servers..."
              />
              <FacetFilter
                title="Status"
                selected={statusFilters}
                onSelectedChange={setStatusFilters}
                options={[
                  { label: "Healthy", value: "healthy" },
                  { label: "Attention", value: "attention" },
                  { label: "Disabled", value: "disabled" },
                  { label: "Setup required", value: "setup-required" },
                ]}
              />
            </FilterBar>
          )}
        />
      </Panel>
    </EnterprisePage>
  );
}
