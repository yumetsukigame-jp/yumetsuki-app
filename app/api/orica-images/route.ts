export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";

export async function GET() {
  try {
    // プロジェクトルートを基準に public/orica を参照
    const oricaDir = path.join(process.cwd(), "public", "orica");

    const files = fs.readdirSync(oricaDir);

    const images = files
      .filter((f) => f.match(/\.(png|jpg|jpeg|webp)$/i))
      .map((f) => `/orica/${f}`);

    return Response.json(images);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
