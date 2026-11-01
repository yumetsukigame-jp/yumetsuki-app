import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { FieldPath, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { createHash, randomInt } from "node:crypto";
import { NANIKA_HOLD_MS, NANIKA_TIERS, type NanikaTier } from "./nanikaGachaTypes";
import { isNanikaTier, nanikaDecision, nanikaTerms, nanikaXMatches } from "./nanikaGachaPolicy";
import { compressNanikaImage, NANIKA_IMAGE_LIMITS } from "./nanikaGachaImages";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();
const slots = db.collection("nanikaGachaSlots");
const rounds = db.collection("nanikaGachaRounds");
const archives = db.collection("nanikaGachaArchives");
const images = db.collection("nanikaGachaImages");
const receipts = db.collection("nanikaGachaReceipts");
const pending = db.collection("nanikaGachaPending");
const inventory = db.collection("nanikaGachaInventory");
const imageData = db.collection("nanikaGachaImageData");
const history = db.collection("nanikaGachaHistory");
const POOL_SIZE = 100;
type Tx = FirebaseFirestore.Transaction;
type Snap = FirebaseFirestore.DocumentSnapshot;
type Data = FirebaseFirestore.DocumentData;

function fail(message: string, code: functions.https.FunctionsErrorCode = "failed-precondition"): never {
  throw new functions.https.HttpsError(code, message);
}
function object(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("入力形式が不正です", "invalid-argument");
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key))) fail("指定できない入力項目があります", "invalid-argument");
  return data;
}
function integer(raw: unknown, label: string, max = 1000000): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > max) fail(`${label}は0〜${max}の整数で指定してください`, "invalid-argument");
  return raw;
}
function text(raw: unknown, label: string, max = 200): string {
  if (typeof raw !== "string" || !raw.trim() || raw.length > max || /[<>]/.test(raw)) fail(`${label}を正しく入力してください`, "invalid-argument");
  return raw.trim();
}
function identifier(raw: unknown, max = 250): string {
  if (typeof raw !== "string" || !/^[a-zA-Z0-9_-]+$/.test(raw) || raw.length > max) fail("IDが不正です", "invalid-argument");
  return raw;
}
function tier(raw: unknown): NanikaTier {
  if (!isNanikaTier(raw)) fail("種類が不正です", "invalid-argument");
  return raw;
}
function user(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) fail("ログインしてください", "unauthenticated");
  return context.auth.uid;
}
async function administrator(context: functions.https.CallableContext) {
  const uid = user(context);
  if (!(await db.collection("admins").doc(uid).get()).exists) fail("管理者のみ実行できます", "permission-denied");
  return uid;
}
function callable(name: string, handler: (raw: unknown, context: functions.https.CallableContext) => Promise<unknown>) {
  return functions.region("us-east1").runWith({ timeoutSeconds: 120, memory: "512MB" }).https.onCall(async (raw, context) => {
    try { return await handler(raw, context); }
    catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      console.error("何かの景品ガチャAPIエラー", { name, error });
      throw new functions.https.HttpsError("internal", "処理を確認できませんでした。履歴を確認してから再試行してください");
    }
  });
}
function count(snapshot: Snap): number {
  return snapshot.exists ? integer(snapshot.get("available"), "在庫数", Number.MAX_SAFE_INTEGER) : 0;
}
function pool(t: NanikaTier, index: number) {
  return inventory.doc(t).collection("pages").doc(String(Math.floor(index / POOL_SIZE)));
}
async function appendPlan(tx: Tx, t: NanikaTier, n: number) {
  const ref = pool(t, n), snapshot = await tx.get(ref);
  const ids: string[] = snapshot.exists ? snapshot.get("ids") : [];
  if (!Array.isArray(ids) || ids.length !== n % POOL_SIZE) fail("画像在庫に不整合があります");
  return (imageId: string) => tx.set(ref, { ids: [...ids, imageId] });
}
async function removePlan(tx: Tx, t: NanikaTier, n: number, index: number) {
  if (n < 1 || index < 0 || index >= n) fail("画像在庫に不整合があります");
  const firstRef = pool(t, index), lastRef = pool(t, n - 1);
  const [first, last] = await Promise.all([tx.get(firstRef), tx.get(lastRef)]);
  const firstIds: string[] = first.get("ids"), lastIds: string[] = last.get("ids");
  if (!Array.isArray(firstIds) || !Array.isArray(lastIds) || lastIds.length !== (n - 1) % POOL_SIZE + 1) fail("画像在庫に不整合があります");
  const selectedId = firstIds[index % POOL_SIZE], lastId = lastIds[(n - 1) % POOL_SIZE];
  if (!selectedId || !lastId) fail("画像在庫に不整合があります");
  const [selected, moved] = await Promise.all([tx.get(images.doc(selectedId)), tx.get(images.doc(lastId))]);
  if (!selected.exists || selected.get("state") !== "ready" || selected.get("poolIndex") !== index ||
      !moved.exists || moved.get("state") !== "ready" || moved.get("poolIndex") !== n - 1) fail("画像在庫に不整合があります");
  return { selected, apply: () => {
    if (firstRef.path === lastRef.path) {
      const ids = [...firstIds]; ids[index % POOL_SIZE] = lastId; ids.pop();
      tx.set(firstRef, { ids });
    } else {
      const ids = [...firstIds]; ids[index % POOL_SIZE] = lastId;
      tx.set(firstRef, { ids }); tx.set(lastRef, { ids: lastIds.slice(0, -1) });
    }
    if (selectedId !== lastId) tx.update(moved.ref, { poolIndex: index });
    tx.update(inventory.doc(t), { available: n - 1 });
  } };
}
function receiptView(snapshot: Snap) {
  const d = snapshot.data()!;
  return {
    id: snapshot.id, tier: d.tier, roundId: d.roundId, imageId: d.imageId, name: d.name,
    image: `/api/nanika-gacha/images/${d.imageId}`, fee: d.fee, exchangePoints: d.exchangePoints,
    acceptedAt: d.acceptedAt.toMillis(), deadline: d.deadline.toMillis(), choice: d.choice,
    automatic: d.automatic ?? false,
  };
}
function entryRef(d: Data, id: string) {
  return (d.archived ? archives : rounds).doc(d.roundId).collection("entries").doc(id);
}
async function slotViews(adminMode: boolean, uid?: string) {
  return Promise.all(NANIKA_TIERS.map(async t => {
    const [slot, stock, account] = await Promise.all([
      slots.doc(t.id).get(), inventory.doc(t.id).get(),
      uid ? db.collection("users").doc(uid).get() : Promise.resolve(null),
    ]);
    const d = slot.data();
    const xAccounts: string[] = d?.xAccounts ?? [];
    return {
      tier: t.id, fee: d?.fee ?? null, exchangePoints: d?.exchangePoints ?? null,
      visible: d?.visible ?? false, version: d?.version ?? 0, roundId: d?.roundId ?? null,
      available: count(stock), remainingUses: uid ? xAccounts.filter(line => nanikaXMatches(line, account?.get("xAccount") ?? "")).length : 0,
      ...(adminMode ? { xAccounts } : {}),
    };
  }));
}

