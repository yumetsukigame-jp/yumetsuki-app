import { advanceQuest, questStage, questTile } from "./engine";
import type { QuestRules, QuestState } from "./types";

export const PSA_FRAGMENT_TARGET = 5;
const fragmentTiles = new Set([
  "s1-02", "s1-05", "s1-08", "s1-11", "s1-14", "s1-15",
  "s2-02", "s2-05", "s2-08", "s2-11", "s2-17",
  "s3-03", "s3-15",
]);

export function isQuestPsaTile(tileId: string) { return fragmentTiles.has(tileId); }

export function applyQuestPsa(previous: QuestState, next: QuestState, slots: number) {
  const fragments = previous.psaFragments ?? 0;
  if (next.reachedStages.includes(4) || questStage(next.tileId) === 4) return { fragments: 0, reserved: false, collected: false,
    lost: previous.psaReserved ? PSA_FRAGMENT_TARGET : fragments, newlyReserved: false };
  if (previous.psaReserved) return { fragments: 0, reserved: true, collected: false, lost: 0, newlyReserved: false };

  const steps = next.lastTrace?.steps ?? [];
  const collected = slots > 0 && !next.pending &&
    fragmentTiles.has(next.tileId) && !(previous.psaCollectedTiles ?? []).includes(next.tileId) &&
    steps[steps.length - 1]?.kind === "walk";
  const newlyReserved = collected && fragments + 1 >= PSA_FRAGMENT_TARGET;
  return { fragments: newlyReserved ? 0 : fragments + Number(collected), reserved: newlyReserved,
    collected, lost: 0, newlyReserved };
}

export function previewQuestRoll(state: QuestState, rules: QuestRules, die: number, psaSlots: number) {
  const next = advanceQuest(state, "roll", rules, die);
  const psa = applyQuestPsa(state, next, rules.psaLimit ? psaSlots : 0);
  const special = (next.lastTrace?.rewards ?? []).filter(item => item.label !== "移動");
  const events = special.map(item => `${item.label} ＋${item.points}`);
  if (psa.newlyReserved) events.push("PSAチケット枠を確保");
  else if (psa.collected) events.push("PSAのかけら ＋1");
  if (state.psaReserved && !psa.reserved) events.push("PSAチケット枠が失効");
  else if (psa.lost) events.push(`PSAのかけら ${psa.lost}個消滅`);
  if (next.pending?.kind === "branch") events.push("分かれ道へ");
  if (next.pending?.kind === "shortcut") events.push("星渡りの抜け道が開く");
  if (questStage(next.tileId) !== questStage(state.tileId)) events.push("次の舞台へ");
  if (next.lastTrace?.steps.some(step => step.kind === "return")) events.push("戻りの魔法陣");
  if (next.lastTrace?.steps.some(step => step.kind === "warp")) events.push("ワープ");
  if (questTile(next.tileId).kind === "finish") events.push("ゴール");
  if (next.level > state.level) events.push(`Lv.${next.level}にアップ`);
  return { starPoints: next.starPoints - state.starPoints, events };
}
