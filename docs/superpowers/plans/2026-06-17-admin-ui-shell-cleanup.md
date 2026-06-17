# Admin UI Shell Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rebuild the admin UI around a `brand-ui` double-sided app shell, remove layout overflow, stabilize hydration-prone formatting, and split the monolithic dashboard into maintainable view modules.

**Architecture:** Keep the Next.js route and API contracts unchanged. Move UI structure into focused client modules under `apps/admin-ui/src/app/workbench/`: shell/navigation, view components, shared formatting/types, and existing API action handlers owned by a dashboard container. Use `brand-ui` `Sidebar`, `PageShell`, `SectionHeader`, `SplitPanel`, `ScrollArea`, and table primitives intentionally rather than page-level ad hoc layout.

**Tech Stack:** Next.js App Router, React 18, TypeScript, `@brand/ui`, `@brand/data`, `@brand/charts`, Vitest for utility tests, browser verification through the in-app browser.

---

### Task 1: Add Deterministic Formatting Tests

**Files:**
- Create: `apps/admin-ui/src/app/workbench/format.test.ts`
- Create: `apps/admin-ui/src/app/workbench/format.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { formatDateTime, formatFileTimestamp, formatLatency, prettyJson } from "./format";

describe("workbench formatting", () => {
  it("formats run timestamps deterministically for SSR and hydration", () => {
    expect(formatDateTime("2026-06-17T12:42:00.000Z")).toBe("Jun 17, 12:42");
  });

  it("formats file mtimes deterministically from epoch milliseconds", () => {
    expect(formatFileTimestamp(1781690400000)).toBe("Jun 17, 08:40");
  });

  it("formats latency and json consistently", () => {
    expect(formatLatency(null)).toBe("n/a");
    expect(formatLatency(250)).toBe("250 ms");
    expect(formatLatency(1250)).toBe("1.3 s");
    expect(prettyJson({ ok: true })).toBe("{\n  \"ok\": true\n}");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/admin-ui/src/app/workbench/format.test.ts`

Expected: FAIL because `apps/admin-ui/src/app/workbench/format.ts` does not exist.

- [x] **Step 3: Implement minimal formatting module**

Create deterministic UTC date formatting helpers and move existing latency/json helpers into `format.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run apps/admin-ui/src/app/workbench/format.test.ts`

Expected: PASS.

### Task 2: Split Data Types And Shell Structure

**Files:**
- Create: `apps/admin-ui/src/app/workbench/types.ts`
- Create: `apps/admin-ui/src/app/workbench/navigation.ts`
- Create: `apps/admin-ui/src/app/workbench/workbench-shell.tsx`
- Modify: `apps/admin-ui/src/app/workbench-dashboard.tsx`

- [x] **Step 1: Move shared dashboard types to `types.ts`**

Move `Tool`, `ServerRef`, `RunRecord`, `ServerStatus`, `DashboardData`, `StorageHealth`, `StorageBrowse`, `AssetRecord`, `DashboardPayload`, and `ViewKey` without changing shapes.

- [x] **Step 2: Move navigation metadata to `navigation.ts`**

Define primary nav items and contextual secondary items for each view.

- [x] **Step 3: Add `WorkbenchShell`**

Implement a viewport-owned shell patterned after Storybook `sidebar-05`: `SidebarProvider`, fixed `h-dvh overflow-hidden`, primary `w-64` sidebar, conditional secondary `w-72` sidebar, and scrollable `min-h-0 flex-1 overflow-y-auto` content.

- [x] **Step 4: Wire `WorkbenchDashboard` through `WorkbenchShell`**

Keep existing state and actions initially, but render navigation through `WorkbenchShell` instead of inline shell markup.

### Task 3: Extract Views

**Files:**
- Create: `apps/admin-ui/src/app/workbench/status.tsx`
- Create: `apps/admin-ui/src/app/workbench/overview-view.tsx`
- Create: `apps/admin-ui/src/app/workbench/servers-view.tsx`
- Create: `apps/admin-ui/src/app/workbench/runner-view.tsx`
- Create: `apps/admin-ui/src/app/workbench/assets-view.tsx`
- Create: `apps/admin-ui/src/app/workbench/storage-view.tsx`
- Modify: `apps/admin-ui/src/app/workbench-dashboard.tsx`

- [x] **Step 1: Extract `ServerStatusBadge` to `status.tsx`**

Keep existing status mapping.

- [x] **Step 2: Extract each active view into a focused component**

Each view receives data and callbacks through typed props. No view should own the global shell.

- [x] **Step 3: Replace conditional JSX in `WorkbenchDashboard` with view components**

`WorkbenchDashboard` remains the client state/action container and chooses the active view.

### Task 4: Fix Layout And Overflow

**Files:**
- Modify: `apps/admin-ui/src/app/workbench/runner-view.tsx`
- Modify: `apps/admin-ui/src/app/workbench/overview-view.tsx`
- Modify: `apps/admin-ui/src/app/qps-assets-browser.tsx`

- [x] **Step 1: Replace Tool Runner grid overflow**

Use `SplitPanel` or bounded responsive grid tracks so desktop `documentElement.scrollWidth <= clientWidth`.

- [x] **Step 2: Bound table/card surfaces**

Use `enableRowVirtualization` where table body height needs to be bounded, and avoid nested card-in-card layouts where possible.

- [x] **Step 3: Replace QPS fixed `h-[720px]` cards**

Use `min-h-0`, `h-full`, and `ScrollArea` heights that derive from the shell content area.

- [x] **Step 4: Replace locale timestamp calls**

Use `formatDateTime` and `formatFileTimestamp`; no `toLocaleString()` calls remain in admin UI components.

### Task 5: Verify

**Files:**
- No new runtime files required.

- [x] **Step 1: Run unit test**

Run: `pnpm exec vitest run apps/admin-ui/src/app/workbench/format.test.ts`

Expected: PASS.

- [x] **Step 2: Run static checks**

Run: `pnpm --filter @qlabs/admin-ui typecheck`

Expected: PASS.

Run: `pnpm --filter @qlabs/admin-ui lint`

Expected: PASS.

- [x] **Step 3: Browser verify desktop and mobile**

At `http://localhost:3001` during this session, verify:
- desktop `1280x720`: shell height equals viewport height, sidebar height equals viewport height, no horizontal overflow on Overview, Servers, Tool Runner, Assets, Storage.
- mobile `390x844`: no document horizontal overflow; navigation sheet opens; major content remains reachable.
- console has no `localhost:3000` hydration errors.
