export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function GET() {
  try {
    const locations = await prisma.soundLocation.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json(locations ?? [], {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (err: any) {
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const location = await prisma.soundLocation.create({
      data: {
        name: body?.name ?? "New Location",
        description: body?.description ?? "",
        latitude: body?.latitude ?? 0,
        longitude: body?.longitude ?? 0,
        audioUrl: body?.audioUrl ?? null,
        audioCloudPath: body?.audioCloudPath ?? null,
        audioIsPublic: body?.audioIsPublic ?? true,
        imageUrl: body?.imageUrl ?? null,
        imageCloudPath: body?.imageCloudPath ?? null,
        imageIsPublic: body?.imageIsPublic ?? true,
        proximityRadius: body?.proximityRadius ?? 50,
        orderIndex: body?.orderIndex ?? 0,
        isActive: body?.isActive ?? true,
      },
    });
    return NextResponse.json(location);
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
