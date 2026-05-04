"use client";

export default function OricaCard({ img, owned, onToggle, onClick }) {
  return (
    <div
      style={{
        padding: "10px",
        borderRadius: "10px",
        background: "white",
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
        textAlign: "center",
        cursor: "pointer",
      }}
    >
      {/* カード画像（未所持は薄くする） */}
      <img
        src={img}
        onClick={onClick}
        style={{
          width: "100%",
          borderRadius: "8px",
          filter: owned ? "none" : "grayscale(100%) opacity(0.4)", // ← ここが最新仕様
          transition: "0.3s",
        }}
      />

      {/* ボタン（未所持はグレー、保有は紫） */}
      <button
        onClick={onToggle}
        style={{
          marginTop: "10px",
          padding: "8px",
          width: "100%",
          borderRadius: "6px",
          border: "none",
          background: owned ? "#4f46e5" : "#999", // ← ボタンは薄くしない
          color: "white",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {owned ? "保有" : "未所持"}
      </button>
    </div>
  );
}
