import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { createHash } from "node:crypto";
import { FieldPath, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import type {
  NeraiuchiAdminEvent,
  NeraiuchiAvailability,
  NeraiuchiDraft,
  NeraiuchiEntry,
  NeraiuchiEvent,
  NeraiuchiPrize,
  NeraiuchiRevealedEntry,
  NeraiuchiResultRow,
  NeraiuchiListedEvent,
} from "./neraiuchiTypes";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore();
const events = db.collection("neraiuchiEvents");
const archives = db.collection("neraiuchiEventsArchive");
const secrets = db.collection("neraiuchiSecrets");
const counters = db.collection("neraiuchiCounters");
const audits = db.collection("neraiuchiAudit");

const POLICY = { entryCost: 0, maxPerAccount: 1, maxEntries: 10000, maxWinningNumbers: 100 } as const;
const enabled = () => process.env.NERAIUCHI_ENABLED === "true";
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;

function invalid(message: string): never {
  throw new functions.https.HttpsError("invalid-argument", message);
}

function input(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("入力形式が不正です");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !allowed.includes(key))) invalid("指定できない入力項目があります");
  return data;
}

function id(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) invalid("企画IDが不正です");
  return value;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max ||
      /[<>]|(?:javascript|data|vbscript)\s*:/i.test(value)) {
    invalid(`${label}は1〜${max}文字のプレーンテキストで入力してください`);
  }
  return value.trim();
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    invalid(`${label}は${min}〜${max}の整数で指定してください`);
  }
  return value;
}

function timestamp(value: unknown): Timestamp {
  const millis = integer(value, "日時", 0, 253402300799999);
  return Timestamp.fromMillis(millis);
}

type ValidatedDraft = NeraiuchiDraft & { rewardMode: "claim" | "manual" };

function validatePrize(value: unknown, maxEntries: number): NeraiuchiPrize {
  const data = input(value, ["number", "label", "points", "shippingEnabled"]);
  if (typeof data.shippingEnabled !== "boolean") invalid("発送可否を指定してください");
  return {
    number: integer(data.number, "当選番号", 1, maxEntries),
    label: text(data.label, "賞品名", 200),
    points: integer(data.points, "代替ポイント", data.shippingEnabled ? 0 : 1, 1000000),
    shippingEnabled: data.shippingEnabled,
  };
}

function validateDraft(data: Record<string, unknown>): ValidatedDraft {
  const startsAt = timestamp(data.startsAt).toMillis();
  const endsAt = timestamp(data.endsAt).toMillis();
  if (startsAt >= endsAt) invalid("終了日時は開始日時より後にしてください");
  const maxEntries = integer(data.maxEntries, "参加上限", 1, POLICY.maxEntries);
  let prizes: NeraiuchiPrize[];
  const rewardMode = data.prizes === undefined ? "manual" : "claim";
  if (rewardMode === "claim") {
    if (!Array.isArray(data.prizes) || data.prizes.length < 1 || data.prizes.length > POLICY.maxWinningNumbers) {
      invalid("当選枠は1〜100件で指定してください");
    }
    prizes = data.prizes.map((prize) => validatePrize(prize, maxEntries));
  } else {
    // Published legacy events retain their original manual fulfillment policy.
    if (!Array.isArray(data.winningNumbers) || data.winningNumbers.length < 1 ||
        data.winningNumbers.length > POLICY.maxWinningNumbers) invalid("当選番号は1〜100件で指定してください");
    const label = text(data.rewardLabel, "当選内容", 200);
    prizes = data.winningNumbers.map((number) => ({
      number: integer(number, "当選番号", 1, maxEntries), label, points: 0, shippingEnabled: false,
    }));
  }
  if (new Set(prizes.map((prize) => prize.number)).size !== prizes.length) invalid("当選番号が重複しています");
  if (data.thumbnailPath !== "/menu/thumbnails/neraiuchi.png") invalid("指定できない画像です");
  return {
    title: text(data.title, "企画名", 80),
    description: text(data.description, "説明", 2000),
    thumbnailPath: data.thumbnailPath,
    startsAt, endsAt, maxEntries,
    prizes: prizes.sort((a, b) => a.number - b.number), rewardMode,
    claimInstructions: text(data.claimInstructions, "受け取り案内", 2000),
  };
}

function requireUser(context: functions.https.CallableContext): string {
  if (!context.auth?.uid) throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
  return context.auth.uid;
}

async function requireAdmin(context: functions.https.CallableContext): Promise<string> {
  const uid = requireUser(context);
  if (!(await db.collection("admins").doc(uid).get()).exists) {
    throw new functions.https.HttpsError("permission-denied", "管理者のみ実行できます");
  }
  return uid;
}

function callable(
  name: string,
  handler: (data: unknown, context: functions.https.CallableContext) => Promise<unknown>
) {
  return functions.region("us-east1").runWith({ timeoutSeconds: 120 }).https.onCall(async (data, context) => {
    try {
      return await handler(data, context);
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      console.error("狙い撃ちAPIに失敗しました", { api: name });
      throw new functions.https.HttpsError("internal", "処理を確認できませんでした。結果を確認してから再試行してください。");
    }
  });
}

