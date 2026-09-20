import {
  doc,
  type DocumentReference,
  runTransaction,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/firebase";

const ANNOUNCEMENT_LIMIT = 100;
const ANNOUNCEMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const announcementRef = doc(db, "homeAnnouncements", "archiveUpdates");

export type ArchiveAnnouncementType = "quiz" | "gacha";
type AnnouncementType = ArchiveAnnouncementType | "gacha_win";

type ArchiveAnnouncementInput = {
  type: ArchiveAnnouncementType;
  sourceId: string;
  title: string;
  archivedAt: Date;
};

type StoredAnnouncement = {
  id: string;
  type: AnnouncementType;
  sourceId: string;
  title: string;
  archivedAt: Timestamp;
  frame?: string;
  gachaCode?: string;
  winnerNickname?: string;
  winnerXAccount?: string;
};

function isStoredAnnouncement(value: unknown): value is StoredAnnouncement {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.type === "quiz" ||
      item.type === "gacha" ||
      item.type === "gacha_win") &&
    typeof item.sourceId === "string" &&
    typeof item.title === "string" &&
    item.archivedAt instanceof Timestamp &&
    (item.type !== "gacha_win" ||
      (typeof item.frame === "string" &&
        typeof item.gachaCode === "string"))
  );
}

export async function finalizeArchiveWithAnnouncement(
  sourceRef: DocumentReference,
  input: ArchiveAnnouncementInput
): Promise<void> {
  const id = `${input.type}_${input.sourceId}`;

  await runTransaction(db, async (transaction) => {
    const [sourceSnapshot, announcementSnapshot] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(announcementRef),
    ]);
    if (!sourceSnapshot.exists()) {
      throw new Error(`Archive source does not exist: ${sourceRef.path}`);
    }

    const storedItems = announcementSnapshot.get("items");
    const currentItems = Array.isArray(storedItems)
      ? storedItems
          .filter(isStoredAnnouncement)
          .filter(
            (current) =>
              current.archivedAt.toMillis() >=
              Date.now() - ANNOUNCEMENT_RETENTION_MS
          )
      : [];

    const item: StoredAnnouncement = {
      id,
      type: input.type,
      sourceId: input.sourceId,
      title: input.title.trim() || "名称未設定",
      archivedAt: Timestamp.fromDate(input.archivedAt),
    };

    transaction.set(
      announcementRef,
      {
        items: [
          item,
          ...currentItems.filter((current) => current.id !== id),
        ].slice(0, ANNOUNCEMENT_LIMIT),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    transaction.delete(sourceRef);
  });
}

export async function finalizeRestoreAndRemoveAnnouncement(
  archiveRef: DocumentReference,
  type: ArchiveAnnouncementType,
  sourceId: string
): Promise<void> {
  const id = `${type}_${sourceId}`;

  await runTransaction(db, async (transaction) => {
    const [archiveSnapshot, announcementSnapshot] = await Promise.all([
      transaction.get(archiveRef),
      transaction.get(announcementRef),
    ]);
    if (!archiveSnapshot.exists()) {
      throw new Error(`Archive source does not exist: ${archiveRef.path}`);
    }

    const storedItems = announcementSnapshot.get("items");
    const currentItems = Array.isArray(storedItems)
      ? storedItems
          .filter(isStoredAnnouncement)
          .filter(
            (item) =>
              item.archivedAt.toMillis() >=
              Date.now() - ANNOUNCEMENT_RETENTION_MS
          )
      : [];

    transaction.set(
      announcementRef,
      {
        items: currentItems.filter((item) => item.id !== id),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    transaction.delete(archiveRef);
  });
}
