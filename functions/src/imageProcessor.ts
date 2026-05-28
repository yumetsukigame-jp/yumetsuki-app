import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const db = admin.firestore();
const bucket = admin.storage().bucket("point-app-1f854.firebasestorage.app");

export const processImage = onObjectFinalized(
  { region: "us-east1" },
  async (event) => {
    try {
      const object = event.data;
      const filePath = object.name;

      if (!filePath || !filePath.startsWith("rawUploads/")) return;

      // ★ URL の meta=xxx を取り出す
      let metadata = {};
      const idx = filePath.indexOf("?meta=");
      if (idx !== -1) {
        const encoded = filePath.substring(idx + 6);
        metadata = JSON.parse(decodeURIComponent(encoded));
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
