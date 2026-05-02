export default function UserHeader() {
  return (
    <header className="w-full">
      <img
        src="/header.png"
        alt="ゆめつきの書斎 ヘッダー"
        className="w-full object-cover"
        style={{ height: "160px" }}  // ← ここで高さを調整
      />
    </header>
  );
}
