import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import { getYesterdayJST6 } from "./common/date";
import { matchesXAccountRow } from "./common/normalize";
import { advanceQuest, initialQuestState, questReleaseKeys, questResult, releasedQuestDice, QuestRuleError } from "./quest/engine";
import { grantNanikaRightPlan } from "./nanikaGachaRights";
import { applyQuestPsa } from "./quest/psa";
import { forecastQuest, simulateQuest } from "./quest/simulation";
import { questInteger, questObject, questText, validateQuestDraft, QuestInputError } from "./quest/config";
import { QUEST_MENU_MODES, questMenuMode } from "./quest/menu";
import type { QuestAction, QuestDraft, QuestPlayer, QuestProgress, QuestPublicRun, QuestSummary } from "./quest/types";

if (!admin.apps.length) admin.initializeApp();
const db = getFirestore(), runs = db.collection("questRuns"), current = db.doc("questConfig/current");
const menuSettings = db.doc("questConfig/menu");
const deletions = db.doc("questConfig/deletions").collection("requests");
type Tx = FirebaseFirestore.Transaction;
type Snap = FirebaseFirestore.DocumentSnapshot;
type Run = Omit<QuestDraft, "accessCode"> & {
  version: number; state: QuestPublicRun["state"]; codeHash: string;
  simulation?: unknown; simulatedVersion?: number; confirmations?: string;
  adminReleased?: number;
  psaReservedCount?: number;
  closedAt?: number; cursor?: string; summary?: QuestSummary;
};
const fail = (message: string, code: functions.https.FunctionsErrorCode = "failed-precondition"): never => {
  throw new functions.https.HttpsError(code, message);
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function id(raw: unknown) {
  if (typeof raw !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(raw)) fail("IDが不正です", "invalid-argument");
  return raw as string;
}
function uid(context: functions.https.CallableContext) {
  return context.auth?.uid || fail("ログインしてください", "unauthenticated");
}
async function administrator(context: functions.https.CallableContext) {
  const actor = uid(context);
  if (!(await db.doc(`admins/${actor}`).get()).exists) fail("管理者のみ実行できます", "permission-denied");
  return actor;
}
function callable(handler: (data: unknown, context: functions.https.CallableContext) => Promise<unknown>, timeoutSeconds = 120) {
  return functions.region("us-east1").runWith({ timeoutSeconds, memory: "512MB" }).https.onCall(async (data, context) => {
    try { return await handler(data, context); }
    catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      if (error instanceof QuestInputError) fail(error.message, "invalid-argument");
      if (error instanceof QuestRuleError) fail(error.message);
      console.error("クエスト処理エラー", error instanceof Error ? error.message : "unknown");
      return fail("状態を確認できませんでした。再読み込みしてください", "internal");
    }
  });
}
function getRun(snapshot: Snap): Run {
  if (!snapshot.exists) return fail("開催が見つかりません", "not-found");
  return snapshot.data() as Run;
}
function publicRun(snapshot: Snap): QuestPublicRun {
  const run = getRun(snapshot);
  return { id: snapshot.id, title: run.title, description: run.description, thumbnail: run.thumbnail,
    startsAt: run.startsAt, endsAt: run.endsAt, publicFlags: run.publicFlags, rules: run.rules,
    version: run.version, state: run.state, adminReleased: run.adminReleased ?? 0,
    psaRemaining: Math.max(0, (run.rules.psaLimit ?? 0) - (run.psaReservedCount ?? 0)),
    ...(run.state === "archived" && run.summary ? { summary: run.summary } : {}) };
}
function normalReleases(run: Run, player: QuestPlayer, now: number) {
  if (now < run.startsAt) return [];
  const keys = run.rules.distribution.mode === "admin"
    ? Array.from({ length: run.adminReleased ?? 0 }, (_, index) => `bulk-${index + 1}`).slice(player.bulkGranted ?? 0)
    : questReleaseKeys(run.rules, run.startsAt, run.endsAt, now).slice(player.normalGranted);
  return keys.slice(0, Math.max(0, run.rules.maxTurns - player.normalGranted));
}
function assertOpen(run: Run, pointer: Snap, runId: string, now: number) {
  if (run.state !== "published" || pointer.get("runId") !== runId || now < run.startsAt ||
      now >= run.endsAt || run.closedAt !== undefined) fail("開催期間外、または開催回が変更されました");
}
function canRead(run: Run, player: Snap | null, unlock: Snap | null) {
  return run.state !== "draft" && (run.publicFlags.includes("public") || player?.exists || unlock?.exists);
}
function progress(player: QuestPlayer): Omit<QuestProgress, "id"> {
  return { displayName: player.displayName, tileId: player.tileId, level: player.level, used: player.used, score: player.score };
}
function writeProgress(tx: Tx, ref: FirebaseFirestore.DocumentReference, player: QuestPlayer, turnComplete: boolean) {
  const row = progress(player);
  tx.set(ref.collection("progress").doc(player.publicId), row);
  if (turnComplete && player.used > 0) tx.set(ref.collection("turns").doc(String(player.used))
    .collection("players").doc(player.publicId), row);
}
function newSummary(): QuestSummary {
  return { total: 0, groups: { top: 0, upper: 0, middle: 0, lower: 0 },
    completed: 0, completedGroups: { top: 0, upper: 0, middle: 0, lower: 0 }, stages: { "1": 0, "2": 0, "3": 0, "4": 0 } };
}
async function participationReason(tx: Tx, run: Run, actor: string, unlock: Snap) {
  const user = await tx.get(db.doc(`users/${actor}`));
  if (!user.exists) return "プロフィールを登録してください";
  if (run.publicFlags.includes("limited") && !unlock.exists) return "専用コードを入力してください";
  if (run.publicFlags.includes("subscriber") && !user.get("subscriber")) return "サブスク限定です";
  if (run.publicFlags.includes("nibuichi_winner")) {
    const prediction = await tx.get(db.doc(`nibuichi_daily/${getYesterdayJST6()}/predictions/${actor}`));
    if (!prediction.exists || !prediction.get("result") || prediction.get("prediction") !== prediction.get("result")) return "前日のニブイチ的中者限定です";
  }
  if (run.publicFlags.includes("x_account_match") &&
      !run.xAccountList.some(line => matchesXAccountRow(line, user.get("xAccount")))) return "登録済みXアカウントが対象一覧と一致しません";
  return null;
}

