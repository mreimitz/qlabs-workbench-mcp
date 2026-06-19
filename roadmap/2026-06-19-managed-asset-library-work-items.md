# Managed Asset Library Work Items

## Goal & Success Criteria

Make the managed asset library the canonical source for QPS-compatible assets,
with safe mutation semantics, complete runtime verification, clear MCP/REST
contracts, and production-ready controls around imports, uploads, metadata, and
catalog regeneration.

Success criteria:

- `ASSETS_ROOT` remains the canonical runtime library for managed assets.
- Real QPS seed import is validated against a real qps-toolkit checkout.
- QPS asset resolution works from generated managed catalogs.
- Upload, edit, preview, delete, import, and resolver flows are covered by
  committed tests.
- Metadata mutations preserve source-derived fields and regenerate all
  compatibility catalogs deterministically.
- Health, validation, file policy, and concurrency behavior are explicit.
- Full repo gates and Docker service checks pass before PR.

## Current Evidence

Baseline evidence from 2026-06-19:

- Real QPS checkout found at `/Users/czq/Documents/DEV/Skills/qps-toolkit`.
- Local `.env` was pointed at that checkout with
  `QPS_TOOLKIT_ROOT=/Users/czq/Documents/DEV/Skills/qps-toolkit`.
- `POST http://localhost:7040/assets/import/qps` imported 1017 QPS files.
- `mcp-assets` health reported `assetCount=1020` after import.
- `mcp-qps-toolkit` health reported `configured=true` and `missingPaths=[]`.
- Live `qps_resolve_asset` verified icon, product, brand-art, hero, and brand
  resolution from managed catalogs.
- Live delete/restore verified deleting `icons/qlik-artifacts/assistant.svg`
  removed it from canonical search and exact resolver output, then QPS import
  restored it.
- Runtime metadata for touched validation assets was repaired from source QPS
  catalogs after the old metadata merge behavior erased optional fields.

Dirty-worktree warning: this file was added in a checkout that already had
uncommitted managed asset library work. Do not revert or overwrite existing
changes unless the owner explicitly asks for that.

## Work Items

### WI-001: Remove Duplicate QPS Resolver Logic From `index.ts`

Priority: P0

Status: Open

Files:

- Modify: `servers/mcp-qps-toolkit/src/index.ts`
- Modify: `servers/mcp-qps-toolkit/src/asset-resolver.ts`
- Test: `servers/mcp-qps-toolkit/src/asset-resolver.test.ts`

Scope:

- Make `asset-resolver.ts` the single owner of icon, hero, product, brand-art,
  brand, inline icon, and diagram icon resolution.
- Keep `index.ts` responsible for HTTP/MCP wiring, request schema registration,
  service health, and legacy REST endpoints only.
- Remove duplicated local memo variables, pack loaders, scoring helpers, and
  resolver functions from `index.ts` after equivalent behavior is covered in
  `asset-resolver.ts`.

Acceptance criteria:

- `rg "const loadIconsPack|const resolveBrandArt|const pickHero|scoreIcon" servers/mcp-qps-toolkit/src/index.ts`
  returns no old resolver implementation.
- `qps_resolve_asset`, `resolve_asset`, `qps_pick_hero`,
  `qps_pick_html_icon`, and `qps_pick_diagram_icons` keep the same public
  response shapes.
- Live resolver smoke passes for icon, product, brand-art, hero, and brand.

Verification:

- `pnpm vitest run servers/mcp-qps-toolkit/src/asset-resolver.test.ts --reporter=dot`
- `pnpm --filter @qlabs/mcp-qps-toolkit build`
- Live MCP call matrix against `http://localhost:7050/mcp`.

Risks and mitigations:

- Risk: moving duplicated logic can change scoring. Mitigate with
  characterization tests before deleting old code.
- Risk: REST metadata endpoints still depend on local pack loaders. Mitigate by
  extracting shared catalog read helpers first.

### WI-002: Decide Demo Asset Retention Policy

Priority: P0

Status: Open

Files:

- Modify: `servers/mcp-assets/src/index.ts`
- Modify: `servers/mcp-assets/src/asset-store.test.ts`
- Modify: `README.md`

Scope:

- Decide whether `eval-asset.svg`, `hero-demo.svg`, and `pixel.png` should
  remain in the managed runtime library after real QPS import.
- If retained, document them as local smoke/eval fixtures.
- If removed, replace tests and smoke checks with explicit test fixtures under
  a non-production path such as `tests/fixtures` or `evals/fixtures`.

Acceptance criteria:

- Product decision is documented in roadmap or README.
- Runtime `assetCount` expectation accounts for the decision.
- No hidden dependency on demo files remains in smoke/eval/browser tests.

Verification:

