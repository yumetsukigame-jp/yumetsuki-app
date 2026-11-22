import * as functions from "firebase-functions/v1";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { isNanikaTier } from "./nanikaGachaPolicy";
import type { NanikaTier } from "./nanikaGachaTypes";

export function rewardNanikaTier(value: unknown): NanikaTier | null {
  if (value === undefined || value === null) return null;
  if (!isNanikaTier(value)) {
    throw new functions.https.HttpsError("failed-precondition", "景品ガチャ権利の種類が不正です");
  }
  return value;
}

export function nanikaRightCount(snapshot: FirebaseFirestore.DocumentSnapshot | null, tier: NanikaTier): number {
  const count: unknown = snapshot?.get(tier) ?? 0;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new functions.https.HttpsError("failed-precondition", "景品ガチャ権利の残り回数を確認してください");
  }
  return count;
}

export async function grantNanikaRightPlan(tx: FirebaseFirestore.Transaction, uid: string, tier: NanikaTier) {
  const ref = getFirestore().collection("nanikaGachaRights").doc(uid);
  const snapshot = await tx.get(ref);
  const next = nanikaRightCount(snapshot, tier) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new functions.https.HttpsError("failed-precondition", "景品ガチャ権利の回数が上限に達しています");
  }
  return () => tx.set(ref, { uid, [tier]: next, updatedAt: Timestamp.now() }, { merge: true });
}
