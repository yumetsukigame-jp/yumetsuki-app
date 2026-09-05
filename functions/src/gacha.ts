import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { nowJST, getYesterdayJST6 } from "./common/date";
import { normalizeX } from "./common/normalize";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

type GachaFrameInput = {
  label: string;
  maxCount?: number | null;
  probability?: number | null;
  rewardMin: number;
  rewardMax: number;
  shippingEnabled?: boolean;
};

type GachaPoint = {
  cost: number;
  maxPerUser: number;
};

type GachaData = {
  code: string;
  title: string;
  mode: string;
  resetType: string;
  publicFlags: string[];
  thumbnail: string;
  point: GachaPoint;
  frames: GachaFrameInput[];
  totalCount?: number | null;
  createdAt?: unknown;
  expiresAt?: unknown;
  owner: string;
  xAccountList: string[];
};

type GachaFrame = {
  label: string;
  maxCount?: number | null;
  usedCount?: number;
  probability?: number | null;
  rewardMin: number;
  rewardMax: number;
  shippingEnabled?: boolean;
};

type GachaDocument = {
  code: string;
  title: string;
  mode: string;
  resetType: string;
  publicFlags: string[];
  thumbnail?: string;
  point: {
    cost: number;
    maxPerUser: number;
  };
  frames: GachaFrame[];
  totalCount?: number | null;
  expiresAt?: { toDate: () => Date } | null;
  xAccountList?: string[];
};

type GachaResultRow = {
  id: string;
  uid: string;
  code: string;
  title: string;
  frame: string;
  frameName?: string;
  reward: number;
  createdAt: {
    toMillis: () => number;
  };
  thumbnail?: string;
};

async function resetGachaHistoryCounts(
  histories: FirebaseFirestore.QueryDocumentSnapshot[],
  dailyCodes: Set<string>
): Promise<number> {
  const matchingHistories = histories.filter((history) =>
    dailyCodes.has(history.id.split("_")[1])
  );

  for (let index = 0; index < matchingHistories.length; index += 500) {
    const batch = db.batch();
    for (const history of matchingHistories.slice(index, index + 500)) {
      batch.update(history.ref, { count: 0 });
    }
    await batch.commit();
  }

  return matchingHistories.length;
}

function matchesXAccount(gacha: GachaDocument, xAccount: unknown): boolean {
  const userX = normalizeX(
    typeof xAccount === "string" ? xAccount : undefined
  );
  if (!userX) {
    return false;
  }

  return (gacha.xAccountList ?? [])
    .filter((account): account is string => typeof account === "string" && account.includes("@"))
    .map((account) => normalizeX(account))
    .some((account) => account.includes(userX));
}

async function requireAdmin(
  context: functions.https.CallableContext
): Promise<string> {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "ログインが必要です"
    );
  }

  const adminSnap = await db.collection("admins").doc(uid).get();
  if (!adminSnap.exists) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "管理者のみ実行できます"
    );
  }

  return uid;
}

/* ============================================================
   ガチャ機能（v1 化）
============================================================ */

export const createGachaCode = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    try {
      const uid = await requireAdmin(context);

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
        "featured",
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

      const gachaData: GachaData = {
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
        frames: frames.map((f: GachaFrameInput) => ({
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
    } catch (err: unknown) {
      console.error("createGachaCode error:", err);
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "unknown error";
      throw new functions.https.HttpsError("internal", message);
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
        xAccountList: Array.isArray(data.xAccountList)
          ? data.xAccountList.filter((account): account is string => typeof account === "string")
          : [],
      };
    }).filter((gacha) => gacha.publicFlags.includes("public"));
  });

