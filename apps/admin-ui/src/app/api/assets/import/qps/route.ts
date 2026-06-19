import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../lib/server-env";

export async function POST() {
  const { assetsApiUrl } = getServerEnv();
  const response = await fetch(`${assetsApiUrl}/assets/import/qps`, {
    method: "POST",
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
