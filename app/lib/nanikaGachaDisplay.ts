import type { NanikaSlot } from "../../functions/src/nanikaGachaTypes";

export function nanikaDrawCost(slot: NanikaSlot, useRight: boolean) {
  return useRight ? 0 : slot.fee;
}

export function nanikaDrawBlockReason(slot: NanikaSlot, useRight: boolean, points: number | null) {
  if (!slot.visible) return "ただいま準備中です。次の開催をお待ちください。";
  if (slot.available < 1) return "ただいま景品を準備しています。";
  if (!slot.roundId || slot.fee === null || slot.exchangePoints === null) return "ガチャの情報を更新してください。";
  if ((useRight ? slot.remainingRights : slot.remainingUses) < 1) {
    return `${useRight ? "当選権利" : "挑戦権利"}がありません。`;
  }
  const cost = nanikaDrawCost(slot, useRight)!;
  if (cost > 0 && points === null) return "残高を確認できませんでした。最新の状態に更新してください。";
  if (cost > 0 && points !== null && points < cost) return `あと${(cost - points).toLocaleString("ja-JP")} pt必要です。`;
  return null;
}

export function isNanikaShipping(record: { nanikaImageId?: unknown; image?: unknown }) {
  return typeof record.nanikaImageId === "string" ||
    (typeof record.image === "string" && record.image.startsWith("/api/nanika-gacha/images/"));
}
