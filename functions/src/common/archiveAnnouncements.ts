import { Timestamp } from "firebase-admin/firestore";

const ANNOUNCEMENT_LIMIT = 100;
const ANNOUNCEMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ANNOUNCEMENT_COLLECTION = "homeAnnouncements";
const ANNOUNCEMENT_DOCUMENT = "archiveUpdates";

type ArchiveAnnouncementType = "quiz" | "gacha";
type AnnouncementType = ArchiveAnnouncementType | "gacha_win";

type ArchiveAnnouncementInput = {
  type: ArchiveAnnouncementType;
  sourceId: string;
  title: string;
  archivedAt: Timestamp;
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

export function getHomeAnnouncementRef(
  db: FirebaseFirestore.Firestore
): FirebaseFirestore.DocumentReference {
  return db
    .collection(ANNOUNCEMENT_COLLECTION)
    .doc(ANNOUNCEMENT_DOCUMENT);
}

export function recordGachaWinAnnouncementInTransaction(
  transaction: FirebaseFirestore.Transaction,
  announcementRef: FirebaseFirestore.DocumentReference,
  announcementSnapshot: FirebaseFirestore.DocumentSnapshot,
  input: {
    resultId: string;
    gachaCode: string;
    title: string;
    frame: string;
    announcedAt: Timestamp;
    winnerNickname: string;
    winnerXAccount: string;
  }
): void {
  const storedItems = announcementSnapshot.get("items");
  const currentItems = Array.isArray(storedItems)
    ? storedItems
        .filter(isStoredAnnouncement)
        .filter(
          (current) =>
            current.archivedAt.toMillis() >=
            input.announcedAt.toMillis() - ANNOUNCEMENT_RETENTION_MS
        )
    : [];
  const id = `gacha_win_${input.resultId}`;
  const item: StoredAnnouncement = {
    id,
    type: "gacha_win",
    sourceId: input.resultId,
    title: input.title.trim() || "名称未設定",
    frame: input.frame,
    gachaCode: input.gachaCode,
    winnerNickname: input.winnerNickname,
    winnerXAccount: input.winnerXAccount,
    archivedAt: input.announcedAt,
  };

  transaction.set(
    announcementRef,
    {
      items: [
        item,
        ...currentItems.filter((current) => current.id !== id),
      ].slice(0, ANNOUNCEMENT_LIMIT),
      updatedAt: input.announcedAt,
    },
    { merge: true }
  );
}

export async function finalizeArchiveWithAnnouncement(
  db: FirebaseFirestore.Firestore,
  sourceRef: FirebaseFirestore.DocumentReference,
  input: ArchiveAnnouncementInput
): Promise<void> {
  const announcementRef = getHomeAnnouncementRef(db);
  const id = `${input.type}_${input.sourceId}`;

  await db.runTransaction(async (transaction) => {
    const [sourceSnapshot, announcementSnapshot] = await Promise.all([
      transaction.get(sourceRef),
      transaction.get(announcementRef),
    ]);
    if (!sourceSnapshot.exists) {
      throw new Error(`Archive source does not exist: ${sourceRef.path}`);
    }

    const storedItems = announcementSnapshot.get("items");
    const currentItems = Array.isArray(storedItems)
      ? storedItems
          .filter(isStoredAnnouncement)
          .filter(
            (current) =>
              current.archivedAt.toMillis() >=
              Timestamp.now().toMillis() - ANNOUNCEMENT_RETENTION_MS
          )
      : [];

    const item: StoredAnnouncement = {
      id,
      type: input.type,
      sourceId: input.sourceId,
      title: input.title.trim() || "名称未設定",
      archivedAt: input.archivedAt,
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
