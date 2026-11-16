export const GACHA_ANIMATION_LEVELS = [
  { id: "top", label: "最上位" },
  { id: "atari", label: "当たり" },
  { id: "hazure", label: "ハズレ" },
] as const;

export type GachaAnimationLevel = typeof GACHA_ANIMATION_LEVELS[number]["id"];

export function isGachaAnimationLevel(value: unknown): value is GachaAnimationLevel {
  return GACHA_ANIMATION_LEVELS.some(level => level.id === value);
}

export function resolveGachaAnimationLevel(value: unknown, fallback: GachaAnimationLevel = "atari"): GachaAnimationLevel {
  return isGachaAnimationLevel(value) ? value : fallback;
}

export function frameAnimationLevel(value: unknown, index: number, frameCount: number): GachaAnimationLevel {
  return resolveGachaAnimationLevel(value, index === frameCount - 1 ? "hazure" : "atari");
}

export const GACHA_ANIMATION_VIDEOS: Record<GachaAnimationLevel, readonly string[]> = {
  top: ["/gacha/animations/top/dore.mp4", "/gacha/animations/top/sumon.mp4"],
  atari: ["/gacha/animations/atari/dore.mp4", "/gacha/animations/atari/sumon.mp4"],
  hazure: ["/gacha/animations/hazure/dore.mp4", "/gacha/animations/hazure/sumon.mp4"],
};

export function randomGachaAnimationVideo(level: GachaAnimationLevel): string {
  const videos = GACHA_ANIMATION_VIDEOS[level];
  return videos[Math.floor(Math.random() * videos.length)];
}
