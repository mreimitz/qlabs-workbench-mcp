# Agentic development practices

## Contracts first

- Treat each MCP tool as a stable contract: name, input schema, output shape, side effects, and failure modes.
- Prefer small tools with narrow scope over one multi-purpose tool with many flags.
- Keep tool responses deterministic by default and expose randomness only when explicitly requested.

## Idempotency and replay

- Make write tools idempotent when possible (create-if-missing semantics, upserts, content hashes).
- Return stable identifiers and paths so an agent can resume after an interruption.
- Avoid implicit global state in tools unless it is explicitly modeled and queryable.

## Safety boundaries

- Restrict filesystem access to mounted roots (`STORAGE_ROOT`, `ASSETS_ROOT`) and validate paths.
- Validate inputs before doing any I/O.
- Do not log secrets and do not echo back confidential content by default.
- Do not modify files outside this repository’s workspace root; treat external paths as read-only references.

## Observability for agents

- Provide `health` endpoints on non-MCP HTTP services.
- Prefer structured responses over free-form text.
- Include enough metadata for debugging: paths written, bytes written, counts, and timestamps.

## Long running work

- Use MCP tasks for long operations when the SDK supports it (poll/resume patterns).
- For Playwright automation, expose operations that can be chunked and resumed.

## Testing and evals

- Keep a small set of golden “eval cases” that call tools with fixed inputs and validate outputs.
- Track regressions by snapshotting tool outputs for stable cases.
- Prefer contract tests at the MCP boundary over internal unit tests when tool behavior is the product.

## Tool naming and namespacing

- Use stable prefixes per domain (`pw_*`, `markitdown_*`, `text_*`, `assets_*`).
- Avoid breaking renames; add new tools and deprecate old ones gradually.

## QPS toolkit offload boundary

- Keep deterministic, non-LLM QPS behavior in MCP tools: routing, asset resolution, picker scoring, token lookup, policy extraction, copy validation, artifact linting, asset browsing, and guarded metadata editing.
- Keep LLM-dependent QPS behavior in the plugin: elicitation, narrative generation, artifact synthesis, subjective composition choices, and any step that requires interpreting user intent beyond deterministic scoring.
- Compatibility aliases are allowed for migration, but canonical QPS tool names use the `qps_*` prefix. Do not remove aliases until evals and docs cover the replacement path.
- Metadata writes to a mounted QPS checkout are read-only by default. Enable them only with `QPS_TOOLKIT_WRITE_MODE=metadata`.

## Data lifecycle

- Store raw bytes in filesystem volumes.
- Store metadata (folders, tags, keywords, job history) in a database, even if the first scaffold starts as file-backed JSON.
