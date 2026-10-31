import assert from "node:assert/strict";
import { test } from "node:test";
import type { NeraiuchiEntry, NeraiuchiEvent } from "../../functions/src/neraiuchiTypes";
import { nextNeraiuchiBoundary, participationDisplay } from "./neraiuchiDisplay";

const event: NeraiuchiEvent = {
  id: "test-round", title: "Test", description: "Test", thumbnailPath: "/menu/thumbnails/neraiuchi.png",
  startsAt: 1000, endsAt: 2000, entryCost: 0, maxPerAccount: 1,
  rewardLabel: "Hidden until end", claimInstructions: "Test", version: 2,
  availability: "open", resultsReleased: false,
};
const pending: NeraiuchiEntry = {
  eventId: event.id, eventTitleSnapshot: event.title, eventVersion: 2, acceptedAt: 1500, resultsReleased: false,
};

test("open rounds offer the prominent direct participation action", () => {
  assert.deepEqual(participationDisplay(event, null), {
    canParticipate: true, buttonLabel: "今回の狙い撃ちに参加", resultLabel: "結果未確定（終了後に公開）",
  });
});

test("pending participants have a disabled already-participated button without outcomes", () => {
  const display = participationDisplay(event, pending);
  assert.equal(display.canParticipate, false);
  assert.equal(display.buttonLabel, "すでに参加済み");
  assert.equal(display.resultLabel, "結果未確定（終了後に公開）");
});

test("ended rounds show final status even when the local entry still has a pending snapshot", () => {
  const ended = { ...event, resultsReleased: true, availability: "closed" as const };
  assert.deepEqual(participationDisplay(ended, pending), {
    canParticipate: false, buttonLabel: "すでに参加済み", resultLabel: "結果確定済み（終了）",
  });
  assert.equal(participationDisplay(ended, null).buttonLabel, "受付終了");
});

test("a revealed server receipt takes precedence over stale event status", () => {
  const revealed: NeraiuchiEntry = {
    ...pending, resultsReleased: true, number: 1, isWinner: false,
    rewardLabelSnapshot: "", claimInstructionsSnapshot: "Test", prize: null, claim: null,
  };
  assert.equal(participationDisplay(event, revealed).resultLabel, "結果確定済み（終了）");
  assert.equal(participationDisplay(event, revealed).canParticipate, false);
});

test("upcoming, disabled and capacity-stopped rounds never allow participation or disclose results early", () => {
  for (const availability of ["upcoming", "disabled", "closed", "full"] as const) {
    const display = participationDisplay({ ...event, availability }, null);
    assert.equal(display.canParticipate, false);
    assert.equal(display.resultLabel, "結果未確定（終了後に公開）");
    assert.ok(!display.buttonLabel.includes("上限"));
  }
  assert.equal(participationDisplay({ ...event, availability: "upcoming" }, null).buttonLabel, "受付開始前");
});

test("automatic refresh uses exact start/end boundaries and ignores already completed rounds", () => {
  assert.equal(nextNeraiuchiBoundary([event], 999), 1000);
  assert.equal(nextNeraiuchiBoundary([event], 1000), 2000);
  assert.equal(nextNeraiuchiBoundary([event], 1999), 2000);
  assert.equal(nextNeraiuchiBoundary([event], 2000), null);
  assert.equal(nextNeraiuchiBoundary([{ ...event, resultsReleased: true }], 999), null);
  assert.equal(nextNeraiuchiBoundary([], 0), null);
});
