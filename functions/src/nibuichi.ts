import * as functions from "firebase-functions";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

import { getYesterdayJST6, getTodayJST6, nowJST } from "./common/date";

const db = getFirestore();

/* ============================================================
   ★ 自動：ニブイチ前日集計（v1 化）
============================================================ */
export const processNibuichiDaily = functions
  .region("us-east1")
  .pubsub.schedule("5 6 * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    console.log("=== processNibuichiDaily START ===");

    const targetDate = getYesterdayJST6();
    console.log("targetDate:", targetDate);

    const dailyRef = db.collection("nibuichi_global").doc(targetDate);
    const dailySnap = await dailyRef.get();

    if (!dailySnap.exists) {
      console.log("昨日の結果が未登録のため終了");
      return;
    }

    const dailyData = dailySnap.data()!;
    const result = dailyData.result;
    const rewardPoints = dailyData.rewardPoints ?? 0;

    const predSnap = await db
      .collection("nibuichi_user_predictions")
      .where("date", "==", targetDate)
      .get();

    console.log("pred count:", predSnap.size);

    if (predSnap.size === 0) {
      console.log("予想0件のため終了");
      return;
    }

    let hitCount = 0;
    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      if (data.prediction === result) hitCount++;
    }

    const perUserReward =
      hitCount > 0 ? Math.floor(rewardPoints / hitCount) : 0;

    console.log("hitCount:", hitCount);
    console.log("perUserReward:", perUserReward);

    const statsBatch = db.batch();
    const userBatch = db.batch();
    const deleteBatch = db.batch();
    const archiveBatch = db.batch();

    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      const uid = data.uid;
      const prediction = data.prediction;

      const isHit = prediction === result;

      const userStatsRef = db.collection("nibuichi_user_stats").doc(uid);
      const userStatsSnap = await userStatsRef.get();
      const userStats = userStatsSnap.exists
        ? userStatsSnap.data()!
        : { total: 0, hit: 0, weeklyTotal: 0, weeklyHit: 0 };

      statsBatch.set(
        userStatsRef,
        {
          total: userStats.total + 1,
          hit: userStats.hit + (isHit ? 1 : 0),
          weeklyTotal: (userStats.weeklyTotal ?? 0) + 1,
          weeklyHit: (userStats.weeklyHit ?? 0) + (isHit ? 1 : 0),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      if (isHit && perUserReward > 0) {
        const userRef = db.collection("users").doc(uid);

        userBatch.update(userRef, {
          points: FieldValue.increment(perUserReward),
        });

        const phRef = db.collection("pointHistory").doc();
        userBatch.set(phRef, {
          id: phRef.id,
          user: uid,
          type: "nibuichi",
          added: perUserReward,
          prediction,
          result,
          date: targetDate,
          createdAt: Timestamp.now(),
        });
      }

      const historyRef = db
        .collection("nibuichi_daily")
        .doc(targetDate)
        .collection("predictions")
        .doc(uid);

      statsBatch.set(
        historyRef,
        {
          uid,
          prediction,
          result,
          rewardPoints,
          perUserReward: isHit ? perUserReward : 0,
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );

      const archiveRef = db
        .collection("nibuichi_user_predictions_archive")
        .doc(docSnap.id);

      archiveBatch.set(archiveRef, {
        ...data,
        archivedAt: Timestamp.now(),
      });

      deleteBatch.delete(docSnap.ref);
    }

    await statsBatch.commit();
    await userBatch.commit();
    await archiveBatch.commit();
    await deleteBatch.commit();

    console.log("=== processNibuichiDaily END ===");

    await db.collection("systemLogs").add({
      type: "nibuichiDailyReset",
      executedAt: Timestamp.now(),
      targetDate,
      hitCount,
    });
  });

/* ============================================================
   ★ 手動：ニブイチ前日集計（v1 化）
============================================================ */
export const manualResetNibuichiDaily = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const adminUid = context.auth?.uid;
    if (!adminUid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    const targetDate = getYesterdayJST6();
    const dailyRef = db.collection("nibuichi_global").doc(targetDate);
    const dailySnap = await dailyRef.get();
    if (!dailySnap.exists) {
      return { message: "昨日の結果が未登録のため終了" };
    }

    const dailyData = dailySnap.data()!;
    const result = dailyData.result;
    const rewardPoints = dailyData.rewardPoints ?? 0;

    const predSnap = await db
      .collection("nibuichi_user_predictions")
      .where("date", "==", targetDate)
      .get();

    if (predSnap.size === 0) {
      return { message: "予想0件のため処理なし" };
    }

    let hitCount = 0;
    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      if (data.prediction === result) hitCount++;
    }

    const perUserReward =
      hitCount > 0 ? Math.floor(rewardPoints / hitCount) : 0;

    const statsBatch = db.batch();
    const userBatch = db.batch();
    const deleteBatch = db.batch();
    const archiveBatch = db.batch();

    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      const uid = data.uid;
      const prediction = data.prediction;

      const isHit = prediction === result;

      const userStatsRef = db.collection("nibuichi_user_stats").doc(uid);
      const userStatsSnap = await userStatsRef.get();

      const userStats = userStatsSnap.exists
        ? userStatsSnap.data()!
        : { total: 0, hit: 0 };

      statsBatch.set(
        userStatsRef,
        {
          total: userStats.total + 1,
          hit: userStats.hit + (isHit ? 1 : 0),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      if (isHit && perUserReward > 0) {
        const userRef = db.collection("users").doc(uid);

        userBatch.update(userRef, {
          points: FieldValue.increment(perUserReward),
        });
      }

      const historyRef = db
        .collection("nibuichi_daily")
        .doc(targetDate)
        .collection("predictions")
        .doc(uid);

      statsBatch.set(
        historyRef,
        {
          uid,
          prediction,
          result,
          rewardPoints,
          perUserReward: isHit ? perUserReward : 0,
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );

      const archiveRef = db
        .collection("nibuichi_user_predictions_archive")
        .doc(docSnap.id);

      archiveBatch.set(archiveRef, {
        ...data,
        archivedAt: Timestamp.now(),
      });

      deleteBatch.delete(docSnap.ref);
    }

    await statsBatch.commit();
    await userBatch.commit();
    await archiveBatch.commit();
    await deleteBatch.commit();

    return { message: `ニブイチ手動集計完了（対象日：${targetDate}）` };
  });

