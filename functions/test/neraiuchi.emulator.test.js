/* eslint-disable @typescript-eslint/no-require-imports -- Run against compiled Functions with Node's test runner. */
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
  throw new Error("These tests require the isolated demo-yumetsuki loopback emulators. Never run on production.");
}
process.env.NERAIUCHI_ENABLED = "true";
const api = require("../lib/neraiuchi");
const db = getFirestore();
const context = (uid) => ({ auth: { uid } });
const adminUid = `admin-${randomUUID()}`;
const adminContext = context(adminUid);
const clients = [];
const setupAdmin = db.collection("admins").doc(adminUid).set({ testOnly: true });

async function invoke(name, data, actor = adminContext) {
  await setupAdmin;
  return api[name].run(data, actor);
}

async function event(overrides = {}) {
  const now = Date.now();
  const draft = {
    title: "Emulator-only event", description: "Synthetic test data. No points or shipping.",
    thumbnailPath: "/menu/thumbnails/neraiuchi.png",
    startsAt: now - 10000, endsAt: now + 600000, maxEntries: 100,
    winningNumbers: [1, 3], rewardLabel: "Test label", claimInstructions: "No real reward.",
    ...overrides,
  };
  if (overrides.prizes) { delete draft.winningNumbers; delete draft.rewardLabel; }
  const saved = await invoke("adminSaveNeraiuchiDraft", draft);
  const published = await invoke("adminPublishNeraiuchi", { eventId: saved.eventId, expectedVersion: saved.version });
  return { id: saved.eventId, version: published.version };
}

async function entryRecord(eventId, uid) {
  const records = await db.getAll(
    db.collection("neraiuchiEvents").doc(eventId).collection("entries").doc(uid),
    db.collection("neraiuchiEventsArchive").doc(eventId).collection("entries").doc(uid),
  );
  const record = records.find((snapshot) => snapshot.exists);
  assert.ok(record, "Participant record must remain under its active or archived round");
  return record;
}

async function join(eventId, uid) {
  await invoke("joinNeraiuchi", { eventId }, context(uid));
  // Allocation tests inspect private records, not the deliberately pending public DTO.
  const data = (await entryRecord(eventId, uid)).data();
  return {
    eventId: data.eventId, number: data.number, isWinner: data.isWinner,
    eventTitleSnapshot: data.eventTitleSnapshot, eventVersion: data.eventVersion,
    rewardLabelSnapshot: data.rewardLabelSnapshot, claimInstructionsSnapshot: data.claimInstructionsSnapshot,
    acceptedAt: data.acceptedAt.toMillis(), resultsReleased: true,
    prize: data.prizeSnapshot ? {
      label: data.prizeSnapshot.label, points: data.prizeSnapshot.points, shippingEnabled: data.prizeSnapshot.shippingEnabled,
    } : null, claim: data.claim ?? null,
  };
}

async function checkCount(eventId, expected) {
  const active = await db.collection("neraiuchiEvents").doc(eventId).get();
  const round = active.exists ? active : await db.collection("neraiuchiEventsArchive").doc(eventId).get();
  assert.ok(round.exists);
  const [counter, entries] = await Promise.all([
    active.exists ? db.collection("neraiuchiCounters").doc(eventId).get() : Promise.resolve(round),
    round.ref.collection("entries").get(),
  ]);
  assert.equal(counter.get("acceptedCount"), expected);
  assert.equal(entries.size, expected);
}

after(async () => {
  mock.restoreAll();
  await Promise.all(clients.map(deleteApp));
  await Promise.all(admin.apps.map((app) => app.delete()));
});

test("1 and 3 win, entries/history/audit commit together, no points or shipping side effects", async () => {
  const sideEffects = ["shippingPending", "selectedRewards", "pointHistory"];
  const before = await Promise.all(sideEffects.map(async (name) => (await db.collection(name).get()).size));
  const { id } = await event();
  const users = ["a", "b", "c"].map((prefix) => `${prefix}-${randomUUID()}`);
  const results = [];
  for (const uid of users) {
    await db.collection("users").doc(uid).set({ points: 42 });
    results.push(await join(id, uid));
  }
  assert.deepEqual(results.map((entry) => entry.number), [1, 2, 3]);
  assert.deepEqual(results.map((entry) => entry.isWinner), [true, false, true]);
  await checkCount(id, 3);
  for (let index = 0; index < users.length; index++) {
    const history = await db.collection("neraiuchiUserHistory").doc(users[index]).collection("items").doc(id).get();
    assert.equal(history.get("number"), index + 1);
    assert.ok(history.get("acceptedAt") instanceof Timestamp);
    assert.equal((await db.collection("users").doc(users[index]).get()).get("points"), 42);
  }
  const audits = await db.collection("neraiuchiAudit").where("eventId", "==", id).get();
  assert.equal(audits.docs.filter((item) => item.get("operation") === "join").length, 3);
  for (let index = 0; index < sideEffects.length; index++) {
    assert.equal((await db.collection(sideEffects[index]).get()).size, before[index]);
  }
});

