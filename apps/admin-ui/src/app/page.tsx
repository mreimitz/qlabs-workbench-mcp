import { WorkbenchDashboard, type DashboardPayload } from "./workbench-dashboard";
import { getServerEnv } from "./lib/server-env";

export const metadata = {
  title: "QLabs Workbench",
  description: "Local management dashboard for MCP services, storage, and agentic operations.",
};

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

const getInitialData = async (): Promise<DashboardPayload> => {
  try {
    const { controlApiUrl, storageApiUrl, assetsApiUrl } = getServerEnv();
    const [dashboard, storageHealth, rootBrowse, assets] = await Promise.all([
      getJson<DashboardPayload["dashboard"]>(`${controlApiUrl}/dashboard`),
      getJson<DashboardPayload["storageHealth"]>(`${storageApiUrl}/health`),
      getJson<DashboardPayload["rootBrowse"]>(`${storageApiUrl}/browse?path=`),
      getJson<DashboardPayload["assets"]>(`${assetsApiUrl}/assets`),
    ]);

    return { dashboard, storageHealth, rootBrowse, assets };
  } catch (error) {
    return {
      dashboard: {
        summary: {
          totalServers: 0,
          enabledServers: 0,
          disabledServers: 0,
          healthyServers: 0,
          setupRequiredServers: 0,
          unhealthyServers: 0,
          totalTools: 0,
          totalRuns: 0,
        },
        diagnostics: {
          attentionCount: 0,
          disabledCount: 0,
          setupRequiredCount: 0,
        },
        servers: [],
        runs: [],
      },
      storageHealth: {
        ok: false,
        storageRoot: "/data/storage",
      },
      rootBrowse: {
        path: "",
        entries: [],
      },
      assets: {
        assets: [],
      },
      error: error instanceof Error ? error.message : "Failed to load dashboard",
    };
  }
};

export default async function Home() {
  const initialData = await getInitialData();
  return <WorkbenchDashboard initialData={initialData} />;
}
