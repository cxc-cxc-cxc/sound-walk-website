export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

interface Visit {
  visitedAt: string | Date;
  sessionId: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total unique visitors (all time)
    const totalUniqueSessions = await prisma.siteVisit.findMany({
      distinct: ["sessionId"],
      select: { sessionId: true },
    });
    const totalVisitors = totalUniqueSessions.length;

    // Total visits (all time)
    const totalVisits = await prisma.siteVisit.count();

    // Today's unique visitors
    const todayUnique = await prisma.siteVisit.findMany({
      where: { visitedAt: { gte: today } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    });
    const todayVisitors = todayUnique.length;

    // Last 7 days unique
    const weekUnique = await prisma.siteVisit.findMany({
      where: { visitedAt: { gte: sevenDaysAgo } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    });
    const weekVisitors = weekUnique.length;

    // Daily visits for last 30 days
    const dailyVisits = await prisma.siteVisit.findMany({
      where: { visitedAt: { gte: thirtyDaysAgo } },
      select: { visitedAt: true, sessionId: true },
    });

    const dailyMap = new Map<string, Set<string>>();
    for (const v of dailyVisits) {
      const day = v.visitedAt.toISOString().split("T")[0];
      if (!dailyMap.has(day)) dailyMap.set(day, new Set());
      dailyMap.get(day)!.add(v.sessionId);
    }

    const dailyBreakdown: { date: string; visitors: number; visits: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split("T")[0];
      const sessions = dailyMap.get(key);
      dailyBreakdown.push({
        date: key,
        visitors: sessions?.size ?? 0,
        visits: dailyVisits.filter((v: Visit) => {
          const visitedAt = typeof v.visitedAt === "string" ? new Date(v.visitedAt) : v.visitedAt;
          return visitedAt.toISOString().split("T")[0] === key;
        }).length,
      });
    }

    // Location visit stats
    const locationVisits = await prisma.visitedLocation.groupBy({
      by: ["locationId"],
      _count: { id: true },
    });

    const allLocations = await prisma.soundLocation.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: "asc" },
      select: { id: true, name: true },
    });

    const locationStats = allLocations
      .map((loc) => {
        const found = locationVisits.find((lv) => lv.locationId === loc.id);
        return { name: loc.name, visits: found?._count?.id ?? 0 };
      })
      .sort((a, b) => b.visits - a.visits);

    // Completion stats: how many sessions completed all locations
    const totalLocCount = allLocations.length;
    const sessionLocationCounts = await prisma.visitedLocation.groupBy({
      by: ["sessionId"],
      _count: { locationId: true },
    });

    const totalWalkers = sessionLocationCounts.length;
    const completedWalkers = sessionLocationCounts.filter(
      (s) => (s._count?.locationId ?? 0) >= totalLocCount && totalLocCount > 0
    ).length;

    // Recent visits (last 20)
    const recentVisits = await prisma.siteVisit.findMany({
      orderBy: { visitedAt: "desc" },
      take: 20,
      select: { sessionId: true, userAgent: true, visitedAt: true, referrer: true },
    });

    // Active now (visited in the last 15 minutes)
    const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const activeNow = await prisma.siteVisit.findMany({
      where: { visitedAt: { gte: fifteenMinAgo } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    });

    return NextResponse.json({
      totalVisitors,
      totalVisits,
      todayVisitors,
      weekVisitors,
      dailyBreakdown,
      locationStats,
      totalWalkers,
      completedWalkers,
      completionRate: totalWalkers > 0 ? Math.round((completedWalkers / totalWalkers) * 100) : 0,
      recentVisits,
      activeNow: activeNow.length,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}