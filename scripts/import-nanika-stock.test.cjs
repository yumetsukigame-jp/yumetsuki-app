/* eslint-disable @typescript-eslint/no-require-imports -- Tests for the standalone local importer. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { loadBatch, checkDuplicates, importBatch } = require("./import-nanika-stock.cjs");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanika-import-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const bytes = Buffer.from("original unmodified image");
  const items = ["123456789", "234567890"].map(cert => ({
    id: `psa-cert-${cert}`, cert, tier: "psa", name: "Card", file: `${cert}.jpg`,
    sha256: createHash("sha256").update(Buffer.concat([bytes, Buffer.from(cert)])).digest("hex"),
  }));
  for (const item of items) fs.writeFileSync(path.join(dir, item.file), Buffer.concat([bytes, Buffer.from(item.cert)]));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ schemaVersion: 1, batchId: path.basename(dir), items }));
  fs.writeFileSync(path.join(dir, "receipt.example.json"), JSON.stringify({
    batchId: path.basename(dir),
    results: items.map(({ id, cert, tier, sha256 }) => ({ id, cert, tier, sha256, status: "pending" })),
  }));
  return loadBatch(dir);
}

test("rejects changed original bytes and modified receipt identity", t => {
  const batch = fixture(t);
  const item = batch.manifest.items[0];
  fs.writeFileSync(path.join(batch.dir, item.file), "changed");
  assert.throws(() => loadBatch(batch.dir), /hash mismatch/);
  fs.writeFileSync(path.join(batch.dir, item.file), Buffer.concat([Buffer.from("original unmodified image"), Buffer.from(item.cert)]));
  batch.receipt.results[0].cert = "wrong";
  fs.writeFileSync(batch.receiptPath, JSON.stringify(batch.receipt));
  assert.throws(() => loadBatch(batch.dir));
});

test("blocks alternate certificates/hashes and ambiguous legacy records, not matching names", t => {
  const { manifest: { items } } = fixture(t);
  assert.throws(() => checkDuplicates(items, [{ id: "manual", cert: items[0].cert }]), /another ID/);
  assert.throws(() => checkDuplicates(items, [{ id: "manual", sourceHash: items[0].sha256 }]), /another ID/);
  assert.throws(() => checkDuplicates(items, [{ id: "manual", name: "Card" }]), /verification/);
  assert.doesNotThrow(() => checkDuplicates(items, [{ id: "psa-cert-999999999", name: "Card" }]));
});

test("preserves partial successes and resumes without reuploading or restoring shipping state", async t => {
  const batch = fixture(t);
  const records = new Map();
  let calls = 0, fail = true;
  const backend = {
    list: async () => [...records.values()],
    get: async id => records.get(id),
    upload: async input => {
      calls++;
      assert.deepEqual(Object.keys(input).sort(), ["base64", "id", "name", "tier"]);
      if (calls === 2 && fail) throw Error("Disconnected");
      records.set(input.id, { id: input.id, tier: input.tier, name: input.name,
        sourceHash: createHash("sha256").update(Buffer.from(input.base64, "base64")).digest("hex"), state: "shipping" });
      return { id: input.id };
    },
  };
  await assert.rejects(importBatch(batch, backend), /Stopped/);
  assert.deepEqual(loadBatch(batch.dir).receipt.results.map(r => r.status), ["imported", "failed"]);
  fail = false;
  await importBatch(loadBatch(batch.dir), backend);
  assert.equal(calls, 3);
  assert.deepEqual(loadBatch(batch.dir).receipt.results.map(r => r.status), ["already_exists", "imported"]);
  assert.equal(records.get(batch.manifest.items[0].id).state, "shipping");
});

test("rechecks success receipts against the server and never acknowledges a mismatched record", async t => {
  const batch = fixture(t);
  batch.receipt.results[0].status = "imported";
  fs.writeFileSync(batch.receiptPath, JSON.stringify(batch.receipt));
  const item = batch.manifest.items[0];
  let uploads = 0;
  await assert.rejects(importBatch(batch, {
    list: async () => [{ id: item.id, tier: "star", name: item.name, sourceHash: item.sha256 }],
    upload: async () => { uploads++; },
  }), /conflict/);
  assert.equal(uploads, 0);
});
