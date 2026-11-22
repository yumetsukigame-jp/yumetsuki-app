import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import { listNanikaPrizeCatalog, NanikaCatalogRequestError, parseNanikaCatalogQuery } from "./nanikaPrizeCatalog";

type RecordData = { id: string; tier: string; state: string; name: string; createdAt: number; reservedBy?: string };

function fixture(records: RecordData[]) {
  const filters: [string, string, unknown][] = [];
  let position: RecordData | undefined;
  let maximum = 0;
  let projection: string[] = [];
  const doc = (record?: RecordData) => ({
    id: record?.id, exists: Boolean(record),
    get: (field: string) => record?.[field as keyof RecordData],
  });
  const query = {
    where(field: string, operator: string, value: unknown) { filters.push([field, operator, value]); return query; },
    orderBy() { return query; },
    startAfter(previous: ReturnType<typeof doc>) { position = records.find(record => record.id === previous.id); return query; },
    select(...fields: string[]) { projection = fields; return query; },
    limit(count: number) { maximum = count; return query; },
    doc(id: string) { return { get: async () => doc(records.find(record => record.id === id)) }; },
    async get() {
      const selected = records.filter(record => filters.every(([field, , value]) => record[field as keyof RecordData] === value))
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
        .filter(record => !position || record.createdAt < position.createdAt ||
          (record.createdAt === position.createdAt && record.id.localeCompare(position.id) < 0))
        .slice(0, maximum);
      return { size: selected.length, docs: selected.map(record => ({
        ...doc(record), get: (field: string) => projection.includes(field) ? record[field as keyof RecordData] : undefined,
      })) };
    },
  };
  const db = { collection(name: string) { assert.equal(name, "nanikaGachaImages"); return query; } } as unknown as Firestore;
  return { db, filters };
}

test("validates public catalogue categories and cursors before database access", () => {
  assert.deepEqual(parseNanikaCatalogQuery(new URLSearchParams("tier=star")), { tier: "star" });
  for (const query of ["", "tier=invalid", "tier=psa&cursor=", "tier=psa&cursor=../private"]) {
    assert.throws(() => parseNanikaCatalogQuery(new URLSearchParams(query)),
      (error: unknown) => error instanceof NanikaCatalogRequestError && error.status === 400);
  }
});

test("lists ready prizes without authentication or campaign publication and exposes only public fields", async () => {
  const f = fixture([
    { id: "ready", tier: "star", state: "ready", name: "Public prize", createdAt: 4, reservedBy: "private-value" },
    ...["reserved", "shipping", "removed"].map((state, index) => ({
      id: state, tier: "star", state, name: "Not a candidate", createdAt: index,
    })),
    { id: "other-tier", tier: "psa", state: "ready", name: "Other", createdAt: 5 },
  ]);
  const page = await listNanikaPrizeCatalog(f.db, { tier: "star" });
  assert.deepEqual(f.filters, [["tier", "==", "star"], ["state", "==", "ready"]]);
  assert.deepEqual(page, { items: [{ id: "ready", tier: "star", name: "Public prize", image: "/api/nanika-gacha/images/ready" }], nextCursor: null });
});

test("paginates more than fifty prizes without omitting or duplicating records", async () => {
  const records = Array.from({ length: 61 }, (_, index) => ({
    id: `prize-${index}`, tier: "psa", state: "ready", name: `Prize ${index}`, createdAt: index,
  }));
  const first = await listNanikaPrizeCatalog(fixture(records).db, { tier: "psa" });
  assert.equal(first.items.length, 50);
  assert.equal(first.nextCursor, first.items.at(-1)?.id);
  const second = await listNanikaPrizeCatalog(fixture(records).db, { tier: "psa", cursor: first.nextCursor! });
  assert.equal(second.items.length, 11);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 61);
});

test("supports a consumed pagination cursor but rejects missing and cross-category cursors", async () => {
  const records = [
    { id: "consumed", tier: "planet", state: "shipping", name: "Consumed", createdAt: 2 },
    { id: "next", tier: "planet", state: "ready", name: "Next", createdAt: 1 },
    { id: "wrong-tier", tier: "star", state: "ready", name: "Other", createdAt: 3 },
  ];
  const page = await listNanikaPrizeCatalog(fixture(records).db, { tier: "planet", cursor: "consumed" });
  assert.deepEqual(page.items.map(item => item.id), ["next"]);
  for (const cursor of ["wrong-tier", "missing"]) {
    await assert.rejects(listNanikaPrizeCatalog(fixture(records).db, { tier: "planet", cursor }),
      (error: unknown) => error instanceof NanikaCatalogRequestError && error.status === 404);
  }
});