test("20 distinct concurrent accounts get exactly 1 through 20 without duplicates", async () => {
  const { id } = await event();
  const results = await Promise.all(Array.from({ length: 20 }, () => join(id, randomUUID())));
  assert.deepEqual(results.map((entry) => entry.number).sort((a, b) => a - b),
    Array.from({ length: 20 }, (_, index) => index + 1));
  await checkCount(id, 20);
});

test("20 simultaneous retries from one account consume only one number", async () => {
  const { id } = await event();
  const uid = randomUUID();
  const results = await Promise.all(Array.from({ length: 20 }, () => join(id, uid)));
  assert.ok(results.every((entry) => entry.number === 1 && entry.acceptedAt === results[0].acceptedAt));
  await checkCount(id, 1);
});

test("capacity 10 with 20 concurrent accounts never allocates number 11", async () => {
  const { id } = await event({ maxEntries: 10 });
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => join(id, randomUUID())));
  const accepted = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(accepted.length, 10);
  assert.equal(rejected.length, 10);
  assert.ok(rejected.every((result) => result.reason.code === "failed-precondition"));
  assert.deepEqual(accepted.map((result) => result.value.number).sort((a, b) => a - b),
    Array.from({ length: 10 }, (_, index) => index + 1));
  await checkCount(id, 10);
});

test("start is inclusive and end is exclusive, regardless of client-supplied times", async () => {
  const startsAt = Date.now() + 10000;
  const endsAt = startsAt + 10000;
  const { id } = await event({ startsAt, endsAt });
  try {
    mock.method(Date, "now", () => startsAt - 1);
    await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
    mock.method(Date, "now", () => startsAt);
    assert.equal((await join(id, randomUUID())).number, 1);
    mock.method(Date, "now", () => endsAt);
    await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
  } finally { mock.restoreAll(); }
  await assert.rejects(invoke("joinNeraiuchi", { eventId: id, acceptedAt: startsAt, number: 1 }, context(randomUUID())),
    { code: "invalid-argument" });
  await checkCount(id, 1);
});

test("lost response/replay and closed/archived results keep the same entry and snapshots", async () => {
  const { id, version } = await event();
  const uid = randomUUID();
  const first = await join(id, uid);
  assert.deepEqual(await join(id, uid), first);
  await assert.rejects(invoke("adminSaveNeraiuchiDraft", {
    eventId: id, expectedVersion: version, title: "Changed",
    description: "Changed", thumbnailPath: "/menu/thumbnails/neraiuchi.png",
    startsAt: Date.now(), endsAt: Date.now() + 60000, maxEntries: 10,
    winningNumbers: [2], rewardLabel: "Changed", claimInstructions: "Changed",
  }), { code: "failed-precondition" });
  const closed = await invoke("adminCloseNeraiuchi", { eventId: id, expectedVersion: version, reason: "Test close" });
  assert.equal((await db.collection("neraiuchiEvents").doc(id).get()).exists, false);
  assert.equal((await db.collection("neraiuchiCounters").doc(id).get()).exists, false);
  assert.equal((await db.collection("neraiuchiSecrets").doc(id).get()).exists, false);
  const archived = await db.collection("neraiuchiEventsArchive").doc(id).get();
  assert.equal(archived.get("archiveComplete"), true);
  assert.equal(archived.get("version"), closed.version);
  assert.equal((await entryRecord(id, uid)).ref.parent.parent.path, archived.ref.path);
  assert.equal((await db.collection("neraiuchiUserHistory").doc(uid).collection("items").doc(id).get()).get("archived"), true);
  assert.ok(!(await invoke("adminListNeraiuchiEvents", {})).items.some((item) => item.id === id));
  assert.ok((await invoke("adminListNeraiuchiEvents", { archived: true })).items.some((item) => item.id === id));
  await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
  await invoke("adminArchiveNeraiuchi", { eventId: id, expectedVersion: closed.version });
  process.env.NERAIUCHI_ENABLED = "false";
  try {
    assert.deepEqual(await join(id, uid), first);
    assert.deepEqual((await invoke("getNeraiuchiEvent", { eventId: id }, context(uid))).entry, first);
    assert.deepEqual((await invoke("getNeraiuchiHistory", {}, context(uid))).items[0], first);
    await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
    assert.equal((await invoke("listNeraiuchiEvents", {}, context(uid))).enabled, false);
  } finally { process.env.NERAIUCHI_ENABLED = "true"; }
  await checkCount(id, 1);
});

