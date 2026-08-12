"use client";

type MemoryCardProps = {
  img: string;
  onClick?: () => void;
};

export default function MemoryCard({ img, onClick }: MemoryCardProps) {
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
          transition: "0.3s",
        }}
      />
    </div>
  );
}
