// scripts/convert-images.js

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC_ROOT = path.join(process.cwd(), "source_images");
const DEST_ROOT = path.join(process.cwd(), "public");

const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else if (IMAGE_EXT.test(file)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function processImage(srcPath) {
  const relative = path.relative(SRC_ROOT, srcPath);

  const publicPath = path.join(DEST_ROOT, relative.replace(IMAGE_EXT, ".webp"));
  const publicDir = path.dirname(publicPath);

  const srcWebpPath = path.join(SRC_ROOT, relative.replace(IMAGE_EXT, ".webp"));
  const srcWebpDir = path.dirname(srcWebpPath);

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(srcWebpDir)) fs.mkdirSync(srcWebpDir, { recursive: true });

  console.log(`▶ 変換中: ${srcPath}`);

  const isWebp = /\.webp$/i.test(srcPath);

  if (isWebp) {
    // ★ WebP は source_images 側に書き込まない（上書き禁止）
    await sharp(srcPath).toFile(publicPath);
    console.log(`✔ public 出力: ${publicPath}`);
    return;
  }

  // PNG/JPG → WebP 変換
  const buffer = await sharp(srcPath)
    .resize({ width: 800 })
    .webp({ quality: 80 })
    .toBuffer();

  await sharp(buffer).toFile(publicPath);
  console.log(`✔ public 出力: ${publicPath}`);

  await sharp(buffer).toFile(srcWebpPath);
  console.log(`✔ source_images 出力: ${srcWebpPath}`);

  fs.unlinkSync(srcPath);
  console.log(`🗑 削除: ${srcPath}`);
}

async function run() {
  const files = getAllFiles(SRC_ROOT);

  console.log(`📸 処理対象ファイル数: ${files.length}`);

  for (const file of files) {
    await processImage(file);
  }

  console.log("\n🎉 変換完了！source_images と public に WebP が揃いました！");
}

// ★ public/gacha の画像一覧 JSON を生成
function generateImageList() {
  const gachaDir = path.join(DEST_ROOT, "gacha");
  if (!fs.existsSync(gachaDir)) return;

  const files = fs
    .readdirSync(gachaDir)
    .filter((f) => /\.(webp|png|jpg|jpeg)$/i.test(f));

  const jsonPath = path.join(gachaDir, "images.json");
  fs.writeFileSync(jsonPath, JSON.stringify(files, null, 2));

  console.log(`📄 画像一覧 JSON を生成: ${jsonPath}`);
}

run();
generateImageList(); // ★ 必須
