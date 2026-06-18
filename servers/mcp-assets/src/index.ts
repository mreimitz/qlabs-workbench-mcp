import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import * as z from "zod/v4";
import path from "node:path";
import fs from "node:fs/promises";
import { asyncRoute, createErrorResponse, parseBase64Strict, withRequestId } from "@qlabs/server-utils";
import { removeAssetFromIndex, type AssetIndex } from "./asset-index.js";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const envFlag = (value: string | undefined, fallback = false) => {
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const port = Number.parseInt(process.env.PORT ?? "7040", 10);
const assetsRoot = requiredEnv("ASSETS_ROOT");
const seedDemoContent = envFlag(process.env.SEED_DEMO_CONTENT, true);
const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? "10485760", 10);
const indexPath = path.posix.join(assetsRoot, "index.json");

type Index = AssetIndex;
type AssetRecord = { filename: string; keywords: string[]; url: string };

const ensureRoot = async () => {
  await fs.mkdir(assetsRoot, { recursive: true });
};

const writeFileIfMissing = async (targetPath: string, contents: string) => {
  try {
    await fs.access(targetPath);
  } catch {
    await fs.writeFile(targetPath, contents, "utf8");
  }
};

const readIndex = async (): Promise<Index> => {
  await ensureRoot();
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as Index;
    if (!parsed?.keywords || typeof parsed.keywords !== "object") return { keywords: {} };
    return parsed;
  } catch {
    return { keywords: {} };
  }
};

const writeIndex = async (idx: Index) => {
  await ensureRoot();
  await fs.writeFile(indexPath, JSON.stringify(idx, null, 2));
};

const addToIndex = async (keyword: string, assetPath: string) => {
  const idx = await readIndex();
  const k = keyword.trim().toLowerCase();
  if (!k) return;
  const list = idx.keywords[k] ?? [];
  if (!list.includes(assetPath)) list.push(assetPath);
  idx.keywords[k] = list;
  await writeIndex(idx);
};

const collectKeywordsForAsset = (idx: Index, filename: string) =>
  Object.entries(idx.keywords)
    .filter(([, files]) => files.includes(filename))
    .map(([keyword]) => keyword)
    .sort();

const searchIndex = async (keyword: string) => {
  const idx = await readIndex();
  const k = keyword.trim().toLowerCase();
  const results = idx.keywords[k] ?? [];
  return results;
};

const listAssets = async (): Promise<AssetRecord[]> => {
  await ensureRoot();
  const idx = await readIndex();
  const dirEntries = await fs.readdir(assetsRoot, { withFileTypes: true });
  const files = dirEntries
    .filter((entry) => entry.isFile() && entry.name !== "index.json")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return files.map((filename) => ({
    filename,
    keywords: collectKeywordsForAsset(idx, filename),
    url: `/asset-files/${encodeURIComponent(filename)}`,
  }));
};

const detectContentType = (filename: string) => {
  const ext = path.posix.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
};

const normalizeFlatFilename = (filename: string) => {
  const trimmed = filename.trim();
  const safeName = path.posix.basename(trimmed);
  if (!safeName || safeName !== trimmed || trimmed.includes("\\") || trimmed.includes("/")) {
    throw new Error("Invalid filename");
  }
  return safeName;
};

const assertAssetExists = async (filename: string) => {
  const assetPath = path.posix.join(assetsRoot, filename);
  await fs.access(assetPath);
  return assetPath;
};

