"use client";

import Link from "next/link";
import Image from "next/image";
import styles from "./UserBranding.module.css";

export default function UserHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" aria-label="ゆめつきの書斎 トップへ" className={styles.banner}>
        <Image
          src="/branding/header-starry-wide.svg"
          alt="ゆめつきの書斎"
          width={2100}
          height={300}
          unoptimized
          priority
          className={styles.image}
        />
      </Link>
    </header>
  );
}
