export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const locations = await prisma.soundLocation.findMany({
      orderBy: { orderIndex: "asc" },
    });
    return NextResponse.json(locations ?? []);
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
