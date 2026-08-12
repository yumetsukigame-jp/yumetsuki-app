"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase";
import AdminFooter from "@/components/AdminFooter";
import AdminHeader from "@/components/AdminHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setReady(true);
      return;
    }

    let active = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!active) return;
        setReady(false);
        router.replace("/admin/login");
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, "admins", user.uid));

        if (!active) return;

        if (!adminSnap.exists()) {
          setReady(false);
          router.replace("/admin/login");
          return;
        }

        setReady(true);
      } catch (error) {
        console.error("Admin auth check failed", error);
        if (active) {
          setReady(false);
          router.replace("/admin/login");
        }
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, [pathname, router]);

  if (!ready && pathname !== "/admin/login") {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        読み込み中…
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
