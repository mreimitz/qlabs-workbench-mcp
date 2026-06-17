import { NextResponse } from "next/server";
import { getServerEnv } from "../../../../lib/server-env";

export async function POST(request: Request, context: { params: Promise<{ filename: string }> }) {
  const { assetsApiUrl } = getServerEnv();
  const { filename } = await context.params;
  const payload = await request.text();
  const response = await fetch(`${assetsApiUrl}/assets/${encodeURIComponent(filename)}/tags`, {
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
