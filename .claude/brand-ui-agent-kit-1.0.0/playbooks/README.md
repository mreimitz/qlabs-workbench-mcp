# Playbooks (archetype composition recipes)

One page per app archetype: which `@brand/*` building blocks it's made of,
how they wire together, and a minimal working example. Playbooks answer the
question templates can't: **"why these components, in this order, wired this
way"** — so a developer (or a coding agent) composes correctly on the first
try instead of reverse-engineering the playground demos.

| Archetype       | Playbook                                   | Template (copy-own)                  |
| --------------- | ------------------------------------------ | ------------------------------------ |
| Dashboard       | [`dashboard.md`](./dashboard.md)           | `registry/templates/dashboard/`      |
| Data app        | [`data-app.md`](./data-app.md)             | `registry/templates/data-app/`       |
| AI assistant    | [`ai-assistant.md`](./ai-assistant.md)     | `registry/templates/ai-assistant/`   |
| Flow workspace  | [`flow-workspace.md`](./flow-workspace.md) | `registry/templates/flow-workspace/` |
| Settings portal | [`settings.md`](./settings.md)             | `registry/templates/settings/`       |
| Marketing page  | [`marketing.md`](./marketing.md)           | `registry/templates/marketing/`      |

## How to use a playbook

1. **Pick the archetype** that matches what you're building (or run
   `/new-app` for a guided pick).
2. **Copy the matching template** (`npx shadcn add template-<archetype>`)
   — it's the playbook's skeleton with `WIRE:` annotations at every data
   wiring point.
3. **Follow the playbook's wiring order** to fill the `WIRE:` points.
4. Decisions the playbook doesn't list as **yours** are already made —
   don't re-make them (that's the point).

## Conventions every playbook assumes

- App root wrapped in `<ThemeProvider defaultTheme="…">` from `@brand/tokens`.
- Semantic tokens only (`bg-background`, `text-muted-foreground`, …) — no raw hex.
- Generic icons from `lucide-react`; brand marks from `@brand/icons`.
- Loading → `Skeleton`/`LoadingState`, empty → `EmptyState`, error →
  `ErrorState` (all `@brand/ui`) — never a blank region.
- brand-ui is presentation-only: model calls, fetching, and transport belong
  to your app (see `docs/DECISIONS.md` D5).

_Related: `research/define-to-build/` (the requirements these answer),
WP-09 in `research/enterprise-gap/` (machine-readable playbooks, the
follow-on), `skills/brand-ui/` (agent-facing component skill)._