export const getQuestMenuAccess = callable(async (raw, context) => {
  questObject(raw, []);
  const actor = context.auth?.uid;
  const [settings, administrator, user] = await Promise.all([
    menuSettings.get(),
    actor ? db.doc(`admins/${actor}`).get() : null,
    actor ? db.doc(`users/${actor}`).get() : null,
  ]);
  const mode = questMenuMode(settings.get("mode"));
  return { mode, version: settings.get("version") ?? 0,
    allowed: administrator?.exists === true || mode === "public" || (mode === "subscriber" && user?.get("subscriber") === true) };
});

export const adminSetQuestMenuAccess = callable(async (raw, context) => {
  const actor = await administrator(context), d = questObject(raw, ["mode", "version"]);
  if (!QUEST_MENU_MODES.includes(d.mode as typeof QUEST_MENU_MODES[number])) fail("メニューの公開範囲を選んでください", "invalid-argument");
  const expected = questInteger(d.version, "設定の版", 0, Number.MAX_SAFE_INTEGER - 1);
  return db.runTransaction(async tx => {
    const previous = await tx.get(menuSettings);
    if ((previous.get("version") ?? 0) !== expected) fail("表示設定が更新されています。再取得してください", "aborted");
    const version = expected + 1;
    tx.set(menuSettings, { mode: d.mode, version, updatedBy: actor, updatedAt: Date.now() });
    return { mode: d.mode, version, allowed: true };
  });
});

