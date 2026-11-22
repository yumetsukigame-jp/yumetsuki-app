/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local administration tool. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function saveJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    const directory = fs.openSync(path.dirname(file), "r");
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function loadApproval(file, batch) {
  const approval = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(approval.schemaVersion, 1);
  assert.equal(approval.newBatchId, batch.manifest.batchId);
  assert.equal(approval.newCount, batch.manifest.items.length);
  const ids = new Set(batch.manifest.items.map(item => item.id));
  for (const [action, items] of [["remove", approval.removals], ["move", approval.moves]]) {
    for (const item of items) {
      assert.match(item.cert, /^[0-9]+$/);
      assert.equal(item.id, `psa-cert-${item.cert}`);
      assert.ok(!ids.has(item.id), `Duplicate approved physical card: ${item.id}`);
      ids.add(item.id);
      assert.equal(item.action, `${action}_if_ready`);
      if (action === "move") {
        assert.equal(item.fromTier, "planet");
        assert.equal(item.tier, "satellite");
      }
    }
  }
  const receiptPath = file.replace(/\.json$/, ".receipt.json");
  assert.notEqual(receiptPath, file);
  const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : {
    schemaVersion: 1, approvedOn: approval.approvedOn, ledgerSha256: approval.ledgerSha256,
    newBatchId: approval.newBatchId, results: [],
  };
  for (const key of ["ledgerSha256", "approvedOn", "newBatchId"]) assert.equal(receipt[key], approval[key]);
  return { approval, receipt, receiptPath };
}

function checkApprovedLedger(update, batch) {
  const root = path.dirname(batch.manifest.ledger);
  const tools = path.join(root, "\u7ba1\u7406\u30c4\u30fc\u30eb", "nanika_gacha");
  const code = `
import sys, json, hashlib
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from prepare import locate, read_rows, TIERS
root = Path(sys.argv[2])
assert not list(root.glob('~$*.xlsx')), 'Close Excel first'
approval = json.loads(sys.argv[3])
original = locate(root).read_bytes()
current = hashlib.sha256(original).hexdigest()
rows, _ = read_rows(original)
cards = [r for r in rows if r['_row'] > 4 and r.get('A')]
by_cert = {r['A']: r for r in cards}
assert len(cards) == len(by_cert), 'Duplicate ledger certificate'
holding, _ = read_rows(original, '\\u30ab\\u30fc\\u30c9\\u53f0\\u5e33')
statuses = {r['A'].strip(): r for r in holding if r['_row'] >= 2 and r.get('A')}
for item in approval['removals'] + approval['moves']:
    row = by_cert[item['cert']]
    assert row.get('B', '').strip() == item['name'], item['id']
    assert row.get('K') == '\\u53cd\\u6620\\u6e08\\u307f', item['id']
    if item['action'] == 'move_if_ready':
        assert row.get('D') == '\\u4fdd\\u6709\\u4e2d' and TIERS.get(row.get('J', '').strip()) == item['tier'], item['id']
    elif item.get('reason') == '\\u8b72\\u6e21\\u6e08\\u307f':
        assert statuses[item['cert']].get('B', '').strip() == '\\u8b72\\u6e21\\u6e08\\u307f', item['id']
        assert row.get('D') == '\\u8b72\\u6e21\\u6e08\\u307f', item['id']
    else:
        assert row.get('D') == '\\u4fdd\\u6709\\u4e2d' and not row.get('J', '').strip(), item['id']
if current not in (approval['ledgerSha256'], sys.argv[4]):
    raise AssertionError('Ledger hash changed; regenerate transfer report and reapprove differences before executing')
print(current)
`;
  const check = spawnSync("python3", ["-c", code, tools, root, JSON.stringify(update.approval),
    update.receipt.acknowledgedLedgerSha256 || ""], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || "Approved ledger preflight failed");
  return check.stdout.trim();
}

