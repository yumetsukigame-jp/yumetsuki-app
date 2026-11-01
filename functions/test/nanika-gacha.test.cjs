const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const { randomBytes } = require("node:crypto");
const sharp = require("sharp");
const { nanikaDecision, nanikaXMatches } = require("../lib/nanikaGachaPolicy");
const { compressNanikaImage, NANIKA_IMAGE_LIMITS } = require("../lib/nanikaGachaImages");

let now = 1000000;
const originalNow = Date.now;
Date.now = () => now;
class Timestamp {
  constructor(value) { this.value = value; }
  toMillis() { return this.value; }
  toDate() { return new Date(this.value); }
  static fromMillis(value) { return new Timestamp(value); }
  static now() { return new Timestamp(now); }
}
const copy = value => {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Timestamp) return new Timestamp(value.value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, copy(v)]));
  return value;
};
let data = new Map(), serial = 0, chain = Promise.resolve(), retryOnce = false, beforeNextTransaction = null;
class Ref {
  constructor(path) { this.path = path; this.id = path.split("/").at(-1); }
  collection(name) { return new Query(`${this.path}/${name}`); }
  async get() { return new Snapshot(this); }
}
class Snapshot {
  constructor(ref) { this.ref = ref; this.id = ref.id; this.value = copy(data.get(ref.path)); this.exists = this.value !== undefined; }
  get(key) { return this.value?.[key]; }
  data() { return copy(this.value); }
}
const scalar = value => value instanceof Timestamp ? value.value : value;
class Query {
  constructor(path, filters = [], orders = [], limit = Infinity, after = null) {
    Object.assign(this, { path, filters, orders, maximum: limit, after });
  }
  doc(id = `auto${++serial}`) { return new Ref(`${this.path}/${id}`); }
  where(key, op, value) { return new Query(this.path, [...this.filters, [key, op, value]], this.orders, this.maximum, this.after); }
  orderBy(key, direction = "asc") { return new Query(this.path, this.filters, [...this.orders, [key, direction]], this.maximum, this.after); }
  limit(n) { return new Query(this.path, this.filters, this.orders, n, this.after); }
  startAfter(snapshot) { return new Query(this.path, this.filters, this.orders, this.maximum, snapshot); }
  compare(a, b) {
    for (const [key, direction] of this.orders.length ? this.orders : [["__name__", "asc"]]) {
      const av = scalar(key === "__name__" ? a.id : a.get(key)), bv = scalar(key === "__name__" ? b.id : b.get(key));
      if (av !== bv) return (av < bv ? -1 : 1) * (direction === "desc" ? -1 : 1);
    }
    return 0;
  }
  async get() {
    const docs = [...data.keys()].filter(p => p.startsWith(this.path + "/") && !p.slice(this.path.length + 1).includes("/"))
      .map(p => new Snapshot(new Ref(p))).filter(s => this.filters.every(([key, op, value]) => {
        const v = scalar(s.get(key));
        if (op === "==") return v === scalar(value);
        if (op === "<=") return v <= scalar(value);
        if (op === "in") return value.includes(v);
        throw Error("Unsupported query");
      })).sort((a, b) => this.compare(a, b)).filter(s => !this.after || this.compare(s, this.after) > 0).slice(0, this.maximum);
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}
class Transaction {
  constructor() { this.writes = []; }
  async get(ref) {
    assert.equal(this.writes.length, 0, "Firestore transactions must read before writing");
    return ref.get();
  }
  set(ref, value, options) { this.writes.push(["set", ref, value, options]); }
  create(ref, value) { this.writes.push(["create", ref, value]); }
  update(ref, value) { this.writes.push(["update", ref, value]); }
  delete(ref) { this.writes.push(["delete", ref]); }
  commit() {
    const replacement = new Map(data);
    for (const [op, ref, value, options] of this.writes) {
      if (op === "delete") { replacement.delete(ref.path); continue; }
      if (op === "create") assert.equal(replacement.has(ref.path), false, `Duplicate create: ${ref.path}`);
      if (op === "update") assert.equal(replacement.has(ref.path), true, `Missing update: ${ref.path}`);
      const next = op === "update" || options?.merge ? copy(replacement.get(ref.path) ?? {}) : {};
      for (const [key, v] of Object.entries(value)) {
        if (v?.kind === "delete") delete next[key];
        else next[key] = v?.kind === "now" ? Timestamp.now() : copy(v);
      }
      replacement.set(ref.path, next);
    }
    data = replacement;
  }
}
const db = {
  collection: name => new Query(name),
  runTransaction(callback) {
    const operation = chain.then(async () => {
      if (beforeNextTransaction) { const change = beforeNextTransaction; beforeNextTransaction = null; change(); }
      if (retryOnce) { retryOnce = false; await callback(new Transaction()); now += 1; }
      const tx = new Transaction(); const result = await callback(tx); tx.commit(); return result;
    });
    chain = operation.catch(() => {});
    return operation;
  },
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const builder = {
  runWith() { return this; }, https: { onCall: handler => ({ run: handler }) },
  pubsub: { schedule: () => ({ timeZone: () => ({ onRun: handler => ({ run: handler }) }) }) },
};
const load = Module._load;
Module._load = function(name, ...rest) {
  if (name === "firebase-admin") return { apps: [{}], initializeApp() {}, firestore: () => db };
  if (name === "firebase-admin/firestore") return {
    getFirestore: () => db, Timestamp, FieldPath: { documentId: () => "__name__" },
    FieldValue: { delete: () => ({ kind: "delete" }), serverTimestamp: () => ({ kind: "now" }) },
  };
  if (name === "firebase-functions/v1") return { https: { HttpsError }, region: () => builder };
  return load.call(this, name, ...rest);
};
const api = require("../lib/nanikaGacha");
const fulfillment = require("../lib/fulfillment");
const profiles = require("../lib/userProfile");
const legacyGacha = require("../lib/gacha");
Module._load = load;
process.on("exit", () => { Date.now = originalNow; });
const ctx = uid => ({ auth: { uid, token: { email: `${uid}@example.invalid` } } });
const call = (name, payload, uid = "admin") => api[name].run(payload, ctx(uid));
const callFulfillment = (name, payload, uid = "alice") => fulfillment[name].run(payload, ctx(uid));
const callProfile = (name, payload, uid = "admin") => profiles[name].run(payload, ctx(uid));
async function fixture(count = 1) {
  await chain; data = new Map(); serial = 0; now = 1000000;
  data.set("admins/admin", {});
  for (const uid of ["alice", "bob"]) data.set(`users/${uid}`, { points: 100, xAccount: `@${uid}`, displayName: uid });
  const input = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#1c638a" } }).png().toBuffer();
  for (let i = 0; i < count; i++) await call("adminUploadNanikaImage", { tier: "psa", id: `image${i}`, name: `景品${i}`, base64: input.toString("base64") });
  await call("adminSaveNanikaGacha", { tier: "psa", version: 0, fee: 10, exchangePoints: 30, visible: true, xAccounts: ["@alice", "@alice", "@bob"] });
  return data.get("nanikaGachaSlots/psa").roundId;
}
const draw = (roundId, requestId, uid = "alice", extra = {}) => call("drawNanikaGacha", {
  tier: "psa", roundId, requestId, fee: 10, exchangePoints: 30, consent72h: true, participantUid: uid, ...extra,
}, uid);

test("reward redemption is atomic, idempotent and survives fulfillment migration", async () => {
  await fixture(0);
  data.set("rewards/item", { name: "商品", cost: 30, stock: 2, image: "/rewards/test.webp" });
  const request = { rewardId: "item", requestId: "once", cost: 30, participantUid: "alice", confirmed: true };
  retryOnce = true;
  const first = await callFulfillment("redeemReward", request);
  data.delete(`shippingPending/${first.requestId}`);
  await callFulfillment("redeemReward", request);
  assert.equal(data.get("users/alice").points, 70);
  assert.equal(data.get("rewards/item").stock, 1);
  assert.equal(data.get(`selectedRewards/${first.requestId}`).cost, 30);
  assert.equal([...data.keys()].filter(key => key.startsWith("rewardRedemptions/")).length, 1);
});
test("reward redemption rejects tampered prices, account switches and insufficient balance", async () => {
  await fixture(0);
  data.set("rewards/item", { name: "商品", cost: 30, stock: 2 });
  const request = { rewardId: "item", requestId: "bad", cost: 0, participantUid: "alice", confirmed: true };
  await assert.rejects(callFulfillment("redeemReward", request));
  await assert.rejects(callFulfillment("redeemReward", { ...request, cost: 30, participantUid: "bob" }));
  await assert.rejects(callFulfillment("redeemReward", { ...request, cost: 30, name: "偽装" }));
  data.set("rewards/item", { name: "商品", cost: 300, stock: 2 });
  await assert.rejects(callFulfillment("redeemReward", { ...request, cost: 300 }));
  assert.equal(data.get("users/alice").points, 100);
  assert.equal(data.get("rewards/item").stock, 2);
  await assert.rejects(fulfillment.redeemReward.run({}, {}), error => error.code === "unauthenticated");
});
test("two reward redemptions cannot consume the same sole stock item", async () => {
  await fixture(0);
  data.set("rewards/item", { name: "商品", cost: 30, stock: 1 });
  const results = await Promise.allSettled(["alice", "bob"].map(uid => callFulfillment("redeemReward", {
    rewardId: "item", requestId: uid, cost: 30, participantUid: uid, confirmed: true,
  }, uid)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(data.get("rewards/item").stock, 0);
  assert.equal(data.get("users/alice").points + data.get("users/bob").points, 170);
});
async function legacyDraw(shippingEnabled = true) {
  await fixture(0);
  data.set("gachaCodes/code", {
    title: "通常ガチャ", mode: "count", resetType: "none", publicFlags: [], thumbnail: "original.png",
    point: { cost: 10, maxPerUser: 10 },
    frames: [
      { label: "WIN", rewardMin: 20, rewardMax: 20, maxCount: 2, usedCount: 0, shippingEnabled },
      { label: "LOSE", rewardMin: 0, rewardMax: 0, maxCount: 0, usedCount: 0 },
    ],
  });
  return legacyGacha.useGachaCode.run({ code: "code" }, ctx("alice"));
}
test("ordinary draw issues an immutable shipping entitlement; shipping spends its reward exactly once", async () => {
  const result = await legacyDraw();
  assert.equal(result.reward, 20);
  assert.equal(data.get("users/alice").points, 110);
  assert.equal(result.shippingEnabled, true);
  data.delete("gachaCodes/code");
  const request = { resultId: result.resultId, choice: "shipping", participantUid: "alice", confirmed: true };
  await assert.rejects(callFulfillment("claimGachaShipping", { ...request, participantUid: "bob" }, "bob"), error => error.code === "permission-denied");
  await assert.rejects(callFulfillment("claimGachaShipping", { ...request, reward: 0 }));
  const first = await callFulfillment("claimGachaShipping", request);
  await callFulfillment("claimGachaShipping", request);
  assert.equal(data.get("users/alice").points, 90);
  assert.equal(data.get(`shippingPending/${first.requestId}`).image, "/gacha/original.png");
  assert.equal(data.get(`shippingPending/${first.requestId}`).cost, 20);
});
test("ordinary point choice keeps the existing awarded points and permanently excludes shipping", async () => {
  const result = await legacyDraw();
  const request = { resultId: result.resultId, choice: "points", participantUid: "alice", confirmed: true };
  await callFulfillment("claimGachaShipping", request);
  await callFulfillment("claimGachaShipping", request);
  await assert.rejects(callFulfillment("claimGachaShipping", { ...request, choice: "shipping" }), error => error.code === "already-exists");
  assert.equal(data.get("users/alice").points, 110);
  assert.equal([...data.keys()].filter(key => key.startsWith("shippingPending/")).length, 0);
});
test("ordinary shipping requires a real eligible draw and sufficient reward points", async () => {
  let result = await legacyDraw(false);
  const request = { resultId: result.resultId, choice: "shipping", participantUid: "alice", confirmed: true };
  await assert.rejects(callFulfillment("claimGachaShipping", request));
  await assert.rejects(callFulfillment("claimGachaShipping", { ...request, resultId: "forged" }), error => error.code === "not-found");
  result = await legacyDraw(true);
  data.get("users/alice").points = 0;
  await assert.rejects(callFulfillment("claimGachaShipping", { ...request, resultId: result.resultId }));
  assert.equal(data.get(`gachaShippingClaims/${result.resultId}`).choice, "pending");
});
test("ordinary X eligibility cannot be borrowed from a longer handle", async () => {
  await legacyDraw();
  const config = data.get("gachaCodes/code");
  config.publicFlags = ["x_account_match"];
  config.xAccountList = ["条件達成者 @alice2"];
  await assert.rejects(legacyGacha.useGachaCode.run({ code: "code" }, ctx("alice")), error => error.code === "permission-denied");
  data.get("users/bob").xAccount = "@ALICE2";
  const result = await legacyGacha.useGachaCode.run({ code: "code" }, ctx("bob"));
  assert.equal(result.reward, 20);
});
test("administrator X editing preserves uniqueness and releases old claims, including when clearing", async () => {
  await fixture(0);
  const hash = value => require("node:crypto").createHash("sha256").update(value).digest("hex");
  data.set(`xAccountClaims/${hash("alice")}`, { uid: "alice" });
  await assert.rejects(callProfile("adminUpdateUserXAccount", { uid: "alice", xAccount: "@bob" }));
  await assert.rejects(callProfile("adminUpdateUserXAccount", { uid: "alice", xAccount: "@carol" }, "alice"), error => error.code === "permission-denied");
  await callProfile("adminUpdateUserXAccount", { uid: "alice", xAccount: "@carol" });
  assert.equal(data.has(`xAccountClaims/${hash("alice")}`), false);
  assert.equal(data.get(`xAccountClaims/${hash("carol")}`).uid, "alice");
  assert.equal(data.get("users/alice").points, 100);
  await callProfile("adminUpdateUserXAccount", { uid: "alice", xAccount: "" });
  assert.equal(data.has(`xAccountClaims/${hash("carol")}`), false);
  assert.equal(data.get("users/alice").xAccount, "");
});
test("administrator profile deletion releases X ownership but preserves nested history", async () => {
  await fixture(0);
  const hash = require("node:crypto").createHash("sha256").update("alice").digest("hex");
  data.set(`xAccountClaims/${hash}`, { uid: "alice" });
  data.set("users/alice/orica/item", { owned: true });
  await assert.rejects(callProfile("adminDeleteUserProfile", { uid: "alice" }, "bob"), error => error.code === "permission-denied");
  await callProfile("adminDeleteUserProfile", { uid: "alice" });
  assert.equal(data.has("users/alice"), false);
  assert.equal(data.has(`xAccountClaims/${hash}`), false);
  assert.equal(data.get("users/alice/orica/item").owned, true);
});
test("profile deletion cannot orphan a reserved Nanika prize or block automatic settlement", async () => {
  const roundId = await fixture();
  await draw(roundId, "before-delete");
  await assert.rejects(callProfile("adminDeleteUserProfile", { uid: "alice" }), error => error.code === "failed-precondition");
  assert.equal(data.has("users/alice"), true);
  assert.equal(data.get("users/alice").points, 90);
});
test("concurrent confirmation cannot be bypassed by a stale profile edit", async () => {
  await fixture(0);
  beforeNextTransaction = () => { data.get("users/alice").xAccountConfirmed = true; };
  await assert.rejects(callProfile("updateUserProfile", { name: "Alice", displayName: "Alice", xAccount: "@carol" }, "alice"), error => error.code === "permission-denied");
  assert.equal(data.get("users/alice").xAccount, "@alice");
  assert.equal(data.get("users/alice").xAccountConfirmed, true);
});

test("existing signup and same-X profile edits remain available without client wallet writes", async () => {
  await fixture(0);
  await callProfile("createUserProfile", {
    name: "Carol", displayName: "Carol", xAccount: "@carol", points: 9999, subscriber: true, uid: "bob",
  }, "carol");
  assert.equal(data.get("users/carol").points, 0);
  assert.equal(data.get("users/carol").subscriber, undefined);
  data.get("users/carol").xAccountConfirmed = true;
  await callProfile("updateUserProfile", { name: "Carol", displayName: "New name", xAccount: "@CAROL" }, "carol");
  assert.equal(data.get("users/carol").displayName, "New name");
  assert.equal(data.get("users/carol").xAccountConfirmed, true);
  assert.equal(data.get("users/bob").points, 100);
});

test("X matching uses full handles, not partial substrings", () => {
  assert.equal(nanikaXMatches("条件達成者 @Alice", "@alice"), true);
  assert.equal(nanikaXMatches("@alice2", "@alice"), false);
  assert.equal(nanikaXMatches("@alice", ""), false);
});
test("72-hour deadline is inclusive and always resolves to points", () => {
  assert.deepEqual(nanikaDecision(100, 99, "shipping"), { choice: "shipping", automatic: false });
  assert.deepEqual(nanikaDecision(100, 100, "shipping"), { choice: "points", automatic: true });
});
test("actual image encoding meets byte limits and strips metadata", async () => {
  const input = await sharp(randomBytes(2000 * 1500 * 3), { raw: { width: 2000, height: 1500, channels: 3 } })
    .withMetadata({ exif: { IFD0: { Artist: "fixture" } } }).jpeg().toBuffer();
  const result = await compressNanikaImage(input);
  assert.ok(result.large.length <= NANIKA_IMAGE_LIMITS.large);
  assert.ok(result.thumbnail.length <= NANIKA_IMAGE_LIMITS.thumbnail);
  assert.equal((await sharp(result.thumbnail).metadata()).format, "webp");
  assert.equal((await sharp(result.thumbnail).metadata()).exif, undefined);
  assert.ok((await sharp(result.large).metadata()).width <= 1200);
  await assert.rejects(compressNanikaImage(Buffer.from("<svg/>")));
});
test("authentication and administrator boundaries reject writes", async () => {
  await fixture();
  await assert.rejects(api.drawNanikaGacha.run({}, {}), e => e.code === "unauthenticated");
  await assert.rejects(call("adminGetNanikaGacha", {}, "alice"), e => e.code === "permission-denied");
});
test("draw, retry and transaction retry deduct once and preserve server-side consent", async () => {
  const round = await fixture(2); retryOnce = true;
  const first = await draw(round, "retry"), repeated = await draw(round, "retry");
  assert.equal(first.receipt.id, repeated.receipt.id);
  assert.equal(data.get("users/alice").points, 90);
  assert.equal(data.get("nanikaGachaSlots/psa").xAccounts.length, 2);
  assert.equal(data.get("nanikaGachaInventory/psa").available, 1);
  assert.equal(first.receipt.deadline - first.receipt.acceptedAt, 72 * 3600000);
  assert.equal(data.get(`nanikaGachaReceipts/${first.receipt.id}`).consent.holdHours, 72);
});
test("changed prices and missing consent cannot charge the participant", async () => {
  const round = await fixture();
  await assert.rejects(draw(round, "bad", "alice", { fee: 0 }));
  await assert.rejects(draw(round, "bad", "alice", { consent72h: false }));
  await assert.rejects(draw(round, "bad", "alice", { participantUid: "bob" }));
  assert.equal(data.get("users/alice").points, 100);
});
test("two users cannot reserve the same sole prize", async () => {
  const round = await fixture();
  const results = await Promise.allSettled([draw(round, "a"), draw(round, "b", "bob")]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(data.get("nanikaGachaInventory/psa").available, 0);
  assert.equal([...data.values()].filter(v => v.choice === "pending").length, 3);
});
test("manual point conversion needs confirmation, pays once and returns the prize", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "points");
  await assert.rejects(call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: false }, "alice"));
  await call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: true }, "alice");
  await call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: true }, "alice");
  assert.equal(data.get("users/alice").points, 120);
  assert.equal(data.get("nanikaGachaInventory/psa").available, 1);
  assert.equal(data.get(`nanikaGachaImages/${receipt.imageId}`).state, "ready");
  await assert.rejects(call("claimNanikaGacha", { id: receipt.id, choice: "shipping", confirmed: true }, "alice"));
});
test("shipping creates stable fulfillment images without additional points", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "ship");
  await call("claimNanikaGacha", { id: receipt.id, choice: "shipping", confirmed: true }, "alice");
  await call("claimNanikaGacha", { id: receipt.id, choice: "shipping", confirmed: true }, "alice");
  assert.equal(data.get("users/alice").points, 90);
  assert.equal(data.get("nanikaGachaInventory/psa").available, 0);
  assert.equal(data.get(`shippingPending/${receipt.id}`).image, receipt.image);
  assert.equal(data.get(`selectedRewards/${receipt.id}`).image, receipt.image);
});
test("deadline beats a shipping race and scheduler retry credits once", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "expire");
  now = receipt.deadline;
  const response = await call("claimNanikaGacha", { id: receipt.id, choice: "shipping", confirmed: true }, "alice");
  assert.equal(response.receipt.choice, "points"); assert.equal(response.receipt.automatic, true);
  await api.settleExpiredNanikaGacha.run({});
  assert.equal(data.get("users/alice").points, 120);
  assert.equal(data.has(`shippingPending/${receipt.id}`), false);
});
test("updated pricing never changes an existing pending prize", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "snapshot");
  const slot = data.get("nanikaGachaSlots/psa");
  await call("adminSaveNanikaGacha", { tier: "psa", version: slot.version, fee: 50, exchangePoints: 80, visible: true, xAccounts: slot.xAccounts });
  await call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: true }, "alice");
  assert.equal(data.get("users/alice").points, 120);
});
test("stopping is not archiving; ending moves nested entries and preserves pending claims", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "archive");
  let slot = data.get("nanikaGachaSlots/psa");
  await call("adminSaveNanikaGacha", { tier: "psa", version: slot.version, fee: 10, exchangePoints: 30, visible: false, xAccounts: slot.xAccounts });
  assert.equal(data.has(`nanikaGachaRounds/${round}`), true);
  slot = data.get("nanikaGachaSlots/psa");
  await call("adminEndNanikaGacha", { tier: "psa", roundId: round, version: slot.version, confirmed: true });
  assert.equal(data.has(`nanikaGachaRounds/${round}`), false);
  assert.equal(data.has(`nanikaGachaArchives/${round}/entries/${receipt.id}`), true);
  await call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: true }, "alice");
  assert.equal(data.get(`nanikaGachaArchives/${round}/entries/${receipt.id}`).choice, "points");
  const result = await call("getNanikaGachaHistory", {}, "alice");
  assert.equal(result.items[0].choice, "points");
});
test("purging excludes pending shipments and keeps thumbnail bytes and history", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "purge");
  await assert.rejects(call("adminPurgeNanikaImages", { ids: [receipt.imageId], confirmed: true }));
  await call("claimNanikaGacha", { id: receipt.id, choice: "shipping", confirmed: true }, "alice");
  await assert.rejects(call("adminPurgeNanikaImages", { ids: [receipt.imageId], confirmed: true }));
  data.set(`shippingDone/${receipt.id}`, { status: "done", shipped: true });
  await assert.rejects(call("adminPurgeNanikaImages", { ids: [receipt.imageId], confirmed: true }));
  data.delete(`shippingPending/${receipt.id}`);
  const thumbnail = data.get(`nanikaGachaImages/${receipt.imageId}`).thumbnail;
  await call("adminPurgeNanikaImages", { ids: [receipt.imageId], confirmed: true });
  assert.equal(data.has(`nanikaGachaImageData/${receipt.imageId}`), false);
  assert.deepEqual(data.get(`nanikaGachaImages/${receipt.imageId}`).thumbnail, thumbnail);
  assert.equal(data.has(`nanikaGachaHistory/alice/entries/${receipt.id}`), true);
});
test("pool swap works across page boundaries without scanning the image collection", async () => {
  const round = await fixture(102);
  await call("adminRemoveNanikaImage", { id: "image0" });
  assert.equal(data.get("nanikaGachaImages/image101").poolIndex, 0);
  assert.equal(data.get("nanikaGachaInventory/psa").available, 101);
  const { receipt } = await draw(round, "pool");
  await call("claimNanikaGacha", { id: receipt.id, choice: "points", confirmed: true }, "alice");
  assert.equal(data.get("nanikaGachaInventory/psa").available, 101);
});
test("own receipt lookup is private and settles an overdue prize on read", async () => {
  const round = await fixture(); const { receipt } = await draw(round, "lookup");
  await assert.rejects(call("getNanikaGachaReceipt", { id: receipt.id }, "bob"), e => e.code === "permission-denied");
  now = receipt.deadline;
  const response = await call("getNanikaGachaReceipt", { id: receipt.id }, "alice");
  assert.equal(response.receipt.automatic, true);
  assert.equal(data.get("users/alice").points, 120);
});
