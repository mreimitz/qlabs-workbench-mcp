import fs from "node:fs/promises";
import path from "node:path";

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

type JsonMemo<T> = { mtimeMs: number; size: number; value: T };

export type QpsAssetKind = "icon" | "hero" | "product" | "brand-art";

export type QpsAssetResolverOptions = {
  assetsRoot: string;
  qpsPluginRoot: string;
};

const readJson = async <T,>(filePath: string): Promise<T> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as T;

const readJsonMemo = async <T,>(
  filePath: string,
  memo: JsonMemo<T> | null,
): Promise<JsonMemo<T>> => {
  const stat = await fs.stat(filePath);
  if (memo && memo.mtimeMs === stat.mtimeMs && memo.size === stat.size) return memo;
  return { mtimeMs: stat.mtimeMs, size: stat.size, value: await readJson<T>(filePath) };
};

const norm = (value: string) => value.toLowerCase().trim();

const wordTokens = (value: string) => new Set(norm(value).match(/[a-z0-9]+/g) ?? []);

const tokenize = (value: string) =>
  new Set(norm(value).split(/[^a-z0-9]+/g).filter((token) => token.length > 2));

const tagBoundaryHits = (tag: string, text: string) => {
  const normalizedTag = norm(tag);
  if (!normalizedTag) return 0;
  const re = new RegExp(
    `\\b${normalizedTag
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+")}\\b`,
    "g",
  );
  return (norm(text).match(re) ?? []).length;
};

const iconManagedPath = (entry: IconCatalogEntry) =>
  entry.path ?? path.posix.join("icons", entry.category, `${entry.slug}.svg`);

const ICON_FALLBACKS = [
  "data-pipelines/data",
  "objects-metaphors/diamond",
  "objects-metaphors/spark",
  "status-ui/info",
  "objects-metaphors/sphere",
];

const GENERIC_PRODUCT_TAGS = new Set(["qlik", "named", "generic", "brand", "abstract", "product"]);

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

