import fs from "node:fs/promises";
import path from "node:path";

export type AssetKind =
  | "image"
  | "icon"
  | "product"
  | "brand-art"
  | "brand"
  | "template"
  | "file";

export type AssetRecord = {
  path: string;
  filename: string;
  title: string;
  kind: AssetKind;
  tags: string[];
  keywords: string[];
  mime: string;
  source: "upload" | "qps-import" | "legacy" | "seed";
  sourcePath?: string;
  size: number;
  mtimeMs: number;
  url: string;
  slots?: string[];
  area?: string;
  type?: string;
  variant?: string;
  useWhen?: string;
  aliases?: string[];
  categories?: string[];
  qlikCategory?: string;
  license?: string;
  hex?: string;
};

export type ManagedAssetIndex = {
  version: 2;
  assets: Record<string, AssetRecord>;
  keywords: Record<string, string[]>;
  generatedAt: string;
};

export type AssetMetadataPatch = Partial<
  Pick<
    AssetRecord,
    | "title"
    | "kind"
    | "tags"
    | "source"
    | "sourcePath"
    | "slots"
    | "area"
    | "type"
    | "variant"
    | "useWhen"
    | "aliases"
    | "categories"
    | "qlikCategory"
    | "license"
    | "hex"
  >
>;

export type WriteAssetInput = {
  path: string;
  content: Buffer;
  metadata?: AssetMetadataPatch;
};

export type AssetStoreOptions = {
  assetsRoot: string;
  qpsAssetsRoot?: string;
};

export type BrowseEntry = {
  name: string;
  kind: "folder" | "file";
  path: string;
  asset?: AssetRecord;
};

const INDEX_FILENAME = "index.json";
const GENERATED_CATALOG_PATHS = new Set([
  "icons.pack.json",
  "icons/catalog.json",
  "icons/_metadata.json",
  "products.pack.json",
  "products/_metadata.json",
  "art/manifest.json",
  "brands.pack.json",
  "brands/catalog.json",
  "brands/_metadata.json",
]);

const METADATA_IMPORT_PATHS = new Set([
  ".DS_Store",
  INDEX_FILENAME,
  ...GENERATED_CATALOG_PATHS,
  "brand_allowlist.json",
  "brands.supplement.json",
]);

const IMAGE_EXTS = new Set([".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const TEMPLATE_EXTS = new Set([".html", ".htm", ".docx", ".pptx", ".ppt", ".xlsx"]);

const norm = (value: string) => value.trim().toLowerCase();

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values.map(norm).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );

const uniquePreserve = (values: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    next.push(value);
  }
  return next;
};

export const normalizeAssetPath = (input: unknown) => {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw || raw.includes("\u0000")) throw new Error("Invalid asset path");
  const cleaned = raw.replaceAll("\\", "/");
  if (cleaned.startsWith("/")) throw new Error("Invalid asset path");
  const parts = cleaned.split("/");
  if (parts.some((part) => part === "..")) throw new Error("Invalid asset path");
  const normalized = path.posix.normalize(cleaned);
  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    throw new Error("Invalid asset path");
  }
  return normalized;
};

export const normalizeFolderPath = (input: unknown) => {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  return normalizeAssetPath(raw);
};

const assetUrl = (assetPath: string) => `/asset-files?path=${encodeURIComponent(assetPath)}`;

const titleFromPath = (assetPath: string) => {
  const parsed = path.posix.parse(assetPath);
  return parsed.name || parsed.base || assetPath;
};

