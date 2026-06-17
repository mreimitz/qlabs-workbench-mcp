# QLabs Workbench MCP Completion Roadmap

## Goal & Success Criteria

Make the workbench a maintainable local MCP control plane with hardened services,
stable contracts, passing checks, and a clear QPS-toolkit offload boundary.

Current baseline evidence from 2026-06-17:

- `pnpm typecheck` passes.
- `pnpm build` passes.
- `pnpm smoke` passes against the running local stack.
- `pnpm lint` fails because ESLint 9 has no root flat config and the admin UI
  still uses deprecated `next lint`.
- `pnpm evals` fails `3/6`: QPS eval assertions do not decode nested MCP text
  JSON, and `text_regex_extract` has an over-escaped eval pattern.
- The running stack is healthy with 5 MCP servers and 27 tools exposed.

Dirty-worktree warning: this roadmap was created in a checkout that already had
uncommitted implementation work. Do not revert or overwrite existing changes
unless the owner explicitly asks for that.

Assumption: the target is production-quality internal/local tooling, not a
throwaway prototype.

## Current State & Gap Analysis

The implementation is already useful: Docker Compose, Admin UI, Control API,
Storage API, Assets MCP, Playwright MCP, MarkItDown MCP, TextOps MCP, and QPS
Toolkit MCP exist and run. The QPS server already exposes the important
deterministic offload surface: routing, asset resolution, hero/icon/component
and layout picking, policies, tokens, copy validation, linting, and compatibility
aliases.

Primary gaps:

- Tooling: no working lint setup, no unit test framework, no CI, evals are too
  shallow and currently failing.
- Architecture: large monolith files: `servers/mcp-qps-toolkit/src/index.ts`
  and `apps/admin-ui/src/app/workbench-dashboard.tsx`.
- Contracts: docs define MCP contracts manually, but schemas are not centralized
  or tested.
- Security: no auth boundary, no CSRF protection, weak upload validation, no
  rate limiting, Playwright can browse arbitrary URLs, MarkItDown disables DNS
  rebinding protection.
- Persistence: the local Docker Desktop deployment should use SQLite in the
  Control API Docker volume for registry and run records. File-backed JSON is a
  bootstrap/import source only, not the normal runtime store. Avoid Postgres
  unless the deployment model changes to shared infrastructure.
- QPS write safety: the QPS metadata editor can modify mounted toolkit source;
  this needs explicit dev write mode, atomic writes, and UI guardrails.
- Ops: no structured logs, request IDs, readiness/dependency health, metrics, or
  timeout policy.
- UI quality: functional but too centralized; the visual QA report should be
  refreshed after refactors because several findings are stale.

## Public Interfaces & Defaults

Add these implementation defaults:

- `packages/contracts`: Zod schemas and exported TypeScript types for HTTP and
  MCP payloads.
- `packages/server-utils`: env parsing, safe paths, base64 validation, async
  route wrapper, error envelopes, request IDs, and MCP JSON text decoding.
- Standard HTTP error shape:
  `{ "ok": false, "error": { "code": string, "message": string, "details"?: unknown }, "requestId": string }`
- Standard health shape:
  `{ "ok": boolean, "service": string, "version": string, "configured": boolean, "dependencies": object, "warnings": string[] }`
- New env vars:
  - `CONTROL_DB_PATH`, default `${CONTROL_DATA_ROOT}/control-api.sqlite`.
  - `CONTROL_BOOTSTRAP_FROM_JSON=true|false`, default `true` for one-time local
    migration from existing `registry.json` and `runs.json`.
  - `QPS_TOOLKIT_WRITE_MODE=read-only|metadata`, default `read-only`.
  - `PLAYWRIGHT_ALLOWED_ORIGINS`, default `https://example.com`.
  - `PLAYWRIGHT_BLOCK_PRIVATE_NETWORKS=true`.
  - `MAX_UPLOAD_BYTES`, default `10485760`.
- Remove or document `MCP_GATEWAY_PORT`; no gateway service exists and Control
  API currently fills that role.

## Agentic Implementation Plan

### Task 1: Create Roadmap and Baseline Inventory

Files: `roadmap/README.md`, `roadmap/2026-06-17-qlabs-workbench-mcp-roadmap.md`.

- [ ] Create `roadmap/README.md` explaining that roadmap files are planning
  artifacts, not runtime source.
