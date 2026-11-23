"use client";

import { useEffect, useState } from "react";
import { db } from "../../../../../firebase";
import {
  doc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import RewardDeliverySelect from "@/components/nanika-gacha/RewardDeliverySelect";
import RewardImageSelect, { type RewardImage } from "@/components/nanika-gacha/RewardImageSelect";
import { isNanikaTier } from "@/functions/src/nanikaGachaPolicy";
import type { NanikaTier } from "@/functions/src/nanikaGachaTypes";

type RewardRecord = RewardImage & {
  id: string;
  name?: string;
  cost?: number;
  image?: string;
  stock?: number;
  [key: string]: unknown;
};

export default function EditRewardForm({ id }: { id: string }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [cost, setCost] = useState(0);
  const [image, setImage] = useState("");
  const [nanikaTier, setNanikaTier] = useState<NanikaTier | null>(null);
  const [stock, setStock] = useState(0);
  const [loading, setLoading] = useState(true);
  const [images, setImages] = useState<RewardImage[]>([]);

  // Firestore から rewards フォルダの画像一覧を取得
  useEffect(() => {
    const loadImages = async () => {
      const snap = await getDocs(collection(db, "imageMeta"));
      const list = snap.docs
        .map((d) => d.data() as Partial<RewardImage>)
        .filter((d): d is RewardImage => !!d.url && d.folder === "rewards");

      setImages(list);
    };

    loadImages();
  }, []);

  // Firestore から reward データを取得（AdminRewardsPage と同じ方式）
  useEffect(() => {
    const fetchReward = async () => {
      if (!id) {
        console.log("ID が undefined です");
        setLoading(false);
        return;
      }

      const snap = await getDocs(collection(db, "rewards"));
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Record<string, unknown>),
      } as RewardRecord));

      const target = list.find(
        (r) => r.id.normalize("NFC") === id.normalize("NFC")
      );

      console.log("URL id:", id);
      console.log("Firestore IDs:", list.map((r) => r.id));
      console.log("target:", target);

      if (target) {
        setName(target.name ?? "");
        setCost(target.cost ?? 0);
        setImage(target.image ?? "");
        setStock(target.stock ?? 0);
        setNanikaTier(isNanikaTier(target.nanikaTier) ? target.nanikaTier : null);
      }

      setLoading(false);
    };

    fetchReward();
  }, [id]);

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    await updateDoc(doc(db, "rewards", id), {
      name,
      cost,
      stock,
      image,
      nanikaTier,
    });

    alert("更新しました！");
    router.push("/admin/rewards");
  };

  if (loading) return <p style={{ padding: 20 }}>読み込み中…</p>;

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        発送物を編集
      </h1>

      <form
        onSubmit={handleUpdate}
        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
      >
        <RewardDeliverySelect value={nanikaTier ?? "shipping"} onChange={value => setNanikaTier(value === "shipping" || value === "points" ? null : value)} />
        {nanikaTier && <p>設定の交換ポイントで当選権利を1回分付与します。実物の発送依頼は作成せず、取得後の抽選は追加消費0 ptです。挑戦権利ではありません。</p>}
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
          <label>在庫数</label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid #ccc" }}
          />
        </div>

        <RewardImageSelect images={images} value={image} onChange={setImage} />

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
