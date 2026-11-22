/* eslint-disable @typescript-eslint/no-require-imports -- Tests for the local administration tool. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadApproval, verifiedLegacyRecords, reconcileApproved } = require("./reconcile-nanika-stock.cjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanika-reconcile-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const removal = cert => ({ id: `psa-cert-${cert}`, cert, name: "Card", action: "remove_if_ready" });
  const move = cert => ({ ...removal(cert), action: "move_if_ready", fromTier: "planet", tier: "satellite" });
  const approval = {
    schemaVersion: 1, approvedOn: "2026-11-23", ledgerSha256: "approved-hash", newBatchId: "batch", newCount: 1,
    removals: [removal("100"), removal("101"), removal("102"), removal("103"), removal("104")],
    moves: [move("200"), move("201"), move("202"), move("203"), move("204")],
  };
  const file = path.join(dir, "approved.json");
  fs.writeFileSync(file, JSON.stringify(approval));
  const batch = { manifest: { batchId: "batch", items: [{ id: "psa-cert-999" }] } };
  return { ...loadApproval(file, batch), file, batch };
}

test("removes and moves only ready records, preserving consumed and pending cards and recording each result", async t => {
  const update = fixture(t);
  const records = new Map([
    ["100", "ready", "psa"], ["101", "removed", "psa"], ["102", "shipping", "psa"], ["103", "reserved", "psa"],
    ["200", "ready", "planet"], ["201", "ready", "satellite"], ["202", "shipping", "planet"],
    ["203", "ready", "star"], ["204", "reserved", "planet"],
  ].map(([cert, state, tier]) => [`psa-cert-${cert}`, { state, tier, name: "Card" }]));
  const calls = [];
  const backend = {
    get: async id => records.get(id),
    call: async (action, data) => {
      calls.push({ action, data });
      const record = records.get(data.id);
      records.set(data.id, action === "adminRemoveNanikaImage" ? { ...record, state: "removed" } :
        { ...record, tier: data.tier });
      return { id: data.id };
    },
  };
  await reconcileApproved(update, backend);
  assert.deepEqual(calls, [
    { action: "adminRemoveNanikaImage", data: { id: "psa-cert-100" } },
    { action: "adminMoveNanikaImage", data: { id: "psa-cert-200", fromTier: "planet", tier: "satellite", confirmed: true } },
  ]);
  const saved = JSON.parse(fs.readFileSync(update.receiptPath, "utf8"));
  assert.deepEqual(saved.results.map(r => r.result), [
    "removed", "already_removed", "shipping", "reserved", "missing",
    "moved", "already_moved", "shipping", "failed", "reserved",
  ]);
  assert.deepEqual(saved.results[0].before, { state: "ready", tier: "psa", name: "Card" });
  assert.equal(saved.results[0].after.state, "removed");
  assert.equal(saved.results[5].after.tier, "satellite");
  await reconcileApproved(loadApproval(update.file, update.batch), backend);
  assert.equal(calls.length, 2, "Completed changes must not be repeated");
  const resumed = JSON.parse(fs.readFileSync(update.receiptPath, "utf8"));
  assert.equal(resumed.results[0].result, "already_removed");
  assert.equal(resumed.results[0].history[0].result, "removed");
});

test("does not infer success after a failed call, and resumes by checking current server state", async t => {
  const update = fixture(t);
  update.approval.removals = [update.approval.removals[0]];
  update.approval.moves = [];
  let record = { state: "ready", tier: "psa", name: "Card" }, calls = 0;
  const backend = {
    get: async () => record,
    call: async () => {
      calls++;
      record = { ...record, state: "removed" };
      throw Error("Response lost after commit");
    },
  };
  await reconcileApproved(update, backend);
  assert.equal(update.receipt.results[0].result, "failed");
  assert.equal(update.receipt.results[0].after.state, "removed");
  await reconcileApproved(update, backend);
  assert.equal(update.receipt.results[0].result, "already_removed");
  assert.equal(calls, 1);
});

test("blocks changed names, conflicting approvals, and stale or ambiguous legacy evidence", async t => {
  const update = fixture(t);
  let calls = 0;
  await reconcileApproved(update, {
    get: async () => ({ state: "ready", tier: "planet", name: "Different physical card" }),
    call: async () => { calls++; },
  });
  assert.equal(calls, 0);
  assert.ok(update.receipt.results.every(r => r.result === "failed"));
  update.approval.moves[0].id = update.approval.removals[0].id;
  update.approval.moves[0].cert = update.approval.removals[0].cert;
  fs.writeFileSync(update.file, JSON.stringify(update.approval));
  assert.throws(() => loadApproval(update.file, update.batch), /Duplicate/);
  const record = { id: "manual", name: "Legacy", tier: "star", sourceHash: "a".repeat(64), state: "shipping" };
  const evidence = { ...record, cert: "123456789" };
  assert.equal(verifiedLegacyRecords([record], [evidence])[0].cert, evidence.cert);
  assert.equal(record.cert, undefined, "Verification must not mutate server data");
  assert.throws(() => verifiedLegacyRecords([{ ...record, sourceHash: "b".repeat(64) }], [evidence]), /changed/);
  assert.throws(() => verifiedLegacyRecords([record], [evidence, evidence]), /Duplicate/);
});
