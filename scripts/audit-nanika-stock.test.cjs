/* eslint-disable @typescript-eslint/no-require-imports -- Tests for local stock auditing. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { identify, buildAudit, listAllAdminImages, executeAudit } = require("./audit-nanika-stock.cjs");

const owned = "\u4fdd\u6709\u4e2d", transferred = "\u8b72\u6e21\u6e08\u307f";
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nanika-audit-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const card = (cert, status = transferred, tier = null) => ({
    cert, status, ledgerStatus: status, name: `Card ${cert}`, ledgerName: `Card ${cert}`, tier,
    originalSha256: `original-${cert}`,
  });
  const record = (id, cert, state = "ready", tier = "star") => ({
    id, sourceHash: `original-${cert}`, imageSha256: `image-${id}`, name: `Card ${cert}`, state, tier,
  });
  const cards = [card("141521602"), card("154679103"), card("91930132", owned, "star"),
    card("157435300", owned, "satellite"), card("155370475", owned, "star"), card("99999999")];
  const records = [
    { ...record("legacy-marnie", "141521602"), sourceHash: "legacy-original", name: "Test name" },
    record("psa-cert-141521602", "141521602"),
    record("psa-cert-154679103", "154679103", "reserved"),
    record("psa-cert-91930132", "91930132", "ready", "planet"),
    record("psa-cert-157435300", "157435300", "ready", "satellite"),
    record("psa-cert-155370475", "155370475", "ready", "planet"),
  ];
  const evidence = records.map(record => ({
    id: record.id, sourceHash: record.sourceHash, imageSha256: record.imageSha256,
    labelCerts: [record.id === "legacy-marnie" ? "141521602" : record.id.slice(9)],
    ...(record.id === "legacy-marnie" ? { visualCert: "141521602" } : { compressedImageExact: true }),
  }));
  const ledger = { ledgerSha256: "current", cards };
  const transfers = { ledgerSha256: "current", items: cards.filter(card => card.status === transferred).map(card => ({ cert: card.cert })) };
  return { dir, file: path.join(dir, "receipt.json"), ledger, transfers, snapshot: { records }, evidence };
}

test("audits every verified candidate against ledger categories including cards outside import history", t => {
  const f = fixture(t);
  const receipt = buildAudit(f.snapshot, f.ledger, f.evidence, f.transfers);
  assert.equal(receipt.countsBefore.resolvedCandidates, 6);
  assert.equal(receipt.countsBefore.unresolvedCandidates, 0);
  assert.deepEqual(receipt.duplicates, [{ cert: "141521602", ids: ["legacy-marnie", "psa-cert-141521602"] }]);
  assert.ok(receipt.records[0].discrepancies.includes("name_mismatch"));
  assert.ok(receipt.records[0].discrepancies.includes("not_owned_candidate"));
  assert.deepEqual(receipt.actions.filter(a => a.action === "move_approved_category").map(a => a.cert), ["91930132", "155370475"]);
  assert.ok(receipt.records.find(r => r.cert === "155370475").discrepancies.includes("category_mismatch"));
  assert.equal(receipt.transferResults.find(r => r.cert === "99999999").result, "absent_from_complete_server_snapshot");
});

test("blocks stale evidence and certificate/image conflicts instead of trusting names or fixed IDs", t => {
  const f = fixture(t), r = f.snapshot.records[1];
  assert.equal(identify({ ...r, imageSha256: "changed" }, f.ledger.cards, f.evidence).resolved, false);
  assert.equal(identify({ ...r, sourceHash: "original-154679103" }, f.ledger.cards, f.evidence).resolved, false);
  assert.equal(identify({ id: "unknown", name: r.name }, f.ledger.cards, []).resolved, false);
  const receipt = buildAudit({ records: [{ ...r, imageSha256: "changed" }] }, f.ledger, f.evidence, f.transfers);
  assert.equal(receipt.actions.length, 0);
  assert.equal(receipt.countsBefore.unresolvedCandidates, 1);
  assert.ok(receipt.transferResults.every(r => r.result === "identity_review_required"));
  assert.throws(() => buildAudit(f.snapshot, f.ledger, f.evidence, { ...f.transfers, ledgerSha256: "old" }), /stale/);
});

test("fetches every category and active/past page including legacy IDs, rejecting repeated cursors", async () => {
  const calls = [];
  const result = await listAllAdminImages(async (action, data) => {
    assert.equal(action, "adminListNanikaImages");
    calls.push(data);
    const count = data.tier === "psa" && !data.past && !data.cursor ? 50 : 1;
    return { items: Array.from({ length: count }, (_, index) => ({
      id: `${data.tier}-${data.past}-${data.cursor || "first"}-${index}`, tier: data.tier, state: data.past ? "removed" : "ready", name: "Card",
    })), nextCursor: count === 50 ? "second" : null };
  });
  assert.equal(calls.length, 9);
  assert.equal(result.records.length, 58);
  assert.ok(result.pages.some(page => page.cursor === "second"));
  await assert.rejects(listAllAdminImages(async () => ({ items: [], nextCursor: "cycle" })), /Repeated/);
});

test("removes all proven transferred IDs without restoring consumed cards, durably recording partial failures", async t => {
  const f = fixture(t);
  const receipt = buildAudit(f.snapshot, f.ledger, f.evidence, f.transfers);
  const records = new Map(f.snapshot.records.map(r => [r.id, { ...r }]));
  const calls = [];
  const backend = {
    verifyLedger: async () => {},
    get: async id => records.get(id),
    call: async (action, data) => {
      calls.push({ action, data });
      const r = records.get(data.id);
      records.set(data.id, { ...r, ...(action === "adminRemoveNanikaImage" ? { state: "removed" } : { tier: data.tier }) });
      if (data.id === "psa-cert-141521602") throw Error("Response lost after commit");
      return { id: data.id };
    },
  };
  await executeAudit(receipt, backend, f.file);
  assert.deepEqual(receipt.results.map(r => r.result), ["removed", "failed", "reserved", "moved", "moved"]);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2].data, { id: "psa-cert-91930132", fromTier: "planet", tier: "star", confirmed: true });
  assert.equal(JSON.parse(fs.readFileSync(f.file, "utf8")).results[1].after.state, "removed");
  const resumed = buildAudit({ records: [...records.values()] }, f.ledger, f.evidence, f.transfers);
  await executeAudit(resumed, backend, f.file);
  assert.equal(calls.length, 4);
  assert.deepEqual(resumed.results.map(r => r.result), ["already_removed", "already_removed", "reserved"]);
});

test("does not move consumed, duplicate, conflicting or unnamed candidates", t => {
  const f = fixture(t);
  for (const state of ["removed", "shipping"]) {
    const records = f.snapshot.records.map(r => r.id === "psa-cert-155370475" ? { ...r, state } : r);
    assert.ok(!buildAudit({ records }, f.ledger, f.evidence, f.transfers).actions.some(a => a.cert === "155370475"));
  }
  const original = f.snapshot.records.find(r => r.id === "psa-cert-155370475");
  const duplicate = { ...original, id: "legacy-duplicate" };
  const proof = { ...f.evidence.find(e => e.id === original.id), id: duplicate.id };
  assert.ok(!buildAudit({ records: [...f.snapshot.records, duplicate] }, f.ledger, [...f.evidence, proof], f.transfers).actions.some(a => a.cert === "155370475"));
  const ledger = { ...f.ledger, cards: f.ledger.cards.map(c => c.cert === "155370475" ? { ...c, ledgerStatus: transferred } : c) };
  assert.ok(!buildAudit(f.snapshot, ledger, f.evidence, f.transfers).actions.some(a => a.cert === "155370475"));
});
