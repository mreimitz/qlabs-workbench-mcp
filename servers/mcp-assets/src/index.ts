import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { asyncRoute, createErrorResponse, envFlag, parseBase64Strict, requiredEnv, withRequestId } from "@qlabs/server-utils";
import express, { Request, Response } from "express";
import * as z from "zod/v4";
import {
  createAssetStore,
  type AssetKind,
  type AssetMetadataPatch,
} from "./asset-store.js";

const port = Number.parseInt(process.env.PORT ?? "7040", 10);
const assetsRoot = requiredEnv("ASSETS_ROOT");
const seedDemoContent = envFlag(process.env.SEED_DEMO_CONTENT, true);
const importQpsOnStart = envFlag(process.env.IMPORT_QPS_ASSETS_ON_START, false);
const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? "10485760", 10);
const qpsAssetsRoot =
  process.env.QPS_ASSETS_ROOT ??
  (process.env.QPS_TOOLKIT_PLUGIN_ROOT
    ? `${process.env.QPS_TOOLKIT_PLUGIN_ROOT.replace(/\/+$/, "")}/shared/assets`
    : undefined);

const store = createAssetStore({ assetsRoot, qpsAssetsRoot });

const metadataFromRequest = (body: unknown): AssetMetadataPatch => {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const meta = source.metadata && typeof source.metadata === "object"
    ? (source.metadata as Record<string, unknown>)
    : source;

  const stringValue = (key: string) => {
    const value = meta[key];
    return typeof value === "string" ? value : undefined;
  };
  const stringArray = (key: string) => {
    const value = meta[key];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : undefined;
  };

  const keyword = typeof source.keyword === "string" ? source.keyword : undefined;
  const keywords = Array.isArray(source.keywords)
    ? source.keywords.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  const tags = stringArray("tags") ?? keywords ?? (keyword ? [keyword] : undefined);

  return {
    title: stringValue("title"),
    kind: stringValue("kind") as AssetKind | undefined,
    tags,
    source: stringValue("source") as AssetMetadataPatch["source"],
    sourcePath: stringValue("sourcePath"),
    slots: stringArray("slots"),
    area: stringValue("area"),
    type: stringValue("type"),
    variant: stringValue("variant"),
    useWhen: stringValue("useWhen") ?? stringValue("use_when"),
    aliases: stringArray("aliases"),
    categories: stringArray("categories"),
    qlikCategory: stringValue("qlikCategory") ?? stringValue("qlik_category"),
    license: stringValue("license"),
    hex: stringValue("hex"),
  };
};

const assetPathFromBody = (body: unknown) => {
  if (!body || typeof body !== "object") return "";
  const source = body as Record<string, unknown>;
  const path = typeof source.path === "string" ? source.path : "";
  const filename = typeof source.filename === "string" ? source.filename : "";
  return path || filename;
};

