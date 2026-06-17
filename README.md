# qlabs-workbench-mcp

Local Docker Desktop stack that runs multiple MCP servers plus an admin UI, file storage, and automation runtimes.

## Quick start

1. Bootstrap local files

   - `pnpm setup:local`

2. Start the default stack

   - `pnpm compose:up`

3. Open

   - Admin UI: `http://localhost:3000`
   - Control API: `http://localhost:4000/health`
   - Storage API: `http://localhost:4100/health`
   - MCP servers:
     - Playwright: `http://localhost:7010/mcp`
     - MarkItDown: `http://localhost:7020/mcp`
     - TextOps: `http://localhost:7030/mcp`
     - Assets: `http://localhost:7040/mcp`

4. Run smoke checks

   - `pnpm smoke`

## Seeded demo content

- The stack now seeds demo storage and asset data by default when `SEED_DEMO_CONTENT=true`.
- Storage starts with:
  - `docs/example.html`
  - `notes/todo.txt`
  - `playwright/README.md`
- Assets start with:
  - `hero-demo.svg` tagged as `hero`, `dashboard`, and `seeded`
- These defaults make the first-run dashboard, asset library, and smoke flows immediately usable.

## Optional QPS toolkit content

- QPS is now opt-in.
- Set `ENABLE_QPS_TOOLKIT=true` in `.env` and start the profiled stack:
  - `pnpm compose:up:qps`
- The default local mount is `./local/qps-toolkit`; point `QPS_TOOLKIT_ROOT` at a real qps-toolkit checkout (for example your local `qps-toolkit` repo) if you want the QPS tools and shared assets fully active.
- When enabled without mounted toolkit content, the admin UI marks the integration as `Setup required` instead of treating it as a broken service.
- When `ENABLE_QPS_TOOLKIT=false`, the default stack omits QPS entirely from the service registry and endpoints list.
- The Admin UI “Assets” view can browse `plugin/shared/assets` (folder tree + gallery + detail panel) and can update tags in the pack/metadata JSONs when the mount is writable.

## Local env validation

- The admin UI server routes now require `CONTROL_API_URL`, `STORAGE_API_URL`, and `ASSETS_API_URL`.
- The Node services now fail fast on missing required storage/control envs instead of silently falling back.
- `pnpm setup:local` creates `.env` if it does not exist and ensures the placeholder `local/qps-toolkit` mount path exists.

## MCP client configuration

Many clients can connect to remote MCP servers using Streamable HTTP via a helper like `mcp-remote`.

Example shape:

```json
{
  "mcpServers": {
    "textops": { "command": "npx", "args": ["mcp-remote", "http://127.0.0.1:7030/mcp"] },
    "assets": { "command": "npx", "args": ["mcp-remote", "http://127.0.0.1:7040/mcp"] }
  }
}
```

## Agentic development

Start here:

- [docs/agentic-development.md](file:///Users/czq/Documents/DEV/qlabs/qlabs-workbench-mcp/docs/agentic-development.md)
- [docs/mcp-tool-contracts.md](file:///Users/czq/Documents/DEV/qlabs/qlabs-workbench-mcp/docs/mcp-tool-contracts.md)