/* ============================================================
   ★ 週間リセット（v1 化）
============================================================ */
export const resetWeeklyNibuichiStats = functions
  .region("us-east1")
  .pubsub.schedule("55 5 * * 2")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    console.log("=== resetWeeklyNibuichiStats START ===");

    const now = nowJST();
    const year = now.getFullYear();
    const week = Math.ceil(
      ((now.getTime() - new Date(year, 0, 1).getTime()) / 86400000 +
        new Date(year, 0, 1).getDay() +
        1) /
        7
    );
    const archiveId = `${year}-Week${week}`;

    const snap = await db.collection("nibuichi_user_stats").get();

    const batch = db.batch();
    const archiveBatch = db.batch();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const uid = docSnap.id;

      const archiveRef = db
        .collection("nibuichi_weekly_archive")
        .doc(archiveId)
        .collection("users")
        .doc(uid);

      archiveBatch.set(archiveRef, {
        uid,
        weeklyTotal: data.weeklyTotal ?? 0,
        weeklyHit: data.weeklyHit ?? 0,
        total: data.total ?? 0,
        hit: data.hit ?? 0,
        archivedAt: Timestamp.now(),
      });

      batch.update(docSnap.ref, {
        weeklyTotal: 0,
        weeklyHit: 0,
      });
    }

    await archiveBatch.commit();
    await batch.commit();

    await db.collection("systemLogs").add({
      type: "weeklyNibuichiReset",
      executedAt: Timestamp.now(),
      archiveId,
    });

    console.log("=== resetWeeklyNibuichiStats END ===");
  });

/* ============================================================
   ★ ニブイチ：月次リセット（v1 化）
============================================================ */
export const resetNibuichiMonthly = functions
  .region("us-east1")
  .pubsub.schedule("55 5 2 * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    console.log("=== resetNibuichiMonthly START ===");

    const snap = await db.collection("nibuichi_user_stats").get();
    const batch = db.batch();

    for (const docSnap of snap.docs) {
      batch.update(docSnap.ref, {
        monthlyTotal: 0,
        monthlyHit: 0,
        updatedAt: Timestamp.now(),
      });
    }

    await batch.commit();

    await db
      .collection("nibuichi_global_stats")
      .doc("stats")
      .set(
        {
          monthlyResetAt: Timestamp.now(),
        },
        { merge: true }
      );

    await db.collection("systemLogs").add({
      type: "monthlyReset",
      executedAt: Timestamp.now(),
    });

    console.log("=== resetNibuichiMonthly END ===");
  });

export const saveNibuichiPrediction = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }

    const prediction = data.prediction;
    if (!prediction) {
      throw new functions.https.HttpsError("invalid-argument", "prediction が必要です");
    }

    const date = getTodayJST6();

    const ref = db
      .collection("nibuichi_user_predictions")
      .doc(`${uid}_${date}`);

    const snap = await ref.get();
    if (snap.exists) {
      throw new functions.https.HttpsError("already-exists", "本日はすでに予想済みです");
    }

    await ref.set({
      uid,
      date,
      prediction,
      fixed: false,
      createdAt: Timestamp.now(),
    });

    return { message: "予想を保存しました" };
  });

export const submitNibuichiResult = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }

    const result = data.result;
    const rewardPoints = data.rewardPoints ?? 0;

    if (!result) {
      throw new functions.https.HttpsError("invalid-argument", "result が必要です");
    }

    const date = getTodayJST6();

    const ref = db.collection("nibuichi_global").doc(date);

    await ref.set(
      {
        date,
        result,
        rewardPoints,
        processed: true,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return { message: "今日の結果を登録しました" };
  });

export const getNibuichiUserStats = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }

    const today = getTodayJST6();

    const statsRef = db.collection("nibuichi_user_stats").doc(uid);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.exists ? statsSnap.data() : { total: 0, hit: 0 };

    const predRef = db
      .collection("nibuichi_user_predictions")
      .doc(`${uid}_${today}`);
    const predSnap = await predRef.get();
    const todayPrediction = predSnap.exists ? predSnap.data() : null;

    const globalStatsRef = db.collection("nibuichi_global_stats").doc("stats");
    const globalStatsSnap = await globalStatsRef.get();
    const global = globalStatsSnap.exists
      ? globalStatsSnap.data()
      : { win: 0, draw: 0, lose: 0, bakuado: 0 };

    const todayResultRef = db.collection("nibuichi_global").doc(today);
    const todayResultSnap = await todayResultRef.get();
    const todayResult = todayResultSnap.exists ? todayResultSnap.data() : null;

    return {
      stats,
      todayPrediction,
      global,
      todayResult,
    };
  });