const escapeAttr = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const recolorSvg = (svg: string, color: string) => {
  const normalizedColor = color.trim();
  if (!normalizedColor || normalizedColor === "currentColor") return svg;
  const hex = normalizedColor.startsWith("#") ? normalizedColor : `#${normalizedColor}`;
  return svg
    .replaceAll(/(fill|stroke)=("|')currentColor\2/g, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|')#000(?:000)?\2/gi, `$1=$2${hex}$2`)
    .replaceAll(/(fill|stroke)=("|')black\2/gi, `$1=$2${hex}$2`);
};

const applyIconBicolor = (svg: string, primary: string, accent: string, bg: string) => {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match) return svg;
  const tag = match[0];
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

const ICON_BICOLOR_LIGHT = { primary: "#54565A", accent: "#009845", bg: "#FFFFFF" };
const ICON_BICOLOR_DARK = { primary: "#FFFFFF", accent: "#10CFC9", bg: "#19426C" };

const scoreIcon = (entry: IconCatalogEntry, queryTokens: Set<string>) => {
  const tags = new Set((entry.tags ?? []).map((tag) => norm(tag)));
  const slugTokens = new Set(norm(entry.slug).split(/[^a-z0-9]+/g).filter(Boolean));
  const tagHits = [...queryTokens].filter((token) => tags.has(token)).length;
  const slugHits = [...queryTokens].filter((token) => slugTokens.has(token)).length;
  const score = tagHits * 2 + slugHits;
  const reasons: string[] = [];
  if (tagHits) reasons.push(`tag_hits=${tagHits}`);
  if (slugHits) reasons.push(`slug_hits=${slugHits}`);
  return { score, reasons };
};

export const createQpsAssetResolver = ({ assetsRoot, qpsPluginRoot }: QpsAssetResolverOptions) => {
  let iconsPackMemo: JsonMemo<IconsPack> | null = null;
  let productsPackMemo: JsonMemo<ProductsPack> | null = null;
  let artManifestMemo: JsonMemo<ArtManifest> | null = null;

  const loadIconsPack = async () => {
    iconsPackMemo = await readJsonMemo<IconsPack>(
      path.posix.join(assetsRoot, "icons.pack.json"),
      iconsPackMemo,
    );
    return iconsPackMemo.value;
  };

  const loadProductsPack = async () => {
    productsPackMemo = await readJsonMemo<ProductsPack>(
      path.posix.join(assetsRoot, "products.pack.json"),
      productsPackMemo,
    );
    return productsPackMemo.value;
  };

  const loadArtManifest = async () => {
    artManifestMemo = await readJsonMemo<ArtManifest>(
      path.posix.join(assetsRoot, "art", "manifest.json"),
      artManifestMemo,
    );
    return artManifestMemo.value;
  };

  const iconAbsPath = (entry: IconCatalogEntry) =>
    path.posix.join(assetsRoot, iconManagedPath(entry));

  const resolveIcon = async (query: string) => {
    const pack = await loadIconsPack();
    const icons = pack.catalog?.icons ?? [];
    const queryTokens = wordTokens(query);
    let best: { entry: IconCatalogEntry; score: number; reasons: string[] } | null = null;

    for (const icon of icons) {
      const { score, reasons } = scoreIcon(icon, queryTokens);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { entry: icon, score, reasons };
    }

    const pick =
      best?.entry ??
      (() => {
        const byFull = new Map<string, IconCatalogEntry>();
        for (const icon of icons) byFull.set(`${icon.category}/${icon.slug}`, icon);
        for (const fallback of ICON_FALLBACKS) {
          const hit = byFull.get(fallback);
          if (hit) return hit;
        }
        return icons[0];
      })();

    if (!pick) {
      return {
        ok: false,
        abs_path: null,
        rel_path: null,
        label: query,
        kind: "icon" as const,
        details: { category: null, tags: [], score: 0, reasons: ["empty-catalog"], fallback: true },
      };
    }

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
      kind: "icon" as const,
      details: {
        category: pick.category,
        tags: pick.tags ?? [],
        score: best?.score ?? 0,
        reasons: best?.reasons ?? ["fallback"],
        fallback: !best,
      },
    };
  };

  const pickHero = async (copy: string, preferredType?: string | null) => {
    const products = await loadProductsPack();
    const rows: Array<{
      path: string;
      meta: NonNullable<ProductsPack["files"]>[string];
      score: number;
      reasons: string[];
    }> = [];

    for (const [productPath, meta] of Object.entries(products.files ?? {})) {
      if ((meta.area ?? "generic") === "generic") continue;
      const tags = meta.tags ?? [];
      let score = 0;
      const reasons: string[] = [];
      for (const tag of tags) {
        if (GENERIC_PRODUCT_TAGS.has(norm(tag))) continue;
        const hits = tagBoundaryHits(tag, copy);
        if (hits) {
          score += 2 * hits;
          reasons.push(`tag '${tag}' x ${hits}`);
        }
      }
      if (score > 0) rows.push({ path: productPath, meta, score, reasons });
    }

    rows.sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));

    const winner =
      rows.find((row) => !preferredType || row.meta.type === preferredType) ?? rows[0] ?? null;

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
        area_scores: rows.slice(0, 5).map((row) => [row.path, row.score, row.reasons]),
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
      area_scores: rows.slice(0, 5).map((row) => [row.path, row.score, row.reasons]),
    };
  };

  const resolveBrandArt = async (query: string, slot?: string | null) => {
    const manifest = await loadArtManifest();
    const files = manifest.files ?? {};
    const queryTokens = wordTokens(query);
    const wantedSlot = slot ? norm(slot) : null;

    let best: { file: string; score: number; tags: string[] } | null = null;
    for (const [file, meta] of Object.entries(files)) {
      if (wantedSlot && !(meta.slot ?? []).map(norm).includes(wantedSlot)) continue;
      const tags = (meta.tags ?? []).map(norm);
      const tagSet = new Set(tags);
      const hits = [...queryTokens].filter((token) => tagSet.has(token)).length;
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
      kind: "brand-art" as const,
      details: { slot: wantedSlot, score: best?.score ?? 0, tags: best?.tags ?? [], fallback: !best },
    };
  };

  const resolveAsset = async (kind: QpsAssetKind, query: string, slot?: string | null) => {
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
        kind: "hero" as const,
        details: {
          mode: decision.mode,
          confidence: decision.confidence,
          reasoning: decision.reasoning?.slice?.(0, 5) ?? [],
        },
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
      kind: "product" as const,
      details: {
        mode: decision.mode,
        confidence: decision.confidence,
        reasoning: decision.reasoning?.slice?.(0, 5) ?? [],
      },
    };
  };

  const inlineIcon = async (
    query: string,
    surface?: "light" | "dark" | null,
    color?: string | null,
    size?: number | null,
    classes?: string | null,
  ) => {
    const result = await resolveIcon(query);
    if (!result.ok || !result.abs_path) return null;
    const raw = await fs.readFile(result.abs_path, "utf8");
    const sized = raw.replace(/<svg\b/i, `<svg width="${size ?? 48}" height="${size ?? 48}"`);
    const withClass = classes ? sized.replace(/<svg\b/i, `<svg class="${escapeAttr(classes)}"`) : sized;
    const withColor = color ? recolorSvg(withClass, color) : withClass;
    const colors = surface === "dark" ? ICON_BICOLOR_DARK : ICON_BICOLOR_LIGHT;
    return color
      ? applyIconBicolor(withColor, "", colors.accent, colors.bg)
      : applyIconBicolor(withColor, colors.primary, colors.accent, colors.bg);
  };

  const pickDiagramIcons = async (
    nodes: Array<{ label: string; role?: string | null }>,
    threshold: number,
    thresholdMode: "confidence" | "score",
    runnersUp: number,
  ) => {
    const pack = await loadIconsPack();
    const icons = pack.catalog?.icons ?? [];
    const effectiveThreshold =
      thresholdMode === "confidence"
        ? Math.max(1, Math.ceil(Math.max(0, Math.min(1, threshold)) * 8))
        : Math.max(1, Math.floor(threshold));

    const results = nodes.map((node) => {
      const label = String(node.label ?? "").trim();
      const role = node.role ? norm(String(node.role)) : null;
      const roleCats = role ? ROLE_CATEGORIES[role] ?? [] : [];
      const labelNorm = norm(label);
      const labelTokens = wordTokens(labelNorm);
      const scored = icons
        .map((icon) => {
          const slugTokens = new Set(norm(icon.slug).split(/[^a-z0-9]+/g).filter(Boolean));
          const allSlugInLabel =
            slugTokens.size > 0 && [...slugTokens].every((token) => labelTokens.has(token));
          const roleMatch = roleCats.includes(icon.category);
          const tagSet = new Set((icon.tags ?? []).map(norm));
          const tagHits = [...labelTokens].filter((token) => tagSet.has(token)).length;
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
        .sort((left, right) => right.score - left.score || left.icon.slug.localeCompare(right.icon.slug));

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

    const matched = results.filter((result) => result.icon).length;
    const unmatched = results.length - matched;
    return {
      ok: true,
      nodes: results,
      summary: { matched, unmatched, threshold: effectiveThreshold, threshold_mode: thresholdMode },
    };
  };

  return {
    inlineIcon,
    loadArtManifest,
    loadIconsPack,
    loadProductsPack,
    pickDiagramIcons,
    pickHero,
    resolveAsset,
    resolveBrandArt,
    resolveIcon,
  };
};
