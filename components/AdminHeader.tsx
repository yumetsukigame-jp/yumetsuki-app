export default function AdminHeader() {
  return (
    <header className="w-full">
      <img
        src="/admin-header.png"
        alt="管理者ヘッダー"
        className="w-full object-cover"
        style={{ height: "160px" }}  // ← ここを調整
      />
    </header>
  );
}
