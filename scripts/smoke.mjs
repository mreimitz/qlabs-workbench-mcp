const adminBaseUrl = process.env.ADMIN_BASE_URL ?? "http://localhost:3000";
const controlBaseUrl = process.env.CONTROL_BASE_URL ?? "http://localhost:4000";
const storageBaseUrl = process.env.STORAGE_BASE_URL ?? "http://localhost:4100";

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const getJson = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
};

const main = async () => {
  const dashboard = await getJson(`${controlBaseUrl}/dashboard`);
  assert(Array.isArray(dashboard.servers), "dashboard.servers must be an array");
  assert(dashboard.summary.totalServers >= 4, "expected at least four registered servers");

  const storageHealth = await getJson(`${storageBaseUrl}/health`);
  assert(storageHealth.ok === true, "storage health should be ok");

  const run = await getJson(`${adminBaseUrl}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      serverName: "mcp-textops",
      toolName: "text_uppercase",
      arguments: { text: "smoke test" },
    }),
  });
  assert(run?.run?.status === "success", "text_uppercase smoke run should succeed");

  const taggedAsset = await getJson(`${adminBaseUrl}/api/assets/hero-demo.svg/tags`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keywords: ["smoke"] }),
  });
  assert(taggedAsset?.asset?.keywords?.includes("smoke"), "hero-demo.svg should accept smoke tag");

  await getJson(`${adminBaseUrl}/api/servers/mcp-textops`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });

  const disabledDashboard = await getJson(`${controlBaseUrl}/dashboard`);
  const disabledTextOps = disabledDashboard.servers.find((server) => server.server.name === "mcp-textops");
  assert(disabledTextOps?.status === "disabled", "mcp-textops should become disabled");

  await getJson(`${adminBaseUrl}/api/servers/mcp-textops`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  const restoredDashboard = await getJson(`${controlBaseUrl}/dashboard`);
  const restoredTextOps = restoredDashboard.servers.find((server) => server.server.name === "mcp-textops");
  assert(restoredTextOps?.server?.enabled === true, "mcp-textops should be re-enabled");

  console.log("Smoke checks passed");
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