- `curl -s http://localhost:7040/assets/browse?path= | jq .`
- `pnpm vitest run servers/mcp-assets/src/asset-store.test.ts --reporter=dot`
- Relevant smoke/eval command after fixture decision.

Risks and mitigations:

- Risk: removing demo files breaks local smoke checks. Mitigate by moving smoke
  fixtures into explicit test setup.
- Risk: keeping demo files pollutes production-like browsing. Mitigate by
  tagging them clearly and hiding seeded fixtures in UI filters if needed.

### WI-003: Clarify QPS Health States

Priority: P1

Status: Open

Files:

- Modify: `servers/mcp-qps-toolkit/src/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `docs/mcp-tool-contracts.md`

Scope:

- Split QPS health into independent states:
  - full QPS checkout configured,
  - managed asset resolver available,
  - metadata write mode,
  - required policy/token/canon files available.
- Avoid reporting the whole service as unconfigured when managed asset
  resolution works but the full QPS plugin checkout is absent.

Acceptance criteria:

- `/health` distinguishes full toolkit availability from managed asset catalog
  availability.
- Missing full QPS content does not imply managed resolver failure when
  `ASSETS_ROOT` catalogs exist.
- Health response has stable schema and is documented.

Verification:

- Health with real QPS checkout mounted.
- Health with placeholder `./local/qps-toolkit`.
- Health with managed `ASSETS_ROOT` populated but full QPS content missing.
- `pnpm --filter @qlabs/mcp-qps-toolkit build`

Risks and mitigations:

- Risk: UI or evals assume a single `configured` boolean. Mitigate by keeping
  `configured` for backward compatibility and adding more specific fields.

### WI-004: Make QPS REST Asset Endpoints Managed-Catalog Aware

Priority: P1

Status: Open

Files:

- Modify: `servers/mcp-qps-toolkit/src/index.ts`
- Modify: `servers/mcp-qps-toolkit/src/asset-resolver.ts`
- Test: `servers/mcp-qps-toolkit/src/asset-resolver.test.ts`

Scope:

- Decide and implement whether QPS REST asset endpoints should work from
  managed catalogs without requiring a full QPS checkout.
- Target endpoints:
  - `GET /assets/browse`
  - `GET /assets/file`
  - `GET /assets/meta`
  - `PUT /assets/meta` in metadata write mode.

Acceptance criteria:

- Managed catalog reads work when `/data/assets` contains generated catalogs.
- REST metadata reads return useful details for icon, product, brand-art, and
  brand records.
- Full QPS checkout absence only disables routes that truly depend on full QPS
  plugin files.

Verification:

- Container run with real checkout.
- Container run with managed assets only.
- `curl -s "http://localhost:7050/assets/meta?path=brands/amazon.svg" | jq .`
- `pnpm --filter @qlabs/mcp-qps-toolkit build`

Risks and mitigations:

- Risk: REST endpoints become another resolver implementation. Mitigate by
  sharing catalog helpers with `asset-resolver.ts`.

### WI-005: Add Formal Schema Validation for Managed Catalogs

Priority: P1

Status: Open

Files:

- Modify: `servers/mcp-assets/src/asset-store.ts`
- Modify: `servers/mcp-assets/src/asset-store.test.ts`
- Modify: `packages/contracts/src/index.ts`

Scope:

- Add Zod schemas for:
  - managed `index.json` v2,
  - `icons.pack.json`,
  - `icons/catalog.json`,
  - `products.pack.json`,
  - `art/manifest.json`,
  - `brands.pack.json`,
  - `brands/catalog.json`.
- Validate on read and generation.
- Return actionable errors for invalid generated or imported catalogs.

Acceptance criteria:

- Invalid `index.json` v2 fails with a typed validation error, not silent
  fallback.
- Generated catalogs pass schema validation after upload/edit/delete/import.
- Tests cover missing required fields and wrong field types.

Verification:

- `pnpm vitest run servers/mcp-assets/src/asset-store.test.ts --reporter=dot`
- `pnpm --filter @qlabs/mcp-assets build`

Risks and mitigations:

- Risk: strict validation rejects legacy runtime data. Mitigate with an
  explicit legacy migration path and clear error messages.

### WI-006: Add Shared OpenAPI/Zod Contracts for Asset APIs

Priority: P1

Status: Open

Files:

- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/admin-ui/src/app/api/assets/**`
- Modify: `servers/mcp-assets/src/index.ts`
- Modify: `docs/mcp-tool-contracts.md`

Scope:

- Define request and response schemas for:
  - `GET /assets`
  - `GET /assets/browse`
  - `GET /asset-files`
  - `POST /assets`
  - `PUT /assets/meta`
  - `DELETE /assets`
  - `POST /assets/import/qps`
