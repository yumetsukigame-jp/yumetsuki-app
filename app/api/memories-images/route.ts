export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "memories");

    const files = fs.readdirSync(dir);

    const images = files
      .filter((f) => f.match(/\.(png|jpg|jpeg|webp)$/i))
      .map((f) => `/memories/${f}`);

    return Response.json(images);
  } catch (error) {
    console.error("API Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
