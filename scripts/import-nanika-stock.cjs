/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local administration tool. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");

const project = "point-app-1f854";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function saveReceipt(batch) {
  const temporary = `${batch.receiptPath}.${process.pid}.tmp`;
  try {
    const fd = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(fd, `${JSON.stringify(batch.receipt, null, 2)}\n`);
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, batch.receiptPath);
    const directory = fs.openSync(batch.dir, "r");
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function loadBatch(dir) {
  dir = fs.realpathSync(dir);
  const manifest = readJson(path.join(dir, "manifest.json"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.batchId, path.basename(dir));
  const receiptPath = path.join(dir, "receipt.json");
  const receipt = readJson(fs.existsSync(receiptPath) ? receiptPath : path.join(dir, "receipt.example.json"));
  assert.equal(receipt.batchId, manifest.batchId);
  assert.equal(receipt.results.length, manifest.items.length);
  const ids = new Set();
  for (const [index, item] of manifest.items.entries()) {
    assert.match(item.cert, /^[0-9]+$/);
    assert.equal(item.id, `psa-cert-${item.cert}`);
    assert.ok(!ids.has(item.id), "Duplicate physical card");
    ids.add(item.id);
    assert.ok(["psa", "satellite", "planet", "star"].includes(item.tier));
    assert.ok(typeof item.name === "string" && item.name === item.name.trim() && item.name.length <= 200 && !/[<>]/.test(item.name));
    const image = fs.realpathSync(path.resolve(dir, item.file));
    assert.ok(image.startsWith(`${dir}${path.sep}`), "Image outside batch");
    const bytes = fs.readFileSync(image);
    assert.ok(bytes.length > 0 && bytes.length <= 6 * 1024 * 1024);
    assert.equal(hash(bytes), item.sha256, `Image hash mismatch: ${item.id}`);
    const result = receipt.results[index];
    for (const key of ["id", "cert", "tier", "sha256"]) assert.equal(result[key], item[key]);
    assert.ok(["pending", "failed", "imported", "already_exists"].includes(result.status));
  }
  return { dir, manifest, receipt, receiptPath };
}

function matches(item, record) {
  return record && record.tier === item.tier && record.name === item.name && record.sourceHash === item.sha256;
}

function checkDuplicates(items, records) {
  for (const item of items) {
    for (const record of records) {
      if (record.id === item.id) {
        assert.ok(matches(item, record), `Fixed ID conflict: ${item.id}`);
        continue;
      }
      const certs = `${record.id} ${record.cert ?? ""} ${record.name ?? ""}`.match(/[0-9]+/g) || [];
      if (certs.includes(item.cert) || record.sourceHash === item.sha256) {
        throw Error(`Physical card already uses another ID: ${item.id} / ${record.id}`);
      }
      // Without an explicit certificate, a legacy image needs manual physical-card verification.
      if (!/^psa-cert-[0-9]+$/.test(record.id) && !/^[0-9]+$/.test(record.cert ?? "")) {
        throw Error(`Legacy ID requires certificate verification before importing: ${record.id}`);
      }
    }
  }
}

async function importBatch(batch, backend) {
  checkDuplicates(batch.manifest.items, await backend.list());
  saveReceipt(batch);
  for (const [index, item] of batch.manifest.items.entries()) {
    const result = batch.receipt.results[index];
    try {
      // Recheck the whole identity set immediately before every upload.
      const records = await backend.list();
      checkDuplicates(batch.manifest.items, records);
      const previous = records.find(record => record.id === item.id);
      if (!previous) {
        const bytes = fs.readFileSync(path.join(batch.dir, item.file));
        assert.equal(hash(bytes), item.sha256);
        const response = await backend.upload({ tier: item.tier, id: item.id, name: item.name, base64: bytes.toString("base64") });
        assert.equal(response.id, item.id, "Unexpected upload response ID");
      }
      assert.ok(matches(item, await backend.get(item.id)), `Server verification failed: ${item.id}`);
      result.status = previous ? "already_exists" : "imported";
      delete result.error;
      saveReceipt(batch);
      console.log(`${result.status}: ${item.id}`);
    } catch {
      result.status = "failed";
      result.error = "Upload or server verification failed; retry the same fixed ID.";
      saveReceipt(batch);
      throw Error(`Stopped at ${item.id}; earlier confirmed successes are preserved.`);
    }
  }
}

function ledgerCheck(batch, verifyMarks = false) {
  const root = path.dirname(batch.manifest.ledger);
  const tool = path.join(root, "\u7ba1\u7406\u30c4\u30fc\u30eb", "nanika_gacha", "acknowledge.py");
  const code = `
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1]).parent))
from prepare import locate, read_rows, TIERS
root = Path(sys.argv[2])
assert not list(root.glob('~$*.xlsx')), 'Close Excel first'
manifest = json.loads(Path(sys.argv[3]).read_text())
rows, _ = read_rows(locate(root).read_bytes())
cards = [r for r in rows if r['_row'] > 4 and r.get('A')]
by_cert = {r['A']: r for r in cards}
assert len(cards) == len(by_cert), 'Duplicate ledger certificate'
for item in manifest['items']:
    row = by_cert[item['cert']]
    assert row.get('B', '').strip() == item['name'], item['id']
    assert row.get('D') == '\\u4fdd\\u6709\\u4e2d', item['id']
    assert TIERS.get(row.get('J', '').strip()) == item['tier'], item['id']
    assert row.get('K', '') in ('', '\\u53cd\\u6620\\u6e08\\u307f'), item['id']
if sys.argv[4] == 'verify':
    receipt = json.loads(Path(sys.argv[5]).read_text())
    for result in receipt['results']:
        if result['status'] in ('imported', 'already_exists'):
            assert by_cert[result['cert']].get('K') == '\\u53cd\\u6620\\u6e08\\u307f', result['id']
print('Ledger verified')
`;
  const check = spawnSync("python3", ["-c", code, tool, root, path.join(batch.dir, "manifest.json"), verifyMarks ? "verify" : "preflight", batch.receiptPath], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr || "Ledger preflight failed");
  return tool;
}

async function main() {
  const batch = loadBatch(process.argv[2]);
  const tool = ledgerCheck(batch);
  const { initializeApp, cert } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const { getAuth } = require("firebase-admin/auth");
  assert.equal(process.env.FIREBASE_PROJECT_ID, project);
  const app = initializeApp({ credential: cert({
    projectId: project, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }) });
  const db = getFirestore(app);
  const backend = {
    list: async () => (await db.collection("nanikaGachaImages").select("tier", "name", "state", "sourceHash", "cert").get()).docs.map(doc => ({ ...doc.data(), id: doc.id })),
    get: async id => (await db.collection("nanikaGachaImages").doc(id).get()).data(),
  };
  checkDuplicates(batch.manifest.items, await backend.list());
  if (process.argv.includes("--check")) {
    console.log(`Preflight passed: ${batch.manifest.items.length} images; no duplicate physical cards.`);
    await app.delete();
    return;
  }
  const lock = path.join(batch.dir, ".import.lock");
  const fd = fs.openSync(lock, "wx", 0o600);
  fs.closeSync(fd);
  const nonce = crypto.randomBytes(32).toString("hex");
  const apiKey = fs.readFileSync(path.join(__dirname, "..", "firebase.ts"), "utf8").match(/apiKey: "([^"]+)"/)[1];
  let session, running = false;
  const origin = "http://127.0.0.1:3216";
  async function jsonPost(url, data, token) {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(data), signal: AbortSignal.timeout(150000),
    });
    const body = await response.json();
    if (!response.ok || body.error) throw Error("Authenticated request failed");
    return body;
  }
  backend.upload = async data => {
    if (Date.now() > session.expires - 120000) {
      const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Session refresh failed");
      const value = await response.json();
      session = { token: value.id_token, refreshToken: value.refresh_token, expires: Date.now() + Number(value.expires_in) * 1000 };
    }
    return (await jsonPost(`https://us-east1-${project}.cloudfunctions.net/adminUploadNanikaImage`, { data }, session.token)).result;
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    const reply = (status, body) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }); response.end(body); };
    if (request.headers.host !== "127.0.0.1:3216") return reply(403, "Invalid host");
    if (request.method === "GET" && request.url === "/") return reply(200, `<!doctype html><meta charset="utf-8"><title>Nanika local import</title><h1>Nanika: ${batch.manifest.items.length} prizes</h1><p>Credentials stay in memory. Close Excel before importing.</p><form method="post" action="/login"><input type="hidden" name="nonce" value="${nonce}"><input name="email" type="email" placeholder="Admin email" required autocomplete="username"><input name="password" type="password" placeholder="Password" required autocomplete="current-password"><button>Admin login</button></form>`);
    if (request.method !== "POST" || request.headers.origin !== origin || !["/login", "/import"].includes(request.url)) return reply(403, "Forbidden");
    try {
      let body = "";
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 8192) throw Error("Request too large");
      }
      const fields = new URLSearchParams(body);
      assert.equal(fields.get("nonce"), nonce);
      if (request.url === "/login") {
        if (running) return reply(409, "Import running");
        const value = await jsonPost(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
          email: fields.get("email"), password: fields.get("password"), returnSecureToken: true,
        });
        const user = await getAuth(app).verifyIdToken(value.idToken, true);
        assert.ok((await db.collection("admins").doc(user.uid).get()).exists, "Not an administrator");
        session = { token: value.idToken, refreshToken: value.refreshToken, expires: Date.now() + Number(value.expiresIn) * 1000 };
        return reply(200, `<h1>Administrator authenticated</h1><form method="post" action="/import"><input type="hidden" name="nonce" value="${nonce}"><button>Register ${batch.manifest.items.length} prizes and acknowledge successful entries</button></form>`);
      }
      if (!session || running) return reply(409, "Login required or import running");
      running = true;
      let error;
      try {
        ledgerCheck(batch);
        await importBatch(batch, backend);
      } catch (failure) { error = failure; }
      // Acknowledge only durable, server-confirmed successes, including a partial import.
      if (fs.existsSync(batch.receiptPath)) {
        for (const result of batch.receipt.results.filter(r => ["imported", "already_exists"].includes(r.status))) {
          const item = batch.manifest.items.find(i => i.id === result.id);
          assert.ok(matches(item, await backend.get(item.id)), "Success record no longer matches server");
        }
        const ack = spawnSync("python3", [tool, batch.dir, batch.receiptPath], { encoding: "utf8" });
        assert.equal(ack.status, 0, ack.stderr || "Acknowledgment failed");
        console.log(ack.stdout.trim());
        ledgerCheck(batch, true);
      }
      if (error) throw error;
      console.log("COMPLETE: all prizes verified and ledger acknowledged.");
      reply(200, "Import complete. Server records and successful ledger marks verified.");
      session = undefined;
      server.close();
    } catch {
      running = false;
      console.error("Operation stopped. Inspect receipt.json; only verified successes can be acknowledged.");
      reply(400, "Operation stopped. No credentials logged. Check terminal and retry using the same batch.");
    }
  });
  const cleanup = () => { if (fs.existsSync(lock)) fs.unlinkSync(lock); };
  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { cleanup(); process.exit(0); });
  server.on("close", async () => { cleanup(); await app.delete(); });
  server.listen(3216, "127.0.0.1", () => console.log(`Admin login: ${origin}`));
}

module.exports = { loadBatch, checkDuplicates, importBatch, matches };
if (require.main === module) main().catch(() => { console.error("Preflight failed; no uploads performed."); process.exitCode = 1; });
