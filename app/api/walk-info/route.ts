export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function GET() {
  try {
    const info = await prisma.soundWalkInfo.findFirst();
    return NextResponse.json(info ?? {
      title: "Sound Walk", description: "", aboutText: "", instructions: "",
      artistName: "", year: "", city: "", credits: "",
      accentColor: "#14b8a6", backgroundColor: "#030712", fontFamily: "system", fontScale: 1.0,
      mapCenterLat: 0, mapCenterLng: 0, mapZoom: 15, mapStyle: "dark",
      defaultProximityRadius: 50, audioFadeDuration: 2.0, audioBaseVolume: 0.8,
      showWelcomePage: true, welcomeTitle: "", welcomeSubtitle: "", welcomeImageUrl: "",
      welcomeImageCloudPath: "", welcomeImageIsPublic: true,
    });
  } catch {
    return NextResponse.json({ title: "Sound Walk", description: "", aboutText: "", instructions: "" });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const existing = await prisma.soundWalkInfo.findFirst();
    
    const data: any = {};
    const fields = [
      "title", "description", "aboutText", "instructions",
      "artistName", "year", "city", "credits",
      "accentColor", "backgroundColor", "fontFamily", "fontScale",
      "mapCenterLat", "mapCenterLng", "mapZoom", "mapStyle",
      "defaultProximityRadius", "audioFadeDuration", "audioBaseVolume",
      "showWelcomePage", "welcomeTitle", "welcomeSubtitle", "welcomeImageUrl",
      "welcomeImageCloudPath", "welcomeImageIsPublic",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }

    let info;
    if (existing) {
      info = await prisma.soundWalkInfo.update({ where: { id: existing.id }, data });
    } else {
      info = await prisma.soundWalkInfo.create({
        data: {
          title: body?.title ?? "Sound Walk",
          description: body?.description ?? "",
          aboutText: body?.aboutText ?? "",
          instructions: body?.instructions ?? "",
          ...data,
        },
      });
    }
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
