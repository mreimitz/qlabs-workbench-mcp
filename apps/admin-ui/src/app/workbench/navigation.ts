import {
  Activity,
  Boxes,
  Database,
  FileJson,
  FolderOpen,
  Gauge,
  Home,
  Images,
  ListChecks,
  Play,
  Server,
  Settings2,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import type { ViewKey } from "./types";

export type PrimaryNavItem = {
  id: ViewKey;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export type SecondaryNavItem = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const primaryNavItems: PrimaryNavItem[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "servers", label: "Servers", icon: Server },
  { id: "runner", label: "Tool Runner", icon: Play },
  { id: "assets", label: "Assets", icon: Images },
  { id: "storage", label: "Storage", icon: FolderOpen },
];

export const secondaryNavItems: Record<ViewKey, SecondaryNavItem[]> = {
  overview: [
    { id: "health", label: "Health", description: "Service and storage summary", icon: Gauge },
    { id: "activity", label: "Activity", description: "Recent MCP runs and outcomes", icon: Activity },
    { id: "endpoints", label: "Endpoints", description: "Local service entry points", icon: Boxes },
  ],
  servers: [
    { id: "registry", label: "Registry", description: "Enablement and health status", icon: ListChecks },
    { id: "links", label: "Links", description: "Health and MCP endpoints", icon: Boxes },
  ],
  runner: [
    { id: "compose", label: "Compose", description: "Select a server and tool", icon: TerminalSquare },
    { id: "schema", label: "Schema", description: "Input contract for the active tool", icon: FileJson },
    { id: "inventory", label: "Inventory", description: "Search all exposed tools", icon: ListChecks },
  ],
  assets: [
    { id: "library", label: "Library", description: "Asset sources, files, and inspector", icon: Images },
  ],
  storage: [
    { id: "browser", label: "Browser", description: "Browse the mounted storage root", icon: FolderOpen },
    { id: "operations", label: "Operations", description: "Create folders and upload files", icon: Settings2 },
    { id: "health", label: "Health", description: "Storage service status", icon: Database },
  ],
};

export const getPrimaryNavItem = (view: ViewKey) =>
  primaryNavItems.find((item) => item.id === view) ?? primaryNavItems[0];
