import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "../../lib/server-env";

export async function GET(request: NextRequest) {
  const { assetsApiUrl } = getServerEnv();
  const keyword = request.nextUrl.searchParams.get("keyword") ?? "";
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const response = await fetch(
    `${assetsApiUrl}/assets?keyword=${encodeURIComponent(keyword)}&path=${encodeURIComponent(path)}`,
    { cache: "no-store" },
  );
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request) {
  const { assetsApiUrl } = getServerEnv();
  const payload = await request.text();
  const response = await fetch(`${assetsApiUrl}/assets`, {
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

export async function DELETE(request: NextRequest) {
  const { assetsApiUrl } = getServerEnv();
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const response = await fetch(`${assetsApiUrl}/assets?path=${encodeURIComponent(path)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
