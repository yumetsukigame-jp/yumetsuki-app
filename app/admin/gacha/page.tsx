"use client";

import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

type Mode = "count" | "prob";
type ResetType = "none" | "daily";

// ★ 公開設定の型（複数選択）
type PublicFlag =
  | "public"
  | "limited"
  | "subscriber"
  | "nibuichi_winner";

// ★ 発送ON/OFFを追加
type FrameInput = {
  label: string;
  maxCount: number | "";
  probability: number | "";
  rewardMin: number | "";
  rewardMax: number | "";
  shippingEnabled: boolean; // ★ 追加
};

export default function GachaCreatePage() {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("count");
  const [resetType, setResetType] = useState<ResetType>("none");

  const [totalCount, setTotalCount] = useState<number | "">("");

  // ★ 初期枠にも shippingEnabled を追加
  const [frames, setFrames] = useState<FrameInput[]>([
    { label: "A", maxCount: "", probability: "", rewardMin: "", rewardMax: "", shippingEnabled: false },
    { label: "B", maxCount: "", probability: "", rewardMin: "", rewardMax: "", shippingEnabled: false },
  ]);

  const [cost, setCost] = useState<number | "">(0);
  const [maxPerUser, setMaxPerUser] = useState<number | "">(1);
  const [expiresAt, setExpiresAt] = useState<string>("");

  // ★ publicFlags（複数選択）
  const [publicFlags, setPublicFlags] = useState<PublicFlag[]>(["public"]);

  const [thumbnail, setThumbnail] = useState<string>("");
  const [gachaImages, setGachaImages] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState("");

  useEffect(() => {
    fetch("/gacha/images.json")
      .then((res) => res.json())
      .then((data) => setGachaImages(data))
      .catch(() => setGachaImages([]));
  }, []);

  const toggleFlag = (flag: PublicFlag) => {
    setPublicFlags((prev) =>
      prev.includes(flag)
        ? prev.filter((f) => f !== flag)
        : [...prev, flag]
    );
  };

  const addFrame = () => {
    setFrames((prev) => [
      ...prev,
      {
        label: `枠${prev.length + 1}`,
        maxCount: "",
        probability: "",
        rewardMin: "",
        rewardMax: "",
        shippingEnabled: false, // ★ 追加
      },
    ]);
  };

  // ★ shippingEnabled にも対応
  const updateFrame = (index: number, key: keyof FrameInput, value: any) => {
    setFrames((prev) =>
      prev.map((f, i) =>
        i === index
          ? {
              ...f,
              [key]:
                key === "maxCount" ||
                key === "probability" ||
                key === "rewardMin" ||
                key === "rewardMax"
                  ? value === ""
                    ? ""
                    : Number(value)
                  : value, // shippingEnabled は boolean のまま
            }
          : f
      )
    );
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      alert("タイトルを入力してください");
      return;
    }

    if (mode === "count" && (totalCount === "" || totalCount <= 0)) {
      alert("総数を入力してください");
      return;
    }

    if (cost === "" || cost < 0) {
      alert("ポイントを入力してください");
      return;
    }

    if (maxPerUser === "" || maxPerUser <= 0) {
      alert("上限回数を入力してください");
      return;
    }

    // ★ 最後の枠を自動計算
    if (mode === "count") {
      const sum = frames.reduce(
        (acc, f, idx) =>
          idx === frames.length - 1
            ? acc
            : acc + (typeof f.maxCount === "number" ? f.maxCount : 0),
        0
      );
      const last = Number(totalCount) - sum;
      if (last < 0) {
        alert("枠数の合計が総数を超えています");
        return;
      }
      frames[frames.length - 1].maxCount = last;
    } else {
      const sum = frames.reduce(
        (acc, f, idx) =>
          idx === frames.length - 1
            ? acc
            : acc + (typeof f.probability === "number" ? f.probability : 0),
        0
      );
      const last = 100 - sum;
      if (last < 0) {
        alert("確率の合計が100%を超えています");
        return;
      }
      frames[frames.length - 1].probability = last;
    }

    setLoading(true);

    try {
      const fn = httpsCallable(functions, "createGachaCode");

      const res: any = await fn({
        title,
        mode: mode === "prob" ? "probability" : "count",
        resetType,
        publicFlags,
        thumbnail,
        point: {
          cost: Number(cost),
          maxPerUser: Number(maxPerUser),
        },
        totalCount: mode === "count" ? Number(totalCount) : null,

        // ★ shippingEnabled を送信
        frames: frames.map((f) => ({
          label: f.label,
          maxCount:
            mode === "count" && typeof f.maxCount === "number"
              ? f.maxCount
              : null,
          probability:
            mode === "prob" && typeof f.probability === "number"
              ? f.probability / 100
              : null,
          rewardMin: Number(f.rewardMin),
          rewardMax: Number(f.rewardMax),
          shippingEnabled: f.shippingEnabled, // ★ 追加
        })),

        expiresAt,
      });

      setCreatedCode(res.data.code);
      alert(`作成しました！ コード：${res.data.code}`);
    } catch (e: any) {
      alert("作成に失敗：" + e.message);
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 20 }}>🎰 ガチャ作成</h1>

      <div
        style={{
          background: "white",
          padding: 20,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <input
          type="text"
          placeholder="ガチャタイトル"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />

        {/* ★ 公開設定（複数選択） */}
        <div style={boxStyle}>
          <div style={labelStyle}>公開設定（複数選択可）</div>

          <label>
            <input
              type="checkbox"
              checked={publicFlags.includes("public")}
              onChange={() => toggleFlag("public")}
            />{" "}
            全体公開
          </label>

          <label style={{ marginLeft: 16 }}>
            <input
              type="checkbox"
              checked={publicFlags.includes("limited")}
              onChange={() => toggleFlag("limited")}
            />{" "}
            限定公開
          </label>

          <label style={{ marginLeft: 16 }}>
            <input
              type="checkbox"
              checked={publicFlags.includes("subscriber")}
              onChange={() => toggleFlag("subscriber")}
            />{" "}
            サブスク限定
          </label>

          <label style={{ marginLeft: 16 }}>
            <input
              type="checkbox"
              checked={publicFlags.includes("nibuichi_winner")}
              onChange={() => toggleFlag("nibuichi_winner")}
            />{" "}
            前日のニブイチ的中者限定
          </label>
        </div>

        {/* 抽選方式 */}
        <div style={boxStyle}>
          <div style={labelStyle}>抽選方式</div>
          <label>
            <input
              type="radio"
              checked={mode === "count"}
              onChange={() => setMode("count")}
            />{" "}
            枠数方式
          </label>
          <label style={{ marginLeft: 16 }}>
            <input
              type="radio"
              checked={mode === "prob"}
              onChange={() => setMode("prob")}
            />{" "}
            確率方式
          </label>
        </div>

        {/* リセット方式 */}
        <div style={boxStyle}>
          <div style={labelStyle}>リセット方式</div>
          <label>
            <input
              type="radio"
              checked={resetType === "none"}
              onChange={() => setResetType("none")}
            />{" "}
            リセットなし
          </label>
          <label style={{ marginLeft: 16 }}>
            <input
              type="radio"
              checked={resetType === "daily"}
              onChange={() => setResetType("daily")}
            />{" "}
            デイリー（毎日6時）
          </label>
        </div>

        {/* サムネイル */}
        <div style={boxStyle}>
          <div style={labelStyle}>サムネイル画像</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {gachaImages.map((img) => (
              <img
                key={img}
                src={`/gacha/${img}`}
                onClick={() => setThumbnail(img)}
                style={{
                  width: 80,
                  height: 80,
                  objectFit: "cover",
                  borderRadius: 8,
                  cursor: "pointer",
                  border:
                    thumbnail === img ? "3px solid #2563eb" : "1px solid #ccc",
                }}
              />
            ))}
          </div>

          {thumbnail && (
            <p style={{ marginTop: 8 }}>
              選択中：<strong>{thumbnail}</strong>
            </p>
          )}
        </div>

        {/* 総数（count のみ） */}
        {mode === "count" && (
          <input
            type="number"
            placeholder="総数"
            value={totalCount}
            onChange={(e) =>
              setTotalCount(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
        )}

        {/* ポイント設定 */}
        <div style={boxStyle}>
          <div style={labelStyle}>ポイント設定</div>
          <input
            type="number"
            placeholder="消費ポイント"
            value={cost}
            onChange={(e) =>
              setCost(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
          <input
            type="number"
            placeholder="上限回数"
            value={maxPerUser}
            onChange={(e) =>
              setMaxPerUser(
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
            style={inputStyle}
          />
        </div>

        {/* 期限 */}
        <div>
          <div style={labelStyle}>締切日時</div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 枠設定 */}
        <div style={boxStyle}>
          <div style={labelStyle}>枠設定</div>

          {frames.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="枠名"
                value={f.label}
                onChange={(e) => updateFrame(i, "label", e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              />

              {mode === "count" ? (
                <input
                  type="number"
                  placeholder={i === frames.length - 1 ? "自動" : "上限数"}
                  value={f.maxCount}
                  onChange={(e) => updateFrame(i, "maxCount", e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                />
              ) : (
                <input
                  type="number"
                  placeholder={i === frames.length - 1 ? "自動" : "確率%"}
                  value={f.probability}
                  onChange={(e) =>
                    updateFrame(i, "probability", e.target.value)
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
              )}

              <input
                type="number"
                placeholder="最小"
                value={f.rewardMin}
                onChange={(e) => updateFrame(i, "rewardMin", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />

              <input
                type="number"
                placeholder="最大"
                value={f.rewardMax}
                onChange={(e) => updateFrame(i, "rewardMax", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />

              {/* ★ 発送ON/OFF */}
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={f.shippingEnabled}
                  onChange={(e) =>
                    updateFrame(i, "shippingEnabled", e.target.checked)
                  }
                />
                発送
              </label>
            </div>
          ))}

          <button
            onClick={addFrame}
            style={{
              padding: "8px 12px",
              background: "#2563eb",
              color: "white",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
            }}
          >
            ＋ 枠を追加
          </button>
        </div>

        {/* 作成ボタン */}
        <button
          onClick={handleCreate}
          disabled={loading}
          style={{
            padding: "12px",
            background: "#4f46e5",
            color: "white",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 16,
          }}
        >
          {loading ? "作成中…" : "ガチャを作成する"}
        </button>

        {createdCode && (
          <p style={{ marginTop: 12 }}>
            作成されたコード：<strong>{createdCode}</strong>
          </p>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};

const boxStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: 12,
  borderRadius: 8,
};

const labelStyle: React.CSSProperties = {
  fontWeight: "bold",
  marginBottom: 8,
};
