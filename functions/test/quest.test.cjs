/* eslint-disable @typescript-eslint/no-require-imports -- Tests the compiled, pure Quest engine. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { rules } = require("./quest-fixtures.cjs");
const { QUEST_BOARD, QUEST_TILES, initialQuestState, advanceQuest, questResult, updateQuestScore,
  releasedQuestDice, questReleaseKeys, questPercent, questGoalDistance } = require("../lib/quest/engine");
const { simulateQuest, forecastQuest } = require("../lib/quest/simulation");
const { validateQuestDraft } = require("../lib/quest/config");
const state = (overrides = {}) => ({ ...initialQuestState(), ...overrides });
const roll = (s, die) => advanceQuest(s, "roll", rules, die);

test("the complete authoritative 76-tile board is preserved, connected and versioned", () => {
  const original = require("node:fs").readFileSync(require.resolve("../src/quest/board-v2.json"));
  assert.equal(createHash("sha256").update(original).digest("hex"), "38a97ea2234df489a407637f358db616cd7222a9e6bc87a6327c7d26a4182c13");
  assert.equal(QUEST_BOARD.version, "quest-board-v2");
  assert.equal(QUEST_TILES.size, 76);
  const visited = new Set(), todo = ["s1-00"];
  while (todo.length) {
    const id = todo.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    const tile = QUEST_TILES.get(id);
    assert.ok(tile, id);
    todo.push(...tile.next, ...(tile.exitTo ? [tile.exitTo] : []));
  }
  assert.equal(visited.size, 76);
});
test("gates stop unused movement, including turn 14, without free movement XP", () => {
  for (const [from, to, stage] of [["s1-15", "s2-00", 2], ["s2-20", "s3-00", 3], ["s3-20", "s4-00", 4]]) {
    const next = roll(state({ tileId: from, used: 13 }), 6);
    assert.equal(next.tileId, to);
    assert.equal(next.used, 14);
    assert.equal(next.starPoints, 1);
    assert.ok(next.reachedStages.includes(stage));
    assert.throws(() => roll(next, 1));
  }
});
test("forks persist remaining steps, including zero, and resume the original turn once", () => {
  const fork = roll(state({ tileId: "s3-03", used: 7 }), 5);
  assert.deepEqual(fork.pending, { kind: "branch", steps: 3 });
  assert.equal(fork.used, 8);
  assert.equal(fork.starPoints, 2);
  const restored = JSON.parse(JSON.stringify(fork));
  const bridge = advanceQuest(restored, "bridge", rules);
  assert.equal(bridge.tileId, "s3-08");
  assert.equal(bridge.used, 8);
  assert.equal(bridge.starPoints, 5);
  const flower = advanceQuest(restored, "flower", rules);
  assert.equal(flower.tileId, "s3-loop-03");
  assert.equal(flower.starPoints, 33);
  const exact = roll(state({ tileId: "s3-04" }), 1);
  const chosen = advanceQuest(exact, "bridge", rules);
  assert.equal(chosen.tileId, "s3-05");
  assert.equal(chosen.used, 1);
  assert.equal(chosen.pending, null);
  assert.equal(roll(chosen, 1).tileId, "s3-06");
  assert.throws(() => advanceQuest(chosen, "flower", rules));
});
test("ring exit exact landing, forced/late rescue and starflower are once-only", () => {
  let s = roll(state({ tileId: "s3-loop-01", used: 8, loopSteps: 1 }), 2);
  assert.equal(s.starPoints, 30);
  s = roll(s, 6);
  assert.equal(s.tileId, "s3-loop-03");
  assert.equal(s.starPoints, 36);
  const exit = roll(state({ tileId: "s3-loop-05", loopSteps: 5 }), 1);
  assert.equal(exit.tileId, "s3-07");
  assert.equal(exit.starPoints, 13);
  const forced = roll(state({ tileId: "s3-loop-05", loopSteps: 11 }), 6);
  assert.equal(forced.tileId, "s3-07");
  assert.equal(forced.starPoints, 13);
  const late = roll(state({ tileId: "s3-loop-05", used: 11, loopSteps: 5 }), 2);
  assert.equal(late.tileId, "s3-07");
  assert.equal(late.starPoints, 14);
});
test("return magic changes current progress, preserves XP, and fires once", () => {
  const returned = roll(state({ tileId: "s3-11", starPoints: 50 }), 1);
  assert.equal(returned.tileId, "s3-09");
  assert.equal(returned.starPoints, 51);
  assert.equal(returned.score, 54);
  const again = roll(returned, 3);
  assert.equal(again.tileId, "s3-12");
  assert.equal(again.starPoints, 54);
});
test("five original low dice offer an optional persistent shortcut, never a sixth roll", () => {
  let s = state();
  for (const face of [1, 2, 1, 2, 1]) s = roll(s, face);
  assert.equal(s.shortcut, "offered");
  assert.deepEqual(s.pending, { kind: "shortcut", steps: 0 });
  assert.throws(() => roll(s, 1));
  const used = advanceQuest(JSON.parse(JSON.stringify(s)), "shortcut-use", rules);
  assert.equal(used.tileId, "s3-00");
  assert.equal(used.used, 5);
  assert.equal(used.starPoints, s.starPoints);
  assert.ok(!used.souvenirs.includes("stage-2"));
  const skipped = advanceQuest(s, "shortcut-skip", rules);
  assert.equal(skipped.tileId, s.tileId);
  assert.equal(skipped.shortcut, "declined");
  let missed = state();
  for (const face of [1, 2, 3, 1, 1]) missed = roll(missed, face);
  assert.equal(missed.pending, null);
  assert.equal(missed.shortcut, "missed");
});
test("unrounded boundaries decide groups; rescue never increases score or yields upper", () => {
  const lower = state({ tileId: "s3-09", used: 14, rescueCredits: 1, starPoints: 24 });
  updateQuestScore(lower, rules);
  assert.equal(lower.score, 50);
  const rescued = advanceQuest(lower, "rescue", rules);
  assert.equal(questResult(rescued, rules).group, "middle");
  assert.equal(questResult(rescued, rules).naturalGroup, "lower");
  assert.equal(rescued.score, 50);
  assert.equal(rescued.tileId, lower.tileId);
  assert.throws(() => advanceQuest(rescued, "rescue", rules));
  assert.equal(questResult(state({ score: 52 }), rules).group, "middle");
  assert.equal(questResult(state({ score: 64 }), rules).group, "upper");
  assert.equal(questResult(state({ tileId: "s4-03", level: 6 }), rules).group, "top");
  assert.equal(questPercent(51, { ...rules, percentMax: 52, percentDecimals: 0 }), 98);
});
test("JST daily releases carry over with unique date keys, schedule dates are end-exclusive", () => {
  const startsAt = Date.parse("2026-11-23T12:00:00+09:00"), endsAt = startsAt + 30 * 86400000;
  const daily = { ...rules, distribution: { ...rules.distribution, mode: "daily" } };
  assert.equal(releasedQuestDice(daily, startsAt, endsAt, startsAt - 1), 0);
  assert.equal(releasedQuestDice(daily, startsAt, endsAt, Date.parse("2026-11-24T05:59:59+09:00")), 1);
  assert.equal(releasedQuestDice(daily, startsAt, endsAt, Date.parse("2026-11-24T06:00:00+09:00")), 2);
  assert.equal(new Set(questReleaseKeys(daily, startsAt, endsAt, endsAt)).size, 14);
  const schedule = { ...rules, distribution: { ...rules.distribution, mode: "schedule", releaseAt: [startsAt, startsAt, endsAt] } };
  assert.equal(releasedQuestDice(schedule, startsAt, endsAt, endsAt), 2);
});
test("invalid draft configuration and sample omissions cannot become a live run", () => {
  assert.throws(() => validateQuestDraft({}));
  const draft = { title: "Test", description: "", thumbnail: "/quest/menu-thumbnail-v2.jpg",
    startsAt: 1000, endsAt: 2000, publicFlags: ["public"], xAccountList: [], accessCode: "", rules };
  assert.equal(validateQuestDraft(draft).rules.maxTurns, 14);
  assert.equal(validateQuestDraft({ ...draft, rules: { ...rules, maxTurns: 99 } }).rules.maxTurns, 99);
  assert.throws(() => validateQuestDraft({ ...draft, rules: { ...rules, maxTurns: 100 } }));
  assert.throws(() => validateQuestDraft({ ...draft, publicFlags: ["limited"], accessCode: "short" }));
  assert.throws(() => validateQuestDraft({ ...draft, rules: { ...rules, middleMin: 64 } }));
});
test("14-turn simulation and forecasts are deterministic, complete and bounded", () => {
  const report = simulateQuest(rules, 2000);
  assert.deepEqual(report, simulateQuest(rules, 2000));
  assert.equal(Object.values(report.groups).reduce((a, b) => a + b), 2000);
  assert.ok(report.rescued > 0);
  assert.ok(report.stage3 > report.stage4);
  const forecast = forecastQuest(state(), rules, 0);
  assert.deepEqual([forecast.low, forecast.median, forecast.high], [0, 0, 0]);
});

test("v3 flower has one immediate warp among seven landings and records its reward", () => {
  const v3 = { ...rules, boardVersion: "quest-board-v3" };
  const fork = state({ tileId: "s3-05", used: 8, pending: { kind: "branch", steps: 3 } });
  for (let face = 1; face <= 7; face++) {
    const next = advanceQuest(fork, "flower", v3, undefined, face);
    assert.equal(next.used, 8);
    assert.equal(next.tileId, face === 7 ? "s3-20" : `s3-loop-0${face - 1}`);
    assert.ok(next.visitedPaths.length >= 1);
    if (face === 7) {
      assert.deepEqual(next.lastTrace.steps.at(-1), { from: "s3-loop-06", to: "s3-20", kind: "warp" });
      assert.equal(next.lastTrace.rewards[0].label, "花壇出口");
    }
  }
});

test("movement records each walked tile, the stage boundary, and earned points", () => {
  const result = roll(state({ tileId: "s1-14" }), 6);
  assert.deepEqual(result.lastTrace.steps.map(step => [step.to, step.kind]),
    [["s1-15", "walk"], ["s1-16", "walk"], ["s2-00", "stage"]]);
  assert.equal(result.lastTrace.rewards.reduce((sum, reward) => sum + reward.points, 0), result.starPoints);
  assert.equal(result.visitedPaths.length, 3);
});

test("v3 ring uses the seventh exit and its own forced limit without changing v2", () => {
  const v3 = { ...rules, boardVersion: "quest-board-v3" };
  const from = state({ tileId: "s3-loop-05", used: 8, loopSteps: 3 });
  assert.equal(advanceQuest(from, "roll", v3, 1).tileId, "s3-20");
  assert.equal(roll(from, 1).tileId, "s3-07");
  const forced = advanceQuest(state({ tileId: "s3-loop-00", used: 8, loopSteps: 13 }), "roll", v3, 6);
  assert.equal(forced.tileId, "s3-07");
  assert.equal(forced.starPoints, 13);
});

test("99-turn schedules release all slots and complete simulation", () => {
  const releaseAt = Array.from({ length: 99 }, (_, index) => index + 1);
  const extended = { ...rules, maxTurns: 99, distribution: { ...rules.distribution, mode: "schedule", releaseAt } };
  assert.equal(releasedQuestDice(extended, 1, 120, 100), 99);
  const report = simulateQuest(extended, 100);
  assert.equal(Object.values(report.groups).reduce((sum, count) => sum + count, 0), 100);
});

test("forecast counts all groups and includes an already activated rescue", () => {
  const forecast = forecastQuest(state({ rescueUsed: true }), rules, 0);
  assert.deepEqual(forecast.groups, { lower: 0, middle: forecast.samples, upper: 0, top: 0 });
  const full = forecastQuest(state(), rules, 14);
  assert.equal(Object.values(full.groups).reduce((sum, value) => sum + value, 0), full.samples);
});

test("forecast uses only granted rescue when eligible, without changing actual points or state", () => {
  const initial = state({ used: 14, rescueCredits: 1 });
  const original = structuredClone(initial);
  const forecast = forecastQuest(initial, rules, 14);
  assert.equal(forecast.groups.middle, forecast.samples);
  assert.equal(forecast.median, 0);
  assert.deepEqual(initial, original);
  assert.equal(forecastQuest(state({ used: 14 }), rules, 14).groups.lower, forecast.samples);
  assert.equal(forecastQuest(state({ used: 11, rescueCredits: 1 }), rules, 11).groups.lower, forecast.samples);
  const later = forecastQuest(state({ used: 11, rescueCredits: 1 }), rules, 12);
  assert.equal(later.groups.middle, later.samples);
  const disabled = forecastQuest(initial, { ...rules, rescue: { ...rules.rescue, enabled: false } }, 14);
  assert.equal(disabled.groups.lower, disabled.samples);
});

test("goal distance respects gates, board versions, chosen branches and offered shortcuts", () => {
  const v2 = rules.boardVersion, v3 = "quest-board-v3";
  assert.equal(questGoalDistance(state({ tileId: "s4-08" }), v3), 0);
  assert.equal(questGoalDistance(state({ tileId: "s4-00" }), v3), 8);
  assert.equal(questGoalDistance(state({ tileId: "s3-20" }), v3), 9);
  const fork = state({ tileId: "s3-05", pending: { kind: "branch", steps: 0 } });
  assert.equal(questGoalDistance(fork, v3), 9);
  assert.equal(questGoalDistance(fork, v2), 24);
  assert.equal(questGoalDistance({ ...fork, branch: "bridge", pending: null }, v3), 24);
  assert.equal(questGoalDistance(state({ tileId: "s3-loop-05", branch: "flower" }), v3), 10);
  assert.equal(questGoalDistance(state({ tileId: "s3-loop-05", branch: "flower" }), v2), 23);
  const shortcut = state({ tileId: "s1-07", pending: { kind: "shortcut", steps: 0 } });
  assert.equal(questGoalDistance(shortcut, v3), 14);
  assert.ok(questGoalDistance({ ...shortcut, pending: null }, v3) > 14);
});
