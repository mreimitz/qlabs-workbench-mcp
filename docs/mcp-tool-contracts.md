# MCP tool contracts

This document is the single source of truth for tool behavior.

## mcp-textops

- `text_uppercase`
  - Input: `{ "text": string }`
  - Output: text content with the uppercased string
- `text_lowercase`
  - Input: `{ "text": string }`
  - Output: text content with the lowercased string
- `text_trim`
  - Input: `{ "text": string }`
  - Output: text content with trimmed string
- `text_regex_extract`
  - Input: `{ "text": string, "pattern": string, "flags"?: string }`
  - Output: text content containing JSON `{ "matches": string[] }`

## mcp-assets

- `assets_search`
  - Input: `{ "keyword": string }`
  - Output: JSON `{ "results": string[] }` where each entry is a managed relative path in `ASSETS_ROOT`
- `assets_add`
  - Input: `{ "filename": string, "keyword": string, "contentBase64": string }`
  - Compatibility behavior: writes the file at the root of `ASSETS_ROOT`
  - Output: JSON `{ "ok": true, "filename": string, "path": string, "bytesWritten": number }`
- `assets_tag`
  - Input: `{ "filename": string, "keyword": string }`
  - Compatibility behavior: treats `filename` as a managed relative path
  - Output: JSON `{ "ok": true, "filename": string, "path": string }`
- `assets_browse`
  - Input: `{ "path"?: string }`
  - Output: JSON `{ "path": string, "entries": [{ "name": string, "kind": "folder" | "file", "path": string, "asset"?: object }] }`
- `assets_get`
  - Input: `{ "path": string }`
  - Output: JSON `{ "ok": boolean, "asset": object | null }`
- `assets_update_metadata`
  - Input: `{ "path": string, "metadata": object }`
  - Output: JSON `{ "ok": true, "asset": object }`
- `assets_delete`
  - Input: `{ "path": string }`
  - Output: JSON `{ "ok": true, "path": string }`
- `assets_import_qps`
  - Input: `{}`
  - Output: JSON `{ "ok": true, "imported": number, "skipped": number, "total": number }`

`ASSETS_ROOT/index.json` is the canonical asset index. The service also generates QPS-compatible catalog files under `ASSETS_ROOT` so lookup tools can resolve icons, product images, brand art, and brands from the managed asset library.

## mcp-playwright

- `pw_get_title`
  - Input: `{ "url": string }`
  - Output: page title as text content
- `pw_screenshot`
  - Input: `{ "url": string, "filename"?: string }`
  - Output: JSON `{ "path": string }` where `path` is relative to `STORAGE_ROOT`

## mcp-markitdown

- `markitdown_convert`
  - Input: `input_path: string`, `output_path?: string`
  - Behavior: reads from `STORAGE_ROOT/input_path` and converts to markdown
  - Output:
    - If `output_path` provided: `{ "ok": true, "output_path": string }`
    - Else: `{ "ok": true, "markdown": string }`

## mcp-qps-toolkit

QPS MCP tools own deterministic, non-LLM work that can be executed without prompt reasoning: routing, catalog lookup, scoring, token/policy extraction, copy linting, and asset metadata browsing. The QPS plugin remains responsible for LLM-dependent elicitation, narrative generation, artifact synthesis, and subjective design decisions.

Canonical tools use the `qps_*` prefix. Short aliases such as `pick_hero` and `resolve_asset` are compatibility aliases and should stay behavior-equivalent to their canonical counterparts until a documented deprecation removes them.

QPS asset resolution reads generated catalogs from the managed `ASSETS_ROOT` when `MANAGED_ASSETS_ROOT` is configured. The mounted toolkit remains the source for routes, tokens, policies, and other non-asset content.

- `qps_route_request`
  - Input: `{ "query": string, "level"?: "command" | "skill", "top"?: number }`
  - Output: JSON `{ "winner": ..., "confidence": string, "action": string, "ranked": ... }`
- `qps_resolve_asset`
  - Input: `{ "kind": "icon" | "hero" | "product" | "brand-art" | "brand", "query": string, "slot"?: string }`
  - Output: JSON `{ "ok": boolean, "abs_path": string | null, "rel_path": string | null, "label": string, "kind": string, "details": object }`
- `qps_pick_hero`
  - Input: `{ "copy": string, "preferred_type"?: string }`
  - Output: JSON `{ "mode": string, "confidence": number, "primary": object | null, "reasoning": string[] }`
- `qps_pick_html_icon`
  - Input: `{ "query": string, "surface"?: "light" | "dark", "color"?: string, "size"?: number, "classes"?: string }`
  - Output: inline SVG markup as text content (empty string on miss)
- `qps_pick_component`
  - Input: `{ "brief": string, "context"?: "marketing" | "enterprise" }`
  - Output: JSON `{ "ok": boolean, "primary": object | null, "confidence": number, "candidates": object[] }`
- `qps_pick_layout`
  - Input: `{ "brief": string, "task"?: string, "target"?: "enterprise" | "marketing" | "wireframe" | "deck" }`
  - Output: JSON `{ "ok": boolean, "primary": object | null, "confidence": number, "candidates": object[] }`
- `qps_get_policy`
  - Input: `{ "policy": "anti-ai-writing" | "no-fake-content" | "qlik-product-naming" | "no-assumptions" | "evidence-citation" | "creative-vs-floor" | "composition-floors" | "elicitation", "section"?: string }`
  - Output: JSON `{ "ok": true, "policy": string, "title": string, "status": string | null, "rules": string[], "citations": [{ "path": string, "line_start": number, "line_end": number }] }`
- `qps_get_tokens`
  - Input: `{ "select"?: string[], "resolve_refs"?: boolean, "format"?: "object" | "flat" }`
  - Output: JSON `{ "ok": true, "source_path": string, "format": string, "resolve_refs": boolean, "tokens": object }`
- `qps_validate_copy`
  - Input: `{ "content": string, "checks"?: ("anti_ai" | "fake_content" | "qlik_naming" | "template_residue")[] }`
  - Output: JSON `{ "ok": true, "pass": boolean, "counts": { "p0": number, "p1": number, "p2": number }, "findings": [{ "severity": "P0" | "P1" | "P2", "id": string, "message": string, "fix": string, "line": number, "snippet": string }] }`
- `qps_lint_artifact`
  - Input: `{ "content": string }`
  - Output: JSON `{ "ok": true, "pass": boolean, "p0": object[], "p1": object[], "p2": object[], "findings": object[] }`