export const getQuest = callable(async (raw, context) => {
  const d = questObject(raw, ["runId", "archive"]);
  const actor = context.auth?.uid;
  const pointer = await current.get();
  const runId = d.archive === true ? id(d.runId) : pointer.get("runId") as string | undefined;
  if (!runId) return { run: null, player: null, serverNow: Date.now() };
  if (d.archive !== true && d.runId !== undefined && d.runId !== runId) fail("現在の開催回が変更されました", "aborted");
  const ref = runs.doc(runId), snapshot = await ref.get(), run = getRun(snapshot);
  const [player, unlock] = await Promise.all([
    actor ? ref.collection("players").doc(actor).get() : null,
    actor ? ref.collection("unlocks").doc(actor).get() : null,
  ]);
  if (!canRead(run, player, unlock)) return { run: null, player: null, serverNow: Date.now() };
  if (d.archive === true && run.state !== "archived") fail("この開催はまだアーカイブされていません");
  let reason: string | null = actor ? null : "ログインしてください";
  if (actor && !player?.exists && unlock && run.state === "published" && d.archive !== true) {
    reason = await db.runTransaction(tx => participationReason(tx, run, actor, unlock));
  }
  const p = player?.exists ? player.data() as QuestPlayer : null;
  const due = p ? normalReleases(run, p, Date.now()).length : 0;
  const scheduledTotal = run.rules.distribution.mode === "admin"
    ? (p?.normalGranted ?? 0) + due
    : releasedQuestDice(run.rules, run.startsAt, run.endsAt, run.endsAt - 1);
  const forecast = p && !p.result && run.state === "published" && Date.now() < run.endsAt
    ? forecastQuest(p, run.rules, Math.min(run.rules.maxTurns, Math.max(p.normalGranted, scheduledTotal)))
    : null;
  return { run: publicRun(snapshot), player: p, reason, forecast,
    dueDice: p && run.state === "published" && Date.now() < run.endsAt && d.archive !== true
      ? due : 0,
    serverNow: Date.now() };
});

export const unlockQuest = callable(async (raw, context) => {
  const actor = uid(context), d = questObject(raw, ["code"]);
  const codeHash = hash(questText(d.code, "専用コード", 100));
  return db.runTransaction(async tx => {
    const pointer = await tx.get(current);
    if (!pointer.exists || !pointer.get("runId")) fail("現在の開催はありません", "not-found");
    const ref = runs.doc(pointer.get("runId")), snapshot = await tx.get(ref), run = getRun(snapshot);
    if (run.state !== "published" || Date.now() >= run.endsAt ||
        !timingSafeEqual(Buffer.from(codeHash, "hex"), Buffer.from(run.codeHash, "hex"))) fail("専用コードを確認してください", "permission-denied");
    tx.set(ref.collection("unlocks").doc(actor), { unlockedAt: Date.now() });
    return { runId: ref.id };
  });
});

export const joinQuest = callable(async (raw, context) => {
  const actor = uid(context), d = questObject(raw, ["runId"]), ref = runs.doc(id(d.runId));
  const publicId = randomUUID();
  return db.runTransaction(async tx => {
    const playerRef = ref.collection("players").doc(actor);
    const [snapshot, pointer, previous, unlock, user] = await Promise.all([
      tx.get(ref), tx.get(current), tx.get(playerRef), tx.get(ref.collection("unlocks").doc(actor)), tx.get(db.doc(`users/${actor}`)),
    ]);
    const run = getRun(snapshot);
    if (previous.exists) return { player: previous.data() };
    assertOpen(run, pointer, ref.id, Date.now());
    if (!canRead(run, previous, unlock)) fail("専用コードを入力してください", "permission-denied");
    const reason = await participationReason(tx, run, actor, unlock);
    if (reason) fail(reason, "permission-denied");
    assertOpen(run, pointer, ref.id, Date.now());
    const player: QuestPlayer = { ...initialQuestState(), publicId, normalGranted: 0, rescueGranted: 0,
      displayName: String(user.get("displayName") || "星務の補佐役").slice(0, 50),
      result: null, eligibleAt: Date.now(), eligibility: run.publicFlags };
    tx.create(playerRef, player); writeProgress(tx, ref, player, false);
    return { player };
  });
});

