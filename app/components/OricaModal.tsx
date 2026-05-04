"use client";

export default function OricaModal({ img, onClose }) {
  if (!img) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0,
        width: "100vw",
        height: "100vh",
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
    >
      <img
        src={img}
        style={{
          width: "80%",
          maxWidth: "400px",
          borderRadius: "12px",
          boxShadow: "0 0 20px rgba(255,255,255,0.5)",
        }}
      />
    </div>
  );
}