const seedAssets = async () => {
  await store.syncIndex();
  if (!seedDemoContent) return;

  const index = await store.readIndex();
  if (index.assets["hero-demo.svg"]) return;

  await store.writeAsset({
    path: "hero-demo.svg",
    content: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" role="img" aria-labelledby="title desc">
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
`),
    metadata: {
      title: "QLabs Hero Demo",
      kind: "image",
      tags: ["hero", "dashboard", "seeded"],
      source: "seed",
    },
  });
};

const getServer = () => {
  const server = new McpServer({ name: "mcp-assets", version: "0.2.0" });

  server.registerTool(
    "assets_search",
    {
      description: "Search managed assets by keyword",
      inputSchema: { keyword: z.string() },
    },
    async (args: { keyword: string }) => {
      const results = await store.searchAssets(args.keyword);
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    },
  );

  server.registerTool(
    "assets_add",
    {
      description: "Add a managed asset file and tag it with a keyword",
      inputSchema: { filename: z.string(), keyword: z.string(), contentBase64: z.string() },
    },
    async (args: { filename: string; keyword: string; contentBase64: string }) => {
      const buf = parseBase64Strict(args.contentBase64, maxUploadBytes);
      const asset = await store.writeAsset({
        path: args.filename,
        content: buf,
        metadata: { tags: [args.keyword], source: "upload" },
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              filename: asset.filename,
              path: asset.path,
              bytesWritten: buf.byteLength,
            }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "assets_tag",
    {
      description: "Tag an existing managed asset with a keyword",
      inputSchema: { filename: z.string(), keyword: z.string() },
    },
    async (args: { filename: string; keyword: string }) => {
      const existing = (await store.listAssets()).find((asset) => asset.path === args.filename);
      const tags = [...(existing?.tags ?? []), args.keyword];
      const asset = await store.updateMetadata(args.filename, { tags });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, filename: asset.filename, path: asset.path }),
          },
        ],
      };
    },
  );

  server.registerTool(
    "assets_browse",
    {
      description: "Browse folders and files in the managed asset library",
      inputSchema: { path: z.string().optional() },
    },
    async (args: { path?: string }) => {
      const payload = await store.browse(args.path ?? "");
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  );

  server.registerTool(
    "assets_get",
    {
      description: "Get managed asset metadata by path",
      inputSchema: { path: z.string() },
    },
    async (args: { path: string }) => {
      const asset = (await store.listAssets()).find((entry) => entry.path === args.path) ?? null;
      return { content: [{ type: "text", text: JSON.stringify({ ok: Boolean(asset), asset }) }] };
    },
  );

  server.registerTool(
    "assets_update_metadata",
    {
      description: "Update managed asset metadata",
      inputSchema: { path: z.string(), metadata: z.record(z.string(), z.unknown()) },
    },
    async (args: { path: string; metadata: AssetMetadataPatch }) => {
      const asset = await store.updateMetadata(args.path, args.metadata);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, asset }) }] };
    },
  );

  server.registerTool(
    "assets_delete",
    {
      description: "Delete a managed asset by path",
      inputSchema: { path: z.string() },
    },
    async (args: { path: string }) => {
      const result = await store.deleteAsset(args.path);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "assets_import_qps",
    {
      description: "Import missing qps-toolkit seed assets into the managed asset library",
      inputSchema: {},
    },
    async () => {
      const result = await store.importQpsAssets();
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...result }) }] };
    },
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(withRequestId());

await seedAssets();
if (importQpsOnStart) await store.importQpsAssets();

app.get("/health", asyncRoute(async (_req: Request, res: Response) => {
  res.json({
    ok: true,
    assetsRoot,
    qpsAssetsRoot,
    seeded: seedDemoContent,
    importQpsOnStart,
    assetCount: (await store.listAssets()).length,
  });
}));

app.get("/assets", asyncRoute(async (req: Request, res: Response) => {
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword : "";
  const assetPath = typeof req.query.path === "string" ? req.query.path : "";
  const assets = await store.listAssets({ keyword, path: assetPath });
  res.json({ assets });
}));

app.get("/assets/browse", asyncRoute(async (req: Request, res: Response) => {
  const assetPath = typeof req.query.path === "string" ? req.query.path : "";
  res.json(await store.browse(assetPath));
}));

app.post("/assets", asyncRoute(async (req: Request, res: Response) => {
  const assetPath = assetPathFromBody(req.body);
  const contentBase64 = typeof req.body?.contentBase64 === "string" ? req.body.contentBase64 : "";
  if (!assetPath || !contentBase64) {
    res.status(400).json({ error: "path/filename and contentBase64 are required" });
    return;
  }

  const buf = parseBase64Strict(contentBase64, maxUploadBytes);
  const asset = await store.writeAsset({
    path: assetPath,
    content: buf,
    metadata: { ...metadataFromRequest(req.body), source: "upload" },
  });
  res.json({ ok: true, asset, bytesWritten: buf.byteLength });
}));

app.put("/assets/meta", asyncRoute(async (req: Request, res: Response) => {
  const queryPath = typeof req.query.path === "string" ? req.query.path : "";
  const assetPath = queryPath || assetPathFromBody(req.body);
  const metadata = metadataFromRequest(req.body);
  if (!assetPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  const asset = await store.updateMetadata(assetPath, metadata);
  res.json({ ok: true, asset });
}));

app.post("/assets/import/qps", asyncRoute(async (_req: Request, res: Response) => {
  res.json({ ok: true, ...(await store.importQpsAssets()) });
}));

app.delete("/assets", asyncRoute(async (req: Request, res: Response) => {
  const assetPath = typeof req.query.path === "string" ? req.query.path : "";
  if (!assetPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  res.json(await store.deleteAsset(assetPath));
}));

app.post("/assets/:filename/tags", asyncRoute(async (req: Request, res: Response) => {
  const filename = req.params.filename;
  const keywords = Array.isArray(req.body?.keywords)
    ? req.body.keywords.filter((value: unknown): value is string => typeof value === "string")
    : typeof req.body?.keyword === "string"
      ? [req.body.keyword]
      : [];
  if (keywords.length === 0) {
    res.status(400).json({ error: "keywords are required" });
    return;
  }

  const existing = (await store.listAssets()).find((asset) => asset.path === filename);
  const asset = await store.updateMetadata(filename, {
    tags: [...(existing?.tags ?? []), ...keywords],
  });
  res.json({ ok: true, asset });
}));

app.delete("/assets/:filename", asyncRoute(async (req: Request, res: Response) => {
  res.json(await store.deleteAsset(req.params.filename));
}));

app.get("/asset-files", asyncRoute(async (req: Request, res: Response) => {
  const assetPath = typeof req.query.path === "string" ? req.query.path : "";
  if (!assetPath) {
    res.status(400).json({ error: "path is required" });
    return;
  }

  const file = await store.readFile(assetPath);
  res.setHeader("content-type", file.contentType);
  res.send(file.buffer);
}));

app.get("/asset-files/:filename", asyncRoute(async (req: Request, res: Response) => {
  const file = await store.readFile(req.params.filename);
  res.setHeader("content-type", file.contentType);
  res.send(file.buffer);
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
  if (/invalid asset path|invalid base64|generated asset catalog|qps assets root/i.test(message)) {
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