export const actQuest = callable(async (raw, context) => {
  const actor = uid(context), d = questObject(raw, ["runId", "requestId", "version", "action"]);
  const ref = runs.doc(id(d.runId)), playerRef = ref.collection("players").doc(actor);
  const actionRef = playerRef.collection("actions").doc(id(d.requestId));
  const allowed = ["roll", "bridge", "flower", "shortcut-use", "shortcut-skip", "rescue", "sync"];
  if (!allowed.includes(d.action as string)) fail("操作が不正です", "invalid-argument");
  const die = randomInt(1, 7), flowerDraw = randomInt(1, 8), fingerprint = hash(JSON.stringify([d.action, d.version]));
  return db.runTransaction(async tx => {
    const [snapshot, pointer, previous, saved] = await Promise.all([
      tx.get(ref), tx.get(current), tx.get(playerRef), tx.get(actionRef),
    ]);
    if (saved.exists) {
      if (saved.get("fingerprint") !== fingerprint) fail("同じIDで別の操作はできません", "already-exists");
      return { player: saved.get("player"), replay: true };
    }
    const run = getRun(snapshot), now = Date.now();
    assertOpen(run, pointer, ref.id, now);
    if (!previous.exists) fail("先に参加条件を確認してください", "permission-denied");
    const p = previous.data() as QuestPlayer;
    if (d.version !== p.version) fail("別の操作が反映されています。再読み込みしてください", "aborted");
    if (p.result) fail("結果は確定済みです");
    const releases = normalReleases(run, p, now);
    const due = releases.length;
    p.normalGranted += due;
    if (run.rules.distribution.mode === "admin") p.bulkGranted = (p.bulkGranted ?? 0) + due;
    let next: QuestPlayer;
    if (d.action === "sync") {
      if (!due) fail("現在受け取れる配布分はありません");
      next = { ...p, version: p.version + 1, lastTrace: { steps: [], rewards: [] } };
    } else {
      if (d.action === "roll" && p.used >= p.normalGranted) fail("配布済みのサイコロがありません");
      next = { ...p, ...advanceQuest(p, d.action as QuestAction, run.rules, die, flowerDraw) };
      if (run.rules.psaLimit) {
        const taken = run.psaReservedCount ?? 0;
        const prize = applyQuestPsa(p, next, run.rules.psaLimit - taken);
        next.psaFragments = prize.fragments;
        if (prize.collected) next.psaCollectedTiles = [...(p.psaCollectedTiles ?? []), next.tileId];
        if (prize.newlyReserved || p.psaReserved) next.psaReserved = prize.reserved;
        if (prize.newlyReserved) tx.update(ref, { psaReservedCount: taken + 1 });
        // Reopen a provisional slot only before the run-wide cutoff has been reached.
        if (p.psaReserved && !prize.reserved && taken > 0 && taken < run.rules.psaLimit) {
          tx.update(ref, { psaReservedCount: taken - 1 });
        }
      }
    }
    for (const release of releases) tx.create(ref.collection("grants").doc(`${release}_${hash(actor)}`),
      { uid: actor, kind: "normal", count: 1, source: release, at: now });
    tx.set(playerRef, next); writeProgress(tx, ref, next, !next.pending && d.action !== "sync");
    tx.create(actionRef, { fingerprint, action: d.action, die: d.action === "roll" ? die : null, player: next, at: now });
    return { player: next, replay: false };
  });
});

export const adminReleaseQuestDice = callable(async (raw, context) => {
  const administratorUid = await administrator(context);
  const d = questObject(raw, ["runId", "grantId", "count", "reason", "expectedTotal"]);
  const ref = runs.doc(id(d.runId)), grantRef = ref.collection("grants").doc(`bulk_${id(d.grantId)}`);
  const count = questInteger(d.count, "全体への配布数", 1, 99), reason = questText(d.reason, "配布理由", 500);
  const expectedTotal = questInteger(d.expectedTotal, "配布済み累計", 0, 99);
  const fingerprint = hash(JSON.stringify([count, reason, expectedTotal]));
  return db.runTransaction(async tx => {
    const [snapshot, pointer, grant] = await Promise.all([tx.get(ref), tx.get(current), tx.get(grantRef)]);
    if (grant.exists) {
      if (grant.get("fingerprint") !== fingerprint) fail("配布IDが使用済みです", "already-exists");
      return { granted: false, releasedTotal: grant.get("releasedTotal"), count: grant.get("count") };
    }
    const run = getRun(snapshot); assertOpen(run, pointer, ref.id, Date.now());
    if (run.rules.distribution.mode !== "admin") fail("全体への手動配布は管理者配布方式の開催で行ってください");
    const previous = run.adminReleased ?? 0;
    if (previous !== expectedTotal) fail("全体の配布数が更新されています。開催を選択し直してください", "aborted");
    const releasedTotal = previous + count;
    if (releasedTotal > run.rules.maxTurns) fail(`全体への配布は累計${run.rules.maxTurns}個までです`);
    tx.update(ref, { adminReleased: releasedTotal });
    tx.create(grantRef, { kind: "normal", source: "admin-bulk", count, reason, expectedTotal, releasedTotal,
      administratorUid, fingerprint, at: Date.now() });
    return { granted: true, releasedTotal, count };
  });
});

