import { NextResponse } from "next/server";
import { getServerEnv } from "../../lib/server-env";

export async function GET() {
  const { controlApiUrl } = getServerEnv();
  const response = await fetch(`${controlApiUrl}/runs`, { cache: "no-store" });
  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request) {
  const { controlApiUrl } = getServerEnv();
  const payload = await request.text();
  const response = await fetch(`${controlApiUrl}/runs`, {
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
