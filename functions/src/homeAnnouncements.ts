import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { recordNewContentAnnouncement } from "./common/archiveAnnouncements";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = getFirestore();

function getAnnouncementTimestamp(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : Timestamp.now();
}

export const announceNewQuiz = functions
  .region("us-east1")
  .firestore.document("quizzes/{quizId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();

    await recordNewContentAnnouncement(db, {
      type: "quiz_new",
      sourceId: context.params.quizId,
      title: typeof data.title === "string" ? data.title : "名称未設定",
      announcedAt: getAnnouncementTimestamp(data.createdAt),
    });
  });

export const announceNewGacha = functions
  .region("us-east1")
  .firestore.document("gachaCodes/{gachaCode}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    const publicFlags = Array.isArray(data.publicFlags)
      ? data.publicFlags
      : [];

    if (!publicFlags.includes("public") || data.restoredAt) {
      return;
    }

    await recordNewContentAnnouncement(db, {
      type: "gacha_new",
      sourceId: context.params.gachaCode,
      title: typeof data.title === "string" ? data.title : "名称未設定",
      announcedAt: getAnnouncementTimestamp(data.createdAt),
    });
  });
