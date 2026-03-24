export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const location = await prisma.soundLocation.findUnique({ where: { id: params?.id } });
    if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(location);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const data: any = {};
    const fields = [
      "name", "description", "latitude", "longitude",
      "audioUrl", "audioCloudPath", "audioIsPublic",
      "imageUrl", "imageCloudPath", "imageIsPublic",
      "proximityRadius", "orderIndex", "isActive",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    const location = await prisma.soundLocation.update({
      where: { id: params?.id },
      data,
    });
    return NextResponse.json(location);
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await prisma.soundLocation.delete({ where: { id: params?.id } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
