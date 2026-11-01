import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    console.warn("何かの景品ガチャ画像IDの形式が不正です");
    return new Response("Invalid image ID", { status: 400 });
  }
  try {
    if (!getApps().length) initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    const db = getFirestore();
    const image = await db.collection("nanikaGachaImages").doc(id).get();
    if (!image.exists) return new Response("Image not found", { status: 404 });
    let buffer: unknown = image.get("thumbnail");
    if (new URL(request.url).searchParams.get("size") === "full" && image.get("largeBytes") > 0) {
      const full = await db.collection("nanikaGachaImageData").doc(id).get();
      if (!full.exists) throw new Error("Full image data is missing");
      buffer = full.get("data");
    }
    if (!Buffer.isBuffer(buffer)) throw new Error("Invalid stored image");
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("何かの景品ガチャ画像取得に失敗しました", error);
    return new Response("Image unavailable", { status: 500 });
  }
}
