export const runtime = "nodejs";

import fs from "fs";
import path from "path";

export async function GET() {
  const rewardsDir = path.join(process.cwd(), "public", "rewards");
  const files = fs.readdirSync(rewardsDir);

  const images = files.filter((f) =>
    f.match(/\.(png|jpg|jpeg|gif|webp)$/i)
  );

  return Response.json(images);
}
