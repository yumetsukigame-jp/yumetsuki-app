export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

// ★ Admin SDK 初期化（まだなら）
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET, 
  // 例: "point-app-1f854.appspot.com"
});

const bucket = getStorage().bucket();

export async function GET() {
  try {
    // ★ Storage の orica フォルダを取得
    const [files] = await bucket.getFiles({ prefix: "orica/" });

    // ★ 画像だけ抽出してダウンロードURLに変換
    const images: string[] = [];

    for (const file of files) {
      if (!file.name.match(/\.(png|jpg|jpeg|webp)$/i)) continue;

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2099-12-31",
      });

      images.push(url);
    }

    return Response.json(images);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
