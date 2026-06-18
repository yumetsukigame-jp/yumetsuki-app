export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export async function GET() {
  try {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: "rewards/" });

    const webpFiles = files.filter((file) =>
      file.name.toLowerCase().endsWith(".webp")
    );

    const urls = await Promise.all(
      webpFiles.map(async (file) => {
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: "03-01-2030",
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
