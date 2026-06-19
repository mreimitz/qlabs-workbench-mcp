import type { AssetRecord } from "./types";

export type AssetFolderNode = {
  id: string;
  label: string;
  children?: AssetFolderNode[];
};

type AssetPathLike = Pick<AssetRecord, "path">;
type AssetTagsLike = Partial<Pick<AssetRecord, "tags" | "keywords">>;

const ROOT_FOLDER_ID = "/";

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

export const folderIdToPath = (id: string) => (id === ROOT_FOLDER_ID ? "" : id);

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

export const buildAssetFolderTree = (assets: AssetPathLike[]): AssetFolderNode[] => {
  const root: AssetFolderNode = { id: ROOT_FOLDER_ID, label: ROOT_FOLDER_ID };

  for (const asset of assets) {
    const parts = asset.path.split("/");
    let parent = root;
    for (let index = 1; index < parts.length; index += 1) {
      const id = parts.slice(0, index).join("/");
      parent = ensureChild(parent, id, parts[index - 1]);
    }
  }

  return [root];
};
