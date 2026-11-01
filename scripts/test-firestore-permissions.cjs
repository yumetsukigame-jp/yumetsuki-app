/* eslint-disable @typescript-eslint/no-require-imports -- Local CommonJS rule-engine tests. */
const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");

const project = "demo-yumetsuki-release";
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("A local Firestore emulator is required");
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
function token(uid) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`,
    iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "custom", identities: {} },
  })}.`;
}
const actors = { anonymous: null, alice: token("alice"), bob: token("bob"), admin: token("admin") };
function fields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key,
    typeof value === "boolean" ? { booleanValue: value } :
    typeof value === "number" ? { integerValue: String(value) } : { stringValue: value },
  ]));
}
async function request(path, data, actor, method = "PATCH", partial = false) {
  const mask = partial ? "?" + Object.keys(data).map(key => `updateMask.fieldPaths=${key}`).join("&") : "";
  return fetch(`${base}/${path}${mask}`, {
    method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor}` } : {}) },
    ...(data ? { body: JSON.stringify({ fields: fields(data) }) } : {}),
  });
}
before(async () => {
  for (const [path, data] of [
    ["admins/admin", { active: true }],
    ["users/alice", { points: 100, xAccount: "@alice", xAccountConfirmed: false }],
    ["users/bob", { points: 100, xAccount: "@bob", xAccountConfirmed: false }],
  ]) assert.equal((await request(path, data, "owner")).status, 200);
});
after(async () => {
  const response = await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
  assert.equal(response.status, 200);
});
test("anonymous and signed-in users cannot alter authoritative financial and eligibility documents", async () => {
  const paths = [
    "users/alice", "users/bob", "admins/attacker", "xAccountClaims/claim",
    "validCodes/forged", "usedCodes/marker", "userGachaHistory/alice_code",
    "gachaCodes/code", "gachaResults/code/results/row", "gachaCodesArchive/code",
    "nibuichi_global/current", "nibuichi_user_predictions/alice", "nibuichi_daily/day/predictions/alice",
    "quizzes/live", "quizzes/live/answers/alice", "quizzes_archive/live",
    "quizzes_archive/live/answers/alice", "quizzes_archive/live/rewardAwards/alice",
    "rewards/item", "shippingPending/unpaid", "shippingDone/unpaid", "shippingHistory/unpaid",
    "selectedRewards/unpaid", "pointHistory/unpaid", "rewardRedemptions/id", "gachaShippingClaims/id",
    "nanikaGachaSlots/psa", "nanikaGachaRounds/round/entries/id",
    "nanikaGachaArchives/round/entries/id", "nanikaGachaInventory/psa/pages/0",
    "nanikaGachaImages/id", "nanikaGachaImageData/id", "nanikaGachaReceipts/id",
    "nanikaGachaPending/id", "nanikaGachaHistory/alice/entries/id",
    "neraiuchiEvents/event/entries/alice", "neraiuchiEventsArchive/event/entries/alice",
  ];
  for (const [actor, credential] of Object.entries(actors).filter(([name]) => name !== "admin")) {
    for (const path of paths) {
      const response = await request(path, { points: 9999 }, credential);
      assert.equal(response.status, 403, `${actor} must not write ${path}: ${await response.text()}`);
    }
  }
});
test("redemption locks and shipment records cannot be deleted by ordinary users", async () => {
  for (const path of ["usedCodes/id", "shippingPending/id", "selectedRewards/id", "rewardRedemptions/id"]) {
    assert.equal((await request(path, { uid: "alice" }, "owner")).status, 200);
    for (const credential of [null, actors.alice]) assert.equal((await request(path, null, credential, "DELETE")).status, 403);
  }
});
test("legacy administrator configuration, archive and fulfillment operations remain allowed", async () => {
  for (const path of [
    "validCodes/id", "gachaCodes/id", "gachaCodesArchive/id", "gachaResults/id/results/row",
    "gachaResultsArchive/id/results/row", "rewards/id", "shippingPending/id",
    "shippingDone/id", "shippingHistory/id", "selectedRewards/id", "pointHistory/id",
    "nibuichi_global_stats/stats", "homeAnnouncements/archiveUpdates", "imageMeta/id", "quizzes/live",
  ]) {
    assert.equal((await request(path, { label: "fixture" }, actors.admin)).status, 200, path);
    assert.equal((await request(path, null, actors.admin, "DELETE")).status, 200, path);
  }
  assert.equal((await request("users/alice", { points: 120, subscriber: true, xAccountConfirmed: true }, actors.admin, "PATCH", true)).status, 200);
  assert.equal((await request("users/alice", { points: -1 }, actors.admin, "PATCH", true)).status, 403);
  assert.equal((await request("users/bob", { points: -5 }, "owner", "PATCH", true)).status, 200);
  assert.equal((await request("users/bob", { subscriber: true, xAccountConfirmed: true }, actors.admin, "PATCH", true)).status, 200);
});
test("admin clients cannot bypass server-owned claims, awards or X uniqueness maintenance", async () => {
  for (const path of ["admins/new", "xAccountClaims/id", "usedCodes/id", "gachaShippingClaims/id",
    "rewardRedemptions/id", "userGachaHistory/id", "quizzes_archive/id/answers/alice",
    "quizzes/live/answers/alice", "nanikaGachaReceipts/id", "nibuichi_daily/day/predictions/alice"]) {
    assert.equal((await request(path, { owned: true }, actors.admin)).status, 403, path);
  }
  assert.equal((await request("users/alice", { xAccount: "@other" }, actors.admin, "PATCH", true)).status, 403);
  assert.equal((await request("users/alice", null, actors.admin, "DELETE")).status, 403);
});
test("personal Orica checks work for their owner and admin but not another user", async () => {
  const path = "users/alice/orica/item";
  assert.equal((await request(path, { owned: true }, actors.alice)).status, 200);
  assert.equal((await request(path, { owned: false }, actors.admin)).status, 200);
  assert.equal((await request(path, { owned: true }, actors.bob)).status, 403);
  assert.equal((await request(path, { owned: true, points: 9999 }, actors.alice)).status, 403);
  assert.equal((await request("users/alice/arbitrary/child", { points: 9999 }, actors.alice)).status, 403);
});
test("existing public reads remain available and new private records remain private", async () => {
  for (const path of ["users/alice", "users/alice/orica/item"]) assert.equal((await request(path, null, null, "GET")).status, 200);
  for (const path of ["gachaShippingClaims/id", "rewardRedemptions/id", "nanikaGachaReceipts/id"]) {
    assert.equal((await request(path, null, actors.alice, "GET")).status, 403);
  }
  assert.equal((await request("validCodes/private", { points: 50 }, "owner")).status, 200);
  for (const credential of [null, actors.alice]) {
    assert.equal((await request("validCodes/private", null, credential, "GET")).status, 403);
  }
  assert.equal((await request("validCodes/private", null, actors.admin, "GET")).status, 200);
});
