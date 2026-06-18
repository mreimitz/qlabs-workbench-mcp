import { NextResponse } from "next/server";
import { getServerEnv } from "../../../lib/server-env";

export async function GET(request: Request) {
  const { qpsToolkitApiUrl } = getServerEnv();
  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get("path") ?? "";
  try {
    const response = await fetch(`${qpsToolkitApiUrl}/assets/file?path=${encodeURIComponent(targetPath)}`, {
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": contentType },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "QPS toolkit file proxy failed",
      },
      { status: 502 },
    );
  }
}
