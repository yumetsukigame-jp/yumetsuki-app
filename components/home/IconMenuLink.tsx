"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { HomeMenuLink } from "@/app/lib/homeMenu";
import styles from "./homeMenu.module.css";

export default function IconMenuLink({ item }: { item: HomeMenuLink }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link href={item.href} prefetch={false} className={styles.iconLink}>
      {!failed && <Image src={`/menu/icons/${item.icon}.webp`} alt="" width={128} height={128}
        sizes="40px" className={styles.icon} onError={() => setFailed(true)} />}
      <span>{item.label}</span><span aria-hidden="true"> →</span>
    </Link>
  );
}
