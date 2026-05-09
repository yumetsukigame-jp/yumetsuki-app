import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();
const db = getFirestore();

/**
 * ランダムコード生成
 */
function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * ガチャ作成（公開 / 限定 対応）
 */
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
        publicFlag, // ★ 追加
      } = request.data;

      if (!title) throw new HttpsError("invalid-argument", "title が必要です");
      if (!mode) throw new HttpsError("invalid-argument", "mode が必要です");
      if (!point) throw new HttpsError("invalid-argument", "point が必要です");
      if (!frames || !Array.isArray(frames)) {
        throw new HttpsError("invalid-argument", "frames が不正です");
      }

      const code = generateCode();

      const gachaData = {
        code,
        title,
        mode,
        public: publicFlag ?? false, // ★ 追加（デフォルトは限定）
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

/**
 * 公開ガチャ一覧（公開ガチャのみ）
 */
export const getPublicGachaList = onCall(
  { region: "us-central1" },
  async () => {
    const snap = await db
      .collection("gachaCodes")
      .where("public", "==", true)
      .orderBy("createdAt", "desc")
      .get();

    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
);

/**
 * ガチャ実行（変更なし）
 */
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
      if (!gachaSnap.exists) throw new HttpsError("not-found", "ガチャが存在しません");

      const gacha: any = gachaSnap.data();

      // 期限チェック
      if (gacha.expiresAt && gacha.expiresAt.toDate() < new Date()) {
        throw new HttpsError("failed-precondition", "期限切れのガチャです");
      }

      // ユーザー情報
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      const user = userSnap.data()!;

      const cost = gacha.point.cost;
      const maxPerUser = gacha.point.maxPerUser;

      // ポイントチェック
      if ((user.points ?? 0) < cost) {
        throw new HttpsError("failed-precondition", "ポイントが不足しています");
      }

      // 履歴チェック
      const historyRef = db.collection("userGachaHistory").doc(`${uid}_${code}`);
      const historySnap = await historyRef.get();
      const history = historySnap.exists ? historySnap.data()! : { count: 0 };

      if (history.count >= maxPerUser) {
        throw new HttpsError("failed-precondition", "これ以上引けません");
      }

      // 抽選処理
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

      // 報酬
      const reward =
        Math.floor(
          Math.random() *
            (selectedFrame.rewardMax - selectedFrame.rewardMin + 1)
        ) + selectedFrame.rewardMin;

      // Firestore 更新（トランザクション）
      await db.runTransaction(async (tx) => {
        const freshUser = (await tx.get(userRef)).data()!;
        const freshHistorySnap = await tx.get(historyRef);
        const freshHistory = freshHistorySnap.exists
          ? freshHistorySnap.data()!
          : { count: 0 };

        if ((freshUser.points ?? 0) < cost) {
          throw new HttpsError("failed-precondition", "ポイントが不足しています");
        }

        if (freshHistory.count >= maxPerUser) {
          throw new HttpsError("failed-precondition", "これ以上引けません");
        }

        // ポイント減算
        tx.update(userRef, {
          points: (freshUser.points ?? 0) - cost,
        });

        // 履歴更新
        tx.set(historyRef, {
          count: freshHistory.count + 1,
        });

        // 枠の使用数更新
        const updatedFrames = gacha.frames.map((f: any) =>
          f.label === selectedFrame.label
            ? { ...f, usedCount: (f.usedCount ?? 0) + 1 }
            : f
        );

        tx.update(gachaRef, { frames: updatedFrames });

        // 結果保存
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

/**
 * ガチャ結果一覧
 */
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

        const codeSnap = await db.collection("gachaCodes").doc(data.code).get();
        const codeData = codeSnap.data();

        const frameInfo = codeData?.frames?.find(
          (f: any) => f.label === data.frame
        );

        results.push({
          id: d.id,
          ...data,
          title: codeData?.title ?? "（名前なし）",
          frameName: frameInfo?.label ?? data.frame,
        });
      }

      return results;
    } catch (err: any) {
      console.error("getGachaResults error:", err);
      throw new HttpsError("internal", err.message || "unknown error");
    }
  }
);

/**
 * 期限切れガチャ削除
 */
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