export const unlockGachaCode = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "ログインが必要です");
    }

    const code = typeof data?.code === "string" ? data.code.trim() : "";
    if (!code) {
      throw new functions.https.HttpsError("invalid-argument", "コードが必要です");
    }

    const gachaRef = db.collection("gachaCodes").doc(code);
    const gachaSnap = await gachaRef.get();
    if (!gachaSnap.exists) {
      throw new functions.https.HttpsError("not-found", "ガチャが存在しません");
    }

    const gacha = gachaSnap.data() as GachaDocument;
    if (gacha.expiresAt && gacha.expiresAt.toDate() < nowJST()) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "期限切れのガチャです"
      );
    }

    if (!(gacha.publicFlags ?? []).includes("limited")) {
      return { message: "ガチャを確認しました" };
    }

    const historyRef = db.collection("userGachaHistory").doc(`${uid}_${code}`);
    await db.runTransaction(async (tx) => {
      const historySnap = await tx.get(historyRef);
      if (historySnap.exists) {
        tx.update(historyRef, { unlockedAt: Timestamp.now() });
        return;
      }

      tx.set(historyRef, {
        count: 0,
        unlockedAt: Timestamp.now(),
      });
    });

    return { message: "ガチャを解放しました" };
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

      const gacha = gachaSnap.data() as GachaDocument;
      const flags: string[] = gacha.publicFlags ?? [];

      const now = nowJST();
      if (gacha.expiresAt && gacha.expiresAt.toDate() < now) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "期限切れのガチャです"
        );
      }

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

        if (!normalizeX(userData?.xAccount)) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "このガチャはXアカウント登録者のみ引けます"
          );
        }

        if (!matchesXAccount(gacha, userData?.xAccount)) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "このガチャは指定されたXアカウントのみ引けます"
          );
        }
      }

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

      if (flags.includes("limited") && !historySnap.exists) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "このガチャはコードを入力してから引いてください"
        );
      }

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

      return await db.runTransaction(async (tx) => {
        const freshGachaSnap = await tx.get(gachaRef);
        if (!freshGachaSnap.exists) {
          throw new functions.https.HttpsError(
            "not-found",
            "ガチャが存在しません"
          );
        }
        const freshGacha = freshGachaSnap.data() as GachaDocument;
        if (
          freshGacha.expiresAt &&
          freshGacha.expiresAt.toDate() < nowJST()
        ) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "期限切れのガチャです"
          );
        }
        const freshFrames: GachaFrame[] = freshGacha.frames;

        let selectedFrame: GachaFrame | null = null;

        if (freshGacha.mode === "count") {
          const weights = freshFrames.map(
            (f: GachaFrame) =>
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
          for (let i = 0; i < freshFrames.length; i++) {
            if (r < weights[i]) {
              selectedFrame = freshFrames[i];
              break;
            }
            r -= weights[i];
          }
        } else {
          const probs = freshFrames.map(
            (f: GachaFrame) => f.probability ?? 0
          );
          const totalProb = probs.reduce((a: number, b: number) => a + b, 0);

          let r = Math.random() * totalProb;
          for (let i = 0; i < freshFrames.length; i++) {
            if (r < probs[i]) {
              selectedFrame = freshFrames[i];
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

        const freshUser = (await tx.get(userRef)).data()!;
        const freshPoints = Number(freshUser.points ?? 0);
        if (freshPoints < cost) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "ポイントが不足しています"
          );
        }

        const shouldConfirmXAccount =
          freshGacha.publicFlags.includes("x_account_match") &&
          freshUser.xAccountConfirmed !== true;
        if (
          shouldConfirmXAccount &&
          !matchesXAccount(freshGacha, freshUser.xAccount)
        ) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "Xアカウントの確認が必要です。もう一度お試しください"
          );
        }

        const freshHistorySnap = await tx.get(historyRef);
        const freshHistory = freshHistorySnap.exists
          ? freshHistorySnap.data()!
          : { count: 0 };

        if (
          freshGacha.publicFlags.includes("limited") &&
          !freshHistorySnap.exists
        ) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "このガチャはコードを入力してから引いてください"
          );
        }

        if (
          (freshGacha.resetType === "daily" ||
            freshGacha.resetType === "none") &&
          freshHistory.count >= freshGacha.point.maxPerUser
        ) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            freshGacha.resetType === "daily"
              ? "今日の回数上限です"
              : "上限回数に達しています"
          );
        }

        tx.update(userRef, {
          points: freshPoints - cost + reward,
          ...(shouldConfirmXAccount ? { xAccountConfirmed: true } : {}),
        });

        tx.set(historyRef, {
          count: freshHistory.count + 1,
        });

        if (freshGacha.mode === "count") {
          const chosenLabel = selectedFrame.label;
          const updatedFrames = freshFrames.map((f: GachaFrame) =>
            f.label === chosenLabel
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
          title: freshGacha.title,
          frame: selectedFrame.label,
          reward,
          createdAt: Timestamp.now(),
        });

        return {
          frame: selectedFrame.label,
          reward,
        };
      });
    } catch (err: unknown) {
      console.error("useGachaCode error:", err);
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "unknown error";
      throw new functions.https.HttpsError("internal", message);
    }
  });

