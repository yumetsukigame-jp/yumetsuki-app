import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ShippingPoints from "../../components/nanika-gacha/ShippingPoints";
import type { NanikaSlot } from "../../functions/src/nanikaGachaTypes";
import { isNanikaShipping, nanikaDrawBlockReason, nanikaDrawCost } from "./nanikaGachaDisplay";

const slot: NanikaSlot = {
  tier: "psa", fee: 35, exchangePoints: 120, visible: true, publishedAt: null,
  version: 1, roundId: "round", available: 2, remainingRights: 1, remainingUses: 1,
};

test("winning rights cost zero and remain usable when challenge points are insufficient or unknown", () => {
  assert.equal(nanikaDrawCost(slot, true), 0);
  assert.equal(nanikaDrawCost(slot, false), 35);
  assert.equal(nanikaDrawBlockReason(slot, true, 0), null);
  assert.equal(nanikaDrawBlockReason(slot, true, null), null);
  assert.equal(nanikaDrawBlockReason(slot, false, 10), "あと25 pt必要です。");
  assert.match(nanikaDrawBlockReason(slot, false, null)!, /残高を確認できません/);
});

test("identifies Nanika shipping even in old history records without a preserved source or image ID", () => {
  assert.equal(isNanikaShipping({ nanikaImageId: "prize" }), true);
  assert.equal(isNanikaShipping({ image: "/api/nanika-gacha/images/prize" }), true);
  assert.equal(isNanikaShipping({ image: "/rewards/item.webp" }), false);
  assert.equal(isNanikaShipping({ image: null }), false);
});

test("shipping displays no extra charge rather than mislabeling the prize's receive-points value as a cost", () => {
  const nanika = renderToStaticMarkup(createElement(ShippingPoints, {
    record: { cost: 120, image: "/api/nanika-gacha/images/prize" }, label: "消費ポイント",
  }));
  assert.match(nanika, /発送時の追加消費/);
  assert.match(nanika, /0 pt/);
  assert.doesNotMatch(nanika, /120/);
  assert.match(nanika, /href="\/nanika-gacha\/history"/);
  const ordinary = renderToStaticMarkup(createElement(ShippingPoints, {
    record: { cost: 120, image: "/rewards/item.webp" }, label: "消費ポイント",
  }));
  assert.match(ordinary, /消費ポイント/);
  assert.match(ordinary, /120 pt/);
  assert.doesNotMatch(ordinary, /発送時の追加消費/);
  const admin = renderToStaticMarkup(createElement(ShippingPoints, {
    record: { cost: 120, nanikaImageId: "prize" }, label: "ポイント", admin: true,
  }));
  assert.match(admin, /受取ポイント（発送では付与されません）/);
  assert.match(admin, /120 pt/);
  assert.doesNotMatch(admin, /href=/);
});

test("challenge rights use the configured cost, including zero, not the receive-points value", () => {
  assert.equal(nanikaDrawBlockReason(slot, false, 35), null);
  const free = { ...slot, fee: 0 };
  assert.equal(nanikaDrawCost(free, false), 0);
  assert.equal(nanikaDrawBlockReason(free, false, 0), null);
  assert.equal(nanikaDrawBlockReason(free, false, null), null);
});

test("each right is enabled independently and unavailable campaigns or stock block both", () => {
  assert.equal(nanikaDrawBlockReason({ ...slot, remainingUses: 0 }, true, 100), null);
  assert.equal(nanikaDrawBlockReason({ ...slot, remainingUses: 0 }, false, 100), "挑戦権利がありません。");
  assert.equal(nanikaDrawBlockReason({ ...slot, remainingRights: 0 }, false, 100), null);
  assert.equal(nanikaDrawBlockReason({ ...slot, remainingRights: 0 }, true, 100), "当選権利がありません。");
  for (const useRight of [true, false]) {
    assert.match(nanikaDrawBlockReason({ ...slot, visible: false }, useRight, 100)!, /準備中/);
    assert.match(nanikaDrawBlockReason({ ...slot, available: 0 }, useRight, 100)!, /景品を準備/);
    assert.match(nanikaDrawBlockReason({ ...slot, fee: null }, useRight, 100)!, /情報を更新/);
  }
});
