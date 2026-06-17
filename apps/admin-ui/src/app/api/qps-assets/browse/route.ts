import { NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function GET(request: Request) {
  const { qpsToolkitApiUrl } = getServerEnv();
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") ?? "";
  const response = await fetch(`${qpsToolkitApiUrl}/assets/browse?path=${encodeURIComponent(targetPath)}`, {
    cache: "no-store",
  });
  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(body, { status: response.status, headers: { "content-type": contentType } });
}

