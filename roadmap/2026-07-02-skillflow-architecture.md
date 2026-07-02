# SkillFlow — Visual Skill IDE & Execution Tracer: Architecture

Status: accepted direction, pending validation against the Skill Management
System (SMS) in `mreimitz/qlabs-ai-benchmark`.

## Vision

A business-user-friendly visual IDE for Claude Code skills: design a skill as
a node graph (routing, sub-routines, assets, validation gates), run it against
real Claude Code session logs, and overlay the actual execution path on the
design canvas — green for conforming steps, red for fractures (misrouting,
failed validation scripts, prompt drift, infinite loops). Process mining for
AI: a design-time model (the skill as intended) checked against an event log
(the session as it actually ran).

## System boundary across repos

| Concern | Owner |
| --- | --- |
| Skill entities: upload, edit, inspect, attach to tests | SMS in `qlabs-ai-benchmark` |
| Visual design canvas, trace overlay, node inspector | Admin UI in this repo |
| Trace ingestion, graph/trace contracts, run records | Control API + `packages/contracts` in this repo |
| Tool execution surface | MCP servers in this repo |

SkillFlow consumes the SMS as the system of record for skills and their test
attachments; it must not fork skill storage. The two net-new views it adds:

1. **Design view** — a projection of a stored skill's `SKILL.md` into a graph,
   rendered on the vendored `@brand/flow` canvas. Edits write back through the
   SMS's existing edit path.
2. **Trace view** — a session log ingested, normalized to trace events,
   aligned to the design graph, and rendered as a recoloring of the same
   canvas. A test run in the SMS gains a session-log reference; Trace Mode
   renders that run against the skill's design graph.

## Core decisions

### 1. SKILL.md stays the source of truth

The graph is a projection of the markdown, never the other way around. Claude
consumes `SKILL.md`, developers hand-edit it, and git diffs must stay
meaningful. Pipeline:

```
SKILL.md ⇄ (parse/serialize) ⇄ Skill Graph IR ⇄ React Flow nodes/edges
                                     ↑
                    session JSONL → trace events → alignment → overlay
```

Graph nodes carry **anchors** back into the markdown (heading path / line
range) so round-tripping preserves hand-written prose. Structure the parser
cannot infer is expressed as lightweight annotations inside the markdown
(HTML comments or frontmatter), not a side-car file — business users and
power users edit the same artifact.

### 2. Contracts live in `packages/contracts`

New Zod schemas alongside `runRecordSchema`, same inferred-type pattern:

- `skillGraphSchema` — nodes (`kind`: gatekeeper, subroutine, asset,
  validation-gate, loop-guard), edges with routing conditions, markdown
  anchors.
- `traceEventSchema` — normalized session events: tool calls, file reads,
  script exit codes, subagent spawns, user/assistant turns.
- `sessionTraceSchema` — an ingested session: ordered events plus alignment
  results (per-node visit counts, per-edge traversals, verdicts).

The existing `RunRecord` is the shape reference for a per-step trace record.
The admin UI must import these from `@qlabs/contracts` rather than
re-declaring them (the current local re-declaration in the dashboard is a
known wart — do not repeat it).

### 3. Trace-to-graph alignment: deterministic first

The hard problem. Signals in order of reliability:

1. **Deterministic** (build first, covers most of the overlay): a tool call
   matches a subroutine node; reading an asset file matches an asset node; a
   script exit code matches a validation gate; a subagent spawn matches a
   sub-routine block; per-node visit counts expose loops.
2. **Breadcrumb markers**: a convention where the skill instructs Claude to
   emit a trivial marker (command or written line) at each gatekeeper
   decision, turning intent-misrouting detection from fuzzy inference into
   exact matching — the process-mining move of making the process emit proper
   event IDs.
3. **Semantic (later)**: prompt-drift detection via an LLM-judge pass over
   the transcript, for skills not written with markers.

### 4. UI builds on the modularized shell, not `main`'s monolith

The `codex/admin-ui-shell-cleanup` branch already split the dashboard into
`apps/admin-ui/src/app/workbench/*-view.tsx` modules with a primary/secondary
nav model. SkillFlow lands as a sixth primary view with secondary nav
`Design | Trace | Tests`. That branch should be merged (or its structure
adopted) before SkillFlow UI work starts.

Vendored, currently unwired packages to add to `apps/admin-ui/package.json`
(already in `vendor/brand-ui/v1.0.0`, resolvable via pnpm overrides):

- `@brand/flow` — `CanvasShell`, `FlowNode` (`tone:
  success/warning/destructive` gives the green/red coding natively),
  `InspectorPanel`, `ZoomControls`, `Legend`. Usage pattern documented in the
  agent kit's `flow-workspace.md` playbook.
- `@brand/editor` — inspector-panel editing of a node's markdown section.
- `@brand/ai` — rendering raw conversation turns beside the graph.

Custom node/edge types needed beyond stock `FlowNode` (~4–5 node types, 2
edge types): execution-count badges (loop detection), exit-code chips on
validation gates, expected-vs-actual route markers on gatekeeper edges,
dimmed never-visited state; design edges vs. trace edges with traversal
counts.

### 5. Trace ingestion is the one genuinely new subsystem

Nothing in either repo parses Claude Code session logs (JSONL transcripts
under `~/.claude/projects/<project>/`). A parser package (working name
`packages/session-trace`) normalizes JSONL into `traceEventSchema` events;
a control-api route ingests and persists them. Everything downstream depends
on this event vocabulary — it is the first thing to build and to lock down.

## Phasing

1. **Trace first, canvas second (read-only).** Parse session JSONL → render a
   skill graph from `SKILL.md` → overlay green/red. Delivers the
   process-mining "aha" without touching editing or round-tripping, and
   de-risks alignment early.
2. **Editing.** Inspector-panel editing via `@brand/editor` with SKILL.md
   round-trip through the SMS.
3. **Validation gates as first-class tests.** Unify gate scripts with the
   existing eval-case format (`evals/cases/*.json`, `{server, tool, input,
   expect}`) so `pnpm evals` runs them headlessly and SkillFlow shows the same
   results visually. Evals remain tool-level unit tests; traces are the
   skill-level integration tier above them.
4. **The feedback loop.** Trace → insight → suggested `SKILL.md` edit,
   itself implemented as a skill running through the workbench.

## Open items (tracked as GitHub issues)

- Review the SMS in `qlabs-ai-benchmark` (storage format, test-attachment
  model, API surface: HTTP vs. MCP) and pin the cross-repo API boundary —
  requires a session scoped to that repo; all schemas here carry assumptions
  until then.
- Skill Graph IR + trace-event schemas in `packages/contracts`.
- `SKILL.md` → graph IR parser with markdown anchors and round-trip.
- Session JSONL ingestion (`packages/session-trace` + control-api route).
- SkillFlow view in the admin UI: wire `@brand/flow`/`@brand/editor`/
  `@brand/ai`, custom trace node/edge types, canvas + inspector.
- Trace-to-graph alignment engine + breadcrumb marker convention.
