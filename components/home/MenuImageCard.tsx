"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { HomeMenuLink } from "@/app/lib/homeMenu";
import styles from "./homeMenu.module.css";

export default function MenuImageCard({ item }: { item: HomeMenuLink }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <Link href={item.href} prefetch={false} className={styles.card}>
      {!imageFailed && <Image
        src={`/menu/thumbnails/${item.image}.webp`} alt="" width={item.imageWidth ?? 1672} height={item.imageHeight ?? 941}
        sizes="(max-width: 480px) calc(100vw - 64px), 408px"
        className={styles.thumbnail}
        onError={() => setImageFailed(true)}
      />}
      <span className={styles.caption}>
        <strong>{item.label}</strong><span aria-hidden="true"> →</span>
        {item.description && <span className={styles.description}>{item.description}</span>}
      </span>
    </Link>
  );
}
