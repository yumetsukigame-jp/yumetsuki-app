/**
 * Storage の images/* を読み取り、
 * Firestore の imageMeta に自動登録するスクリプト（CJS版）
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "point-app-1f854.firebasestorage.app",
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function run() {
  const folders = [
    "gacha",
    "memories",
    "rewards",
    "nibuichi",
    "orica",
    "misc",
    "icons",
    "banners",
    "questicon",
    "character-select",
  ];

  for (const folder of folders) {
    console.log(`\n=== ${folder} ===`);

    const [files] = await bucket.getFiles({
      prefix: `images/${folder}/`,
    });

    for (const file of files) {
      const name = file.name.split("/").pop();
      if (!name.match(/\.(png|jpg|jpeg|webp)$/i)) continue;

      const prefix = name.includes("_")
        ? name.split("_")[0] + "_"
        : "";

      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "2120-01-01",
      });

      await db.collection("imageMeta").add({
        folder,
        filename: name,
        prefix,
        path: file.name,
        url,
        usedBy: [],
        createdAt: new Date(),
      });

      console.log(`Added: ${file.name}`);
    }
  }

  console.log("\n完了しました！");
}

run();
