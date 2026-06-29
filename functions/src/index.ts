import * as functions from "firebase-functions";  // ★これを一番上に追加
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp({
  storageBucket: "point-app-1f854.appspot.com",
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


function getYesterdayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) now.setDate(now.getDate() - 2);
  else now.setDate(now.getDate() - 1);
  return getDateStringJST(now);
}

function getTodayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  return getDateStringJST(now);
}

/* ============================================================
   ガチャ機能（v1 化）
============================================================ */

export const createGachaCode = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    try {
      const uid = context.auth?.uid;
      if (!uid)
        throw new functions.https.HttpsError(
          "unauthenticated",
          "ログインが必要です"
        );

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
      } = data;

      if (!title || !mode || !resetType || !point || !frames) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "必要な項目が不足しています"
        );
      }

      if (!Array.isArray(publicFlags)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "publicFlags は配列である必要があります"
        );
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
          throw new functions.https.HttpsError(
            "invalid-argument",
            `publicFlags に不正な値があります: ${flag}`
          );
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
      throw new functions.https.HttpsError(
        "internal",
        err.message || "unknown error"
      );
    }
  });

export const getPublicGachaList = functions
  .region("us-east1")
  .https.onCall(async () => {
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
  });

export const useGachaCode = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    try {
      const uid = context.auth?.uid;
      if (!uid)
        throw new functions.https.HttpsError(
          "unauthenticated",
          "ログインが必要です"
        );

      const code = data.code;
      if (!code)
        throw new functions.https.HttpsError(
          "invalid-argument",
          "コードが必要です"
        );

      const gachaRef = db.collection("gachaCodes").doc(code);
      const gachaSnap = await gachaRef.get();
      if (!gachaSnap.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "ガチャが存在しません"
        );
      }

      const gacha: any = gachaSnap.data();
      const flags: string[] = gacha.publicFlags ?? [];

      const now = nowJST();
      if (gacha.expiresAt && gacha.expiresAt.toDate() < now) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "期限切れのガチャです"
        );
      }

      // ここから先は元コードそのまま（v1 化済み）
      if (flags.includes("subscriber")) {
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();
        const userData = userSnap.data();
        if (!userData?.subscriber) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "このガチャはサブスクライバー限定です"
          );
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
        if (
          !histSnap.data() ||
          histSnap.data()?.prediction !== histSnap.data()?.result
        ) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "前日のニブイチ的中者のみ引けるガチャです"
          );
        }
      }

if (flags.includes("x_account_match")) {
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data();

  // ★ 最強 normalize（フロントと完全一致）
  function normalizeX(x: string) {
    return (x ?? "")
      .toLowerCase()
      .replace(/[\s\r\n\t]+/g, "")              // 改行・空白・タブ
      .replace(/[()（）【】［］]/g, "")         // 全角・半角カッコ類
      .replace(/[@＠]/g, "")                    // 全角・半角 @
      .replace(/[\u200B-\u200D\uFEFF]/g, "")    // ゼロ幅スペース類
      .replace(/[^\x20-\x7E]/g, "");            // その他不可視文字
  }

  const userX = normalizeX(userData?.xAccount);

  if (!userX) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "このガチャはXアカウント登録者のみ引けます"
    );
  }

  // ★ 名前行を除外（@ を含む行だけ）
  const rawList = (gacha.xAccountList ?? []).filter((s: string) =>
    s.includes("@")
  );

  const list = rawList.map((s: string) => normalizeX(s));

  const matched = list.some((entry: string) => entry.includes(userX));

  if (!matched) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "このガチャは指定されたXアカウント(リポストなど条件達成者)のみ引けます"
    );
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
        throw new functions.https.HttpsError(
          "failed-precondition",
          "ポイントが不足しています"
        );
      }

      const historyRef = db
        .collection("userGachaHistory")
        .doc(`${uid}_${code}`);
      const historySnap = await historyRef.get();
      const history = historySnap.exists
        ? historySnap.data()!
        : { count: 0 };

      if (gacha.resetType === "daily" && history.count >= maxPerUser) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "今日の回数上限です"
        );
      }
      if (gacha.resetType === "none" && history.count >= maxPerUser) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "上限回数に達しています"
        );
      }

      /* ======== 抽選処理 ======== */

      const frames = gacha.frames;
      let selectedFrame: any = null;

      if (gacha.mode === "count") {
        const weights = frames.map(
          (f: any) =>
            Math.max(0, (f.maxCount ?? 0) - (f.usedCount ?? 0))
        );
        const total = weights.reduce((a: number, b: number) => a + b, 0);
        if (total <= 0) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "すべての枠が終了しています"
          );
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
        throw new functions.https.HttpsError(
          "internal",
          "抽選に失敗しました"
        );
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
          throw new functions.https.HttpsError(
            "failed-precondition",
            "ポイントが不足しています"
          );
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
      throw new functions.https.HttpsError(
        "internal",
        err.message || "unknown error"
      );
    }
  });

/* ============================================================
   ガチャ結果一覧（v1 化）
============================================================ */