test("close races with participation, and no join commits after closure", async () => {
  const { id, version } = await event();
  const results = await Promise.allSettled([
    invoke("adminCloseNeraiuchi", { eventId: id, expectedVersion: version, reason: "Race close" }),
    ...Array.from({ length: 10 }, () => join(id, randomUUID())),
  ]);
  assert.equal(results[0].status, "fulfilled");
  const accepted = results.slice(1).filter((result) => result.status === "fulfilled");
  const entries = await db.collection("neraiuchiEventsArchive").doc(id).collection("entries").get();
  assert.ok(entries.size >= accepted.length);
  for (const result of accepted) assert.ok(entries.docs.some((entry) => entry.get("number") === result.value.number));
  assert.ok(results.slice(1).filter((result) => result.status === "rejected")
    .every((result) => ["failed-precondition", "unavailable"].includes(result.reason.code)));
  await checkCount(id, entries.size);
  await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
});

test("unreached winning slots remain unawarded when time expires", async () => {
  const { id } = await event({ maxEntries: 3, winningNumbers: [3] });
  const uid = randomUUID();
  const first = await join(id, uid);
  assert.equal(first.isWinner, false);
  const snapshot = await db.collection("neraiuchiEvents").doc(id).get();
  try {
    mock.method(Date, "now", () => snapshot.get("endsAt").toMillis());
    const detail = await invoke("getNeraiuchiEvent", { eventId: id }, context(uid));
    assert.equal(detail.event.availability, "ended");
    assert.equal(detail.entry.isWinner, false);
    await assert.rejects(join(id, randomUUID()), { code: "failed-precondition" });
  } finally { mock.restoreAll(); }
  await checkCount(id, 1);
});

test("invalid numbers, reversed times, unsafe paths, stale versions and inconsistent secrets are rejected", async () => {
  const now = Date.now();
  const draft = {
    title: "Invalid test", description: "Synthetic", thumbnailPath: "/menu/thumbnails/neraiuchi.png",
    startsAt: now, endsAt: now + 100000, maxEntries: 10,
    winningNumbers: [1, 3], rewardLabel: "Synthetic", claimInstructions: "No reward",
  };
  for (const winningNumbers of [[], [0], [-1], [1.5], [11], [1, 1], Array(101).fill(1)]) {
    await assert.rejects(invoke("adminSaveNeraiuchiDraft", { ...draft, winningNumbers }), { code: "invalid-argument" });
  }
  for (const changes of [
    { endsAt: now - 1 }, { maxEntries: 10001 }, { maxEntries: 1.5 },
    { title: "x".repeat(81) }, { description: "<script>no</script>" },
    { thumbnailPath: "javascript:alert(1)" },
  ]) {
    await assert.rejects(invoke("adminSaveNeraiuchiDraft", { ...draft, ...changes }), { code: "invalid-argument" });
  }
  const saved = await invoke("adminSaveNeraiuchiDraft", draft);
  await assert.rejects(invoke("adminPublishNeraiuchi", { eventId: saved.eventId, expectedVersion: saved.version + 1 }),
    { code: "aborted" });
  await db.collection("neraiuchiSecrets").doc(saved.eventId).update({ winningNumbers: [11] });
  await assert.rejects(invoke("adminPublishNeraiuchi", { eventId: saved.eventId, expectedVersion: saved.version }),
    { code: "invalid-argument" });
  await db.collection("neraiuchiSecrets").doc(saved.eventId).update({ winningNumbers: [1, 3] });
  const published = await event();
  await db.collection("neraiuchiSecrets").doc(published.id).update({ publishedVersion: 999 });
  await assert.rejects(join(published.id, randomUUID()), { code: "failed-precondition" });
  await db.collection("neraiuchiSecrets").doc(published.id).update({ publishedVersion: published.version });
  await checkCount(published.id, 0);
});

