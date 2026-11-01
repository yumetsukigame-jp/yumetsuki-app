import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import type { NanikaImage, NanikaPage, NanikaPrize, NanikaReceipt, NanikaRound, NanikaSlot, NanikaTier } from "@/functions/src/nanikaGachaTypes";
export { NANIKA_TIERS, NANIKA_HOLD_MS } from "@/functions/src/nanikaGachaTypes";
export type { NanikaImage, NanikaPrize, NanikaReceipt, NanikaRound, NanikaSlot, NanikaTier };

type Api = {
  listNanikaGacha: [Record<string, never>, { items: NanikaSlot[]; serverNow: number }];
  listNanikaGachaPrizes: [{ tier: NanikaTier; cursor?: string }, NanikaPage<NanikaPrize>];
  adminGetNanikaGacha: [Record<string, never>, { items: NanikaSlot[] }];
  adminSaveNanikaGacha: [{ tier: NanikaTier; version: number; fee: number; exchangePoints: number; visible: boolean; xAccounts: string[] }, { items: NanikaSlot[] }];
  drawNanikaGacha: [{ tier: NanikaTier; requestId: string; roundId: string; fee: number; exchangePoints: number; consent72h: true; participantUid: string }, { receipt: NanikaReceipt; serverNow: number }];
  claimNanikaGacha: [{ id: string; choice: "points" | "shipping"; confirmed: true }, { receipt: NanikaReceipt; serverNow: number }];
  getNanikaGachaReceipt: [{ id: string }, { receipt: NanikaReceipt; serverNow: number }];
  getNanikaGachaHistory: [{ cursor?: string }, NanikaPage<NanikaReceipt> & { serverNow: number }];
  adminUploadNanikaImage: [{ tier: NanikaTier; id: string; name: string; base64: string }, { id: string }];
  adminListNanikaImages: [{ tier: NanikaTier; past: boolean; cursor?: string }, NanikaPage<NanikaImage>];
  adminRemoveNanikaImage: [{ id: string }, { id: string }];
  adminMoveNanikaImage: [{ id: string; fromTier: NanikaTier; tier: NanikaTier; confirmed: true }, { id: string; tier: NanikaTier }];
  adminPurgeNanikaImages: [{ ids: string[]; confirmed: true }, { count: number }];
  adminEndNanikaGacha: [{ tier: NanikaTier; roundId: string; version: number; confirmed: true }, { items: NanikaSlot[] }];
  adminListNanikaArchives: [{ cursor?: string }, NanikaPage<NanikaRound>];
  adminListNanikaEntries: [{ roundId: string; cursor?: string }, NanikaPage<NanikaReceipt & { uid: string }>];
};
export async function callNanika<K extends keyof Api>(name: K, data: Api[K][0]): Promise<Api[K][1]> {
  return (await httpsCallable<Api[K][0], Api[K][1]>(functions, name, { timeout: 120000 })(data)).data;
}
