# Evals

This folder holds contract-level eval cases that call MCP tools with fixed inputs.

## Case format

Each case is a JSON object:

- `server`: docker-compose service name
- `tool`: MCP tool name
- `input`: tool arguments
- `expect.path`: dot-separated JSON path to assert, including array indexes such as `run.response.findings.0.id`
- `expect.equals`: exact JSON value expected at `expect.path`
- `expect.contains`: legacy substring assertion for text-heavy outputs such as inline SVG

If an MCP tool returns JSON inside a text content item, the runner decodes that JSON before applying assertions.

Example:

```json
{
  "server": "mcp-textops",
  "tool": "text_uppercase",
  "input": { "text": "abc" },
  "expect": { "path": "run.response", "equals": "ABC" }
}
```

## Running evals

Run all eval cases:

```bash
pnpm evals
```

This expects the Control API to have the target MCP servers registered. For the full stack, use:

```bash
pnpm compose:up
```

For qps-toolkit evals, ensure `mcp-qps-toolkit` is registered and the QPS toolkit checkout is mounted:

```bash
pnpm compose:up:qps
```

Run only one case file:

```bash
EVAL_ONLY=qps-toolkit.json pnpm evals
```