test("auth, administrator revocation and UID spoofing are enforced server-side", async () => {
  const { id } = await event();
  for (const name of ["joinNeraiuchi", "getNeraiuchiHistory", "listNeraiuchiEvents"]) {
    await assert.rejects(invoke(name, name === "joinNeraiuchi" ? { eventId: id } : {}, {}),
      { code: "unauthenticated" });
  }
  await assert.rejects(invoke("adminListNeraiuchiEvents", {}, context(randomUUID())),
    { code: "permission-denied" });
  await assert.rejects(invoke("getNeraiuchiHistory", { uid: "other" }, context(randomUUID())),
    { code: "invalid-argument" });
  await assert.rejects(invoke("joinNeraiuchi", { eventId: id, uid: "other" }, context(randomUUID())),
    { code: "invalid-argument" });
  const revoked = randomUUID();
  await db.collection("admins").doc(revoked).set({});
  await invoke("adminListNeraiuchiEvents", {}, context(revoked));
  await db.collection("admins").doc(revoked).delete();
  await assert.rejects(invoke("adminListNeraiuchiEvents", {}, context(revoked)), { code: "permission-denied" });
});

test("public DTOs never return winning numbers, exact counts, secrets or other entries", async () => {
  const { id } = await event();
  const uid = randomUUID();
  await join(id, uid);
  const detail = await invoke("getNeraiuchiEvent", { eventId: id }, context(uid));
  const list = await invoke("listNeraiuchiEvents", {}, context(uid));
  const history = await invoke("getNeraiuchiHistory", {}, context(randomUUID()));
  for (const response of [detail, list, history]) {
    const json = JSON.stringify(response);
    for (const field of ["winningNumbers", "acceptedCount", "salt", "createdBy", "publishedVersion"]) {
      assert.ok(!json.includes(`"${field}"`), field);
    }
  }
  assert.deepEqual(history.items, []);
  assert.equal(detail.entry.resultsReleased, false);
  assert.ok(!("number" in detail.entry));
});

test("published list and user history paginate with validated cursors", async () => {
  const uid = randomUUID();
  const now = Date.now();
  const batch = db.batch();
  for (let index = 0; index < 21; index++) {
    batch.set(db.collection("neraiuchiEvents").doc(`page-${index}`), { state: "closed" });
    batch.set(db.collection("neraiuchiUserHistory").doc(uid).collection("items").doc(`page-${index}`), {
      eventId: `page-${index}`, number: 1, isWinner: false,
      eventTitleSnapshot: "Synthetic", rewardLabelSnapshot: "None", claimInstructionsSnapshot: "None",
      eventVersion: 1, acceptedAt: Timestamp.fromMillis(now + index),
    });
  }
  await batch.commit();
  const first = await invoke("getNeraiuchiHistory", {}, context(uid));
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = await invoke("getNeraiuchiHistory", { cursor: first.nextCursor }, context(uid));
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((entry) => entry.eventId)).size, 21);
  for (const bad of ["!", "e30", "a".repeat(513)]) {
    await assert.rejects(invoke("getNeraiuchiHistory", { cursor: bad }, context(uid)), { code: "invalid-argument" });
  }
  const targetIds = [];
  for (let index = 0; index < 21; index++) targetIds.push((await event()).id);
  const listedIds = [];
  let position;
  do {
    const page = await invoke("listNeraiuchiEvents", position ? { cursor: position } : {}, context(uid));
    assert.ok(page.items.length <= 20);
    listedIds.push(...page.items.map((item) => item.id));
    position = page.nextCursor;
  } while (position);
  assert.equal(new Set(listedIds).size, listedIds.length);
  assert.ok(targetIds.every((eventId) => listedIds.includes(eventId)));
});

