"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import type { QuestPlayer, QuestProgress, QuestPublicRun } from "@/functions/src/quest/types";

export type QuestView = {
  run: QuestPublicRun | null;
  player: QuestPlayer | null;
  reason?: string | null;
  dueDice?: number;
  serverNow: number;
  forecast?: { low: number; median: number; high: number; policy: string; samples: number; groups?: Record<keyof typeof questGroups, number> } | null;
};
export type QuestRankingData = {
  items: QuestProgress[]; own: QuestProgress | null; nextCursor: string | null;
  stages: { stage: number; count: number }[];
};
export const questGroups = { top: "最上位", upper: "上位", middle: "中間", lower: "下位" };
export const questFlags = {
  public: "全体公開", limited: "限定公開", subscriber: "サブスク限定",
  nibuichi_winner: "前日のニブイチ的中者限定", x_account_match: "Xアカウント一致",
} as const;
export async function questCall<T>(name: string, data: object, timeout?: number): Promise<T> {
  return (await httpsCallable<object, T>(functions, name, timeout === undefined ? undefined : { timeout })(data)).data;
}
export function questError(error: unknown) {
  return error instanceof Error ? error.message : "通信状況を確認し、もう一度お試しください。";
}
