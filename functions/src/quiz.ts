import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

import { finalizeArchiveWithAnnouncement } from "./common/archiveAnnouncements";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();
const WRITE_BATCH_SIZE = 400;
const READ_CONCURRENCY = 20;
const FINALIZATION_LOCK_MS = 10 * 60 * 1000;

type AnswerGroup = {
  uid: string;
  parentData: FirebaseFirestore.DocumentData;
  items: Array<{
    id: string;
    data: FirebaseFirestore.DocumentData;
  }>;
};

type BatchOperation = (batch: FirebaseFirestore.WriteBatch) => void;

async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    results.push(...(await Promise.all(chunk.map(mapper))));
  }

  return results;
}

async function commitInBatches(operations: BatchOperation[]): Promise<void> {
  for (let index = 0; index < operations.length; index += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    operations
      .slice(index, index + WRITE_BATCH_SIZE)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

async function loadAnswerGroups(
  answerUsers: FirebaseFirestore.QueryDocumentSnapshot[],
  answersRef: FirebaseFirestore.CollectionReference
): Promise<AnswerGroup[]> {
  return mapInChunks(answerUsers, READ_CONCURRENCY, async (userDocument) => {
    const itemsSnapshot = await answersRef
      .doc(userDocument.id)
      .collection("items")
      .get();

    return {
      uid: userDocument.id,
      parentData: userDocument.data(),
      items: itemsSnapshot.docs.map((item) => ({
        id: item.id,
        data: item.data(),
      })),
    };
  });
}

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
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    let lockAcquired = false;
    let finalizationLockId: string | undefined;
    let quizRef: FirebaseFirestore.DocumentReference | undefined;

    try {
      await requireAdmin(context);
      const quizId =
        typeof data?.quizId === "string" ? data.quizId.trim() : "";
      if (!quizId) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "quizId が必要です"
        );
      }

      quizRef = db.collection("quizzes").doc(quizId);
      finalizationLockId = `${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}`;
      const quiz = await db.runTransaction(async (transaction) => {
        const quizSnapshot = await transaction.get(quizRef!);
        if (!quizSnapshot.exists) {
          throw new functions.https.HttpsError(
            "not-found",
            "クイズが存在しません"
          );
        }

        const quizData = quizSnapshot.data()!;
        const finalizationStartedAt = quizData.finalizationStartedAt;
        const lockIsActive =
          quizData.finalizationStatus === "processing" &&
          finalizationStartedAt instanceof Timestamp &&
          Date.now() - finalizationStartedAt.toMillis() <
            FINALIZATION_LOCK_MS;

        if (quizData.finalizationStatus === "deleting") {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "このクイズは削除処理中です"
          );
        }

        if (lockIsActive) {
          throw new functions.https.HttpsError(
            "aborted",
            "このクイズは現在解答確定処理中です。完了までお待ちください。"
          );
        }

        transaction.update(quizRef!, {
          finalizationStatus: "processing",
          finalizationLockId,
          finalizationStartedAt: Timestamp.now(),
          finalizationError: FieldValue.delete(),
          answersClosedAt:
            quizData.answersClosedAt instanceof Timestamp
              ? quizData.answersClosedAt
              : Timestamp.now(),
        });

        return quizData;
      });
      lockAcquired = true;

      const correctAnswer = quiz.answer;
      const parsedRewardPoint = Number(quiz.rewardPoint ?? 0);
      const rewardPoint =
        Number.isFinite(parsedRewardPoint) && parsedRewardPoint > 0
          ? parsedRewardPoint
          : 0;
      const explanation = quiz.explanation ?? "";

      if (!correctAnswer) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "正解が設定されていません"
        );
      }

      const salt = quiz.salt ?? `salt_${quizId}`;
      const thread = quiz.thread ?? `thread_${quizId}`;
      const archiveRef = db.collection("quizzes_archive").doc(quizId);
      const archiveAnswersRef = archiveRef.collection("answers");
      const archiveSnapshot = await archiveRef.get();
      const finalizationPrepared =
        archiveSnapshot.get("finalizationPrepared") === true;

      /* --------------------------------------------------
         ★ 未削除の回答を取得
      -------------------------------------------------- */
      const answersRef = quizRef.collection("answers");
      const usersSnap = await answersRef.get();
      const sourceAnswerGroups = await loadAnswerGroups(
        usersSnap.docs,
        answersRef
      );
      let finalizedAnswerGroups = sourceAnswerGroups;
      let archivedAt = Timestamp.now();

      if (finalizationPrepared) {
        const archiveUsersSnapshot = await archiveAnswersRef.get();
        finalizedAnswerGroups = await loadAnswerGroups(
          archiveUsersSnapshot.docs,
          archiveAnswersRef
        );
        const storedArchivedAt = archiveSnapshot.get("archivedAt");
        if (storedArchivedAt instanceof Timestamp) {
          archivedAt = storedArchivedAt;
        }
      }

      const correctUsers = new Set(
        finalizedAnswerGroups
          .filter((group) =>
            group.items.some((item) => item.data.answer === correctAnswer)
          )
          .map((group) => group.uid)
      );

      const correctUserList = Array.from(correctUsers);

      /* --------------------------------------------------
         ★ 山分けポイント計算
      -------------------------------------------------- */
      const storedRewardPerUser = archiveSnapshot.get("rewardPerUser");
      const perUser =
        finalizationPrepared && typeof storedRewardPerUser === "number"
          ? storedRewardPerUser
          : correctUserList.length > 0
            ? Math.floor(rewardPoint / correctUserList.length)
            : 0;

      /* --------------------------------------------------
         ★ 確定時点の回答をアーカイブへ固定
      -------------------------------------------------- */
      if (!finalizationPrepared) {
        await archiveRef.set({
          ...quiz,
          explanation,
          salt,
          thread,
          archived: true,
          archivedAt,
          finalizationStatus: "preparing",
        });

        const archiveOperations: BatchOperation[] = [];
        finalizedAnswerGroups.forEach((group) => {
          archiveOperations.push((batch) =>
            batch.set(
              archiveAnswersRef.doc(group.uid),
              { uid: group.uid, ...group.parentData },
              { merge: true }
            )
          );
          group.items.forEach((item) => {
            archiveOperations.push((batch) =>
              batch.set(
                archiveAnswersRef
                  .doc(group.uid)
                  .collection("items")
                  .doc(item.id),
                item.data
              )
            );
          });
        });
        await commitInBatches(archiveOperations);
        await archiveRef.set(
          {
            finalizationPrepared: true,
            finalizationStatus: "prepared",
            correctUserCount: correctUserList.length,
            rewardPerUser: perUser,
            preparedAt: Timestamp.now(),
          },
          { merge: true }
        );
      }

      /* --------------------------------------------------
         ★ 正解者へ再実行安全なポイント付与
      -------------------------------------------------- */
      await mapInChunks(
        correctUserList,
        READ_CONCURRENCY,
        async (uid) => {
          const userRef = db.collection("users").doc(uid);
          const awardRef = archiveRef.collection("rewardAwards").doc(uid);

          await db.runTransaction(async (transaction) => {
            const [awardSnapshot, userSnapshot] = await Promise.all([
              transaction.get(awardRef),
              transaction.get(userRef),
            ]);

            if (awardSnapshot.exists) return;

            if (!userSnapshot.exists) {
              transaction.set(awardRef, {
                uid,
                status: "skipped_missing_user",
                amount: 0,
                createdAt: Timestamp.now(),
              });
              return;
            }

            if (perUser > 0) {
              transaction.update(userRef, {
                points: FieldValue.increment(perUser),
              });
            }
            transaction.set(awardRef, {
              uid,
              status: "awarded",
              amount: perUser,
              createdAt: Timestamp.now(),
            });
          });
        }
      );

      /* --------------------------------------------------
         ★ 元の回答を500件未満ずつ削除
      -------------------------------------------------- */
      const deleteOperations: BatchOperation[] = [];
      sourceAnswerGroups.forEach((group) => {
        group.items.forEach((item) => {
          deleteOperations.push((batch) => {
            batch.delete(
              answersRef.doc(group.uid).collection("items").doc(item.id)
            );
          });
        });
        deleteOperations.push((batch) => {
          batch.delete(answersRef.doc(group.uid));
        });
      });
      await commitInBatches(deleteOperations);

      await archiveRef.set(
        {
          finalizationStatus: "completed",
          finalizedAt: Timestamp.now(),
          correctUserCount: correctUserList.length,
          rewardPerUser: perUser,
        },
        { merge: true }
      );

      /* --------------------------------------------------
         ★ 最後にクイズ本体を削除
      -------------------------------------------------- */
      await finalizeArchiveWithAnnouncement(db, quizRef, {
        type: "quiz",
        sourceId: quizId,
        title: typeof quiz.title === "string" ? quiz.title : "名称未設定",
        archivedAt,
      });

      return {
        success: true,
        correctUserCount: correctUserList.length,
        perUser,
        salt,
        thread,
      };
    } catch (err: unknown) {
      console.error("confirmQuizAnswer error:", err);

      const message =
        err instanceof Error ? err.message : "内部エラーが発生しました";
      if (lockAcquired && finalizationLockId && quizRef) {
        try {
          await db.runTransaction(async (transaction) => {
            const quizSnapshot = await transaction.get(quizRef!);
            if (
              quizSnapshot.exists &&
              quizSnapshot.get("finalizationLockId") ===
                finalizationLockId
            ) {
              transaction.set(
                quizRef!,
                {
                  finalizationStatus: "failed",
                  finalizationError: message,
                  finalizationUpdatedAt: Timestamp.now(),
                },
                { merge: true }
              );
            }
          });
        } catch (statusError) {
          console.error(
            "confirmQuizAnswer failed status update:",
            statusError
          );
        }
      }

      if (err instanceof functions.https.HttpsError) {
        throw err;
      }
      throw new functions.https.HttpsError("internal", message);
    }
  });

