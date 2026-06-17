import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import * as z from "zod/v4";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "playwright";

const port = Number.parseInt(process.env.PORT ?? "7010", 10);
const storageRoot = process.env.STORAGE_ROOT ?? "/data/storage";

const ensureDir = async (p: string) => {
  await fs.mkdir(p, { recursive: true });
};

const getServer = () => {
  const server = new McpServer({ name: "mcp-playwright", version: "0.1.0" });

  server.registerTool(
    "pw_get_title",
    { description: "Navigate to a URL and return document.title", inputSchema: { url: z.string().url() } },
    async (args: { url: string }) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(args.url, { waitUntil: "domcontentloaded" });
      const title = await page.title();
      await browser.close();
      return { content: [{ type: "text", text: title }] };
    }
  );

  server.registerTool(
    "pw_screenshot",
    {
      description: "Take a full-page screenshot and store it in shared storage",
      inputSchema: { url: z.string().url(), filename: z.string().optional() },
    },
    async (args: { url: string; filename?: string }) => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(args.url, { waitUntil: "networkidle" });

      const dir = path.posix.join(storageRoot, "playwright");
      await ensureDir(dir);

      const safeName = path.posix.basename(args.filename ?? `screenshot-${Date.now()}.png`);
      const full = path.posix.join(dir, safeName);
      await page.screenshot({ path: full, fullPage: true });
      await browser.close();
      return { content: [{ type: "text", text: JSON.stringify({ path: `playwright/${safeName}` }) }] };
    }
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

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

app.listen(port, "0.0.0.0");