test("admin entry pagination supports 128-character account IDs", async () => {
  const { id } = await event();
  const batch = db.batch();
  for (let index = 0; index < 51; index++) {
    const uid = index === 49 ? "u".repeat(128) : `entry-${index}`;
    batch.set(db.collection("neraiuchiEvents").doc(id).collection("entries").doc(uid), {
      uid, eventId: id, number: index + 1, isWinner: false,
      eventTitleSnapshot: "Synthetic", rewardLabelSnapshot: "None", claimInstructionsSnapshot: "None",
      eventVersion: 2, acceptedAt: Timestamp.now(),
    });
  }
  batch.update(db.collection("neraiuchiCounters").doc(id), { acceptedCount: 51 });
  await batch.commit();
  const first = await invoke("adminListNeraiuchiEntries", { eventId: id });
  assert.equal(first.items.length, 50);
  assert.deepEqual(first.items.map((entry) => entry.number), Array.from({ length: 50 }, (_, index) => index + 1));
  const second = await invoke("adminListNeraiuchiEntries", { eventId: id, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((entry) => entry.number), [51]);
  assert.equal(second.nextCursor, null);
});

async function client(signedIn) {
  const app = initializeApp({ projectId: "demo-yumetsuki", apiKey: "demo-key", appId: "demo-app" }, randomUUID());
  clients.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const firestore = clientFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  connectFirestoreEmulator(firestore, host, Number(port));
  if (signedIn) await createUserWithEmailAndPassword(auth, `${randomUUID()}@example.invalid`, "emulator-only-password");
  return { auth, firestore };
}

test("anonymous/user/admin SDK clients cannot directly read or write any game namespace", async () => {
  const actors = [await client(false), await client(true), await client(true)];
  await db.collection("admins").doc(actors[2].auth.currentUser.uid).set({});
  const paths = [
    "neraiuchiEvents/test", "neraiuchiEvents/test/entries/test", "neraiuchiSecrets/test",
    "neraiuchiEventsArchive/test", "neraiuchiEventsArchive/test/entries/test",
    "neraiuchiCounters/test", "neraiuchiUserHistory/test/items/test", "neraiuchiAudit/test",
  ];
  for (const path of paths) await db.doc(path).set({ testOnly: true });
  for (const actor of actors) for (const path of paths) {
    await assert.rejects(getDoc(doc(actor.firestore, path)), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(actor.firestore, path), { attack: true }), { code: "permission-denied" });
  }
  // Preserve the existing non-game rules and quiz read/admin-write behavior.
  const actor = actors[2];
  await setDoc(doc(actor.firestore, "quizzes/emulator-regression"), { title: "Synthetic" });
  assert.equal((await getDoc(doc(actors[1].firestore, "quizzes/emulator-regression"))).exists(), true);
  await assert.rejects(setDoc(doc(actors[1].firestore, "quizzes/emulator-regression"), { title: "Not admin" }),
    { code: "permission-denied" });
  await setDoc(doc(actors[1].firestore, "users/emulator-regression"), { testOnly: true });
  assert.equal((await getDoc(doc(actors[1].firestore, "users/emulator-regression"))).exists(), true);
});

test("HTTP callable endpoints verify real emulator auth tokens without trusting request UID", async () => {
  const actor = await client(true);
  const { id } = await event();
  const url = "http://127.0.0.1:5001/demo-yumetsuki/us-east1/joinNeraiuchi";
  const request = (token) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: { eventId: id } }),
  });
  const unauthorized = await request();
  assert.equal(unauthorized.status, 401);
  const token = await actor.auth.currentUser.getIdToken();
  const response = await request(token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.entry.resultsReleased, false);
  const replay = await request(token);
  const receipt = (await replay.json()).result.entry;
  assert.equal(receipt.resultsReleased, false);
  assert.ok(!("number" in receipt) && !("isWinner" in receipt));
  await checkCount(id, 1);
});

const prize = (changes = {}) => ({ number: 1, label: "Synthetic prize", points: 37, shippingEnabled: true, ...changes });
const close = (created) => invoke("adminCloseNeraiuchi", {
  eventId: created.id, expectedVersion: created.version, reason: "Emulator-only close",
});
async function participant(points = 10) {
  const uid = randomUUID();
  await db.collection("users").doc(uid).set({
    points, displayName: "Synthetic participant", email: "synthetic@example.invalid", xAccount: "@synthetic",
  });
  return uid;
}
const claim = (eventId, uid, choice) => invoke("claimNeraiuchiPrize", { eventId, choice }, context(uid));

