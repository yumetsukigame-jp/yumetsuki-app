import type { QuestRules } from "./types";

export const QUEST_LEVEL_LIMIT = 15;

export function questLevelLimit(rules: QuestRules, earnedLevel = 1) {
  // Preserve levels already earned and level requirements published before the cap.
  return Math.max(QUEST_LEVEL_LIMIT, rules.topMinLevel, earnedLevel);
}
