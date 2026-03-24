export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, getBucketConfig } from "@/lib/aws-config";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as any)?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const fileType = formData.get("type") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const s3 = createS3Client();
    const { bucketName, folderPrefix } = getBucketConfig();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const folder = fileType === "image" ? "images" : "audio";
    const cloud_storage_path = `${folderPrefix}public/uploads/${folder}/${Date.now()}-${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: cloud_storage_path,
      Body: buffer,
      ContentType: file.type || (fileType === "audio" ? "audio/mpeg" : "image/jpeg"),
      ContentDisposition: "attachment",
    }));

    const region = process.env.AWS_REGION ?? "us-west-2";
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;

    return NextResponse.json({ url: publicUrl, cloud_storage_path, fileName: safeName });
  } catch (err: any) {
    console.error("Upload failed:", err);
    return NextResponse.json({ error: "Upload failed: " + (err?.message || "unknown") }, { status: 500 });
  }
}
