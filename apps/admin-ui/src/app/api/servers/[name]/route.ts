import { NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function PATCH(request: Request, context: { params: Promise<{ name: string }> }) {
  const { controlApiUrl } = getServerEnv();
  const { name } = await context.params;
  const payload = await request.text();
  const response = await fetch(`${controlApiUrl}/servers/${encodeURIComponent(name)}`, {
    method: "PATCH",
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
