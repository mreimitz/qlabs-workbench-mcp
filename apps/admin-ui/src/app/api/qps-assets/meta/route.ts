import { NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function GET(request: Request) {
  const { qpsToolkitApiUrl } = getServerEnv();
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") ?? "";
  const response = await fetch(`${qpsToolkitApiUrl}/assets/meta?path=${encodeURIComponent(targetPath)}`, {
    cache: "no-store",
  });
  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(body, { status: response.status, headers: { "content-type": contentType } });
}

export async function PUT(request: Request) {
  const { qpsToolkitApiUrl } = getServerEnv();
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") ?? "";
  const payload = await request.json();
  const response = await fetch(`${qpsToolkitApiUrl}/assets/meta?path=${encodeURIComponent(targetPath)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(body, { status: response.status, headers: { "content-type": contentType } });
}

