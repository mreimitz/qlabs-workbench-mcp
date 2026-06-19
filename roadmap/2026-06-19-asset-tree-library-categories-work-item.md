# Asset Tree Library Categories Work Item

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans for task-by-task implementation. This work item is stored in `roadmap/` because the project owner requested detailed plans there.

**Goal:** Add virtual top-level asset tree categories so existing image assets live under `Images`, and file-based templates live under `Templates`.

**Architecture:** Keep current image asset paths unchanged for MCP/QPS compatibility. `Images` is a virtual UI node that maps to the existing asset root and excludes `templates/...` files. `Templates` is a virtual UI node backed by the real `templates/...` asset path prefix, with stable child folders for Markdown, Office, and Web templates.

**Tech stack:** Next.js client components, React state, Brand UI `Tree`, Vitest helper tests, existing `/api/assets` upload/list/file endpoints.

---

## Acceptance Criteria

- The asset secondary navigation shows two top-level nodes: `Images` and `Templates`.
- All existing image-library folders currently shown under `/` appear under `Images`.
- Selecting `Images` maps to the existing asset root path `""`; existing asset paths like `icons/communication/camera.svg` do not change.
- The `Templates` node appears next to `Images`.
- `Templates` contains at least `Markdown`, `Office`, and `Web`.
- `Office` contains `Word` and `PowerPoint` folders.
- Selecting `Templates`, `Templates/Markdown`, `Templates/Office`, `Templates/Office/Word`, `Templates/Office/PowerPoint`, or `Templates/Web` maps to real upload/list paths under `templates/...`.
- Assets with paths under `templates/...` appear only in the `Templates` branch and never under `Images`.
- Uploading while a template folder is selected writes into the mapped `templates/...` path.
- The current folder label displays user-facing category names such as `Images/icons/communication` and `Templates/Office/PowerPoint`.
- Existing MCP/QPS resolver paths and generated catalogs continue to use the unchanged root asset paths.

## Files

- Modify: `apps/admin-ui/src/app/workbench/assets-helpers.ts`
  - Add virtual node ids and template path constants.
  - Build a two-root tree: `Images` plus `Templates`.
  - Exclude `templates/...` from `Images`.
  - Add helper functions for tree id to storage path and storage path to tree id.
  - Add helper function for display labels.
- Modify: `apps/admin-ui/src/app/workbench/assets-helpers.test.ts`
  - Add tests for the new tree shape, mapping, template exclusion, and upload path joins.
- Modify: `apps/admin-ui/src/app/workbench/assets-view.tsx`
  - Use the new display label in the secondary navigation and upload modal.
  - Use the new selected tree id helper instead of selecting `/`.
  - Keep folder expansion stable for virtual roots.
  - Update the empty-state copy so it does not reference removed QPS import UI.

## Implementation Tasks

### Task 1: Write Failing Helper Tests

- [ ] Add a test that `buildAssetFolderTree` returns top-level `Images` and `Templates` nodes.
- [ ] Add a test that non-template folders such as `icons/data` appear under `Images`.
- [ ] Add a test that `templates/markdown/prompt.md` appears under `Templates > Markdown`, not under `Images`.
- [ ] Add a test that `folderIdToPath("library:images")` returns `""`.
- [ ] Add a test that `folderIdToPath("library:templates")` returns `"templates"`.
- [ ] Add a test that `pathToFolderId("")` returns `"library:images"` and `pathToFolderId("templates")` returns `"library:templates"`.
- [ ] Add a test that `formatAssetFolderPath("templates/office/powerpoint")` returns `"Templates/Office/PowerPoint"`.

Run:

```bash
pnpm vitest run apps/admin-ui/src/app/workbench/assets-helpers.test.ts --reporter=dot
```

Expected before implementation: failures for missing helpers and old tree shape.

### Task 2: Implement Virtual Tree Helpers

- [ ] Add constants for `library:images`, `library:templates`, and the supported template folder paths.
- [ ] Update `buildAssetFolderTree` to return `[Images, Templates]`.
- [ ] Preserve existing image storage paths by using actual folder ids under `Images`.
- [ ] Build the `Templates` branch from fixed folders and any actual `templates/...` assets.
- [ ] Implement `folderIdToPath`, `pathToFolderId`, and `formatAssetFolderPath`.

Run:

```bash
pnpm vitest run apps/admin-ui/src/app/workbench/assets-helpers.test.ts --reporter=dot
```

Expected after implementation: helper tests pass.

### Task 3: Wire UI Selection And Labels

- [ ] Replace `currentFolder || "/"` labels with `formatAssetFolderPath(currentFolder)`.
- [ ] Replace selected tree id fallback `/` with `pathToFolderId(currentFolder)`.
- [ ] Default expanded ids to include `library:images` and `library:templates`.
- [ ] Keep upload target paths based on `joinAssetPath(currentFolder, file.name)`.
- [ ] Update empty state copy to remove the deleted import action reference.

Run:

```bash
pnpm --filter @qlabs/admin-ui exec tsc -p tsconfig.json --noEmit --incremental false
```

Expected: TypeScript succeeds without tree helper type errors.

### Task 4: Verify Build And Browser Behavior

- [ ] Run the focused helper tests.
- [ ] Run the admin UI build.
- [ ] Rebuild/restart the admin UI container.
- [ ] Open `http://localhost:3000` in the in-app browser.
- [ ] Verify the tree shows `Images` and `Templates`.
- [ ] Verify `Images` expands to the existing folders.
- [ ] Verify `Templates` expands to `Markdown`, `Office`, and `Web`.
- [ ] Verify `Office` expands to `Word` and `PowerPoint`.
- [ ] Verify selecting `Images` does not change existing asset paths.
- [ ] Verify selecting `Templates/Markdown` changes the visible folder label and upload target to that template folder.
- [ ] Verify browser console has no errors or warnings.

Commands:

```bash
pnpm vitest run apps/admin-ui/src/app/workbench/assets-helpers.test.ts apps/admin-ui/src/app/workbench/format.test.ts --reporter=dot
pnpm --filter @qlabs/admin-ui build
docker compose --profile qps --env-file .env -f docker-compose.yml up -d --build admin-ui
```

Expected: all commands pass; browser checks match acceptance criteria.

## Risks And Mitigations

- **Risk:** Moving existing image files would break MCP/QPS resolver paths.
  **Mitigation:** `Images` is virtual and maps to existing root paths.
- **Risk:** `templates/...` assets could appear under both roots.
  **Mitigation:** tree construction explicitly routes template-prefixed assets to `Templates` only.
- **Risk:** The UI could select a virtual node id but upload to the wrong path.
  **Mitigation:** helper tests cover id-to-path and path-to-id mappings.
- **Risk:** Future template support may need richer metadata.
  **Mitigation:** this work only establishes folder/navigation semantics; metadata can be extended in a later work item without changing these paths.
