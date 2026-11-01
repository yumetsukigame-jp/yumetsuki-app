/* eslint-disable @typescript-eslint/no-require-imports -- Mock module loading for standalone server tests. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");

class Timestamp {
  constructor(value) { this.value = value; }
  toMillis() { return this.value; }
  static fromMillis(value) { return new Timestamp(value); }
  static now() { return new Timestamp(Date.now()); }
}
let records = new Map(), serial = 0, chain = Promise.resolve();
const copy = value => value instanceof Timestamp ? new Timestamp(value.value)
  : Array.isArray(value) ? value.map(copy)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]))
      : value;
class Ref {
  constructor(path) { this.path = path; this.id = path.split("/").at(-1); this.parent = { id: path.split("/").at(-2) }; }
  async get() { return snapshot(this); }
  collection(name) { return new Query(`${this.path}/${name}`); }
}
function snapshot(ref) {
  const value = copy(records.get(ref.path));
  return { id: ref.id, ref, exists: value !== undefined, get: key => value?.[key], data: () => value };
}
class Query {
  constructor(name, filters = [], orders = [], maximum = Infinity) { Object.assign(this, { id: name, filters, orders, maximum }); }
  doc(id = `auto${++serial}`) { return new Ref(`${this.id}/${id}`); }
  where(key, op, value) { return new Query(this.id, [...this.filters, [key, op, value]], this.orders, this.maximum); }
  orderBy(key, direction = "asc") { return new Query(this.id, this.filters, [...this.orders, [key, direction]], this.maximum); }
  limit(maximum) { return new Query(this.id, this.filters, this.orders, maximum); }
  async get() {
    const scalar = value => value instanceof Timestamp ? value.toMillis() : value;
    const docs = [...records.keys()].filter(path => path.startsWith(`${this.id}/`) && !path.slice(this.id.length + 1).includes("/"))
      .map(path => snapshot(new Ref(path))).filter(doc => this.filters.every(([key, op, raw]) => {
        const value = scalar(doc.get(key)), expected = scalar(raw);
        if (op === "==") return value === expected;
        if (op === "in") return raw.includes(value);
        if (op === "<=") return value <= expected;
        if (op === ">") return value > expected;
        throw Error(`Unsupported operator ${op}`);
      }));
    docs.sort((a, b) => {
      for (const [key, direction] of this.orders) {
        const av = scalar(a.get(key)), bv = scalar(b.get(key));
        if (av !== bv) return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return 0;
    });
    const selected = docs.slice(0, this.maximum);
    return { docs: selected, size: selected.length, empty: selected.length === 0 };
  }
}
class Transaction {
  constructor() { this.writes = []; }
  async get(ref) { assert.equal(this.writes.length, 0, "Read before writing"); return ref.get(); }
  set(ref, data, options) { this.writes.push(["set", ref, data, options]); }
  update(ref, data) { this.writes.push(["update", ref, data]); }
  create(ref, data) { this.writes.push(["create", ref, data]); }
  commit() {
    for (const [operation, ref, data, options] of this.writes) {
      if (operation === "update") assert.ok(records.has(ref.path));
      if (operation === "create") assert.ok(!records.has(ref.path));
      const next = operation === "update" || options?.merge ? copy(records.get(ref.path) ?? {}) : {};
      for (const [key, value] of Object.entries(data)) {
        if (value?.kind === "delete") delete next[key];
        else next[key] = value?.kind === "now" ? Timestamp.now() : copy(value);
      }
      records.set(ref.path, next);
    }
  }
}
const db = {
  collection: name => new Query(name),
  runTransaction(callback) {
    const result = chain.then(async () => { const tx = new Transaction(); const value = await callback(tx); tx.commit(); return value; });
    chain = result.catch(() => {});
    return result;
  },
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const builder = {
  runWith() { return this; }, https: { onCall: handler => ({ run: handler }) },
  pubsub: { schedule: () => ({ timeZone: () => ({ onRun: handler => ({ run: handler }) }) }) },
};
const load = Module._load;
Module._load = function(name, ...rest) {
  if (name === "firebase-admin") return { apps: [{}] };
  if (name === "firebase-admin/firestore") return {
    getFirestore: () => db,
    Timestamp, FieldPath: { documentId: () => "__name__" },
    FieldValue: { serverTimestamp: () => ({ kind: "now" }), delete: () => ({ kind: "delete" }) },
  };
  if (name === "firebase-functions/v1") return { https: { HttpsError }, region: () => builder };
  return load.call(this, name, ...rest);
};
const api = require("../lib/neraiuchi");
const { getNeraiuchiHomeStatus } = api;
Module._load = load;
const context = { auth: { uid: "test-user" } };

test("home status identifies the latest ended round before and after archiving without revealing participant/prize data", async t => {
  const previous = process.env.NERAIUCHI_ENABLED;
  process.env.NERAIUCHI_ENABLED = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.NERAIUCHI_ENABLED;
    else process.env.NERAIUCHI_ENABLED = previous;
  });
  const now = Date.now(), time = value => Timestamp.fromMillis(value);
  records = new Map([
    ["neraiuchiEventsArchive/old", { title: "Old", closedAt: time(now - 10000), archiveComplete: true }],
    ["neraiuchiEvents/expired", { title: "Expired", state: "published", endsAt: time(now - 1000), winningNumbers: [1], secret: "never expose" }],
    ["neraiuchiEvents/upcoming", { title: "Upcoming", state: "published", startsAt: time(now + 20000), endsAt: time(now + 40000) }],
  ]);
  const expired = await getNeraiuchiHomeStatus.run({}, context);
  assert.deepEqual(expired.latestEnded, { id: "expired", title: "Expired", endedAt: now - 1000 });
  assert.equal(expired.event, null);
  assert.equal(expired.refreshAt, now + 20000);
  records.delete("neraiuchiEvents/expired");
  records.set("neraiuchiEventsArchive/manual", {
    title: "【第999回】Manually ended", roundNumber: 1, state: "archived", endsAt: time(now + 60000),
    closedAt: time(now - 500), archiveComplete: false, secret: { winningNumbers: [5] },
  });
  const manual = await getNeraiuchiHomeStatus.run({}, context);
  assert.deepEqual(manual.latestEnded, { id: "manual", title: "【第1回】Manually ended", endedAt: now - 500 });
  process.env.NERAIUCHI_ENABLED = "false";
  const disabled = await getNeraiuchiHomeStatus.run({}, context);
  assert.deepEqual(disabled.latestEnded, manual.latestEnded);
  assert.equal(disabled.event, null);
  assert.equal(disabled.refreshAt, null);
});

test("home status still requires authentication and handles no ended rounds", async () => {
  records = new Map();
  await assert.rejects(getNeraiuchiHomeStatus.run({}, {}), error => error.code === "unauthenticated");
  const data = await getNeraiuchiHomeStatus.run({}, context);
  assert.equal(data.latestEnded, null);
});

const adminContext = { auth: { uid: "admin" } };
async function reset() { await chain; records = new Map([["admins/admin", {}]]); serial = 0; }
const draftData = title => ({
  title, description: "Synthetic", thumbnailPath: "/menu/thumbnails/neraiuchi.png",
  startsAt: Date.now() + 10000, endsAt: Date.now() + 60000, maxEntries: 10,
  prizes: [{ number: 1, label: "Synthetic prize", points: 1, shippingEnabled: false }],
  claimInstructions: "Synthetic",
});
const saveDraft = data => api.adminSaveNeraiuchiDraft.run(data, adminContext);
const publish = saved => api.adminPublishNeraiuchi.run({ eventId: saved.eventId, expectedVersion: saved.version }, adminContext);

test("draft edits consume no episode numbers; publication prefixes are server-assigned and cannot be forged", async () => {
  await reset();
  const first = await saveDraft(draftData("【第999回】First"));
  await saveDraft(draftData("Second"));
  assert.equal(records.get(`neraiuchiEvents/${first.eventId}`).title, "First");
  assert.equal(records.has("neraiuchiCounters/_roundSequence"), false);
  const edited = await saveDraft({ ...draftData("Edited"), eventId: first.eventId, expectedVersion: first.version });
  assert.equal(records.has("neraiuchiCounters/_roundSequence"), false);
  const result = await publish(edited);
  assert.equal(result.roundNumber, 1);
  assert.equal(result.title, "【第1回】Edited");
  assert.equal(records.get(`neraiuchiEvents/${first.eventId}`).roundNumber, 1);
});

test("simultaneous publications get distinct consecutive numbers and replays do not consume another number", async () => {
  await reset();
  const a = await saveDraft(draftData("A")), b = await saveDraft(draftData("B"));
  const results = await Promise.all([publish(a), publish(b)]);
  assert.deepEqual(results.map(result => result.roundNumber).sort(), [1, 2]);
  assert.equal(records.get("neraiuchiCounters/_roundSequence").lastNumber, 2);
  await assert.rejects(publish(a), error => error.code === "failed-precondition");
  assert.equal(records.get("neraiuchiCounters/_roundSequence").lastNumber, 2);
  await assert.rejects(api.adminPublishNeraiuchi.run({ eventId: b.eventId, expectedVersion: b.version }, context), error => error.code === "permission-denied");
});

test("failed publication does not consume a number and unnumbered legacy events must be initialized first", async () => {
  await reset();
  const expired = await saveDraft({ ...draftData("Expired"), startsAt: Date.now() - 20000, endsAt: Date.now() - 10000 });
  await assert.rejects(publish(expired), error => error.code === "failed-precondition");
  assert.equal(records.has("neraiuchiCounters/_roundSequence"), false);
  const next = await saveDraft(draftData("Next"));
  records.set("neraiuchiEventsArchive/legacy", { title: "Legacy", state: "archived" });
  await assert.rejects(publish(next), error => error.code === "failed-precondition");
  assert.equal(records.has("neraiuchiCounters/_roundSequence"), false);
  records.set("neraiuchiCounters/_roundSequence", { lastNumber: 1 });
  assert.equal((await publish(next)).title, "【第2回】Next");
});

test("80-character title bodies still validate after the fixed prefix is stored", async () => {
  await reset();
  const title = "あ".repeat(80), saved = await saveDraft(draftData(title));
  await publish(saved);
  const response = await api.adminGetNeraiuchiEvent.run({ eventId: saved.eventId }, adminContext);
  assert.equal(response.event.title, `【第1回】${title}`);
  await assert.rejects(saveDraft(draftData("あ".repeat(81))), error => error.code === "invalid-argument");
});

test("historical numbering changes display names without rewriting original title snapshots or outcomes", async () => {
  records = new Map([["neraiuchiUserHistory/test-user/items/legacy", {
    eventId: "legacy", eventTitleSnapshot: "Original", roundNumber: 1,
    acceptedAt: Timestamp.now(), eventVersion: 2, archived: true, number: 5, isWinner: false,
    rewardLabelSnapshot: "None", claimInstructionsSnapshot: "None",
  }]]);
  const original = copy([...records]);
  const response = await api.getNeraiuchiHistory.run({}, context);
  assert.equal(response.items[0].eventTitleSnapshot, "【第1回】Original");
  assert.equal(response.items[0].number, 5);
  assert.equal(response.items[0].isWinner, false);
  assert.deepEqual([...records], original);
});
