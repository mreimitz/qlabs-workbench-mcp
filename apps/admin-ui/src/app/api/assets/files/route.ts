import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function GET(request: NextRequest) {
  const { assetsApiUrl } = getServerEnv();
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const response = await fetch(`${assetsApiUrl}/asset-files?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": contentType },
  });
}