export const getGachaResults = functions
  .region("us-east1")
  .https.onCall(async (_data, context) => {
    try {
      await requireAdmin(context);
      const results: GachaResultRow[] = [];

      const gachaSnap = await db.collection("gachaCodes").get();

      for (const gachaDoc of gachaSnap.docs) {
        const code = gachaDoc.id;
        const gachaData = gachaDoc.data() as GachaDocument;

        const resultSnap = await db
          .collection("gachaResults")
          .doc(code)
          .collection("results")
          .orderBy("createdAt", "desc")
          .get();

        for (const r of resultSnap.docs) {
          const data = r.data() as GachaResultRow;
          const { id: _ignoredId, ...restData } = data;

          const frameInfo = gachaData.frames?.find(
            (f: GachaFrame) => f.label === data.frame
          );

          results.push({
            ...restData,
            id: r.id,
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
    } catch (err: unknown) {
      console.error("getGachaResults error:", err);
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "unknown error";
      throw new functions.https.HttpsError("internal", message);
    }
  });

export const resetGachaUsage = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const code = typeof data?.code === "string" ? data.code : "";
    if (!code)
      throw new functions.https.HttpsError(
        "invalid-argument",
        "code が必要です"
      );

    const snap = await db.collection("userGachaHistory").get();

    const batch = db.batch();
    let count = 0;

    for (const d of snap.docs) {
      const id = d.id;
      const parts = id.split("_");
      const codePart = parts[1];

      if (codePart === code) {
        batch.update(d.ref, { count: 0 });
        count++;
      }
    }

    await batch.commit();

    return { message: "リセット完了", count };
  });

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
    for (const d of snap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  });

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

    const historySnap = await db.collection("userGachaHistory").get();
    const dailyCodes = new Set(gachaSnap.docs.map((docSnap) => docSnap.id));
    resetHistoryCount = await resetGachaHistoryCounts(
      historySnap.docs,
      dailyCodes
    );

    for (const docSnap of gachaSnap.docs) {
      await docSnap.ref.update({
        lastResetAt: now,
      });
      resetGachaCount++;
    }

    await db.collection("systemLogs").add({
      type: "dailyReset",
      executedAt: now,
      resetGachaCount,
      resetHistoryCount,
    });

    console.log("=== resetDailyGacha END ===");
  });

export const manualResetDailyGacha = functions
  .region("us-east1")
  .https.onCall(async (_data, context) => {
    await requireAdmin(context);

    const now = Timestamp.now();
    const gachaSnap = await db
      .collection("gachaCodes")
      .where("resetType", "==", "daily")
      .get();
    const dailyCodes = new Set(gachaSnap.docs.map((docSnap) => docSnap.id));

    const historySnap = await db.collection("userGachaHistory").get();
    const resetHistoryCount = await resetGachaHistoryCounts(
      historySnap.docs,
      dailyCodes
    );

    await Promise.all(
      gachaSnap.docs.map((docSnap) =>
        docSnap.ref.update({ lastResetAt: now })
      )
    );

    await db.collection("systemLogs").add({
      type: "dailyReset",
      executedAt: now,
      resetGachaCount: gachaSnap.size,
      resetHistoryCount,
      manual: true,
    });

    return {
      resetGachaCount: gachaSnap.size,
      resetHistoryCount,
    };
  });
