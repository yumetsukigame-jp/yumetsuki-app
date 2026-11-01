/* eslint-disable @typescript-eslint/no-require-imports -- Mock module loading for standalone server tests. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");

class Timestamp {
  constructor(value) { this.value = value; }
  toMillis() { return this.value; }
  static fromMillis(value) { return new Timestamp(value); }
}
let records = new Map();
class Ref {
  constructor(path) { this.path = path; this.id = path.split("/").at(-1); this.parent = { id: path.split("/").at(-2) }; }
  async get() { return snapshot(this); }
}
function snapshot(ref) {
  const value = records.get(ref.path);
  return { id: ref.id, ref, exists: value !== undefined, get: key => value?.[key], data: () => value };
}
class Query {
  constructor(name, filters = [], orders = [], maximum = Infinity) { Object.assign(this, { id: name, filters, orders, maximum }); }
  doc(id) { return new Ref(`${this.id}/${id}`); }
  where(key, op, value) { return new Query(this.id, [...this.filters, [key, op, value]], this.orders, this.maximum); }
  orderBy(key, direction = "asc") { return new Query(this.id, this.filters, [...this.orders, [key, direction]], this.maximum); }
  limit(maximum) { return new Query(this.id, this.filters, this.orders, maximum); }
  async get() {
    const scalar = value => value instanceof Timestamp ? value.toMillis() : value;
    const docs = [...records.keys()].filter(path => path.startsWith(`${this.id}/`))
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
    return { docs: docs.slice(0, this.maximum) };
  }
}
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const builder = {
  runWith() { return this; }, https: { onCall: handler => ({ run: handler }) },
  pubsub: { schedule: () => ({ timeZone: () => ({ onRun: handler => ({ run: handler }) }) }) },
};
const load = Module._load;
Module._load = function(name, ...rest) {
  if (name === "firebase-admin") return { apps: [{}] };
  if (name === "firebase-admin/firestore") return {
    getFirestore: () => ({ collection: name => new Query(name) }),
    Timestamp, FieldPath: { documentId: () => "__name__" }, FieldValue: {},
  };
  if (name === "firebase-functions/v1") return { https: { HttpsError }, region: () => builder };
  return load.call(this, name, ...rest);
};
const { getNeraiuchiHomeStatus } = require("../lib/neraiuchi");
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
    title: "Manually ended", state: "archived", endsAt: time(now + 60000),
    closedAt: time(now - 500), archiveComplete: false, secret: { winningNumbers: [5] },
  });
  const manual = await getNeraiuchiHomeStatus.run({}, context);
  assert.deepEqual(manual.latestEnded, { id: "manual", title: "Manually ended", endedAt: now - 500 });
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