export const listNanikaGacha = callable("listNanikaGacha", async (raw, context) => {
  object(raw, []);
  return { items: await slotViews(false, context.auth?.uid), serverNow: Date.now() };
});
export const listNanikaGachaPrizes = callable("listNanikaGachaPrizes", async raw => {
  const d = object(raw, ["tier", "cursor"]), t = tier(d.tier);
  const slot = await slots.doc(t).get();
  if (slot.get("visible") !== true) fail("現在公開中の企画ではありません", "not-found");
  let query = images.where("tier", "==", t).where("state", "==", "ready")
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (d.cursor !== undefined) {
    const previous = await images.doc(identifier(d.cursor, 100)).get();
    if (!previous.exists || previous.get("tier") !== t) fail("続きの景品がありません");
    query = query.startAfter(previous);
  }
  const snapshot = await query.select("name").limit(51).get();
  return {
    items: snapshot.docs.slice(0, 50).map(image => ({
      id: image.id, tier: t, name: image.get("name"), image: `/api/nanika-gacha/images/${image.id}`,
    })),
    nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null,
  };
});
export const adminGetNanikaGacha = callable("adminGetNanikaGacha", async (raw, context) => {
  await administrator(context); object(raw, []);
  return { items: await slotViews(true), serverNow: Date.now() };
});
export const adminSaveNanikaGacha = callable("adminSaveNanikaGacha", async (raw, context) => {
  const uid = await administrator(context), d = object(raw, ["tier", "version", "fee", "exchangePoints", "visible", "xAccounts"]);
  const t = tier(d.tier), version = integer(d.version, "更新番号", Number.MAX_SAFE_INTEGER);
  const fee = integer(d.fee, "参加費用"), exchangePoints = integer(d.exchangePoints, "受取ポイント");
  if (typeof d.visible !== "boolean") fail("公開状態が不正です", "invalid-argument");
  if (!Array.isArray(d.xAccounts) || d.xAccounts.length > 5000) fail("対象X一覧は5000行以内にしてください", "invalid-argument");
  const xAccounts = d.xAccounts.map(line => text(line, "対象Xアカウント", 200));
  if (Buffer.byteLength(JSON.stringify(xAccounts), "utf8") > 700000) fail("対象X一覧の保存容量が上限を超えています。行の説明を短くしてください", "invalid-argument");
  if (xAccounts.some(line => !/@[a-zA-Z0-9_]{1,15}(?![a-zA-Z0-9_])/.test(line.replace(/＠/g, "@")))) fail("対象X一覧の各行に@アカウントを指定してください", "invalid-argument");
  const newRound = rounds.doc();
  await db.runTransaction(async tx => {
    const slot = await tx.get(slots.doc(t));
    if ((slot.get("version") ?? 0) !== version) fail("参加または設定更新がありました。再読込して変更をやり直してください", "aborted");
    const roundId = slot.get("roundId") ?? newRound.id;
    const values = { tier: t, fee, exchangePoints, visible: d.visible, xAccounts, roundId, version: version + 1 };
    tx.set(slots.doc(t), values);
    tx.set(rounds.doc(roundId), { ...values, state: "active", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(db.collection("nanikaGachaAudit").doc(), { actorUid: uid, operation: "save", tier: t, roundId, createdAt: FieldValue.serverTimestamp() });
  });
  return { items: await slotViews(true) };
});

export const drawNanikaGacha = callable("drawNanikaGacha", async (raw, context) => {
  const uid = user(context), d = object(raw, ["tier", "requestId", "fee", "exchangePoints", "roundId", "consent72h", "participantUid"]);
  if (d.participantUid !== uid) fail("ログインアカウントが変更されました。参加条件を確認し直してください", "aborted");
  const t = tier(d.tier), requestId = identifier(d.requestId, 100), requestedRound = identifier(d.roundId);
  if (d.consent72h !== true) fail("72時間後の自動ポイント化に明示的な同意が必要です", "invalid-argument");
  const receiptRef = receipts.doc(`nanika_gacha_${createHash("sha256").update(`${uid}\0${requestId}`).digest("hex")}`);
  await db.runTransaction(async tx => {
    const [existing, slot, account, stock] = await Promise.all([
      tx.get(receiptRef), tx.get(slots.doc(t)), tx.get(db.collection("users").doc(uid)), tx.get(inventory.doc(t)),
    ]);
    if (existing.exists) {
      if (existing.get("uid") !== uid || existing.get("tier") !== t) fail("リクエストIDが使用済みです", "already-exists");
      return;
    }
    if (!slot.exists || !slot.get("visible") || slot.get("roundId") !== requestedRound) fail("受付停止中、または開催回が変更されています");
    const fee = integer(slot.get("fee"), "参加費用"), exchangePoints = integer(slot.get("exchangePoints"), "受取ポイント");
    if (d.fee !== fee || d.exchangePoints !== exchangePoints) fail("金額設定が変更されました。最新の条件を再確認してください");
    if (!account.exists) fail("アカウント情報が見つかりません");
    const balance = integer(account.get("points"), "残高", Number.MAX_SAFE_INTEGER);
    if (balance < fee || !Number.isSafeInteger(balance - fee + exchangePoints)) fail("ポイント残高を確認してください");
    const xAccounts: string[] = slot.get("xAccounts");
    const match = xAccounts.findIndex(line => nanikaXMatches(line, account.get("xAccount") ?? ""));
    if (match < 0) fail("対象Xアカウントの参加枠がありません", "permission-denied");
    const n = count(stock);
    if (!n) fail("抽選できる景品がありません");
    const plan = await removePlan(tx, t, n, randomInt(n));
    const now = Date.now(), acceptedAt = Timestamp.fromMillis(now), deadline = Timestamp.fromMillis(now + NANIKA_HOLD_MS);
    const values = {
      uid, tier: t, roundId: requestedRound, imageId: plan.selected.id, name: plan.selected.get("name"),
      fee, exchangePoints, acceptedAt, deadline, choice: "pending", automatic: false, archived: false,
      consent: { ...nanikaTerms(fee, exchangePoints), acceptedAt, version: 1 },
    };
    plan.apply();
    tx.update(plan.selected.ref, { state: "reserved", reservedBy: receiptRef.id, poolIndex: FieldValue.delete() });
    tx.update(account.ref, { points: balance - fee, xAccountConfirmed: true });
    const remaining = xAccounts.filter((_, index) => index !== match);
    tx.update(slot.ref, { xAccounts: remaining, version: slot.get("version") + 1 });
    tx.update(rounds.doc(requestedRound), { xAccounts: remaining, version: slot.get("version") + 1 });
    tx.create(receiptRef, values);
    tx.create(entryRef(values, receiptRef.id), values);
    tx.create(history.doc(uid).collection("entries").doc(receiptRef.id), values);
    tx.create(pending.doc(receiptRef.id), { deadline });
    tx.create(db.collection("pointHistory").doc(`${receiptRef.id}_entry`), {
      source: "nanika-gacha", userId: uid, added: -fee, createdAt: acceptedAt,
    });
  }, { maxAttempts: 50 });
  return { receipt: receiptView(await receiptRef.get()), serverNow: Date.now() };
});

async function settle(id: string, owner: string | null, requested: "shipping" | "points", explicit: boolean) {
  const ref = receipts.doc(id);
  await db.runTransaction(async tx => {
    const receipt = await tx.get(ref);
    if (!receipt.exists) fail("当選記録がありません", "not-found");
    const d = receipt.data()!;
    if (owner && d.uid !== owner) fail("本人の当選品のみ選択できます", "permission-denied");
    if (d.choice !== "pending") {
      if (owner && d.choice !== requested && !d.automatic) fail("別の方法で確定済みです", "already-exists");
      return;
    }
    const now = Date.now(), decision = nanikaDecision(d.deadline.toMillis(), now, requested);
    if (!owner && !decision.automatic) return;
    if (owner && !decision.automatic && !explicit) fail("受取方法の最終確認が必要です", "invalid-argument");
    const [image, account, stock] = await Promise.all([
      tx.get(images.doc(d.imageId)), tx.get(db.collection("users").doc(d.uid)), tx.get(inventory.doc(d.tier)),
    ]);
    if (!image.exists || image.get("state") !== "reserved" || image.get("reservedBy") !== id) fail("景品の確保情報に不整合があります");
    if (!account.exists) fail("アカウント情報がありません");
    const n = count(stock);
    const append = decision.choice === "points" ? await appendPlan(tx, d.tier, n) : null;
    const result = { choice: decision.choice, automatic: decision.automatic, decidedAt: Timestamp.fromMillis(now) };
    if (decision.choice === "points") {
      const balance = integer(account.get("points"), "残高", Number.MAX_SAFE_INTEGER);
      if (!Number.isSafeInteger(balance + d.exchangePoints)) fail("ポイント残高が上限を超えます");
      append!(image.id);
      tx.update(image.ref, { state: "ready", poolIndex: n, reservedBy: FieldValue.delete() });
      tx.set(inventory.doc(d.tier), { available: n + 1 }, { merge: true });
      tx.update(account.ref, { points: balance + d.exchangePoints });
      tx.create(db.collection("pointHistory").doc(`${id}_points`), {
        source: "nanika-gacha", userId: d.uid, added: d.exchangePoints, automatic: decision.automatic,
        createdAt: result.decidedAt,
      });
    } else {
      const reward = {
        requestId: id, uid: d.uid, source: "nanika-gacha", rewardId: id, name: d.name, cost: d.exchangePoints,
        image: `/api/nanika-gacha/images/${d.imageId}`, nanikaImageId: d.imageId,
        timestamp: result.decidedAt, requestedAt: result.decidedAt, status: "pending", shipped: false,
        userName: account.get("name") ?? "", userEmail: account.get("email") ?? "",
        userX: account.get("xAccount") ?? "", userNickname: account.get("displayName") ?? "",
        xAccountConfirmed: account.get("xAccountConfirmed") ?? false,
      };
      tx.create(db.collection("shippingPending").doc(id), reward);
      tx.create(db.collection("selectedRewards").doc(id), reward);
      tx.update(image.ref, { state: "shipping", fulfillmentId: id, reservedBy: FieldValue.delete() });
    }
    tx.update(ref, result);
    tx.update(entryRef(d, id), result);
    tx.update(history.doc(d.uid).collection("entries").doc(id), result);
    tx.delete(pending.doc(id));
    tx.create(db.collection("nanikaGachaAudit").doc(), { operation: "settle", receiptId: id, actorUid: owner, ...result });
  }, { maxAttempts: 50 });
  return receiptView(await ref.get());
}
export const claimNanikaGacha = callable("claimNanikaGacha", async (raw, context) => {
  const uid = user(context), d = object(raw, ["id", "choice", "confirmed"]);
  if (d.choice !== "points" && d.choice !== "shipping") fail("受取方法が不正です", "invalid-argument");
  return { receipt: await settle(identifier(d.id), uid, d.choice, d.confirmed === true), serverNow: Date.now() };
});
export const settleExpiredNanikaGacha = functions.region("us-east1").runWith({ timeoutSeconds: 540 })
  .pubsub.schedule("every 5 minutes").timeZone("Asia/Tokyo").onRun(async () => {
    const due = await pending.where("deadline", "<=", Timestamp.now()).orderBy("deadline").limit(100).get();
    let failed = 0;
    for (const item of due.docs) {
      try { await settle(item.id, null, "points", false); }
      catch (error) { failed++; console.error("期限後の自動ポイント化に失敗しました", { receiptId: item.id, error }); }
    }
    if (failed) throw new Error(`${failed}件の自動ポイント化が未完了です`);
    return null;
  });
export const getNanikaGachaReceipt = callable("getNanikaGachaReceipt", async (raw, context) => {
  const uid = user(context), d = object(raw, ["id"]), id = identifier(d.id);
  const receipt = await receipts.doc(id).get();
  if (!receipt.exists) fail("当選記録がありません", "not-found");
  if (receipt.get("uid") !== uid) fail("本人の当選品のみ取得できます", "permission-denied");
  const result = receipt.get("choice") === "pending" && Date.now() >= receipt.get("deadline").toMillis()
    ? await settle(id, uid, "points", false) : receiptView(receipt);
  return { receipt: result, serverNow: Date.now() };
});

export const getNanikaGachaHistory = callable("getNanikaGachaHistory", async (raw, context) => {
  const uid = user(context), d = object(raw, ["cursor"]);
  let query = history.doc(uid).collection("entries").orderBy("acceptedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (d.cursor !== undefined) {
    const previous = await history.doc(uid).collection("entries").doc(identifier(d.cursor)).get();
    if (!previous.exists) fail("続きの記録がありません");
    query = query.startAfter(previous);
  }
  const snapshots = await query.limit(51).get();
  const items = [];
  for (const s of snapshots.docs.slice(0, 50)) {
    if (s.get("choice") === "pending" && Date.now() >= s.get("deadline").toMillis()) items.push(await settle(s.id, uid, "points", false));
    else items.push(receiptView(s));
  }
  return { items, nextCursor: snapshots.size > 50 ? snapshots.docs[49].id : null, serverNow: Date.now() };
});

export const adminUploadNanikaImage = callable("adminUploadNanikaImage", async (raw, context) => {
  await administrator(context);
  const d = object(raw, ["tier", "id", "name", "base64"]), t = tier(d.tier), id = identifier(d.id, 100), name = text(d.name, "景品名");
  if (typeof d.base64 !== "string" || d.base64.length > Math.ceil(NANIKA_IMAGE_LIMITS.input / 3) * 4 ||
      !/^[a-zA-Z0-9+/]+={0,2}$/.test(d.base64)) fail("画像データが不正です", "invalid-argument");
  const original = Buffer.from(d.base64, "base64"), sourceHash = createHash("sha256").update(original).digest("hex");
  let encoded: Awaited<ReturnType<typeof compressNanikaImage>>;
  try { encoded = await compressNanikaImage(original); }
  catch (error) {
    console.warn("景品画像の形式または容量を確認できません", { error });
    fail(error instanceof Error ? error.message : "画像を処理できません", "invalid-argument");
  }
  await db.runTransaction(async tx => {
    const [previous, stock] = await Promise.all([tx.get(images.doc(id)), tx.get(inventory.doc(t))]);
    if (previous.exists) {
      if (previous.get("tier") !== t || previous.get("name") !== name || previous.get("sourceHash") !== sourceHash) fail("画像IDが使用済みです", "already-exists");
      return;
    }
    const n = count(stock), append = await appendPlan(tx, t, n);
    append(id);
    tx.set(inventory.doc(t), { available: n + 1 }, { merge: true });
    tx.create(images.doc(id), { tier: t, name, sourceHash, state: "ready", poolIndex: n, thumbnail: encoded.thumbnail,
      largeBytes: encoded.large.length, thumbnailBytes: encoded.thumbnail.length, createdAt: FieldValue.serverTimestamp() });
    tx.create(imageData.doc(id), { data: encoded.large });
  });
  return { id };
});
export const adminListNanikaImages = callable("adminListNanikaImages", async (raw, context) => {
  await administrator(context);
  const d = object(raw, ["tier", "past", "cursor"]), t = tier(d.tier);
  if (typeof d.past !== "boolean") fail("画像一覧の種別が不正です", "invalid-argument");
  let query = images.where("tier", "==", t).where("state", "in", d.past === true ? ["shipping", "removed"] : ["ready", "reserved"])
    .orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (d.cursor !== undefined) {
    const previous = await images.doc(identifier(d.cursor)).get();
    if (!previous.exists || previous.get("tier") !== t) fail("続きの画像がありません");
    query = query.startAfter(previous);
  }
  const snapshot = await query.limit(51).get();
  const items = await Promise.all(snapshot.docs.slice(0, 50).map(async image => {
    const fulfillment = image.get("fulfillmentId");
    const [done, unshipped] = fulfillment ? await Promise.all([
      db.collection("shippingDone").doc(fulfillment).get(), db.collection("shippingPending").doc(fulfillment).get(),
    ]) : [null, null];
    return { id: image.id, tier: t, name: image.get("name"), state: image.get("state"),
      image: `/api/nanika-gacha/images/${image.id}`, largeBytes: image.get("largeBytes"),
      thumbnailBytes: image.get("thumbnailBytes"),
      canPurge: image.get("state") === "removed" || Boolean(!unshipped?.exists && done?.exists && (done.get("shipped") === true || done.get("status") === "done")) };
  }));
  return { items, nextCursor: snapshot.size > 50 ? snapshot.docs[49].id : null };
});
export const adminRemoveNanikaImage = callable("adminRemoveNanikaImage", async (raw, context) => {
  await administrator(context); const d = object(raw, ["id"]), id = identifier(d.id);
  await db.runTransaction(async tx => {
    const image = await tx.get(images.doc(id));
    if (!image.exists) fail("画像がありません", "not-found");
    if (image.get("state") === "removed") return;
    if (image.get("state") !== "ready") fail("保留中・発送物の画像は削除できません");
    const t = tier(image.get("tier")), stock = await tx.get(inventory.doc(t));
    const plan = await removePlan(tx, t, count(stock), image.get("poolIndex"));
    if (plan.selected.id !== id) fail("画像在庫に不整合があります");
    plan.apply(); tx.update(image.ref, { state: "removed", poolIndex: FieldValue.delete() });
  });
  return { id };
});
export const adminPurgeNanikaImages = callable("adminPurgeNanikaImages", async (raw, context) => {
  const uid = await administrator(context), d = object(raw, ["ids", "confirmed"]);
  if (d.confirmed !== true || !Array.isArray(d.ids) || d.ids.length < 1 || d.ids.length > 30) fail("削除対象を1〜30件指定し確認してください", "invalid-argument");
  const ids = [...new Set(d.ids.map(value => identifier(value)))];
  await db.runTransaction(async tx => {
    const snapshots = await Promise.all(ids.map(id => tx.get(images.doc(id))));
    const done = await Promise.all(snapshots.map(image => image.get("fulfillmentId") ? tx.get(db.collection("shippingDone").doc(image.get("fulfillmentId"))) : Promise.resolve(null)));
    const unshipped = await Promise.all(snapshots.map(image => image.get("fulfillmentId") ? tx.get(db.collection("shippingPending").doc(image.get("fulfillmentId"))) : Promise.resolve(null)));
    snapshots.forEach((image, index) => {
      if (!image.exists || !(image.get("state") === "removed" ||
        (image.get("state") === "shipping" && !unshipped[index]?.exists && done[index]?.exists && (done[index]?.get("status") === "done" || done[index]?.get("shipped") === true)))) fail("未受取・発送処理中の画像は容量整理できません");
    });
    snapshots.forEach(image => { tx.delete(imageData.doc(image.id)); tx.update(image.ref, { largeBytes: 0 }); });
    tx.create(db.collection("nanikaGachaAudit").doc(), { operation: "purge", actorUid: uid, imageIds: ids, createdAt: FieldValue.serverTimestamp() });
  });
  return { count: ids.length };
});

async function archiveRound(roundId: string) {
  const source = rounds.doc(roundId), target = archives.doc(roundId);
  const archived = await target.get();
  if (archived.get("archiveComplete") === true) return;
  if (!archived.exists) fail("終了処理の記録がありません");
  while (true) {
    const page = await source.collection("entries").orderBy(FieldPath.documentId()).limit(40).get();
    if (page.empty) break;
    await db.runTransaction(async tx => {
      const current = await Promise.all(page.docs.map(item => tx.get(item.ref)));
      const locators = await Promise.all(current.filter(item => item.exists).map(item => tx.get(receipts.doc(item.id))));
      current.filter(item => item.exists).forEach((item, index) => {
        if (!locators[index].exists) fail("当選記録に不整合があります");
        tx.set(target.collection("entries").doc(item.id), { ...item.data(), archived: true });
        tx.update(receipts.doc(item.id), { archived: true });
        tx.update(history.doc(item.get("uid")).collection("entries").doc(item.id), { archived: true });
        tx.delete(item.ref);
      });
    });
  }
  await db.runTransaction(async tx => {
    const remaining = await tx.get(source.collection("entries").limit(1));
    if (!remaining.empty) fail("アーカイブ処理を再試行してください");
    tx.update(target, { archiveComplete: true }); tx.delete(source);
  });
}
export const adminEndNanikaGacha = callable("adminEndNanikaGacha", async (raw, context) => {
  const uid = await administrator(context), d = object(raw, ["tier", "roundId", "version", "confirmed"]);
  const t = tier(d.tier), roundId = identifier(d.roundId);
  if (d.confirmed !== true) fail("終了操作の確認が必要です", "invalid-argument");
  await db.runTransaction(async tx => {
    const [slot, round, archived] = await Promise.all([tx.get(slots.doc(t)), tx.get(rounds.doc(roundId)), tx.get(archives.doc(roundId))]);
    if (archived.exists) {
      if (archived.get("tier") !== t) fail("種類が一致しません");
      return;
    }
    if (!round.exists || slot.get("roundId") !== roundId || slot.get("version") !== d.version) fail("開催回または設定が更新されています。再読込してください", "aborted");
    const closedAt = Timestamp.now();
    tx.create(archives.doc(roundId), { ...round.data(), state: "closed", closedAt, archiveComplete: false });
    tx.update(round.ref, { state: "closed", closedAt });
    tx.update(slot.ref, { visible: false, roundId: null, xAccounts: [], version: slot.get("version") + 1 });
    tx.create(db.collection("nanikaGachaAudit").doc(), { operation: "end", actorUid: uid, roundId, createdAt: closedAt });
  });
  await archiveRound(roundId);
  return { items: await slotViews(true) };
});
export const finishNanikaGachaArchives = functions.region("us-east1").runWith({ timeoutSeconds: 540 })
  .pubsub.schedule("every 5 minutes").timeZone("Asia/Tokyo").onRun(async () => {
    const unfinished = await archives.where("archiveComplete", "==", false).limit(10).get();
    for (const round of unfinished.docs) await archiveRound(round.id);
    return null;
  });
export const adminListNanikaArchives = callable("adminListNanikaArchives", async (raw, context) => {
  await administrator(context); const d = object(raw, ["cursor"]);
  let query = archives.orderBy("closedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (d.cursor !== undefined) {
    const previous = await archives.doc(identifier(d.cursor)).get();
    if (!previous.exists) fail("続きの開催回がありません");
    query = query.startAfter(previous);
  }
  const page = await query.limit(21).get();
  return { items: page.docs.slice(0, 20).map(item => ({ id: item.id, tier: item.get("tier"), closedAt: item.get("closedAt").toMillis(), archiveComplete: item.get("archiveComplete") })),
    nextCursor: page.size > 20 ? page.docs[19].id : null };
});
export const adminListNanikaEntries = callable("adminListNanikaEntries", async (raw, context) => {
  await administrator(context); const d = object(raw, ["roundId", "cursor"]);
  const roundId = identifier(d.roundId), active = await rounds.doc(roundId).get();
  let parent = active.ref;
  if (!active.exists || active.get("state") !== "active") {
    const archived = await archives.doc(roundId).get();
    if (!archived.exists) fail("開催回がありません", "not-found");
    if (!archived.get("archiveComplete")) fail("アーカイブ移動中です。完了後に再取得してください", "unavailable");
    parent = archived.ref;
  }
  let query = parent.collection("entries").orderBy("acceptedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (d.cursor !== undefined) {
    const previous = await parent.collection("entries").doc(identifier(d.cursor)).get();
    if (!previous.exists) fail("続きの結果がありません");
    query = query.startAfter(previous);
  }
  const page = await query.limit(51).get();
  const checked = await parent.get();
  if (!checked.exists || (checked.get("state") !== "active" && checked.get("archiveComplete") !== true)) fail("開催記録を移動しています。再取得してください", "unavailable");
  return { items: page.docs.slice(0, 50).map(item => ({ ...receiptView(item), uid: item.get("uid") })),
    nextCursor: page.size > 50 ? page.docs[49].id : null };
});