function availability(event: FirebaseFirestore.DocumentData, count: number, now: number): NeraiuchiAvailability {
  if (!enabled()) return "disabled";
  if (event.state !== "published") return "closed";
  if (now >= event.endsAt.toMillis()) return "ended";
  if (count >= event.maxEntries) return "full";
  if (now < event.startsAt.toMillis()) return "upcoming";
  return "open";
}

function acceptedCount(snapshot: FirebaseFirestore.DocumentSnapshot): number {
  const count: unknown = snapshot.get("acceptedCount");
  if (!snapshot.exists || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new functions.https.HttpsError("failed-precondition", "参加カウンターの設定に不整合があります");
  }
  return count;
}

function assertReadableRound(snapshot: FirebaseFirestore.DocumentSnapshot): void {
  if (!snapshot.exists || snapshot.get("archiving") === true ||
      (snapshot.ref.parent.id === archives.id && snapshot.get("archiveComplete") !== true)) {
    throw new functions.https.HttpsError("unavailable", "開催記録を整理しています。少し待って再取得してください");
  }
}

async function findRound(eventId: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const active = await events.doc(eventId).get();
  if (active.exists) {
    assertReadableRound(active);
    return active;
  }
  const archived = await archives.doc(eventId).get();
  if (!archived.exists) throw new functions.https.HttpsError("not-found", "企画が見つかりません");
  assertReadableRound(archived);
  return archived;
}

async function refreshRound(snapshot: FirebaseFirestore.DocumentSnapshot) {
  const current = await snapshot.ref.get();
  assertReadableRound(current);
  return current;
}

async function roundCount(snapshot: FirebaseFirestore.DocumentSnapshot) {
  if (snapshot.ref.parent.id === archives.id) return acceptedCount(snapshot);
  const counter = await counters.doc(snapshot.id).get();
  if (!counter.exists) await refreshRound(snapshot);
  return acceptedCount(counter);
}

function publicEvent(eventId: string, data: FirebaseFirestore.DocumentData, count: number, now: number): NeraiuchiEvent {
  const status = availability(data, count, now);
  return {
    id: eventId,
    title: data.title,
    description: data.description,
    thumbnailPath: data.thumbnailPath,
    startsAt: data.startsAt.toMillis(),
    endsAt: data.endsAt.toMillis(),
    entryCost: POLICY.entryCost,
    maxPerAccount: POLICY.maxPerAccount,
    rewardLabel: data.rewardLabel,
    claimInstructions: data.claimInstructions,
    version: data.version,
    availability: status === "full" ? "closed" : status,
    resultsReleased: resultsReleased(data, now),
  };
}

function resultsReleased(event: FirebaseFirestore.DocumentData, now: number): boolean {
  return event.state === "closed" || event.state === "archived" ||
    (event.state === "published" && now >= event.endsAt.toMillis());
}

function entryResult(data: FirebaseFirestore.DocumentData, released: true): NeraiuchiRevealedEntry;
function entryResult(data: FirebaseFirestore.DocumentData, released: boolean): NeraiuchiEntry;
function entryResult(data: FirebaseFirestore.DocumentData, released: boolean): NeraiuchiEntry {
  if (!(data.acceptedAt instanceof Timestamp)) {
    throw new functions.https.HttpsError("internal", "参加記録の受付時刻を取得できませんでした");
  }
  const participation = {
    eventId: data.eventId,
    eventTitleSnapshot: data.eventTitleSnapshot,
    eventVersion: data.eventVersion,
    acceptedAt: data.acceptedAt.toMillis(),
  };
  if (!released) return { ...participation, resultsReleased: false };
  return {
    ...participation, resultsReleased: true,
    number: data.number, isWinner: data.isWinner,
    rewardLabelSnapshot: data.rewardLabelSnapshot,
    claimInstructionsSnapshot: data.claimInstructionsSnapshot,
    prize: data.isWinner && data.prizeSnapshot ? {
      label: data.prizeSnapshot.label, points: data.prizeSnapshot.points,
      shippingEnabled: data.prizeSnapshot.shippingEnabled,
    } : null,
    claim: data.claim ? {
      choice: data.claim.choice, requestId: data.claim.requestId,
      claimedAt: data.claim.claimedAt.toMillis(),
    } : null,
  };
}

function savedDraft(event: FirebaseFirestore.DocumentData, secret: FirebaseFirestore.DocumentData) {
  const draft = validateDraft({
    ...event, startsAt: event.startsAt.toMillis(), endsAt: event.endsAt.toMillis(),
    ...(secret.prizes ? { prizes: secret.prizes } : { winningNumbers: secret.winningNumbers }),
  });
  if (JSON.stringify(secret.winningNumbers) !== JSON.stringify(draft.prizes.map((prize) => prize.number))) {
    throw new functions.https.HttpsError("failed-precondition", "当選番号と賞品の設定が一致しません");
  }
  return draft;
}

type Cursor = { id: string; sort: number; nanoseconds?: number; number?: number; eventId?: string };
function cursor(value: unknown): Cursor | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid("ページ位置が不正です");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    invalid("ページ位置が不正です");
  }
  const data = input(parsed, ["id", "sort", "nanoseconds", "number", "eventId"]);
  if (typeof data.id !== "string" || data.id.length < 1 || data.id.length > 128 ||
      data.id.includes("/") || Array.from(data.id).some((character) => character.charCodeAt(0) < 32) ||
      data.id === "." || data.id === "..") {
    invalid("ページ位置のIDが不正です");
  }
  return {
    id: data.id, sort: integer(data.sort, "ページ位置", 0, 253402300799999),
    ...(data.nanoseconds === undefined ? {} : { nanoseconds: integer(data.nanoseconds, "受付時刻", 0, 999999999) }),
    ...(data.number === undefined ? {} : { number: integer(data.number, "ページ番号", 1, POLICY.maxEntries) }),
    ...(data.eventId === undefined ? {} : { eventId: id(data.eventId) }),
  };
}

