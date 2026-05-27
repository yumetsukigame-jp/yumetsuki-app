import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const db = admin.firestore();

// ★ 必ず firebasestorage.app を指定（404 対策）
const bucket = admin
  .storage()
  .bucket("point-app-1f854.firebasestorage.app");

export const processImage = onObjectFinalized(
  { region: "us-east1" },
  async (event) => {
    try {
      const object = event.data;

      const filePath = object.name;
      if (!filePath || !filePath.startsWith("rawUploads/")) return;

      const tempFilePath = path.join(os.tmpdir(), uuidv4());
      const file = bucket.file(filePath);

      // ★ metadata 直下を読む（スマホ含め全端末対応）
      const metadata = (object.metadata || {}) as {
        folder?: string;
        prefix?: string;
        originalName?: string;
      };

      const folder = metadata.folder || "misc";
      const prefix = metadata.prefix || "";
      const originalName = metadata.originalName || "unknown";

      // ★ originalName から拡張子を除去（png/jpg/jpeg/heic など全部対応）
      const baseName = originalName.replace(/\.[^/.]+$/, "");

      // ★ 人間が読めるファイル名を生成
      const newFileName = `${prefix}${baseName}.webp`;

      // 保存先パス
      const outputPath = `images/${folder}/${newFileName}`;

      // rawUploads からダウンロード
      await file.download({ destination: tempFilePath });

      // WebP 変換（1200px 内に収める）
      const processedBuffer = await sharp(tempFilePath)
        .resize({ width: 1200, height: 1200, fit: "inside" })
        .webp({ quality: 80 })
        .toBuffer();

      // images/{folder}/ にアップロード
      const outputFile = bucket.file(outputPath);
      await outputFile.save(processedBuffer, {
        metadata: { contentType: "image/webp" },
      });

      // 公開 URL
      const url = outputFile.publicUrl();

      // Firestore に保存
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