export const grantQuest = callable(async (raw, context) => {
  const administratorUid = await administrator(context);
  const d = questObject(raw, ["runId", "uid", "grantId", "kind", "count", "reason"]);
  const ref = runs.doc(id(d.runId)), actor = id(d.uid), grantRef = ref.collection("grants").doc(`admin_${id(d.grantId)}`);
  const count = questInteger(d.count, "付与数", 1, 99), reason = questText(d.reason, "付与理由", 500);
  if (d.kind !== "normal" && d.kind !== "rescue") fail("付与種別が不正です", "invalid-argument");
  const fingerprint = hash(JSON.stringify([actor, d.kind, count, reason]));
  return db.runTransaction(async tx => {
    const playerRef = ref.collection("players").doc(actor);
    const [snapshot, pointer, previous, grant] = await Promise.all([tx.get(ref), tx.get(current), tx.get(playerRef), tx.get(grantRef)]);
    if (grant.exists) {
      if (grant.get("fingerprint") !== fingerprint) fail("付与IDが使用済みです", "already-exists");
      return { granted: false };
    }
    const run = getRun(snapshot); assertOpen(run, pointer, ref.id, Date.now());
    if (!previous.exists) fail("参加済みの利用者に付与してください");
    const player = previous.data() as QuestPlayer;
    if (d.kind === "normal") {
      if (run.rules.distribution.mode !== "admin" ||
          player.normalGranted + normalReleases(run, player, Date.now()).length + count > run.rules.maxTurns) fail("通常分の付与方式・上限を確認してください");
      player.normalGranted += count;
    } else {
      if (!run.rules.rescue.enabled || !run.rules.rescue.adminEnabled ||
          player.rescueGranted + count > run.rules.rescue.maxGrants) fail("救済付与の設定・上限を確認してください");
      player.rescueCredits += count; player.rescueGranted += count;
    }
    player.version++;
    tx.set(playerRef, player);
    tx.create(grantRef, { uid: actor, kind: d.kind, count, reason, administratorUid, fingerprint, at: Date.now() });
    return { granted: true };
  });
});

export const claimQuestEventRescue = callable(async (raw, context) => {
  const actor = uid(context), d = questObject(raw, ["runId", "source", "eventId"]);
  if (!["neraiuchi", "nibuichi"].includes(d.source as string)) fail("救済対象の企画ではありません");
  const eventId = id(d.eventId), source = d.source as string;
  const ref = runs.doc(id(d.runId)), playerRef = ref.collection("players").doc(actor);
  const grantRef = ref.collection("grants").doc(hash(`${source}:${eventId}:${actor}`));
  return db.runTransaction(async tx => {
    const [snapshot, pointer, previous, grant] = await Promise.all([tx.get(ref), tx.get(current), tx.get(playerRef), tx.get(grantRef)]);
    if (grant.exists) return { granted: false };
    const run = getRun(snapshot); assertOpen(run, pointer, ref.id, Date.now());
    if (!run.rules.rescue.enabled || !run.rules.rescue.eventSources.includes(source as "neraiuchi" | "nibuichi")) fail("この開催では対象外の救済です");
    if (!previous.exists) fail("先にクエストへ参加してください");
    const player = previous.data() as QuestPlayer;
    if (player.rescueGranted >= run.rules.rescue.maxGrants) fail("救済の付与上限です");
    if (source === "nibuichi") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventId)) fail("日付が不正です");
      const prediction = await tx.get(db.doc(`nibuichi_daily/${eventId}/predictions/${actor}`));
      const resultAt = prediction.get("createdAt")?.toMillis?.() as number | undefined;
      if (!prediction.exists || !prediction.get("result") || prediction.get("prediction") !== prediction.get("result") ||
          !resultAt || resultAt < run.startsAt || resultAt >= run.endsAt) fail("開催期間内に確定した的中結果を確認できません");
    } else {
      const active = await tx.get(db.doc(`neraiuchiEvents/${eventId}`));
      const archived = await tx.get(db.doc(`neraiuchiEventsArchive/${eventId}`));
      const event = active.exists ? active : archived;
      const entry = await tx.get(event.ref.collection("entries").doc(actor));
      const state = event.get("state");
      const released = state === "closed" || state === "archived" ||
        (state === "published" && Date.now() >= event.get("endsAt")?.toMillis?.());
      const endedAt = (event.get("closedAt") ?? event.get("endsAt"))?.toMillis?.() as number | undefined;
      if (event.get("archiving") === true || (!active.exists && event.get("archiveComplete") !== true)) {
        fail("勝利結果を整理中です。少し待って再確認してください", "unavailable");
      }
      if (!entry.exists || entry.get("isWinner") !== true || !endedAt ||
          !released || endedAt > Date.now() || endedAt < run.startsAt || endedAt >= run.endsAt) fail("開催期間内に発表された勝利結果を確認できません");
    }
    assertOpen(run, pointer, ref.id, Date.now());
    player.rescueGranted++; player.rescueCredits++; player.version++;
    tx.set(playerRef, player);
    tx.create(grantRef, { uid: actor, kind: "rescue", source, eventId, count: 1, at: Date.now() });
    return { granted: true };
  });
});

