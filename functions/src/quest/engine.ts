import definition from "./board-v2.json";
import type { QuestAction, QuestGroup, QuestResult, QuestRules, QuestState, QuestStep } from "./types";

type Tile = {
  id: string; x: number; y: number; progress: number; kind: string; next: string[]; exitTo?: string;
  effect?: { when: string; starPoints?: number; target?: string; oncePerRun?: boolean; stopTurn?: boolean };
};
export class QuestRuleError extends Error {}
export const QUEST_BOARD = definition;
const oldGarden = definition.stages[2];
const flowerExit: Tile = { id: "s3-loop-06", x: 44, y: 63, progress: 42, kind: "loop-exit", next: ["s3-loop-00"], exitTo: "s3-20" };
const newStages = definition.stages.map(stage => stage.id !== 3 ? stage : {
  ...oldGarden, tiles: [
    ...oldGarden.tiles.map(tile => tile.id === "s3-loop-00" ? { ...tile, kind: "normal", exitTo: undefined } :
      tile.id === "s3-loop-05" ? { ...tile, next: [flowerExit.id] } : tile),
    flowerExit,
  ],
});
export function questBoard(version: QuestRules["boardVersion"]) {
  return version === "quest-board-v3" ? { ...definition, version: "quest-board-v3", stages: newStages,
    garden: { ...definition.garden, ringExitId: flowerExit.id, ringLength: 7, forcedExitSteps: 14 } } : definition;
}
export const QUEST_TILES = new Map<string, Tile>(
  definition.stages.flatMap(stage => stage.tiles.map(tile => [tile.id, tile as Tile] as const)),
);
export function questTile(id: string, version?: QuestRules["boardVersion"]): Tile {
  const tile = id === flowerExit.id ? flowerExit :
    version === "quest-board-v3" && id.startsWith("s3-loop-") ?
      newStages[2].tiles.find(item => item.id === id) as Tile | undefined : QUEST_TILES.get(id);
  if (!tile) throw new Error("盤面のマスが見つかりません");
  return tile;
}
export function questStage(id: string) { return Number(id[1]); }
export function questGoalDistance(state: Pick<QuestState, "tileId" | "branch" | "pending">, version: QuestRules["boardVersion"]) {
  const board = questBoard(version);
  const distances = new Map([[state.tileId, 0]]);
  const remaining = new Set(board.stages.flatMap(stage => stage.tiles.map(tile => tile.id)));
  while (remaining.size) {
    let id: string | undefined;
    let distance = Infinity;
    for (const candidate of remaining) {
      const steps = distances.get(candidate) ?? Infinity;
      if (steps < distance) { id = candidate; distance = steps; }
    }
    if (!id) return null;
    remaining.delete(id);
    const tile = questTile(id, version);
    if (tile.kind === "finish") return distance;
    const next = tile.kind === "fork" && state.branch ? [tile.next[state.branch === "flower" ? 1 : 0]] : tile.next;
    const routes = next.map(to => ({ to, cost: tile.kind === "gate" ? 0 : 1 }));
    if (tile.exitTo) routes.push({ to: tile.exitTo, cost: 0 });
    if (tile.kind === "fork" && version === "quest-board-v3" && state.branch !== "bridge") {
      routes.push({ to: board.garden.ringExitId, cost: 0 });
    }
    if (id === state.tileId && state.pending?.kind === "shortcut") {
      routes.push({ to: board.specialRoutes[0].destination, cost: 0 });
    }
    for (const { to, cost } of routes) {
      if (distance + cost < (distances.get(to) ?? Infinity)) distances.set(to, distance + cost);
    }
  }
  return null;
}
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
function arrive(state: QuestState, id: string, kind: QuestStep["kind"] = "walk") {
  const step = { from: state.tileId, to: id, kind };
  state.lastTrace?.steps.push(step);
  if (state.visitedPaths && !state.visitedPaths.some(path => path.from === step.from && path.to === id && path.kind === kind)) state.visitedPaths.push(step);
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
function reward(state: QuestState, label: string, points: number) {
  if (!points) return;
  state.starPoints += points;
  state.lastTrace?.rewards.push({ label, points, tileId: state.tileId });
}
function exitGarden(state: QuestState, jackpot = false) {
  once(state, "garden-exit", () => reward(state, "花壇出口", definition.garden.exitBonusStarPoints));
  arrive(state, jackpot ? flowerExit.exitTo! : definition.garden.mergeId, "warp");
}
function finishTurn(state: QuestState, rules: QuestRules) {
  const tile = questTile(state.tileId, rules.boardVersion), effect = tile.effect;
  if (effect?.when === "land") {
    const apply = () => {
      reward(state, tile.kind === "starflower" ? "星咲きの花" : "金の星", effect.starPoints ?? 0);
      if (effect.target) arrive(state, effect.target, "return");
      if (tile.kind === "starflower") state.souvenirs.push("starflower");
    };
    if (effect.oncePerRun) once(state, tile.id, apply); else apply();
  }
  if (state.tileId.startsWith("s3-loop-") && (
    tile.kind === "loop-exit" ||
    state.loopSteps >= gardenLimit(rules) ||
    (state.used >= definition.garden.lateExitFromTurn && state.loopSteps >= definition.garden.lateExitMinSteps)
  )) exitGarden(state, tile.id === flowerExit.id);
  updateQuestScore(state, rules);
  const route = definition.specialRoutes[0];
  if (state.used === route.trigger.atCompletedTurn && state.shortcut === "tracking" &&
      state.originalRolls.length === 5 && state.originalRolls.every(face => face <= 2) &&
      questStage(state.tileId) === route.fromStage) {
    state.shortcut = "offered"; state.pending = { kind: "shortcut", steps: 0 };
  }
}
function gardenLimit(rules: QuestRules) {
  return questBoard(rules.boardVersion).garden.forcedExitSteps;
}
function walk(state: QuestState, steps: number, rules: QuestRules) {
  while (steps > 0) {
    const tile = questTile(state.tileId, rules.boardVersion);
    if (tile.kind === "finish") break;
    if (tile.kind === "fork" && !state.branch) {
      state.pending = { kind: "branch", steps }; return;
    }
    const next = tile.kind === "fork" ? (state.branch === "flower" ? tile.next[1] : tile.next[0]) : tile.next[0];
    if (!next) break;
    arrive(state, next); steps--; reward(state, "移動", rules.stepStarPoints);
    if (next.startsWith("s3-loop-")) {
      state.loopSteps++;
      if (state.loopSteps >= gardenLimit(rules)) {
        if (rules.boardVersion === "quest-board-v2") exitGarden(state);
        break;
      }
    }
    const reached = questTile(state.tileId);
    if (reached.effect?.stopTurn) { arrive(state, reached.next[0], "stage"); break; }
    if (reached.kind === "fork" && !state.branch) {
      state.pending = { kind: "branch", steps };
      updateQuestScore(state, rules); return;
    }
  }
  finishTurn(state, rules);
}
export function advanceQuest(previous: QuestState, action: QuestAction, rules: QuestRules, die?: number, flowerDraw?: number, record = true): QuestState {
  const state: QuestState = structuredClone(previous);
  state.version++;
  if (record) {
    state.visitedPaths ??= [];
    state.lastTrace = { steps: [], rewards: [] };
  } else {
    delete state.visitedPaths;
    delete state.lastTrace;
  }
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
    if (action === "shortcut-use") arrive(state, definition.specialRoutes[0].destination, "warp");
    updateQuestScore(state, rules); return state;
  }
  if (action === "bridge" || action === "flower") {
    if (state.pending?.kind !== "branch") throw new QuestRuleError("分岐の選択待ちではありません");
    const steps = state.pending.steps; state.pending = null; state.branch = action;
    if (action === "flower" && rules.boardVersion === "quest-board-v3") {
      if (!Number.isInteger(flowerDraw) || flowerDraw! < 1 || flowerDraw! > 7) throw new Error("花壇の出目が不正です");
      const index = flowerDraw! - 1;
      arrive(state, `s3-loop-0${index}`, "warp");
      state.loopSteps = 1;
      finishTurn(state, rules);
    } else if (steps > 0) walk(state, steps, rules);
    else finishTurn(state, rules);
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
