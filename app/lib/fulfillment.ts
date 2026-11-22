import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import type { NanikaTier } from "@/functions/src/nanikaGachaTypes";

type FulfillmentResult = { requestId: string; points: number; nanikaTier?: NanikaTier | null };
export function fulfillmentCompletePath(result: FulfillmentResult) {
  return result.nanikaTier ? "/nanika-gacha/right-complete" : "/reward/complete";
}
export const redeemReward = httpsCallable<{
  rewardId: string; requestId: string; cost: number; participantUid: string; confirmed: true; nanikaTier?: NanikaTier | null;
}, FulfillmentResult>(functions, "redeemReward");
export const claimGachaShipping = httpsCallable<{
  resultId: string; choice: "shipping" | "points"; participantUid: string; confirmed: true;
}, FulfillmentResult>(functions, "claimGachaShipping");
