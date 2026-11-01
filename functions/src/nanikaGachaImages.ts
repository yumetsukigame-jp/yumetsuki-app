import sharp from "sharp";

export const NANIKA_IMAGE_LIMITS = { input: 6 * 1024 * 1024, large: 240000, thumbnail: 20000 } as const;

export async function compressNanikaImage(input: Buffer) {
  if (input.length === 0 || input.length > NANIKA_IMAGE_LIMITS.input) throw new Error("画像は6MB以下にしてください");
  const metadata = await sharp(input, { limitInputPixels: 20000000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) {
    throw new Error("静止画のJPEG・PNG・WebPを指定してください");
  }
  async function encode(maxBytes: number, settings: [number, number][]) {
    for (const [width, quality] of settings) {
      const data = await sharp(input, { limitInputPixels: 20000000 }).rotate()
        .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
        .webp({ quality }).toBuffer();
      if (data.length <= maxBytes) return data;
    }
    throw new Error("画像を保存容量の上限まで縮小できませんでした");
  }
  return {
    large: await encode(NANIKA_IMAGE_LIMITS.large, [[1200, 80], [900, 65], [640, 50]]),
    thumbnail: await encode(NANIKA_IMAGE_LIMITS.thumbnail, [[320, 65], [240, 50], [160, 40]]),
  };
}
