import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket("point-app-1f854.firebasestorage.app");
const allowedImageFolders = new Set([
  "gacha/regular",
  "gacha/event",
  "banners",
  "icons",
  "questicon",
  "character-select",
  "rewards",
  "memories",
  "orica",
  "quiz",
  "misc",
]);

type ImageMetadata = {
  folder?: string;
  prefix?: string;
  originalName?: string;
};

function imageMetadataFrom(value: unknown): ImageMetadata {
  if (typeof value !== "object" || value === null) {
    return {};
  }

  const metadata = value as Record<string, unknown>;
  return {
    folder: typeof metadata.folder === "string" ? metadata.folder : undefined,
    prefix: typeof metadata.prefix === "string" ? metadata.prefix : undefined,
    originalName:
      typeof metadata.originalName === "string"
        ? metadata.originalName
        : undefined,
  };
}

export const processImage = onObjectFinalized(
  { region: "us-east1" },
  async (event) => {
    try {
      const object = event.data;
      const filePath = object.name;

      if (!filePath || !filePath.startsWith("rawUploads/")) return;

      let metadata = imageMetadataFrom(object.metadata);
      if (!metadata.folder && !metadata.prefix && !metadata.originalName) {
        const idx = filePath.indexOf("?meta=");
        if (idx !== -1) {
          const encoded = filePath.substring(idx + 6);
          metadata = imageMetadataFrom(JSON.parse(decodeURIComponent(encoded)));
        }
      }

      const folder = metadata.folder || "misc";
      const prefix = metadata.prefix || "";
      const originalName = metadata.originalName || "unknown";

      const baseName = originalName.replace(/\.[^/.]+$/, "");
      const newFileName = `${prefix}${baseName}.webp`;

      const outputPath = `images/${folder}/${newFileName}`;

      const tempFilePath = path.join(os.tmpdir(), uuidv4());
      const file = bucket.file(filePath);

      await file.download({ destination: tempFilePath });

      const processedBuffer = await sharp(tempFilePath)
        .resize({ width: 1200, height: 1200, fit: "inside" })
        .webp({ quality: 80 })
        .toBuffer();

      const outputFile = bucket.file(outputPath);
      await outputFile.save(processedBuffer, {
        metadata: { contentType: "image/webp" },
      });

      const url =
        "https://firebasestorage.googleapis.com/v0/b/" +
        "point-app-1f854.firebasestorage.app/o/" +
        encodeURIComponent(outputPath) +
        "?alt=media";

      await db.collection("imageMeta").add({
        folder,
        prefix,
        fileName: newFileName,
        path: outputPath,
        url,
        originalName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        usedBy: [],
      });

      await file.delete();
      fs.unlinkSync(tempFilePath);

      console.log("processImage 完了:", outputPath);
    } catch (err) {
      console.error("processImage ERROR:", err);
    }
  }
);

export const moveImage = functions
  .region("us-east1")
  .https.onCall(async (data: unknown, context) => {
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

    if (typeof data !== "object" || data === null) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "移動情報が不正です"
      );
    }

    const input = data as Record<string, unknown>;
    const imageId =
      typeof input.imageId === "string" ? input.imageId.trim() : "";
    const targetFolder =
      typeof input.targetFolder === "string" ? input.targetFolder.trim() : "";

    if (!imageId || !allowedImageFolders.has(targetFolder)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "画像または移動先フォルダが不正です"
      );
    }

    const imageRef = db.collection("imageMeta").doc(imageId);
    const imageSnap = await imageRef.get();
    if (!imageSnap.exists) {
      throw new functions.https.HttpsError("not-found", "画像が見つかりません");
    }

    const image = imageSnap.data();
    const sourcePath =
      typeof image?.path === "string" ? image.path : "";
    const fileName =
      typeof image?.fileName === "string" ? image.fileName : "";
    const sourceUrl =
      typeof image?.url === "string" ? image.url : "";

    if (!sourcePath.startsWith("images/") || !fileName) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "画像の保存情報が不正です"
      );
    }

    const destinationPath = `images/${targetFolder}/${fileName}`;
    if (sourcePath === destinationPath) {
      return {
        path: sourcePath,
        url: image?.url,
      };
    }

    const destinationFile = bucket.file(destinationPath);
    const [destinationExists] = await destinationFile.exists();
    if (destinationExists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "移動先に同名の画像があります"
      );
    }

    const sourceFile = bucket.file(sourcePath);
    const [sourceExists] = await sourceFile.exists();
    if (!sourceExists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Storageに画像が見つかりません"
      );
    }

    const url =
      "https://firebasestorage.googleapis.com/v0/b/" +
      "point-app-1f854.firebasestorage.app/o/" +
      encodeURIComponent(destinationPath) +
      "?alt=media";

    const [activeGachaSnap, archivedGachaSnap] = sourceUrl
      ? await Promise.all([
          db.collection("gachaCodes").where("thumbnail", "==", sourceUrl).get(),
          db
            .collection("gachaCodesArchive")
            .where("thumbnail", "==", sourceUrl)
            .get(),
        ])
      : [
          { docs: [] as admin.firestore.QueryDocumentSnapshot[] },
          { docs: [] as admin.firestore.QueryDocumentSnapshot[] },
        ];

    const linkedGachaDocs = [
      ...activeGachaSnap.docs,
      ...archivedGachaSnap.docs,
    ];
    if (linkedGachaDocs.length > 499) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "この画像を参照するガチャが多すぎるため移動できません"
      );
    }

    await sourceFile.copy(destinationFile);
    try {
      const batch = db.batch();
      batch.update(imageRef, {
        folder: targetFolder,
        path: destinationPath,
        url,
      });
      for (const gachaDoc of linkedGachaDocs) {
        batch.update(gachaDoc.ref, { thumbnail: url });
      }
      await batch.commit();
    } catch (error) {
      try {
        await destinationFile.delete();
      } catch (cleanupError) {
        console.error("移動先画像のクリーンアップに失敗しました", cleanupError);
      }
      throw error;
    }

    try {
      await sourceFile.delete();
    } catch (error) {
      console.error("移動元画像の削除に失敗しました", error);
    }

    return {
      path: destinationPath,
      url,
      updatedGachaCount: linkedGachaDocs.length,
    };
  });
