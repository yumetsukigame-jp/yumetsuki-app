import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

type FulfillmentResult = { requestId: string; points: number };
export const redeemReward = httpsCallable<{
  rewardId: string; requestId: string; cost: number; participantUid: string; confirmed: true;
}, FulfillmentResult>(functions, "redeemReward");
export const claimGachaShipping = httpsCallable<{
  resultId: string; choice: "shipping" | "points"; participantUid: string; confirmed: true;
}, FulfillmentResult>(functions, "claimGachaShipping");
