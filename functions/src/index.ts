import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp({
  storageBucket: "point-app-1f854.firebasestorage.app",
});
const db = getFirestore();

/* ============================================================
   共通：JST 時刻ユーティリティ（6時切り替え対応版）
============================================================ */
function nowJST(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

function getDateStringJST(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTodayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) now.setDate(now.getDate() - 1);
  return getDateStringJST(now);
}

function getYesterdayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) now.setDate(now.getDate() - 2);
  else now.setDate(now.getDate() - 1);
  return getDateStringJST(now);
}

/* ============================================================
   ガチャ機能
============================================================ */

export const createGachaCode = onCall(
  { region: "us-east1" },
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

      const {
        title,
        mode,
        resetType,
        publicFlags,
        thumbnail,
        point,
        totalCount,
        frames,
        expiresAt,
        xAccountList,
      } = request.data;

      if (!title || !mode || !resetType || !point || !frames) {
        throw new HttpsError("invalid-argument", "必要な項目が不足しています");
      }

      if (!Array.isArray(publicFlags)) {
        throw new HttpsError("invalid-argument", "publicFlags は配列である必要があります");
      }

      const validFlags = [
        "public",
        "limited",
        "subscriber",
        "nibuichi_winner",
        "x_account_match",
      ];

      for (const flag of publicFlags) {
        if (!validFlags.includes(flag)) {
          throw new HttpsError("invalid-argument", `publicFlags に不正な値があります: ${flag}`);
        }
      }

      const code =
        "YG-" + Math.random().toString(36).substring(2, 10).toUpperCase();

      const gachaRef = db.collection("gachaCodes").doc(code);

      const gachaData: any = {
        code,
        title,
        mode,
        resetType,
        publicFlags,
        thumbnail: thumbnail ?? "",
        point: {
          cost: point.cost,
          maxPerUser: point.maxPerUser,
        },
        frames: frames.map((f: any) => ({
          label: f.label,
          maxCount: f.maxCount ?? null,
          usedCount: 0,
          probability: f.probability ?? null,
          rewardMin: f.rewardMin,
          rewardMax: f.rewardMax,
          shippingEnabled: f.shippingEnabled ?? false,
        })),
        totalCount: totalCount ?? null,
        createdAt: Timestamp.now(),
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
        owner: uid,
        xAccountList: Array.isArray(xAccountList) ? xAccountList : [],
      };

      await gachaRef.set(gachaData);

      return { code };
    } catch (err: any) {
      console.error("createGachaCode error:", err);
      throw new HttpsError("internal", err.message || "unknown error");
    }
  }
);

export const getPublicGachaList = onCall(
  { region: "us-east1" },
  async () => {
    const snap = await db
      .collection("gachaCodes")
      .orderBy("createdAt", "desc")
      .get();

    return snap.docs.map((d) => {
      const data = d.data();
      return {
        code: d.id,
        title: data.title ?? "",
        thumbnail: data.thumbnail ?? "",
        mode: data.mode,
        point: data.point,
        totalCount: data.totalCount ?? null,
        frames: data.frames ?? [],
        expiresAt: data.expiresAt ?? null,
        createdAt: data.createdAt ?? null,
        resetType: data.resetType ?? "none",
        publicFlags: data.publicFlags ?? [],
      };
    });
  }
);

