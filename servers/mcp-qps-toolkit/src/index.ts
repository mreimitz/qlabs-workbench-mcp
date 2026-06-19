import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { parse as parseYaml } from "yaml";
import { createQpsAssetResolver } from "./asset-resolver.js";

const port = Number.parseInt(process.env.PORT ?? "7050", 10);
const qpsPluginRoot = process.env.QPS_TOOLKIT_PLUGIN_ROOT ?? "/qps-toolkit/plugin";
const qpsToolkitWriteMode = process.env.QPS_TOOLKIT_WRITE_MODE === "metadata" ? "metadata" : "read-only";

const sharedRoot = path.posix.join(qpsPluginRoot, "shared");
const toolkitAssetsRoot = path.posix.join(sharedRoot, "assets");
const assetsRoot = process.env.MANAGED_ASSETS_ROOT ?? process.env.ASSETS_ROOT ?? toolkitAssetsRoot;
const scriptsRoot = path.posix.join(sharedRoot, "scripts");
const policiesRoot = path.posix.join(sharedRoot, "policies");
const tokensRoot = path.posix.join(sharedRoot, "tokens");
const canonPath = path.posix.join(qpsPluginRoot, "skills", "qlik-ui-design", "framework", "canon.json");
const iconsMetadataPath = path.posix.join(assetsRoot, "icons", "_metadata.json");
const iconsCatalogPath = path.posix.join(assetsRoot, "icons", "catalog.json");
const productsMetadataPath = path.posix.join(assetsRoot, "products", "_metadata.json");
const brandsMetadataPath = path.posix.join(assetsRoot, "brands", "_metadata.json");
const brandsCatalogPath = path.posix.join(assetsRoot, "brands", "catalog.json");

const POLICY_PATHS = {
  "anti-ai-writing": path.posix.join(policiesRoot, "anti-ai-writing.md"),
  "no-fake-content": path.posix.join(policiesRoot, "no-fake-content-policy.md"),
  "qlik-product-naming": path.posix.join(policiesRoot, "qlik-product-naming.md"),
  "no-assumptions": path.posix.join(policiesRoot, "no-assumptions-policy.md"),
  "evidence-citation": path.posix.join(policiesRoot, "evidence-citation-policy.md"),
  "creative-vs-floor": path.posix.join(policiesRoot, "creative-vs-floor.md"),
  "composition-floors": path.posix.join(policiesRoot, "composition-floors.md"),
  elicitation: path.posix.join(policiesRoot, "elicitation.md"),
} as const;

type PolicyName = keyof typeof POLICY_PATHS;
const requiredPaths = [
  path.posix.join(scriptsRoot, "routes.json"),
  path.posix.join(assetsRoot, "icons.pack.json"),
  iconsMetadataPath,
  iconsCatalogPath,
  path.posix.join(assetsRoot, "products.pack.json"),
  productsMetadataPath,
  path.posix.join(assetsRoot, "art", "manifest.json"),
  path.posix.join(assetsRoot, "brands.pack.json"),
  brandsMetadataPath,
  brandsCatalogPath,
  path.posix.join(tokensRoot, "tokens.json"),
  canonPath,
  ...Object.values(POLICY_PATHS),
];

const assetResolver = createQpsAssetResolver({ assetsRoot, qpsPluginRoot });


