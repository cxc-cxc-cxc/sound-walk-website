export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams?.get("sessionId");
    if (!sessionId) return NextResponse.json([]);
    const visits = await prisma.visitedLocation.findMany({
      where: { sessionId },
      select: { locationId: true, visitedAt: true },
    });
    return NextResponse.json(visits ?? []);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const { sessionId, locationId } = await req.json();
    if (!sessionId || !locationId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    const existing = await prisma.visitedLocation.findUnique({
      where: { sessionId_locationId: { sessionId, locationId } },
    });
    if (existing) return NextResponse.json(existing);
    const visit = await prisma.visitedLocation.create({
      data: { sessionId, locationId },
    });
    return NextResponse.json(visit);
  } catch (err: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
