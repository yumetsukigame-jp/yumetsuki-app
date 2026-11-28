import { advanceQuest, questResult, questTile } from "./engine";
import { initialQuestState } from "./engine";
import { applyQuestPsa } from "./psa";
import type { QuestRules, QuestSimulation, QuestState } from "./types";

export function questRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function resolve(state: QuestState, rules: QuestRules, random: () => number,
  policy: QuestSimulation["policy"], shortcutUse: boolean, flowerRandom = random, record = false) {
  if (state.pending?.kind === "branch") return advanceQuest(state,
    policy === "mixed" ? (random() < 0.5 ? "bridge" : "flower") : policy, rules, undefined, rules.boardVersion === "quest-board-v3" ? 1 + Math.floor(flowerRandom() * 7) : undefined, record);
  if (state.pending?.kind === "shortcut") return advanceQuest(state, shortcutUse ? "shortcut-use" : "shortcut-skip", rules, undefined, undefined, record);
  return state;
}
export function simulateQuest(rules: QuestRules, trials = 20000, policy: QuestSimulation["policy"] = "mixed",
  shortcutUse = true, seed = 20261123): QuestSimulation {
  const random = questRandom(seed);
  const trackPsa = (rules.psaLimit ?? 0) > 0;
  const applyPsa = (previous: QuestState, next: QuestState) => {
    if (!trackPsa || previous === next) return next;
    const prize = applyQuestPsa(previous, next, 1);
    next.psaFragments = prize.fragments;
    next.psaReserved = prize.reserved;
    if (prize.collected) next.psaCollectedTiles = [...(previous.psaCollectedTiles ?? []), next.tileId];
    delete next.lastTrace;
    delete next.visitedPaths;
    return next;
  };
  const result: QuestSimulation = { trials, policy, shortcutUse, groups: { top: 0, upper: 0, middle: 0, lower: 0 },
    stage3: 0, stage4: 0, shortcutOffered: 0, rescued: 0,
    ...(trackPsa ? { psaTickets: { top: 0, upper: 0, middle: 0, lower: 0 } } : {}) };
  for (let i = 0; i < trials; i++) {
    let state = initialQuestState();
    const dice = Array.from({ length: rules.maxTurns }, () => 1 + Math.floor(random() * 6));
    const rescueAvailable = random() < rules.rescue.simulationRate && rules.rescue.enabled;
    const route = random();
    while (state.used < rules.maxTurns && questTile(state.tileId).kind !== "finish") {
      state = applyPsa(state, advanceQuest(state, "roll", rules, dice[state.used], undefined, trackPsa));
      if (state.pending?.kind === "shortcut") result.shortcutOffered++;
      state = applyPsa(state, resolve(state, rules, () => route, policy, shortcutUse, random, trackPsa));
      if (rescueAvailable && !state.rescueUsed && state.used >= rules.rescue.simulationTurn &&
          state.used >= rules.rescue.fromTurn && state.score < rules.rescue.belowScore) {
        state.rescueCredits = 1; state = advanceQuest(state, "rescue", rules, undefined, undefined, false);
      }
    }
    const group = questResult(state, rules).group;
    result.groups[group]++;
    if (state.psaReserved && result.psaTickets) result.psaTickets[group]++;
    if (state.reachedStages.includes(3)) result.stage3++;
    if (state.reachedStages.includes(4)) result.stage4++;
    if (state.rescueUsed) result.rescued++;
  }
  return result;
}
export function forecastQuest(initial: QuestState, rules: QuestRules, totalTurns: number, seed = 7) {
  const random = questRandom(seed), scores: number[] = [];
  const groups = { lower: 0, middle: 0, upper: 0, top: 0 };
  const resolveForecast = (state: QuestState) => {
    state = resolve(state, rules, random, "mixed", true);
    if (rules.rescue.enabled && !state.rescueUsed && state.rescueCredits > 0 &&
        state.used >= rules.rescue.fromTurn && state.score < rules.rescue.belowScore) {
      state = advanceQuest(state, "rescue", rules, undefined, undefined, false);
    }
    return state;
  };
  for (let i = 0; i < 256; i++) {
    let state = resolveForecast(structuredClone(initial));
    while (state.used < totalTurns && questTile(state.tileId).kind !== "finish") {
      state = advanceQuest(state, "roll", rules, 1 + Math.floor(random() * 6), undefined, false);
      state = resolveForecast(state);
    }
    scores.push(state.score);
    groups[questResult(state, rules).group]++;
  }
  scores.sort((a, b) => a - b);
  return { low: scores[25], median: scores[128], high: scores[230], samples: scores.length, groups,
    policy: "未選択の分岐は各50%、抜け道は使用。付与済みの救済は利用条件成立時に使用し、未付与分は含みません。評価補填は達成率に加算しません。" };
}
