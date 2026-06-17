import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import * as z from "zod/v4";
import { asyncRoute, withRequestId } from "@qlabs/server-utils";

const port = Number.parseInt(process.env.PORT ?? "7030", 10);

const getServer = () => {
  const server = new McpServer({ name: "mcp-textops", version: "0.1.0" });

  server.registerTool(
    "text_uppercase",
    {
      description: "Uppercase a string",
      inputSchema: { text: z.string() },
    },
    async (args: { text: string }) => ({ content: [{ type: "text", text: args.text.toUpperCase() }] })
  );

  server.registerTool(
    "text_lowercase",
    {
      description: "Lowercase a string",
      inputSchema: { text: z.string() },
    },
    async (args: { text: string }) => ({ content: [{ type: "text", text: args.text.toLowerCase() }] })
  );

  server.registerTool(
    "text_trim",
    {
      description: "Trim whitespace",
      inputSchema: { text: z.string() },
    },
    async (args: { text: string }) => ({ content: [{ type: "text", text: args.text.trim() }] })
  );

  server.registerTool(
    "text_regex_extract",
    {
      description: "Extract matches using a regex pattern",
      inputSchema: { text: z.string(), pattern: z.string(), flags: z.string().optional() },
    },
    async (args: { text: string; pattern: string; flags?: string }) => {
      try {
        const baseFlags = args.flags ?? "";
        const flagSet = new Set(baseFlags.split("").filter(Boolean));
        flagSet.add("g");
        const re = new RegExp(args.pattern, [...flagSet].join(""));
        const matches = Array.from(args.text.matchAll(re)).map((m) => String((m as RegExpMatchArray)[0] ?? ""));
        return { content: [{ type: "text", text: JSON.stringify({ matches }) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }] };
      }
    }
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(withRequestId());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/mcp", asyncRoute(async (req: Request, res: Response) => {
  const server = getServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    transport.close();
    server.close();
  });
}));

app.listen(port, "0.0.0.0");
