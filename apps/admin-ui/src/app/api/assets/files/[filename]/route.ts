import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../lib/server-env";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { assetsApiUrl } = getServerEnv();
  const { filename } = await context.params;
  const response = await fetch(`${assetsApiUrl}/asset-files/${encodeURIComponent(filename)}`, {
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": contentType },
  });
}
