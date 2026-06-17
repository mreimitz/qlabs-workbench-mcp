import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { parse as parseYaml } from "yaml";

const port = Number.parseInt(process.env.PORT ?? "7050", 10);
const qpsPluginRoot = process.env.QPS_TOOLKIT_PLUGIN_ROOT ?? "/qps-toolkit/plugin";

const sharedRoot = path.posix.join(qpsPluginRoot, "shared");
const assetsRoot = path.posix.join(sharedRoot, "assets");
const scriptsRoot = path.posix.join(sharedRoot, "scripts");
const requiredPaths = [
  path.posix.join(scriptsRoot, "routes.json"),
  path.posix.join(assetsRoot, "icons.pack.json"),
  path.posix.join(assetsRoot, "products.pack.json"),
  path.posix.join(assetsRoot, "art", "manifest.json"),
];

type RoutesFile = { routes?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;

type IconCatalogEntry = {
  category: string;
  slug: string;
  tags?: string[];
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
let iconsPackMemo: IconsPack | null = null;
let productsPackMemo: ProductsPack | null = null;
let artManifestMemo: ArtManifest | null = null;

const readJson = async <T,>(p: string): Promise<T> => JSON.parse(await fs.readFile(p, "utf8")) as T;

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

const loadRoutes = async () => {
  if (routesMemo) return routesMemo;
  await ensureConfigured();
  const raw = await readJson<RoutesFile>(path.posix.join(scriptsRoot, "routes.json"));
  const routes = Array.isArray(raw) ? raw : (raw.routes ?? []);
  routesMemo = routes;
  return routes;
};

const loadIconsPack = async () => {
  if (iconsPackMemo) return iconsPackMemo;
  await ensureConfigured();
  iconsPackMemo = await readJson<IconsPack>(path.posix.join(assetsRoot, "icons.pack.json"));
  return iconsPackMemo;
};

const loadProductsPack = async () => {
  if (productsPackMemo) return productsPackMemo;
  await ensureConfigured();
  productsPackMemo = await readJson<ProductsPack>(path.posix.join(assetsRoot, "products.pack.json"));
  return productsPackMemo;
};

const loadArtManifest = async () => {
  if (artManifestMemo) return artManifestMemo;
  await ensureConfigured();
  artManifestMemo = await readJson<ArtManifest>(path.posix.join(assetsRoot, "art", "manifest.json"));
  return artManifestMemo;
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

const iconAbsPath = (category: string, slug: string) => path.posix.join(assetsRoot, "icons", category, `${slug}.svg`);

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

  const relPath = `framework/assets/icons/${pick.category}/${pick.slug}.svg`;
  const absPath = iconAbsPath(pick.category, pick.slug);
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

  const absCandidate = path.posix.isAbsolute(winner.path)
    ? winner.path
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
    .replaceAll(/(fill|stroke)=("|\')currentColor\2/g, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|\')#000(?:000)?\2/gi, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|\')black\2/gi, `$1=$2${hex}$2`);
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
      const res = await resolveAsset(args.kind, args.query, args.slot ?? null);
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
      const res = await pickHero(args.copy, args.preferred_type ?? null);
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
      const svg = await inlineIcon(args.query, args.surface ?? "light", args.color ?? null, args.size ?? 48, args.classes ?? null);
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

  return server;
};

const app = express();
app.use(express.json({ limit: "10mb" }));

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
