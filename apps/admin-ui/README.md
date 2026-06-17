# Admin UI

This app is pinned to `mreimitz/qlabs-components` release `v1.0.0`.

## Baseline

- Use only `@brand/tokens`, `@brand/ui`, and `@brand/cli` from the vendored
  release assets in `vendor/brand-ui/v1.0.0/`.
- Treat the upstream registry templates and playbooks as the source of truth for
  screen composition.
- Do not introduce a second component library for visual primitives.
- Do not hand-roll local replacements for buttons, cards, inputs, badges,
  tables, sidebars, alerts, or other baseline primitives already available in
  `@brand/ui`.

## Required CLI Workflow

From the repo root:

```bash
pnpm --filter @qlabs/admin-ui brand-ui info
pnpm --filter @qlabs/admin-ui brand-ui search <query>
pnpm --filter @qlabs/admin-ui brand-ui docs <ComponentName>
```

Use the CLI before building or changing any screen so the selected components
come from the real `v1.0.0` inventory.

## Screen Pattern

The current admin console follows the `data-app` / admin-console playbook:

- `SidebarProvider` + `Sidebar` + `SidebarInset` for shell structure
- `Card`, `Table`, `Badge`, `Alert`, `MetricCard`, `SectionHeader` for operator
  views
- table-first browsing for servers, runs, and storage content
- explicit operator actions instead of decorative UI

## Local Commands

```bash
pnpm --filter @qlabs/admin-ui dev
pnpm --filter @qlabs/admin-ui typecheck
pnpm --filter @qlabs/admin-ui build
```

## Known Release Quirk

The `@brand/tokens` `v1.0.0` tarball ships a broken exported `dist/themes.css`
font path. The app currently imports the packaged `src/themes.css` from the same
release so the baseline stays on `v1.0.0` while production builds continue to
work.