- [ ] Save this roadmap as the dated roadmap file.
- [ ] Record baseline command results and the dirty-worktree warning.
- [ ] Verify no runtime behavior changed.

Acceptance: roadmap directory exists and contains the baseline plan.

### Task 2: Repair Tooling Gates

Files: root `eslint.config.mjs`, package scripts, admin UI lint config.

- [ ] Replace `apps/admin-ui` script `next lint` with `eslint .`.
- [ ] Add a root ESLint 9 flat config covering TypeScript and Next files.
- [ ] Ignore generated outputs: `.next`, `dist`, `tsconfig.tsbuildinfo`,
  `reports`, and `node_modules`.
- [ ] Add root scripts: `test`, `test:unit`, and `test:integration`.
- [ ] Add Vitest and Supertest as workspace dev tooling.

Acceptance: `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass from repo root.

### Task 3: Add Shared Contracts and Server Utilities

Files: `packages/contracts`, `packages/server-utils`.

- [ ] Define schemas for health, errors, run requests, run records, storage
  browse/files, assets, and QPS tool outputs.
- [ ] Add `safePathUnder(root, input)`, `parseBase64Strict`,
  `createErrorResponse`, `asyncRoute`, `withRequestId`, and
  `decodeMcpTextJson`.
- [ ] Export types from schemas with `z.infer`.
- [ ] Refactor one low-risk service first, `mcp-textops`, to prove the pattern.

Acceptance: shared packages compile and tests cover path, base64, and MCP JSON
decoding.

### Task 4: Fix Eval Harness and Golden Cases

Files: `scripts/run-evals.mjs`, `evals/cases/*.json`, `evals/README.md`.

- [ ] Decode `run.response.content[].text` when it is JSON and assert against
  decoded payloads.
- [ ] Change TextOps regex eval pattern from over-escaped `"\\\\d"` to `"\\d"`.
- [ ] Add exact JSON-path assertions, not only substring matching.
- [ ] Add eval cases for every QPS tool and every base MCP server.

Acceptance: `pnpm evals` passes on the running stack and with
`EVAL_ONLY=qps-toolkit.json`.

### Task 5: Harden Control API

Files: `apps/control-api/src/*`, migrations folder, contracts package.

- [ ] Split the current single file into `server.ts`, `registry.ts`, `runs.ts`,
  `mcp-client.ts`, and `health.ts`.
- [ ] Add request validation for `/runs` and `/servers/:name`.
- [ ] Add timeouts around MCP list and call operations.
- [ ] Persist registry and run records in SQLite using idempotent SQL
  migrations stored with the Control API.
- [ ] Bootstrap from existing `registry.json` and `runs.json` only when
  explicitly enabled for local migration; never silently fall back to file JSON
  for normal runtime persistence.

Acceptance: API remains compatible, run records survive restarts, and
concurrent smoke/eval runs do not corrupt registry state.

### Task 6: Harden Storage and Assets APIs

Files: `apps/storage-api/src/*`, `servers/mcp-assets/src/*`.

- [ ] Replace lenient base64 decoding with strict validation.
- [ ] Enforce `MAX_UPLOAD_BYTES`.
- [ ] Add try/catch wrappers and consistent status codes: `400` invalid input,
  `404` missing file, `413` too large.
- [ ] Reject empty filenames, path separators for flat asset names, and
  unsupported metadata writes.
- [ ] Prevent tags from referencing missing files.

Acceptance: tests cover traversal attempts, invalid base64, oversized uploads,
missing files, and valid uploads.

### Task 7: Secure Playwright MCP

Files: `servers/mcp-playwright/src/*`.

- [ ] Add URL policy: allowlist origins, block private/link-local/internal
  networks by default.
- [ ] Wrap browser lifecycle in `try/finally`.
- [ ] Add navigation and screenshot timeouts.
- [ ] Add inputs for viewport, full-page flag, and wait strategy with bounded
  enums.
- [ ] Return structured JSON including path, bytes, viewport, duration, and
  warnings.

Acceptance: browser closes on failure, blocked URLs fail deterministically, and
screenshots still work for allowed URLs.

### Task 8: Harden MarkItDown MCP

Files: `servers/mcp-markitdown/server.py`, `requirements.txt`.

- [ ] Re-enable DNS rebinding protection unless a documented local override is
  set.
- [ ] Add `/health` with configured storage root and dependency status.
- [ ] Enforce safe input/output paths and allowed output extension `.md`.
- [ ] Add file size guard and structured error responses.
- [ ] Pin Python dependencies to known-good versions.

Acceptance: conversion smoke still works; invalid paths, missing files, and
oversized files return clean failures.

### Task 9: Modularize QPS Toolkit MCP

Files: `servers/mcp-qps-toolkit/src/*`.

- [ ] Create focused modules for config, paths, loaders, routing, assets, hero,
  icons, components, layouts, policies, tokens, copy lint, HTTP assets, tools,
  and server setup.
- [ ] Move logic without behavior changes first; keep exports pure and testable.
- [ ] Add fixture-driven tests using the mounted QPS checkout or minimal
  fixtures.
- [ ] Add `QPS_TOOLKIT_WRITE_MODE`; disable `PUT /assets/meta` unless set to
  `metadata`.
- [ ] Make metadata writes atomic with temp file + rename, and clear only
  affected memo caches.

Acceptance: all current tools remain visible, QPS evals pass, and read-only
mode blocks writes with `403`.

### Task 10: Clarify QPS Offload Boundary

Files: `docs/mcp-tool-contracts.md`, `docs/agentic-development.md`, QPS server
docs.

- [ ] Classify QPS functions into MCP-owned deterministic tools versus
  plugin-owned LLM/prompt behavior.
- [ ] Document MCP-owned behavior: routing, resolver/picker logic, tokens,
  policy extraction, copy lint, metadata browsing.
- [ ] Document plugin-owned behavior: elicitation, narrative generation,
  artifact synthesis, subjective composition decisions.
- [ ] Add compatibility policy for aliases like `pick_hero` and `qps_pick_hero`.

Acceptance: docs state what belongs in MCP, what stays in the plugin, and how
deprecations work.

### Task 11: Refactor Admin UI Into Feature Modules

Files: `apps/admin-ui/src/app/*`.

- [ ] Split `workbench-dashboard.tsx` into shell, overview, servers, runner,
  assets, storage, and shared UI helpers.
- [ ] Split `qps-assets-browser.tsx` into folder tree, gallery, metadata panel,
  and API client.
- [ ] Generate tool runner default args from schemas where possible; keep manual
  defaults only as overrides.
- [ ] Disable QPS metadata save controls when `QPS_TOOLKIT_WRITE_MODE=read-only`.
- [ ] Refresh the brand/visual audit after refactor.

Acceptance: UI behavior is unchanged or improved, files are smaller, and visual
audit findings are current.

### Task 12: Add CI and Release Checks

Files: `.github/workflows/ci.yml`, root scripts.

- [ ] CI job: install with pnpm, run lint, typecheck, build, and unit tests.
- [ ] Optional service job: start Compose, run smoke and evals.
- [ ] Upload eval output and visual report as artifacts.
- [ ] Add a preflight command that runs all release gates locally.

Acceptance: CI is green on a clean checkout and catches lint/eval failure
classes.

### Task 13: Docker and Ops Hardening

Files: Dockerfiles, `docker-compose.yml`, README.

- [ ] Run Node services as non-root users.
- [ ] Add healthcheck blocks for every service.
- [ ] Add structured JSON logging with request IDs.
- [ ] Document ports and remove unused envs.
- [ ] Add readiness checks for SQLite, QPS mount, storage, and assets.

Acceptance: `docker compose ps` shows health states; logs can correlate one UI
request through Control API to MCP execution.

## Final Verification Gate

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm compose:up`
- `pnpm smoke`
- `pnpm evals`
- `pnpm compose:up:qps`
- `EVAL_ONLY=qps-toolkit.json pnpm evals`

## Risks & Mitigations

- Refactoring large QPS/UI files can change behavior. Mitigate with
  characterization tests before functional changes.
- SQLite migration can fail if the volume path is not writable. Mitigate with
  startup checks, clear health output, and one-time JSON bootstrap for existing
  local data.
- QPS metadata editing can damage the source checkout. Mitigate with read-only
  default, explicit metadata mode, atomic writes, and tests.
- Evals can become brittle. Mitigate with JSON-path assertions and stable
  fixtures.
- Shared packages can over-abstract too early. Mitigate by extracting only
  utilities used by at least two services.
