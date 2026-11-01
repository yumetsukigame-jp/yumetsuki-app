"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { callNanika, NANIKA_TIERS, type NanikaImage, type NanikaTier } from "@/app/lib/nanikaGacha";
import { useNanikaAuth, nanikaError } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";

type UploadItem = { id: string; file: File; name: string; tier: NanikaTier; done: boolean };
async function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("画像の形式が不正です"));
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
export default function NanikaImageManager() {
  const { ready, uid } = useNanikaAuth();
  const [authorized, setAuthorized] = useState(false);
  const [t, setTier] = useState<NanikaTier>("psa");
  const [past, setPast] = useState(false);
  const [items, setItems] = useState<NanikaImage[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const load = useCallback(async (position?: string) => {
    if (!uid) return;
    setError(""); setSelected([]);
    if (!position) { setItems([]); setCursor(null); }
    try {
      const result = await callNanika("adminListNanikaImages", { tier: t, past, ...(position ? { cursor: position } : {}) });
      setItems(current => position ? [...current, ...result.items] : result.items); setCursor(result.nextCursor); setAuthorized(true);
    } catch (error) { setError(nanikaError(error)); setAuthorized(false); }
  }, [uid, t, past]);
  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);
  async function upload() {
    if (guard.current) return;
    guard.current = true; setBusy(true); setError("");
    try {
      for (const [index, item] of uploads.entries()) {
        if (item.done) continue;
        if (item.file.size > 6 * 1024 * 1024) throw new Error(`${item.file.name}は6MBを超えています`);
        setProgress(`${index + 1}/${uploads.length}：${item.file.name} を処理中`);
        await callNanika("adminUploadNanikaImage", { id: item.id, tier: item.tier, name: item.name, base64: await base64(item.file) });
        setUploads(current => current.map(current => current.id === item.id ? { ...current, done: true } : current));
      }
      setProgress("一括アップロードが完了しました"); await load();
    } catch (error) { setError(`${nanikaError(error)} 完了済みの画像は保持されています。未完了分を同じIDで再送できます。`); }
    finally { guard.current = false; setBusy(false); }
  }
  async function remove(item: NanikaImage) {
    if (guard.current || !window.confirm(`${item.name}を抽選候補から外します。履歴用の画像は保持します。よろしいですか？`)) return;
    guard.current = true; setBusy(true); setError("");
    try { await callNanika("adminRemoveNanikaImage", { id: item.id }); await load(); }
    catch (error) { setError(nanikaError(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  async function purge() {
    if (guard.current || !selected.length || !window.confirm(`${selected.length}件の大きい画像を削除します。軽量な履歴画像と記録は残ります。削除は取り消せません。実行しますか？`)) return;
    guard.current = true; setBusy(true); setError("");
    try { await callNanika("adminPurgeNanikaImages", { ids: selected, confirmed: true }); await load(); }
    catch (error) { setError(nanikaError(error)); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className={styles.page}>
    <h1>画像管理：何かの景品ガチャ</h1>
    <nav className={styles.nav}><Link href="/admin/nanika-gacha">専用ガチャ管理</Link><Link href="/admin/images">従来の画像管理</Link></nav>
    {!ready ? <p>読み込み中…</p> : !uid ? <p>管理者としてログインしてください。</p> : <>
      <label>表示カテゴリ<select value={t} disabled={busy} onChange={e => { setTier(e.target.value as NanikaTier); }}>{NANIKA_TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      <label><input type="checkbox" checked={past} disabled={busy} onChange={e => setPast(e.target.checked)} />発送物・候補から削除済みの画像を表示</label>
      <button type="button" disabled={busy} onClick={() => void load()}>画像を再取得</button>
      {authorized && <section className={styles.card}><h2>画像・景品名・カテゴリを指定して一括アップロード</h2>
        <p>静止画JPEG・PNG・WebP、1ファイル6MB以下。大きい画像は240KB以下、履歴用画像は20KB以下に圧縮します。画像1枚を景品1点として登録するため、同じ実物を重複登録しないでください。</p>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} aria-label="景品画像を複数選択"
          onChange={e => { setProgress(""); setUploads(Array.from(e.target.files ?? []).map(file => ({ id: crypto.randomUUID(), file, name: file.name.replace(/\.[^.]+$/, ""), tier: t, done: false }))); }} />
        {uploads.map(item => <section className={styles.card} key={item.id}>
          <p>{item.file.name} {item.done && "— 完了"}</p>
          <label>景品名<input required maxLength={200} value={item.name} disabled={busy || item.done}
            onChange={e => setUploads(current => current.map(current => current.id === item.id ? { ...current, name: e.target.value } : current))} /></label>
          <label>カテゴリ<select value={item.tier} disabled={busy || item.done}
            onChange={e => setUploads(current => current.map(current => current.id === item.id ? { ...current, tier: e.target.value as NanikaTier } : current))}>
            {NANIKA_TIERS.map(t => <option value={t.id} key={t.id}>{t.label}</option>)}
          </select></label>
        </section>)}
        <button type="button" disabled={busy || !uploads.some(item => !item.done) || uploads.some(item => !item.name.trim())} onClick={() => void upload()}>未完了の画像を一括アップロード</button>
        {progress && <p role="status">{progress}</p>}
      </section>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {past && authorized && <div className={styles.warning}>
        <p>容量整理は発送完了・候補削除済みの大きい画像だけが対象です。未受取・発送処理中は削除できません。履歴用画像は残します。1回30件まで選択できます。</p>
        <button type="button" disabled={busy} onClick={() => setSelected(items.filter(item => item.canPurge && item.largeBytes > 0).slice(0, 30).map(item => item.id))}>削除可能な先頭30件を選択</button>
        <button type="button" className={styles.danger} disabled={busy || !selected.length} onClick={() => void purge()}>選択した{selected.length}件の大きい画像を削除</button>
      </div>}
      <div className={styles.grid}>{items.map(item => <section key={item.id} className={styles.card}>
        <Image src={item.image} alt={item.name} width={320} height={320} unoptimized className={styles.prize} />
        <h2>{item.name}</h2><p>状態：{({ ready: "抽選候補", reserved: "当選者の選択待ち", shipping: "発送物", removed: "候補削除済み" })[item.state]}</p>
        <p>大きい画像：{Math.ceil(item.largeBytes / 1024)}KB／履歴用：{Math.ceil(item.thumbnailBytes / 1024)}KB</p>
        <a href={`${item.image}?size=full`} target="_blank" rel="noopener noreferrer">画像を別画面で確認</a>
        {item.state === "ready" && <button type="button" disabled={busy} className={styles.danger} onClick={() => void remove(item)}>抽選候補から外す</button>}
        {past && item.canPurge && item.largeBytes > 0 && <label><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || (!selected.includes(item.id) && selected.length >= 30)}
          onChange={e => setSelected(current => e.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />大きい画像の削除対象にする</label>}
      </section>)}</div>
      {authorized && !error && items.length === 0 && <p>このカテゴリの画像はありません。</p>}
      {cursor && <button type="button" disabled={busy} onClick={() => void load(cursor)}>次の50件</button>}
    </>}
  </div>;
}