export const listQuestProgress = callable(async (raw, context) => {
  const actor = uid(context), d = questObject(raw, ["runId", "archive", "turn", "cursor"]);
  const ref = runs.doc(id(d.runId)), [snapshot, pointer, player, unlock] = await Promise.all([
    ref.get(), current.get(), ref.collection("players").doc(actor).get(), ref.collection("unlocks").doc(actor).get(),
  ]);
  const run = getRun(snapshot);
  if (!canRead(run, player, unlock)) fail("この開催を閲覧できません", "permission-denied");
  if (d.archive === true ? run.state !== "archived" : pointer.get("runId") !== ref.id) fail("開催回を選び直してください");
  const collection = d.turn === undefined ? ref.collection("progress")
    : ref.collection("turns").doc(String(questInteger(d.turn, "使用回数", 1, run.rules.maxTurns))).collection("players");
  let query = collection.orderBy("score", "desc").orderBy(FieldPath.documentId()).limit(25);
  if (d.cursor !== undefined) {
    const after = await collection.doc(id(d.cursor)).get();
    if (!after.exists) fail("続きを取得できません");
    query = query.startAfter(after);
  }
  const rows = await query.get();
  async function row(snapshot: Snap): Promise<QuestProgress> {
    const value = snapshot.data() as Omit<QuestProgress, "id">;
    const higher = await collection.where("score", ">", value.score).count().get();
    return { id: snapshot.id, displayName: value.displayName, tileId: value.tileId,
      level: value.level, used: value.used, score: value.score, rank: higher.data().count + 1 };
  }
  const own = player.exists ? await collection.doc(player.get("publicId")).get() : null;
  const stages = await Promise.all([1, 2, 3, 4].map(async stage => {
    const count = await collection.where("tileId", ">=", `s${stage}-`).where("tileId", "<", `s${stage + 1}-`).count().get();
    return { stage, count: count.data().count };
  }));
  return { items: await Promise.all(rows.docs.map(row)), own: own?.exists ? await row(own) : null,
    stages, nextCursor: rows.size === 25 ? rows.docs[24].id : null };
});

export const listQuestArchives = callable(async (raw) => {
  const d = questObject(raw, ["cursor"]);
  let query = runs.where("state", "==", "archived").where("publicFlags", "array-contains", "public")
    .orderBy("endsAt", "desc").orderBy(FieldPath.documentId()).limit(20);
  if (d.cursor !== undefined) {
    const after = await runs.doc(id(d.cursor)).get();
    if (!after.exists || after.get("state") !== "archived" || !after.get("publicFlags").includes("public")) fail("アーカイブを更新してください");
    query = query.startAfter(after);
  }
  const snapshot = await query.get();
  return { items: snapshot.docs.map(publicRun),
    nextCursor: snapshot.size === 20 ? snapshot.docs[19].id : null };
});

export const adminSaveQuest = callable(async (raw, context) => {
  await administrator(context);
  const d = questObject(raw, ["runId", "version", "draft"]);
  const draft = validateQuestDraft(d.draft), ref = d.runId ? runs.doc(id(d.runId)) : runs.doc();
  const { accessCode, ...configuration } = draft;
  const version = await db.runTransaction(async tx => {
    const previous = await tx.get(ref);
    if (d.runId && !previous.exists) fail("開催が削除されています。一覧を更新してください", "not-found");
    if (previous.exists && (previous.get("state") !== "draft" || previous.get("version") !== d.version)) fail("公開済み、または設定が更新されています");
    const version = (previous.get("version") ?? 0) + 1;
    tx.set(ref, { ...configuration, codeHash: hash(accessCode), state: "draft", version, createdAt: previous.get("createdAt") ?? Date.now() });
    return version;
  });
  return { runId: ref.id, version };
});

