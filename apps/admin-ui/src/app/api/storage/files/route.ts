import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function POST(request: Request) {
  const { storageApiUrl } = getServerEnv();
  const payload = await request.text();
  const response = await fetch(`${storageApiUrl}/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

export async function GET(request: NextRequest) {
  const { storageApiUrl } = getServerEnv();
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const response = await fetch(`${storageApiUrl}/files?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const body = await response.arrayBuffer();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": contentType },
  });
}