const seedAssets = async () => {
  if (!seedDemoContent) return;

  await ensureRoot();

  const demoAssetPath = path.posix.join(assetsRoot, "hero-demo.svg");
  await writeFileIfMissing(
    demoAssetPath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-labelledby="title desc">
  <title id="title">QLabs Hero Demo</title>
  <desc id="desc">Abstract local operations hero artwork for the seeded asset catalog.</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#081423"/>
      <stop offset="100%" stop-color="#17314f"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <circle cx="210" cy="160" r="120" fill="#38bdf8" fill-opacity="0.14"/>
  <circle cx="1040" cy="120" r="160" fill="#22d3ee" fill-opacity="0.12"/>
  <rect x="150" y="140" width="980" height="440" rx="28" fill="url(#panel)" stroke="#7dd3fc" stroke-opacity="0.3"/>
  <rect x="210" y="210" width="240" height="34" rx="17" fill="#7dd3fc" fill-opacity="0.18"/>
  <rect x="210" y="278" width="500" height="22" rx="11" fill="#dbeafe" fill-opacity="0.82"/>
  <rect x="210" y="322" width="420" height="18" rx="9" fill="#dbeafe" fill-opacity="0.48"/>
  <rect x="210" y="392" width="170" height="54" rx="27" fill="#38bdf8"/>
  <rect x="770" y="236" width="260" height="220" rx="24" fill="#020817" fill-opacity="0.45" stroke="#93c5fd" stroke-opacity="0.2"/>
  <rect x="810" y="278" width="180" height="20" rx="10" fill="#dbeafe" fill-opacity="0.72"/>
  <rect x="810" y="326" width="140" height="18" rx="9" fill="#dbeafe" fill-opacity="0.42"/>
  <rect x="810" y="372" width="120" height="18" rx="9" fill="#dbeafe" fill-opacity="0.42"/>
</svg>
`,
  );

  await addToIndex("hero", "hero-demo.svg");
  await addToIndex("dashboard", "hero-demo.svg");
  await addToIndex("seeded", "hero-demo.svg");
};

const getServer = () => {
  const server = new McpServer({ name: "mcp-assets", version: "0.1.0" });

  server.registerTool(
    "assets_search",
    {
      description: "Search assets by keyword",
      inputSchema: { keyword: z.string() },
    },
    async (args: { keyword: string }) => {
      const results = await searchIndex(args.keyword);
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    }
  );

  server.registerTool(
    "assets_add",
    {
      description: "Add an asset file and tag it with a keyword",
      inputSchema: { filename: z.string(), keyword: z.string(), contentBase64: z.string() },
    },
    async (args: { filename: string; keyword: string; contentBase64: string }) => {
      await ensureRoot();
      const safeName = normalizeFlatFilename(args.filename);
      const assetPath = path.posix.join(assetsRoot, safeName);
      const buf = parseBase64Strict(args.contentBase64, maxUploadBytes);
      await fs.writeFile(assetPath, buf);
      await addToIndex(args.keyword, safeName);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, filename: safeName, bytesWritten: buf.byteLength }) }] };
    }
  );

  server.registerTool(
    "assets_tag",
    {
      description: "Tag an existing asset with a keyword",
      inputSchema: { filename: z.string(), keyword: z.string() },
    },
    async (args: { filename: string; keyword: string }) => {
      const safeName = normalizeFlatFilename(args.filename);
      await assertAssetExists(safeName);
      await addToIndex(args.keyword, safeName);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, filename: safeName }) }] };
    }
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(withRequestId());

await seedAssets();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, assetsRoot, seeded: seedDemoContent });
});

app.get("/assets", async (req: Request, res: Response) => {
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";
  const assets = await listAssets();
  if (!keyword) {
    res.json({ assets });
    return;
  }
  const normalized = keyword.toLowerCase();
  res.json({
    assets: assets.filter((asset) => asset.keywords.some((entry) => entry.includes(normalized))),
  });
});

app.post("/assets", asyncRoute(async (req: Request, res: Response) => {
  const filename = typeof req.body?.filename === "string" ? req.body.filename : "";
  const contentBase64 = typeof req.body?.contentBase64 === "string" ? req.body.contentBase64 : "";
  const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords.filter((value: unknown) => typeof value === "string") : [];

  if (!filename || !contentBase64) {
    res.status(400).json({ error: "filename and contentBase64 are required" });
    return;
  }

  await ensureRoot();
  const safeName = normalizeFlatFilename(filename);
  const assetPath = path.posix.join(assetsRoot, safeName);
  const buf = parseBase64Strict(contentBase64, maxUploadBytes);
  await fs.writeFile(assetPath, buf);

  for (const keyword of keywords) {
    await addToIndex(keyword, safeName);
  }

  const assets = await listAssets();
  const asset = assets.find((entry) => entry.filename === safeName);
  res.json({ ok: true, asset, bytesWritten: buf.byteLength });
}));

app.post("/assets/:filename/tags", asyncRoute(async (req: Request, res: Response) => {
  const safeName = normalizeFlatFilename(req.params.filename);
  const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords.filter((value: unknown) => typeof value === "string") : [];
  if (keywords.length === 0) {
    res.status(400).json({ error: "keywords are required" });
    return;
  }
  await assertAssetExists(safeName);

  for (const keyword of keywords) {
    await addToIndex(keyword, safeName);
  }

  const assets = await listAssets();
  const asset = assets.find((entry) => entry.filename === safeName);
  res.json({ ok: true, asset });
}));

app.delete("/assets/:filename", asyncRoute(async (req: Request, res: Response) => {
  const safeName = normalizeFlatFilename(req.params.filename);
  const assetPath = await assertAssetExists(safeName);

  await fs.unlink(assetPath);
  await writeIndex(removeAssetFromIndex(await readIndex(), safeName));

  res.json({ ok: true, filename: safeName });
}));

app.get("/asset-files/:filename", asyncRoute(async (req: Request, res: Response) => {
  const safeName = normalizeFlatFilename(req.params.filename);
  const assetPath = await assertAssetExists(safeName);
  const file = await fs.readFile(assetPath);
  res.setHeader("content-type", detectContentType(safeName));
  res.send(file);
}));

app.post("/mcp", async (req: Request, res: Response) => {
  const server = getServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    transport.close();
    server.close();
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/too large/i.test(message)) {
    createErrorResponse(res, 413, "PAYLOAD_TOO_LARGE", message);
    return;
  }
  if (/invalid filename|invalid base64/i.test(message)) {
    createErrorResponse(res, 400, "BAD_REQUEST", message);
    return;
  }
  if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
    createErrorResponse(res, 404, "NOT_FOUND", "Asset not found");
    return;
  }
  createErrorResponse(res, 500, "INTERNAL_ERROR", message);
});

app.listen(port, "0.0.0.0");
