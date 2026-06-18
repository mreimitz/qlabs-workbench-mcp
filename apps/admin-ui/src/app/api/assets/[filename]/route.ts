import { NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { assetsApiUrl } = getServerEnv();
  const { filename } = await params;
  const response = await fetch(
    `${assetsApiUrl}/assets/${encodeURIComponent(filename)}`,
    {
      method: "DELETE",
      cache: "no-store",
    },
  );
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
