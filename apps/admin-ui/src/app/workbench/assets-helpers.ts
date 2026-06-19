import type { AssetRecord } from "./types";

export type AssetFolderNode = {
  id: string;
  label: string;
  children?: AssetFolderNode[];
};

type AssetPathLike = Pick<AssetRecord, "path">;
type AssetTagsLike = Partial<Pick<AssetRecord, "tags" | "keywords">>;

const ROOT_FOLDER_ID = "/";
const TEMPLATE_ROOT_PATH = "templates";

export const IMAGE_LIBRARY_NODE_ID = "library:images";
export const TEMPLATE_LIBRARY_NODE_ID = "library:templates";

const TEMPLATE_FOLDER_NODES: AssetFolderNode[] = [
  { id: "templates/markdown", label: "Markdown" },
  {
    id: "templates/office",
    label: "Office",
    children: [
      { id: "templates/office/word", label: "Word" },
      { id: "templates/office/powerpoint", label: "PowerPoint" },
    ],
  },
  { id: "templates/web", label: "Web" },
];

const TEMPLATE_PATH_LABELS = new Map<string, string>([
  ["templates", "Templates"],
  ["templates/markdown", "Markdown"],
  ["templates/office", "Office"],
  ["templates/office/word", "Word"],
  ["templates/office/powerpoint", "PowerPoint"],
  ["templates/web", "Web"],
]);

const normTag = (value: string) => value.trim().toLowerCase();

export const splitAssetTags = (value: string) =>
  Array.from(new Set(value.split(",").map(normTag).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );

export const assetTags = (asset: AssetTagsLike) => asset.tags ?? asset.keywords ?? [];

export const joinAssetPath = (folder: string, filename: string) => {
  const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
  return cleanFolder ? `${cleanFolder}/${filename}` : filename;
};

const cleanAssetPath = (value: string) => value.replace(/^\/+|\/+$/g, "");

const isTemplatePath = (value: string) => {
  const clean = cleanAssetPath(value);
  return clean === TEMPLATE_ROOT_PATH || clean.startsWith(`${TEMPLATE_ROOT_PATH}/`);
};

export const folderIdToPath = (id: string) => {
  if (id === ROOT_FOLDER_ID || id === IMAGE_LIBRARY_NODE_ID) return "";
  if (id === TEMPLATE_LIBRARY_NODE_ID) return TEMPLATE_ROOT_PATH;
  return id;
};

export const pathToFolderId = (folderPath: string) => {
  const clean = cleanAssetPath(folderPath);
  if (!clean) return IMAGE_LIBRARY_NODE_ID;
  if (clean === TEMPLATE_ROOT_PATH) return TEMPLATE_LIBRARY_NODE_ID;
  return clean;
};

export const formatAssetFolderPath = (folderPath: string) => {
  const clean = cleanAssetPath(folderPath);
  if (!clean) return "Images";
  if (!isTemplatePath(clean)) return `Images/${clean}`;

  if (clean === TEMPLATE_ROOT_PATH) return "Templates";

  const parts = clean.split("/");
  const labels = ["Templates"];
  for (let index = 1; index < parts.length; index += 1) {
    const pathPart = parts.slice(0, index + 1).join("/");
    labels.push(TEMPLATE_PATH_LABELS.get(pathPart) ?? parts[index]);
  }
  return labels.join("/");
};

const ensureChild = (node: AssetFolderNode, id: string, label: string) => {
  const children = node.children ?? [];
  const existing = children.find((child) => child.id === id);
  if (existing) return existing;

  const next: AssetFolderNode = { id, label };
  children.push(next);
  children.sort((left, right) => left.id.localeCompare(right.id));
  node.children = children;
  return next;
};

const cloneFolderNode = (node: AssetFolderNode): AssetFolderNode => ({
  id: node.id,
  label: node.label,
  children: node.children?.map(cloneFolderNode),
});

const addFolderPath = (root: AssetFolderNode, parts: string[], startIndex: number) => {
  let parent = root;
  for (let index = startIndex; index < parts.length; index += 1) {
    const id = parts.slice(0, index).join("/");
    parent = ensureChild(parent, id, TEMPLATE_PATH_LABELS.get(id) ?? parts[index - 1]);
  }
};

export const buildAssetFolderTree = (assets: AssetPathLike[]): AssetFolderNode[] => {
  const imagesRoot: AssetFolderNode = { id: IMAGE_LIBRARY_NODE_ID, label: "Images" };
  const templatesRoot: AssetFolderNode = {
    id: TEMPLATE_LIBRARY_NODE_ID,
    label: "Templates",
    children: TEMPLATE_FOLDER_NODES.map(cloneFolderNode),
  };

  for (const asset of assets) {
    const clean = cleanAssetPath(asset.path);
    if (!clean) continue;

    const parts = clean.split("/");
    if (isTemplatePath(clean)) {
      addFolderPath(templatesRoot, parts, 2);
    } else {
      addFolderPath(imagesRoot, parts, 1);
    }
  }

  return [imagesRoot, templatesRoot];
};
