/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local administration tool. */
const fs = require("node:fs");
const assert = require("node:assert/strict");

function saveAudit(file, receipt) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(receipt, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function identify(record, cards, evidence) {
  const facts = [], issues = [];
  const add = (method, cert) => { if (cert) facts.push({ method, cert }); };
  add("record_cert", /^[0-9]+$/.test(record.cert || "") ? record.cert : null);
  add("fixed_id", /^psa-cert-[0-9]+$/.test(record.id) ? record.id.slice(9) : null);
  const originals = record.sourceHash ? cards.filter(card => card.originalSha256 === record.sourceHash) : [];
  for (const card of originals) add("original_source_sha256", card.cert);
  const proof = evidence.find(item => item.id === record.id);
  const proofMatches = proof && proof.sourceHash === record.sourceHash && proof.imageSha256 === record.imageSha256;
  if (proofMatches) {
    for (const cert of proof.labelCerts || []) add("server_image_label", cert);
    if (proof.visualCert) add("visual_comparison_with_ledger_original", proof.visualCert);
  } else issues.push("image_evidence_missing_or_stale");
  const certs = [...new Set(facts.map(fact => fact.cert))];
  if (certs.length > 1) issues.push("certificate_image_conflict");
  const cert = certs.length === 1 ? certs[0] : null;
  const card = cards.find(card => card.cert === cert);
  if (!card) issues.push("certificate_not_in_ledger");
  const verifiedImage = proofMatches && Boolean(
    (proof.compressedImageExact && originals.some(card => card.cert === cert)) ||
    (proof.visualCert === cert && proof.labelCerts?.includes(cert)));
  if (!verifiedImage) issues.push("image_identity_unverified");
  return { cert, card: card || null, facts, proof: proofMatches ? proof : null, issues,
    resolved: Boolean(cert && card && verifiedImage && issues.length === 0) };
}

function buildAudit(snapshot, ledger, evidence, transfers) {
  assert.equal(transfers.ledgerSha256, ledger.ledgerSha256, "Transfer report is stale");
  const ids = snapshot.records.map(record => record.id);
  assert.equal(ids.length, new Set(ids).size, "Duplicate server ID");
  const cards = ledger.cards;
  assert.equal(cards.length, new Set(cards.map(card => card.cert)).size, "Duplicate ledger certificate");
  const records = snapshot.records.map(record => {
    const identity = identify(record, cards, evidence), card = identity.card;
    const candidate = ["ready", "reserved"].includes(record.state);
    const discrepancies = [];
    if (identity.resolved) {
      if (record.name !== card.name) discrepancies.push("name_mismatch");
      if (card.status !== card.ledgerStatus || card.name !== card.ledgerName) discrepancies.push("ledger_sheet_conflict");
      if (candidate && card.status !== "\u4fdd\u6709\u4e2d") discrepancies.push("not_owned_candidate");
      if (candidate && !card.tier) discrepancies.push("category_blank_or_unknown");
      if (candidate && card.tier && record.tier !== card.tier) discrepancies.push("category_mismatch");
    }
    return { ...record, candidate, cert: identity.cert, resolved: identity.resolved,
      identityEvidence: { facts: identity.facts, image: identity.proof }, ledger: card,
      unresolvedReasons: identity.issues, discrepancies };
  });
  const groups = new Map();
  for (const record of records.filter(record => record.resolved)) {
    if (!groups.has(record.cert)) groups.set(record.cert, []);
    groups.get(record.cert).push(record.id);
  }
  const duplicates = [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([cert, ids]) => ({ cert, ids }));
  const transferResults = transfers.items.map(item => {
    const matched = records.filter(record => record.resolved && record.cert === item.cert);
    return { cert: item.cert, ledgerName: cards.find(card => card.cert === item.cert)?.name,
      actualIds: matched.map(record => record.id),
      result: matched.length ? "matched" : records.some(record => !record.resolved) ? "identity_review_required" : "absent_from_complete_server_snapshot",
      records: matched.map(record => ({ id: record.id, before: record, after: null, result: "pending", error: null })) };
  });
  const candidates = records.filter(record => record.candidate);
  const actions = [];
  for (const record of records.filter(record => record.resolved)) {
    if (record.ledger.status === "\u8b72\u6e21\u6e08\u307f" && record.ledger.ledgerStatus === "\u8b72\u6e21\u6e08\u307f") {
      actions.push({ id: record.id, cert: record.cert, action: "remove_transferred", expected: record });
    } else if (record.candidate && record.ledger.status === "\u4fdd\u6709\u4e2d" &&
      record.ledger.ledgerStatus === "\u4fdd\u6709\u4e2d" &&
      record.ledger.name === record.ledger.ledgerName && record.name === record.ledger.name &&
      ["psa", "satellite", "planet", "star"].includes(record.ledger.tier) &&
      record.tier !== record.ledger.tier &&
      candidates.filter(candidate => candidate.resolved && candidate.cert === record.cert).length === 1) {
      actions.push({ id: record.id, cert: record.cert, action: "move_approved_category", fromTier: record.tier, tier: record.ledger.tier, expected: record });
    }
  }
  return { schemaVersion: 1, auditedAt: new Date().toISOString(), ledgerSha256: ledger.ledgerSha256,
    transferReportLedgerSha256: transfers.ledgerSha256, serverSnapshotBefore: snapshot,
    countsBefore: { serverRecords: records.length, candidates: candidates.length,
      resolvedCandidates: candidates.filter(record => record.resolved).length,
      unresolvedCandidates: candidates.filter(record => !record.resolved).length,
      uniqueCandidateCertificates: new Set(candidates.filter(record => record.resolved).map(record => record.cert)).size },
    records, duplicates, transferResults, actions, results: [] };
}

async function listAllAdminImages(call) {
  const records = [], pages = [];
  for (const tier of ["psa", "satellite", "planet", "star"]) {
    for (const past of [false, true]) {
      let cursor;
      const seen = new Set();
      do {
        const response = await call("adminListNanikaImages", { tier, past, ...(cursor ? { cursor } : {}) });
        assert.ok(Array.isArray(response.items));
        pages.push({ tier, past, cursor: cursor || null, count: response.items.length, nextCursor: response.nextCursor });
        records.push(...response.items.map(({ id, tier, name, state }) => ({ id, tier, name, state })));
        cursor = response.nextCursor;
        if (cursor) {
          assert.ok(!seen.has(cursor), "Repeated pagination cursor");
          seen.add(cursor);
        }
      } while (cursor);
    }
  }
  assert.equal(records.length, new Set(records.map(record => record.id)).size, "Duplicate paginated server ID");
  return { records, pages };
}

async function executeAudit(receipt, backend, file) {
  saveAudit(file, receipt);
  for (const action of receipt.actions) {
    let before, after, result, error = null;
    try {
      await backend.verifyLedger();
      before = await backend.get(action.id);
      assert.ok(before, "Record missing");
      for (const key of ["sourceHash", "imageSha256", "name"]) assert.equal(before[key], action.expected[key], "Identity changed since audit");
      after = before;
      if (before.state === "removed") result = "already_removed";
      else if (before.state === "shipping") result = "shipping";
      else if (before.state === "reserved") result = "reserved";
      else {
        assert.equal(before.state, "ready", "Unexpected state");
        if (action.action === "move_approved_category" && before.tier === action.tier) result = "already_moved";
        else {
          const removal = action.action === "remove_transferred";
          if (!removal) assert.equal(before.tier, action.fromTier, "Current category differs from approved source");
          const response = await backend.call(removal ? "adminRemoveNanikaImage" : "adminMoveNanikaImage",
            removal ? { id: action.id } : { id: action.id, fromTier: action.fromTier, tier: action.tier, confirmed: true });
          assert.equal(response.id, action.id);
          after = await backend.get(action.id);
          assert.ok(after);
          for (const key of ["sourceHash", "imageSha256", "name"]) assert.equal(after[key], before[key]);
          assert.equal(after.state, removal ? "removed" : "ready");
          assert.equal(after.tier, removal ? before.tier : action.tier);
          result = removal ? "removed" : "moved";
        }
      }
    } catch {
      result = "failed";
      error = "Identity, ledger, API response or server verification failed; inspect current server state before retrying.";
      try { after = await backend.get(action.id); } catch { after = null; }
    }
    const entry = { id: action.id, cert: action.cert, action: action.action, before: before || null,
      after: after || null, result, error, checkedAt: new Date().toISOString() };
    receipt.results.push(entry);
    const transfer = receipt.transferResults.find(item => item.cert === action.cert);
    const target = transfer?.records.find(record => record.id === action.id);
    if (target) Object.assign(target, { before: entry.before, after: entry.after, result, error });
    saveAudit(file, receipt);
    console.log(`${result}: ${action.cert} / ${action.id}`);
  }
  return receipt;
}

module.exports = { saveAudit, identify, buildAudit, listAllAdminImages, executeAudit };
