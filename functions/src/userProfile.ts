import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { Timestamp } from "firebase-admin/firestore";
import { createHash } from "crypto";

import { getCalendarDateJST } from "./common/date";
import { normalizeX } from "./common/normalize";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

type ProfileData = {
  name: string;
  displayName: string;
  xAccount: string;
};

function isProfileData(value: unknown): value is ProfileData {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    "xAccount" in value &&
    typeof value.xAccount === "string"
  );
}

function validateProfileData(data: ProfileData): ProfileData {
  const name = data.name.trim();
  const displayName = data.displayName.trim();
  const xAccount = data.xAccount.trim();

  if (!displayName || !xAccount) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "ニックネームとXアカウントを入力してください。"
    );
  }

  if (!xAccount.startsWith("@") || !normalizeX(xAccount)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Xアカウントは @ から入力してください。"
    );
  }

  return { name, displayName, xAccount };
}

function xAccountClaimId(normalizedXAccount: string): string {
  return createHash("sha256").update(normalizedXAccount).digest("hex");
}

async function assertNoExistingXAccount(
  normalizedXAccount: string,
  uid: string
): Promise<void> {
  const users = await db.collection("users").get();
  const duplicate = users.docs.some((user) => {
    const xAccount = user.get("xAccount");
    return (
      user.id !== uid &&
      typeof xAccount === "string" &&
      normalizeX(xAccount) === normalizedXAccount
    );
  });

  if (duplicate) {
    throw new functions.https.HttpsError(
      "already-exists",
      "このXアカウントはすでに登録されています。"
    );
  }
}

async function claimXAccount(
  uid: string,
  xAccount: string,
  previousXAccount: string | undefined,
  writeUserProfile: (transaction: FirebaseFirestore.Transaction) => void,
  administratorOverride = false
): Promise<void> {
  const normalizedXAccount = normalizeX(xAccount);
  if (normalizedXAccount) await assertNoExistingXAccount(normalizedXAccount, uid);

  const claimRef = normalizedXAccount ? db
    .collection("xAccountClaims")
    .doc(xAccountClaimId(normalizedXAccount)) : undefined;
  const previousNormalizedXAccount = normalizeX(previousXAccount);
  const previousClaimRef =
    previousNormalizedXAccount && previousNormalizedXAccount !== normalizedXAccount
      ? db
          .collection("xAccountClaims")
          .doc(xAccountClaimId(previousNormalizedXAccount))
      : undefined;

  await db.runTransaction(async (transaction) => {
    const currentUser = await transaction.get(db.collection("users").doc(uid));
    const claim = claimRef ? await transaction.get(claimRef) : undefined;
    const previousClaim = previousClaimRef
      ? await transaction.get(previousClaimRef)
      : undefined;

    if (normalizeX(currentUser.get("xAccount")) !== normalizeX(previousXAccount)) {
      throw new functions.https.HttpsError("aborted", "Xアカウントが更新されました。再読込してください。");
    }
    if (!administratorOverride && currentUser.get("xAccountConfirmed") === true &&
        normalizeX(currentUser.get("xAccount")) !== normalizedXAccount) {
      throw new functions.https.HttpsError("permission-denied", "確定済みのXアカウントは変更できません。");
    }
    if (claim?.exists && claim.get("uid") !== uid) {
      throw new functions.https.HttpsError(
        "already-exists",
        "このXアカウントはすでに登録されています。"
      );
    }

    writeUserProfile(transaction);
    if (claimRef) transaction.set(claimRef, {
      uid,
      normalizedXAccount,
      updatedAt: Timestamp.now(),
    });

    if (previousClaimRef) {
      if (previousClaim?.get("uid") === uid) {
        transaction.delete(previousClaimRef);
      }
    }
  });
}

function requireUid(context: functions.https.CallableContext): string {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "ログインが必要です。"
    );
  }

  return uid;
}

export const adminUpdateUserXAccount = functions.region("us-east1").https.onCall(async (data, context) => {
  const actor = requireUid(context);
  if (!(await db.collection("admins").doc(actor).get()).exists) {
    throw new functions.https.HttpsError("permission-denied", "管理者のみ実行できます。");
  }
  if (typeof data?.uid !== "string" || !data.uid || data.uid.includes("/") ||
      typeof data?.xAccount !== "string" || data.xAccount.length > 200) {
    throw new functions.https.HttpsError("invalid-argument", "アカウント情報が不正です。");
  }
  const xAccount = data.xAccount.trim();
  if (xAccount && (!xAccount.startsWith("@") || !normalizeX(xAccount))) {
    throw new functions.https.HttpsError("invalid-argument", "Xアカウントは @ から入力してください。");
  }
  const ref = db.collection("users").doc(data.uid), user = await ref.get();
  if (!user.exists) throw new functions.https.HttpsError("not-found", "ユーザーがありません。");
  await claimXAccount(data.uid, xAccount, user.get("xAccount"),
    tx => tx.update(ref, { xAccount, xAccountConfirmed: false }), true);
  return { updated: true };
});

