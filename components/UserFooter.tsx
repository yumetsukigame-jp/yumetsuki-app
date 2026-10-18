"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
    <footer
      style={{
        marginTop: "50px",
        padding: "20px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
        borderTop: "1px solid #ddd",
        textAlign: "center",
        background: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {pathname !== "/" && (
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
        )}

        <Link
          href="/"
          style={{
            minWidth: 140,
            padding: "12px 18px",
            borderRadius: 8,
            background: "#2563eb",
            color: "#fff",
            textDecoration: "none",
            fontSize: 16,
          }}
        >
          トップページへ戻る
        </Link>
      </div>
    </footer>
  );
}
