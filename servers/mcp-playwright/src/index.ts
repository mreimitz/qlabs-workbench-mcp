import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import * as z from "zod/v4";
import path from "node:path";
import fs from "node:fs/promises";
import { Browser, chromium } from "playwright";
import { assertUrlAllowed, parseAllowedOrigins } from "./url-policy.js";

const port = Number.parseInt(process.env.PORT ?? "7010", 10);
const storageRoot = process.env.STORAGE_ROOT ?? "/data/storage";
const allowedOrigins = parseAllowedOrigins(process.env.PLAYWRIGHT_ALLOWED_ORIGINS);
const blockPrivateNetworks = process.env.PLAYWRIGHT_BLOCK_PRIVATE_NETWORKS
  ? /^(1|true|yes|on)$/i.test(process.env.PLAYWRIGHT_BLOCK_PRIVATE_NETWORKS)
  : true;
const defaultTimeoutMs = Number.parseInt(process.env.PLAYWRIGHT_TIMEOUT_MS ?? "15000", 10);

const ensureDir = async (p: string) => {
  await fs.mkdir(p, { recursive: true });
};

const getServer = () => {
  const server = new McpServer({ name: "mcp-playwright", version: "0.1.0" });

  server.registerTool(
    "pw_get_title",
    {
      description: "Navigate to an allowed URL and return document.title",
      inputSchema: {
        url: z.string().url(),
        waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
        timeoutMs: z.number().int().min(1000).max(60000).optional(),
      },
    },
    async (args: { url: string; waitUntil?: "load" | "domcontentloaded" | "networkidle"; timeoutMs?: number }) => {
      const url = await assertUrlAllowed(args.url, allowedOrigins, blockPrivateNetworks);
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(url.href, {
          waitUntil: args.waitUntil ?? "domcontentloaded",
          timeout: args.timeoutMs ?? defaultTimeoutMs,
        });
        const title = await page.title();
        return { content: [{ type: "text", text: title }] };
      } finally {
        await browser?.close();
      }
    }
  );

  server.registerTool(
    "pw_screenshot",
    {
      description: "Take a full-page screenshot and store it in shared storage",
      inputSchema: {
        url: z.string().url(),
        filename: z.string().optional(),
        waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional(),
        timeoutMs: z.number().int().min(1000).max(60000).optional(),
        fullPage: z.boolean().optional(),
        viewport: z
          .object({
            width: z.number().int().min(320).max(3840),
            height: z.number().int().min(240).max(2160),
          })
          .optional(),
      },
    },
    async (args: {
      url: string;
      filename?: string;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
      timeoutMs?: number;
      fullPage?: boolean;
      viewport?: { width: number; height: number };
    }) => {
      const startedAt = Date.now();
      const url = await assertUrlAllowed(args.url, allowedOrigins, blockPrivateNetworks);
      let browser: Browser | null = null;
      try {
        browser = await chromium.launch();
        const page = await browser.newPage({ viewport: args.viewport ?? { width: 1280, height: 720 } });
        await page.goto(url.href, {
          waitUntil: args.waitUntil ?? "networkidle",
          timeout: args.timeoutMs ?? defaultTimeoutMs,
        });

        const dir = path.posix.join(storageRoot, "playwright");
        await ensureDir(dir);

        const safeName = path.posix.basename(args.filename ?? `screenshot-${Date.now()}.png`);
        const full = path.posix.join(dir, safeName);
        await page.screenshot({ path: full, fullPage: args.fullPage ?? true });
        const stat = await fs.stat(full);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                path: `playwright/${safeName}`,
                bytes: stat.size,
                viewport: args.viewport ?? { width: 1280, height: 720 },
                fullPage: args.fullPage ?? true,
                waitUntil: args.waitUntil ?? "networkidle",
                durationMs: Date.now() - startedAt,
                warnings: [],
              }),
            },
          ],
        };
      } finally {
        await browser?.close();
      }
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
