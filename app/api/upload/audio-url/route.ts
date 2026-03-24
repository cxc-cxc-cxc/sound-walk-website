export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Audio files are now served directly from /audio/ folder
// This endpoint is kept for backward compatibility
export async function POST(req: Request) {
  try {
    const { cloud_storage_path, audioUrl } = await req.json();
    // If it's already a local URL, return it directly
    const url = audioUrl || cloud_storage_path || "";
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Failed to get URL" }, { status: 500 });
  }
}