function cursorTimestamp(position: Cursor): Timestamp {
  return new Timestamp(Math.floor(position.sort / 1000), position.nanoseconds ?? (position.sort % 1000) * 1000000);
}

function nextCursor(docs: FirebaseFirestore.QueryDocumentSnapshot[], limit: number, field: string): string | null {
  if (docs.length <= limit) return null;
  const last = docs[limit - 1];
  const value: unknown = last.get(field);
  const sort = value instanceof Timestamp ? Math.floor(value.toMillis()) : value;
  return Buffer.from(JSON.stringify({
    id: last.id, sort, ...(value instanceof Timestamp ? { nanoseconds: value.nanoseconds } : {}),
  })).toString("base64url");
}

const draftFields = ["title", "description", "thumbnailPath", "startsAt", "endsAt", "maxEntries",
  "prizes", "winningNumbers", "rewardLabel", "claimInstructions"];

export const adminSaveNeraiuchiDraft = callable("adminSaveNeraiuchiDraft", async (raw, context) => {
  const uid = await requireAdmin(context);
  const data = input(raw, [...draftFields, "eventId", "expectedVersion"]);
  if (data.prizes !== undefined && (data.winningNumbers !== undefined || data.rewardLabel !== undefined)) {
    invalid("新旧の当選設定を混在させることはできません");
  }
  const draft = validateDraft(data);
  const eventRef = data.eventId === undefined ? events.doc() : events.doc(id(data.eventId));
  const auditRef = audits.doc();
  const version = await db.runTransaction(async (transaction) => {
    const [event, counter] = await Promise.all([
      transaction.get(eventRef), transaction.get(counters.doc(eventRef.id)),
    ]);
    if (event.exists) {
      if (event.get("state") !== "draft") throw new functions.https.HttpsError("failed-precondition", "公開後の条件は編集できません");
      if (data.expectedVersion !== event.get("version")) throw new functions.https.HttpsError("aborted", "別の更新があります。再読み込みしてください");
      if (acceptedCount(counter) !== 0) throw new functions.https.HttpsError("failed-precondition", "下書きに参加記録があります");
    } else if (data.eventId !== undefined) {
      throw new functions.https.HttpsError("not-found", "企画が見つかりません");
    }
    const newVersion = event.exists ? event.get("version") + 1 : 1;
    const { prizes, rewardMode, ...visible } = draft;
    const winningNumbers = prizes.map((prize) => prize.number);
    transaction.set(eventRef, {
      ...visible,
      rewardLabel: rewardMode === "manual" ? prizes[0].label : "当選内容は企画終了後にご確認ください",
      rewardMode,
      startsAt: Timestamp.fromMillis(draft.startsAt),
      endsAt: Timestamp.fromMillis(draft.endsAt),
      entryCost: POLICY.entryCost,
      maxPerAccount: POLICY.maxPerAccount,
      state: "draft", version: newVersion,
      ...(event.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: uid }),
    }, { merge: true });
    transaction.set(secrets.doc(eventRef.id), {
      winningNumbers, rulesVersion: newVersion, publishedVersion: null,
      prizes: rewardMode === "claim" ? prizes : FieldValue.delete(),
      ...(event.exists ? {} : { createdBy: uid }),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (!event.exists) transaction.create(counters.doc(eventRef.id), {
      acceptedCount: 0, updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      eventId: eventRef.id, operation: "saveDraft", actorUid: uid, version: newVersion,
      changes: draft, createdAt: FieldValue.serverTimestamp(),
    });
    return newVersion;
  });
  return { eventId: eventRef.id, version };
});

export const adminPublishNeraiuchi = callable("adminPublishNeraiuchi", async (raw, context) => {
  const uid = await requireAdmin(context);
  const data = input(raw, ["eventId", "expectedVersion"]);
  const eventId = id(data.eventId);
  const auditRef = audits.doc();
  const version = await db.runTransaction(async (transaction) => {
    const [event, secret, counter] = await Promise.all([
      transaction.get(events.doc(eventId)), transaction.get(secrets.doc(eventId)),
      transaction.get(counters.doc(eventId)),
    ]);
    if (!event.exists || !secret.exists) throw new functions.https.HttpsError("not-found", "企画設定が見つかりません");
    if (event.get("state") !== "draft") throw new functions.https.HttpsError("failed-precondition", "下書きのみ公開できます");
    if (data.expectedVersion !== event.get("version")) throw new functions.https.HttpsError("aborted", "別の更新があります。再読み込みしてください");
    const draft = savedDraft(event.data()!, secret.data()!);
    if (draft.endsAt <= Date.now()) throw new functions.https.HttpsError("failed-precondition", "終了日時を過ぎています");
    if (acceptedCount(counter) !== 0 || secret.get("rulesVersion") !== event.get("version")) {
      throw new functions.https.HttpsError("failed-precondition", "公開設定に不整合があります");
    }
    const next = event.get("version") + 1;
    transaction.update(events.doc(eventId), { state: "published", version: next, publishedAt: FieldValue.serverTimestamp() });
    transaction.update(secrets.doc(eventId), { rulesVersion: next, publishedVersion: next });
    transaction.create(auditRef, {
      eventId, operation: "publish", actorUid: uid, version: next,
      changes: draft, createdAt: FieldValue.serverTimestamp(),
    });
    return next;
  });
  return { eventId, version };
});

async function archiveRound(eventId: string, actorUid: string, expectedVersion?: number): Promise<number> {
  const source = events.doc(eventId);
  const target = archives.doc(eventId);
  const completedVersion = await db.runTransaction<number | undefined>(async (transaction) => {
    const [event, archived, secret, counter] = await Promise.all([
      transaction.get(source), transaction.get(target),
      transaction.get(secrets.doc(eventId)), transaction.get(counters.doc(eventId)),
    ]);
    if (!event.exists) {
      if (archived.get("archiveComplete") === true) return archived.get("version");
      throw new functions.https.HttpsError("not-found", "開催記録が見つかりません");
    }
    if (event.get("archiving") === true) {
      if (!archived.exists || archived.get("archiveComplete") === true) {
        throw new functions.https.HttpsError("failed-precondition", "移動先の開催記録に不整合があります");
      }
      return;
    }
    if (expectedVersion !== undefined && expectedVersion !== event.get("version")) {
      throw new functions.https.HttpsError("aborted", "別の更新があります。再読み込みしてください");
    }
    if (!resultsReleased(event.data()!, Date.now())) {
      throw new functions.https.HttpsError("failed-precondition", "終了した企画のみアーカイブできます");
    }
    if (archived.exists || !secret.exists) {
      throw new functions.https.HttpsError("failed-precondition", "アーカイブ設定に不整合があります");
    }
    const version = event.get("version") + 1;
    const closedAt = event.get("closedAt") ?? FieldValue.serverTimestamp();
    transaction.create(target, {
      ...event.data(), state: "archived", version, closedAt,
      secret: secret.data(), acceptedCount: acceptedCount(counter),
      archivedAt: event.get("archivedAt") ?? FieldValue.serverTimestamp(), archiveComplete: false,
    });
    // Closing the parent conflicts with joins/claims before any entry is moved.
    transaction.update(source, { state: "closed", version, closedAt, archiving: true });
  });
  if (completedVersion !== undefined) return completedVersion;

  let conflicts = 0;
  while (true) {
    const entries = await source.collection("entries").limit(50).get();
    if (entries.empty) break;
    const batch = db.batch();
    let bytes = 0;
    let copied = 0;
    for (const entry of entries.docs) {
      const size = Buffer.byteLength(JSON.stringify(entry.data())) * 4 + 2048;
      if (copied > 0 && bytes + size > 8 * 1024 * 1024) break;
      bytes += size;
      copied++;
      batch.set(target.collection("entries").doc(entry.id), entry.data());
      batch.set(db.collection("neraiuchiUserHistory").doc(entry.id).collection("items").doc(eventId),
        { ...entry.data(), archived: true }, { merge: true });
      // A concurrent mover cannot overwrite a claim made at the destination.
      batch.delete(entry.ref, { lastUpdateTime: entry.updateTime });
    }
    try {
      await batch.commit();
      conflicts = 0;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      if (typeof code !== "number" || ![5, 9, 10].includes(code) || ++conflicts > 10) throw error;
      console.warn("狙い撃ちアーカイブの競合を再取得します", { eventId });
    }
  }

  const auditRef = audits.doc();
  return db.runTransaction(async (transaction) => {
    const [event, archived, remaining] = await Promise.all([
      transaction.get(source), transaction.get(target),
      transaction.get(source.collection("entries").limit(1)),
    ]);
    if (!event.exists && archived.get("archiveComplete") === true) return archived.get("version");
    if (!event.exists || !archived.exists || !remaining.empty || event.get("archiving") !== true) {
      throw new functions.https.HttpsError("aborted", "開催記録の移動を完了できませんでした。再試行してください");
    }
    transaction.update(target, { archiveComplete: true });
    transaction.delete(source);
    transaction.delete(secrets.doc(eventId));
    transaction.delete(counters.doc(eventId));
    transaction.create(auditRef, {
      eventId, operation: "archive", actorUid, version: archived.get("version"),
      createdAt: FieldValue.serverTimestamp(),
    });
    return archived.get("version");
  });
}

async function transition(raw: unknown, context: functions.https.CallableContext, archive: boolean) {
  const uid = await requireAdmin(context);
  const data = input(raw, archive ? ["eventId", "expectedVersion"] : ["eventId", "expectedVersion", "reason"]);
  const eventId = id(data.eventId);
  if (archive) return { eventId, version: await archiveRound(eventId, uid,
    integer(data.expectedVersion, "設定版", 1, Number.MAX_SAFE_INTEGER)) };
  const reason = text(data.reason, "終了理由", 500);
  const auditRef = audits.doc();
  const version = await db.runTransaction(async (transaction) => {
    const ref = events.doc(eventId);
    const event = await transaction.get(ref);
    if (!event.exists) throw new functions.https.HttpsError("not-found", "企画が見つかりません");
    if (event.get("state") !== "published") throw new functions.https.HttpsError("failed-precondition", "公開済み企画のみ終了できます");
    if (data.expectedVersion !== event.get("version")) throw new functions.https.HttpsError("aborted", "別の更新があります。再読み込みしてください");
    const next = event.get("version") + 1;
    transaction.update(ref, {
      state: "closed", version: next, closedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(auditRef, {
      eventId, operation: "close", actorUid: uid,
      reason, version: next, createdAt: FieldValue.serverTimestamp(),
    });
    return next;
  });
  return { eventId, version: await archiveRound(eventId, uid, version) };
}
export const adminCloseNeraiuchi = callable("adminCloseNeraiuchi", (data, context) => transition(data, context, false));
export const adminArchiveNeraiuchi = callable("adminArchiveNeraiuchi", (data, context) => transition(data, context, true));

export const archiveEndedNeraiuchi = functions.region("us-east1")
  .runWith({ timeoutSeconds: 540, memory: "512MB", failurePolicy: true })
  .pubsub.schedule("every 5 minutes").timeZone("Asia/Tokyo").onRun(async () => {
    const [expired, closed] = await Promise.all([
      events.where("state", "==", "published").where("endsAt", "<=", Timestamp.now())
        .orderBy("endsAt", "asc").limit(10).get(),
      events.where("state", "in", ["closed", "archived"]).limit(10).get(),
    ]);
    const failures: string[] = [];
    for (const event of [...expired.docs, ...closed.docs]) {
      try { await archiveRound(event.id, "system"); }
      catch {
        console.error("狙い撃ちの自動アーカイブに失敗しました", { eventId: event.id });
        failures.push(event.id);
      }
    }
    if (failures.length) throw new Error(`狙い撃ちアーカイブに失敗しました: ${failures.join(", ")}`);
  });

export const joinNeraiuchi = callable("joinNeraiuchi", async (raw, context) => {
  const uid = requireUser(context);
  const data = input(raw, ["eventId"]);
  const eventId = id(data.eventId);
  const initialRound = await findRound(eventId);
  const eventRef = initialRound.ref;
  const entryRef = eventRef.collection("entries").doc(uid);
  const auditRef = audits.doc();
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(entryRef);
    if (existing.exists) return;
    const [event, secret, counter, user] = await Promise.all([
      transaction.get(eventRef), transaction.get(secrets.doc(eventId)),
      transaction.get(counters.doc(eventId)), transaction.get(db.collection("users").doc(uid)),
    ]);
    assertReadableRound(event);
    if (!enabled()) throw new functions.https.HttpsError("failed-precondition", "狙い撃ちの新規参加は現在停止しています");
    if (!event.exists || event.get("state") !== "published") throw new functions.https.HttpsError("failed-precondition", "この企画は受付していません");
    const eventData = event.data()!;
    const count = acceptedCount(counter);
    const now = Date.now();
    const status = availability(eventData, count, now);
    if (status !== "open") throw new functions.https.HttpsError("failed-precondition", "この企画は現在受付していません");
    if (!secret.exists || secret.get("rulesVersion") !== eventData.version ||
        secret.get("publishedVersion") !== eventData.version) {
      throw new functions.https.HttpsError("failed-precondition", "当選設定に不整合があります");
    }
    const draft = savedDraft(eventData, secret.data()!);
    const number = count + 1;
    const prize = draft.prizes.find((item) => item.number === number);
    const displayName: unknown = user.get("displayName");
    const entry = {
      uid, eventId, number, isWinner: Boolean(prize),
      displayNameSnapshot: typeof displayName === "string" && displayName.trim() ? displayName.trim() : "名称未登録",
      eventTitleSnapshot: eventData.title,
      rewardLabelSnapshot: prize?.label ?? "",
      claimInstructionsSnapshot: eventData.claimInstructions,
      ...(prize && draft.rewardMode === "claim" ? { prizeSnapshot: prize } : {}),
      eventVersion: eventData.version, acceptedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(counters.doc(eventId), { acceptedCount: number, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(entryRef, entry);
    transaction.create(db.collection("neraiuchiUserHistory").doc(uid).collection("items").doc(eventId), entry);
    transaction.create(auditRef, {
      eventId, operation: "join", actorUid: uid, version: eventData.version,
      number, isWinner: entry.isWinner, createdAt: FieldValue.serverTimestamp(),
    });
  }, { maxAttempts: 50 });
  const round = await findRound(eventId);
  const stored = await round.ref.collection("entries").doc(uid).get();
  const current = await refreshRound(round);
  if (!stored.exists) throw new functions.https.HttpsError("internal", "参加結果を取得できませんでした");
  return { entry: entryResult(stored.data()!, resultsReleased(current.data()!, Date.now())) };
});

export const getNeraiuchiEvent = callable("getNeraiuchiEvent", async (raw, context) => {
  const uid = requireUser(context);
  const eventId = id(input(raw, ["eventId"]).eventId);
  const round = await findRound(eventId);
  const [entry, count] = await Promise.all([
    round.ref.collection("entries").doc(uid).get(), roundCount(round),
  ]);
  const event = await refreshRound(round);
  if (event.get("state") === "draft") throw new functions.https.HttpsError("not-found", "公開された企画が見つかりません");
  const now = Date.now();
  return {
    event: publicEvent(eventId, event.data()!, count, now),
    entry: entry.exists ? entryResult(entry.data()!, resultsReleased(event.data()!, now)) : null,
    enabled: enabled(), serverNow: now,
  };
});

async function listedEvent(snapshot: FirebaseFirestore.DocumentSnapshot, uid: string): Promise<NeraiuchiListedEvent> {
  const round = await findRound(snapshot.id);
  const [entry, count] = await Promise.all([
    round.ref.collection("entries").doc(uid).get(), roundCount(round),
  ]);
  const current = await refreshRound(round);
  const now = Date.now();
  return {
    ...publicEvent(current.id, current.data()!, count, now),
    entry: entry.exists ? entryResult(entry.data()!, resultsReleased(current.data()!, now)) : null,
  };
}

async function latestEndedRound(now: number): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> {
  const [archived, expired] = await Promise.all([
    archives.where("archiveComplete", "in", [true, false]).orderBy("closedAt", "desc").limit(1).get(),
    events.where("state", "==", "published").where("endsAt", "<=", Timestamp.fromMillis(now))
      .orderBy("endsAt", "desc").limit(1).get(),
  ]);
  const candidates = [...archived.docs, ...expired.docs];
  candidates.sort((a, b) =>
    (b.get("closedAt") ?? b.get("endsAt")).toMillis() - (a.get("closedAt") ?? a.get("endsAt")).toMillis());
  return candidates[0] ?? null;
}

async function latestEndedEvent(uid: string, now: number): Promise<NeraiuchiListedEvent | null> {
  const latest = await latestEndedRound(now);
  if (!latest) return null;
  if (latest.ref.parent.id !== archives.id) return listedEvent(latest, uid);
  // Frozen metadata and own history stay readable while the entries are transferred.
  const entry = await db.collection("neraiuchiUserHistory").doc(uid).collection("items").doc(latest.id).get();
  return {
    ...publicEvent(latest.id, latest.data(), acceptedCount(latest), Date.now()),
    entry: entry.exists ? entryResult(entry.data()!, true) : null,
  };
}

export const listNeraiuchiEvents = callable("listNeraiuchiEvents", async (raw, context) => {
  const uid = requireUser(context);
  const position = cursor(input(raw, ["cursor"]).cursor);
  const now = Date.now();
  const latestEnded = position ? null : await latestEndedEvent(uid, now);
  if (!enabled()) return { items: [], latestEnded, nextCursor: null, enabled: false, serverNow: now };
  let query = events.where("state", "==", "published").where("endsAt", ">", Timestamp.fromMillis(now))
    .orderBy("endsAt", "asc").orderBy(FieldPath.documentId(), "asc");
  if (position) query = query.startAfter(cursorTimestamp(position), position.id);
  const snapshot = await query.limit(21).get();
  const items = (await Promise.all(snapshot.docs.slice(0, 20).map((event) => listedEvent(event, uid))))
    .filter((event) => !event.resultsReleased);
  return { items, latestEnded, nextCursor: nextCursor(snapshot.docs, 20, "endsAt"), enabled: true, serverNow: Date.now() };
});

export const getNeraiuchiHomeStatus = callable("getNeraiuchiHomeStatus", async (raw, context) => {
  requireUser(context);
  input(raw, []);
  const now = Date.now();
  const ended = await latestEndedRound(now);
  const latestEnded = ended ? {
    id: ended.id, title: ended.get("title"),
    endedAt: (ended.get("closedAt") ?? ended.get("endsAt")).toMillis(),
  } : null;
  if (!enabled()) return { event: null, latestEnded, refreshAt: null, serverNow: now };
  const [running, upcoming] = await Promise.all([
    events.where("state", "==", "published").where("startsAt", "<=", Timestamp.fromMillis(now))
      .where("endsAt", ">", Timestamp.fromMillis(now)).orderBy("startsAt", "desc")
      .orderBy("endsAt", "asc").limit(1).get(),
    events.where("state", "==", "published").where("startsAt", ">", Timestamp.fromMillis(now))
      .orderBy("startsAt", "asc").limit(1).get(),
  ]);
  const round = running.docs[0] ? await refreshRound(running.docs[0]) : null;
  const current = Date.now();
  const event = round && round.get("state") === "published" &&
    round.get("startsAt").toMillis() <= current && round.get("endsAt").toMillis() > current ? {
      id: round.id, title: round.get("title"),
      startsAt: round.get("startsAt").toMillis(), endsAt: round.get("endsAt").toMillis(),
    } : null;
  const boundaries: number[] = [
    ...(round ? [round.get("endsAt").toMillis()] : []),
    ...(upcoming.docs[0] ? [upcoming.docs[0].get("startsAt").toMillis()] : []),
  ].filter((time) => time > now);
  return { event, latestEnded, refreshAt: boundaries.length ? Math.min(...boundaries) : null, serverNow: current };
});

export const getNeraiuchiHistory = callable("getNeraiuchiHistory", async (raw, context) => {
  const uid = requireUser(context);
  const position = cursor(input(raw, ["cursor"]).cursor);
  let query = db.collection("neraiuchiUserHistory").doc(uid).collection("items")
    .orderBy("acceptedAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (position) query = query.startAfter(cursorTimestamp(position), position.id);
  const snapshot = await query.limit(21).get();
  const docs = snapshot.docs.slice(0, 20);
  const now = Date.now();
  const items = await Promise.all(docs.map(async (entry) => {
    if (entry.get("archived") === true) return entryResult(entry.data(), true);
    const event = await findRound(entry.get("eventId"));
    return entryResult(entry.data(), resultsReleased(event.data()!, now));
  }));
  return { items, nextCursor: nextCursor(snapshot.docs, 20, "acceptedAt"), serverNow: now };
});

async function adminEvent(snapshot: FirebaseFirestore.DocumentSnapshot): Promise<NeraiuchiAdminEvent> {
  const archived = snapshot.ref.parent.id === archives.id;
  const [secret, count] = await Promise.all([
    archived ? Promise.resolve(snapshot.get("secret")) : secrets.doc(snapshot.id).get().then((document) => document.data()),
    roundCount(snapshot),
  ]);
  snapshot = await refreshRound(snapshot);
  if (!secret) throw new functions.https.HttpsError("failed-precondition", "当選設定が見つかりません");
  const data = snapshot.data()!;
  const draft = savedDraft(data, secret);
  return { ...publicEvent(snapshot.id, data, count, Date.now()), state: data.state,
    maxEntries: data.maxEntries, winningNumbers: secret.winningNumbers,
    prizes: draft.prizes, rewardMode: draft.rewardMode, acceptedCount: count };
}

export const adminGetNeraiuchiEvent = callable("adminGetNeraiuchiEvent", async (raw, context) => {
  await requireAdmin(context);
  return { event: await adminEvent(await findRound(id(input(raw, ["eventId"]).eventId))), serverNow: Date.now() };
});

export const adminListNeraiuchiEvents = callable("adminListNeraiuchiEvents", async (raw, context) => {
  await requireAdmin(context);
  const data = input(raw, ["cursor", "archived"]);
  if (data.archived !== undefined && typeof data.archived !== "boolean") invalid("一覧の指定が不正です");
  const position = cursor(data.cursor);
  const field = data.archived ? "archivedAt" : "createdAt";
  let query = data.archived
    ? archives.where("archiveComplete", "==", true).orderBy(field, "desc").orderBy(FieldPath.documentId(), "desc")
    : events.where("state", "in", ["draft", "published"]).orderBy(field, "desc").orderBy(FieldPath.documentId(), "desc");
  if (position) query = query.startAfter(cursorTimestamp(position), position.id);
  const snapshot = await query.limit(21).get();
  return { items: await Promise.all(snapshot.docs.slice(0, 20).map(adminEvent)),
    nextCursor: nextCursor(snapshot.docs, 20, field), serverNow: Date.now() };
});

export const adminListNeraiuchiEntries = callable("adminListNeraiuchiEntries", async (raw, context) => {
  const uid = await requireAdmin(context);
  const data = input(raw, ["eventId", "cursor"]);
  const round = await findRound(id(data.eventId));
  const eventRef = round.ref;
  const snapshot = await entryPage(eventRef, data.cursor);
  await refreshRound(round);
  return { items: snapshot.docs.slice(0, 50).map((entry) => ({
    ...entryResult(entry.data(), true), uid: entry.id,
    acceptedAtNanoseconds: entry.get("acceptedAt").nanoseconds,
    displayName: entry.get("displayNameSnapshot") ?? "名称未登録", isSelf: entry.id === uid,
  })), nextCursor: resultCursor(snapshot.docs, eventRef.id), serverNow: Date.now() };
});

async function entryPage(eventRef: FirebaseFirestore.DocumentReference, rawCursor: unknown, aroundUid?: string) {
  const eventId = eventRef.id;
  const position = cursor(rawCursor);
  let query = eventRef.collection("entries").orderBy("acceptedAt", "asc").orderBy("number", "asc");
  if (position) {
    if (position.eventId !== eventId || position.number === undefined || position.nanoseconds === undefined) {
      invalid("この企画のページ位置ではありません");
    }
    query = query.startAfter(cursorTimestamp(position), position.number);
  } else if (aroundUid) {
    const own = await eventRef.collection("entries").doc(aroundUid).get();
    if (!own.exists) throw new functions.https.HttpsError("failed-precondition", "この企画への参加記録がありません");
    const before = await query.endBefore(own.get("acceptedAt"), own.get("number")).limitToLast(10).get();
    const first = before.docs[0] ?? own;
    query = query.startAt(first.get("acceptedAt"), first.get("number"));
  }
  return query.limit(51).get();
}

function resultCursor(docs: FirebaseFirestore.QueryDocumentSnapshot[], eventId: string): string | null {
  if (docs.length <= 50) return null;
  const last = docs[49];
  const time: Timestamp = last.get("acceptedAt");
  return Buffer.from(JSON.stringify({
    id: String(last.get("number")), eventId, number: last.get("number"),
    sort: Math.floor(time.toMillis()), nanoseconds: time.nanoseconds,
  })).toString("base64url");
}

export const getNeraiuchiResults = callable("getNeraiuchiResults", async (raw, context) => {
  const uid = requireUser(context);
  const data = input(raw, ["eventId", "cursor", "aroundSelf"]);
  const eventId = id(data.eventId);
  if (data.aroundSelf !== undefined && data.aroundSelf !== true) invalid("自分の位置の指定が不正です");
  if (data.aroundSelf && data.cursor) invalid("ページ位置と自分の位置は同時に指定できません");
  const event = await findRound(eventId);
  if (!resultsReleased(event.data()!, Date.now())) {
    throw new functions.https.HttpsError("failed-precondition", "参加者一覧と結果は企画終了後に公開します");
  }
  const snapshot = await entryPage(event.ref, data.cursor, data.aroundSelf ? uid : undefined);
  await refreshRound(event);
  const items: NeraiuchiResultRow[] = snapshot.docs.slice(0, 50).map((entry) => ({
    number: entry.get("number"), acceptedAt: entry.get("acceptedAt").toMillis(),
    acceptedAtNanoseconds: entry.get("acceptedAt").nanoseconds,
    displayName: entry.get("displayNameSnapshot") ?? "名称未登録",
    isSelf: entry.id === uid, isWinner: entry.get("isWinner"),
    rewardLabel: entry.get("isWinner") ? entry.get("rewardLabelSnapshot") : null,
  }));
  return { items, nextCursor: resultCursor(snapshot.docs, eventId), serverNow: Date.now() };
});

export const claimNeraiuchiPrize = callable("claimNeraiuchiPrize", async (raw, context) => {
  const uid = requireUser(context);
  const data = input(raw, ["eventId", "choice"]);
  const eventId = id(data.eventId);
  const choice = data.choice;
  if (choice !== "points" && choice !== "shipping") invalid("受け取り方法を選択してください");
  const eventRef = (await findRound(eventId)).ref;
  const entryRef = eventRef.collection("entries").doc(uid);
  const historyRef = db.collection("neraiuchiUserHistory").doc(uid).collection("items").doc(eventId);
  const userRef = db.collection("users").doc(uid);
  const requestId = `neraiuchi_${createHash("sha256").update(`${eventId}\0${uid}`).digest("hex")}`;
  const auditRef = audits.doc();
  await db.runTransaction(async (transaction) => {
    const [event, entry, history, user] = await Promise.all([
      transaction.get(eventRef), transaction.get(entryRef),
      transaction.get(historyRef), transaction.get(userRef),
    ]);
    assertReadableRound(event);
    if (!entry.exists) throw new functions.https.HttpsError("not-found", "参加記録が見つかりません");
    if (!resultsReleased(event.data()!, Date.now())) {
      throw new functions.https.HttpsError("failed-precondition", "当選品の受け取りは企画終了後です");
    }
    if (!entry.get("isWinner")) throw new functions.https.HttpsError("failed-precondition", "当選した参加のみ受け取れます");
    const previous = entry.get("claim");
    if (previous) {
      if (previous.choice !== choice) throw new functions.https.HttpsError("already-exists", "別の受け取り方法で確定済みです");
      return;
    }
    const snapshot = entry.get("prizeSnapshot");
    if (!snapshot) throw new functions.https.HttpsError("failed-precondition", "この旧企画は受け取り案内に従ってください");
    const prize = validatePrize(snapshot, POLICY.maxEntries);
    if (choice === "shipping" && !prize.shippingEnabled) invalid("この当選品はポイント受け取りのみです");
    if (!user.exists || !history.exists) throw new functions.https.HttpsError("failed-precondition", "アカウントまたは履歴の設定を確認してください");
    if (choice === "points") {
      const balance: unknown = user.get("points");
      if (typeof balance !== "number" || !Number.isSafeInteger(balance) || balance < 0 ||
          !Number.isSafeInteger(balance + prize.points)) {
        throw new functions.https.HttpsError("failed-precondition", "ポイント残高の設定を管理者に確認してください");
      }
      transaction.update(userRef, { points: FieldValue.increment(prize.points) });
      transaction.create(db.collection("pointHistory").doc(requestId), {
        source: "neraiuchi", eventId, userId: uid, added: prize.points,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      const reward = {
        requestId, uid, source: "neraiuchi", eventId,
        rewardId: `neraiuchi_${eventId}_${entry.get("number")}`,
        name: `${prize.label}（狙い撃ち）`, cost: prize.points,
        image: "/menu/thumbnails/neraiuchi.webp",
        timestamp: FieldValue.serverTimestamp(), requestedAt: FieldValue.serverTimestamp(),
        status: "pending", shipped: false,
        userName: user.get("name") ?? "", userEmail: user.get("email") ?? "",
        userX: user.get("xAccount") ?? "", userNickname: user.get("displayName") ?? "",
        xAccountConfirmed: user.get("xAccountConfirmed") ?? false,
      };
      transaction.create(db.collection("shippingPending").doc(requestId), reward);
      transaction.create(db.collection("selectedRewards").doc(requestId), reward);
    }
    const claim = { choice, requestId, claimedAt: FieldValue.serverTimestamp() };
    transaction.update(entryRef, { claim });
    transaction.update(historyRef, { claim });
    transaction.create(auditRef, {
      eventId, operation: "claim", actorUid: uid, choice, requestId,
      createdAt: FieldValue.serverTimestamp(),
    });
  }, { maxAttempts: 50 });
  const round = await findRound(eventId);
  const stored = await round.ref.collection("entries").doc(uid).get();
  await refreshRound(round);
  if (!stored.exists) throw new functions.https.HttpsError("internal", "受け取り結果を取得できませんでした");
  return { entry: entryResult(stored.data()!, true) };
});
