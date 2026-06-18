# Enterprise Admin UI Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin UI into a dense, Brand UI-first enterprise workbench with correct Qlik branding, collapsible hierarchy, compact sheet layouts, and a document-management grade asset gallery.

**Architecture:** Keep the existing Next route and API contracts unchanged. Replace page-level handcrafted card stacks with shared workbench primitives, Brand UI data tables, BrandLogo, collapsible side panels, compact command bars, and reusable document-gallery components under `apps/admin-ui/src/app/workbench/`.

**Tech Stack:** Next.js App Router, React, TypeScript, `@brand/ui`, `@brand/data`, `@brand/icons`, `@brand/charts`, lucide-react, Vitest, browser verification.

---

### Task 1: Shell, Branding, And Hierarchy

**Files:**
- Modify: `apps/admin-ui/src/app/workbench/workbench-shell.tsx`
- Modify: `apps/admin-ui/src/app/icon.svg`

- [x] **Step 1: Replace fake brand treatment**

Use `BrandLogo` from `@brand/icons` in the primary sidebar header. Replace the static favicon SVG with the approved Qlik mark geometry copied from the vendored `BrandLogo` component, not a handmade placeholder.

- [x] **Step 2: Make primary and secondary chrome space-efficient**

Keep the Brand UI `Sidebar` primary rail collapsible on desktop and mobile. Make the secondary section panel collapsed by default, expandable from the top bar, and closeable from its own header.

- [x] **Step 3: Add compact breadcrumbs and command bar**

Use Brand UI `Breadcrumb`, `TopNav`, `SidebarTrigger`, `ThemeSwitcher`, and `Button` to create a single compact top bar with hierarchy, section panel toggle, refresh, and theme controls.

- [x] **Step 4: Verify shell dimensions**

At `1280x720`, the default content width must be at least `1000px` with the secondary panel collapsed. No document horizontal overflow.

### Task 2: Shared Enterprise Workbench Primitives

**Files:**
- Create: `apps/admin-ui/src/app/workbench/enterprise.tsx`

- [x] **Step 1: Add compact page primitives**

Create `EnterprisePage`, `EnterpriseHeader`, `CommandBar`, `MetricStrip`, `MetricPill`, and `Panel` wrappers that use low-padding, compact typography, and restrained borders.

- [x] **Step 2: Add table toolbar helpers**

Use `@brand/data` `FilterBar`, `SearchInput`, `ColumnPicker`, `DataTable`, and local typed props to standardize search/action bars.

- [x] **Step 3: Replace decorative SectionHeader usage**

Views should use `EnterpriseHeader` for page title/context and `Panel` for bounded operational regions. Avoid nested cards and repeated hero-like headings.

### Task 3: Dense Operational Sheets

**Files:**
- Modify: `apps/admin-ui/src/app/workbench/overview-view.tsx`
- Modify: `apps/admin-ui/src/app/workbench/servers-view.tsx`
- Modify: `apps/admin-ui/src/app/workbench/runner-view.tsx`
- Modify: `apps/admin-ui/src/app/workbench/storage-view.tsx`

- [x] **Step 1: Overview**

Replace metric card grid + card stack with a compact status strip, recent runs table, and endpoints table.

- [x] **Step 2: Servers**

Replace server cards with a Brand UI `DataTable` including search, compact badges, latency, tools count, and row action buttons.

- [x] **Step 3: Tool Runner**

Use a two-column workbench: left searchable tool inventory table, right compact composer/result panels. Keep JSON/schema panes bounded.

- [x] **Step 4: Storage**

Use a command strip plus document-list table for storage entries. Keep folder operations compact and put metrics in a strip instead of cards.

### Task 4: Document Gallery For Assets

**Files:**
- Modify: `apps/admin-ui/src/app/workbench/assets-view.tsx`
- Modify: `apps/admin-ui/src/app/qps-assets-browser.tsx`

- [x] **Step 1: Add document-management structure**

QPS and uploaded assets must present as a document library: breadcrumb/folder context, folder tree/list, list-grid toggle, search/filter, selection affordance, and details/metadata panel.

- [x] **Step 2: Replace tile-only gallery**

Use compact document rows for default density and a grid mode for visual files. Non-image files should use file-type rows/icons, not empty decorative preview boxes.

- [x] **Step 3: Details panel**

Selected assets show metadata, tags, size, modified time, and actions in a side details panel using Brand UI `Descriptions`, `Badge`, `ButtonGroup`, and `StatePanel`.

### Task 5: Verification

**Files:**
- Test: `apps/admin-ui/src/app/workbench/format.test.ts`

- [x] **Step 1: Run focused unit tests**

Run: `pnpm exec vitest run apps/admin-ui/src/app/workbench/format.test.ts`
Expected: one file passes with three tests.

- [x] **Step 2: Run static checks**

Run: `pnpm --filter @qlabs/admin-ui typecheck`
Expected: exit 0.

Run: `pnpm --filter @qlabs/admin-ui lint`
Expected: exit 0.

- [x] **Step 3: Run production build**

Run: `pnpm --filter @qlabs/admin-ui build`
Expected: exit 0 and `/icon.svg` listed as a static route.

- [x] **Step 4: Browser verify**

At `http://localhost:3001`, verify:
- desktop `1280x720`: default content width >= `1000px`, no horizontal overflow, secondary panel opens/closes.
- mobile `390x844`: drawer opens/closes, content width equals viewport width.
- Assets document library has list/grid modes and details panel.
- Fresh browser console has no errors.
