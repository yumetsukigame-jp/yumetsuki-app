import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
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

/* ============================================================
   ★ 今日の日付（6時切り替え）
============================================================ */
function getTodayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  return getDateStringJST(now);
}

/* ============================================================
   ★ 昨日の日付（6時切り替え）
============================================================ */
function getYesterdayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 2);
  } else {
    now.setDate(now.getDate() - 1);
  }
  return getDateStringJST(now);
}

/* ============================================================
   既存：ガチャ機能（あなたのコードをそのまま保持）
============================================================ */

export const createGachaCode = onCall(
  { region: "us-central1" },
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
      } = request.data;

      if (!title || !mode || !resetType || !point || !frames) {
        throw new HttpsError("invalid-argument", "必要な項目が不足しています");
      }

      if (!Array.isArray(publicFlags)) {
        throw new HttpsError("invalid-argument", "publicFlags は配列である必要があります");
      }

      const validFlags = ["public", "limited", "subscriber", "nibuichi_winner"];

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
        })),
        totalCount: totalCount ?? null,
        createdAt: Timestamp.now(),
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
        owner: uid,
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
  { region: "us-central1" },
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
  { region: "us-central1" },
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

      // ★ publicFlags（複数条件）
      const flags: string[] = gacha.publicFlags ?? [];

      // ★ 期限切れ判定（JST）
      const now = nowJST();
      if (gacha.expiresAt && gacha.expiresAt.toDate() < now) {
        throw new HttpsError("failed-precondition", "期限切れのガチャです");
      }

      /* ============================================================
         ★ サブスク限定
      ============================================================ */
      if (flags.includes("subscriber")) {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.data();

        if (!userData?.subscriber) {
          throw new HttpsError(
            "permission-denied",
            "このガチャはサブスクライバー限定です"
          );
        }
      }

      /* ============================================================
         ★ 前日のニブイチ的中者限定（6時切り替え対応）
      ============================================================ */
      if (flags.includes("nibuichi_winner")) {
        const yesterday = getYesterdayJST6();

        const histRef = db
          .collection("nibuichi_daily")
          .doc(yesterday)
          .collection("predictions")
          .doc(uid);

        const histSnap = await histRef.get();

        if (!histSnap.exists) {
          throw new HttpsError(
            "permission-denied",
            "前日のニブイチ的中者のみ引けるガチャです"
          );
        }

        const hist = histSnap.data();
        if (!hist || hist.prediction !== hist.result) {
          throw new HttpsError(
            "permission-denied",
            "前日のニブイチ的中者のみ引けるガチャです"
          );
        }
      }

      /* ============================================================
         ★ ここから先は既存のガチャ処理（変更なし）
      ============================================================ */

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data()!;
      const currentPoints = Number(user.points ?? 0);

      const cost = gacha.point.cost;
      const maxPerUser = gacha.point.maxPerUser;

      if (currentPoints < cost) {
        throw new HttpsError("failed-precondition", "ポイントが不足しています");
      }

      const historyRef = db
        .collection("userGachaHistory")
        .doc(`${uid}_${code}`);
      const historySnap = await historyRef.get();
      const history = historySnap.exists ? historySnap.data()! : { count: 0 };

      if (gacha.resetType === "daily") {
        if (history.count >= maxPerUser) {
          throw new HttpsError("failed-precondition", "今日の回数上限です");
        }
      }

      if (gacha.resetType === "none") {
        if (history.count >= maxPerUser) {
          throw new HttpsError("failed-precondition", "上限回数に達しています");
        }
      }

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

        const resultRef = db.collection("gachaResults").doc();
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
   ガチャ結果一覧（変更なし）
============================================================ */
export const getGachaResults = onCall(
  { region: "us-central1" },
  async () => {
    try {
      const snap = await db
        .collection("gachaResults")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();

      const results: any[] = [];

      for (const d of snap.docs) {
        const data = d.data();

        const codeSnap = await db
          .collection("gachaCodes")
          .doc(data.code)
          .get();
        const codeData = codeSnap.data();

        if (!codeData || !codeData.title) continue;

        const frameInfo = codeData.frames?.find(
          (f: any) => f.label === data.frame
        );

        results.push({
          id: d.id,
          ...data,
          title: codeData.title,
          frameName: frameInfo?.label ?? data.frame,
          thumbnail: codeData.thumbnail ?? "",
        });
      }

      return results;
    } catch (err: any) {
      console.error("getGachaResults error:", err);
      throw new HttpsError("internal", err.message || "unknown error");
    }
  }
);

