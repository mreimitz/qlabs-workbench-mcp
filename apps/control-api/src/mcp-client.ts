import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { HealthPayload, McpClientFacade, McpServerRef, Tool } from "./types.js";

const withTimeout = async <T,>(operation: Promise<T>, timeoutMs: number, label: string) =>
  Promise.race([
    operation,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);

const withServerClient = async <T,>(
  server: McpServerRef,
  timeoutMs: number,
  fn: (client: Client) => Promise<T>,
) => {
  const client = new Client({ name: "control-api", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(server.url));
  await client.connect(transport);
  try {
    return await withTimeout(fn(client), timeoutMs, "MCP operation");
  } finally {
    await transport.close();
  }
};

export const createMcpClient = (timeoutMs: number): McpClientFacade => ({
  async listToolsForServer(server: McpServerRef): Promise<Tool[]> {
    return withServerClient(server, timeoutMs, async (client) => {
      const res = await client.listTools();
      return (res.tools ?? []) as Tool[];
    });
  },

  async callToolOnServer(server: McpServerRef, toolName: string, args: unknown): Promise<unknown> {
    return withServerClient(server, timeoutMs, async (client) =>
      client.callTool({
        name: toolName,
        arguments: (args ?? {}) as Record<string, unknown>,
      }),
    );
  },

  async fetchHealth(healthUrl: string): Promise<HealthPayload | undefined> {
    const response = await withTimeout(fetch(healthUrl), timeoutMs, "Health check");
    if (!response.ok) return { ok: false };
    try {
      return (await response.json()) as HealthPayload;
    } catch {
      return undefined;
    }
  },
});