export const getGachaResults = functions
  .region("us-east1")
  .https.onCall(async () => {
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
      throw new functions.https.HttpsError(
        "internal",
        err.message || "unknown error"
      );
    }
  });
/* ============================================================
   手動：ガチャ使用回数リセット（v1 化）
============================================================ */
export const resetGachaUsage = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const code = data.code;
    if (!code)
      throw new functions.https.HttpsError(
        "invalid-argument",
        "code が必要です"
      );

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
  });

/* ============================================================
   自動：期限切れガチャ削除（v1 化）
============================================================ */
export const cleanExpiredGacha = functions
  .region("us-east1")
  .pubsub.schedule("0 0 * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const now = nowJST();
    const snap = await db
      .collection("gachaCodes")
      .where("expiresAt", "<", Timestamp.fromDate(now))
      .get();

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  });

/* ============================================================
   自動：デイリーガチャ完全リセット（v1 化）
============================================================ */
export const resetDailyGacha = functions
  .region("us-east1")
  .pubsub.schedule("0 6 * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
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
  });
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
  .pubsub.schedule("55 5 * * 2") // ← 火曜 5:55 に変更
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
  .pubsub.schedule("55 5 2 * *") // ← 2日 5:55 に変更
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


/* ============================================================
   ★ imageProcessor（そのまま re-export）
============================================================ */
export * from "./imageProcessor";

/* ============================================================
   クイズ正答者ポイント分配（複数回答対応・重複正解防止・完全版）
============================================================ */

export const confirmQuizAnswer = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    try {
      const quizId = data.quizId;
      if (!quizId) {
        throw new functions.https.HttpsError("invalid-argument", "quizId が必要です");
      }

      const quizRef = db.collection("quizzes").doc(quizId);
      const quizSnap = await quizRef.get();

      if (!quizSnap.exists) {
        throw new functions.https.HttpsError("not-found", "クイズが存在しません");
      }

      const quiz = quizSnap.data()!;
      const correctAnswer = quiz.answer;
      const rewardPoint = quiz.rewardPoint;
      const explanation = quiz.explanation ?? "";

      if (!correctAnswer) {
        throw new functions.https.HttpsError("failed-precondition", "正解が設定されていません");
      }

      const salt = quiz.salt ?? `salt_${quizId}`;
      const thread = quiz.thread ?? `thread_${quizId}`;

      /* --------------------------------------------------
         ★ 全ユーザーの複数回答を取得（重複正解防止）
      -------------------------------------------------- */
      const answersRef = quizRef.collection("answers");
      const usersSnap = await answersRef.get();

      const correctUsers = new Set<string>(); // ★ 重複防止

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        const itemsSnap = await answersRef
          .doc(uid)
          .collection("items")
          .get();

        itemsSnap.forEach((item) => {
          const ans = item.data().answer;
          if (ans === correctAnswer) {
            correctUsers.add(uid); // ★ 同じ uid は 1 回だけ
          }
        });
      }

      const correctUserList = Array.from(correctUsers);

      /* --------------------------------------------------
         ★ 山分けポイント計算
      -------------------------------------------------- */
      let perUser = 0;
      if (correctUserList.length > 0) {
        perUser = Math.floor(rewardPoint / correctUserList.length);
      }

      const batch = db.batch();
      correctUserList.forEach((uid) => {
        const userRef = db.collection("users").doc(uid);
        batch.update(userRef, {
          points: FieldValue.increment(perUser),
        });
      });
      await batch.commit();

      /* --------------------------------------------------
         ★ アーカイブへクイズ本体をコピー
      -------------------------------------------------- */
      const archiveRef = db.collection("quizzes_archive").doc(quizId);
      await archiveRef.set({
        ...quiz,
        explanation,
        salt,
        thread,
        archived: true,
        archivedAt: Timestamp.now(),
      });

      /* --------------------------------------------------
         ★ 複数回答をアーカイブ側へコピー
      -------------------------------------------------- */
      const archiveAnswersRef = archiveRef.collection("answers");

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        const itemsSnap = await answersRef
          .doc(uid)
          .collection("items")
          .get();

        for (const item of itemsSnap.docs) {
          await archiveAnswersRef
            .doc(uid) // ★ 本番側が uid ならアーカイブ側も uid になる
            .collection("items")
            .doc(item.id)
            .set(item.data());
        }
      }

      /* --------------------------------------------------
         ★ 元の answers/{uid}/items を削除
      -------------------------------------------------- */
      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        const itemsSnap = await answersRef
          .doc(uid)
          .collection("items")
          .get();

        const deleteBatch = db.batch();
        itemsSnap.forEach((item) => {
          deleteBatch.delete(item.ref);
        });
        await deleteBatch.commit();
      }

      /* --------------------------------------------------
         ★ 最後にクイズ本体を削除
      -------------------------------------------------- */
      await quizRef.delete();

      return {
        success: true,
        correctUsers: correctUserList,
        perUser,
        salt,
        thread,
      };
    } catch (err: any) {
      console.error("confirmQuizAnswer ERROR:", err);
      throw new functions.https.HttpsError("internal", "内部エラーが発生しました");
    }
  });
