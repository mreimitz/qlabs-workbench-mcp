"use client";

import { useMemo } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SectionHeader,
} from "@brand/ui";
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
  const filteredServers = useMemo(() => {
    const query = props.search.trim().toLowerCase();
    if (!query) return props.dashboard.servers;
    return props.dashboard.servers.filter((server) =>
      `${server.server.name} ${server.server.url} ${server.status} ${server.note ?? ""} ${server.error ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [props.dashboard.servers, props.search]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Servers"
        description="Enable, disable, and inspect the health of each registered MCP server."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Enabled {props.dashboard.summary.enabledServers}</Badge>
            <Badge variant="secondary">Disabled {props.dashboard.summary.disabledServers}</Badge>
            <Badge variant="warning">Setup {props.dashboard.summary.setupRequiredServers}</Badge>
            <Badge variant="secondary">Attention {props.dashboard.diagnostics.attentionCount}</Badge>
          </div>
        }
      />

      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Service registry</CardTitle>
            <CardDescription>Operational state and direct links for local services.</CardDescription>
          </div>
          <Input
            className="max-w-sm"
            placeholder="Search servers..."
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {filteredServers.map((server) => (
              <ServerRow
                key={server.server.name}
                busy={props.busy}
                server={server}
                onToggleServer={props.onToggleServer}
              />
            ))}
            {filteredServers.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                No servers match the current search.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServerRow(props: {
  busy: boolean;
  onToggleServer: (serverName: string, enabled: boolean) => void;
  server: ServerStatus;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-surface-elevated p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)_auto]">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{props.server.server.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">{props.server.server.url}</div>
        {props.server.note ? <div className="mt-1 text-xs text-muted-foreground">{props.server.note}</div> : null}
        {props.server.error ? <div className="mt-1 text-xs text-destructive">{props.server.error}</div> : null}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ServerStatusBadge status={props.server.status} />
          <Badge variant="outline" className="font-mono">
            {formatLatency(props.server.latencyMs)}
          </Badge>
          <Badge variant="secondary">{props.server.tools.length} tools</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{describeServerStatus(props.server)}</p>
      </div>

      <div className="flex flex-wrap items-start justify-start gap-2 lg:justify-end">
        <Button asChild variant="outline-subtle" size="sm">
          <a href={props.server.healthUrl} target="_blank" rel="noreferrer">
            Health
          </a>
        </Button>
        <Button asChild variant="outline-subtle" size="sm">
          <a href={props.server.server.url} target="_blank" rel="noreferrer">
            MCP
          </a>
        </Button>
        <Button
          variant="outline-subtle"
          size="sm"
          onClick={() => props.onToggleServer(props.server.server.name, !props.server.server.enabled)}
          disabled={props.busy}
        >
          {props.server.server.enabled ? "Disable" : "Enable"}
        </Button>
      </div>
    </div>
  );
}