export const useGachaCode = onCall(
  { region: "us-east1" },
  async (request) => {
    try {
      const uid = request.auth?.uid;
      if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

      const code = request.data.code;
      if (!code) throw new HttpsError("invalid-argument", "コードが必要です");

      const gachaRef = db.collection("gachaCodes").doc(code);
      const gachaSnap = await gachaRef.get();
      if (!gachaSnap.exists) {
        throw new HttpsError("not-found", "ガチャが存在しません");
      }

      const gacha: any = gachaSnap.data();
      const flags: string[] = gacha.publicFlags ?? [];

      const now = nowJST();
      if (gacha.expiresAt && gacha.expiresAt.toDate() < now) {
        throw new HttpsError("failed-precondition", "期限切れのガチャです");
      }

      if (flags.includes("subscriber")) {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        if (!userData?.subscriber) {
          throw new HttpsError("permission-denied", "このガチャはサブスクライバー限定です");
        }
      }

      if (flags.includes("nibuichi_winner")) {
        const yesterday = getYesterdayJST6();
        const histRef = db
          .collection("nibuichi_daily")
          .doc(yesterday)
          .collection("predictions")
          .doc(uid);
        const histSnap = await histRef.get();
        if (!histSnap.data() || histSnap.data()?.prediction !== histSnap.data()?.result) {
          throw new HttpsError(
            "permission-denied",
            "前日のニブイチ的中者のみ引けるガチャです"
          );
        }
      }

      if (flags.includes("x_account_match")) {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        const userX = (userData?.xAccount ?? "").toLowerCase();
        if (!userX) {
          throw new HttpsError("permission-denied", "このガチャはXアカウント登録者のみ引けます");
        }
        const list = (gacha.xAccountList ?? []).map((s: string) => s.toLowerCase());
        const matched = list.some((entry: string) => entry.includes(userX));
        if (!matched) {
          throw new HttpsError("permission-denied", "このガチャは指定されたXアカウントのみ引けます");
        }
      }
      /* ======== ポイント・回数チェック ======== */

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data()!;
      const currentPoints = Number(user.points ?? 0);

      const cost = gacha.point.cost;
      const maxPerUser = gacha.point.maxPerUser;

      if (currentPoints < cost) {
        throw new HttpsError("failed-precondition", "ポイントが不足しています");
      }

      const historyRef = db.collection("userGachaHistory").doc(`${uid}_${code}`);
      const historySnap = await historyRef.get();
      const history = historySnap.exists ? historySnap.data()! : { count: 0 };

      if (gacha.resetType === "daily" && history.count >= maxPerUser) {
        throw new HttpsError("failed-precondition", "今日の回数上限です");
      }
      if (gacha.resetType === "none" && history.count >= maxPerUser) {
        throw new HttpsError("failed-precondition", "上限回数に達しています");
      }

      /* ======== 抽選処理 ======== */

      const frames = gacha.frames;
      let selectedFrame: any = null;

      if (gacha.mode === "count") {
        const weights = frames.map(
          (f: any) => Math.max(0, (f.maxCount ?? 0) - (f.usedCount ?? 0))
        );
        const total = weights.reduce((a: number, b: number) => a + b, 0);
        if (total <= 0) {
          throw new HttpsError("failed-precondition", "すべての枠が終了しています");
        }
        let r = Math.random() * total;
        for (let i = 0; i < frames.length; i++) {
          if (r < weights[i]) {
            selectedFrame = frames[i];
            break;
          }
          r -= weights[i];
        }
      } else {
        const probs = frames.map((f: any) => f.probability ?? 0);
        const totalProb = probs.reduce((a: number, b: number) => a + b, 0);
        let r = Math.random() * totalProb;
        for (let i = 0; i < frames.length; i++) {
          if (r < probs[i]) {
            selectedFrame = frames[i];
            break;
          }
          r -= probs[i];
        }
      }

      if (!selectedFrame) {
        throw new HttpsError("internal", "抽選に失敗しました");
      }

      const reward =
        Math.floor(
          Math.random() *
            (selectedFrame.rewardMax - selectedFrame.rewardMin + 1)
        ) + selectedFrame.rewardMin;

      /* ============================================================
         ★★★ サブコレクション化した結果保存処理 ★★★
      ============================================================ */

      await db.runTransaction(async (tx) => {
        const freshUser = (await tx.get(userRef)).data()!;
        const freshHistorySnap = await tx.get(historyRef);
        const freshHistory = freshHistorySnap.exists
          ? freshHistorySnap.data()!
          : { count: 0 };

        const freshPoints = Number(freshUser.points ?? 0);
        if (freshPoints < cost) {
          throw new HttpsError("failed-precondition", "ポイントが不足しています");
        }

        tx.update(userRef, {
          points: freshPoints - cost + reward,
        });

        tx.set(historyRef, {
          count: freshHistory.count + 1,
        });

        if (gacha.mode === "count") {
          const updatedFrames = gacha.frames.map((f: any) =>
            f.label === selectedFrame.label
              ? { ...f, usedCount: (f.usedCount ?? 0) + 1 }
              : f
          );
          tx.update(gachaRef, { frames: updatedFrames });
        }

        const resultRef = db
          .collection("gachaResults")
          .doc(code)
          .collection("results")
          .doc();

        tx.set(resultRef, {
          id: resultRef.id,
          uid,
          code,
          title: gacha.title,
          frame: selectedFrame.label,
          reward,
          createdAt: Timestamp.now(),
        });
      });

      return {
        frame: selectedFrame.label,
        reward,
      };
    } catch (err: any) {
      console.error("useGachaCode error:", err);
      throw new HttpsError("internal", err.message || "unknown error");
    }
  }
);

