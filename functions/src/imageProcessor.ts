import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";


const db = admin.firestore();
const bucket = admin.storage().bucket();

// ★ Storage と同じリージョン us-east1 を指定
export const processImage = onObjectFinalized(
  { region: "us-east1" },
  async (event) => {
    const object = event.data;

    const filePath = object.name;
    if (!filePath || !filePath.startsWith("rawUploads/")) return;

    const tempFilePath = path.join(os.tmpdir(), uuidv4());
    const file = bucket.file(filePath);

    // ★ customMetadata を使わず metadata 直下を読む（スマホ対応）
    const metadata = object.metadata || {};
    const folder = metadata.folder || "misc";
    const prefix = metadata.prefix || "";
    const originalName = metadata.originalName || "unknown";

    const newFileName = `${prefix}${uuidv4()}.webp`;
    const outputPath = `images/${folder}/${newFileName}`;

    // ダウンロード
    await file.download({ destination: tempFilePath });

    // WebP 変換
    const processedBuffer = await sharp(tempFilePath)
      .resize({ width: 1200, height: 1200, fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    // アップロード
    const outputFile = bucket.file(outputPath);
    await outputFile.save(processedBuffer, {
      metadata: { contentType: "image/webp" },
    });

    // 公開 URL
    const url = await outputFile.getSignedUrl({
      action: "read",
      expires: "2120-01-01",
    });

    // Firestore 保存
    await db.collection("imageMeta").add({
      folder,
      prefix,
      filename: newFileName,
      path: outputPath,
      url: url[0],
      originalName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      usedBy: [],
    });

    // 元ファイル削除
    await file.delete();

    fs.unlinkSync(tempFilePath);
  }
);
