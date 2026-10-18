import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJstDateTime, parseJstDateTime } from "./dateTime";

test("formats timestamps in JST regardless of the host time zone", () => {
  assert.equal(
    formatJstDateTime(new Date("2026-10-18T21:48:22Z")),
    "2026/10/19 06:48:22 JST"
  );
});

test("formats midnight and year boundaries in JST", () => {
  assert.equal(
    formatJstDateTime(new Date("2026-12-31T15:00:00Z")),
    "2027/01/01 00:00:00 JST"
  );
});

test("interprets datetime-local deadlines as JST before serializing for storage", () => {
  assert.equal(
    parseJstDateTime("2026-10-19T23:59").toISOString(),
    "2026-10-19T14:59:00.000Z"
  );
  assert.equal(
    parseJstDateTime("2027-01-01T00:00").toISOString(),
    "2026-12-31T15:00:00.000Z"
  );
});

test("preserves seconds and round-trips entered deadlines", () => {
  const date = parseJstDateTime("2026-10-19T06:48:22");
  assert.equal(date.toISOString(), "2026-10-18T21:48:22.000Z");
  assert.equal(formatJstDateTime(date), "2026/10/19 06:48:22 JST");
});

test("does not turn empty or invalid deadlines into valid timestamps", () => {
  assert.ok(Number.isNaN(parseJstDateTime("").getTime()));
  assert.ok(Number.isNaN(parseJstDateTime("invalid").getTime()));
});
