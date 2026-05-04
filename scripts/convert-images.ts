import fs from "fs";
import path from "path";
import sharp from "sharp";

// public 以下すべてを対象にする
const TARGET_ROOT = path.join(process.cwd(), "public");

// 対象拡張子
const IMAGE_EXT = /\.(png|jpg|jpeg)$/i;

function getAllImageFiles(dir: string): string[] {
  let results: string[] = [];

  const list = fs.readdirSync(dir);

  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      results = results.concat(getAllImageFiles(fullPath));
    } else if (IMAGE_EXT.test(file)) {
      results.push(fullPath);
    }
  }

  return results;
}

async function convertImage(filePath: string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath).replace(IMAGE_EXT, "");
  const output = path.join(dir, `${base}.webp`);

  console.log(`▶ 変換中: ${filePath}`);

  await sharp(filePath)
    .webp({ quality: 80 })
    .toFile(output);

  console.log(`✔ 完了: ${output}`);

  // 元ファイル削除
  fs.unlinkSync(filePath);
}

async function run() {
  const files = getAllImageFiles(TARGET_ROOT);

  if (files.length === 0) {
    console.log("📁 public 以下に PNG/JPG が見つかりませんでした。");
    return;
  }

  console.log(`📸 変換対象ファイル数: ${files.length}`);

  for (const file of files) {
    await convertImage(file);
  }

  console.log("\n🎉 public 以下のすべての PNG/JPG を WebP に変換しました！");
}

run();
