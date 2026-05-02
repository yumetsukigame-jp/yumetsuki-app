"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../../firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function EditRewardPage({ params }: any) {
  const { id } = params;
  const router = useRouter();

  const [name, setName] = useState("");
  const [cost, setCost] = useState<number>(0);
  const [image, setImage] = useState("");
  const [stock, setStock] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReward = async () => {
      const ref = doc(db, "rewards", id);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();
        setName(data.name);
        setCost(data.cost);
        setImage(data.image);
        setStock(data.stock ?? 0);
      }

      setLoading(false);
    };

    fetchReward();
  }, [id]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    await updateDoc(doc(db, "rewards", id), {
      name,
      cost,
      image,
      stock,
    });

    alert("更新しました！");
    router.push("/admin/rewards");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "500px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物を編集
      </h1>

      <form onSubmit={handleUpdate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <label>名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>必要ポイント</label>
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>画像パス</label>
          <input
            type="text"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <div>
          <label>在庫数</label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
          }}
        >
          更新する
        </button>
      </form>
    </div>
  );
}
