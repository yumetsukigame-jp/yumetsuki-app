export const runtime = "nodejs-compat";
export const dynamic = "force-dynamic";

import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp({
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export async function GET() {
  try {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: "rewards/" });

    // WebP のみ
    const webpFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith(".webp")
    );

    // ダウンロードURLを取得
    const urls = await Promise.all(
      webpFiles.map(async (file) => {
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: "03-01-2030", // 長期でOK
        });
        return url;
      })
    );

    return Response.json(urls);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
