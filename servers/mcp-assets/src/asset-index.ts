export type AssetIndex = { keywords: Record<string, string[]> };

export const removeAssetFromIndex = (
  index: AssetIndex,
  filename: string,
): AssetIndex => {
  const keywords: Record<string, string[]> = Object.fromEntries(
    Object.entries(index.keywords)
      .map(([keyword, files]) => [
        keyword,
        files.filter((entry) => entry !== filename),
      ] as const)
      .filter(([, files]) => files.length > 0),
  );

  return { keywords };
};
