/* eslint-disable @typescript-eslint/no-require-imports -- Real demo-only Firebase Emulator integration tests. */
const assert = require("node:assert/strict");
const { test, after, mock } = require("node:test");
const { randomUUID } = require("node:crypto");
const admin = require("firebase-admin");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { initializeApp, deleteApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require("firebase/auth");
const { getFirestore: clientFirestore, connectFirestoreEmulator, doc, getDoc, setDoc } = require("firebase/firestore");
if (process.env.GCLOUD_PROJECT !== "demo-yumetsuki" ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "") ||
    !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")) {
  throw new Error("Quest tests require demo-yumetsuki on loopback. Never run on production.");
}
const api = require("../lib/quest");
const { initialQuestState, updateQuestScore } = require("../lib/quest/engine");
const { getYesterdayJST6 } = require("../lib/common/date");
const { rules } = require("./quest-fixtures.cjs");
const db = getFirestore(), clients = [], adminUid = `admin-${randomUUID()}`;
const ctx = (uid) => ({ auth: { uid } });
const setup = db.doc(`admins/${adminUid}`).set({ testOnly: true });
async function call(name, data, actor = adminUid) {
  await setup;
  return api[name].run(data, actor ? ctx(actor) : {});
}
async function run(overrides = {}) {
  const ref = db.collection("questRuns").doc();
  await ref.set({ title: "Emulator only", description: "", thumbnail: "/quest/menu-thumbnail-v2.jpg",
    startsAt: Date.now() - 600000, endsAt: Date.now() + 600000,
    publicFlags: ["public"], xAccountList: [], codeHash: require("node:crypto").createHash("sha256").update("").digest("hex"),
    rules, version: 1, createdAt: Date.now(), state: "published", ...overrides });
  await db.doc("questConfig/current").set({ runId: ref.id });
  return ref;
}
async function join(ref, uid = randomUUID()) {
  await db.doc(`users/${uid}`).set({ displayName: "Test", points: 42 });
  await call("joinQuest", { runId: ref.id }, uid);
  return uid;
}
async function seed(ref, uid, changes) {
  const player = { ...(await ref.collection("players").doc(uid).get()).data(), ...changes };
  updateQuestScore(player, rules);
  await ref.collection("players").doc(uid).set(player);
  return player;
}
const action = (ref, uid, version, name = "roll", requestId = randomUUID()) =>
  call("actQuest", { runId: ref.id, requestId, version, action: name }, uid);
