/**
 * Firestore 移行スクリプト
 * public(boolean) → publicFlags（配列）へ変換
 *
 * 実行方法：
 *   node migratePublicFlag.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrate() {
  console.log("=== public(boolean) → publicFlags(array) 移行開始 ===");

  const snap = await db.collection("gachaCodes").get();

  let updated = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();

    // すでに publicFlags がある場合はスキップ
    if (Array.isArray(data.publicFlags)) continue;

    // ★ boolean public が存在するか？
    if (typeof data.public === "boolean") {
      const newFlags = [];

      if (data.public === true) {
        newFlags.push("public");
      } else {
        newFlags.push("limited");
      }

      console.log(`変換: ${docSnap.id}  public=${data.public} → publicFlags=[${newFlags}]`);

      await docSnap.ref.update({
        publicFlags: newFlags,
        public: admin.firestore.FieldValue.delete(), // 古いフィールド削除
      });

      updated++;
      continue;
    }

    // ★ 旧仕様の publicFlag(string) がある場合も対応
    if (typeof data.publicFlag === "string") {
      const newFlags = [data.publicFlag];

      console.log(`変換: ${docSnap.id}  publicFlag=${data.publicFlag} → publicFlags=[${newFlags}]`);

      await docSnap.ref.update({
        publicFlags: newFlags,
        publicFlag: admin.firestore.FieldValue.delete(),
      });

      updated++;
      continue;
    }
  }

  console.log(`=== 移行完了：${updated} 件更新 ===`);
}

migrate().catch((err) => {
  console.error("移行中にエラー:", err);
});