function verifiedLegacyRecords(records, verified) {
  const ids = new Set();
  for (const item of verified) {
    assert.ok(!ids.has(item.id), "Duplicate legacy verification");
    ids.add(item.id);
    assert.match(item.cert, /^[0-9]+$/);
    assert.match(item.sourceHash, /^[a-f0-9]{64}$/);
    const record = records.find(record => record.id === item.id);
    assert.ok(record, `Verified legacy record missing: ${item.id}`);
    for (const key of ["name", "tier", "sourceHash"]) assert.equal(record[key], item[key], `Legacy verification changed: ${item.id}`);
    if (record.cert !== undefined) assert.equal(record.cert, item.cert);
  }
  return records.map(record => {
    const item = verified.find(item => item.id === record.id);
    return item ? { ...record, cert: item.cert } : record;
  });
}

function snapshot(record) {
  return record ? { state: record.state ?? null, tier: record.tier ?? null, name: record.name ?? null } : null;
}

function unchangedResult(item, record) {
  if (!record) return "missing";
  if (record.name !== item.name) return "failed";
  if (record.state === "removed") return "already_removed";
  if (record.state === "shipping") return "shipping";
  if (record.state === "reserved") return "reserved";
  if (record.state !== "ready") return "failed";
  if (item.action === "move_if_ready") {
    if (record.tier === item.tier) return "already_moved";
    if (record.tier !== item.fromTier) return "failed";
  }
  return null;
}

async function reconcileApproved(update, backend) {
  const { approval, receipt, receiptPath } = update;
  saveJson(receiptPath, receipt);
  for (const item of [...approval.removals, ...approval.moves]) {
    let before, after, result, error = null;
    try {
      before = await backend.get(item.id);
      result = unchangedResult(item, before);
      if (!result) {
        const action = item.action === "remove_if_ready" ? "adminRemoveNanikaImage" : "adminMoveNanikaImage";
        const data = action === "adminRemoveNanikaImage" ? { id: item.id } :
          { id: item.id, fromTier: item.fromTier, tier: item.tier, confirmed: true };
        const response = await backend.call(action, data);
        assert.equal(response.id, item.id);
        after = await backend.get(item.id);
        assert.ok(after && after.name === item.name);
        if (action === "adminRemoveNanikaImage") {
          assert.equal(after.state, "removed");
          assert.equal(after.tier, before.tier);
          result = "removed";
        } else {
          assert.equal(after.state, "ready");
          assert.equal(after.tier, item.tier);
          result = "moved";
        }
      } else {
        after = before;
        if (result === "failed") error = "Record name, state or current tier conflicts with approval.";
      }
    } catch (failure) {
      result = "failed";
      error = failure.code || "Authenticated update or server verification failed; recheck current state before retry.";
      try { after = await backend.get(item.id); } catch { after = undefined; }
    }
    const entry = { id: item.id, cert: item.cert, action: item.action, before: snapshot(before),
      after: snapshot(after), result, error, checkedAt: new Date().toISOString() };
    const previous = receipt.results.findIndex(result => result.id === item.id);
    if (previous === -1) receipt.results.push(entry);
    else {
      const prior = receipt.results[previous];
      receipt.results[previous] = { ...entry, history: [...(prior.history || []),
        Object.fromEntries(Object.entries(prior).filter(([key]) => key !== "history"))] };
    }
    saveJson(receiptPath, receipt);
    console.log(`${result}: ${item.id}`);
  }
  return receipt;
}

function recordAcknowledgedLedger(update, batch) {
  assert.ok(batch.receipt.results.every(result => ["imported", "already_exists"].includes(result.status)));
  update.receipt.acknowledgedLedgerSha256 = createHash("sha256").update(fs.readFileSync(batch.manifest.ledger)).digest("hex");
  saveJson(update.receiptPath, update.receipt);
}

module.exports = { loadApproval, checkApprovedLedger, verifiedLegacyRecords, reconcileApproved, recordAcknowledgedLedger };
