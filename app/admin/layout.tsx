"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import AdminFooter from "@/components/AdminFooter";
import AdminHeader from "@/components/AdminHeader";
import { withRetry } from "@/app/lib/retry";

const authorizedAdminUids = new Set<string>();

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [accessState, setAccessState] = useState<
    "checking" | "authorized" | "error"
  >("checking");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (pathname === "/admin/login") {
      return;
    }

    let active = true;

    const checkAdmin = async () => {
      try {
        await auth.authStateReady();
        if (!active) return;

        setAccessState("checking");
        const user = auth.currentUser;
        if (!user) {
          router.replace("/admin/login");
          return;
        }

        if (authorizedAdminUids.has(user.uid)) {
          setAccessState("authorized");
          return;
        }

        await user.getIdToken();
        if (!active) return;

        const adminSnap = await withRetry(
          () => getDoc(doc(db, "admins", user.uid)),
          2,
          500,
          10000
        );

        if (!active) return;

        if (!adminSnap.exists()) {
          router.replace("/admin/login");
          return;
        }

        authorizedAdminUids.add(user.uid);
        setAccessState("authorized");
      } catch (error) {
        console.error("Admin auth check failed", error);
        if (active) {
          setAccessState("error");
        }
      }
    };

    void checkAdmin();

    return () => {
      active = false;
    };
  }, [pathname, retryKey, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (accessState !== "authorized") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        {accessState === "checking" ? (
          <p>管理者権限を確認しています…</p>
        ) : (
          <div>
            <p>Firebase に接続できませんでした。通信状況を確認して再試行してください。</p>
            <button onClick={() => setRetryKey((key) => key + 1)}>再試行</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AdminHeader />

      <div style={{ flex: 1 }}>{children}</div>

      <AdminFooter />
    </div>
  );
}
