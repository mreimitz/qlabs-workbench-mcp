import { StatusBadge } from "@brand/ui";
import type { ServerStatus } from "./types";

export function ServerStatusBadge(props: { status: ServerStatus["status"] }) {
  if (props.status === "healthy") {
    return <StatusBadge status="complete" size="sm" />;
  }
  if (props.status === "disabled") {
    return <StatusBadge status="skipped" size="sm" />;
  }
  if (props.status === "setup-required") {
    return <StatusBadge status="pending" size="sm" />;
  }
  return <StatusBadge status="failed" size="sm" />;
}

export const describeServerStatus = (server: ServerStatus) => {
  if (server.status === "healthy") return server.note ?? "Ready for execution";
  if (server.status === "disabled") return "Disabled from the local registry";
  if (server.status === "setup-required") {
    return server.note ?? "Additional local content is required before this integration can run";
  }
  return server.error ?? "Needs operator attention";
};
