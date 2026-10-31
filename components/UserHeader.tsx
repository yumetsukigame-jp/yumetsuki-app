"use client";

import Link from "next/link";
import Image from "next/image";

export default function UserHeader() {
  return (
    <header className="w-full">
      <Link href="/" aria-label="ゆめつきの書斎 トップへ戻る" style={{ display: "block" }}>
      <Image
        src="/header.webp"
        alt="ゆめつきの書斎 ヘッダー"
        width={6936}
        height={995}
        sizes="100vw"
        priority
        className="w-full h-auto object-contain pointer-events-none"
      />
      </Link>
    </header>
  );
}