export const adminListQuest = callable(async (raw, context) => {
  await administrator(context); const d = questObject(raw, ["cursor", "runId"]);
  const row = (doc: Snap) => ({
    ...publicRun(doc), xAccountList: doc.get("xAccountList"), simulation: doc.get("simulation") ?? null,
    simulatedVersion: doc.get("simulatedVersion") ?? null,
  });
  if (d.runId !== undefined) {
    if (d.cursor !== undefined) fail("開催IDとカーソルは併用できません", "invalid-argument");
    const snapshot = await runs.doc(id(d.runId)).get();
    return { items: snapshot.exists ? [row(snapshot)] : [], nextCursor: null };
  }
  let query = runs.orderBy("createdAt", "desc").orderBy(FieldPath.documentId()).limit(20);
  if (d.cursor) {
    const after = await runs.doc(id(d.cursor)).get();
    if (!after.exists) fail("一覧を更新してください");
    query = query.startAfter(after);
  }
  const snapshot = await query.get();
  return { items: snapshot.docs.map(row), nextCursor: snapshot.size === 20 ? snapshot.docs[19].id : null };
});

async function finishDeletion(runId: string, receipt: FirebaseFirestore.DocumentReference) {
  const ref = runs.doc(runId), snapshot = await ref.get();
  if (snapshot.exists && snapshot.get("state") !== "deleting") fail("削除対象の状態が変更されています", "aborted");
  await db.recursiveDelete(ref);
  await receipt.update({ state: "deleted", completedAt: Date.now() });
}
export const adminDeleteQuest = callable(async (raw, context) => {
  const actor = await administrator(context);
  const d = questObject(raw, ["runId", "version", "title", "confirmed"]);
  if (d.confirmed !== true) fail("完全削除の確認が必要です");
  const ref = runs.doc(id(d.runId)), receipt = deletions.doc(ref.id);
  const version = questInteger(d.version, "開催の版", 1, Number.MAX_SAFE_INTEGER);
  const title = questText(d.title, "確認する開催名", 120);
  const replay = await db.runTransaction(async tx => {
    const [snapshot, pointer, saved] = await Promise.all([tx.get(ref), tx.get(current), tx.get(receipt)]);
    if (saved.exists) {
      if (saved.get("version") !== version || saved.get("title") !== title) fail("削除確認の内容が一致しません", "aborted");
      return saved.get("state") === "deleted";
    }
    const run = getRun(snapshot);
    if (run.version !== version) fail("開催設定が更新されています。一覧を更新してください", "aborted");
    if (run.title !== title) fail("開催名が一致しません", "invalid-argument");
    if (run.state === "deleting") fail("削除記録を確認できません");
    tx.update(ref, { state: "deleting", closedAt: run.closedAt ?? Date.now() });
    if (pointer.get("runId") === ref.id) tx.delete(current);
    tx.create(receipt, { state: "deleting", version, title, actor, startedAt: Date.now() });
    return false;
  });
  if (replay) return { deleted: true, replay: true };
  await finishDeletion(ref.id, receipt);
  return { deleted: true, replay: false };
}, 540);

export const adminSimulateQuest = callable(async (raw, context) => {
  await administrator(context); const d = questObject(raw, ["runId", "version"]), ref = runs.doc(id(d.runId));
  const snapshot = await ref.get(), run = getRun(snapshot);
  if (run.state !== "draft" || run.version !== d.version) fail("下書きを保存し直してください");
  const reports = (["bridge", "flower", "mixed"] as const).flatMap(policy =>
    [true, false].map(shortcut => simulateQuest(run.rules, 20000, policy, shortcut)));
  await db.runTransaction(async tx => {
    const latest = await tx.get(ref);
    if (latest.get("version") !== run.version || latest.get("state") !== "draft") fail("設定が変更されました", "aborted");
    tx.update(ref, { simulation: reports, simulatedVersion: run.version });
  });
  return { reports };
});

