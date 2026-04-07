import { NextResponse } from "next/server";
import { getBuildInfo } from "@/lib/build-info";

export async function GET() {
  return NextResponse.json(
    {
      build: getBuildInfo(),
      checkedAt: new Date().toISOString(),
      status: "ok",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
