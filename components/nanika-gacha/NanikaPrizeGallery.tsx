"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { callNanika, NANIKA_TIERS, type NanikaPrize, type NanikaTier } from "@/app/lib/nanikaGacha";
import { NanikaFrame, nanikaError } from "./NanikaCommon";
import styles from "./nanika.module.css";

export default function NanikaPrizeGallery({ tier, embedded = false, publicCatalog = false }: {
  tier: NanikaTier; embedded?: boolean; publicCatalog?: boolean;
}) {
  const [items, setItems] = useState<NanikaPrize[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<NanikaPrize | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageError, setImageError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const pending = useRef(false);
  const load = useCallback(async (position?: string) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true); setError("");
    try {
      let result;
      if (publicCatalog) {
        const query = new URLSearchParams({ tier, ...(position ? { cursor: position } : {}) });
        const response = await fetch(`/api/nanika-gacha/prizes?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error("景品一覧を取得できませんでした。もう一度お試しください。");
        result = await response.json() as { items: NanikaPrize[]; nextCursor: string | null };
      } else {
        result = await callNanika("listNanikaGachaPrizes", { tier, ...(position ? { cursor: position } : {}) });
      }
      setItems(current => position
        ? [...current, ...result.items.filter(item => !current.some(previous => previous.id === item.id))]
        : result.items);
      setCursor(result.nextCursor);
    } catch (error) {
      setError(nanikaError(error));
    } finally {
      pending.current = false; setLoading(false);
    }
  }, [tier, publicCatalog]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  const label = NANIKA_TIERS.find(item => item.id === tier)!.label;
  const nameId = `nanika-prize-name-${tier}`;
  const gallery = <>
    {!embedded && <p>気になる景品候補を見てみましょう。画像を押すと拡大できます。掲載は当選・確保の保証ではなく、候補は抽選や受取状況により変わります。引けるかどうかはガチャ一覧でご確認ください。</p>}
    <button type="button" disabled={loading} aria-label={embedded ? `${label}の景品一覧を再取得` : undefined}
      onClick={() => void load()}>景品候補を更新</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status">景品を読み込み中…</p>}
    {!loading && !error && items.length === 0 && <p>ただいま景品を準備しています。</p>}
    <ul className={`${styles.prizeGrid} ${publicCatalog ? styles.publicPrizeGrid : ""}`}
      aria-label={embedded ? `${label}の景品一覧` : "景品の縮小画像一覧"}>
      {items.map((item, index) => <li key={item.id}>
        <button type="button" className={styles.prizeThumbnailButton} aria-label={publicCatalog ? `${item.name}を拡大` : `景品${index + 1}を拡大`}
          onClick={event => { returnFocus.current = event.currentTarget; setImageError(false); setSelected(item); }}>
          <Image src={item.image} alt="" width={320} height={320} unoptimized loading="lazy" className={styles.prizeThumbnail} />
          {publicCatalog && <span className={styles.prizeName}>{item.name}</span>}
        </button>
      </li>)}
    </ul>
    {cursor && <button type="button" disabled={loading} aria-label={embedded ? `${label}の次の50件を表示` : undefined}
      onClick={() => void load(cursor)}>次の50件を表示</button>}
    {selected && <dialog ref={dialog} className={styles.prizeDialog} aria-labelledby={nameId}
      onClose={() => { setSelected(null); returnFocus.current?.focus(); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div>
        <button type="button" onClick={() => dialog.current?.close()}>閉じる</button>
        <h2 id={nameId}>{selected.name}</h2>
        <Image key={selected.id} src={`${selected.image}?size=full`} alt={selected.name} width={1200} height={1200}
          unoptimized className={styles.prizeFullImage} onError={() => setImageError(true)} />
        {imageError && <p role="alert" className={styles.error}>拡大画像を取得できませんでした。閉じてから再度お試しください。</p>}
      </div>
    </dialog>}
  </>;
  return embedded ? gallery : <NanikaFrame title={`${label}の景品一覧`}>{gallery}</NanikaFrame>;
}
