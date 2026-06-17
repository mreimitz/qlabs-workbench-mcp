import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function GET(request: NextRequest) {
  const { storageApiUrl } = getServerEnv();
  const path = request.nextUrl.searchParams.get("path") ?? "";
  const response = await fetch(`${storageApiUrl}/browse?path=${encodeURIComponent(path)}`, {
    cache: "no-store",
  });
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
