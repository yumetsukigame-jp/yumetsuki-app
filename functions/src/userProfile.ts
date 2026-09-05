import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import { createHash } from "crypto";

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

  if (!name || !displayName || !xAccount) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "すべての項目を入力してください。"
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
  writeUserProfile: (transaction: FirebaseFirestore.Transaction) => void
): Promise<void> {
  const normalizedXAccount = normalizeX(xAccount);
  await assertNoExistingXAccount(normalizedXAccount, uid);

  const claimRef = db
    .collection("xAccountClaims")
    .doc(xAccountClaimId(normalizedXAccount));
  const previousNormalizedXAccount = normalizeX(previousXAccount);
  const previousClaimRef =
    previousNormalizedXAccount && previousNormalizedXAccount !== normalizedXAccount
      ? db
          .collection("xAccountClaims")
          .doc(xAccountClaimId(previousNormalizedXAccount))
      : undefined;

  await db.runTransaction(async (transaction) => {
    const claim = await transaction.get(claimRef);
    if (claim.exists && claim.get("uid") !== uid) {
      throw new functions.https.HttpsError(
        "already-exists",
        "このXアカウントはすでに登録されています。"
      );
    }

    writeUserProfile(transaction);
    transaction.set(claimRef, {
      uid,
      normalizedXAccount,
      updatedAt: Timestamp.now(),
    });

    if (previousClaimRef) {
      const previousClaim = await transaction.get(previousClaimRef);
      if (previousClaim.get("uid") === uid) {
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
      transaction.create(userRef, {
        email: context.auth?.token.email ?? "",
        ...profile,
        points: 0,
        createdAt: Timestamp.now(),
        lastLogin: Timestamp.now(),
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
