import * as functions from "firebase-functions";
import { Resend } from "resend";

function isTestEmailData(value: unknown): value is { to: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "to" in value &&
    typeof value.to === "string"
  );
}

// Resend移行後の疎通確認用。ログイン済みユーザーであれば誰でも呼び出せる（既存関数と同水準の認可）。
export const sendTestResendEmail = functions
  .region("us-east1")
  .runWith({ secrets: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] })
  .https.onCall(async (data: unknown, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "ログインが必要です"
      );
    }

    if (!isTestEmailData(data) || !data.to.trim()) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "送信先メールアドレスを指定してください。"
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      console.error("Resend secrets are not configured.");
      throw new functions.https.HttpsError(
        "internal",
        "メール送信の設定に問題があります。"
      );
    }

    try {
      const resend = new Resend(apiKey);
      const { data: sendResult, error } = await resend.emails.send({
        to: data.to.trim(),
        from: fromEmail,
        subject: "【ゆめつきの書斎】Resend疎通確認メール",
        text: "このメールはResend経由の送信テストです。正常に届いていれば設定は完了しています。",
        html: "<p>このメールはResend経由の送信テストです。正常に届いていれば設定は完了しています。</p>",
      });
      if (error) {
        throw error;
      }
      return { accepted: true, id: sendResult?.id ?? null };
    } catch (error) {
      console.error("Failed to send test email via Resend.", error);
      throw new functions.https.HttpsError(
        "internal",
        "テストメールの送信に失敗しました。"
      );
    }
  });
