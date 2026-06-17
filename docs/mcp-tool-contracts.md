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
  - Output: JSON `{ "results": string[] }` where each entry is a filename in `ASSETS_ROOT`
- `assets_add`
  - Input: `{ "filename": string, "keyword": string, "contentBase64": string }`
  - Output: JSON `{ "ok": true, "filename": string, "bytesWritten": number }`
- `assets_tag`
  - Input: `{ "filename": string, "keyword": string }`
  - Output: JSON `{ "ok": true, "filename": string }`

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

- `qps_route_request`
  - Input: `{ "query": string, "level"?: "command" | "skill", "top"?: number }`
  - Output: JSON `{ "winner": ..., "confidence": string, "action": string, "ranked": ... }`
- `qps_resolve_asset`
  - Input: `{ "kind": "icon" | "hero" | "product" | "brand-art", "query": string, "slot"?: string }`
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