after(async () => {
  mock.restoreAll();
  await Promise.all(clients.map(deleteApp));
  await Promise.all(admin.apps.map(app => app.delete()));
});
test("menu settings default to admin, support subscribers/public, reject unauthorized or stale writes, and do not restrict Quest APIs", async () => {
  const ref = await run(), ordinary = randomUUID(), subscriber = randomUUID();
  await Promise.all([
    db.doc("questConfig/menu").delete(),
    db.doc(`users/${ordinary}`).set({ subscriber: false }),
    db.doc(`users/${subscriber}`).set({ subscriber: true }),
  ]);
  assert.deepEqual(await call("getQuestMenuAccess", {}, adminUid), { mode: "admin", version: 0, allowed: true });
  for (const actor of [ordinary, subscriber, null]) {
    assert.deepEqual(await call("getQuestMenuAccess", {}, actor), { mode: "admin", version: 0, allowed: false });
  }
  assert.equal((await call("getQuest", {}, ordinary)).run.id, ref.id);
  await assert.rejects(call("adminSetQuestMenuAccess", { mode: "public", version: 0 }, ordinary), { code: "permission-denied" });
  await assert.rejects(call("adminSetQuestMenuAccess", { mode: "public", version: 0 }, null), { code: "unauthenticated" });
  await call("adminSetQuestMenuAccess", { mode: "subscriber", version: 0 });
  assert.equal((await call("getQuestMenuAccess", {}, ordinary)).allowed, false);
  assert.equal((await call("getQuestMenuAccess", {}, subscriber)).allowed, true);
  assert.equal((await call("getQuestMenuAccess", {}, adminUid)).allowed, true);
  assert.equal((await call("getQuestMenuAccess", {}, null)).allowed, false);
  await db.doc(`users/${subscriber}`).update({ subscriber: "true" });
  assert.equal((await call("getQuestMenuAccess", {}, subscriber)).allowed, false);
  await assert.rejects(call("adminSetQuestMenuAccess", { mode: "public", version: 0 }), { code: "aborted" });
  await call("adminSetQuestMenuAccess", { mode: "public", version: 1 });
  for (const actor of [ordinary, subscriber, adminUid, null]) assert.equal((await call("getQuestMenuAccess", {}, actor)).allowed, true);
  const changes = await Promise.allSettled(["admin", "subscriber"].map(mode => call("adminSetQuestMenuAccess", { mode, version: 2 })));
  assert.equal(changes.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(changes.filter(item => item.status === "rejected" && item.reason.code === "aborted").length, 1);
  await call("adminSetQuestMenuAccess", { mode: "admin", version: 3 });
  await assert.rejects(call("adminSetQuestMenuAccess", { mode: "unsupported", version: 4 }), { code: "invalid-argument" });
  assert.equal((await db.doc("questConfig/current").get()).get("runId"), ref.id);
  assert.deepEqual(Object.keys(await call("getQuestMenuAccess", {})).sort(), ["allowed", "mode", "version"]);
});
test("current run/player/ranking never mixes past runs, and archive selection is explicit", async () => {
  const past = await run(), uid = await join(past);
  await seed(past, uid, { tileId: "s3-10", used: 9, starPoints: 48 });
  await call("adminFinalizeQuest", { runId: past.id, confirmed: true });
  const current = await run();
  await db.doc(`users/${uid}`).set({ points: 42 });
  const before = await call("getQuest", {}, uid);
  assert.equal(before.run.id, current.id);
  assert.equal(before.player, null);
  await call("joinQuest", { runId: current.id }, uid);
  assert.equal((await call("getQuest", {}, uid)).player.tileId, "s1-00");
  await assert.rejects(call("getQuest", { runId: past.id }, uid), { code: "aborted" });
  await assert.rejects(call("listQuestProgress", { runId: past.id }, uid));
  assert.equal((await call("getQuest", { runId: past.id, archive: true }, uid)).player.tileId, "s3-10");
  assert.equal((await call("listQuestProgress", { runId: current.id }, uid)).items.length, 1);
  const publicData = JSON.stringify(await call("getQuest", {}, null));
  assert.ok(!publicData.includes("codeHash"));
  assert.ok(!publicData.includes("xAccountList"));
});
test("concurrent resend is exactly once; conflicting request IDs/versions reject; replay survives close", async () => {
  const ref = await run(), uid = await join(ref);
  await seed(ref, uid, { normalGranted: 14 });
  const requestId = randomUUID();
  const results = await Promise.all(Array.from({ length: 5 }, () => action(ref, uid, 0, "roll", requestId)));
  assert.ok(results.every(item => item.player.used === 1 && item.player.lastDie === results[0].player.lastDie));
  assert.equal((await ref.collection("players").doc(uid).collection("actions").get()).size, 1);
  await assert.rejects(action(ref, uid, 0, "sync", requestId), { code: "already-exists" });
  const concurrent = await Promise.allSettled([action(ref, uid, 1), action(ref, uid, 1)]);
  assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1);
  await call("adminFinalizeQuest", { runId: ref.id, confirmed: true });
  assert.deepEqual((await action(ref, uid, 0, "roll", requestId)).player, results[0].player);
  await assert.rejects(action(ref, uid, 2));
  assert.equal((await db.doc(`users/${uid}`).get()).get("points"), 42);
});
test("fork zero/remaining-step state resumes after reconnect without another die", async () => {
  const ref = await run(), uid = await join(ref);
  const pending = { ...initialQuestState(), tileId: "s3-05", used: 8, normalGranted: 14,
    starPoints: 35, pending: { kind: "branch", steps: 3 }, version: 8, lastDie: 5 };
  await seed(ref, uid, pending);
  const reload = await call("getQuest", {}, uid);
  assert.deepEqual(reload.player.pending, pending.pending);
  const requestId = randomUUID();
  const chosen = await action(ref, uid, 8, "flower", requestId);
  assert.equal(chosen.player.tileId, "s3-loop-03");
  assert.equal(chosen.player.used, 8);
  assert.equal(chosen.player.starPoints, 66);
  assert.deepEqual((await action(ref, uid, 8, "flower", requestId)).player, chosen.player);
  const snapshot = await ref.collection("turns").doc("8").collection("players").doc(chosen.player.publicId).get();
  assert.equal(snapshot.get("tileId"), "s3-loop-03");
});
test("shortcut offer survives reload; decline remains optional and idempotent", async () => {
  const ref = await run(), uid = await join(ref);
  await seed(ref, uid, { used: 5, tileId: "s1-07", starPoints: 12, normalGranted: 14,
    originalRolls: [1, 2, 1, 2, 1], shortcut: "offered", pending: { kind: "shortcut", steps: 0 } });
  assert.equal((await call("getQuest", {}, uid)).player.pending.kind, "shortcut");
  await assert.rejects(action(ref, uid, 0));
  const chosen = await action(ref, uid, 0, "shortcut-skip");
  assert.equal(chosen.player.tileId, "s1-07");
  assert.equal(chosen.player.used, 5);
  assert.equal(chosen.player.shortcut, "declined");
});
test("normal/rescue admin grants are atomic, capped, and individually idempotent", async () => {
  const ref = await run(), uid = await join(ref);
  const grant = { runId: ref.id, uid, grantId: randomUUID(), kind: "normal", count: 14, reason: "Synthetic only" };
  const results = await Promise.all(Array.from({ length: 4 }, () => call("grantQuest", grant)));
  assert.equal(results.filter(item => item.granted).length, 1);
  await assert.rejects(call("grantQuest", { ...grant, count: 1 }), { code: "already-exists" });
  await assert.rejects(call("grantQuest", { ...grant, grantId: randomUUID() }));
  const rescue = { ...grant, grantId: randomUUID(), kind: "rescue", count: 1 };
  await call("grantQuest", rescue);
  await call("grantQuest", rescue);
  const player = (await ref.collection("players").doc(uid).get()).data();
  assert.equal(player.normalGranted, 14);
  assert.equal(player.rescueCredits, 1);
  assert.equal(player.version, 2);
  await assert.rejects(call("grantQuest", { ...rescue, grantId: randomUUID() }));
  await assert.rejects(call("grantQuest", grant, uid), { code: "permission-denied" });
});
test("daily carry-over grants use unique day+uid IDs and synchronize just once", async () => {
  const startsAt = Date.now() - 3 * 86400000;
  const ref = await run({ startsAt, rules: { ...rules, distribution: { ...rules.distribution, mode: "daily" } } });
  const uid = await join(ref), requestId = randomUUID();
  const received = await action(ref, uid, 0, "sync", requestId);
  assert.equal(received.player.normalGranted, 4);
  assert.equal((await action(ref, uid, 0, "sync", requestId)).player.normalGranted, 4);
  const grants = await ref.collection("grants").get();
  assert.equal(grants.size, 4);
  assert.ok(grants.docs.every(doc => doc.id.startsWith("day-") && doc.get("count") === 1));
  await assert.rejects(action(ref, uid, 1, "sync"));
  const unclaimed = await join(ref);
  assert.equal((await call("getQuest", {}, unclaimed)).dueDice, 4);
  await call("adminFinalizeQuest", { runId: ref.id, confirmed: true });
  assert.equal((await call("getQuest", {}, unclaimed)).dueDice, 0);
  assert.equal((await call("getQuest", { runId: ref.id, archive: true }, unclaimed)).dueDice, 0);
});
test("eligibility flags are conjunctive, normalized like gacha, and saved at join", async () => {
  const ref = await run({ publicFlags: ["public", "subscriber", "nibuichi_winner", "x_account_match"], xAccountList: ["＠TEST_user"] });
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ subscriber: false, xAccount: "@test_user" });
  await assert.rejects(call("joinQuest", { runId: ref.id }, uid), { code: "permission-denied" });
  await db.doc(`users/${uid}`).update({ subscriber: true });
  await assert.rejects(call("joinQuest", { runId: ref.id }, uid), { code: "permission-denied" });
  await db.doc(`nibuichi_daily/${getYesterdayJST6()}/predictions/${uid}`).set({ prediction: "nibuichi", result: "nibuichi" });
  await call("joinQuest", { runId: ref.id }, uid);
  await db.doc(`users/${uid}`).update({ subscriber: false, xAccount: "@other" });
  await seed(ref, uid, { normalGranted: 1 });
  assert.equal((await action(ref, uid, 0)).player.used, 1);
});
test("private codes unlock only their run, do not bypass eligibility, and never leak in archives or guest data", async () => {
  const code = "quest-test-code", codeHash = require("node:crypto").createHash("sha256").update(code).digest("hex");
  const ref = await run({ publicFlags: ["limited", "subscriber"], codeHash });
  const uid = randomUUID();
  await db.doc(`users/${uid}`).set({ subscriber: false });
  assert.equal((await call("getQuest", {}, uid)).run, null);
  await assert.rejects(call("unlockQuest", { code: "wrong-code" }, uid), { code: "permission-denied" });
  await call("unlockQuest", { code }, uid);
  assert.equal((await call("getQuest", {}, uid)).reason, "サブスク限定です");
  await assert.rejects(call("joinQuest", { runId: ref.id }, uid), { code: "permission-denied" });
  await db.doc(`users/${uid}`).update({ subscriber: true });
  await call("joinQuest", { runId: ref.id }, uid);
  await call("adminFinalizeQuest", { runId: ref.id, confirmed: true });
  assert.ok(!JSON.stringify(await call("listQuestArchives", {})).includes(ref.id));
  await assert.rejects(call("listQuestArchives", { cursor: ref.id }));
  assert.equal((await call("getQuest", { runId: ref.id, archive: true }, uid)).run.id, ref.id);
  const publicRun = await run();
  await publicRun.collection("players").doc("_guest").set({ privateValue: "must-not-leak" });
  assert.equal((await call("getQuest", {}, null)).player, null);
});
test("event rescue verifies real result schema, release time, source and duplicate delivery", async () => {
  const ref = await run(), uid = await join(ref), eventId = "2026-11-23";
  await db.doc(`nibuichi_daily/${eventId}/predictions/${uid}`).set({
    prediction: "nibuichi", result: "nibuichi", createdAt: Timestamp.now(),
  });
  const claim = { runId: ref.id, source: "nibuichi", eventId };
  assert.equal((await call("claimQuestEventRescue", claim, uid)).granted, true);
  assert.equal((await call("claimQuestEventRescue", claim, uid)).granted, false);
  const other = await join(ref), neraiuchiId = randomUUID();
  await db.doc(`neraiuchiEvents/${neraiuchiId}`).set({ state: "draft", endsAt: Timestamp.fromMillis(Date.now() - 1000) });
  await db.doc(`neraiuchiEvents/${neraiuchiId}/entries/${other}`).set({ isWinner: true });
  const win = { runId: ref.id, source: "neraiuchi", eventId: neraiuchiId };
  await assert.rejects(call("claimQuestEventRescue", win, other));
  await db.doc(`neraiuchiEvents/${neraiuchiId}`).update({ state: "closed", closedAt: Timestamp.now() });
  assert.equal((await call("claimQuestEventRescue", win, other)).granted, true);
});
test("end-exclusive time and concurrent finalization cannot advance or grant after closure", async () => {
  const ref = await run(), uid = await join(ref);
  await seed(ref, uid, { normalGranted: 14 });
  await Promise.allSettled([action(ref, uid, 0), call("adminFinalizeQuest", { runId: ref.id, confirmed: true })]);
  const player = (await ref.collection("players").doc(uid).get()).data();
  assert.equal(player.result.used, player.used);
  assert.equal(player.result.tileId, player.tileId);
  assert.ok([0, 1].includes(player.used));
  await assert.rejects(action(ref, uid, player.version));
  await assert.rejects(call("grantQuest", { runId: ref.id, uid, grantId: randomUUID(), kind: "rescue", count: 1, reason: "closed" }));
  const ended = await run({ endsAt: Date.now() + 1000 }), person = await join(ended);
  await seed(ended, person, { normalGranted: 14 });
  const end = (await ended.get()).get("endsAt");
  try {
    mock.method(Date, "now", () => end);
    await assert.rejects(action(ended, person, 0));
  } finally { mock.restoreAll(); }
  const granting = await run(), target = await join(granting);
  const grant = { runId: granting.id, uid: target, grantId: randomUUID(), kind: "rescue", count: 1, reason: "close race" };
  const [delivery] = await Promise.allSettled([call("grantQuest", grant),
    call("adminFinalizeQuest", { runId: granting.id, confirmed: true })]);
  const frozen = (await granting.collection("players").doc(target).get()).data();
  assert.ok([0, 1].includes(frozen.rescueCredits));
  assert.ok(frozen.result);
  if (delivery.status === "fulfilled") assert.equal((await call("grantQuest", grant)).granted, false);
  else await assert.rejects(call("grantQuest", grant));
});
test("finalization resumes pages, hides partial summary, and never double-counts", async () => {
  const ref = await run(), batch = db.batch();
  for (let i = 0; i < 105; i++) batch.set(ref.collection("players").doc(`test-${String(i).padStart(3, "0")}`), {
    ...initialQuestState(), publicId: randomUUID(), displayName: "Test", normalGranted: 0,
    rescueGranted: 0, result: null, used: i % 2 ? 14 : 0, eligibleAt: Date.now(), eligibility: ["public"],
  });
  await batch.commit();
  const first = await call("adminFinalizeQuest", { runId: ref.id, confirmed: true });
  assert.equal(first.complete, false);
  assert.equal(first.summary.total, 100);
  assert.equal((await call("getQuest", {}, null)).run.summary, undefined);
  const second = await call("adminFinalizeQuest", { runId: ref.id, confirmed: true });
  assert.equal(second.complete, true);
  assert.equal(second.summary.total, 105);
  assert.equal(second.summary.completed, 52);
  assert.deepEqual(await call("adminFinalizeQuest", { runId: ref.id, confirmed: true }), second);
  assert.equal((await ref.get()).get("state"), "archived");
});
test("tie ranks paginate consistently without exposing UID/private data", async () => {
  const ref = await run(), uid = await join(ref), batch = db.batch();
  for (let i = 0; i < 30; i++) batch.set(ref.collection("progress").doc(`public-${String(i).padStart(2, "0")}`), {
    displayName: `Test ${i}`, tileId: "s3-03", level: 4, used: 9, score: 50, uid: "MUST_NOT_LEAK", originalRolls: [6],
  });
  await batch.commit();
  const first = await call("listQuestProgress", { runId: ref.id }, uid);
  const second = await call("listQuestProgress", { runId: ref.id, cursor: first.nextCursor }, uid);
  assert.equal(first.items.length, 25);
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 31);
  assert.ok(first.items.every(row => row.rank === 1));
  assert.equal(first.own.rank, 31);
  assert.ok(!JSON.stringify(first).includes("MUST_NOT_LEAK"));
  assert.ok(!JSON.stringify(first).includes("originalRolls"));
});
test("publishing requires the latest saved simulation and explicit configuration confirmation", async () => {
  const old = await run();
  await call("adminFinalizeQuest", { runId: old.id, confirmed: true });
  const draft = {
    title: "Test draft", description: "", thumbnail: "/quest/menu-thumbnail-v2.jpg",
    startsAt: Date.now() + 600000, endsAt: Date.now() + 1200000, publicFlags: ["public"],
    xAccountList: [], accessCode: "", rules,
  };
  const saved = await call("adminSaveQuest", { draft });
  const publish = { runId: saved.runId, version: saved.version, confirmed: true, reviewNote: "Synthetic emulator confirmation. Not a real event." };
  await assert.rejects(call("adminPublishQuest", publish));
  const simulated = await call("adminSimulateQuest", { runId: saved.runId, version: saved.version });
  assert.equal(simulated.reports.length, 6);
  const updated = await call("adminSaveQuest", { runId: saved.runId, version: saved.version, draft });
  await assert.rejects(call("adminPublishQuest", publish));
  await assert.rejects(call("adminPublishQuest", { ...publish, version: updated.version }));
  await call("adminSimulateQuest", updated);
  await assert.rejects(call("adminPublishQuest", { ...publish, version: updated.version, confirmed: false }));
  await call("adminPublishQuest", { ...publish, version: updated.version });
  await assert.rejects(call("adminSaveQuest", { runId: saved.runId, version: updated.version + 1, draft }));
});
test("client Rules deny all Quest data to participants and admins, including nested/private paths", async () => {
  const app = initializeApp({ projectId: "demo-yumetsuki", apiKey: "fake-api-key" }, `quest-${randomUUID()}`);
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const user = (await createUserWithEmailAndPassword(auth, `quest-${randomUUID()}@example.test`, "test-password")).user;
  await db.doc(`admins/${user.uid}`).set({ testOnly: true });
  const store = clientFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(store, host, Number(port));
  for (const path of ["questConfig/current", "questRuns/private", `questRuns/private/players/${user.uid}`,
    "questRuns/private/progress/public", "questRuns/private/turns/8/players/public", "questRuns/private/grants/id"]) {
    await db.doc(path).set({ secret: true });
    await assert.rejects(getDoc(doc(store, path)), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(store, path), { score: 999 }), { code: "permission-denied" });
  }
});
