import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { createHash } from "node:crypto";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();

function fail(message: string, code: functions.https.FunctionsErrorCode = "failed-precondition"): never {
  throw new functions.https.HttpsError(code, message);
}
function input(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("入力形式が不正です", "invalid-argument");
  const data = raw as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key))) fail("指定できない入力項目があります", "invalid-argument");
  return data;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail("IDが不正です", "invalid-argument");
  return value;
}
function amount(value: unknown, label: string): number {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) fail(`${label}を確認してください`);
  return number;
}
function callable(name: string, handler: (data: unknown, uid: string) => Promise<unknown>) {
  return functions.region("us-east1").https.onCall(async (data, context) => {
    if (!context.auth?.uid) fail("ログインしてください", "unauthenticated");
    try { return await handler(data, context.auth.uid); }
    catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      console.error("発送依頼のサーバー処理に失敗しました", { name, error });
      throw new functions.https.HttpsError("internal", "受付状況を確認できませんでした。同じ操作を再試行してください");
    }
  });
}
function recipient(user: FirebaseFirestore.DocumentSnapshot) {
  return {
    userName: user.get("name") ?? "", userEmail: user.get("email") ?? "",
    userX: user.get("xAccount") ?? "", userNickname: user.get("displayName") ?? "",
    xAccountConfirmed: user.get("xAccountConfirmed") ?? false,
  };
}
export function gachaShippingImage(thumbnail: unknown): string {
  if (typeof thumbnail !== "string" || !thumbnail.trim()) return "/rewards/gacha.webp";
  const value = thumbnail.trim();
  return /^https?:\/\//i.test(value) || value.startsWith("/") ? value : `/gacha/${value}`;
}

export const redeemReward = callable("redeemReward", async (raw, uid) => {
  const data = input(raw, ["rewardId", "requestId", "cost", "participantUid", "confirmed"]);
  if (data.participantUid !== uid) fail("ログインアカウントが変更されました", "aborted");
  if (data.confirmed !== true) fail("発送の確認が必要です", "invalid-argument");
  const rewardId = id(data.rewardId), requestId = id(data.requestId);
  const expectedCost = amount(data.cost, "表示価格");
  const receiptId = `reward_${createHash("sha256").update(`${uid}\0${requestId}`).digest("hex")}`;
  return db.runTransaction(async tx => {
    const receiptRef = db.collection("rewardRedemptions").doc(receiptId);
    const userRef = db.collection("users").doc(uid), rewardRef = db.collection("rewards").doc(rewardId);
    const [previous, user, reward] = await Promise.all([tx.get(receiptRef), tx.get(userRef), tx.get(rewardRef)]);
    if (!user.exists) fail("アカウント情報がありません");
    const balance = amount(user.get("points"), "残高");
    if (previous.exists) {
      if (previous.get("uid") !== uid || previous.get("rewardId") !== rewardId) fail("リクエストIDが使用済みです", "already-exists");
      return { requestId: receiptId, points: balance };
    }
    if (!reward.exists) fail("商品が見つかりません", "not-found");
    const cost = amount(reward.get("cost"), "商品価格"), stock = amount(reward.get("stock"), "商品在庫");
    if (cost !== expectedCost) fail("商品価格が変更されました。一覧を再読込して確認してください");
    if (stock < 1) fail("在庫がありません");
    if (balance < cost) fail("ポイントが足りません");
    const now = Timestamp.now();
    const record = {
      requestId: receiptId, uid, rewardId, name: reward.get("name"), cost, image: reward.get("image") ?? null,
      requestedAt: now, timestamp: now, status: "pending", shipped: false, ...recipient(user),
    };
    tx.update(userRef, { points: balance - cost });
    tx.update(rewardRef, { stock: stock - 1 });
    tx.create(db.collection("shippingPending").doc(receiptId), record);
    tx.create(db.collection("selectedRewards").doc(receiptId), record);
    tx.create(receiptRef, { uid, rewardId, cost, createdAt: now });
    return { requestId: receiptId, points: balance - cost };
  });
});

export const claimGachaShipping = callable("claimGachaShipping", async (raw, uid) => {
  const data = input(raw, ["resultId", "choice", "participantUid", "confirmed"]);
  if (data.participantUid !== uid) fail("ログインアカウントが変更されました", "aborted");
  if (data.confirmed !== true || (data.choice !== "shipping" && data.choice !== "points")) fail("受取方法を確認してください", "invalid-argument");
  const resultId = id(data.resultId), choice = data.choice;
  return db.runTransaction(async tx => {
    const claimRef = db.collection("gachaShippingClaims").doc(resultId), userRef = db.collection("users").doc(uid);
    const [claim, user] = await Promise.all([tx.get(claimRef), tx.get(userRef)]);
    if (!claim.exists) fail("この抽選結果の発送情報がありません", "not-found");
    if (claim.get("uid") !== uid) fail("本人の抽選結果のみ選択できます", "permission-denied");
    if (!user.exists) fail("アカウント情報がありません");
    const balance = amount(user.get("points"), "残高"), requestId = `gacha_${resultId}`;
    if (claim.get("choice") !== "pending") {
      if (claim.get("choice") !== choice) fail("別の方法で確定済みです", "already-exists");
      return { requestId, points: balance };
    }
    const now = Timestamp.now();
    if (choice === "shipping") {
      if (claim.get("shippingEnabled") !== true) fail("発送を選択できない当選結果です");
      const cost = amount(claim.get("reward"), "当選報酬");
      if (balance < cost) fail("当選報酬分のポイントが不足しています");
      const record = {
        requestId, uid, rewardId: requestId, name: `${claim.get("frame")}（ガチャ）`,
        cost, image: claim.get("image"), timestamp: now, requestedAt: now,
        status: "pending", shipped: false, ...recipient(user),
      };
      tx.update(userRef, { points: balance - cost });
      tx.create(db.collection("shippingPending").doc(requestId), record);
      tx.create(db.collection("selectedRewards").doc(requestId), record);
    }
    tx.update(claimRef, { choice, decidedAt: now });
    return { requestId, points: choice === "shipping" ? balance - amount(claim.get("reward"), "当選報酬") : balance };
  });
});
