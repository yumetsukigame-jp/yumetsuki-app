import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { NANIKA_TIERS, type NanikaPage, type NanikaPrize, type NanikaTier } from "../../functions/src/nanikaGachaTypes";

export class NanikaCatalogRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function parseNanikaCatalogQuery(params: URLSearchParams): { tier: NanikaTier; cursor?: string } {
  const tier = NANIKA_TIERS.find(item => item.id === params.get("tier"))?.id;
  if (!tier) throw new NanikaCatalogRequestError("景品のカテゴリーが不正です。", 400);
  const cursor = params.get("cursor");
  if (cursor !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) {
    throw new NanikaCatalogRequestError("続きの景品の指定が不正です。", 400);
  }
  return { tier, ...(cursor ? { cursor } : {}) };
}

export async function listNanikaPrizeCatalog(
  db: Firestore,
  { tier, cursor }: { tier: NanikaTier; cursor?: string },
): Promise<NanikaPage<NanikaPrize>> {
  const images = db.collection("nanikaGachaImages");
  let query = images.where("tier", "==", tier).where("state", "==", "ready")
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    const previous = await images.doc(cursor).get();
    if (!previous.exists || previous.get("tier") !== tier) {
      throw new NanikaCatalogRequestError("続きの景品が見つかりません。もう一度一覧を取得してください。", 404);
    }
    query = query.startAfter(previous);
  }
  const snapshot = await query.select("name").limit(51).get();
  return {
    items: snapshot.docs.slice(0, 50).map(image => ({
      id: image.id, tier, name: image.get("name"), image: `/api/nanika-gacha/images/${image.id}`,
    })),
    nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null,
  };
}
