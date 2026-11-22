import { getNanikaImageDb } from "@/app/lib/nanikaGachaServer";
import { listNanikaPrizeCatalog, NanikaCatalogRequestError, parseNanikaCatalogQuery } from "@/app/lib/nanikaPrizeCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const query = parseNanikaCatalogQuery(new URL(request.url).searchParams);
    return Response.json(await listNanikaPrizeCatalog(getNanikaImageDb(), query), { headers });
  } catch (error) {
    if (error instanceof NanikaCatalogRequestError) {
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error("何かの景品ガチャの公開景品一覧取得に失敗しました", error);
    return Response.json({ error: "景品一覧を取得できませんでした。もう一度お試しください。" }, { status: 500, headers });
  }
}
