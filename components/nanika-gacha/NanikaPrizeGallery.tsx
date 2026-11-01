"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { callNanika, NANIKA_TIERS, type NanikaPrize, type NanikaTier } from "@/app/lib/nanikaGacha";
import { NanikaFrame, nanikaError } from "./NanikaCommon";
import styles from "./nanika.module.css";

export default function NanikaPrizeGallery({ tier }: { tier: NanikaTier }) {
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
      const result = await callNanika("listNanikaGachaPrizes", { tier, ...(position ? { cursor: position } : {}) });
      setItems(current => position
        ? [...current, ...result.items.filter(item => !current.some(previous => previous.id === item.id))]
        : result.items);
      setCursor(result.nextCursor);
    } catch (error) {
      setError(nanikaError(error));
    } finally {
      pending.current = false; setLoading(false);
    }
  }, [tier]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  const label = NANIKA_TIERS.find(item => item.id === tier)!.label;
  return <NanikaFrame title={`${label}の景品一覧`}>
    <p>現在抽選できる景品の縮小画像です。画像を押すと、拡大画像と名称を表示します。在庫は抽選・受取状況により変わります。</p>
    <button type="button" disabled={loading} onClick={() => void load()}>景品一覧を再取得</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status">景品を読み込み中…</p>}
    {!loading && !error && items.length === 0 && <p>現在抽選できる景品はありません。</p>}
    <ul className={styles.prizeGrid} aria-label="景品の縮小画像一覧">
      {items.map((item, index) => <li key={item.id}>
        <button type="button" className={styles.prizeThumbnailButton} aria-label={`景品${index + 1}を拡大`}
          onClick={event => { returnFocus.current = event.currentTarget; setImageError(false); setSelected(item); }}>
          <Image src={item.image} alt="" width={320} height={320} unoptimized loading="lazy" className={styles.prizeThumbnail} />
        </button>
      </li>)}
    </ul>
    {cursor && <button type="button" disabled={loading} onClick={() => void load(cursor)}>次の50件を表示</button>}
    {selected && <dialog ref={dialog} className={styles.prizeDialog} aria-labelledby="nanika-prize-name"
      onClose={() => { setSelected(null); returnFocus.current?.focus(); }}
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div>
        <button type="button" onClick={() => dialog.current?.close()}>閉じる</button>
        <h2 id="nanika-prize-name">{selected.name}</h2>
        <Image key={selected.id} src={`${selected.image}?size=full`} alt={selected.name} width={1200} height={1200}
          unoptimized className={styles.prizeFullImage} onError={() => setImageError(true)} />
        {imageError && <p role="alert" className={styles.error}>拡大画像を取得できませんでした。閉じてから再度お試しください。</p>}
      </div>
    </dialog>}
  </NanikaFrame>;
}
