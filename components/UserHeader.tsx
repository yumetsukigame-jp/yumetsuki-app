"use client";

import { useRouter } from "next/navigation";

export default function UserHeader() {
  const router = useRouter();

  return (
    <header
      className="w-full cursor-pointer"
      onClick={() => router.push("/")}
    >
      <img
        src="/header.webp"
        alt="ゆめつきの書斎 ヘッダー"
        className="w-full h-auto object-contain pointer-events-none"
      />
    </header>
  );
}
