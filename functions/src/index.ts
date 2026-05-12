import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
const db = getFirestore();

/* ============================================================
   共通：バッチ分割処理（500件制限対策）
============================================================ */
async function commitBatches(batches: FirebaseFirestore.WriteBatch[]) {
  for (const batch of batches) {
    await batch.commit();
  }
}

/* ============================================================
   既存：ガチャ機能
============================================================ */

function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createGachaCode = onCall(
  { region: "us-central1" },
  async (request) => {
    try {
      const {
        title,
        mode,
        point,
        totalCount,
        frames,
        expiresAt,
        publicFlag,
        thumbnail,
      } = request.data;

      if (!title) throw new HttpsError("invalid-argument", "title が必要です");
      if (!mode) throw new HttpsError("invalid-argument", "mode が必要です");
      if (!point) throw new HttpsError("invalid-argument", "point が必要です");
      if (!frames || !Array.isArray(frames)) {
        throw new HttpsError("invalid-argument", "frames が不正です");
      }

      const code = "YG-" + generateCode();

      const gachaData = {
        code,
        title,
        mode,
        public: publicFlag ?? false,
        thumbnail: thumbnail ?? "",
        point: {
          cost: point.cost,
          maxPerUser: point.maxPerUser,
        },
        totalCount: mode === "count" ? totalCount : null,
        frames: frames.map((f: any) => ({
          label: f.label,
          maxCount: f.maxCount ?? null,
          usedCount: 0,
          probability: f.probability ?? null,
          rewardMin: f.rewardMin ?? 0,
          rewardMax: f.rewardMax ?? 0,
        })),
        createdAt: Timestamp.now(),
        expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      };

      await db.collection("gachaCodes").doc(code).set(gachaData);

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
        public: data.public ?? false,
        thumbnail: data.thumbnail ?? "",
        mode: data.mode,
        point: data.point,
        totalCount: data.totalCount ?? null,
        frames: data.frames ?? [],
        expiresAt: data.expiresAt ?? null,
        createdAt: data.createdAt ?? null,
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
      if (!gachaSnap.exists)
        throw new HttpsError("not-found", "ガチャが存在しません");

      const gacha: any = gachaSnap.data();

      if (gacha.expiresAt && gacha.expiresAt.toDate() < new Date()) {
        throw new HttpsError("failed-precondition", "期限切れのガチャです");
      }

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data()!;

      const cost = gacha.point.cost;
      const maxPerUser = gacha.point.maxPerUser;

      const currentPoints = Number(user.points ?? 0);

      if (currentPoints < cost) {
        throw new HttpsError(
          "failed-precondition",
          "ポイントが不足しています"
        );
      }

      const historyRef = db
        .collection("userGachaHistory")
        .doc(`${uid}_${code}`);
      const historySnap = await historyRef.get();
      const history = historySnap.exists ? historySnap.data()! : { count: 0 };

      if (history.count >= maxPerUser) {
        throw new HttpsError(
          "failed-precondition",
          "これ以上引けません"
        );
      }

      const frames = gacha.frames;
      let selectedFrame: any = null;

      if (gacha.mode === "count") {
        const weights = frames.map(
          (f: any) => Math.max(0, (f.maxCount ?? 0) - (f.usedCount ?? 0))
        );
        const total = weights.reduce((a: number, b: number) => a + b, 0);

        if (total <= 0) {
          throw new HttpsError(
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
          throw new HttpsError(
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

        const updatedFrames = gacha.frames.map((f: any) =>
          f.label === selectedFrame.label
            ? { ...f, usedCount: (f.usedCount ?? 0) + 1 }
            : f
        );

        tx.update(gachaRef, { frames: updatedFrames });

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

export const cleanExpiredGacha = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-central1",
  },
  async () => {
    const now = new Date();
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
   新機能：ゆめつき今日のニブイチ
============================================================ */

/**
 * ① ユーザーの予想を保存
 */
export const saveNibuichiPrediction = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const prediction = request.data.prediction;
    if (!prediction)
      throw new HttpsError("invalid-argument", "prediction が必要です");

    const today = new Date().toISOString().slice(0, 10);
    const docId = `${uid}_${today}`;

    const ref = db.collection("nibuichi_user_predictions").doc(docId);
    const snap = await ref.get();

    if (snap.exists && snap.data()?.fixed) {
      throw new HttpsError(
        "failed-precondition",
        "今日の予想は確定済みです"
      );
    }

    await ref.set(
      {
        uid,
        date: today,
        prediction,
        fixed: false,
        createdAt: Timestamp.now(),
      },
      { merge: true }
    );

    return { message: "予想を保存しました" };
  }
);

/**
 * ② 管理者が今日の結果を確定
 * - 今日の結果と配布ポイントを保存するだけ
 * - 集計・山分け・戦績更新は翌日6時のバッチで行う
 */
export const submitNibuichiResult = onCall(
  { region: "us-central1" },
  async (request) => {
    const result = request.data.result;
    const rewardPoints = request.data.rewardPoints ?? 500; // 初期値 500

    if (!result) {
      throw new HttpsError("invalid-argument", "result が必要です");
    }

    const today = new Date().toISOString().slice(0, 10);

    await db
      .collection("nibuichi_daily")
      .doc(today)
      .set(
        {
          result,
          rewardPoints,
          createdAt: Timestamp.now(),
          processed: false, // 集計済みかどうかのフラグ
        },
        { merge: true }
      );

    return { message: "今日の結果を保存しました" };
  }
);

/**
 * ③ ユーザー画面用データ取得
 */
export const getNibuichiUserStats = onCall(
  { region: "us-central1" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "ログインが必要です");

    const today = new Date().toISOString().slice(0, 10);
    const predRef = db
      .collection("nibuichi_user_predictions")
      .doc(`${uid}_${today}`);
    const predSnap = await predRef.get();

    const statsRef = db.collection("nibuichi_user_stats").doc(uid);
    const statsSnap = await statsRef.get();

    const globalRef = db.collection("nibuichi_global_stats").doc("stats");
    const globalSnap = await globalRef.get();

    return {
      todayPrediction: predSnap.exists ? predSnap.data() : null,
      stats: statsSnap.exists ? statsSnap.data() : null,
      global: globalSnap.exists ? globalSnap.data() : null,
    };
  }
);

/**
 * ④ 毎朝6時：前日分の結果を集計・山分け・戦績更新
 * - 前日の日付を対象にする
 * - 結果が未入力ならスキップ（後から入力されたら次の6時に処理）
 */
/**
 * ④ 毎朝6時：前日分の結果を集計・山分け・戦績更新
 * - 累計 / 週間 / 月間 をすべて更新
 */
export const processNibuichiDaily = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "Asia/Tokyo",
    region: "us-central1",
  },
  async () => {
    const now = new Date();

    // 前日
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = yesterday.toISOString().slice(0, 10);

    // ① 前日の結果ドキュメント取得
    const dailyRef = db.collection("nibuichi_daily").doc(dateStr);
    const dailySnap = await dailyRef.get();
    if (!dailySnap.exists) return;

    const daily = dailySnap.data() as any;
    if (daily.processed) return;

    const result = daily.result;
    const rewardPoints = Number(daily.rewardPoints ?? 0);

    // ② 前日の予想を取得
    const predSnap = await db
      .collection("nibuichi_user_predictions")
      .where("date", "==", dateStr)
      .get();

    const preds = predSnap.docs.map((d) => d.data() as any);

    // 正解者
    const winners = preds.filter((p) => p.prediction === result);
    const winnerCount = winners.length;

    let perUserReward = 0;
    if (winnerCount > 0 && rewardPoints > 0) {
      perUserReward = Math.floor(rewardPoints / winnerCount);
    }

    const batches: FirebaseFirestore.WriteBatch[] = [];
    let batch = db.batch();
    let opCount = 0;

    // -----------------------------
    // 週の開始日（月曜）
    // -----------------------------
    const day = yesterday.getDay(); // 0:日〜6:土
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(yesterday);
    monday.setDate(yesterday.getDate() - diffToMonday);
    const weekStartStr = monday.toISOString().slice(0, 10);

    // -----------------------------
    // 月初
    // -----------------------------
    const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    // -----------------------------
    // ③ ユーザー戦績更新
    // -----------------------------
    for (const p of preds) {
      const uid = p.uid;
      const hit = p.prediction === result;

      const userStatsRef = db.collection("nibuichi_user_stats").doc(uid);
      const userRef = db.collection("users").doc(uid);

      const statsSnap = await userStatsRef.get();
      const stats = statsSnap.exists ? statsSnap.data() as any : {};

      // 週リセット
      const needWeeklyReset = stats.lastWeeklyReset !== weekStartStr;

      // 月リセット
      const needMonthlyReset = stats.lastMonthlyReset !== monthStartStr;

      const newWeeklyTotal = needWeeklyReset ? 0 : (stats.weeklyTotal ?? 0);
      const newWeeklyHit = needWeeklyReset ? 0 : (stats.weeklyHit ?? 0);

      const newMonthlyTotal = needMonthlyReset ? 0 : (stats.monthlyTotal ?? 0);
      const newMonthlyHit = needMonthlyReset ? 0 : (stats.monthlyHit ?? 0);

      batch.set(
        userStatsRef,
        {
          // 累計
          total: FieldValue.increment(1),
          hit: hit ? FieldValue.increment(1) : FieldValue.increment(0),

          // 週間
          weeklyTotal: newWeeklyTotal + 1,
          weeklyHit: newWeeklyHit + (hit ? 1 : 0),
          lastWeeklyReset: weekStartStr,

          // 月間
          monthlyTotal: newMonthlyTotal + 1,
          monthlyHit: newMonthlyHit + (hit ? 1 : 0),
          lastMonthlyReset: monthStartStr,
        },
        { merge: true }
      );

      // ポイント付与
      if (hit && perUserReward > 0) {
        batch.update(userRef, {
          points: FieldValue.increment(perUserReward),
        });
      }

      opCount++;
      if (opCount >= 400) {
        batches.push(batch);
        batch = db.batch();
        opCount = 0;
      }
    }

    // daily を processed=true に
    batch.update(dailyRef, { processed: true });

    // 前日の予想を削除
    for (const d of predSnap.docs) {
      batch.delete(d.ref);
      opCount++;
      if (opCount >= 400) {
        batches.push(batch);
        batch = db.batch();
        opCount = 0;
      }
    }

    batches.push(batch);
    await commitBatches(batches);
  }
);


/**
 * ⑤ 総合戦績の手動修正
 * - win / draw / lose / bakuado を管理画面から直接編集
 */
export const editNibuichiGlobalStats = onCall(
  { region: "us-central1" },
  async (request) => {
    const { win, draw, lose, bakuado } = request.data || {};

    if (
      typeof win !== "number" ||
      typeof draw !== "number" ||
      typeof lose !== "number" ||
      typeof bakuado !== "number"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "win / draw / lose / bakuado は数値で指定してください"
      );
    }

    const ref = db.collection("nibuichi_global_stats").doc("stats");

    await ref.set(
      {
        win,
        draw,
        lose,
        bakuado,
      },
      { merge: true }
    );

    return { message: "総合戦績を更新しました" };
  }
);
