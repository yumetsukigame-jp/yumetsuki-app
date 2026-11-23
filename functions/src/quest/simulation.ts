import { advanceQuest, questResult, questTile } from "./engine";
import { initialQuestState } from "./engine";
import type { QuestRules, QuestSimulation, QuestState } from "./types";

export function questRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function resolve(state: QuestState, rules: QuestRules, random: () => number,
  policy: QuestSimulation["policy"], shortcutUse: boolean) {
  if (state.pending?.kind === "branch") return advanceQuest(state,
    policy === "mixed" ? (random() < 0.5 ? "bridge" : "flower") : policy, rules);
  if (state.pending?.kind === "shortcut") return advanceQuest(state, shortcutUse ? "shortcut-use" : "shortcut-skip", rules);
  return state;
}
export function simulateQuest(rules: QuestRules, trials = 20000, policy: QuestSimulation["policy"] = "mixed",
  shortcutUse = true, seed = 20261123): QuestSimulation {
  const random = questRandom(seed);
  const result: QuestSimulation = { trials, policy, shortcutUse, groups: { top: 0, upper: 0, middle: 0, lower: 0 },
    stage3: 0, stage4: 0, shortcutOffered: 0, rescued: 0 };
  for (let i = 0; i < trials; i++) {
    let state = initialQuestState();
    const dice = Array.from({ length: 14 }, () => 1 + Math.floor(random() * 6));
    const rescueAvailable = random() < rules.rescue.simulationRate && rules.rescue.enabled;
    const route = random();
    while (state.used < rules.maxTurns && questTile(state.tileId).kind !== "finish") {
      state = advanceQuest(state, "roll", rules, dice[state.used]);
      if (state.pending?.kind === "shortcut") result.shortcutOffered++;
      state = resolve(state, rules, () => route, policy, shortcutUse);
      if (rescueAvailable && !state.rescueUsed && state.used >= rules.rescue.simulationTurn &&
          state.used >= rules.rescue.fromTurn && state.score < rules.rescue.belowScore) {
        state.rescueCredits = 1; state = advanceQuest(state, "rescue", rules);
      }
    }
    result.groups[questResult(state, rules).group]++;
    if (state.reachedStages.includes(3)) result.stage3++;
    if (state.reachedStages.includes(4)) result.stage4++;
    if (state.rescueUsed) result.rescued++;
  }
  return result;
}
export function forecastQuest(initial: QuestState, rules: QuestRules, totalTurns: number, seed = 7) {
  const random = questRandom(seed), scores: number[] = [];
  for (let i = 0; i < 256; i++) {
    let state = structuredClone(initial);
    state = resolve(state, rules, random, "mixed", true);
    while (state.used < totalTurns && questTile(state.tileId).kind !== "finish") {
      state = advanceQuest(state, "roll", rules, 1 + Math.floor(random() * 6));
      state = resolve(state, rules, random, "mixed", true);
    }
    scores.push(state.score);
  }
  scores.sort((a, b) => a - b);
  return { low: scores[25], median: scores[128], high: scores[230], samples: 256,
    policy: "未選択の分岐は各50%、抜け道は使用。未付与の救済は含まず、評価補填は達成率に加算しません。" };
}
