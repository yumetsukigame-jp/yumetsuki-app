export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export async function GET() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Next.js 16 の API 実行位置から public まで戻る
    const rewardsDir = path.join(__dirname, "../../../../../public/rewards");

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
