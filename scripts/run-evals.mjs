import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const controlBaseUrl = process.env.CONTROL_BASE_URL ?? "http://localhost:4000";
const casesDir = process.env.EVAL_CASES_DIR ?? path.resolve("evals/cases");
const only = process.env.EVAL_ONLY ? new Set(process.env.EVAL_ONLY.split(",").map((s) => s.trim()).filter(Boolean)) : null;

const readJson = async (p) => JSON.parse(await fs.readFile(p, "utf8"));

const getJson = async (url) => {
  const response = await fetch(url, { method: "GET" });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: response.ok, status: response.status, body: parsed };
};

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { ok: response.ok, status: response.status, body: parsed };
};

const assertContains = (haystack, needle) => {
  if (typeof needle !== "string" || needle.length === 0) return true;
  return haystack.includes(needle);
};

const decodeMcpTextJson = (value) => {
  if (!value || typeof value !== "object") return value;
  const content = value.content;
  if (!Array.isArray(content)) return value;
  const textItems = content.filter((item) => item?.type === "text" && typeof item?.text === "string");
  if (textItems.length !== 1) return value;
  const text = textItems[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const normalizeRunBody = (body) => {
  if (!body || typeof body !== "object") return body;
  const cloned = structuredClone(body);
  if (cloned?.run?.response) {
    cloned.run.response = decodeMcpTextJson(cloned.run.response);
  }
  return cloned;
};

export const readJsonPath = (value, jsonPath) => {
  if (typeof jsonPath !== "string" || jsonPath.length === 0) return undefined;
  return jsonPath.split(".").reduce((current, part) => {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(part)) return current[Number(part)];
    if (typeof current === "object") return current[part];
    return undefined;
  }, value);
};

const sameJsonValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const assertExpectation = (body, expectation = {}) => {
  if (typeof expectation.path === "string") {
    const actual = readJsonPath(body, expectation.path);
    if (!sameJsonValue(actual, expectation.equals)) {
      return {
        ok: false,
        message: `expected ${expectation.path} to equal ${JSON.stringify(expectation.equals)}, got ${JSON.stringify(actual)}`,
      };
    }
  }

  if (typeof expectation.contains === "string" && expectation.contains.length > 0) {
    const serialized = JSON.stringify(body ?? null);
    if (!assertContains(serialized, expectation.contains)) {
      return {
        ok: false,
        message: `expected serialized response to contain ${JSON.stringify(expectation.contains)}`,
      };
    }
  }

  return { ok: true };
};

export const main = async () => {
  const dashboard = await getJson(`${controlBaseUrl}/dashboard`);
  if (!dashboard.ok) {
    throw new Error(`Control API not reachable at ${controlBaseUrl} (status ${dashboard.status}). Start the stack before running evals.`);
  }
  const knownServers = new Set(
    Array.isArray(dashboard.body?.servers) ? dashboard.body.servers.map((s) => s?.server?.name).filter(Boolean) : []
  );

  const entries = await fs.readdir(casesDir);
  const files = entries.filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`No eval case files found in ${casesDir}`);

  const failures = [];
  const skippedByServer = new Map();
  let total = 0;
  let passed = 0;

  for (const file of files) {
    if (only && !only.has(file)) continue;
    const cases = await readJson(path.join(casesDir, file));
    if (!Array.isArray(cases)) throw new Error(`Eval file must be an array: ${file}`);

    for (const c of cases) {
      const server = c?.server;
      const tool = c?.tool;
      const input = c?.input ?? {};
      const expect = c?.expect ?? {};

      if (typeof server === "string" && server.length > 0 && !knownServers.has(server)) {
        skippedByServer.set(server, (skippedByServer.get(server) ?? 0) + 1);
        continue;
      }

      total += 1;

      const res = await postJson(`${controlBaseUrl}/runs`, {
        serverName: server,
        toolName: tool,
        arguments: input,
      });

      const normalizedBody = normalizeRunBody(res.body);
      const assertion = assertExpectation(normalizedBody, expect);
      const serialized = JSON.stringify(normalizedBody ?? null);
      const ok = res.ok && assertion.ok;

      if (ok) {
        passed += 1;
        continue;
      }

      failures.push({
        file,
        server,
        tool,
        status: res.status,
        expectation: expect,
        assertion: assertion.message,
        response: normalizedBody,
        responsePreview: serialized.slice(0, 400),
      });
    }
  }

  for (const [server, count] of [...skippedByServer.entries()].sort()) {
    process.stdout.write(`skipped ${count} case(s) for unregistered server "${server}" (not enabled in this stack)\n`);
  }

  if (failures.length) {
    process.stderr.write(`${failures.length}/${total} eval cases failed\n`);
    for (const f of failures.slice(0, 20)) {
      process.stderr.write(`${f.file} :: ${f.server} :: ${f.tool} (status ${f.status}) expectation: ${JSON.stringify(f.expectation)}\n`);
      if (f.assertion) process.stderr.write(`  ${f.assertion}\n`);
      process.stderr.write(`  response: ${f.responsePreview}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${passed}/${total} eval cases passed\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