type RoutesFile = { routes?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

type IconCatalogEntry = {
  category: string;
  path?: string;
  slug: string;
  tags?: string[];
  source_file?: string;
};

type IconsPack = {
  catalog?: {
    icons?: IconCatalogEntry[];
  };
};

type ProductsPack = {
  files?: Record<
    string,
    {
      area?: string;
      type?: string;
      tags?: string[];
      variant?: string;
      use_when?: string;
    }
  >;
};

type ArtManifest = {
  files?: Record<
    string,
    {
      slot?: string[];
      tags?: string[];
    }
  >;
};

let routesMemo: Array<Record<string, unknown>> | null = null;
type JsonMemo<T> = { mtimeMs: number; value: T };

let iconsPackMemo: JsonMemo<IconsPack> | null = null;
let productsPackMemo: JsonMemo<ProductsPack> | null = null;
let artManifestMemo: JsonMemo<ArtManifest> | null = null;
let canonMemo: Record<string, any> | null = null;
let tokensMemo: Record<string, any> | null = null;
const policyMemo = new Map<string, { path: string; text: string }>();

const readJson = async <T,>(p: string): Promise<T> => JSON.parse(await fs.readFile(p, "utf8")) as T;
const readJsonMemo = async <T,>(p: string, memo: JsonMemo<T> | null): Promise<JsonMemo<T>> => {
  const stat = await fs.stat(p);
  if (memo && memo.mtimeMs === stat.mtimeMs) return memo;
  return { mtimeMs: stat.mtimeMs, value: await readJson<T>(p) };
};
const writeJson = async (p: string, value: unknown) => {
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, p);
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const getConfigurationStatus = async () => {
  const missingPaths: string[] = [];

  for (const requiredPath of requiredPaths) {
    if (!(await pathExists(requiredPath))) {
      missingPaths.push(requiredPath);
    }
  }

  const configured = missingPaths.length === 0;

  return {
    ok: true,
    configured,
    qpsPluginRoot,
    toolkitAssetsRoot,
    assetsRoot,
    writeMode: qpsToolkitWriteMode,
    note: configured
      ? "Toolkit content is available."
      : "Toolkit content is not mounted yet. Point QPS_TOOLKIT_ROOT at a qps-toolkit checkout to enable these tools.",
    missingPaths,
  };
};

const ensureConfigured = async () => {
  const status = await getConfigurationStatus();
  if (status.configured) return;

  throw new Error(
    `QPS toolkit content is not configured. Set QPS_TOOLKIT_ROOT to a qps-toolkit checkout. Missing: ${status.missingPaths.join(", ")}`
  );
};

const safeRelPath = (input: unknown) => {
  const raw = typeof input === "string" ? input : "";
  const rel = path.posix.normalize(raw.replaceAll("\\", "/")).replace(/^\/+/, "");
  if (!rel || rel === ".") return "";
  if (rel.includes("\u0000") || rel.startsWith("..") || rel.includes("/../")) {
    throw new Error("Invalid path");
  }
  return rel;
};

const absPathUnder = (root: string, rel: string) => {
  const abs = path.posix.normalize(path.posix.join(root, rel));
  if (abs !== root && !abs.startsWith(`${root}/`)) throw new Error("Invalid path");
  return abs;
};

const loadRoutes = async () => {
  if (routesMemo) return routesMemo;
  await ensureConfigured();
  const raw = await readJson<RoutesFile>(path.posix.join(scriptsRoot, "routes.json"));
  const routes = Array.isArray(raw) ? raw : (raw.routes ?? []);
  routesMemo = routes;
  return routes;
};

const loadIconsPack = async () => {
  await ensureConfigured();
  iconsPackMemo = await readJsonMemo<IconsPack>(path.posix.join(assetsRoot, "icons.pack.json"), iconsPackMemo);
  return iconsPackMemo.value;
};

const loadProductsPack = async () => {
  await ensureConfigured();
  productsPackMemo = await readJsonMemo<ProductsPack>(path.posix.join(assetsRoot, "products.pack.json"), productsPackMemo);
  return productsPackMemo.value;
};

const loadArtManifest = async () => {
  await ensureConfigured();
  artManifestMemo = await readJsonMemo<ArtManifest>(path.posix.join(assetsRoot, "art", "manifest.json"), artManifestMemo);
  return artManifestMemo.value;
};

const loadCanon = async () => {
  if (canonMemo) return canonMemo;
  await ensureConfigured();
  canonMemo = await readJson<Record<string, any>>(canonPath);
  return canonMemo;
};

const loadTokens = async () => {
  if (tokensMemo) return tokensMemo;
  await ensureConfigured();
  tokensMemo = await readJson<Record<string, any>>(path.posix.join(tokensRoot, "tokens.json"));
  return tokensMemo;
};

const loadPolicy = async (policy: PolicyName) => {
  const p = POLICY_PATHS[policy];
  const existing = policyMemo.get(policy);
  if (existing) return existing;
  await ensureConfigured();
  const text = await fs.readFile(p, "utf8");
  const res = { path: p, text };
  policyMemo.set(policy, res);
  return res;
};

const norm = (s: string) => s.toLowerCase().trim();

const wordTokens = (s: string) => new Set(norm(s).match(/[a-z0-9]+/g) ?? []);

const wholeWordHits = (tokens: Set<string>, keyword: string) => {
  const parts = keyword.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (parts.length === 0) return 0;
  return parts.every((p) => tokens.has(p)) ? 1 : 0;
};

const scoreRoute = (queryNorm: string, tokens: Set<string>, route: Record<string, unknown>) => {
  let score = 0;
  const matched: string[] = [];
  const keywords = Array.isArray(route.keywords) ? route.keywords : [];
  const phrases = Array.isArray(route.phrases) ? route.phrases : [];
  const anti = Array.isArray(route.anti) ? route.anti : [];

  for (const kw of keywords) {
    if (typeof kw !== "string") continue;
    if (wholeWordHits(tokens, kw)) {
      score += 1;
      matched.push(kw);
    }
  }

  for (const ph of phrases) {
    if (typeof ph !== "string") continue;
    if (queryNorm.includes(ph.toLowerCase())) {
      score += 2;
      matched.push(`"${ph}"`);
    }
  }

  for (const an of anti) {
    if (typeof an !== "string") continue;
    if (queryNorm.includes(an.toLowerCase())) {
      score -= 2;
      matched.push(`-${an}`);
    }
  }

  return { score: Math.max(score, 0), matched };
};

const confidenceAndAction = (top: number, second: number) => {
  if (top <= 0) return { confidence: "none", action: "fallback" };
  if (second === 0) return top >= 3 ? { confidence: "high", action: "route" } : { confidence: "medium", action: "route" };
  const margin = top - second;
  if (top < 2 || margin < 2) return { confidence: "low", action: "disambiguate" };
  if (top >= 3 && margin >= 2) return { confidence: "high", action: "route" };
  return { confidence: "medium", action: "route" };
};

const routeRequest = async (query: string, level: "command" | "skill", top: number) => {
  const routes = await loadRoutes();
  const queryNorm = norm(query);
  const tokens = wordTokens(queryNorm);

  const scored = routes
    .map((r) => {
      const { score, matched } = scoreRoute(queryNorm, tokens, r);
      if (score <= 0) return null;
      return {
        id: typeof r.id === "string" ? r.id : "",
        skill: typeof r.skill === "string" ? r.skill : "",
        kind: typeof r.kind === "string" ? r.kind : "command",
        score,
        matched,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const ranked =
    level === "skill"
      ? (() => {
          const agg = new Map<string, { id: string; skill: string; kind: string; score: number; matched: string[] }>();
          for (const item of scored) {
            const sk = item.skill || item.id;
            const bucket = agg.get(sk) ?? { id: sk, skill: sk, kind: "skill", score: 0, matched: [] };
            bucket.score += item.score;
            bucket.matched.push(...item.matched);
            agg.set(sk, bucket);
          }
          return [...agg.values()].sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
        })()
      : scored.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));

  const topScore = ranked[0]?.score ?? 0;
  const secondScore = ranked[1]?.score ?? 0;
  const { confidence, action } = confidenceAndAction(topScore, secondScore);

  const result: Record<string, unknown> = {
    query,
    level,
    winner: ranked[0] ?? null,
    confidence,
    action,
    ranked: ranked.slice(0, top),
  };

  if (action === "disambiguate") {
    const threshold = Math.max(topScore - 1, 1);
    result.candidates = ranked.slice(0, top).filter((r) => r.score >= threshold).slice(0, 5);
  }

  return result;
};

const ICON_FALLBACKS = ["data-pipelines/data", "objects-metaphors/diamond", "objects-metaphors/spark", "status-ui/info", "objects-metaphors/sphere"];

const scoreIcon = (entry: IconCatalogEntry, queryTokens: Set<string>) => {
  const tags = new Set((entry.tags ?? []).map((t) => norm(t)));
  const slugTokens = new Set(norm(entry.slug).split(/[^a-z0-9]+/g).filter(Boolean));
  const tagHits = [...queryTokens].filter((t) => tags.has(t)).length;
  const slugHits = [...queryTokens].filter((t) => slugTokens.has(t)).length;
  const score = tagHits * 2 + slugHits;
  const reasons: string[] = [];
  if (tagHits) reasons.push(`tag_hits=${tagHits}`);
  if (slugHits) reasons.push(`slug_hits=${slugHits}`);
  return { score, reasons };
};

const iconManagedPath = (entry: IconCatalogEntry) =>
  entry.path ?? path.posix.join("icons", entry.category, `${entry.slug}.svg`);

const iconAbsPath = (entry: IconCatalogEntry) => path.posix.join(assetsRoot, iconManagedPath(entry));

const resolveIcon = async (query: string) => {
  const pack = await loadIconsPack();
  const icons = pack.catalog?.icons ?? [];
  const qTokens = wordTokens(query);
  let best: { entry: IconCatalogEntry; score: number; reasons: string[] } | null = null;

  for (const i of icons) {
    const { score, reasons } = scoreIcon(i, qTokens);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { entry: i, score, reasons };
  }

  const pick = best?.entry ?? (() => {
    const byFull = new Map<string, IconCatalogEntry>();
    for (const i of icons) byFull.set(`${i.category}/${i.slug}`, i);
    for (const f of ICON_FALLBACKS) {
      const hit = byFull.get(f);
      if (hit) return hit;
    }
    return icons[0];
  })();

  const managedPath = iconManagedPath(pick);
  const relPath = `framework/assets/${managedPath}`;
  const absPath = iconAbsPath(pick);
  const ok = await fs
    .access(absPath)
    .then(() => true)
    .catch(() => false);

  return {
    ok,
    abs_path: ok ? absPath : null,
    rel_path: relPath,
    label: `${pick.category}/${pick.slug}`,
    kind: "icon",
    details: {
      category: pick.category,
      tags: pick.tags ?? [],
      score: best?.score ?? 0,
      reasons: best?.reasons ?? ["fallback"],
      fallback: !best,
    },
  };
};

const ROLE_CATEGORIES: Record<string, string[]> = {
  source: ["data-pipelines", "cloud-infra", "devices"],
  transformation: ["data-pipelines"],
  storage: ["data-pipelines", "cloud-infra"],
  governance: ["security-governance"],
  consumption: ["analytics-charts", "devices", "documents"],
  "ai-ml": ["ai-automation"],
  "cloud-infra": ["cloud-infra"],
  identity: ["people-community", "security-governance"],
  process: ["objects-metaphors", "status-ui"],
  decision: ["status-ui", "objects-metaphors"],
};

type DiagramNodeInput = { label: string; role?: string | null };

const pickDiagramIcons = async (
  nodes: DiagramNodeInput[],
  threshold: number,
  thresholdMode: "confidence" | "score",
  runnersUp: number,
) => {
  const pack = await loadIconsPack();
  const icons = pack.catalog?.icons ?? [];
  const effectiveThreshold =
    thresholdMode === "confidence" ? Math.max(1, Math.ceil(Math.max(0, Math.min(1, threshold)) * 8)) : Math.max(1, Math.floor(threshold));

  const results = nodes.map((node) => {
    const label = String(node.label ?? "").trim();
    const role = node.role ? norm(String(node.role)) : null;
    const roleCats = role ? ROLE_CATEGORIES[role] ?? [] : [];
    const labelNorm = norm(label);
    const labelTokens = wordTokens(labelNorm);
    const scored = icons
      .map((icon) => {
        const slugTokens = new Set(norm(icon.slug).split(/[^a-z0-9]+/g).filter(Boolean));
        const allSlugInLabel = slugTokens.size > 0 && [...slugTokens].every((t) => labelTokens.has(t));
        const roleMatch = roleCats.includes(icon.category);
        const tagSet = new Set((icon.tags ?? []).map(norm));
        const tagHits = [...labelTokens].filter((t) => tagSet.has(t)).length;
        const slugSubstring = labelNorm.includes(norm(icon.slug));

        let score = 0;
        const reasons: string[] = [];
        if (allSlugInLabel) {
          score += 3;
          reasons.push("slug_word_match");
        }
        if (roleMatch) {
          score += 3;
          reasons.push(`role_category:${icon.category}`);
        }
        if (tagHits) {
          score += 2 * tagHits;
          reasons.push(`tag_hits:${tagHits}`);
        }
        if (slugSubstring) {
          score += 1;
          reasons.push("slug_substring");
        }

        return {
          icon,
          score,
          reasons,
          confidence: Math.min(score / 8, 1),
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => (b.score - a.score) || a.icon.slug.localeCompare(b.icon.slug));

    const best = scored[0] ?? null;
    const iconPath = best ? `framework/assets/icons/${best.icon.category}/${best.icon.slug}.svg` : null;
    const confidence = best ? best.confidence : 0;
    const ok = Boolean(best && best.score >= effectiveThreshold);

    return {
      label,
      role,
      icon: ok
        ? {
            path: iconPath,
            slug: `${best!.icon.category}/${best!.icon.slug}`,
            category: best!.icon.category,
            score: best!.score,
            confidence,
            reasons: best!.reasons,
          }
        : null,
      confidence,
      threshold: effectiveThreshold,
      runners_up: scored.slice(1, 1 + Math.max(0, runnersUp)).map((row) => ({
        path: `framework/assets/icons/${row.icon.category}/${row.icon.slug}.svg`,
        slug: `${row.icon.category}/${row.icon.slug}`,
        category: row.icon.category,
        score: row.score,
        confidence: row.confidence,
        reasons: row.reasons,
      })),
    };
  });

  const matched = results.filter((r) => r.icon).length;
  const unmatched = results.length - matched;
  return {
    ok: true,
    nodes: results,
    summary: { matched, unmatched, threshold: effectiveThreshold, threshold_mode: thresholdMode },
  };
};

const GENERIC_PRODUCT_TAGS = new Set(["qlik", "named", "generic", "brand", "abstract", "product"]);

const tagBoundaryHits = (tag: string, text: string) => {
  const t = norm(tag);
  if (!t) return 0;
  const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&").replace(/\\s+/g, "\\\\s+")}\\b`, "g");
  return (norm(text).match(re) ?? []).length;
};

const pickHero = async (copy: string, preferredType?: string | null) => {
  const products = await loadProductsPack();
  const rows: Array<{ path: string; meta: NonNullable<ProductsPack["files"]>[string]; score: number; reasons: string[] }> = [];

  for (const [p, meta] of Object.entries(products.files ?? {})) {
    if ((meta.area ?? "generic") === "generic") continue;
    const tags = meta.tags ?? [];
    let score = 0;
    const reasons: string[] = [];
    for (const tag of tags) {
      if (GENERIC_PRODUCT_TAGS.has(norm(tag))) continue;
      const h = tagBoundaryHits(tag, copy);
      if (h) {
        score += 2 * h;
        reasons.push(`tag '${tag}' x ${h}`);
      }
    }
    if (score > 0) rows.push({ path: p, meta, score, reasons });
  }

  rows.sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path));

  const winner = rows.find((r) => !preferredType || r.meta.type === preferredType) ?? rows[0] ?? null;

  if (!winner || winner.score < 3) {
    const icon = await resolveIcon(copy);
    return {
      mode: icon.ok ? "icon" : "default",
      confidence: icon.ok ? 0.6 : 0.2,
      primary: icon.ok
        ? {
            type: "icon",
            slug: icon.label,
            path: icon.rel_path,
            abs_path: icon.abs_path,
          }
        : null,
      fallback: { reason: "no product cleared threshold" },
      reasoning: ["no product match, used icon resolver"],
      area_scores: rows.slice(0, 5).map((r) => [r.path, r.score, r.reasons]),
    };
  }

  const managedProductRel = winner.path.replace(/^(\.\.\/)+shared\/assets\/products\//, "products/");
  const absCandidate = path.posix.isAbsolute(winner.path)
    ? winner.path
    : managedProductRel !== winner.path
      ? path.posix.join(assetsRoot, managedProductRel)
      : path.posix.join(qpsPluginRoot, winner.path.replace(/^(\.\.\/)+/, ""));
  const absOk = await fs
    .access(absCandidate)
    .then(() => true)
    .catch(() => false);

  return {
    mode: "product",
    confidence: Math.min(1, winner.score / 10),
    primary: {
      type: winner.meta.type ?? "unknown",
      variant: winner.meta.variant ?? null,
      tags: winner.meta.tags ?? [],
      path: winner.path,
      abs_path: absOk ? absCandidate : null,
    },
    fallback: null,
    reasoning: winner.reasons,
    area_scores: rows.slice(0, 5).map((r) => [r.path, r.score, r.reasons]),
  };
};

const resolveBrandArt = async (query: string, slot?: string | null) => {
  const manifest = await loadArtManifest();
  const files = manifest.files ?? {};
  const qTokens = wordTokens(query);
  const wantedSlot = slot ? norm(slot) : null;

  let best: { file: string; score: number; tags: string[] } | null = null;
  for (const [file, meta] of Object.entries(files)) {
    if (wantedSlot && !(meta.slot ?? []).map(norm).includes(wantedSlot)) continue;
    const tags = (meta.tags ?? []).map(norm);
    const tagSet = new Set(tags);
    const hits = [...qTokens].filter((t) => tagSet.has(t)).length;
    const score = hits * 2 + (wantedSlot ? 1 : 0);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { file, score, tags };
  }

  const fallbackFile = wantedSlot === "divider" ? "streak-left-heavy-wash.png" : "streak-hero-left.png";
  const pick = best?.file ?? fallbackFile;
  const absPath = path.posix.join(assetsRoot, "art", pick);
  const ok = await fs
    .access(absPath)
    .then(() => true)
    .catch(() => false);
  const relPath = `assets/art/${pick}`;

  return {
    ok,
    abs_path: ok ? absPath : null,
    rel_path: relPath,
    label: pick,
    kind: "brand-art",
    details: { slot: wantedSlot, score: best?.score ?? 0, tags: best?.tags ?? [], fallback: !best },
  };
};

const resolveAsset = async (kind: "icon" | "hero" | "product" | "brand-art", query: string, slot?: string | null) => {
  if (kind === "icon") return resolveIcon(query);
  if (kind === "brand-art") return resolveBrandArt(query, slot);
  if (kind === "hero") {
    const decision = await pickHero(query, null);
    const primary = (decision as any).primary ?? {};
    return {
      ok: Boolean(primary?.abs_path),
      abs_path: primary?.abs_path ?? null,
      rel_path: primary?.path ?? null,
      label: primary?.slug ?? query,
      kind: "hero",
      details: { mode: decision.mode, confidence: decision.confidence, reasoning: decision.reasoning?.slice?.(0, 5) ?? [] },
    };
  }
  const decision = await pickHero(query, "illustration");
  const primary = (decision as any).primary ?? {};
  const ok = decision.mode === "product" && Boolean(primary?.abs_path);
  return {
    ok,
    abs_path: ok ? primary?.abs_path : null,
    rel_path: ok ? primary?.path : null,
    label: ok ? primary?.variant ?? query : query,
    kind: "product",
    details: { mode: decision.mode, confidence: decision.confidence, reasoning: decision.reasoning?.slice?.(0, 5) ?? [] },
  };
};

const ICON_BICOLOR_LIGHT = { primary: "#54565A", accent: "#009845", bg: "#FFFFFF" };
const ICON_BICOLOR_DARK = { primary: "#FFFFFF", accent: "#10CFC9", bg: "#19426C" };

const applyIconBicolor = (svg: string, primary: string, accent: string, bg: string) => {
  const m = svg.match(/<svg\b[^>]*>/i);
  if (!m) return svg;
  const tag = m[0];
  const hasColor = /\bcolor\s*=/.test(tag);
  const hasStyle = /\bstyle\s*=/.test(tag);
  const additions: string[] = [];
  if (primary && !hasColor) additions.push(`color="${primary}"`);
  const styleParts: string[] = [];
  if (accent) styleParts.push(`--qds-icon-accent: ${accent}`);
  if (bg) styleParts.push(`--qds-icon-bg: ${bg}`);
  if (styleParts.length && !hasStyle) additions.push(`style="${styleParts.join("; ")};"`);
  if (!additions.length) return svg;
  const newTag = tag.replace("<svg", `<svg ${additions.join(" ")}`);
  return svg.replace(tag, newTag);
};

const recolorSvg = (svg: string, color: string) => {
  const c = color.trim();
  if (!c || c === "currentColor") return svg;
  const hex = c.startsWith("#") ? c : `#${c}`;
  return svg
    .replaceAll(/(fill|stroke)=("|')currentColor\2/g, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|')#000(?:000)?\2/gi, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|')black\2/gi, `$1=$2${hex}$2`);
};

const escapeAttr = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const inlineIcon = async (query: string, surface?: "light" | "dark" | null, color?: string | null, size?: number | null, classes?: string | null) => {
  const res = await resolveIcon(query);
  if (!res.ok || !res.abs_path) return null;
  const raw = await fs.readFile(res.abs_path, "utf8");
  const sized = raw.replace(/<svg\b/i, `<svg width="${size ?? 48}" height="${size ?? 48}"`);
  const withClass = classes ? sized.replace(/<svg\b/i, `<svg class="${escapeAttr(classes)}"`) : sized;
  const withColor = color ? recolorSvg(withClass, color) : withClass;
  const s = surface === "dark" ? ICON_BICOLOR_DARK : ICON_BICOLOR_LIGHT;
  return color ? applyIconBicolor(withColor, "", s.accent, s.bg) : applyIconBicolor(withColor, s.primary, s.accent, s.bg);
};

const loadDashboardArchetypes = async () => {
  const schemaPath = path.posix.join(sharedRoot, "schemas", "dashboard-archetypes.yaml");
  const raw = await fs.readFile(schemaPath, "utf8");
  const parsed = parseYaml(raw) as Record<string, unknown>;
  const archetypes = (parsed?.archetypes ?? {}) as Record<string, any>;
  return archetypes;
};

const tokenize = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/g).filter((t) => t.length > 2));

const pickLayout = async (brief: string, task?: string | null, target?: string | null) => {
  const archetypes = await loadDashboardArchetypes();
  const qTokens = tokenize(brief);
  const candidates: Array<{ slug: string; meta: any; score: number; evidence: string[] }> = [];

  for (const [slug, meta] of Object.entries(archetypes)) {
    if (task && meta["primary-task"] !== task) continue;
    let score = 0;
    const evidence: string[] = [];

    const kwTokens = new Set<string>();
    for (const k of (meta.keywords ?? []) as unknown[]) {
      if (typeof k === "string") for (const t of tokenize(k)) kwTokens.add(t);
    }
    const kwHits = [...qTokens].filter((t) => kwTokens.has(t));
    if (kwHits.length) {
      score += 3 * kwHits.length;
      evidence.push(`keyword matches: ${kwHits.sort().join(",")}`);
    }

    const nameHits = [...qTokens].filter((t) => tokenize(String(meta.name ?? "")).has(t));
    if (nameHits.length) {
      score += 3 * nameHits.length;
      evidence.push(`name matches: ${nameHits.sort().join(",")}`);
    }

    const wtuHits = [...qTokens].filter((t) => tokenize(String(meta["when-to-use"] ?? "")).has(t));
    if (wtuHits.length) {
      score += 2 * wtuHits.length;
      evidence.push(`when-to-use matches: ${wtuHits.sort().join(",")}`);
    }

    const avoidTokens = new Set<string>();
    for (const d of (meta["do-not-use-for"] ?? []) as unknown[]) {
      if (typeof d === "string") for (const t of tokenize(d)) avoidTokens.add(t);
    }
    const avoidHits = [...qTokens].filter((t) => avoidTokens.has(t));
    if (avoidHits.length) {
      score -= 4 * avoidHits.length;
      evidence.push(`do-not-use-for hits: ${avoidHits.sort().join(",")}`);
    }

    if (score > 0) candidates.push({ slug, meta, score, evidence });
  }

  candidates.sort((a, b) => (b.score - a.score) || a.slug.localeCompare(b.slug));
  if (!candidates.length) return { ok: false, brief, task: task ?? null, primary: null, confidence: 0, candidates: [] };

  const top = candidates[0];
  const runner = candidates[1]?.score ?? 0;
  const confidence = runner ? Math.min(1, (top.score / Math.max(runner, 1)) / 2) : 1;

  const summary = (c: typeof top, includeTarget: boolean) => {
    const out: Record<string, unknown> = {
      slug: c.slug,
      name: c.meta.name ?? null,
      primary_task: c.meta["primary-task"] ?? null,
      when_to_use: c.meta["when-to-use"] ?? null,
      path: "../../shared/schemas/dashboard-archetypes.yaml",
      score: c.score,
      evidence: c.evidence,
    };
    if (includeTarget && target) {
      out.target = target;
      out.render_recipe = (c.meta.regions ?? []).map((r: any) => ({
        region: r.id ?? null,
        role: r.role ?? null,
        required: Boolean(r.required),
        render: (r.render ?? {})[target] ?? null,
      }));
    }
    return out;
  };

  return {
    ok: true,
    brief,
    task: task ?? null,
    primary: summary(top, true),
    confidence: Number(confidence.toFixed(2)),
    candidates: candidates.slice(0, 5).map((c) => summary(c, false)),
  };
};

const pickComponent = async (brief: string, context?: "marketing" | "enterprise" | null) => {
  const metaPath = path.posix.join(sharedRoot, "components", "_metadata.json");
  const metadata = await readJson<Record<string, any>>(metaPath);
  const qTokens = tokenize(brief);

  const STOP = new Set(["a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "at", "by", "is", "are", "be", "this", "that", "these", "those", "i", "we", "you", "they", "it", "as", "use", "want", "need", "should", "show"]);
  const tok = (t: string) => new Set(norm(t).split(/[^a-z0-9]+/g).filter((x) => x.length > 2 && !STOP.has(x)));

  const scoreOne = (m: any) => {
    let score = 0;
    const evidence: string[] = [];

    const intentHits = [...qTokens].filter((t) => tok(String(m.intent ?? "")).has(t));
    if (intentHits.length) {
      score += 3 * intentHits.length;
      evidence.push(`intent matches: ${intentHits.sort().join(",")}`);
    }

    const uwTokens = new Set<string>();
    for (const u of (m.use_when ?? []) as unknown[]) {
      if (typeof u === "string") for (const t of tok(u)) uwTokens.add(t);
    }
    const uwHits = [...qTokens].filter((t) => uwTokens.has(t));
    if (uwHits.length) {
      score += 2 * uwHits.length;
      evidence.push(`use_when matches: ${uwHits.sort().join(",")}`);
    }

    const avoidTokens = new Set<string>();
    for (const d of (m.do_not_use_when ?? []) as unknown[]) {
      if (typeof d === "string") for (const t of tok(d)) avoidTokens.add(t);
    }
    const avoidHits = [...qTokens].filter((t) => avoidTokens.has(t));
    if (avoidHits.length) {
      score -= 4 * avoidHits.length;
      evidence.push(`anti-pattern hits: ${avoidHits.sort().join(",")}`);
    }

    return { score, evidence };
  };

  const candidates: Array<Record<string, unknown>> = [];
  for (const [filename, m] of Object.entries(metadata)) {
    if (context) {
      const ctx = (m.context ?? []) as unknown[];
      if (!Array.isArray(ctx) || !ctx.includes(context)) continue;
    }
    const { score, evidence } = scoreOne(m);
    if (score <= 0) continue;
    candidates.push({
      filename,
      slug: path.posix.basename(filename, ".html"),
      category: m.category ?? null,
      intent: m.intent ?? null,
      score,
      evidence,
      alternatives: m.alternatives ?? [],
      path: `../../shared/components/${filename}`,
    });
  }

  candidates.sort((a, b) => (Number(b.score) - Number(a.score)) || String(a.slug).localeCompare(String(b.slug)));
  if (!candidates.length) return { ok: false, brief, context: context ?? null, primary: null, confidence: 0, candidates: [] };

  const primary = candidates[0];
  const runnerUp = candidates[1]?.score ? Number(candidates[1].score) : 0;
  const conf = runnerUp ? Math.min(1, (Number(primary.score) / Math.max(runnerUp, 1)) / 2) : 1;

  return { ok: true, brief, context: context ?? null, primary, confidence: Number(conf.toFixed(2)), candidates: candidates.slice(0, 5), alternatives_to_consider: primary.alternatives ?? [] };
};

const extractCanonBlocks = (text: string) => {
  const lines = text.split(/\r?\n/);
  const blocks: Record<string, { start_line: number; end_line: number; lines: string[] }> = {};
  let current: { name: string; start: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const startMatch = line.match(/<!--\s*canon-start:\s*([a-z0-9-]+)\s*-->/i);
    if (startMatch) {
      current = { name: startMatch[1], start: i + 1, body: [] };
      continue;
    }
    const endMatch = line.match(/<!--\s*canon-end:\s*([a-z0-9-]+)\s*-->/i);
    if (endMatch && current && endMatch[1].toLowerCase() === current.name.toLowerCase()) {
      blocks[current.name] = { start_line: current.start, end_line: i + 1, lines: current.body };
      current = null;
      continue;
    }
    if (current) current.body.push(line);
  }

  return blocks;
};

const extractSectionByHeading = (text: string, heading: string) => {
  const lines = text.split(/\r?\n/);
  const h = heading.trim().toLowerCase();
  const startIdx = lines.findIndex((l) => l.trim().toLowerCase() === `## ${h}` || l.trim().toLowerCase() === `# ${h}`);
  if (startIdx === -1) return null;
  const startLine = startIdx + 1;
  const startLevel = lines[startIdx].startsWith("## ") ? 2 : 1;
  const body: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const isHeading = line.startsWith("# ") || line.startsWith("## ") || line.startsWith("### ");
    if (isHeading) {
      const level = line.startsWith("### ") ? 3 : line.startsWith("## ") ? 2 : 1;
      if (level <= startLevel) break;
    }
    body.push(line);
  }
  const endLine = startIdx + body.length + 1;
  return { start_line: startLine, end_line: endLine, lines: body };
};

const compactRulesFromLines = (lines: string[]) => {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) out.push(trimmed.slice(2).trim());
    if (out.length >= 80) break;
  }
  return out;
};

const getPolicyPayload = async (policy: PolicyName, section?: string | null) => {
  const { path: policyPath, text } = await loadPolicy(policy);
  const lines = text.split(/\r?\n/);
  const title = (lines.find((l) => l.startsWith("# ")) ?? `# ${policy}`).replace(/^#\s+/, "").trim();
  const statusLine = lines.find((l) => l.toLowerCase().startsWith("**status:**")) ?? null;
  const status = statusLine ? statusLine.replace(/\*\*/g, "").split(":").slice(1).join(":").trim() : null;
  const canonBlocks = extractCanonBlocks(text);

  let extract: { start_line: number; end_line: number; lines: string[]; name?: string } | null = null;
  if (section && canonBlocks[section]) {
    const b = canonBlocks[section];
    extract = { start_line: b.start_line, end_line: b.end_line, lines: b.lines, name: section };
  } else if (section) {
    const s = extractSectionByHeading(text, section);
    if (s) extract = { start_line: s.start_line, end_line: s.end_line, lines: s.lines, name: section };
  }

  const rules =
    extract?.lines?.length
      ? compactRulesFromLines(extract.lines)
      : Object.keys(canonBlocks).length
        ? Object.entries(canonBlocks).flatMap(([k, b]) => compactRulesFromLines([`- [${k}]` as const, ...b.lines])).slice(0, 80)
        : (() => {
            const candidates = ["never invent", "required treatment for missing information", "banned constructions (never use these)"];
            for (const c of candidates) {
              const s = extractSectionByHeading(text, c);
              if (s) return compactRulesFromLines(s.lines);
            }
            return compactRulesFromLines(lines);
          })();

  const citations = extract
    ? [{ title: extract.name ?? section ?? title, path: policyPath, line_start: extract.start_line, line_end: extract.end_line }]
    : [{ title, path: policyPath, line_start: 1, line_end: Math.min(lines.length, 220) }];

  return { ok: true, policy, title, status, path: policyPath, section: section ?? null, rules, citations, canon_blocks: Object.keys(canonBlocks) };
};

const tokenGetByPath = (root: any, parts: string[]) => {
  let cur: any = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
};

const resolveTokenRef = (root: any, raw: any, depth: number): any => {
  if (depth <= 0) return raw;
  if (typeof raw !== "string") return raw;
  const m = raw.match(/^\{([a-zA-Z0-9_.-]+)\}$/);
  if (!m) return raw;
  const refPath = m[1].split(".").filter(Boolean);
  const target = tokenGetByPath(root, refPath);
  if (!target || typeof target !== "object" || !("$value" in target)) return raw;
  return resolveTokenRef(root, (target as any).$value, depth - 1);
};

const transformTokens = (node: any, root: any, resolveRefs: boolean): any => {
  if (!node || typeof node !== "object") return node;
  if ("$value" in node) {
    const raw = (node as any).$value;
    const value = resolveRefs ? resolveTokenRef(root, raw, 10) : raw;
    return { ...node, $value: value };
  }
  const out: any = Array.isArray(node) ? [] : {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = transformTokens(v, root, resolveRefs);
  }
  return out;
};

const flattenTokens = (node: any, root: any, resolveRefs: boolean, prefix: string, out: Record<string, any>) => {
  if (!node || typeof node !== "object") return;
  if ("$value" in node) {
    const raw = (node as any).$value;
    out[prefix] = resolveRefs ? resolveTokenRef(root, raw, 10) : raw;
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    flattenTokens(v, root, resolveRefs, prefix ? `${prefix}.${k}` : k, out);
  }
};

const getTokensPayload = async (select: string[] | null, resolveRefs: boolean, format: "object" | "flat") => {
  const tokens = await loadTokens();

  if (!select || select.length === 0) {
    const root = format === "object" ? transformTokens(tokens, tokens, resolveRefs) : (() => {
      const out: Record<string, any> = {};
      flattenTokens(tokens, tokens, resolveRefs, "", out);
      return out;
    })();
    return { ok: true, source_path: path.posix.join(tokensRoot, "tokens.json"), format, resolve_refs: resolveRefs, tokens: root };
  }

  if (format === "flat") {
    const out: Record<string, any> = {};
    for (const p of select) {
      const parts = p.split(".").filter(Boolean);
      const node = tokenGetByPath(tokens, parts);
      if (!node) continue;
      if (typeof node === "object" && "$value" in node) {
        out[p] = resolveRefs ? resolveTokenRef(tokens, (node as any).$value, 10) : (node as any).$value;
      } else {
        flattenTokens(node, tokens, resolveRefs, p, out);
      }
    }
    return { ok: true, source_path: path.posix.join(tokensRoot, "tokens.json"), format, resolve_refs: resolveRefs, tokens: out };
  }

  const picked: Record<string, any> = {};
  for (const p of select) {
    const parts = p.split(".").filter(Boolean);
    const node = tokenGetByPath(tokens, parts);
    if (!node) continue;
    const transformed = transformTokens(node, tokens, resolveRefs);
    picked[p] = transformed;
  }

  return { ok: true, source_path: path.posix.join(tokensRoot, "tokens.json"), format, resolve_refs: resolveRefs, tokens: picked };
};

type Finding = { severity: "P0" | "P1" | "P2"; id: string; message: string; fix: string; line: number; snippet: string };

const maskAntiExamples = async (content: string) => {
  const canon = await loadCanon();
  const markers = canon?.["anti-ai-banned-phrases"]?.["escape-hatch"]?.["html-comment-markers"] ?? [];
  const startMarker = markers?.[0] ?? "<!-- qds-anti-example-start -->";
  const endMarker = markers?.[1] ?? "<!-- qds-anti-example-end -->";

  const mask = (src: string, re: RegExp) =>
    src.replace(re, (m) =>
      m
        .split(/\r?\n/)
        .map((l) => " ".repeat(l.length))
        .join("\n")
    );

  const commentRe = new RegExp(`${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
  const classRe = /<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*\bqds-anti-example\b[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi;
  const fenceRe = /```[^\n]*\n[\s\S]*?```/g;

  return mask(mask(mask(content, commentRe), classRe), fenceRe);
};

const lineNumberAt = (text: string, idx: number) => text.slice(0, Math.max(0, idx)).split(/\r?\n/).length;

const lineSnippetAt = (text: string, idx: number) => {
  const start = text.lastIndexOf("\n", idx);
  const end = text.indexOf("\n", idx);
  const s = text.slice(start === -1 ? 0 : start + 1, end === -1 ? text.length : end);
  return s.trim().slice(0, 180);
};

const collectRegexFindings = (masked: string, raw: string, re: RegExp, mk: (match: RegExpExecArray) => Omit<Finding, "line" | "snippet">, cap: number) => {
  const findings: Finding[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  re.lastIndex = 0;
  while ((m = re.exec(masked)) !== null) {
    const idx = m.index;
    const base = mk(m);
    findings.push({ ...base, line: lineNumberAt(raw, idx), snippet: lineSnippetAt(raw, idx) });
    i += 1;
    if (i >= cap) break;
  }
  return findings;
};

const validateCopy = async (content: string, checks: Array<"anti_ai" | "fake_content" | "qlik_naming" | "template_residue">) => {
  const masked = await maskAntiExamples(content);
  const canon = await loadCanon();

  const findings: Finding[] = [];

  if (checks.includes("anti_ai")) {
    const phraseParts: string[] = (canon?.["anti-ai-banned-phrases"]?.phrases ?? []).map((p: any) => p?.regex).filter(Boolean);
    const compositeParts: string[] = (canon?.["anti-ai-banned-phrases"]?.["composite-patterns"] ?? []).map((p: any) => p?.regex).filter(Boolean);
    const dashCap: number = canon?.["anti-ai-banned-phrases"]?.["density-rules"]?.["em-dash-per-paragraph-cap"] ?? 1;

    if (phraseParts.length) {
      const re = new RegExp(phraseParts.join("|"), "gi");
      findings.push(
        ...collectRegexFindings(
          masked,
          content,
          re,
          (m) => ({ severity: "P0", id: "anti-ai-tell", message: `Anti-AI tell detected: ${m[0]}`, fix: "Rewrite the sentence to remove the banned construction/wording." }),
          40
        )
      );
    }

    if (compositeParts.length) {
      const re = new RegExp(compositeParts.join("|"), "gi");
      findings.push(
        ...collectRegexFindings(
          masked,
          content,
          re,
          () => ({ severity: "P0", id: "anti-ai-composite", message: "Anti-AI composite pattern detected.", fix: "Rewrite to a direct statement; remove the rhetorical pivot template." }),
          20
        )
      );
    }

    const paragraphs = masked.split(/\n\s*\n/);
    let cursor = 0;
    for (const para of paragraphs) {
      const count = (para.match(/—/g) ?? []).length;
      if (count > dashCap) {
        const idx = cursor;
        findings.push({
          severity: "P1",
          id: "em-dash-density",
          message: `Em-dash density too high: ${count} per paragraph (cap ${dashCap}).`,
          fix: "Reduce em-dashes; prefer periods/commas/parentheses.",
          line: lineNumberAt(content, idx),
          snippet: lineSnippetAt(content, idx),
        });
      }
      cursor += para.length + 2;
    }
  }

  if (checks.includes("fake_content")) {
    const fakeProof = /\b(fake|sample|dummy|mock|placeholder) (metric|customer|quote|logo|screenshot|dashboard|roadmap|certification|benchmark|revenue|ARR|ROI|KPI)s?\b/gi;
    const plausible = /\b(plausible|believable|made[- ]up|invented) (number|metric|data|customer|quote|screenshot|dashboard|timeline|system|architecture)s?\b/gi;

    findings.push(
      ...collectRegexFindings(
        masked,
        content,
        fakeProof,
        (m) => ({ severity: "P0", id: "no-fake-content", message: `Fake-proof phrasing detected: ${m[0]}`, fix: "Replace with a visible placeholder (e.g., [Metric required], [Source required]) or remove the claim." }),
        40
      )
    );
    findings.push(
      ...collectRegexFindings(
        masked,
        content,
        plausible,
        (m) => ({ severity: "P1", id: "no-fake-content", message: `Plausible-but-invented phrasing detected: ${m[0]}`, fix: "Replace with a visible placeholder or neutral framing; do not invent data." }),
        20
      )
    );
  }

  if (checks.includes("qlik_naming")) {
    const traps: Array<{ re: RegExp; fix: string }> = [
      { re: /(?<!Qlik )\bSense (Cloud|Sales|Mobile|Server|Enterprise|App\b|Apps\b)/gim, fix: 'Use "Qlik Sense" (full canonical name).' },
      { re: /\bCatalog \+ Lineage\b/gim, fix: 'Use "Talend Data Catalog" or "Qlik Cloud governance" — verify which applies.' },
      { re: /\bQlik View\b/gim, fix: 'Use "QlikView" (single word; legacy/classic product).' },
      { re: /(\bthe Talend Cloud\b|\bon Talend Cloud\b|\binto Talend Cloud\b|\bvia Talend Cloud\b)/gim, fix: 'Use "Qlik Talend Cloud" — keep the Qlik prefix in Qlik artifacts.' },
      { re: /\bQlik DQ\b/gim, fix: 'Use "Talend Data Quality".' },
      { re: /\bQlik Catalog\b(?! by)/gim, fix: 'Use "Talend Data Catalog" or specify the Qlik Cloud governance feature.' },
      { re: /\bQC Analytics\b/gim, fix: 'Use "Qlik Cloud Analytics" (full canonical name).' },
    ];

    for (const t of traps) {
      findings.push(
        ...collectRegexFindings(
          masked,
          content,
          t.re,
          () => ({ severity: "P0", id: "qlik-product-naming", message: "Plausible-but-wrong Qlik product name detected.", fix: t.fix }),
          20
        )
      );
    }
  }

  if (checks.includes("template_residue")) {
    const residue = canon?.["template-residue-fingerprints"] ?? {};
    const literalCats = new Set(["bullets", "footers", "headers", "lorem-ipsum", "qlik-corporate-boilerplate", "sidebars-quotes"]);
    const regexCats = new Set(["section-numbered"]);
    const low = masked.toLowerCase();

    const addLiteral = (group: string, needle: string, severity: "P0" | "P1") => {
      const n = needle.toLowerCase();
      const idx = low.indexOf(n);
      if (idx === -1) return;
      findings.push({
        severity,
        id: "template-residue",
        message: `Template residue detected (${group}): ${needle}`,
        fix: "Delete template placeholder/boilerplate content; replace with real content or a deliberate placeholder.",
        line: lineNumberAt(content, idx),
        snippet: lineSnippetAt(content, idx),
      });
    };

    for (const [group, items] of Object.entries(residue)) {
      if (!Array.isArray(items)) continue;
      const severity: "P0" | "P1" = group === "qlik-corporate-boilerplate" ? "P1" : "P0";

      if (literalCats.has(group)) {
        for (const needle of items) {
          if (typeof needle !== "string") continue;
          addLiteral(group, needle, severity);
        }
      }

      if (regexCats.has(group)) {
        for (const pat of items) {
          if (typeof pat !== "string") continue;
          const re = new RegExp(pat, "gi");
          findings.push(
            ...collectRegexFindings(
              masked,
              content,
              re,
              (m) => ({
                severity,
                id: "template-residue",
                message: `Template residue detected (${group}): ${m[0]}`,
                fix: "Delete template placeholder/boilerplate content; replace with real content or a deliberate placeholder.",
              }),
              10
            )
          );
        }
      }
    }

    for (const b of ["[data product]", "[owner to confirm]"]) {
      addLiteral("bracket-placeholder", b, "P0");
    }
  }

  const p0 = findings.filter((f) => f.severity === "P0");
  const p1 = findings.filter((f) => f.severity === "P1");
  const p2 = findings.filter((f) => f.severity === "P2");
  const pass = p0.length === 0;

  return { ok: true, pass, counts: { p0: p0.length, p1: p1.length, p2: p2.length }, findings };
};

const lintArtifact = async (content: string) => {
  const res = await validateCopy(content, ["anti_ai", "fake_content", "qlik_naming", "template_residue"]);
  const p0 = res.findings.filter((f) => f.severity === "P0");
  const p1 = res.findings.filter((f) => f.severity === "P1");
  const p2 = res.findings.filter((f) => f.severity === "P2");
  return { ok: true, pass: res.pass, p0, p1, p2, findings: res.findings };
};

const getServer = () => {
  const server = new McpServer({ name: "mcp-qps-toolkit", version: "0.1.0" });

  server.registerTool(
    "qps_route_request",
    {
      description: "Deterministically route a request to a qps-toolkit command or skill (keyword voting).",
      inputSchema: { query: z.string(), level: z.enum(["command", "skill"]).optional(), top: z.number().int().min(1).max(20).optional() },
    },
    async (args: { query: string; level?: "command" | "skill"; top?: number }) => {
      const res = await routeRequest(args.query, args.level ?? "command", args.top ?? 5);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_resolve_asset",
    {
      description: "Resolve an asset from qps-toolkit shared catalogs (icon|hero|product|brand-art).",
      inputSchema: { kind: z.enum(["icon", "hero", "product", "brand-art"]), query: z.string(), slot: z.string().optional() },
    },
    async (args: { kind: "icon" | "hero" | "product" | "brand-art"; query: string; slot?: string }) => {
      const res = await assetResolver.resolveAsset(args.kind, args.query, args.slot ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_pick_hero",
    {
      description: "Pick a hero visual (product-first, else icon). Read-only.",
      inputSchema: { copy: z.string(), preferred_type: z.string().optional() },
    },
    async (args: { copy: string; preferred_type?: string }) => {
      const res = await assetResolver.pickHero(args.copy, args.preferred_type ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_pick_html_icon",
    {
      description: "Return inline SVG for a topic (surface-aware bi-color).",
      inputSchema: { query: z.string(), surface: z.enum(["light", "dark"]).optional(), color: z.string().optional(), size: z.number().int().min(8).max(512).optional(), classes: z.string().optional() },
    },
    async (args: { query: string; surface?: "light" | "dark"; color?: string; size?: number; classes?: string }) => {
      const svg = await assetResolver.inlineIcon(args.query, args.surface ?? "light", args.color ?? null, args.size ?? 48, args.classes ?? null);
      return { content: [{ type: "text", text: svg ?? "" }] };
    }
  );

  server.registerTool(
    "qps_pick_component",
    {
      description: "Pick a shared qps-toolkit web component for a layout/content brief.",
      inputSchema: { brief: z.string(), context: z.enum(["marketing", "enterprise"]).optional() },
    },
    async (args: { brief: string; context?: "marketing" | "enterprise" }) => {
      const res = await pickComponent(args.brief, args.context ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_pick_layout",
    {
      description: "Pick a dashboard/page layout archetype from qps-toolkit schemas (advisory).",
      inputSchema: { brief: z.string(), task: z.string().optional(), target: z.enum(["enterprise", "marketing", "wireframe", "deck"]).optional() },
    },
    async (args: { brief: string; task?: string; target?: "enterprise" | "marketing" | "wireframe" | "deck" }) => {
      const res = await pickLayout(args.brief, args.task ?? null, args.target ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_pick_diagram_icons",
    {
      description: "Pick per-node Qlik concept icons for diagram nodes (role-aware, tag/slug scoring).",
      inputSchema: {
        nodes: z.array(z.object({ label: z.string(), role: z.string().optional() })),
        threshold: z.number().min(0).max(1).optional(),
        threshold_mode: z.enum(["confidence", "score"]).optional(),
        runners_up: z.number().int().min(0).max(10).optional(),
      },
    },
    async (args: { nodes: Array<{ label: string; role?: string }>; threshold?: number; threshold_mode?: "confidence" | "score"; runners_up?: number }) => {
      const res = await assetResolver.pickDiagramIcons(args.nodes, args.threshold ?? 0.5, args.threshold_mode ?? "confidence", args.runners_up ?? 0);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_get_policy",
    {
      description: "Return compact policy rules + citations from qps-toolkit shared policies.",
      inputSchema: { policy: z.enum(Object.keys(POLICY_PATHS) as [PolicyName, ...PolicyName[]]), section: z.string().optional() },
    },
    async (args: { policy: PolicyName; section?: string }) => {
      const res = await getPolicyPayload(args.policy, args.section ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_get_tokens",
    {
      description: "Return Qlik design tokens from tokens.json (optionally filtered and ref-resolved).",
      inputSchema: { select: z.array(z.string()).optional(), resolve_refs: z.boolean().optional(), format: z.enum(["object", "flat"]).optional() },
    },
    async (args: { select?: string[]; resolve_refs?: boolean; format?: "object" | "flat" }) => {
      const res = await getTokensPayload(args.select ?? null, args.resolve_refs ?? true, args.format ?? "flat");
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_validate_copy",
    {
      description: "Deterministic copy validation (anti-AI, no-fake-content, Qlik naming, template residue). Honors qds-anti-example exemptions.",
      inputSchema: { content: z.string(), checks: z.array(z.enum(["anti_ai", "fake_content", "qlik_naming", "template_residue"])).optional() },
    },
    async (args: { content: string; checks?: Array<"anti_ai" | "fake_content" | "qlik_naming" | "template_residue"> }) => {
      const res = await validateCopy(args.content, args.checks ?? ["anti_ai", "fake_content", "qlik_naming", "template_residue"]);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "qps_lint_artifact",
    {
      description: "Aggregated text-floor lint (copy + naming + residue). Read-only.",
      inputSchema: { content: z.string() },
    },
    async (args: { content: string }) => {
      const res = await lintArtifact(args.content);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "resolve_asset",
    {
      description: "Alias for qps_resolve_asset (compat with qps-assets tool names).",
      inputSchema: { kind: z.enum(["icon", "hero", "product", "brand-art"]), query: z.string(), slot: z.string().optional() },
    },
    async (args: { kind: "icon" | "hero" | "product" | "brand-art"; query: string; slot?: string }) => {
      const res = await assetResolver.resolveAsset(args.kind, args.query, args.slot ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "pick_hero",
    {
      description: "Alias for qps_pick_hero (compat with qps-assets tool names).",
      inputSchema: { copy: z.string(), preferred_type: z.string().optional() },
    },
    async (args: { copy: string; preferred_type?: string }) => {
      const res = await assetResolver.pickHero(args.copy, args.preferred_type ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "pick_component",
    {
      description: "Alias for qps_pick_component (compat with qps-assets tool names).",
      inputSchema: { brief: z.string(), context: z.enum(["marketing", "enterprise"]).optional() },
    },
    async (args: { brief: string; context?: "marketing" | "enterprise" }) => {
      const res = await pickComponent(args.brief, args.context ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "pick_layout",
    {
      description: "Alias for qps_pick_layout (compat with qps-assets tool names).",
      inputSchema: { brief: z.string(), task: z.string().optional(), target: z.enum(["enterprise", "marketing", "wireframe", "deck"]).optional() },
    },
    async (args: { brief: string; task?: string; target?: "enterprise" | "marketing" | "wireframe" | "deck" }) => {
      const res = await pickLayout(args.brief, args.task ?? null, args.target ?? null);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  server.registerTool(
    "pick_html_icon",
    {
      description: "Alias for qps_pick_html_icon (compat with qps-assets tool names).",
      inputSchema: { query: z.string(), surface: z.enum(["light", "dark"]).optional(), color: z.string().optional(), size: z.number().int().min(8).max(512).optional(), classes: z.string().optional() },
    },
    async (args: { query: string; surface?: "light" | "dark"; color?: string; size?: number; classes?: string }) => {
      const svg = await assetResolver.inlineIcon(args.query, args.surface ?? "light", args.color ?? null, args.size ?? 48, args.classes ?? null);
      return { content: [{ type: "text", text: svg ?? "" }] };
    }
  );

  server.registerTool(
    "pick_diagram_icons",
    {
      description: "Alias for qps_pick_diagram_icons (compat with qps-assets tool names).",
      inputSchema: {
        nodes: z.array(z.object({ label: z.string(), role: z.string().optional() })),
        threshold: z.number().min(0).max(1).optional(),
        threshold_mode: z.enum(["confidence", "score"]).optional(),
        runners_up: z.number().int().min(0).max(10).optional(),
      },
    },
    async (args: { nodes: Array<{ label: string; role?: string }>; threshold?: number; threshold_mode?: "confidence" | "score"; runners_up?: number }) => {
      const res = await assetResolver.pickDiagramIcons(args.nodes, args.threshold ?? 0.5, args.threshold_mode ?? "confidence", args.runners_up ?? 0);
      return { content: [{ type: "text", text: JSON.stringify(res) }] };
    }
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/assets/browse", async (req: Request, res: Response) => {
  try {
    await ensureConfigured();
    const rel = safeRelPath(req.query.path);
    const abs = absPathUnder(assetsRoot, rel);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    res.json({
      path: rel,
      entries: entries
        .filter((e) => e.name !== ".DS_Store")
        .map((e) => ({
          name: e.name,
          kind: e.isDirectory() ? "folder" : "file",
          path: rel ? `${rel}/${e.name}` : e.name,
        }))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1)),
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/assets/file", async (req: Request, res: Response) => {
  try {
    await ensureConfigured();
    const rel = safeRelPath(req.query.path);
    const abs = absPathUnder(assetsRoot, rel);
    const ext = path.posix.extname(abs).toLowerCase();
    const contentType =
      ext === ".svg"
        ? "image/svg+xml"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".webp"
                ? "image/webp"
                : "application/octet-stream";
    const buf = await fs.readFile(abs);
    res.setHeader("Content-Type", contentType);
    res.send(buf);
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

const getAssetMeta = async (relPath: string) => {
  const abs = absPathUnder(assetsRoot, relPath);
  const stat = await fs.stat(abs);
  const parts = relPath.split("/").filter(Boolean);
  if (parts[0] === "icons" && parts.length === 3 && parts[2].endsWith(".svg")) {
    const category = parts[1];
    const slug = path.posix.basename(parts[2], ".svg");
    const pack = await loadIconsPack();
    const entry = (pack.catalog?.icons ?? []).find((i) => i.category === category && i.slug === slug) ?? null;
    return {
      kind: "icon" as const,
      path: relPath,
      abs_path: abs,
      stat: { size: stat.size, mtimeMs: stat.mtimeMs },
      icon: { slug, category, tags: entry?.tags ?? [], source_file: entry?.source_file ?? null },
      sources: {
        pack: path.posix.join(assetsRoot, "icons.pack.json"),
        metadata: iconsMetadataPath,
        catalog: iconsCatalogPath,
      },
    };
  }
  if (parts[0] === "art" && parts.length === 2) {
    const file = parts[1];
    const manifest = await loadArtManifest();
    const meta = (manifest.files ?? {})[file] ?? null;
    return {
      kind: "brand-art" as const,
      path: relPath,
      abs_path: abs,
      stat: { size: stat.size, mtimeMs: stat.mtimeMs },
      art: { file, tags: meta?.tags ?? [], slot: meta?.slot ?? [] },
      sources: { manifest: path.posix.join(assetsRoot, "art", "manifest.json") },
    };
  }
  if (parts[0] === "products" && parts.length >= 2) {
    const relUnderProducts = parts.slice(1).join("/");
    const key = `../../shared/assets/products/${relUnderProducts}`;
    const pack = await loadProductsPack();
    const entry = (pack.files ?? {})[key] ?? null;
    return {
      kind: "product" as const,
      path: relPath,
      abs_path: abs,
      stat: { size: stat.size, mtimeMs: stat.mtimeMs },
      product: {
        key,
        area: entry?.area ?? null,
        type: entry?.type ?? null,
        variant: entry?.variant ?? null,
        use_when: entry?.use_when ?? null,
        tags: entry?.tags ?? [],
      },
      sources: {
        pack: path.posix.join(assetsRoot, "products.pack.json"),
        metadata: productsMetadataPath,
      },
    };
  }
  if (parts[0] === "brands" && parts.length === 2 && parts[1].endsWith(".svg")) {
    const slug = path.posix.basename(parts[1], ".svg");
    const meta = await readJson<Record<string, any>>(brandsMetadataPath);
    const pack = await readJson<Record<string, any>>(path.posix.join(assetsRoot, "brands.pack.json"));
    const entry = meta?.[slug] ?? null;
    const packEntry = pack?.files?.[slug] ?? null;
    return {
      kind: "brand" as const,
      path: relPath,
      abs_path: abs,
      stat: { size: stat.size, mtimeMs: stat.mtimeMs },
      brand: {
        slug,
        title: entry?.title ?? packEntry?.title ?? null,
        qlik_category: entry?.qlik_category ?? packEntry?.qlik_category ?? null,
        url: entry?.url ?? packEntry?.url ?? null,
        hex: entry?.hex ?? packEntry?.hex ?? null,
        categories: entry?.categories ?? packEntry?.categories ?? [],
        aliases: entry?.aliases ?? packEntry?.aliases ?? [],
        license: entry?.license ?? packEntry?.license ?? null,
      },
      sources: {
        pack: path.posix.join(assetsRoot, "brands.pack.json"),
        metadata: brandsMetadataPath,
        catalog: brandsCatalogPath,
      },
    };
  }
  return {
    kind: "file" as const,
    path: relPath,
    abs_path: abs,
    stat: { size: stat.size, mtimeMs: stat.mtimeMs },
  };
};

app.get("/assets/meta", async (req: Request, res: Response) => {
  try {
    await ensureConfigured();
    const rel = safeRelPath(req.query.path);
    const meta = await getAssetMeta(rel);
    res.json({ ok: true, write_mode: qpsToolkitWriteMode, ...meta });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put("/assets/meta", async (req: Request, res: Response) => {
  try {
    await ensureConfigured();
    if (qpsToolkitWriteMode !== "metadata") {
      res.status(403).json({
        ok: false,
        error: "QPS toolkit metadata writes are disabled. Set QPS_TOOLKIT_WRITE_MODE=metadata to enable them.",
        write_mode: qpsToolkitWriteMode,
      });
      return;
    }
    const rel = safeRelPath(req.query.path);
    const meta = await getAssetMeta(rel);

    if (meta.kind === "icon") {
      const category = meta.icon.category;
      const slug = meta.icon.slug;
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((t: unknown) => typeof t === "string").map(norm) : null;
      if (!tags) throw new Error("Missing tags");

      const packPath = path.posix.join(assetsRoot, "icons.pack.json");
      const pack = await readJson<any>(packPath);
      const icons = pack?.catalog?.icons ?? [];
      const idx = icons.findIndex((i: any) => i?.category === category && i?.slug === slug);
      if (idx === -1) throw new Error("Icon not found in pack");
      icons[idx].tags = tags;
      await writeJson(packPath, pack);

      const catalog = await readJson<any>(iconsCatalogPath);
      const cIcons = catalog?.icons ?? [];
      const cIdx = cIcons.findIndex((i: any) => i?.category === category && i?.slug === slug);
      if (cIdx !== -1) {
        cIcons[cIdx].tags = tags;
        await writeJson(iconsCatalogPath, catalog);
      }

      const metadataKey = `${category}/${slug}.svg`;
      const metaJson = await readJson<any>(iconsMetadataPath);
      metaJson[metadataKey] = { ...(metaJson[metadataKey] ?? {}), tags };
      await writeJson(iconsMetadataPath, metaJson);

      iconsPackMemo = null;
    }

    if (meta.kind === "product") {
      const key = meta.product.key;
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((t: unknown) => typeof t === "string").map(norm) : null;
      if (!tags) throw new Error("Missing tags");
      const packPath = path.posix.join(assetsRoot, "products.pack.json");
      const pack = await readJson<any>(packPath);
      if (!pack.files?.[key]) throw new Error("Product not found in pack");
      pack.files[key].tags = tags;
      await writeJson(packPath, pack);

      const metaJson = await readJson<any>(productsMetadataPath);
      metaJson[key] = { ...(metaJson[key] ?? {}), tags };
      await writeJson(productsMetadataPath, metaJson);

      productsPackMemo = null;
    }

    if (meta.kind === "brand-art") {
      const file = meta.art.file;
      const tags = Array.isArray(req.body?.tags) ? req.body.tags.filter((t: unknown) => typeof t === "string").map(norm) : null;
      if (!tags) throw new Error("Missing tags");
      const manifestPath = path.posix.join(assetsRoot, "art", "manifest.json");
      const manifest = await readJson<any>(manifestPath);
      manifest.files = manifest.files ?? {};
      manifest.files[file] = { ...(manifest.files[file] ?? {}), tags };
      await writeJson(manifestPath, manifest);
      artManifestMemo = null;
    }

    if (meta.kind === "brand") {
      const slug = meta.brand.slug;
      const patch: Record<string, unknown> = {};
      for (const k of ["title", "qlik_category", "url", "hex", "license"] as const) {
        if (typeof req.body?.[k] === "string") patch[k] = req.body[k];
      }
      if (Array.isArray(req.body?.aliases)) patch.aliases = req.body.aliases.filter((t: unknown) => typeof t === "string");
      if (Array.isArray(req.body?.categories)) patch.categories = req.body.categories.filter((t: unknown) => typeof t === "string");

      const metaJson = await readJson<any>(brandsMetadataPath);
      metaJson[slug] = { ...(metaJson[slug] ?? {}), ...patch };
      await writeJson(brandsMetadataPath, metaJson);

      const catalog = await readJson<any>(brandsCatalogPath);
      if (catalog?.items?.[slug]) {
        catalog.items[slug] = { ...(catalog.items[slug] ?? {}), ...patch };
        await writeJson(brandsCatalogPath, catalog);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/health", async (_req: Request, res: Response) => {
  res.json(await getConfigurationStatus());
});

app.post("/mcp", async (req: Request, res: Response) => {
  const server = getServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on("close", () => {
    transport.close();
    server.close();
  });
});

app.listen(port, "0.0.0.0");
