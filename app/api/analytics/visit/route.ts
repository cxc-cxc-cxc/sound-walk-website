export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = body?.sessionId;
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    const userAgent = body?.userAgent ?? "";
    const referrer = body?.referrer ?? "";

    // Only log one visit per session per hour to avoid spam
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentVisit = await prisma.siteVisit.findFirst({
      where: {
        sessionId,
        visitedAt: { gte: oneHourAgo },
      },
    });

    if (!recentVisit) {
      await prisma.siteVisit.create({
        data: { sessionId, userAgent, referrer },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to log visit:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
