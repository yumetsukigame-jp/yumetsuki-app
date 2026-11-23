import type { QuestDraft, QuestFlag, QuestRules } from "./types";

export class QuestInputError extends Error {}

export function questObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new QuestInputError("入力形式が不正です");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !keys.includes(key))) throw new QuestInputError("指定できない入力項目があります");
  return data;
}
export function questInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new QuestInputError(`${label}は${min}〜${max}の整数で指定してください`);
  }
  return value;
}
export function questText(value: unknown, label: string, max = 200, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max || /[<>]/.test(value)) {
    throw new QuestInputError(`${label}を正しく入力してください`);
  }
  return value.trim();
}
export function validateQuestDraft(raw: unknown): QuestDraft {
  const d = questObject(raw, ["title", "description", "thumbnail", "startsAt", "endsAt", "publicFlags", "xAccountList", "accessCode", "rules"]);
  const startsAt = questInteger(d.startsAt, "開始日時", 0, 253402300799999);
  const endsAt = questInteger(d.endsAt, "終了日時", startsAt + 1, startsAt + 366 * 86400000);
  const thumbnail = questText(d.thumbnail, "画像URL", 2000);
  if (!(thumbnail.startsWith("/") && !thumbnail.startsWith("//")) && !/^https:\/\//.test(thumbnail)) throw new QuestInputError("画像URLが不正です");
  const flags = ["public", "limited", "subscriber", "nibuichi_winner", "x_account_match"];
  if (!Array.isArray(d.publicFlags) || d.publicFlags.length < 1 ||
      d.publicFlags.some(flag => !flags.includes(flag)) || new Set(d.publicFlags).size !== d.publicFlags.length) throw new QuestInputError("公開条件を選んでください");
  if (!Array.isArray(d.xAccountList) || d.xAccountList.length > 5000) throw new QuestInputError("対象X一覧は5000行以内にしてください");
  const xAccountList = d.xAccountList.map(line => questText(line, "対象X", 200));
  if (d.publicFlags.includes("x_account_match") && (!xAccountList.length ||
      xAccountList.some(line => !/@[a-zA-Z0-9_]{1,15}(?![a-zA-Z0-9_])/.test(line.replace(/＠/g, "@"))))) throw new QuestInputError("対象X一覧の各行に@アカウントを指定してください");
  const accessCode = questText(d.accessCode, "限定コード", 100, true);
  if ((!d.publicFlags.includes("public") || d.publicFlags.includes("limited")) && accessCode.length < 8) throw new QuestInputError("非公開・限定公開には8文字以上の専用コードが必要です");
  const r = questObject(d.rules, ["boardVersion", "maxTurns", "stepStarPoints", "levelPoints", "levelScore", "percentMax",
    "percentDecimals", "middleMin", "upperMin", "topMinProgress", "topMinLevel", "distribution", "rescue"]);
  if (r.boardVersion !== "quest-board-v2" || r.maxTurns !== 14) throw new QuestInputError("盤面v2・上限14回を指定してください");
  const distribution = questObject(r.distribution, ["mode", "releaseAt", "dailyStartHourJst"]);
  if (!["schedule", "daily", "admin"].includes(distribution.mode as string)) throw new QuestInputError("配布方式を選んでください");
  if (!Array.isArray(distribution.releaseAt) || distribution.releaseAt.length > 14) throw new QuestInputError("配布日時は14回以内で指定してください");
  const releaseAt = distribution.releaseAt.map(at => questInteger(at, "配布日時", startsAt, endsAt - 1)).sort((a, b) => a - b);
  if (distribution.mode === "schedule" && releaseAt.length !== 14) throw new QuestInputError("日時指定方式は14回分の配布日時を指定してください（同時配布可）");
  if (distribution.mode !== "schedule" && releaseAt.length) throw new QuestInputError("日時指定以外では配布日時を空にしてください");
  const rescue = questObject(r.rescue, ["enabled", "adminEnabled", "eventSources", "fromTurn", "belowScore", "maxGrants", "simulationRate", "simulationTurn"]);
  if (typeof rescue.enabled !== "boolean" || typeof rescue.adminEnabled !== "boolean" ||
      !Array.isArray(rescue.eventSources) || rescue.eventSources.some(source => !["neraiuchi", "nibuichi"].includes(source)) ||
      new Set(rescue.eventSources).size !== rescue.eventSources.length) throw new QuestInputError("救済の付与元を設定してください");
  if (typeof rescue.simulationRate !== "number" || !Number.isFinite(rescue.simulationRate) ||
      rescue.simulationRate < 0 || rescue.simulationRate > 1) throw new QuestInputError("試算時の救済保有率は0〜1で指定してください");
  const rules: QuestRules = {
    boardVersion: "quest-board-v2", maxTurns: 14,
    stepStarPoints: questInteger(r.stepStarPoints, "1歩の星ポイント", 0, 100),
    levelPoints: questInteger(r.levelPoints, "レベル間隔", 1, 10000),
    levelScore: questInteger(r.levelScore, "レベル加点", 0, 100),
    percentMax: questInteger(r.percentMax, "達成率の満点", 1, 10000),
    percentDecimals: questInteger(r.percentDecimals, "百分率の小数桁", 0, 2),
    middleMin: questInteger(r.middleMin, "中間の下限", 1, 10000),
    upperMin: questInteger(r.upperMin, "上位の下限", 2, 10000),
    topMinProgress: questInteger(r.topMinProgress, "最上位の塔到達点", 59, 66),
    topMinLevel: questInteger(r.topMinLevel, "最上位のレベル", 1, 1000),
    distribution: { mode: distribution.mode as QuestRules["distribution"]["mode"], releaseAt,
      dailyStartHourJst: questInteger(distribution.dailyStartHourJst, "日次切替時刻（日本時間）", 0, 23) },
    rescue: {
      enabled: rescue.enabled, adminEnabled: rescue.adminEnabled,
      eventSources: rescue.eventSources as QuestRules["rescue"]["eventSources"],
      fromTurn: questInteger(rescue.fromTurn, "救済を使える回数", 1, 14),
      belowScore: questInteger(rescue.belowScore, "救済対象の評価点上限（未満）", 1, 10000),
      maxGrants: questInteger(rescue.maxGrants, "救済付与上限", 1, 14),
      simulationRate: rescue.simulationRate,
      simulationTurn: questInteger(rescue.simulationTurn, "救済試算の使用回", 1, 14),
    },
  };
  if (rules.middleMin >= rules.upperMin || rules.rescue.belowScore > rules.middleMin) throw new QuestInputError("中間未満だけを救済対象とし、上位の境界は中間より大きくしてください");
  if (!rules.rescue.enabled && (rules.rescue.adminEnabled || rules.rescue.eventSources.length || rules.rescue.simulationRate !== 0)) throw new QuestInputError("救済なしの場合は付与元と試算保有率も無効にしてください");
  if (rules.rescue.enabled && !rules.rescue.adminEnabled && !rules.rescue.eventSources.length) throw new QuestInputError("救済を有効にする場合は付与元を選んでください");
  return { title: questText(d.title, "開催名", 120), description: questText(d.description, "説明", 2000, true),
    thumbnail, startsAt, endsAt, publicFlags: d.publicFlags as QuestFlag[], xAccountList, accessCode, rules };
}