/* ============================================================
   ガチャ結果一覧
============================================================ */
export const getGachaResults = onCall(
  { region: "us-east1" },
  async () => {
    try {
      const results: any[] = [];

      const gachaSnap = await db.collection("gachaCodes").get();

      for (const gachaDoc of gachaSnap.docs) {
        const code = gachaDoc.id;
        const gachaData = gachaDoc.data();

        const resultSnap = await db
          .collection("gachaResults")
          .doc(code)
          .collection("results")
          .orderBy("createdAt", "desc")
          .get();

        for (const r of resultSnap.docs) {
          const data = r.data();

          const frameInfo = gachaData.frames?.find(
            (f: any) => f.label === data.frame
          );

          results.push({
            id: r.id,
            ...data,
            title: gachaData.title ?? "",
            frameName: frameInfo?.label ?? data.frame,
            thumbnail: gachaData.thumbnail ?? "",
          });
        }
      }

      results.sort(
        (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
      );

      return results;
    } catch (err: any) {
      console.error("getGachaResults error:", err);
      throw new HttpsError("internal", err.message || "unknown error");
    }
  }
);

/* ============================================================
   手動：ガチャ使用回数リセット
============================================================ */
export const resetGachaUsage = onCall(
  { region: "us-east1" },
  async (request) => {
    const code = request.data.code;
    if (!code) throw new HttpsError("invalid-argument", "code が必要です");

    const snap = await db.collection("userGachaHistory").get();

    const batch = db.batch();
    let count = 0;

    snap.docs.forEach((d) => {
      const id = d.id;
      const parts = id.split("_");
      const codePart = parts[1];

      if (codePart === code) {
        batch.update(d.ref, { count: 0 });
        count++;
      }
    });

    await batch.commit();

    return { message: "リセット完了", count };
  }
);

/* ============================================================
   自動：期限切れガチャ削除
============================================================ */
export const cleanExpiredGacha = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
    const now = nowJST();
    const snap = await db
      .collection("gachaCodes")
      .where("expiresAt", "<", Timestamp.fromDate(now))
      .get();

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
);

/* ============================================================
   自動：デイリーガチャ完全リセット
============================================================ */
export const resetDailyGacha = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
    console.log("=== resetDailyGacha START ===");

    const now = Timestamp.now();

    const gachaSnap = await db
      .collection("gachaCodes")
      .where("resetType", "==", "daily")
      .get();

    let resetGachaCount = 0;
    let resetHistoryCount = 0;

    for (const docSnap of gachaSnap.docs) {
      const data = docSnap.data();

      const newFrames = data.frames.map((f: any) => ({
        ...f,
        usedCount: 0,
      }));

      await docSnap.ref.update({
        frames: newFrames,
        lastResetAt: now,
      });

      resetGachaCount++;
    }

    const historySnap = await db.collection("userGachaHistory").get();
    const batch = db.batch();

    for (const d of historySnap.docs) {
      const code = d.id.split("_")[1];
      const target = gachaSnap.docs.find((g) => g.id === code);

      if (target) {
        batch.update(d.ref, { count: 0 });
        resetHistoryCount++;
      }
    }

    await batch.commit();

    await db.collection("systemLogs").add({
      type: "dailyReset",
      executedAt: now,
      resetGachaCount,
      resetHistoryCount,
    });

    console.log("=== resetDailyGacha END ===");
  }
);
/* ============================================================
   ★ ニブイチ：予想保存（6時切り替え対応）
============================================================ */
export const saveNibuichiPrediction = onCall(
  { region: "us-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const { prediction } = request.data;
    if (!prediction) {
      throw new HttpsError("invalid-argument", "prediction が必要です");
    }

    const date = getTodayJST6();

    const ref = db
      .collection("nibuichi_user_predictions")
      .doc(`${uid}_${date}`);

    const snap = await ref.get();
    if (snap.exists) {
      throw new HttpsError("already-exists", "本日はすでに予想済みです");
    }

    await ref.set({
      uid,
      date,
      prediction,
      fixed: false,
      createdAt: Timestamp.now(),
    });

    return { message: "予想を保存しました" };
  }
);