test("every public endpoint hides numbers, outcomes, prizes and population until actual closure, including full/OFF events", async () => {
  const created = await event({ maxEntries: 2, prizes: [prize({ label: "Private test prize" })] });
  const uid = await participant();
  const first = await invoke("joinNeraiuchi", { eventId: created.id }, context(uid));
  await join(created.id, await participant());
  for (const response of [
    first, await invoke("joinNeraiuchi", { eventId: created.id }, context(uid)),
    await invoke("getNeraiuchiEvent", { eventId: created.id }, context(uid)),
    await invoke("getNeraiuchiHistory", {}, context(uid)),
    await invoke("listNeraiuchiEvents", {}, context(uid)),
  ]) {
    const serialized = JSON.stringify(response);
    for (const forbidden of ["number", "isWinner", "prize", "prizes", "claim", "acceptedCount", "maxEntries", "winningNumbers"]) {
      assert.ok(!serialized.includes(`"${forbidden}"`), forbidden);
    }
    assert.ok(!serialized.includes("Private test prize"));
  }
  const detail = await invoke("getNeraiuchiEvent", { eventId: created.id }, context(uid));
  assert.equal(detail.event.resultsReleased, false);
  assert.notEqual(detail.event.availability, "full");
  await assert.rejects(invoke("getNeraiuchiResults", { eventId: created.id }, context(uid)), { code: "failed-precondition" });
  await assert.rejects(claim(created.id, uid, "points"), { code: "failed-precondition" });
  process.env.NERAIUCHI_ENABLED = "false";
  try {
    assert.equal((await invoke("getNeraiuchiEvent", { eventId: created.id }, context(uid))).entry.resultsReleased, false);
    assert.equal((await invoke("joinNeraiuchi", { eventId: created.id }, context(uid))).entry.resultsReleased, false);
    const endsAt = (await db.collection("neraiuchiEvents").doc(created.id).get()).get("endsAt").toMillis();
    mock.method(Date, "now", () => endsAt - 1);
    assert.equal((await invoke("getNeraiuchiHistory", {}, context(uid))).items[0].resultsReleased, false);
    mock.method(Date, "now", () => endsAt);
    const ended = await invoke("getNeraiuchiEvent", { eventId: created.id }, context(uid));
    assert.equal(ended.entry.resultsReleased, true);
    assert.equal(ended.entry.number, 1);
    assert.equal(ended.entry.prize.label, "Private test prize");
    assert.equal((await invoke("getNeraiuchiHistory", {}, context(uid))).items[0].isWinner, true);
    const results = await invoke("getNeraiuchiResults", { eventId: created.id }, context(uid));
    assert.equal(results.items.length, 2);
    assert.equal(results.items.filter((entry) => entry.isSelf).length, 1);
    const serialized = JSON.stringify(results);
    assert.ok(!serialized.includes(uid) && !serialized.includes("example.invalid") && !serialized.includes("@synthetic"));
  } finally { mock.restoreAll(); process.env.NERAIUCHI_ENABLED = "true"; }
});

test("prize rows reject duplicates, invalid points/shipping, mixed schemas and post-publication edits", async () => {
  const now = Date.now();
  const draft = {
    title: "Synthetic", description: "Local only", thumbnailPath: "/menu/thumbnails/neraiuchi.png",
    startsAt: now, endsAt: now + 60000, maxEntries: 10, claimInstructions: "Local only",
  };
  for (const prizes of [
    [], [prize(), prize()], [prize({ number: 11 })], [prize({ points: -1 })],
    [prize({ points: 1.5 })], [prize({ points: 1000001 })],
    [prize({ shippingEnabled: "true" })], [prize({ shippingEnabled: false, points: 0 })],
  ]) {
    await assert.rejects(invoke("adminSaveNeraiuchiDraft", { ...draft, prizes }), { code: "invalid-argument" });
  }
  await assert.rejects(invoke("adminSaveNeraiuchiDraft", {
    ...draft, prizes: [prize()], winningNumbers: [1], rewardLabel: "Mixed",
  }), { code: "invalid-argument" });
  const created = await event({ prizes: [prize()] });
  await assert.rejects(invoke("adminSaveNeraiuchiDraft", {
    ...draft, eventId: created.id, expectedVersion: created.version, prizes: [prize({ points: 999 })],
  }), { code: "failed-precondition" });
  await db.collection("neraiuchiSecrets").doc(created.id).update({ winningNumbers: [2] });
  await assert.rejects(join(created.id, await participant()), { code: "failed-precondition" });
  await db.collection("neraiuchiSecrets").doc(created.id).update({ winningNumbers: [1] });
});

test("20 concurrent point claims grant exactly once with matching entry/history/audit and no shipping", async () => {
  const created = await event({ prizes: [prize({ shippingEnabled: false })] });
  const uid = await participant();
  await join(created.id, uid);
  await close(created);
  const results = await Promise.all(Array.from({ length: 20 }, () => claim(created.id, uid, "points")));
  assert.equal(new Set(results.map((result) => result.entry.claim.requestId)).size, 1);
  assert.equal((await db.collection("users").doc(uid).get()).get("points"), 47);
  const records = await db.collection("pointHistory").where("eventId", "==", created.id).get();
  assert.equal(records.size, 1);
  assert.equal(records.docs[0].get("added"), 37);
  assert.equal((await db.collection("shippingPending").where("eventId", "==", created.id).get()).size, 0);
  const history = await invoke("getNeraiuchiHistory", {}, context(uid));
  assert.deepEqual(history.items[0].claim, results[0].entry.claim);
  assert.equal((await db.collection("neraiuchiAudit").where("eventId", "==", created.id).get())
    .docs.filter((document) => document.get("operation") === "claim").length, 1);
  await assert.rejects(claim(created.id, uid, "shipping"), { code: "already-exists" });
});

