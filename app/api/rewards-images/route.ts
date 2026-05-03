export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export async function GET() {
  try {
    // route.ts の絶対パスを取得
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // public/rewards への絶対パスを構築
    const rewardsDir = path.join(__dirname, "../../../../public/rewards");

    // デバッグ用（本番でパス確認）
    console.log("rewardsDir:", rewardsDir);

    const files = fs.readdirSync(rewardsDir);

    const images = files.filter((f) =>
      f.match(/\.(png|jpg|jpeg|gif|webp)$/i)
    );

    return Response.json(images);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
