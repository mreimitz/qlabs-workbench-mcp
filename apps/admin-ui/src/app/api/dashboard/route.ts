import { NextResponse } from "next/server";
import { getServerEnv } from "../../lib/server-env";

const getJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
};

export async function GET() {
  try {
    const { controlApiUrl, storageApiUrl, assetsApiUrl } = getServerEnv();
    const [dashboard, storageHealth, rootBrowse, assets] = await Promise.all([
      getJson(`${controlApiUrl}/dashboard`),
      getJson(`${storageApiUrl}/health`),
      getJson(`${storageApiUrl}/browse?path=`),
      getJson(`${assetsApiUrl}/assets`),
    ]);

    return NextResponse.json({
      dashboard,
      storageHealth,
      rootBrowse,
      assets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load dashboard",
      },
      { status: 500 }
    );
  }
}
