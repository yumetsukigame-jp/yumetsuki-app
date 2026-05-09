"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";

type Mode = "count" | "prob";

type FrameInput = {
  label: string;
  maxCount: number | "";
  probability: number | "";
  rewardMin: number | "";
  rewardMax: number | "";
};

export default function GachaCreatePage() {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("count");
  const [totalCount, setTotalCount] = useState<number | "">("");
  const [frames, setFrames] = useState<FrameInput[]>([
    { label: "A", maxCount: "", probability: "", rewardMin: "", rewardMax: "" },
    { label: "B", maxCount: "", probability: "", rewardMin: "", rewardMax: "" },
  ]);
  const [cost, setCost] = useState<number | "">(0);
  const [maxPerUser, setMaxPerUser] = useState<number | "">(1);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [publicFlag, setPublicFlag] = useState(false); // ★ 公開/限定
  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState("");

  const addFrame = () => {
    setFrames((prev) => [
      ...prev,
      {
        label: `枠${prev.length + 1}`,
        maxCount: "",
        probability: "",
        rewardMin: "",
        rewardMax: "",
      },
    ]);
  };

  const updateFrame = (index: number, key: keyof FrameInput, value: string) => {
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
                  : value,
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
      alert("1回あたりのポイントを入力してください（0以上）");
      return;
    }

    if (maxPerUser === "" || maxPerUser <= 0) {
      alert("1ユーザーの上限回数を1以上で入力してください");
      return;
    }

    // ★ 枠の自動計算（旧コードの仕様を完全維持）
    if (mode === "count") {
      const sum = frames.reduce(
        (acc, f, idx) =>
          idx === frames.length - 1
            ? acc
            : acc + (typeof f.maxCount === "number" ? f.maxCount : 0),
        0
      );
      const lastMax = typeof totalCount === "number" ? totalCount - sum : 0;

      if (lastMax < 0) {
        alert("総数より他の枠の合計が多くなっています");
        return;
      }

      frames[frames.length - 1].maxCount = lastMax;
    } else {
      const sumProb = frames.reduce(
        (acc, f, idx) =>
          idx === frames.length - 1
            ? acc
            : acc + (typeof f.probability === "number" ? f.probability : 0),
        0
      );
      const lastProb = 100 - sumProb;

      if (lastProb < 0) {
        alert("確率の合計が100%を超えています");
        return;
      }

      frames[frames.length - 1].probability = lastProb;
    }

    setLoading(true);

    try {
      const fn = httpsCallable(functions, "createGachaCode");

      const res: any = await fn({
        title,
        mode,
        point: {
          cost: typeof cost === "number" ? cost : 0,
          maxPerUser: typeof maxPerUser === "number" ? maxPerUser : 1,
        },
        totalCount: mode === "count" ? totalCount : null,
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
          rewardMin: typeof f.rewardMin === "number" ? f.rewardMin : 0,
          rewardMax: typeof f.rewardMax === "number" ? f.rewardMax : 0,
        })),
        expiresAt,
        publicFlag, // ★ 公開/限定
      });

      setCreatedCode(res.data.code);
      alert(`ガチャを作成しました！ コード：${res.data.code}`);

      // 初期化
      setTitle("");
      setTotalCount("");
      setFrames([
        { label: "A", maxCount: "", probability: "", rewardMin: "", rewardMax: "" },
        { label: "B", maxCount: "", probability: "", rewardMin: "", rewardMax: "" },
      ]);
      setCost(0);
      setMaxPerUser(1);
      setExpiresAt("");
      setPublicFlag(false);
    } catch (e: any) {
      alert("作成に失敗しました：" + e.message);
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

        {/* 公開設定 */}
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>公開設定</div>
          <label style={{ marginRight: 16 }}>
            <input
              type="radio"
              checked={publicFlag === true}
              onChange={() => setPublicFlag(true)}
            />{" "}
            公開（一覧に表示）
          </label>
          <label>
            <input
              type="radio"
              checked={publicFlag === false}
              onChange={() => setPublicFlag(false)}
            />{" "}
            限定（コード入力のみ）
          </label>
        </div>

        {/* ガチャ方式 */}
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>ガチャ方式</div>
          <label style={{ marginRight: 16 }}>
            <input
              type="radio"
              value="count"
              checked={mode === "count"}
              onChange={() => setMode("count")}
            />{" "}
            枠数方式
          </label>
          <label>
            <input
              type="radio"
              value="prob"
              checked={mode === "prob"}
              onChange={() => setMode("prob")}
            />{" "}
            確率方式
          </label>
        </div>

        {/* 総数 */}
        {mode === "count" && (
          <input
            type="number"
            placeholder="総数（例：100）"
            value={totalCount}
            onChange={(e) =>
              setTotalCount(e.target.value === "" ? "" : Number(e.target.value))
            }
            style={inputStyle}
          />
        )}

        {/* ポイント設定 */}
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>ポイント設定</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              placeholder="消費ポイント"
              value={cost}
              onChange={(e) =>
                setCost(e.target.value === "" ? "" : Number(e.target.value))
              }
              style={{ ...inputStyle, flex: 1 }}
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
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
        </div>

        {/* 期限 */}
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>締切日時</div>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* 枠設定 */}
        <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
          <div style={{ fontWeight: "bold", marginBottom: 8 }}>枠設定</div>

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
                  placeholder={
                    i === frames.length - 1 ? "自動計算" : "上限数"
                  }
                  value={f.maxCount}
                  onChange={(e) => updateFrame(i, "maxCount", e.target.value)}
                  disabled={i === frames.length - 1}
                  style={{ ...inputStyle, flex: 1 }}
                />
              ) : (
                <input
                  type="number"
                  placeholder={
                    i === frames.length - 1 ? "自動計算" : "確率（%）"
                  }
                  value={f.probability}
                  onChange={(e) =>
                    updateFrame(i, "probability", e.target.value)
                  }
                  disabled={i === frames.length - 1}
                  style={{ ...inputStyle, flex: 1 }}
                />
              )}

              {/* 報酬 */}
              <input
                type="number"
                placeholder="最小Pt"
                value={f.rewardMin}
                onChange={(e) => updateFrame(i, "rewardMin", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="number"
                placeholder="最大Pt"
                value={f.rewardMax}
                onChange={(e) => updateFrame(i, "rewardMax", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={addFrame}
            style={{
              marginTop: 8,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #2563eb",
              background: "white",
              color: "#2563eb",
              cursor: "pointer",
            }}
          >
            ＋ 枠を追加
          </button>
        </div>

        <button
          onClick={handleCreate}
          disabled={loading}
          style={{
            padding: 12,
            background: loading ? "#999" : "#4f46e5",
            color: "white",
            borderRadius: 8,
            border: "none",
            fontSize: 18,
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: 8,
          }}
        >
          {loading ? "作成中…" : "ガチャを作成する"}
        </button>

        {/* 生成されたコード表示 */}
        {createdCode && (
          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: "#f0f9ff",
              borderRadius: 8,
              border: "1px solid #38bdf8",
            }}
          >
            <h3>🎉 作成されたガチャコード</h3>
            <p style={{ fontSize: 20, fontWeight: "bold" }}>{createdCode}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: 10,
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 16,
  width: "100%",
};