/* ============================================================
   ★ ニブイチ：結果登録（管理者・6時切り替え対応）
============================================================ */
export const submitNibuichiResult = onCall(
  { region: "us-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const { result, rewardPoints } = request.data;
    if (!result) {
      throw new HttpsError("invalid-argument", "result が必要です");
    }

    const date = getTodayJST6();

    const ref = db.collection("nibuichi_global").doc(date);

    await ref.set(
      {
        date,
        result,
        rewardPoints: rewardPoints ?? 0,
        processed: true,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return { message: "今日の結果を登録しました" };
  }
);

/* ============================================================
   ★ ニブイチ：個人戦績取得（6時切り替え対応）
============================================================ */
export const getNibuichiUserStats = onCall(
  { region: "us-east1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const today = getTodayJST6();

    const statsRef = db.collection("nibuichi_user_stats").doc(uid);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.exists
      ? statsSnap.data()
      : { total: 0, hit: 0 };

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
  }
);

/* ============================================================
   ★ 自動：ニブイチ前日集計（毎朝6:05 JST）
============================================================ */
export const processNibuichiDaily = onSchedule(
  {
    schedule: "5 6 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
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

    let globalWin = 0;
    let globalDraw = 0;
    let globalLose = 0;
    let globalBakuado = 0;

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

      if (result === "nibuni") globalWin++;
      if (result === "nibuichi") globalDraw++;
      if (result === "nibuzero") globalLose++;
      if (result === "bakuado") globalBakuado++;

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
  }
);

/* ============================================================
   ★ 週間リセット
============================================================ */
export const resetWeeklyNibuichiStats = onSchedule(
  {
    schedule: "0 6 * * 1",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
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
  }
);

/* ============================================================
   ★ 手動：ニブイチ前日集計（6時切り替え対応）
============================================================ */
export const manualResetNibuichiDaily = onCall(
  { region: "us-east1" },
  async (request) => {
    const adminUid = request.auth?.uid;
    if (!adminUid) throw new HttpsError("unauthenticated", "ログインが必要です");

    console.log("=== manualResetNibuichiDaily START ===");

    const targetDate = getYesterdayJST6();
    console.log("targetDate:", targetDate);

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

    console.log("hitCount:", hitCount);
    console.log("perUserReward:", perUserReward);

    const statsBatch = db.batch();
    const userBatch = db.batch();
    const deleteBatch = db.batch();
    const archiveBatch = db.batch();

    let globalWin = 0;
    let globalDraw = 0;
    let globalLose = 0;
    let globalBakuado = 0;

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

      if (result === "nibuni") globalWin++;
      if (result === "nibuichi") globalDraw++;
      if (result === "nibuzero") globalLose++;
      if (result === "bakuado") globalBakuado++;

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

    console.log("=== manualResetNibuichiDaily END ===");

    await db.collection("systemLogs").add({
      type: "nibuichiDailyReset",
      executedAt: Timestamp.now(),
      targetDate,
      hitCount,
    });

    return { message: `ニブイチ手動集計完了（対象日：${targetDate}）` };
  }
);

/* ============================================================
   ★ ニブイチ：週次リセット
============================================================ */
export const resetNibuichiWeekly = onSchedule(
  {
    schedule: "0 21 * * 2",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
    console.log("=== resetNibuichiWeekly START ===");

    const snap = await db.collection("nibuichi_user_stats").get();
    const batch = db.batch();

    for (const docSnap of snap.docs) {
      batch.update(docSnap.ref, {
        weeklyTotal: 0,
        weeklyHit: 0,
        updatedAt: Timestamp.now(),
      });
    }

    await batch.commit();

    await db
      .collection("nibuichi_global_stats")
      .doc("stats")
      .set(
        {
          weeklyResetAt: Timestamp.now(),
        },
        { merge: true }
      );

    await db.collection("systemLogs").add({
      type: "weeklyReset",
      executedAt: Timestamp.now(),
    });

    console.log("=== resetNibuichiWeekly END ===");
  }
);

/* ============================================================
   ★ ニブイチ：月次リセット
============================================================ */
export const resetNibuichiMonthly = onSchedule(
  {
    schedule: "0 21 2 * *",
    timeZone: "Asia/Tokyo",
    region: "us-east1",
  },
  async () => {
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
  }
);

export * from "./imageProcessor";