- Use schemas in server handlers and admin UI API proxy routes.

Acceptance criteria:

- Asset API handlers validate request payloads consistently.
- Admin UI proxy routes return standard error envelopes on upstream failures.
- Documentation matches exported schemas.

Verification:

- `pnpm --filter @qlabs/contracts build`
- `pnpm --filter @qlabs/mcp-assets build`
- `pnpm --filter @qlabs/admin-ui build`
- Targeted API tests for invalid path, invalid base64, missing path, and
  successful upload/edit/delete.

Risks and mitigations:

- Risk: duplicated schemas drift between server and UI. Mitigate by importing
  shared contracts from `packages/contracts`.

### WI-007: Serialize Asset Mutations and Atomic Catalog Writes

Priority: P1

Status: Open

Files:

- Modify: `servers/mcp-assets/src/asset-store.ts`
- Test: `servers/mcp-assets/src/asset-store.test.ts`

Scope:

- Add a per-process mutation queue around upload, metadata update, delete,
  sync, and QPS import.
- Keep file writes atomic with temp file plus rename.
- Ensure generated catalogs and `index.json` represent the same asset set after
  concurrent mutations.

Acceptance criteria:

- Concurrent upload/edit/delete/import operations do not lose records or
  generate mismatched catalogs.
- Tests cover at least two overlapping metadata updates and import plus delete.

Verification:

- `pnpm vitest run servers/mcp-assets/src/asset-store.test.ts --reporter=dot`
- A local stress script issuing concurrent `PUT /assets/meta` and
  `POST /assets/import/qps`.

Risks and mitigations:

- Risk: process-local locks do not coordinate across multiple replicas.
  Mitigate by documenting local-single-container assumptions or using a file
  lock if multi-process deployment becomes real.

### WI-008: Add Upload File Policy and SVG Sanitization

Priority: P1

Status: Open

Files:

- Modify: `servers/mcp-assets/src/index.ts`
- Modify: `servers/mcp-assets/src/asset-store.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/admin-ui/src/app/workbench/assets-view.tsx`

Scope:

- Enforce max upload size through `MAX_UPLOAD_BYTES`.
- Add MIME and extension allowlist.
- Decide SVG policy:
  - local-only trusted SVGs with warning, or
  - sanitize SVGs before storing/serving.
- Return `413` for oversized uploads and `400` for unsupported file types.
- Show policy errors clearly in Admin UI.

Acceptance criteria:

- Oversized files are rejected before writing.
- Unsupported extensions are rejected.
- SVG behavior is explicit and documented.
- UI upload error state is visible and actionable.

Verification:

- Unit tests for oversized, invalid MIME, allowed PNG/SVG, and bad SVG if
  sanitization is implemented.
- Browser upload test for rejection state.
- `pnpm --filter @qlabs/mcp-assets build`

Risks and mitigations:

- Risk: MIME sniffing from filenames is weak. Mitigate by checking magic bytes
  for common image types and documenting SVG trust assumptions.

### WI-009: Commit Browser E2E Coverage for Asset Page

Priority: P1

Status: Open

Files:

- Create: `apps/admin-ui/tests/assets-page.spec.ts` or repo-standard e2e path.
- Modify: `apps/admin-ui/package.json`
- Modify: `README.md` or test docs.

Scope:

- Convert manual browser verification into committed automated coverage:
  upload, selected-folder scoped upload, tag edit with TagInput, preview modal,
  delete confirmation, import QPS action, and API absence after delete.
- Use a throwaway test asset and clean it up.

Acceptance criteria:

- E2E test runs against `http://localhost:3000`.
- Test creates no persistent validation assets.
- Failing UI states include enough screenshot or trace evidence to debug.

Verification:

- `pnpm --filter @qlabs/admin-ui test:e2e`
- Manual fallback: Browser plugin screenshot after upload/edit/preview/delete.

Risks and mitigations:

- Risk: tests become flaky on service startup. Mitigate with health polling
  before navigation and condition-based waits instead of timeouts.

### WI-010: Split Managed Asset Import Into Idempotent Jobs

Priority: P2

Status: Open

Files:

- Modify: `servers/mcp-assets/src/asset-store.ts`
- Modify: `servers/mcp-assets/src/index.ts`
- Modify: `apps/admin-ui/src/app/workbench/assets-view.tsx`

Scope:

- Make QPS import progress observable for large imports.
- Return imported, skipped, failed, and total counts with failed path details.
- Preserve managed edits on reimport.
- Optionally expose an import dry-run.

Acceptance criteria:

- Import response distinguishes copied files from skipped existing files.
- Failed file copies do not leave partial catalog state.
- UI can show import result counts without parsing free-form text.

Verification:

- Unit tests with source files that include one unreadable or invalid entry.
- Live import against real QPS checkout.

Risks and mitigations:

- Risk: job state is overkill for local imports. Mitigate by keeping the first
  version synchronous but structured.

### WI-011: Run Full Repo CI Equivalent

Priority: P1

Status: Open

Files:

- Modify only if failures expose real issues.

Scope:

- Run full local gates after asset-library changes.
- Include lint if configured.
- Include Admin UI build/typecheck because the asset page consumes the APIs.

Acceptance criteria:

- Full command list is captured with pass/fail evidence.
- Any failure is either fixed or recorded with owner decision.

Verification:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`
- `pnpm smoke`
- `pnpm evals`
- `EVAL_ONLY=qps-toolkit.json pnpm evals`

Risks and mitigations:

- Risk: existing unrelated lint/eval failures block merge. Mitigate by
  separating pre-existing failures from regressions with exact output.

### WI-012: Rebuild Full Docker Stack After QPS Validation

Priority: P1

Status: Open

Files:

- Modify: `docker-compose.yml` only if rebuild exposes config drift.

Scope:

- Rebuild the complete stack, not only `mcp-assets` and `mcp-qps-toolkit`.
- Verify all services are healthy.
- Verify Admin UI points at the rebuilt services.

Acceptance criteria:

- `docker compose --profile qps --env-file .env -f docker-compose.yml ps`
  shows healthy services.
- `mcp-assets` reports correct `assetCount`.
- `mcp-qps-toolkit` reports full QPS configured when real checkout is mounted.
- Admin UI loads the Asset Page and can browse imported assets.

Verification:

- `docker compose --profile qps --env-file .env -f docker-compose.yml up -d --build`
- `curl -s http://localhost:7040/health | jq .`
- `curl -s http://localhost:7050/health | jq .`
- Browser check against `http://localhost:3000`.

Risks and mitigations:

- Risk: Docker volume state hides first-run defects. Mitigate by testing with a
  fresh named volume before release if this becomes a release gate.

### WI-013: Prepare Commit and PR

Priority: P1

Status: Open

Files:

- Stage only files related to managed asset library and roadmap work.

Scope:

- Review diff for accidental local config changes.
- Exclude untracked/local `.env`.
- Commit tested changes.
- Open a PR with evidence and remaining roadmap items.

Acceptance criteria:

- Commit includes source, tests, docs, and roadmap files for this workstream.
- PR description lists verification commands and live validation evidence.
- Known open items are linked to this roadmap file.

Verification:

- `git status --short`
- `git diff --stat`
- `git diff --cached --stat`
- Fresh targeted tests before commit.

Risks and mitigations:

- Risk: dirty worktree contains unrelated prior work. Mitigate by staging
  explicitly and reviewing `git diff --cached`.

## Cross-Cutting Acceptance Checklist

- [ ] Real QPS checkout path documented or discoverable.
- [ ] Managed import is idempotent.
- [ ] Resolver works without requiring the full QPS checkout for managed assets
  where intended.
- [ ] Metadata updates preserve optional fields.
- [ ] Generated catalogs are schema-valid.
- [ ] Deletions update canonical index and resolver catalogs.
- [ ] Upload policy prevents obvious bad inputs.
- [ ] Browser E2E covers the Asset Page happy path and destructive actions.
- [ ] Full Docker rebuild passes.
- [ ] PR captures verification evidence and remaining risks.

## Final Verification Gate

Run before merging the managed asset library workstream:

```bash
pnpm vitest run apps/admin-ui/src/app/workbench/assets-helpers.test.ts apps/admin-ui/src/app/workbench/format.test.ts servers/mcp-assets/src/asset-store.test.ts servers/mcp-assets/src/asset-index.test.ts servers/mcp-qps-toolkit/src/asset-resolver.test.ts --reporter=dot
pnpm --filter @qlabs/admin-ui build
pnpm --filter @qlabs/admin-ui exec tsc -p tsconfig.json --noEmit --incremental false
pnpm --filter @qlabs/mcp-assets build
pnpm --filter @qlabs/mcp-qps-toolkit build
docker compose --profile qps --env-file .env -f docker-compose.yml up -d --build
curl -s http://localhost:7040/health | jq .
curl -s http://localhost:7050/health | jq .
```

Live acceptance checks:

- Import real QPS assets through `POST /assets/import/qps`.
- Resolve representative icon, product, brand-art, hero, and brand assets
  through `qps_resolve_asset`.
- Edit metadata on one real asset per generated catalog and verify the catalog
  changes.
- Delete one real imported asset, verify resolver stops returning that exact
  path, reimport, and verify resolver returns it again.
- Use the Admin UI Asset Page to upload, tag, preview, and delete a throwaway
  asset.
