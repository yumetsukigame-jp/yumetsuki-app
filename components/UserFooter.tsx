"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import styles from "./UserBranding.module.css";

export default function UserFooter() {
  const pathname = usePathname();
  const router = useRouter();

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <footer className={styles.footer}>
      {pathname !== "/" && (
        <div className={styles.backControls}>
          <button
            type="button"
            onClick={handleBack}
            style={{
              minWidth: 140,
              padding: "12px 18px",
              border: "1px solid #9ca3af",
              borderRadius: 8,
              background: "#fff",
              color: "#111827",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            一つ前の画面に戻る
          </button>
        </div>
      )}
      <Link href="/" aria-label="トップページへ戻る" className={styles.banner}>
        <Image
          src="/branding/footer-starry-wide.svg"
          alt=""
          width={2100}
          height={300}
          unoptimized
          className={styles.image}
        />
        <small className={styles.caption}>クリックでトップページへ</small>
      </Link>
    </footer>
  );
}