export const deleteActiveQuiz = functions
  .region("us-east1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const quizId =
      typeof data?.quizId === "string" ? data.quizId.trim() : "";
    if (!quizId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "quizId が必要です"
      );
    }

    const quizRef = db.collection("quizzes").doc(quizId);
    await db.runTransaction(async (transaction) => {
      const quizSnapshot = await transaction.get(quizRef);
      if (!quizSnapshot.exists) return;

      const status = quizSnapshot.get("finalizationStatus");
      if (
        status !== "deleting" &&
        (quizSnapshot.get("answersClosedAt") || status)
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "解答確定開始後のクイズは削除できません"
        );
      }

      transaction.update(quizRef, {
        finalizationStatus: "deleting",
        answersClosedAt: Timestamp.now(),
      });
    });

    await db.recursiveDelete(quizRef);
    return { success: true };
  });

export const deleteQuizArchive = functions
  .region("us-east1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    await requireAdmin(context);
    const quizId =
      typeof data?.quizId === "string" ? data.quizId.trim() : "";
    if (!quizId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "quizId が必要です"
      );
    }

    const archiveRef = db.collection("quizzes_archive").doc(quizId);
    await db.runTransaction(async (transaction) => {
      const archiveSnapshot = await transaction.get(archiveRef);
      if (!archiveSnapshot.exists) return;

      const status = archiveSnapshot.get("finalizationStatus");
      if (status === "preparing" || status === "prepared") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "解答確定処理中のアーカイブは削除できません"
        );
      }

      transaction.set(
        archiveRef,
        { finalizationStatus: "deleting" },
        { merge: true }
      );
    });

    await db.recursiveDelete(archiveRef);
    return { success: true };
  });