export const detectContentType = (assetPath: string) => {
  const ext = path.posix.extname(assetPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json") return "application/json";
  if (ext === ".md") return "text/markdown";
  if (ext === ".txt") return "text/plain";
  if (ext === ".html" || ext === ".htm") return "text/html";
  if (ext === ".css") return "text/css";
  if (ext === ".js") return "text/javascript";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
};

const inferKind = (assetPath: string, metadata?: AssetMetadataPatch): AssetKind => {
  if (metadata?.kind) return metadata.kind;
  const parts = assetPath.split("/");
  if (parts[0] === "icons" && parts.length >= 3 && assetPath.endsWith(".svg")) return "icon";
  if (parts[0] === "products") return "product";
  if (parts[0] === "art") return "brand-art";
  if (parts[0] === "brands" && assetPath.endsWith(".svg")) return "brand";
  const ext = path.posix.extname(assetPath).toLowerCase();
  if (TEMPLATE_EXTS.has(ext) || parts[0] === "templates") return "template";
  if (IMAGE_EXTS.has(ext)) return "image";
  return "file";
};

const safeAbsPath = (root: string, rel: string) => {
  const normalizedRoot = path.posix.normalize(root).replace(/\/+$/, "");
  const abs = path.posix.normalize(path.posix.join(normalizedRoot, rel));
  if (abs !== normalizedRoot && !abs.startsWith(`${normalizedRoot}/`)) {
    throw new Error("Invalid asset path");
  }
  return abs;
};

const pathExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const writeJsonAtomic = async (targetPath: string, value: unknown) => {
  await fs.mkdir(path.posix.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, targetPath);
};

const writeFileAtomic = async (targetPath: string, value: Buffer) => {
  await fs.mkdir(path.posix.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, value);
  await fs.rename(tmp, targetPath);
};

const keywordsForAsset = (asset: AssetRecord) => {
  const pathTokens = asset.path.match(/[a-z0-9]+/gi) ?? [];
  const titleTokens = asset.title.match(/[a-z0-9]+/gi) ?? [];
  return uniqueSorted([
    asset.kind,
    ...asset.tags,
    ...pathTokens,
    ...titleTokens,
    ...(asset.slots ?? []),
    asset.area ?? "",
    asset.type ?? "",
    asset.variant ?? "",
    ...(asset.aliases ?? []),
    ...(asset.categories ?? []),
    asset.qlikCategory ?? "",
  ]);
};

const rebuildKeywords = (assets: Record<string, AssetRecord>) => {
  const keywords: Record<string, string[]> = {};
  for (const asset of Object.values(assets)) {
    for (const keyword of keywordsForAsset(asset)) {
      const list = keywords[keyword] ?? [];
      if (!list.includes(asset.path)) list.push(asset.path);
      keywords[keyword] = list;
    }
  }
  for (const keyword of Object.keys(keywords)) {
    keywords[keyword].sort((left, right) => left.localeCompare(right));
  }
  return keywords;
};

const emptyIndex = (): ManagedAssetIndex => ({
  version: 2,
  assets: {},
  keywords: {},
  generatedAt: new Date().toISOString(),
});

const toRecord = (
  assetPath: string,
  stat: { size: number; mtimeMs: number },
  metadata: AssetMetadataPatch = {},
): AssetRecord => {
  const safePath = normalizeAssetPath(assetPath);
  return {
    path: safePath,
    filename: path.posix.basename(safePath),
    title: metadata.title?.trim() || titleFromPath(safePath),
    kind: inferKind(safePath, metadata),
    tags: uniqueSorted(metadata.tags ?? []),
    keywords: uniqueSorted(metadata.tags ?? []),
    mime: detectContentType(safePath),
    source: metadata.source ?? "upload",
    sourcePath: metadata.sourcePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    url: assetUrl(safePath),
    slots: metadata.slots ? uniquePreserve(metadata.slots) : undefined,
    area: metadata.area?.trim() || undefined,
    type: metadata.type?.trim() || undefined,
    variant: metadata.variant?.trim() || undefined,
    useWhen: metadata.useWhen?.trim() || undefined,
    aliases: metadata.aliases ? uniquePreserve(metadata.aliases) : undefined,
    categories: metadata.categories ? uniquePreserve(metadata.categories) : undefined,
    qlikCategory: metadata.qlikCategory?.trim() || undefined,
    license: metadata.license?.trim() || undefined,
    hex: metadata.hex?.trim() || undefined,
  };
};

const stableRecord = (asset: AssetRecord): AssetRecord => ({
  ...asset,
  tags: uniqueSorted(asset.tags),
  keywords: uniqueSorted(asset.tags),
  slots: asset.slots && asset.slots.length > 0 ? uniquePreserve(asset.slots) : undefined,
  aliases: asset.aliases && asset.aliases.length > 0 ? uniquePreserve(asset.aliases) : undefined,
  categories:
    asset.categories && asset.categories.length > 0 ? uniquePreserve(asset.categories) : undefined,
});

const generatedIndex = (assets: Record<string, AssetRecord>): ManagedAssetIndex => ({
  version: 2,
  assets: Object.fromEntries(
    Object.entries(assets)
      .map(([assetPath, asset]) => [assetPath, stableRecord(asset)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  ),
  keywords: rebuildKeywords(assets),
  generatedAt: new Date().toISOString(),
});

const readJsonIfExists = async <T>(targetPath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const catalogPathSkipped = (assetPath: string) =>
  METADATA_IMPORT_PATHS.has(assetPath) ||
  assetPath.split("/").some((part) => part === ".DS_Store" || part === ".unpacked");

const iconCatalogIdentity = (asset: AssetRecord) => {
  const parts = asset.path.split("/");
  const slug = path.posix.basename(asset.filename, path.posix.extname(asset.filename));
  if (parts[0] === "icons" && parts.length >= 3) {
    return { category: parts[1] || "managed", slug };
  }
  return { category: parts.length > 1 ? parts[0] : "managed", slug };
};

export const createAssetStore = ({ assetsRoot, qpsAssetsRoot }: AssetStoreOptions) => {
  const indexPath = path.posix.join(assetsRoot, INDEX_FILENAME);

  const ensureRoot = async () => {
    await fs.mkdir(assetsRoot, { recursive: true });
  };

  const readIndex = async (): Promise<ManagedAssetIndex> => {
    await ensureRoot();
    const raw = await readJsonIfExists<any>(indexPath, null);
    if (!raw) return emptyIndex();

    if (raw.version === 2 && raw.assets && typeof raw.assets === "object") {
      return generatedIndex(raw.assets as Record<string, AssetRecord>);
    }

    if (raw.keywords && typeof raw.keywords === "object") {
      const tagsByAsset = new Map<string, string[]>();
      for (const [keyword, files] of Object.entries(raw.keywords as Record<string, unknown>)) {
        if (!Array.isArray(files)) continue;
        for (const file of files) {
          if (typeof file !== "string") continue;
          const assetPath = normalizeAssetPath(file);
          tagsByAsset.set(assetPath, [...(tagsByAsset.get(assetPath) ?? []), keyword]);
        }
      }

      const assets: Record<string, AssetRecord> = {};
      for (const [assetPath, tags] of tagsByAsset.entries()) {
        const abs = safeAbsPath(assetsRoot, assetPath);
        const stat = await fs.stat(abs);
        assets[assetPath] = toRecord(assetPath, stat, {
          tags,
          source: "legacy",
        });
      }
      return generatedIndex(assets);
    }

    return emptyIndex();
  };

  const writeIndex = async (assets: Record<string, AssetRecord>) => {
    const next = generatedIndex(assets);
    await writeJsonAtomic(indexPath, next);
    return next;
  };

  const regenerateCompatibilityCatalogs = async (index: ManagedAssetIndex) => {
    const assets = Object.values(index.assets).sort((left, right) =>
      left.path.localeCompare(right.path),
    );

    const icons = assets
      .filter((asset) => asset.kind === "icon")
      .map((asset) => {
        const { category, slug } = iconCatalogIdentity(asset);
        return {
          category,
          path: asset.path,
          slug,
          tags: asset.tags,
          source_file: asset.sourcePath ? path.posix.basename(asset.sourcePath) : asset.filename,
        };
      });

    await writeJsonAtomic(path.posix.join(assetsRoot, "icons.pack.json"), {
      format: "managed-icons-pack/1",
      total: icons.length,
      catalog: {
        generated_by: "mcp-assets",
        total: icons.length,
        categories: Array.from(new Set(icons.map((icon) => icon.category))).sort(),
        icons,
      },
    });
    await writeJsonAtomic(path.posix.join(assetsRoot, "icons", "catalog.json"), {
      generated_by: "mcp-assets",
      total: icons.length,
      icons,
    });
    await writeJsonAtomic(
      path.posix.join(assetsRoot, "icons", "_metadata.json"),
      Object.fromEntries(
        icons.map((icon) => [
          icon.path.startsWith("icons/") ? icon.path.replace(/^icons\//, "") : icon.path,
          { tags: icon.tags, source_file: icon.source_file, path: icon.path },
        ]),
      ),
    );

    const products = Object.fromEntries(
      assets
        .filter((asset) => asset.kind === "product")
        .map((asset) => {
          const relUnderProducts = asset.path.replace(/^products\//, "");
          const key = `../../shared/assets/products/${relUnderProducts}`;
          return [
            key,
            {
              area: asset.area ?? "managed",
              type: asset.type ?? (IMAGE_EXTS.has(path.posix.extname(asset.path)) ? "image" : "file"),
              tags: asset.tags,
              variant: asset.variant ?? asset.title,
              use_when: asset.useWhen ?? `Managed asset: ${asset.title}`,
            },
          ] as const;
        }),
    );
    await writeJsonAtomic(path.posix.join(assetsRoot, "products.pack.json"), {
      format: "managed-product-image-pack/1",
      total: Object.keys(products).length,
      catalog: { areas: ["managed"], asset_types: Array.from(new Set(Object.values(products).map((p) => p.type))).sort() },
      files: products,
    });
    await writeJsonAtomic(path.posix.join(assetsRoot, "products", "_metadata.json"), products);

    const artFiles = Object.fromEntries(
      assets
        .filter((asset) => asset.kind === "brand-art")
        .map((asset) => [
          asset.path.replace(/^art\//, ""),
          { slot: asset.slots ?? [], tags: asset.tags },
        ]),
    );
    await writeJsonAtomic(path.posix.join(assetsRoot, "art", "manifest.json"), {
      format: "managed-art-manifest/1",
      files: artFiles,
    });

    const brandAssets = assets.filter((asset) => asset.kind === "brand");
    const brandFiles = Object.fromEntries(
      brandAssets.map((asset) => {
        const slug = path.posix.basename(asset.filename, path.posix.extname(asset.filename));
        return [
          slug,
          {
            title: asset.title,
            tags: asset.tags,
            aliases: asset.aliases ?? [],
            categories: asset.categories ?? [],
            qlik_category: asset.qlikCategory ?? null,
            license: asset.license ?? null,
            hex: asset.hex ?? null,
          },
        ];
      }),
    );
    await writeJsonAtomic(path.posix.join(assetsRoot, "brands.pack.json"), {
      format: "managed-brands-pack/1",
      source: "mcp-assets",
      total: brandAssets.length,
      files: brandFiles,
    });
    await writeJsonAtomic(path.posix.join(assetsRoot, "brands", "_metadata.json"), brandFiles);
    await writeJsonAtomic(path.posix.join(assetsRoot, "brands", "catalog.json"), {
      items: brandFiles,
    });
  };

  const persist = async (assets: Record<string, AssetRecord>) => {
    const next = await writeIndex(assets);
    await regenerateCompatibilityCatalogs(next);
    return next;
  };

  const syncIndex = async () => {
    const index = await readIndex();
    return persist(index.assets);
  };

  const writeAsset = async (input: WriteAssetInput) => {
    const assetPath = normalizeAssetPath(input.path);
    if (GENERATED_CATALOG_PATHS.has(assetPath) || assetPath === INDEX_FILENAME) {
      throw new Error("Cannot write generated asset catalog");
    }
    const abs = safeAbsPath(assetsRoot, assetPath);
    await writeFileAtomic(abs, input.content);
    const stat = await fs.stat(abs);
    const index = await readIndex();
    const record = toRecord(assetPath, stat, input.metadata);
    const next = await persist({ ...index.assets, [assetPath]: record });
    return next.assets[assetPath];
  };

  const updateMetadata = async (inputPath: string, patch: AssetMetadataPatch) => {
    const assetPath = normalizeAssetPath(inputPath);
    const abs = safeAbsPath(assetsRoot, assetPath);
    const stat = await fs.stat(abs);
    const index = await readIndex();
    const existing = index.assets[assetPath] ?? toRecord(assetPath, stat);
    const nextRecord = stableRecord({
      ...existing,
      ...patch,
      path: assetPath,
      filename: path.posix.basename(assetPath),
      title: patch.title?.trim() || existing.title,
      kind: patch.kind ?? existing.kind,
      tags: patch.tags ? uniqueSorted(patch.tags) : existing.tags,
      mime: detectContentType(assetPath),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      url: assetUrl(assetPath),
    });
    const next = await persist({ ...index.assets, [assetPath]: nextRecord });
    return next.assets[assetPath];
  };

  const deleteAsset = async (inputPath: string) => {
    const assetPath = normalizeAssetPath(inputPath);
    if (GENERATED_CATALOG_PATHS.has(assetPath) || assetPath === INDEX_FILENAME) {
      throw new Error("Cannot delete generated asset catalog");
    }
    const abs = safeAbsPath(assetsRoot, assetPath);
    await fs.unlink(abs);
    const index = await readIndex();
    const assets = { ...index.assets };
    delete assets[assetPath];
    await persist(assets);
    return { ok: true, path: assetPath };
  };

  const listAssets = async (options: { keyword?: string; path?: string } = {}) => {
    const index = await readIndex();
    const folderPath = normalizeFolderPath(options.path);
    const keyword = options.keyword?.trim().toLowerCase() ?? "";
    let rows = Object.values(index.assets);
    if (folderPath) {
      rows = rows.filter((asset) => asset.path === folderPath || asset.path.startsWith(`${folderPath}/`));
    }
    if (keyword) {
      const direct = new Set(index.keywords[keyword] ?? []);
      rows = rows.filter(
        (asset) =>
          direct.has(asset.path) ||
          asset.path.toLowerCase().includes(keyword) ||
          asset.title.toLowerCase().includes(keyword) ||
          asset.tags.some((tag) => tag.includes(keyword)),
      );
    }
    return rows.sort((left, right) => left.path.localeCompare(right.path));
  };

  const browse = async (inputPath: unknown = "") => {
    await ensureRoot();
    const folderPath = normalizeFolderPath(inputPath);
    const abs = safeAbsPath(assetsRoot, folderPath);
    const index = await readIndex();
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const visibleEntries: BrowseEntry[] = entries
      .filter((entry) => {
        const rel = folderPath ? `${folderPath}/${entry.name}` : entry.name;
        return entry.name !== INDEX_FILENAME && !GENERATED_CATALOG_PATHS.has(rel);
      })
      .map((entry) => {
        const rel = folderPath ? `${folderPath}/${entry.name}` : entry.name;
        const kind: BrowseEntry["kind"] = entry.isDirectory() ? "folder" : "file";
        return {
          name: entry.name,
          kind,
          path: rel,
          asset: entry.isDirectory() ? undefined : index.assets[rel],
        };
      })
      .sort((left, right) =>
        left.kind === right.kind
          ? left.name.localeCompare(right.name)
          : left.kind === "folder"
            ? -1
            : 1,
      );
    return { path: folderPath, entries: visibleEntries };
  };

  const readFile = async (inputPath: string) => {
    const assetPath = normalizeAssetPath(inputPath);
    const abs = safeAbsPath(assetsRoot, assetPath);
    return {
      path: assetPath,
      contentType: detectContentType(assetPath),
      buffer: await fs.readFile(abs),
    };
  };

  const qpsMetadata = async () => {
    if (!qpsAssetsRoot) return new Map<string, AssetMetadataPatch>();
    const result = new Map<string, AssetMetadataPatch>();

    const iconsPack = await readJsonIfExists<any>(path.posix.join(qpsAssetsRoot, "icons.pack.json"), {});
    for (const icon of iconsPack?.catalog?.icons ?? []) {
      if (!icon?.category || !icon?.slug) continue;
      const assetPath = `icons/${icon.category}/${icon.slug}.svg`;
      result.set(assetPath, {
        kind: "icon",
        tags: Array.isArray(icon.tags) ? icon.tags : [],
        source: "qps-import",
        sourcePath: assetPath,
      });
    }

    const productsPack = await readJsonIfExists<any>(path.posix.join(qpsAssetsRoot, "products.pack.json"), {});
    for (const [key, meta] of Object.entries<any>(productsPack?.files ?? {})) {
      const rel = key.replace(/^(\.\.\/)+shared\/assets\/products\//, "");
      if (!rel || rel === key) continue;
      const assetPath = `products/${rel}`;
      result.set(assetPath, {
        kind: "product",
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        source: "qps-import",
        sourcePath: assetPath,
        area: typeof meta.area === "string" ? meta.area : undefined,
        type: typeof meta.type === "string" ? meta.type : undefined,
        variant: typeof meta.variant === "string" ? meta.variant : undefined,
        useWhen: typeof meta.use_when === "string" ? meta.use_when : undefined,
      });
    }

    const artManifest = await readJsonIfExists<any>(path.posix.join(qpsAssetsRoot, "art", "manifest.json"), {});
    for (const [file, meta] of Object.entries<any>(artManifest?.files ?? {})) {
      result.set(`art/${file}`, {
        kind: "brand-art",
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        slots: Array.isArray(meta.slot) ? meta.slot : [],
        source: "qps-import",
        sourcePath: `art/${file}`,
      });
    }

    const brandsMetadata = await readJsonIfExists<Record<string, any>>(
      path.posix.join(qpsAssetsRoot, "brands", "_metadata.json"),
      {},
    );
    for (const [slug, meta] of Object.entries(brandsMetadata)) {
      result.set(`brands/${slug}.svg`, {
        kind: "brand",
        title: typeof meta.title === "string" ? meta.title : slug,
        tags: [
          ...(Array.isArray(meta.categories) ? meta.categories : []),
          ...(Array.isArray(meta.aliases) ? meta.aliases : []),
          typeof meta.qlik_category === "string" ? meta.qlik_category : "",
        ],
        aliases: Array.isArray(meta.aliases) ? meta.aliases : [],
        categories: Array.isArray(meta.categories) ? meta.categories : [],
        qlikCategory: typeof meta.qlik_category === "string" ? meta.qlik_category : undefined,
        license: typeof meta.license === "string" ? meta.license : undefined,
        hex: typeof meta.hex === "string" ? meta.hex : undefined,
        source: "qps-import",
        sourcePath: `brands/${slug}.svg`,
      });
    }

    return result;
  };

  const walkFiles = async (root: string, dir = ""): Promise<string[]> => {
    const abs = path.posix.join(root, dir);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (catalogPathSkipped(rel)) continue;
      if (entry.isDirectory()) {
        files.push(...(await walkFiles(root, rel)));
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
    return files;
  };

  const importQpsAssets = async () => {
    if (!qpsAssetsRoot) throw new Error("QPS assets root is not configured");
    if (!(await pathExists(qpsAssetsRoot))) throw new Error("QPS assets root is not configured");
    await ensureRoot();
    const sourceMetadata = await qpsMetadata();
    const files = await walkFiles(qpsAssetsRoot);
    const index = await readIndex();
    const assets = { ...index.assets };
    let imported = 0;
    let skipped = 0;

    for (const rel of files) {
      const assetPath = normalizeAssetPath(rel);
      const destination = safeAbsPath(assetsRoot, assetPath);
      if (await pathExists(destination)) {
        skipped += 1;
        continue;
      }
      await fs.mkdir(path.posix.dirname(destination), { recursive: true });
      await fs.copyFile(path.posix.join(qpsAssetsRoot, assetPath), destination);
      const stat = await fs.stat(destination);
      const metadata = sourceMetadata.get(assetPath) ?? {
        source: "qps-import" as const,
        sourcePath: assetPath,
      };
      assets[assetPath] = toRecord(assetPath, stat, {
        ...metadata,
        source: "qps-import",
        sourcePath: metadata.sourcePath ?? assetPath,
      });
      imported += 1;
    }

    await persist(assets);
    return { imported, skipped, total: files.length };
  };

  const searchAssets = async (keyword: string) => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return [];
    const index = await readIndex();
    return index.keywords[normalized] ?? [];
  };

  return {
    browse,
    deleteAsset,
    importQpsAssets,
    listAssets,
    readFile,
    readIndex,
    regenerateCompatibilityCatalogs,
    searchAssets,
    syncIndex,
    updateMetadata,
    writeAsset,
  };
};
