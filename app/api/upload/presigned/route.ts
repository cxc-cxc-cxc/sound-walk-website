export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// This endpoint is no longer used — uploads go through /api/upload/local
export async function POST() {
  return NextResponse.json({ error: "Use /api/upload/local instead" }, { status: 410 });
}