test("20 concurrent shipping claims register exactly once without adding/debiting points; archived/OFF replay remains safe", async () => {
  const created = await event({ prizes: [prize()] });
  const uid = await participant(90);
  await join(created.id, uid);
  const closed = await close(created);
  const results = await Promise.all(Array.from({ length: 20 }, () => claim(created.id, uid, "shipping")));
  const requestId = results[0].entry.claim.requestId;
  assert.ok(results.every((result) => result.entry.claim.requestId === requestId));
  assert.equal((await db.collection("users").doc(uid).get()).get("points"), 90);
  const pending = await db.collection("shippingPending").doc(requestId).get();
  const selected = await db.collection("selectedRewards").doc(requestId).get();
  assert.equal(pending.get("source"), "neraiuchi");
  assert.equal(pending.get("uid"), uid);
  assert.equal(pending.get("name"), "Synthetic prize（狙い撃ち）");
  assert.ok(pending.get("requestedAt") instanceof Timestamp);
  assert.deepEqual(selected.data(), pending.data());
  assert.equal((await db.collection("shippingPending").where("eventId", "==", created.id).get()).size, 1);
  assert.equal((await db.collection("pointHistory").where("eventId", "==", created.id).get()).size, 0);
  await invoke("adminArchiveNeraiuchi", { eventId: created.id, expectedVersion: closed.version });
  process.env.NERAIUCHI_ENABLED = "false";
  try {
    assert.deepEqual((await claim(created.id, uid, "shipping")).entry.claim, results[0].entry.claim);
    await assert.rejects(claim(created.id, uid, "points"), { code: "already-exists" });
  } finally { process.env.NERAIUCHI_ENABLED = "true"; }
});

test("points/shipping races select one method only; other accounts and spoofed amounts cannot claim", async () => {
  const created = await event({ prizes: [prize()] });
  const uid = await participant();
  await join(created.id, uid); await close(created);
  const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
    claim(created.id, uid, index % 2 ? "points" : "shipping")));
  const accepted = attempts.filter((result) => result.status === "fulfilled");
  const methods = new Set(accepted.map((result) => result.value.entry.claim.choice));
  assert.equal(methods.size, 1);
  assert.ok(attempts.filter((result) => result.status === "rejected").every((result) => result.reason.code === "already-exists"));
  const method = accepted[0].value.entry.claim.choice;
  assert.equal((await db.collection("users").doc(uid).get()).get("points"), method === "points" ? 47 : 10);
  assert.equal((await db.collection("shippingPending").where("eventId", "==", created.id).get()).size, method === "shipping" ? 1 : 0);
  await assert.rejects(claim(created.id, await participant(), "points"), { code: "not-found" });
  for (const spoof of [{ uid }, { points: 9999 }, { number: 1 }, { isWinner: true }]) {
    await assert.rejects(invoke("claimNeraiuchiPrize", { eventId: created.id, choice: "points", ...spoof }, context(uid)),
      { code: "invalid-argument" });
  }
  const loser = await event({ prizes: [prize({ number: 2 })] });
  const other = await participant();
  await join(loser.id, other); await close(loser);
  await assert.rejects(claim(loser.id, other, "points"), { code: "failed-precondition" });
});

test("invalid balances or unsupported shipping leave no claim, and legacy prizes remain manual", async () => {
  const created = await event({ prizes: [prize({ shippingEnabled: false })] });
  const uid = await participant("invalid");
  await join(created.id, uid); await close(created);
  await assert.rejects(claim(created.id, uid, "shipping"), { code: "invalid-argument" });
  await assert.rejects(claim(created.id, uid, "points"), { code: "failed-precondition" });
  assert.equal((await entryRecord(created.id, uid)).get("claim"), undefined);
  assert.equal((await db.collection("pointHistory").where("eventId", "==", created.id).get()).size, 0);
  await db.collection("users").doc(uid).update({ points: 10 });
  await claim(created.id, uid, "points");
  assert.equal((await db.collection("users").doc(uid).get()).get("points"), 47);
  const legacy = await event();
  await join(legacy.id, uid); await close(legacy);
  assert.equal((await invoke("getNeraiuchiEvent", { eventId: legacy.id }, context(uid))).entry.prize, null);
  await assert.rejects(claim(legacy.id, uid, "points"), { code: "failed-precondition" });
});

