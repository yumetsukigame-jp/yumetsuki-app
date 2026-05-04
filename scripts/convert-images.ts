import fs from "fs";
import path from "path";
import sharp from "sharp";

const SRC_ROOT = path.join(process.cwd(), "source_images");
const DEST_ROOT = path.join(process.cwd(), "public");

const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

function getAllFiles(dir: string): string[] {
  let results: string[] = [];
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

async function processImage(srcPath: string) {
  const relative = path.relative(SRC_ROOT, srcPath);
  const destPath = path.join(DEST_ROOT, relative.replace(IMAGE_EXT, ".webp"));

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  console.log(`▶ 変換中: ${srcPath}`);

  await sharp(srcPath)
    .resize({ width: 800 })
    .webp({ quality: 80 })
    .toFile(destPath);

  console.log(`✔ 出力: ${destPath}`);
}

async function run() {
  const files = getAllFiles(SRC_ROOT);

  console.log(`📸 処理対象ファイル数: ${files.length}`);

  for (const file of files) {
    await processImage(file);
  }

  console.log("\n🎉 すべての画像を public 以下に最適化して出力しました！");
}

run();
