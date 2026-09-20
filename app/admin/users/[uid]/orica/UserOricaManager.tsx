"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import OricaCard from "@/components/OricaCard";
import OricaModal from "@/components/OricaModal";
import { db } from "@/firebase";

type OricaImage = {
  fileName: string;
  prefix?: string;
  url: string;
};

type UserSummary = {
  displayName: string;
  email: string;
};

const groupLabels: Record<string, string> = {
  orica: "通常企画",
  sp: "特別企画",
  honpo: "ゆめつき本舗",
};

function getOricaId(fileName: string): string {
  return fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");
}

export default function UserOricaManager({ uid }: { uid: string }) {
  const [images, setImages] = useState<OricaImage[]>([]);
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [user, setUser] = useState<UserSummary | null>(null);
  const [modalImg, setModalImg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const [userSnapshot, imageSnapshot, ownershipSnapshot] =
          await Promise.all([
            getDoc(doc(db, "users", uid)),
            getDocs(collection(db, "imageMeta")),
            getDocs(collection(db, "users", uid, "orica")),
          ]);

        if (!userSnapshot.exists()) {
          setError("ユーザーが見つかりません。");
          return;
        }

        const userData = userSnapshot.data();
        setUser({
          displayName:
            userData.displayName?.trim() ||
            userData.name?.trim() ||
            "名称未登録",
          email:
            typeof userData.email === "string"
              ? userData.email
              : "メールアドレス未登録",
        });

        const imageList = imageSnapshot.docs
          .map((imageDocument) => imageDocument.data())
          .filter(
            (image): image is OricaImage =>
              image.folder === "orica" &&
              typeof image.fileName === "string" &&
              typeof image.url === "string"
          )
          .sort((a, b) => a.fileName.localeCompare(b.fileName, "ja"));
        setImages(imageList);

        const ownedData: Record<string, boolean> = {};
        ownershipSnapshot.docs.forEach((ownershipDocument) => {
          ownedData[ownershipDocument.id] =
            ownershipDocument.get("owned") === true;
        });
        setOwned(ownedData);
      } catch (loadError) {
        console.error("ユーザーのオリカ情報の読み込みに失敗しました", loadError);
        setError("オリカ情報の読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [uid]);

  const groups = useMemo(
    () => ({
      orica: images.filter((image) => image.prefix === "orica_"),
      sp: images.filter((image) => image.prefix === "sp_"),
      honpo: images.filter((image) => image.prefix === "honpo_"),
    }),
    [images]
  );

  const ownedCount = images.filter(
    (image) => owned[getOricaId(image.fileName)]
  ).length;

  const toggleOwned = async (image: OricaImage) => {
    const id = getOricaId(image.fileName);
    if (saving[id]) return;

    const previousState = owned[id] === true;
    const nextState = !previousState;
    setOwned((current) => ({ ...current, [id]: nextState }));
    setSaving((current) => ({ ...current, [id]: true }));

    try {
      await setDoc(
        doc(db, "users", uid, "orica", id),
        {
          owned: nextState,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (saveError) {
      console.error("オリカの所有状態の更新に失敗しました", saveError);
      setOwned((current) => ({ ...current, [id]: previousState }));
      alert("所有状態を更新できませんでした。");
    } finally {
      setSaving((current) => ({ ...current, [id]: false }));
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 760, margin: "0 auto" }}>
      <Link
        href="/admin/users"
        style={{ color: "#2563eb", textDecoration: "none" }}
      >
        ← ユーザー一覧へ戻る
      </Link>

      <h1 style={{ margin: "16px 0 8px" }}>所有オリカ管理</h1>
      {user && (
        <div
          style={{
            marginBottom: 24,
            padding: 14,
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 8,
          }}
        >
          <strong>{user.displayName}</strong>
          <div style={{ color: "#6b7280", overflowWrap: "anywhere" }}>
            {user.email}
          </div>
          <div style={{ marginTop: 6 }}>
            所有数：{ownedCount} / {images.length}
          </div>
        </div>
      )}

      {loading && <p>読み込み中…</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      {!loading &&
        !error &&
        Object.entries(groups).map(([groupName, groupImages]) => (
          <section key={groupName} style={{ marginBottom: 40 }}>
            <h2 style={{ marginBottom: 10 }}>
              {groupLabels[groupName]}（
              {
                groupImages.filter(
                  (image) => owned[getOricaId(image.fileName)]
                ).length
              }
              /{groupImages.length}）
            </h2>

            <div
              style={{
                height: 6,
                marginBottom: 12,
                background: "#8b5a2b",
                borderRadius: 3,
              }}
            />

            {groupImages.length === 0 ? (
              <p style={{ color: "#6b7280" }}>登録カードがありません。</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 16,
                }}
              >
                {groupImages.map((image) => {
                  const id = getOricaId(image.fileName);
                  return (
                    <OricaCard
                      key={id}
                      img={image.url}
                      owned={owned[id] === true}
                      disabled={saving[id] === true}
                      onToggle={() => void toggleOwned(image)}
                      onClick={() => setModalImg(image.url)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        ))}

      <OricaModal img={modalImg} onClose={() => setModalImg(null)} />
    </div>
  );
}
