"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { HomeMenuLink } from "@/app/lib/homeMenu";
import styles from "./homeMenu.module.css";

export default function IconMenuLink({ item, disabled = false }: { item: HomeMenuLink; disabled?: boolean }) {
  const [failed, setFailed] = useState(false);
  const content = <>
      {!failed && <Image src={`/menu/icons/${item.icon}.webp`} alt="" width={128} height={128}
        sizes="40px" className={styles.icon} onError={() => setFailed(true)} />}
      <span>{item.label}</span>{!disabled && <span aria-hidden="true"> →</span>}
  </>;
  return disabled
    ? <div role="link" aria-disabled="true" className={`${styles.iconLink} ${styles.disabled}`}>{content}</div>
    : <Link href={item.href} prefetch={false} className={styles.iconLink}>{content}</Link>;
}
