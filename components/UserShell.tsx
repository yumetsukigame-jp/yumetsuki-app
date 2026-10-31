"use client";

import { usePathname } from "next/navigation";
import UserHeader from "./UserHeader";
import UserFooter from "./UserFooter";
import styles from "./UserShell.module.css";

export default function UserShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <div className={`${styles.shell} ${admin ? styles.admin : styles.user}`}>
      {!admin && <div className={styles.background} aria-hidden="true" />}
      <UserHeader />
      <div id="page-content" className={`${styles.main} ${admin || pathname === "/" ? "" : styles.panel}`}>
        {children}
      </div>
      <UserFooter />
    </div>
  );
}
