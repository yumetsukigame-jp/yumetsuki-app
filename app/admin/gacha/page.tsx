"use client";

import type { DocumentData } from "firebase/firestore";

import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions, db, storage } from "@/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { parseJstDateTime } from "@/app/lib/dateTime";
import { GACHA_ANIMATION_LEVELS, frameAnimationLevel, type GachaAnimationLevel } from "@/functions/src/gachaAnimation";
import RewardDeliverySelect from "@/components/nanika-gacha/RewardDeliverySelect";
import { NANIKA_TIERS, type NanikaTier } from "@/functions/src/nanikaGachaTypes";
import styles from "./gacha-create.module.css";
import {
  GACHA_EVENT_FOLDER,
  GACHA_REGULAR_FOLDER,
  LEGACY_GACHA_FOLDER,
  isEventGachaFolder,
  isRegularGachaFolder,
} from "@/app/lib/imageFolders";

type Mode = "count" | "prob";
type ResetType = "none" | "daily" | "x_account";

type PublicFlag =
  | "public"
  | "limited"
  | "subscriber"
  | "nibuichi_winner"
  | "x_account_match"
  | "featured";

type FrameInput = {
  label: string;
  animationLevel?: GachaAnimationLevel;
  maxCount: number | "";
  probability: number | "";
  rewardMin: number | "";
  rewardMax: number | "";
  shippingEnabled: boolean;
  nanikaTier?: NanikaTier | null;
};

type GachaImage = {
  url: string;
  folder: string;
};

