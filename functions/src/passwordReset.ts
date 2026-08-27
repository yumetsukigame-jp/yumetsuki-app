import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Timestamp } from "firebase-admin/firestore";
import { createHash } from "crypto";
import sgMail from "@sendgrid/mail";

if (!admin.apps.length) {
  admin.initializeApp();
}

const PASSWORD_RESET_CONTINUE_URL =
  "https://point-app-1f854.firebaseapp.com/login";
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

function isRequestData(value: unknown): value is { email: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    typeof value.email === "string"
  );
}

function emailHash(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

export const sendPasswordResetLink = functions
  .region("us-east1")
  .runWith({ secrets: ["SENDGRID_API_KEY", "SENDGRID_FROM_EMAIL"] })
  .https.onCall(async (data: unknown) => {
    if (!isRequestData(data)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "メールアドレスを入力してください。"
      );
    }

    const email = data.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "メールアドレスの形式を確認してください。"
      );
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      console.error("SendGrid secrets are not configured.");
      throw new functions.https.HttpsError(
        "internal",
        "メール送信の設定に問題があります。"
      );
    }

    try {
      await admin.auth().getUserByEmail(email);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/user-not-found") {
        return { accepted: true };
      }

      console.error("Failed to look up password reset recipient.", error);
      throw new functions.https.HttpsError(
        "internal",
        "メール送信の準備に失敗しました。"
      );
    }

    const requestRef = admin
      .firestore()
      .collection("passwordResetRequests")
      .doc(emailHash(email));
    const canSend = await admin.firestore().runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      const lastRequestedAt = requestSnap.get("lastRequestedAt") as
        | Timestamp
        | undefined;

      if (
        lastRequestedAt &&
        Date.now() - lastRequestedAt.toMillis() < RESET_REQUEST_COOLDOWN_MS
      ) {
        return false;
      }

      transaction.set(requestRef, { lastRequestedAt: Timestamp.now() });
      return true;
    });

    if (!canSend) {
      return { accepted: true };
    }

    try {
      const resetLink = await admin.auth().generatePasswordResetLink(email, {
        url: PASSWORD_RESET_CONTINUE_URL,
      });

      sgMail.setApiKey(apiKey);
      await sgMail.send({
        to: email,
        from: fromEmail,
        subject: "【ゆめつきの書斎】パスワード再設定のご案内",
        text: `パスワードを再設定するには、以下のリンクを開いてください。\n\n${resetLink}\n\nこのメールに心当たりがない場合は、何もせず削除してください。`,
        html: `<p>パスワードを再設定するには、以下のリンクを開いてください。</p><p><a href="${resetLink}">パスワードを再設定する</a></p><p>このメールに心当たりがない場合は、何もせず削除してください。</p>`,
      });
    } catch (error) {
      console.error("Failed to send password reset email.", error);
      throw new functions.https.HttpsError(
        "internal",
        "メール送信に失敗しました。しばらくしてから再度お試しください。"
      );
    }

    return { accepted: true };
  });
