import AdminFooter from "@/components/AdminFooter";
import AdminHeader from "@/components/AdminHeader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* 共通ヘッダー（管理者用） */}
      <AdminHeader />

      {/* ページ内容 */}
      <div style={{ flex: 1 }}>
        {children}
      </div>

      {/* 共通フッター */}
      <AdminFooter />
    </div>
  );
}