/* ============================================================
   手動：ガチャ使用回数リセット（変更なし）
============================================================ */
export const resetGachaUsage = onCall(
  { region: "us-central1" },
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
   自動：期限切れガチャ削除（変更なし）
============================================================ */
export const cleanExpiredGacha = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-central1",
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
   自動：デイリーガチャ完全リセット（変更なし）
============================================================ */
export const resetDailyGacha = onSchedule(
  {
    schedule: "0 6 * * *", // JST 6:00
    timeZone: "Asia/Tokyo",
    region: "us-central1",
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
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const { prediction } = request.data;
    if (!prediction) {
      throw new HttpsError("invalid-argument", "prediction が必要です");
    }

    // ★ 今日の日付（6時切り替え）
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
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const { result, rewardPoints } = request.data;
    if (!result) {
      throw new HttpsError("invalid-argument", "result が必要です");
    }

    // ★ 今日の日付（6時切り替え）
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
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    // ★ 今日の日付（6時切り替え）
    const today = getTodayJST6();

    // 個人戦績
    const statsRef = db.collection("nibuichi_user_stats").doc(uid);
    const statsSnap = await statsRef.get();
    const stats = statsSnap.exists
      ? statsSnap.data()
      : { total: 0, hit: 0 };

    // 今日の予想
    const predRef = db
      .collection("nibuichi_user_predictions")
      .doc(`${uid}_${today}`);
    const predSnap = await predRef.get();
    const todayPrediction = predSnap.exists ? predSnap.data() : null;

    // 総合戦績
    const globalStatsRef = db.collection("nibuichi_global_stats").doc("stats");
    const globalStatsSnap = await globalStatsRef.get();
    const global = globalStatsSnap.exists
      ? globalStatsSnap.data()
      : { win: 0, draw: 0, lose: 0, bakuado: 0 };

    // 今日の結果
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
   ※ 6時切り替えに合わせて getYesterdayJST6 を使用
============================================================ */
/* ============================================================
   ★ 自動：ニブイチ前日集計（毎朝6:05 JST）
   ※ Cloud Scheduler が JST として cron を解釈するため
   ※ cron を「5 6」に修正（6:05 JST）
============================================================ */
export const processNibuichiDaily = onSchedule(
  {
    schedule: "5 6 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-central1",
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

    // ★ 全予想を取得
    const predSnap = await db
      .collection("nibuichi_user_predictions")
      .where("date", "==", targetDate)
      .get();

    console.log("pred count:", predSnap.size);

    if (predSnap.size === 0) {
      console.log("予想0件のため終了");
      return;
    }

    /* ============================================================
       ① 的中者数をカウント
    ============================================================ */
    let hitCount = 0;
    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      if (data.prediction === result) hitCount++;
    }

    /* ============================================================
       ② 山分けポイント（切り捨て）
    ============================================================ */
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

      /* ============================================================
         個人戦績更新（★週間ランキング対応）
      ============================================================ */
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

          // ★ 週間ランキング用カウンター
          weeklyTotal: (userStats.weeklyTotal ?? 0) + 1,
          weeklyHit: (userStats.weeklyHit ?? 0) + (isHit ? 1 : 0),

          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      /* ============================================================
         ③ 的中者に山分けポイントを付与
      ============================================================ */
      if (isHit && perUserReward > 0) {
        const userRef = db.collection("users").doc(uid);
        userBatch.update(userRef, {
          points: FieldValue.increment(perUserReward),
        });
      }

      /* ============================================================
         ④ 日別履歴（predictions）に perUserReward を保存
      ============================================================ */
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
          perUserReward,
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );

      /* ============================================================
         グローバル戦績
      ============================================================ */
      if (result === "nibuni") globalWin++;
      if (result === "nibuichi") globalDraw++;
      if (result === "nibuzero") globalLose++;
      if (result === "bakuado") globalBakuado++;

      /* ============================================================
         アーカイブ & 削除
      ============================================================ */
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

    /* ============================================================
       ★ systemLogs に記録（管理画面の最終更新用）
    ============================================================ */
    await db.collection("systemLogs").add({
      type: "nibuichiDailyReset",
      executedAt: Timestamp.now(),
      targetDate,
      hitCount,
    });
  }
);

export const resetWeeklyNibuichiStats = onSchedule(
  {
    schedule: "0 6 * * 1", // ★ 毎週月曜 6:00 JST
    timeZone: "Asia/Tokyo",
    region: "us-central1",
  },
  async () => {
    console.log("=== resetWeeklyNibuichiStats START ===");

    // 全ユーザーの週間戦績を取得
    const snap = await db.collection("nibuichi_user_stats").get();
    const batch = db.batch();

    for (const docSnap of snap.docs) {
      batch.update(docSnap.ref, {
        weeklyTotal: 0,
        weeklyHit: 0,
      });
    }

    await batch.commit();

    // ★ systemLogs に記録
    await db.collection("systemLogs").add({
      type: "weeklyNibuichiReset",
      executedAt: Timestamp.now(),
    });

    console.log("=== resetWeeklyNibuichiStats END ===");
  }
);


/* ============================================================
   ★ 手動：ニブイチ前日集計（6時切り替え対応）
============================================================ */
export const manualResetNibuichiDaily = onCall(
  { region: "us-central1" },
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

    // ★ 全予想を取得
    const predSnap = await db
      .collection("nibuichi_user_predictions")
      .where("date", "==", targetDate)
      .get();

    if (predSnap.size === 0) {
      return { message: "予想0件のため処理なし" };
    }

    /* ============================================================
       ① 的中者数をカウント
    ============================================================ */
    let hitCount = 0;
    for (const docSnap of predSnap.docs) {
      const data = docSnap.data();
      if (data.prediction === result) hitCount++;
    }

    /* ============================================================
       ② 山分けポイント（切り捨て）
    ============================================================ */
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

      /* ============================================================
         個人戦績更新
      ============================================================ */
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

      /* ============================================================
         ③ 的中者に山分けポイントを付与
      ============================================================ */
      if (isHit && perUserReward > 0) {
        const userRef = db.collection("users").doc(uid);
        userBatch.update(userRef, {
          points: FieldValue.increment(perUserReward),
        });
      }

      /* ============================================================
         ④ 日別履歴（predictions）に perUserReward を保存
      ============================================================ */
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
          rewardPoints,      // 総配布ポイント
          perUserReward,     // ★ 山分け後ポイント
          createdAt: Timestamp.now(),
        },
        { merge: true }
      );

      /* ============================================================
         グローバル戦績
      ============================================================ */
      if (result === "nibuni") globalWin++;
      if (result === "nibuichi") globalDraw++;
      if (result === "nibuzero") globalLose++;
      if (result === "bakuado") globalBakuado++;

      /* ============================================================
         アーカイブ & 削除
      ============================================================ */
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

    /* ============================================================
       グローバル戦績更新
    ============================================================ */
    const globalRef = db.collection("nibuichi_global_stats").doc("stats");
    await globalRef.set(
      {
        win: FieldValue.increment(globalWin),
        draw: FieldValue.increment(globalDraw),
        lose: FieldValue.increment(globalLose),
        bakuado: FieldValue.increment(globalBakuado),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    await db.collection("systemLogs").add({
      type: "manualNibuichiDailyReset",
      executedAt: Timestamp.now(),
      executedBy: adminUid,
      targetDate,
    });

    console.log("=== manualResetNibuichiDaily END ===");

    return { message: `ニブイチ手動集計完了（対象日：${targetDate}）` };
  }
);


/* ============================================================
   ★ ニブイチ：週次リセット（変更なし）
============================================================ */
export const resetNibuichiWeekly = onSchedule(
  {
    schedule: "0 21 * * 2", // JST 6:00（火曜）
    timeZone: "Asia/Tokyo",
    region: "us-central1",
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
   ★ ニブイチ：月次リセット（変更なし）
============================================================ */
export const resetNibuichiMonthly = onSchedule(
  {
    schedule: "0 21 2 * *", // JST 6:00（毎月2日）
    timeZone: "Asia/Tokyo",
    region: "us-central1",
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
