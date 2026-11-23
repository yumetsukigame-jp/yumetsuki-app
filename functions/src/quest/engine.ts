import definition from "./board-v2.json";
import type { QuestAction, QuestGroup, QuestResult, QuestRules, QuestState } from "./types";

type Tile = {
  id: string; x: number; y: number; progress: number; kind: string; next: string[]; exitTo?: string;
  effect?: { when: string; starPoints?: number; target?: string; oncePerRun?: boolean; stopTurn?: boolean };
};
export class QuestRuleError extends Error {}
export const QUEST_BOARD = definition;
export const QUEST_TILES = new Map<string, Tile>(
  definition.stages.flatMap(stage => stage.tiles.map(tile => [tile.id, tile as Tile] as const)),
);
export function questTile(id: string): Tile {
  const tile = QUEST_TILES.get(id);
  if (!tile) throw new Error("盤面のマスが見つかりません");
  return tile;
}
export function questStage(id: string) { return Number(id[1]); }
export function updateQuestScore(state: QuestState, rules: QuestRules) {
  state.level = 1 + Math.floor(state.starPoints / rules.levelPoints);
  state.score = questTile(state.tileId).progress + rules.levelScore * (state.level - 1);
}
export function questPercent(score: number, rules: QuestRules) {
  return Number(Math.min(100, Math.max(0, score / rules.percentMax * 100)).toFixed(rules.percentDecimals));
}
export function initialQuestState(): QuestState {
  return {
    tileId: "s1-00", starPoints: 0, level: 1, score: 0, used: 0, version: 0,
    originalRolls: [], pending: null, branch: null, loopSteps: 0, effects: [], reachedStages: [1],
    rescueCredits: 0, rescueUsed: false, shortcut: "tracking", souvenirs: [], lastDie: null,
  };
}
function arrive(state: QuestState, id: string) {
  state.tileId = id;
  const stage = questStage(id);
  if (!state.reachedStages.includes(stage)) {
    state.reachedStages.push(stage);
    state.souvenirs.push(`stage-${stage}`);
  }
}
function once(state: QuestState, key: string, operation: () => void) {
  if (state.effects.includes(key)) return;
  state.effects.push(key); operation();
}
function exitGarden(state: QuestState) {
  once(state, "garden-exit", () => { state.starPoints += definition.garden.exitBonusStarPoints; });
  arrive(state, definition.garden.mergeId);
}
function finishTurn(state: QuestState, rules: QuestRules) {
  const tile = questTile(state.tileId), effect = tile.effect;
  if (effect?.when === "land") {
    const apply = () => {
      state.starPoints += effect.starPoints ?? 0;
      if (effect.target) arrive(state, effect.target);
      if (tile.kind === "starflower") state.souvenirs.push("starflower");
    };
    if (effect.oncePerRun) once(state, tile.id, apply); else apply();
  }
  if (state.tileId.startsWith("s3-loop-") && (
    state.tileId === definition.garden.ringExitId ||
    state.loopSteps >= definition.garden.forcedExitSteps ||
    (state.used >= definition.garden.lateExitFromTurn && state.loopSteps >= definition.garden.lateExitMinSteps)
  )) exitGarden(state);
  updateQuestScore(state, rules);
  const route = definition.specialRoutes[0];
  if (state.used === route.trigger.atCompletedTurn && state.shortcut === "tracking" &&
      state.originalRolls.length === 5 && state.originalRolls.every(face => face <= 2) &&
      questStage(state.tileId) === route.fromStage) {
    state.shortcut = "offered"; state.pending = { kind: "shortcut", steps: 0 };
  }
}
function walk(state: QuestState, steps: number, rules: QuestRules) {
  while (steps > 0) {
    const tile = questTile(state.tileId);
    if (tile.kind === "finish") break;
    if (tile.kind === "fork" && !state.branch) {
      state.pending = { kind: "branch", steps }; return;
    }
    const next = tile.kind === "fork" ? (state.branch === "flower" ? tile.next[1] : tile.next[0]) : tile.next[0];
    if (!next) break;
    arrive(state, next); steps--; state.starPoints += rules.stepStarPoints;
    if (next.startsWith("s3-loop-")) {
      state.loopSteps++;
      if (state.loopSteps >= definition.garden.forcedExitSteps) {
        exitGarden(state);
        break;
      }
    }
    const reached = questTile(state.tileId);
    if (reached.effect?.stopTurn) { arrive(state, reached.next[0]); break; }
    if (reached.kind === "fork" && !state.branch) {
      state.pending = { kind: "branch", steps };
      updateQuestScore(state, rules); return;
    }
  }
  finishTurn(state, rules);
}
export function advanceQuest(previous: QuestState, action: QuestAction, rules: QuestRules, die?: number): QuestState {
  const state: QuestState = structuredClone(previous);
  state.version++;
  if (action === "rescue") {
    if (!rules.rescue.enabled || state.rescueUsed || state.rescueCredits < 1 ||
        state.used < rules.rescue.fromTurn || state.score >= rules.rescue.belowScore) {
      throw new QuestRuleError("月明かりの小径は現在使えません");
    }
    state.rescueCredits--; state.rescueUsed = true;
    return state;
  }
  if (action === "shortcut-use" || action === "shortcut-skip") {
    if (state.pending?.kind !== "shortcut") throw new QuestRuleError("抜け道の選択待ちではありません");
    state.pending = null; state.shortcut = action === "shortcut-use" ? "used" : "declined";
    if (action === "shortcut-use") arrive(state, definition.specialRoutes[0].destination);
    updateQuestScore(state, rules); return state;
  }
  if (action === "bridge" || action === "flower") {
    if (state.pending?.kind !== "branch") throw new QuestRuleError("分岐の選択待ちではありません");
    const steps = state.pending.steps; state.pending = null; state.branch = action;
    if (steps > 0) walk(state, steps, rules); else finishTurn(state, rules);
    return state;
  }
  if (state.pending || state.used >= rules.maxTurns || questTile(state.tileId).kind === "finish") {
    throw new QuestRuleError("現在はサイコロを振れません");
  }
  if (!Number.isInteger(die) || die! < 1 || die! > 6) throw new Error("サイコロの出目が不正です");
  state.used++; state.lastDie = die!; state.originalRolls.push(die!);
  if (state.used <= 5 && die! > 2) state.shortcut = "missed";
  walk(state, die!, rules); updateQuestScore(state, rules);
  return state;
}
export function questNaturalGroup(state: QuestState, rules: QuestRules): QuestGroup {
  if (questStage(state.tileId) === 4 && questTile(state.tileId).progress >= rules.topMinProgress &&
      state.level >= rules.topMinLevel) return "top";
  if (state.score >= rules.upperMin) return "upper";
  if (state.score >= rules.middleMin) return "middle";
  return "lower";
}
export function questResult(state: QuestState, rules: QuestRules): QuestResult {
  const naturalGroup = questNaturalGroup(state, rules);
  return {
    tileId: state.tileId, level: state.level, score: state.score, naturalGroup,
    group: naturalGroup === "lower" && state.rescueUsed ? "middle" : naturalGroup,
    used: state.used, souvenirs: [...state.souvenirs], rescueUsed: state.rescueUsed,
  };
}
export function releasedQuestDice(rules: QuestRules, startsAt: number, endsAt: number, now: number) {
  return questReleaseKeys(rules, startsAt, endsAt, now).length;
}
export function questReleaseKeys(rules: QuestRules, startsAt: number, endsAt: number, now: number): string[] {
  if (now < startsAt || rules.distribution.mode === "admin") return [];
  if (rules.distribution.mode === "schedule") {
    return rules.distribution.releaseAt.map((at, index) => ({ at, index }))
      .filter(({ at }) => at <= now && at >= startsAt && at < endsAt).slice(0, rules.maxTurns)
      .map(({ index }) => `schedule-${index}`);
  }
  const day = (at: number) => Math.floor((at + (9 - rules.distribution.dailyStartHourJst) * 3600000) / 86400000);
  const first = day(startsAt);
  return Array.from({ length: Math.min(rules.maxTurns, Math.max(0, day(Math.min(now, endsAt - 1)) - first + 1)) },
    (_, index) => `day-${first + index}`);
}