test("results preserve sub-millisecond timestamp order and locate the participant beyond page one", async () => {
  const created = await event({ prizes: [prize({ number: 2 })] });
  const uid = randomUUID();
  const batch = db.batch();
  const seconds = Math.floor(Date.now() / 1000);
  for (let index = 0; index < 53; index++) {
    const actor = index === 51 ? uid : randomUUID();
    batch.set(db.collection("neraiuchiEvents").doc(created.id).collection("entries").doc(actor), {
      uid: actor, eventId: created.id, number: 53 - index, isWinner: index === 51,
      acceptedAt: new Timestamp(seconds, 123000000 + index * 1000),
      displayNameSnapshot: `Synthetic ${index}`, eventTitleSnapshot: "Synthetic",
      rewardLabelSnapshot: index === 51 ? "Synthetic prize" : "", claimInstructionsSnapshot: "Synthetic", eventVersion: 2,
    });
  }
  batch.update(db.collection("neraiuchiCounters").doc(created.id), { acceptedCount: 53 });
  await batch.commit(); await close(created);
  const first = await invoke("getNeraiuchiResults", { eventId: created.id }, context(uid));
  assert.deepEqual(first.items.map((entry) => entry.number), Array.from({ length: 50 }, (_, index) => 53 - index));
  const second = await invoke("getNeraiuchiResults", { eventId: created.id, cursor: first.nextCursor }, context(uid));
  assert.deepEqual(second.items.map((entry) => entry.number), [3, 2, 1]);
  assert.equal(second.nextCursor, null);
  const own = await invoke("getNeraiuchiResults", { eventId: created.id, aroundSelf: true }, context(uid));
  assert.equal(own.items.findIndex((entry) => entry.isSelf), 10);
  assert.equal(own.items[10].isWinner, true);
  assert.ok(!JSON.stringify(first).includes(uid) && !JSON.stringify(second).includes(uid));
  const adminResults = await invoke("adminListNeraiuchiEntries", { eventId: created.id });
  assert.deepEqual(adminResults.items.map((entry) => entry.number), first.items.map((entry) => entry.number));
  const unrelated = await event(); await close(unrelated);
  await assert.rejects(invoke("getNeraiuchiResults", { eventId: unrelated.id, cursor: first.nextCursor }), { code: "invalid-argument" });
  await assert.rejects(invoke("getNeraiuchiResults", { eventId: created.id, aroundSelf: true, cursor: first.nextCursor }), { code: "invalid-argument" });
});

test("clients cannot forge administrator roles or reserved claim/shipping records; legitimate admin processing and legacy records still work", async () => {
  const actor = await client(true);
  const uid = actor.auth.currentUser.uid;
  await assert.rejects(setDoc(doc(actor.firestore, `admins/${uid}`), { forged: true }), { code: "permission-denied" });
  await assert.rejects(invoke("adminListNeraiuchiEvents", {}, context(uid)), { code: "permission-denied" });
  for (const collection of ["shippingPending", "shippingDone", "shippingHistory", "selectedRewards", "pointHistory"]) {
    const key = `neraiuchi_${randomUUID()}`;
    await db.collection(collection).doc(key).set({ source: "neraiuchi", testOnly: true });
    await assert.rejects(setDoc(doc(actor.firestore, `${collection}/${key}`), { source: "gacha" }), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(actor.firestore, `${collection}/${randomUUID()}`), { source: "neraiuchi" }), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(actor.firestore, `${collection}/${randomUUID()}`), {
      source: "legacy", requestId: key,
    }), { code: "permission-denied" });
    await assert.rejects(setDoc(doc(actor.firestore, `${collection}/${randomUUID()}`), {
      source: "legacy", rewardId: key,
    }), { code: "permission-denied" });
    await setDoc(doc(actor.firestore, `${collection}/legacy-${randomUUID()}`), { source: "legacy", testOnly: true });
  }
  await assert.rejects(setDoc(doc(actor.firestore, `shippingPending/neraiuchi_${randomUUID()}/metadata/test`), { forged: true }),
    { code: "permission-denied" });
  await db.collection("admins").doc(uid).set({ testOnly: true });
  await setDoc(doc(actor.firestore, `shippingDone/neraiuchi_${randomUUID()}`), { source: "neraiuchi", status: "done" });
  await assert.rejects(setDoc(doc(actor.firestore, `admins/${uid}`), { overwrite: true }), { code: "permission-denied" });
});
