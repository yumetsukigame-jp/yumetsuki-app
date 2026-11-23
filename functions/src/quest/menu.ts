export const QUEST_MENU_MODES = ["admin", "subscriber", "public"] as const;
export type QuestMenuMode = typeof QUEST_MENU_MODES[number];
export const QUEST_MENU_LABELS: Record<QuestMenuMode, string> = {
  admin: "管理者のみ", subscriber: "サブスク限定", public: "全体公開",
};
export type QuestMenuAccess = { mode: QuestMenuMode; allowed: boolean; version: number };
export function questMenuMode(value: unknown): QuestMenuMode {
  return QUEST_MENU_MODES.includes(value as QuestMenuMode) ? value as QuestMenuMode : "admin";
}
