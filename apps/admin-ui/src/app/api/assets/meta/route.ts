import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function PUT(request: NextRequest) {
  const { assetsApiUrl } = getServerEnv();
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const payload = await request.text();
  const response = await fetch(`${assetsApiUrl}/assets/meta?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
