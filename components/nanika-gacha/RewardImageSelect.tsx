"use client";

import Image from "next/image";
import { NANIKA_TIERS } from "../../functions/src/nanikaGachaTypes";

export type RewardImage = { url: string; prefix?: string; folder?: string };

export default function RewardImageSelect({ images, value, onChange }: {
  images: RewardImage[]; value: string; onChange: (url: string) => void;
}) {
  const thumbnails = NANIKA_TIERS.map(tier => ({
    url: `/nanika-gacha/thumbnails/${tier.thumbnail}.webp`,
    prefix: tier.label,
  }));
  const options = [
    ...images.filter(image => !thumbnails.some(thumbnail => thumbnail.url === image.url)),
    ...thumbnails,
  ];
  return <fieldset>
    <legend>画像を選択</legend>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
      {options.map(image => <button key={image.url} type="button"
        aria-label={`${image.prefix || "画像"}を選択`} aria-pressed={value === image.url}
        onClick={() => onChange(image.url)}
        style={{
          border: value === image.url ? "3px solid #4f46e5" : "1px solid #ccc",
          padding: 5, borderRadius: 8, cursor: "pointer", width: 160, maxWidth: "100%",
          background: "white", color: "#17243b",
        }}>
        <Image src={image.url} alt="" width={150} height={100} unoptimized
          style={{ width: "100%", height: 100, objectFit: "contain", borderRadius: 6 }} />
        <span style={{ display: "block", fontSize: 14, overflowWrap: "anywhere" }}>{image.prefix || "画像"}</span>
      </button>)}
    </div>
  </fieldset>;
}