export default function GachaCreatePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("count");
  const [resetType, setResetType] = useState<ResetType>("none");

  const [totalCount, setTotalCount] = useState<number | "">("");
  const [frames, setFrames] = useState<FrameInput[]>([
    { label: "A", maxCount: "", probability: "", rewardMin: "", rewardMax: "", shippingEnabled: false },
    { label: "B", maxCount: "", probability: "", rewardMin: "", rewardMax: "", shippingEnabled: false },
  ]);

  const [cost, setCost] = useState<number | "">(0);
  const [maxPerUser, setMaxPerUser] = useState<number | "">(1);
  const [expiresAt, setExpiresAt] = useState("");

  const [publicFlags, setPublicFlags] = useState<PublicFlag[]>(["public"]);
  const [xAccountText, setXAccountText] = useState("");

  const [thumbnail, setThumbnail] = useState<string>("");
  const [gachaImages, setGachaImages] = useState<GachaImage[]>([]);
  const [eventImagesLoaded, setEventImagesLoaded] = useState(false);
  const [eventImagesLoading, setEventImagesLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState("");

  const loadGachaImages = async (folders: string[]) => {
    const imageQuery =
      folders.length === 1
        ? query(
            collection(db, "imageMeta"),
            where("folder", "==", folders[0])
          )
        : query(
            collection(db, "imageMeta"),
            where("folder", "in", folders)
          );
    const snap = await getDocs(imageQuery);

    const images = await Promise.all(
      snap.docs.map(async (document) => {
        const data = document.data();
        try {
          return {
            url: await getDownloadURL(ref(storage, data.path)),
            folder: data.folder,
          };
        } catch (error) {
          console.error("URL取得失敗:", data.path, error);
          return typeof data.url === "string"
            ? { url: data.url, folder: data.folder }
            : null;
        }
      })
    );

    return images.filter((image): image is GachaImage => image !== null);
  };

  useEffect(() => {
    const loadRegularImages = async () => {
      const images = await loadGachaImages([
        LEGACY_GACHA_FOLDER,
        GACHA_REGULAR_FOLDER,
      ]);
      setGachaImages(images);
    };

    void loadRegularImages();
  }, []);

  const loadEventImages = async () => {
    if (eventImagesLoaded || eventImagesLoading) return;

    setEventImagesLoading(true);
    try {
      const images = await loadGachaImages([GACHA_EVENT_FOLDER]);
      setGachaImages((current) => [...current, ...images]);
      setEventImagesLoaded(true);
    } finally {
      setEventImagesLoading(false);
    }
  };

  const toggleFlag = (flag: PublicFlag) => {
    if (flag === "x_account_match" && resetType === "x_account") {
      return;
    }

    setPublicFlags((prev) =>
      prev.includes(flag)
        ? prev.filter((f) => f !== flag)
        : [...prev, flag]
    );
  };

  const changeResetType = (nextResetType: ResetType) => {
    setResetType(nextResetType);
    if (nextResetType === "x_account") {
      setPublicFlags((current) =>
        current.includes("x_account_match")
          ? current
          : [...current, "x_account_match"]
      );
    }
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
        shippingEnabled: false,
      },
    ]);
  };

  const updateFrame = (index: number, key: keyof FrameInput, value: string | boolean) => {
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
      alert("ポイントを入力してください");
      return;
    }

    if (maxPerUser === "" || maxPerUser <= 0) {
      alert("上限回数を入力してください");
      return;
    }

    const xAccountList = xAccountText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (
      resetType === "x_account" &&
      !publicFlags.includes("x_account_match")
    ) {
      alert("Xアカウント使用型では「Xアカウント一致」が必須です");
      return;
    }

    if (
      resetType === "x_account" &&
      !xAccountList.some((account) => account.includes("@"))
    ) {
      alert("Xアカウント使用型では対象アカウントを1件以上入力してください");
      return;
    }

    // ★ 最後の枠を自動計算
    const framesForSubmission = frames.map((frame) => ({ ...frame }));
    if (mode === "count") {
      const sum = framesForSubmission.reduce(
        (acc, f, idx) =>
          idx === framesForSubmission.length - 1
            ? acc
            : acc + (typeof f.maxCount === "number" ? f.maxCount : 0),
        0
      );
      const last = Number(totalCount) - sum;
      if (last < 0) {
        alert("枠数の合計が総数を超えています");
        return;
      }
      framesForSubmission[framesForSubmission.length - 1].maxCount = last;
    } else {
      const sum = framesForSubmission.reduce(
        (acc, f, idx) =>
          idx === framesForSubmission.length - 1
            ? acc
            : acc + (typeof f.probability === "number" ? f.probability : 0),
        0
      );
      const last = 100 - sum;
      if (last < 0) {
        alert("確率の合計が100%を超えています");
        return;
      }
      framesForSubmission[framesForSubmission.length - 1].probability = last;
    }
    setFrames(framesForSubmission);

    setLoading(true);

    try {
      const fn = httpsCallable(functions, "createGachaCode");

      const res: DocumentData = await fn({
        title,
        description,
        mode: mode === "prob" ? "probability" : "count",
        resetType,
        publicFlags,
        thumbnail, // ★ getDownloadURL で取得した正しい URL
        point: {
          cost: Number(cost),
          maxPerUser: Number(maxPerUser),
        },
        totalCount: mode === "count" ? Number(totalCount) : null,

        frames: framesForSubmission.map((f, index) => ({
          label: f.label,
          animationLevel: frameAnimationLevel(f.animationLevel, index, framesForSubmission.length),
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
          shippingEnabled: f.shippingEnabled,
          nanikaTier: f.nanikaTier ?? null,
        })),

        expiresAt: expiresAt ? parseJstDateTime(expiresAt).toISOString() : "",

        xAccountList,
      });

      setCreatedCode(res.data.code);
      alert(`作成しました！ コード：${res.data.code}`);
    } catch (e: unknown) {
      alert("作成に失敗：" + (e instanceof Error ? e.message : "不明なエラー"));
    }

    setLoading(false);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>🎰 ガチャ作成</h1>

      <div className={styles.form}>
        <label className={styles.field}>
          ガチャタイトル
          <input
            type="text"
            placeholder="ガチャタイトル"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          ガチャの説明文（任意）
          <textarea
            placeholder="ガチャの説明文（任意）"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />
        </label>

        <section className={styles.panel} aria-labelledby="public-flags-heading">
          <h2 id="public-flags-heading">公開設定（複数選択可）</h2>
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("public")} onChange={() => toggleFlag("public")} />
              全体公開
            </label>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("limited")} onChange={() => toggleFlag("limited")} />
              限定公開
            </label>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("subscriber")} onChange={() => toggleFlag("subscriber")} />
              サブスク限定
            </label>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("nibuichi_winner")} onChange={() => toggleFlag("nibuichi_winner")} />
              前日のニブイチ的中者限定
            </label>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("x_account_match")} disabled={resetType === "x_account"} onChange={() => toggleFlag("x_account_match")} />
              Xアカウント一致
            </label>
            <label className={styles.choice}>
              <input type="checkbox" checked={publicFlags.includes("featured")} onChange={() => toggleFlag("featured")} />
              強調表示（一覧で上位表示）
            </label>
          </div>
        </section>

        {publicFlags.includes("x_account_match") && (
          <label className={styles.field}>
            Xアカウント一覧（長文貼り付けOK）
            <textarea
              placeholder="長文貼り付けOK"
              value={xAccountText}
              onChange={(e) => setXAccountText(e.target.value)}
              rows={6}
            />
          </label>
        )}

        <section className={styles.panel} aria-labelledby="draw-mode-heading">
          <h2 id="draw-mode-heading">抽選方式</h2>
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="radio" name="draw-mode" checked={mode === "count"} onChange={() => setMode("count")} />
              枠数方式
            </label>
            <label className={styles.choice}>
              <input type="radio" name="draw-mode" checked={mode === "prob"} onChange={() => setMode("prob")} />
              確率方式
            </label>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="reset-type-heading">
          <h2 id="reset-type-heading">リセット方式</h2>
          <div className={styles.choices}>
            <label className={styles.choice}>
              <input type="radio" name="reset-type" checked={resetType === "none"} onChange={() => changeResetType("none")} />
              リセットなし
            </label>
            <label className={styles.choice}>
              <input type="radio" name="reset-type" checked={resetType === "daily"} onChange={() => changeResetType("daily")} />
              デイリー（毎日6時）
            </label>
            <label className={styles.choice}>
              <input type="radio" name="reset-type" checked={resetType === "x_account"} onChange={() => changeResetType("x_account")} />
              Xアカウント使用型
            </label>
          </div>
          {resetType === "x_account" && (
            <p className={styles.hint}>
              一致したXアカウントの行を抽選後に1行削除します。登録行数が利用可能回数になります。
            </p>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="thumbnail-heading">
          <h2 id="thumbnail-heading">サムネイル画像</h2>

          <div className={styles.imageGroup} role="group" aria-label="レギュラーのサムネイル画像">
            <h3>レギュラー</h3>
            <ImageChoices
              images={gachaImages.filter((image) =>
                isRegularGachaFolder(image.folder)
              )}
              thumbnail={thumbnail}
              onSelect={setThumbnail}
            />
          </div>

          <div className={styles.imageGroup} role="group" aria-label="イベントのサムネイル画像">
            <h3>イベント</h3>
            {!eventImagesLoaded ? (
              <button
                type="button"
                onClick={() => void loadEventImages()}
                disabled={eventImagesLoading}
                className={styles.secondaryButton}
              >
                {eventImagesLoading
                  ? "イベント画像を読み込み中…"
                  : "イベント画像を読み込む"}
              </button>
            ) : (
              <ImageChoices
                images={gachaImages.filter((image) =>
                  isEventGachaFolder(image.folder)
                )}
                thumbnail={thumbnail}
                onSelect={setThumbnail}
              />
            )}
          </div>

          {thumbnail && (
            <p className={styles.selectedImage}>
              選択中：<strong>{thumbnail}</strong>
            </p>
          )}
        </section>

        {mode === "count" && (
          <label className={styles.field}>
            総数
            <input
              type="number"
              inputMode="numeric"
              placeholder="総数"
              value={totalCount}
              onChange={(e) =>
                setTotalCount(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </label>
        )}

        <section className={styles.panel} aria-labelledby="points-heading">
          <h2 id="points-heading">ポイント設定</h2>
          <div className={styles.fields}>
            <label className={styles.field}>
              消費ポイント
              <input
                type="number"
                inputMode="numeric"
                placeholder="消費ポイント"
                value={cost}
                onChange={(e) =>
                  setCost(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </label>
            <label className={styles.field}>
              上限回数
              <input
                type="number"
                inputMode="numeric"
                placeholder="上限回数"
                value={maxPerUser}
                onChange={(e) =>
                  setMaxPerUser(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
            </label>
          </div>
        </section>

        <label className={styles.field}>
          締切日時（日本時間・JST）
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>

        <section className={styles.panel} aria-labelledby="frames-heading">
          <h2 id="frames-heading">枠設定</h2>
          <p className={styles.hint}>最後の枠の上限数・確率は、作成時に残りの分を自動計算します。</p>

          {frames.map((f, i) => (
            <section key={i} className={styles.frameCard} aria-labelledby={`frame-heading-${i}`}>
              <h3 id={`frame-heading-${i}`}>枠 {i + 1}{i === frames.length - 1 ? "（最後の枠）" : ""}</h3>
              <div className={styles.fields}>
                <label className={`${styles.field} ${styles.fullWidth}`}>
                  枠名
                  <input
                    type="text"
                    placeholder="枠名"
                    value={f.label}
                    onChange={(e) => updateFrame(i, "label", e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  演出
                  <select value={frameAnimationLevel(f.animationLevel, i, frames.length)}
                    onChange={e => updateFrame(i, "animationLevel", e.target.value)}>
                    {GACHA_ANIMATION_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  {mode === "count" ? "上限数" : "確率（%）"}{i === frames.length - 1 ? "（自動計算）" : ""}
                  {mode === "count" ? (
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder={i === frames.length - 1 ? "自動" : "上限数"}
                      value={f.maxCount}
                      onChange={(e) => updateFrame(i, "maxCount", e.target.value)}
                    />
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder={i === frames.length - 1 ? "自動" : "確率%"}
                      value={f.probability}
                      onChange={(e) => updateFrame(i, "probability", e.target.value)}
                    />
                  )}
                </label>
                <div className={`${styles.numberPair} ${styles.fullWidth}`}>
                  <label className={styles.field}>
                    最小報酬（pt）
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="最小"
                      value={f.rewardMin}
                      onChange={(e) => updateFrame(i, "rewardMin", e.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    最大報酬（pt）
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="最大"
                      value={f.rewardMax}
                      onChange={(e) => updateFrame(i, "rewardMax", e.target.value)}
                    />
                  </label>
                </div>
                <RewardDeliverySelect
                  className={`${styles.field} ${styles.fullWidth}`}
                  includePoints
                  value={f.nanikaTier ?? (f.shippingEnabled ? "shipping" : "points")}
                  onChange={value => setFrames(current => current.map((frame, index) => index === i
                    ? { ...frame, shippingEnabled: value !== "points", nanikaTier: value === "points" || value === "shipping" ? null : value }
                    : frame))}
                />
                {f.nanikaTier && (
                  <p className={`${styles.hint} ${styles.fullWidth}`}>
                    {NANIKA_TIERS.find(tier => tier.id === f.nanikaTier)?.label}の当選権利（1回分・取得後の抽選は0 pt）
                  </p>
                )}
              </div>
            </section>
          ))}

          <button type="button" onClick={addFrame} className={styles.secondaryButton}>
            ＋ 枠を追加
          </button>
        </section>

        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className={styles.primaryButton}
        >
          {loading ? "作成中…" : "ガチャを作成する"}
        </button>

        {createdCode && (
          <p className={styles.selectedImage}>
            作成されたコード：<strong>{createdCode}</strong>
          </p>
        )}
      </div>
    </div>
  );
}
type ImageChoicesProps = {
  images: GachaImage[];
  thumbnail: string;
  onSelect: (url: string) => void;
};

function ImageChoices({
  images,
  thumbnail,
  onSelect,
}: ImageChoicesProps) {
  if (images.length === 0) {
    return (
      <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
        画像はありません
      </p>
    );
  }

  return (
    <div className={styles.imageGrid}>
      {images.map((image, index) => (
        <button
          type="button"
          key={image.url}
          onClick={() => onSelect(image.url)}
          className={styles.imageChoice}
          aria-label={`サムネイル ${index + 1} を選択`}
          aria-pressed={thumbnail === image.url}
        >
          <img src={image.url} alt="" />
        </button>
      ))}
    </div>
  );
}
