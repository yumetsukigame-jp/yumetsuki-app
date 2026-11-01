const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const admin = require("firebase-admin");
const sharp = require("sharp");
const project = "demo-yumetsuki-release";
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error("Local emulator required");
admin.initializeApp({ projectId: project });
const db = admin.firestore();
const fulfillment = require("../lib/fulfillment");
const nanika = require("../lib/nanikaGacha");
const profiles = require("../lib/userProfile");
const gacha = require("../lib/gacha");
const context = uid => ({ auth: { uid, token: { email: `${uid}@example.invalid` } } });
const call = (api, name, data, uid = "admin") => api[name].run(data, context(uid));
before(async () => {
  await db.doc("admins/admin").set({});
  for (const uid of ["alice", "bob"]) await db.doc(`users/${uid}`).set({ points: 100, xAccount: `@${uid}` });
});
after(async () => {
  assert.equal((await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" })).status, 200);
  await require("firebase-admin/app").deleteApp(admin.app());
});
test("real transactions preserve last-item stock and replay-safe reward spending", async () => {
  await db.doc("rewards/item").set({ name: "Fixture", cost: 30, stock: 1 });
  const requests = ["alice", "bob"].map(uid => ({ rewardId: "item", requestId: uid, cost: 30, participantUid: uid, confirmed: true }));
  const outcomes = await Promise.allSettled(requests.map(request => call(fulfillment, "redeemReward", request, request.participantUid)));
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  const winnerIndex = outcomes.findIndex(result => result.status === "fulfilled");
  await call(fulfillment, "redeemReward", requests[winnerIndex], requests[winnerIndex].participantUid);
  assert.equal((await db.doc("rewards/item").get()).get("stock"), 0);
  assert.equal((await db.doc("users/alice").get()).get("points") + (await db.doc("users/bob").get()).get("points"), 170);
});
test("real ordinary draw and shipping claim preserve net points and exclude a second prize", async () => {
  await db.doc("users/alice").update({ points: 100 });
  await db.doc("gachaCodes/code").set({
    title: "Fixture", mode: "count", resetType: "none", publicFlags: [], thumbnail: "original.png",
    point: { cost: 10, maxPerUser: 5 },
    frames: [
      { label: "WIN", rewardMin: 20, rewardMax: 20, maxCount: 1, shippingEnabled: true },
      { label: "LOSE", rewardMin: 0, rewardMax: 0, maxCount: 0 },
    ],
  });
  const result = await call(gacha, "useGachaCode", { code: "code" }, "alice");
  const request = { resultId: result.resultId, choice: "shipping", participantUid: "alice", confirmed: true };
  const first = await call(fulfillment, "claimGachaShipping", request, "alice");
  const repeated = await call(fulfillment, "claimGachaShipping", request, "alice");
  assert.equal(first.requestId, repeated.requestId);
  assert.equal((await db.doc("users/alice").get()).get("points"), 90);
  assert.equal((await db.doc(`shippingPending/${first.requestId}`).get()).get("cost"), 20);
});
test("real Nanika binary images, reservation, archive and expired conversion work together", async () => {
  await db.doc("users/alice").update({ points: 100 });
  const image = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#18678a" } }).png().toBuffer();
  await call(nanika, "adminUploadNanikaImage", { tier: "psa", id: "fixture", name: "Fixture", base64: image.toString("base64") });
  assert.ok(Buffer.isBuffer((await db.doc("nanikaGachaImages/fixture").get()).get("thumbnail")));
  await call(nanika, "adminSaveNanikaGacha", { tier: "psa", version: 0, fee: 10, exchangePoints: 30, visible: true, xAccounts: ["@alice"] });
  let slot = (await db.doc("nanikaGachaSlots/psa").get()).data();
  const { receipt } = await call(nanika, "drawNanikaGacha", {
    tier: "psa", requestId: "once", fee: 10, exchangePoints: 30, roundId: slot.roundId, consent72h: true, participantUid: "alice",
  }, "alice");
  assert.equal(receipt.deadline - receipt.acceptedAt, 72 * 3600000);
  slot = (await db.doc("nanikaGachaSlots/psa").get()).data();
  await call(nanika, "adminEndNanikaGacha", { tier: "psa", roundId: slot.roundId, version: slot.version, confirmed: true });
  assert.equal((await db.doc(`nanikaGachaRounds/${slot.roundId}`).get()).exists, false);
  await db.doc(`nanikaGachaReceipts/${receipt.id}`).update({ deadline: admin.firestore.Timestamp.fromMillis(Date.now() - 1) });
  const response = await call(nanika, "getNanikaGachaReceipt", { id: receipt.id }, "alice");
  assert.equal(response.receipt.automatic, true);
  assert.equal((await db.doc("users/alice").get()).get("points"), 120);
  assert.equal((await db.doc(`nanikaGachaArchives/${slot.roundId}/entries/${receipt.id}`).get()).get("choice"), "points");
  assert.equal((await db.doc("nanikaGachaInventory/psa").get()).get("available"), 1);
});
test("real profile signup, frozen X and admin edits retain uniqueness", async () => {
  await call(profiles, "createUserProfile", { name: "Carol", displayName: "Carol", xAccount: "@carol" }, "carol");
  await db.doc("users/carol").update({ xAccountConfirmed: true });
  await assert.rejects(call(profiles, "updateUserProfile", { name: "Carol", displayName: "Carol", xAccount: "@new" }, "carol"), error => error.code === "permission-denied");
  await call(profiles, "adminUpdateUserXAccount", { uid: "carol", xAccount: "@new" });
  await assert.rejects(call(profiles, "createUserProfile", { name: "Other", displayName: "Other", xAccount: "@new" }, "other"), error => error.code === "already-exists");
  await call(profiles, "adminDeleteUserProfile", { uid: "carol" });
  await call(profiles, "createUserProfile", { name: "Other", displayName: "Other", xAccount: "@new" }, "other");
  assert.equal((await db.doc("users/other").get()).get("points"), 0);
});
