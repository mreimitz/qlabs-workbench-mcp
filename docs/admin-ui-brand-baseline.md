# Admin UI Brand Baseline

The admin UI is pinned to `mreimitz/qlabs-components` release `v1.0.0`.

## Hard Rule

- All admin UI chrome, layout primitives, form controls, status treatments, and reusable view composition must come from the `v1.0.0` brand-ui release.
- The approved consumer packages for this app are `@brand/tokens`, `@brand/ui`, and `@brand/cli`.
- The approved release assets are vendored under `vendor/brand-ui/v1.0.0/`.
- New UI work must use the installed CLI to inspect available components before adding or changing UI.
- Do not introduce another component library for the admin UI.
- Do not add custom design-system primitives in local code when an approved brand-ui primitive already exists.
- Do not upgrade beyond `v1.0.0` without an explicit baseline change.

## Required Workflow

From the repo root:

```bash
pnpm --filter @qlabs/admin-ui brand-ui info
pnpm --filter @qlabs/admin-ui brand-ui search <query>
pnpm --filter @qlabs/admin-ui brand-ui docs <ComponentName>
```

Use those commands before implementing UI so the agent or developer selects from
the real component inventory instead of guessing.

## Allowed Patterns

- Import primitives from `@brand/ui`.
- Wrap the app in `ThemeProvider` from `@brand/tokens`.
- Use the vendored release tarballs from `vendor/brand-ui/v1.0.0/`.
- Use the release registry and templates as the source for future admin screens.

## Forbidden Patterns

- Raw hex-based design work in local UI code.
- Hand-rolled replacements for buttons, cards, inputs, badges, tables, sidebars,
  or other baseline primitives already present in `@brand/ui`.
- Ad hoc UI dependencies added outside the approved baseline unless they are
  framework/runtime requirements and not visual primitives.