export const adminDeleteUserProfile = functions.region("us-east1").https.onCall(async (data, context) => {
  const actor = requireUid(context);
  if (!(await db.collection("admins").doc(actor).get()).exists) {
    throw new functions.https.HttpsError("permission-denied", "管理者のみ実行できます。");
  }
  if (typeof data?.uid !== "string" || !data.uid || data.uid.includes("/")) {
    throw new functions.https.HttpsError("invalid-argument", "ユーザーIDが不正です。");
  }
  await db.runTransaction(async tx => {
    const ref = db.collection("users").doc(data.uid), user = await tx.get(ref);
    if (!user.exists) return;
    const pending = await tx.get(db.collection("nanikaGachaHistory").doc(data.uid).collection("entries")
      .where("choice", "==", "pending").limit(1));
    if (!pending.empty) {
      throw new functions.https.HttpsError("failed-precondition", "何かの景品ガチャに未確定の受取があります。先に受取方法を確定してください。");
    }
    const normalized = normalizeX(user.get("xAccount"));
    const claimRef = normalized ? db.collection("xAccountClaims").doc(xAccountClaimId(normalized)) : null;
    const claim = claimRef ? await tx.get(claimRef) : null;
    if (claimRef && claim?.get("uid") === data.uid) tx.delete(claimRef);
    tx.delete(ref);
  });
  return { deleted: true };
});

export const createUserProfile = functions
  .region("us-east1")
  .https.onCall(async (data: unknown, context) => {
    const uid = requireUid(context);
    if (!isProfileData(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "プロフィール情報が正しくありません。"
      );
    }

    const profile = validateProfileData(data);
    const userRef = db.collection("users").doc(uid);
    const existingUser = await userRef.get();
    if (existingUser.exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "プロフィールはすでに登録されています。"
      );
    }

    await claimXAccount(uid, profile.xAccount, undefined, (transaction) => {
      const now = Timestamp.now();
      const loginDate = getCalendarDateJST(now.toDate());

      transaction.create(userRef, {
        email: context.auth?.token.email ?? "",
        ...profile,
        points: 0,
        createdAt: now,
        lastLogin: now,
        loginDates: [loginDate],
        totalLoginDays: 1,
        xAccountConfirmed: false,
      });
    });

    return { created: true };
  });

export const updateUserProfile = functions
  .region("us-east1")
  .https.onCall(async (data: unknown, context) => {
    const uid = requireUid(context);
    if (!isProfileData(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "プロフィール情報が正しくありません。"
      );
    }

    const profile = validateProfileData(data);
    const userRef = db.collection("users").doc(uid);
    const user = await userRef.get();
    if (!user.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "プロフィールが見つかりません。"
      );
    }

    const previousXAccount = user.get("xAccount");
    const xAccountConfirmed = user.get("xAccountConfirmed") === true;
    if (
      xAccountConfirmed &&
      normalizeX(previousXAccount) !== normalizeX(profile.xAccount)
    ) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "確定済みのXアカウントは変更できません。"
      );
    }

    await claimXAccount(
      uid,
      profile.xAccount,
      previousXAccount,
      (transaction) => transaction.update(userRef, profile)
    );

    return { updated: true };
  });

export const syncUserEmail = functions
  .region("us-east1")
  .https.onCall(async (_data: unknown, context) => {
    const uid = requireUid(context);
    const authUser = await admin.auth().getUser(uid);
    if (!authUser.email) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "メールアドレスが設定されていません。"
      );
    }

    const userRef = db.collection("users").doc(uid);
    const user = await userRef.get();
    if (!user.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "プロフィールが見つかりません。"
      );
    }

    await userRef.update({ email: authUser.email });
    return { updated: true, email: authUser.email };
  });

export const recordDailyLogin = functions
  .region("us-east1")
  .https.onCall(async (_data: unknown, context) => {
    const uid = requireUid(context);
    const userRef = db.collection("users").doc(uid);
    const now = Timestamp.now();
    const loginDate = getCalendarDateJST(now.toDate());

    const totalLoginDays = await db.runTransaction(async (transaction) => {
      const user = await transaction.get(userRef);
      if (!user.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "プロフィールが見つかりません。"
        );
      }

      const storedDates = user.get("loginDates");
      const loginDates = Array.isArray(storedDates)
        ? Array.from(
            new Set(
              storedDates.filter(
                (date): date is string => typeof date === "string"
              )
            )
          )
        : [];

      const previousLastLogin = user.get("lastLogin");
      if (loginDates.length === 0 && previousLastLogin instanceof Timestamp) {
        loginDates.push(getCalendarDateJST(previousLastLogin.toDate()));
      }

      if (!loginDates.includes(loginDate)) {
        loginDates.push(loginDate);
      }

      transaction.update(userRef, {
        lastLogin: now,
        loginDates,
        totalLoginDays: loginDates.length,
      });

      return loginDates.length;
    });

    return {
      recorded: true,
      loginDate,
      totalLoginDays,
    };
  });
