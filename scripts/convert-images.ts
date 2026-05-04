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

  // 出力先（public）
  const publicPath = path.join(DEST_ROOT, relative.replace(IMAGE_EXT, ".webp"));
  const publicDir = path.dirname(publicPath);

  // 出力先（source_images 内の WebP）
  const srcWebpPath = path.join(SRC_ROOT, relative.replace(IMAGE_EXT, ".webp"));
  const srcWebpDir = path.dirname(srcWebpPath);

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(srcWebpDir)) fs.mkdirSync(srcWebpDir, { recursive: true });

  console.log(`▶ 変換中: ${srcPath}`);

  // WebP に変換（800px）
  const buffer = await sharp(srcPath)
    .resize({ width: 800 })
    .webp({ quality: 80 })
    .toBuffer();

  // public に保存
  await sharp(buffer).toFile(publicPath);
  console.log(`✔ public 出力: ${publicPath}`);

  // source_images にも WebP を保存
  await sharp(buffer).toFile(srcWebpPath);
  console.log(`✔ source_images 出力: ${srcWebpPath}`);

  // PNG/JPG の場合は削除
  if (/\.(png|jpg|jpeg)$/i.test(srcPath)) {
    fs.unlinkSync(srcPath);
    console.log(`🗑 削除: ${srcPath}`);
  }
}

async function run() {
  const files = getAllFiles(SRC_ROOT);

  console.log(`📸 処理対象ファイル数: ${files.length}`);

  for (const file of files) {
    await processImage(file);
  }

  console.log("\n🎉 変換完了！source_images と public に WebP が揃いました！");
}

run();
