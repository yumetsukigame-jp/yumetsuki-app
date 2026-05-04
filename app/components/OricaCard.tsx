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
      <img
        src={img}
        onClick={onClick}
        style={{
          width: "100%",
          borderRadius: "8px",
          filter: "none", // ← 未所持でも薄くしない
          transition: "0.3s",
        }}
      />

      <button
        onClick={onToggle}
        style={{
          marginTop: "10px",
          padding: "8px",
          width: "100%",
          borderRadius: "6px",
          border: "none",
          background: owned ? "#4f46e5" : "#999", // ← 色だけで判別
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
