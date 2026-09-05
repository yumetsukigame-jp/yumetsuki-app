import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

async function requireAdmin(
  context: functions.https.CallableContext
): Promise<void> {
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
}

export const confirmQuizAnswer = functions
  .region("us-east1")
  .https.onCall(async (data, context) => {
    try {
      await requireAdmin(context);
      const quizId = data.quizId;
      if (!quizId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "quizId が必要です"
        );
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
        throw new functions.https.HttpsError(
          "failed-precondition",
          "正解が設定されていません"
        );
      }

      const salt = quiz.salt ?? `salt_${quizId}`;
      const thread = quiz.thread ?? `thread_${quizId}`;

      /* --------------------------------------------------
         ★ 全ユーザーの複数回答を取得（重複正解防止）
      -------------------------------------------------- */
      const answersRef = quizRef.collection("answers");
      const usersSnap = await answersRef.get();

      const correctUsers = new Set<string>();

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;

        const itemsSnap = await answersRef
          .doc(uid)
          .collection("items")
          .get();

        itemsSnap.forEach((item) => {
          const ans = item.data().answer;
          if (ans === correctAnswer) {
            correctUsers.add(uid);
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

        await archiveAnswersRef.doc(uid).set({ uid }, { merge: true });

        const itemsSnap = await answersRef
          .doc(uid)
          .collection("items")
          .get();

        for (const item of itemsSnap.docs) {
          await archiveAnswersRef
            .doc(uid)
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

        await answersRef.doc(uid).delete();
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
    } catch (err: unknown) {
      console.error("confirmQuizAnswer ERROR:", err);
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      throw new functions.https.HttpsError("internal", "内部エラーが発生しました");
    }
  });