export const adminPublishQuest = callable(async (raw, context) => {
  const actor = await administrator(context), d = questObject(raw, ["runId", "version", "confirmed", "reviewNote"]);
  if (d.confirmed !== true) fail("未確定項目の確認が必要です");
  const note = d.reviewNote === undefined ? "" : questText(d.reviewNote, "確認メモ", 2000, true);
  const ref = runs.doc(id(d.runId));
  return db.runTransaction(async tx => {
    const [snapshot, pointer] = await Promise.all([tx.get(ref), tx.get(current)]);
    const run = getRun(snapshot);
    const previous = pointer.get("runId") ? await tx.get(runs.doc(pointer.get("runId"))) : null;
    if (previous?.exists && previous.get("state") !== "archived") fail("現在の開催を確定・アーカイブしてから公開してください");
    if (run.state !== "draft" || d.version !== run.version ||
        run.endsAt <= Date.now()) fail("開催設定・期間を確認してください");
    tx.update(ref, { state: "published", version: run.version + 1, confirmations: note, publishedBy: actor, publishedAt: Date.now() });
    tx.set(current, { runId: ref.id });
    return { runId: ref.id };
  });
});

async function finalizePage(ref: FirebaseFirestore.DocumentReference, allowEarly: boolean) {
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { complete: true };
    const run = getRun(snapshot);
    if (run.state === "deleting") return { complete: true };
    if (run.state === "archived") return { complete: true, summary: run.summary };
    if (run.state !== "published" && run.state !== "settling") fail("公開済み開催を指定してください");
    if (!allowEarly && Date.now() < run.endsAt) fail("まだ開催中です");
    let query = ref.collection("players").orderBy(FieldPath.documentId()).limit(100);
    if (run.cursor) query = query.startAfter(run.cursor);
    const page = await tx.get(query);
    const summary = structuredClone(run.summary ?? newSummary());
    const grants = new Map(await Promise.all(page.docs
      .filter(doc => (run.rules.psaLimit ?? 0) > 0 && doc.get("psaReserved") === true && doc.get("psaTicketIssued") !== true &&
        !(doc.get("reachedStages") as number[]).includes(4))
      .map(async doc => [doc.id, await grantNanikaRightPlan(tx, doc.id, "psa")] as const)));
    for (const snapshot of page.docs) {
      const player = snapshot.data() as QuestPlayer;
      const result = questResult(player, run.rules);
      summary.total++; summary.groups[result.group]++;
      if (player.used === run.rules.maxTurns) { summary.completed++; summary.completedGroups[result.group]++; }
      for (const stage of player.reachedStages) summary.stages[String(stage)]++;
      const grant = grants.get(snapshot.id);
      if (grant) grant();
      tx.update(snapshot.ref, { result, ...(grant ? { psaTicketIssued: true } : {}) });
    }
    const complete = page.size < 100;
    tx.update(ref, { state: complete ? "archived" : "settling", closedAt: run.closedAt ?? Date.now(),
      cursor: page.docs[page.size - 1]?.id ?? run.cursor ?? "", summary });
    return { complete, summary };
  });
}
export const adminFinalizeQuest = callable(async (raw, context) => {
  await administrator(context); const d = questObject(raw, ["runId", "confirmed"]);
  if (d.confirmed !== true) fail("進行と付与の停止を確認してください");
  return finalizePage(runs.doc(id(d.runId)), true);
});
export const finalizeEndedQuest = functions.region("us-east1").runWith({ timeoutSeconds: 540 })
  .pubsub.schedule("every 5 minutes").timeZone("Asia/Tokyo").onRun(async () => {
    const deadline = Date.now() + 240000;
    const pending = await runs.where("state", "in", ["published", "settling"]).limit(10).get();
    for (const snapshot of pending.docs) {
      if (snapshot.get("state") === "settling" || Date.now() >= snapshot.get("endsAt")) {
        let complete = false;
        while (!complete && Date.now() < deadline) complete = (await finalizePage(snapshot.ref, false)).complete;
      }
    }
    const removing = await deletions.where("state", "==", "deleting").limit(3).get();
    for (const snapshot of removing.docs) {
      if (Date.now() >= deadline) break;
      try { await finishDeletion(snapshot.id, snapshot.ref); }
      catch (error) { console.error("クエスト削除の再開失敗", snapshot.id, error instanceof Error ? error.message : "unknown"); }
    }
  });
