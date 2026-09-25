import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type CodeType = "global" | "perUser" | "limited";

function getCodeType(value: unknown): CodeType {
  if (value === "global" || value === "limited") return value;
  return "perUser";
}

function getCode(data: unknown): string {
  return typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
    ? data.code.trim()
    : "";
}

export const getPointCodePreview = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    const code = getCode(data);
    if (!code) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "コードを入力してください"
      );
    }

    const codeSnapshot = await db.collection("validCodes").doc(code).get();
    if (!codeSnapshot.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "無効なコードです"
      );
    }

    const codeData = codeSnapshot.data()!;
    const type = getCodeType(codeData.type);
    const usedKey = type === "global" ? code : `${uid}_${code}`;
    const [historySnapshot, currentUserUsage] = await Promise.all([
      db.collection("pointHistory").where("code", "==", code).get(),
      db.collection("usedCodes").doc(usedKey).get(),
    ]);

    const userIds = Array.from(
      new Set(
        historySnapshot.docs
          .map((historyDoc) => historyDoc.get("userId"))
          .filter((userId): userId is string => typeof userId === "string")
      )
    );
    const userSnapshots =
      userIds.length > 0
        ? await db.getAll(
            ...userIds.map((userId) => db.collection("users").doc(userId))
          )
        : [];
    const users = userIds.map((userId, index) => {
      const userData = userSnapshots[index]?.data();
      return {
        uid: userId,
        displayName:
          typeof userData?.displayName === "string"
            ? userData.displayName
            : "名称未登録",
        xAccount:
          typeof userData?.xAccount === "string"
            ? userData.xAccount
            : "Xアカウント未登録",
      };
    });

    const maxUses =
      type === "limited" &&
      Number.isInteger(Number(codeData.maxUses)) &&
      Number(codeData.maxUses) > 0
        ? Number(codeData.maxUses)
        : null;
    const recordedUsedCount = Math.max(0, Number(codeData.usedCount) || 0);

    return {
      code,
      points: Number(codeData.points) || 0,
      type,
      maxUses,
      usedCount:
        type === "limited"
          ? recordedUsedCount
          : Math.max(users.length, currentUserUsage.exists ? 1 : 0),
      alreadyUsed: currentUserUsage.exists,
      users,
    };
  });

export const redeemPointCode = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    const code = getCode(data);
    if (!code) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "コードを入力してください"
      );
    }

    const codeRef = db.collection("validCodes").doc(code);
    const userRef = db.collection("users").doc(uid);
    const historyRef = db.collection("pointHistory").doc();

    return db.runTransaction(async (transaction) => {
      const [codeSnapshot, userSnapshot] = await Promise.all([
        transaction.get(codeRef),
        transaction.get(userRef),
      ]);

      if (!codeSnapshot.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "無効なコードです"
        );
      }
      if (!userSnapshot.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "ユーザー情報が見つかりません"
        );
      }

      const codeData = codeSnapshot.data()!;
      const userData = userSnapshot.data()!;
      const type = getCodeType(codeData.type);
      const usedKey = type === "global" ? code : `${uid}_${code}`;
      const usedRef = db.collection("usedCodes").doc(usedKey);
      const usedSnapshot = await transaction.get(usedRef);

      if (usedSnapshot.exists) {
        throw new functions.https.HttpsError(
          "already-exists",
          "このコードはすでに使用されています"
        );
      }

      if (
        typeof userData.xAccount !== "string" ||
        userData.xAccount.trim() === ""
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Xアカウントが未登録です",
          { reason: "x-account-required" }
        );
      }

      const points = Number(codeData.points);
      if (!Number.isFinite(points) || points <= 0) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "コードの付与ポイントが不正です"
        );
      }

      const usedCount = Number(codeData.usedCount) || 0;
      if (type === "limited") {
        const maxUses = Number(codeData.maxUses);
        if (
          !Number.isInteger(maxUses) ||
          maxUses <= 0 ||
          usedCount >= maxUses
        ) {
          throw new functions.https.HttpsError(
            "resource-exhausted",
            "このコードは使用可能人数に達しています"
          );
        }
      }

      transaction.update(userRef, {
        points: admin.firestore.FieldValue.increment(points),
      });
      transaction.set(usedRef, {
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        userId: uid,
        code,
        type,
      });
      transaction.set(historyRef, {
        userId: uid,
        code,
        added: points,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (type === "limited") {
        transaction.update(codeRef, {
          usedCount: usedCount + 1,
        });
      }

      return { points };
    });
  });
