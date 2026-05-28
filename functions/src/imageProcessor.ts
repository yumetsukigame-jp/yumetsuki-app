import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const db = admin.firestore();

// ★ firebasestorage.app を必ず指定
const bucket = admin.storage().bucket("point-app-1f854.firebasestorage.app");

export const processImage = onObjectFinalized(
  { region: "us-east1" },
  async (event) => {
    try {
      const object = event.data;

      const filePath = object.name;
      if (!filePath || !filePath.startsWith("rawUploads/")) return;

      const tempFilePath = path.join(os.tmpdir(), uuidv4());
      const file = bucket.file(filePath);

      /* ============================================================
         ★ Firebase Storage 新仕様：
           customMetadata は object.metadata.customMetadata ではなく
           object.metadata の直下にフラットで入る
         ============================================================ */
      const metadata = object.metadata || {};

      const folder = metadata.folder || "misc";
      const prefix = metadata.prefix || "";
      const originalName = metadata.originalName || "unknown";

      // 拡張子除去
      const baseName = originalName.replace(/\.[^/.]+$/, "");

      // 保存ファイル名
      const newFileName = `${prefix}${baseName}.webp`;

      const outputPath = `images/${folder}/${newFileName}`;

      // rawUploads からダウンロード
      await file.download({ destination: tempFilePath });

      // WebP 変換
      const processedBuffer = await sharp(tempFilePath)
        .resize({ width: 1200, height: 1200, fit: "inside" })
        .webp({ quality: 80 })
        .toBuffer();

      // images/{folder}/ に保存
      const outputFile = bucket.file(outputPath);
      await outputFile.save(processedBuffer, {
        metadata: { contentType: "image/webp" },
      });

      const url = outputFile.publicUrl();

      // Firestore 保存
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

      // rawUploads の元ファイル削除
      await file.delete();
      fs.unlinkSync(tempFilePath);

      console.log("processImage 完了:", outputPath);

    } catch (err) {
      console.error("processImage ERROR:", err);
    }
  }
);
