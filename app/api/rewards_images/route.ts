export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export async function GET() {
  // route.ts の絶対パスを取得
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // public/rewards への絶対パスを構築
  const rewardsDir = path.join(__dirname, "../../../public/rewards");

  const files = fs.readdirSync(rewardsDir);

  const images = files.filter((f) =>
    f.match(/\.(png|jpg|jpeg|gif|webp)$/i)
  );

  return Response.json(images);
}
