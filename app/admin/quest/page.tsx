"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { auth, db, storage } from "@/firebase";
import { formatJstDateTime, parseJstDateTime } from "@/app/lib/dateTime";
import { questCall, questError, questFlags, questGroups } from "@/app/lib/quest";
import { GACHA_EVENT_FOLDER, GACHA_REGULAR_FOLDER, LEGACY_GACHA_FOLDER } from "@/app/lib/imageFolders";
import type { QuestDraft, QuestFlag, QuestPublicRun, QuestRules, QuestSimulation } from "@/functions/src/quest/types";
import { QUEST_MENU_LABELS, type QuestMenuAccess, type QuestMenuMode } from "@/functions/src/quest/menu";
import styles from "@/components/quest/quest.module.css";

const numericFields = {
  stepStarPoints: "１歩あたりの星ポイント", levelPoints: "１レベル上がる星ポイント",
  levelScore: "レベル上昇ごとの評価加点", percentMax: "達成率100%に相当する評価点",
  percentDecimals: "達成率の小数桁（０〜２）", middleMin: "中間の下限評価点",
  upperMin: "上位の下限評価点", topMinProgress: "最上位の塔進捗点（59〜66）", topMinLevel: "最上位の必要レベル",
} as const;
type Numeric = keyof typeof numericFields;
const recommendedNumbers: Record<Numeric, number> = {
  stepStarPoints: 1, levelPoints: 12, levelScore: 2, percentMax: 80, percentDecimals: 1,
  middleMin: 52, upperMin: 68, topMinProgress: 66, topMinLevel: 6,
};
type AdminRun = QuestPublicRun & { xAccountList: string[]; simulation: QuestSimulation[] | null; simulatedVersion: number | null };
type Listing = { items: AdminRun[]; nextCursor: string | null };
type BulkRequest = { runId: string; grantId: string; count: number; reason: string; expectedTotal: number };
type DeleteRequest = { runId: string; version: number; title: string; confirmed: true };
const runStates = { draft: "下書き", published: "公開中", settling: "集計中", archived: "アーカイブ", deleting: "削除中" };
const deleteKey = () => `quest-delete-request:${auth.currentUser?.uid}`;
function savedDeleteRequest(): DeleteRequest | null {
  try {
    if (!auth.currentUser) return null;
    const value = JSON.parse(localStorage.getItem(deleteKey()) ?? "null");
    return value && /^[a-zA-Z0-9_-]{1,128}$/.test(value.runId) && Number.isSafeInteger(value.version) && value.version >= 1 &&
      typeof value.title === "string" && value.title.length > 0 && value.title.length <= 120 && value.confirmed === true ? value : null;
  } catch { return null; }
}
const bulkKey = (runId: string) => `quest-bulk-request:${auth.currentUser?.uid}:${runId}`;
function savedBulkRequest(runId: string): BulkRequest | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(bulkKey(runId)) ?? "null");
    return value?.runId === runId && typeof value.grantId === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value.grantId) &&
      Number.isInteger(value.count) && value.count >= 1 && value.count <= 99 &&
      Number.isInteger(value.expectedTotal) && value.expectedTotal >= 0 && value.expectedTotal <= 99 &&
      typeof value.reason === "string" && value.reason.trim().length > 0 && value.reason.length <= 500 ? value : null;
  } catch { return null; }
}
const localJst = (ms: number) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16);
function numberValue(value: string, label: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${label}を入力してください`);
  return Number(value);
}
function newForm() {
  return { maxTurns: "14", psaLimit: "0", title: "", description: "", thumbnail: "/quest/menu-thumbnail-v2.jpg", startsAt: "", endsAt: "",
    flags: ["public"] as QuestFlag[], xText: "", accessCode: "",
    numbers: Object.fromEntries(Object.entries(recommendedNumbers).map(([key, value]) => [key, String(value)])) as Record<Numeric, string>,
    distribution: "" as "" | QuestRules["distribution"]["mode"], releaseAt: Array<string>(99).fill(""), dailyHour: "",
    rescue: "" as "" | "yes" | "no", adminRescue: false, eventSources: [] as QuestRules["rescue"]["eventSources"],
    rescueFrom: "", rescueBelow: "", rescueMax: "", rescueRate: "", rescueTurn: "" };
}
type Form = ReturnType<typeof newForm>;
function fromRun(run: AdminRun): Form {
  const r = run.rules;
  return { maxTurns: String(r.maxTurns), psaLimit: String(r.psaLimit ?? 0), title: run.title, description: run.description, thumbnail: run.thumbnail,
    startsAt: localJst(run.startsAt), endsAt: localJst(run.endsAt), flags: run.publicFlags,
    xText: run.xAccountList.join("\n"), accessCode: "",
    numbers: Object.fromEntries(Object.keys(numericFields).map(key => [key, String(r[key as Numeric])])) as Record<Numeric, string>,
    distribution: r.distribution.mode, releaseAt: Array.from({ length: 99 }, (_, index) =>
      r.distribution.releaseAt[index] === undefined ? "" : localJst(r.distribution.releaseAt[index])),
    dailyHour: String(r.distribution.dailyStartHourJst), rescue: r.rescue.enabled ? "yes" : "no",
    adminRescue: r.rescue.adminEnabled, eventSources: r.rescue.eventSources, rescueFrom: String(r.rescue.fromTurn),
    rescueBelow: String(r.rescue.belowScore), rescueMax: String(r.rescue.maxGrants),
    rescueRate: String(r.rescue.simulationRate * 100), rescueTurn: String(r.rescue.simulationTurn) };
}
function toDraft(form: Form, boardVersion: QuestRules["boardVersion"]): QuestDraft {
  const maxTurns = numberValue(form.maxTurns, "使用上限");
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 99) throw new Error("使用上限は１〜99回です");
  if (!form.distribution || !form.rescue) throw new Error("配布方式と救済の有無を明示的に選んでください");
  const numbers = Object.fromEntries(Object.entries(form.numbers).map(([key, value]) => [key, numberValue(value, numericFields[key as Numeric])])) as Record<Numeric, number>;
  const distribution: QuestRules["distribution"] = {
    mode: form.distribution, releaseAt: form.distribution === "schedule" ? form.releaseAt.slice(0,maxTurns).map(value => parseJstDateTime(value).getTime()) : [],
    dailyStartHourJst: form.distribution === "daily" ? numberValue(form.dailyHour, "日次切替時刻") : 0,
  };
  const rescue: QuestRules["rescue"] = form.rescue === "no"
    ? { enabled: false, adminEnabled: false, eventSources: [], fromTurn: maxTurns, belowScore: numbers.middleMin,
      maxGrants: 1, simulationRate: 0, simulationTurn: maxTurns }
    : { enabled: true, adminEnabled: form.adminRescue, eventSources: form.eventSources,
      fromTurn: numberValue(form.rescueFrom, "救済を使える使用回数"), belowScore: numberValue(form.rescueBelow, "救済対象の評価点上限"),
      maxGrants: numberValue(form.rescueMax, "救済付与上限"), simulationRate: form.rescueRate.trim() ? numberValue(form.rescueRate, "試算時の救済保有率") / 100 : 0,
      simulationTurn: Math.min(maxTurns, form.rescueTurn.trim() ? numberValue(form.rescueTurn, "試算時の救済使用回") : maxTurns) };
  return { title: form.title, description: form.description, thumbnail: form.thumbnail,
    startsAt: parseJstDateTime(form.startsAt).getTime(), endsAt: parseJstDateTime(form.endsAt).getTime(),
    publicFlags: form.flags, xAccountList: form.xText.split(/\r?\n/).map(line => line.trim()).filter(Boolean), accessCode: form.accessCode,
    rules: { boardVersion, maxTurns, psaLimit: numberValue(form.psaLimit, "PSAチケット上限"), ...numbers, distribution, rescue } };
}
export default function QuestAdminPage() {
  const [form, setForm] = useState(newForm);
  const [selected, setSelected] = useState<AdminRun | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<string[]>(["/quest/menu-thumbnail-v2.jpg"]);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [grant, setGrant] = useState({ uid: "", grantId: "", kind: "normal", count: "", reason: "" });
  const [bulk, setBulk] = useState({ count: "1", reason: "通常サイコロの全体配布" });
  const [pendingBulk, setPendingBulk] = useState<BulkRequest | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteRequest | null>(null);
  const [deleteTitle, setDeleteTitle] = useState("");
  const [menuAccess, setMenuAccess] = useState<QuestMenuAccess | null>(null);
  const [menuMode, setMenuMode] = useState<QuestMenuMode>("admin");
  const editable = !selected || selected.state === "draft";
  const currentBulk = pendingBulk?.runId === selected?.id ? pendingBulk : null;
  const publishBlockers = [
    dirty ? "変更した開催設定を下書き保存してください。" : null,
    !confirmed ? "下の設定確認にチェックしてください。" : null,
  ].filter((message): message is string => message !== null);
  function change<K extends keyof Form>(key: K, value: Form[K]) {
    setForm(previous => ({ ...previous, [key]: value })); setDirty(true); setConfirmed(false);
  }
  async function load(cursor?: string) {
    const value = await questCall<Listing>("adminListQuest", cursor ? { cursor } : {});
    setListing(previous => ({ ...value, items: cursor && previous ? [...previous.items, ...value.items] : value.items }));
    return value;
  }
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, () => { if (active) setPendingDelete(savedDeleteRequest()); });
    questCall<Listing>("adminListQuest", {}).then(value => { if (active) setListing(value); })
      .catch(error => { if (active) setError(questError(error)); });
    questCall<QuestMenuAccess>("getQuestMenuAccess", {}).then(value => {
      if (active) { setMenuAccess(value); setMenuMode(value.mode); }
    }).catch(error => { if (active) setError(questError(error)); });
    return () => { active = false; unsubscribe(); };
  }, []);
  async function work(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (error) { setError(questError(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  function pick(run: AdminRun) {
    setSelected(run); setForm(fromRun(run)); setConfirmed(false); setDirty(false); setError(""); setStatus("");
    setDeleteTitle("");
    const pending = savedBulkRequest(run.id);
    setPendingBulk(pending);
    setBulk({ count: String(pending?.count ?? 1), reason: pending?.reason ?? "通常サイコロの全体配布" });
  }
  async function refreshSelected(id: string) {
    const [, value] = await Promise.all([load(), questCall<Listing>("adminListQuest", { runId: id })]);
    const item = value.items[0];
    if (item) { setSelected(item); setForm(fromRun(item)); setDirty(false); }
    else { setSelected(null); setForm(newForm()); setDirty(false); }
  }
  function clearDeleteRequest(runId: string) {
    setPendingDelete(previous => previous?.runId === runId ? null : previous);
    try {
      if (savedDeleteRequest()?.runId === runId) localStorage.removeItem(deleteKey());
    } catch { /* Server cleanup can resume without browser storage. */ }
  }
  async function deleteRun(retry?: DeleteRequest) {
    const run = selected, actor = auth.currentUser?.uid;
    if (!actor) return;
    if (!retry && (!run || deleteTitle.trim() !== run.title)) return;
    await work(async () => {
      if (!retry && !window.confirm(`「${run!.title}」と参加者・進行・結果を完全削除します。元に戻せません。実行しますか？`)) return;
      const request: DeleteRequest = retry ?? { runId: run!.id, version: run!.version, title: run!.title, confirmed: true };
      setPendingDelete(request);
      try { localStorage.setItem(deleteKey(), JSON.stringify(request)); } catch { /* The server retains a resumable deletion record. */ }
      try {
        await questCall("adminDeleteQuest", request, 600000);
      } catch (error) {
        if (auth.currentUser?.uid !== actor) return;
        if (["functions/aborted", "functions/invalid-argument", "functions/failed-precondition", "functions/not-found"].includes((error as { code?: string }).code ?? "")) clearDeleteRequest(request.runId);
        await (selected?.id === request.runId ? refreshSelected(request.runId) : load()).catch(() => undefined);
        throw error;
      }
      if (auth.currentUser?.uid !== actor) return;
      clearDeleteRequest(request.runId); clearBulkRequest(request.runId);
      if (selected?.id === request.runId) { setSelected(null); setForm(newForm()); setDirty(false); setConfirmed(false); }
      setDeleteTitle("");
      await load();
      setStatus(`「${request.title}」を完全削除しました。`);
    });
  }
  function clearBulkRequest(runId: string) {
    setPendingBulk(previous => previous?.runId === runId ? null : previous);
    try { sessionStorage.removeItem(bulkKey(runId)); } catch { /* The server also guards the cumulative total. */ }
  }
  async function releaseBulkDice() {
    const run = selected;
    if (!run) return;
    await work(async () => {
      if (!currentBulk && !window.confirm("開催全体のサイコロ配布数を進めます。途中参加者にも配布済み分を渡し、個別付与分との合計は開催の使用上限までです。実行しますか？")) return;
      const request: BulkRequest = currentBulk ?? { runId: run.id, grantId: crypto.randomUUID(),
        count: numberValue(bulk.count, "全体への配布数"), reason: bulk.reason.trim(), expectedTotal: run.adminReleased ?? 0 };
      setPendingBulk(request);
      try { sessionStorage.setItem(bulkKey(run.id), JSON.stringify(request)); } catch { /* Keep the same request in memory if storage is unavailable. */ }
      let result: { granted: boolean; releasedTotal: number; count: number };
      try {
        result = await questCall("adminReleaseQuestDice", request);
      } catch (error) {
        if (["functions/aborted", "functions/failed-precondition", "functions/invalid-argument", "functions/already-exists", "functions/not-found"].includes((error as { code?: string }).code ?? "")) {
          clearBulkRequest(run.id);
          await refreshSelected(run.id).catch(() => undefined);
        }
        throw error;
      }
      clearBulkRequest(run.id);
      await refreshSelected(run.id);
      setStatus(result.granted
        ? `全体へ${result.count}個配布しました（累計${result.releasedTotal}／${run.rules.maxTurns}個）。`
        : "この配布IDは反映済みです。追加の付与はしていません。");
    });
  }
  async function loadImages(event: boolean) {
    await work(async () => {
      const folders = event ? [GACHA_EVENT_FOLDER] : [LEGACY_GACHA_FOLDER, GACHA_REGULAR_FOLDER];
      const snapshot = await getDocs(query(collection(db, "imageMeta"), where("folder", "in", folders)));
      const urls = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data();
        try { return await getDownloadURL(ref(storage, data.path)); }
        catch { return typeof data.url === "string" ? data.url : null; }
      }));
      setImages(previous => [...new Set([...previous, ...urls.filter((url): url is string => !!url)])]);
    });
  }
  return <main className={`${styles.page} ${styles.adminPage}`}>
    <nav className={styles.nav}><Link href="/admin">管理者トップ</Link><Link href="/quest">利用者画面</Link><Link href="/quest/guide">遊び方</Link></nav>
    <h1>ゆめつきクエスト 開催管理</h1>
    <nav className={styles.nav}><a href="#quest-runs">開催一覧</a><a href="#quest-settings">開催設定</a><a href="#quest-menu">メニュー公開範囲</a></nav>
    <p className={styles.small}>下書き保存 → 設定確認 → 公開。試算は任意です。公開後の設定は変更できません。</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p role="status">{status}</p>
    {pendingDelete && <div className={styles.notice}><p>「{pendingDelete.title}」の削除結果を確認できていません。</p>
      <button disabled={busy} onClick={() => void deleteRun(pendingDelete)}>削除を再開・確認</button></div>}
    <section id="quest-runs" className={styles.panel}><h2>開催一覧</h2>
      <button disabled={busy} onClick={() => { setSelected(null); setForm(newForm()); setDirty(false); setConfirmed(false); }}>新しい開催を作る</button>
      <ul className={styles.ranking}>{listing?.items.map(run => <li key={run.id} className={selected?.id === run.id ? styles.ownRow : undefined}>
        <strong>{run.title} ／ {runStates[run.state]}</strong>
        <small>終了 {formatJstDateTime(new Date(run.endsAt))}</small>
        <button disabled={busy} onClick={() => pick(run)}>この開催を選択</button></li>)}</ul>
      {listing?.nextCursor && <button disabled={busy} onClick={() => void work(async () => { await load(listing.nextCursor!); })}>さらに20件</button>}
      <button disabled={busy} onClick={() => void work(async () => { await load(); })}>一覧を更新</button>
    </section>
    {selected && <section className={styles.panel}>
      <h2>{selected.title} ／ {runStates[selected.state]}</h2>
      <p className={styles.small}>開催ID：{selected.id}</p>
      <details className={styles.deleteDetails} open={selected.state === "deleting"}>
        <summary>開催を完全削除</summary>
        <p>参加者・進行・結果も削除します。公開中の開催は停止され、元に戻せません。</p>
        <label className={styles.deleteLabel}>削除する開催名を入力<input maxLength={120} value={deleteTitle} onChange={event => setDeleteTitle(event.target.value)} autoComplete="off" /></label>
        <button type="button" className={styles.danger} disabled={busy || !!pendingDelete || deleteTitle.trim() !== selected.title} onClick={() => void deleteRun()}>この開催を完全削除する</button>
      </details>
    </section>}
    <details id="quest-settings" className={styles.panel} open={editable}>
    <summary>開催設定</summary>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault();
      void work(async () => {
        const result = await questCall<{ runId: string; version: number }>("adminSaveQuest", {
          ...(selected ? { runId: selected.id, version: selected.version } : {}), draft: toDraft(form, selected?.rules.boardVersion ?? "quest-board-v3"),
        });
        await refreshSelected(result.runId); setConfirmed(false); setStatus("下書きを保存しました。設定を確認して公開できます。");
      });
    }}>
      <h2>{selected ? `${selected.title} の設定` : "新規開催の設定"}</h2>
      {selected && <p className={styles.small}>版 {selected.version}。{editable ? "限定コードは保存しません。再保存時に入力してください。" : "公開後の設定は閲覧のみです。"}</p>}
      <fieldset disabled={busy || !editable} className={styles.form}>
        <label>開催名<input required maxLength={120} value={form.title} onChange={event => change("title", event.target.value)} /></label>
        <label>開催の説明<textarea maxLength={2000} value={form.description} onChange={event => change("description", event.target.value)} /></label>
        <div className={styles.fields}><label>開始日時（日本時間）<input type="datetime-local" required value={form.startsAt} onChange={event => change("startsAt", event.target.value)} /></label>
          <label>終了日時（日本時間）<input type="datetime-local" required value={form.endsAt} onChange={event => change("endsAt", event.target.value)} /></label></div>
        <h3>サムネイル画像</h3>
        <div className={styles.imageChoices}>{[...new Set([form.thumbnail, ...images])].map(url => <button key={url} type="button" aria-label={`画像を選択 ${url.split("/").pop()?.split("?")[0]}`}
          aria-pressed={form.thumbnail === url} onClick={() => change("thumbnail", url)}><Image src={url} width={132} height={88} unoptimized alt="" /></button>)}</div>
        <div><button type="button" onClick={() => void loadImages(false)}>ガチャと同じレギュラー画像を読み込む</button>
          <button type="button" onClick={() => void loadImages(true)}>イベント画像を読み込む</button></div>
        <label>画像URL（選択画像から変更する場合）<input value={form.thumbnail} required onChange={event => change("thumbnail", event.target.value)} /></label>
        <h3>公開条件・参加対象</h3>
        {Object.entries(questFlags).map(([value, label]) => <label key={value} className={styles.check}><input type="checkbox" checked={form.flags.includes(value as QuestFlag)}
          onChange={event => change("flags", event.target.checked ? [...form.flags, value as QuestFlag] : form.flags.filter(flag => flag !== value))} />{label}</label>)}
        <p className={styles.small}>全体公開は一覧表示。その他の参加条件は、選択したものをすべて適用します。</p>
        {(!form.flags.includes("public") || form.flags.includes("limited")) && <label>この回の専用コード（８文字以上）<input type="password" autoComplete="new-password" required minLength={8} maxLength={100}
          value={form.accessCode} onChange={event => change("accessCode", event.target.value)} /></label>}
        {form.flags.includes("x_account_match") && <label>対象Xアカウント一覧（１行１アカウント、@を含む）<textarea required value={form.xText} onChange={event => change("xText", event.target.value)} /></label>}
        <h3>通常サイコロの配布（救済とは別）</h3>
        <label>何かのPSAガチャ チケット上限（０で無効）
          <input type="number" min={0} max={100000} required value={form.psaLimit}
            onChange={event => change("psaLimit", event.target.value)} />
        </label>
        <p className={styles.small}>かけら５個で１人１枠。第４ステージ到達で失効します。枠が上限に達した後は、失効してもかけらの出現を再開しません。有効な枠だけを開催確定時にPSAガチャ権利として付与します。</p>
        <label>サイコロの使用上限<input type="number" min={1} max={99} required value={form.maxTurns}
          onChange={event => change("maxTurns",event.target.value)} /></label>
        <label>配布方式<select required value={form.distribution} onChange={event => change("distribution", event.target.value as Form["distribution"])}>
          <option value="">選択してください</option><option value="admin">管理者が全体・個別に付与</option><option value="daily">開催日から日次で１個</option><option value="schedule">回数分の配布日時を指定</option>
        </select></label>
        <p className={styles.small}>配布済み分は、途中参加者にも開催期間中に繰り越します。</p>
        {form.distribution === "daily" && <label>日次切替時刻（日本時間の時、０〜23）<input type="number" min={0} max={23} required value={form.dailyHour} onChange={event => change("dailyHour", event.target.value)} /></label>}
        {form.distribution === "schedule" && <div className={styles.fields}>{form.releaseAt.slice(0, Math.min(99, Number(form.maxTurns) || 0)).map((value, index) => <label key={index}>{index + 1}個目の配布日時（日本時間）
          <input type="datetime-local" required value={value} onChange={event => change("releaseAt", form.releaseAt.map((at, i) => i === index ? event.target.value : at))} /></label>)}</div>}
        <h3>星ポイント・評価境界</h3>
        <p className={styles.small}>評価点＝到達点＋レベル加点×（Lv.−１）。最上位には塔の到達点とレベルの両方が必要です。</p>
        {!selected && <p className={styles.small}>初期値は変更できます。公開前に開催の設定を確認してください。</p>}
        <div className={styles.fields}>{Object.entries(numericFields).map(([key, label]) => <label key={key}>{label}<input type="number" required min={key === "stepStarPoints" || key === "levelScore" || key === "percentDecimals" ? 0 : 1}
          step={1} value={form.numbers[key as Numeric]} onChange={event => change("numbers", { ...form.numbers, [key]: event.target.value })} /></label>)}</div>
        <h3>イベント勝利・管理者付与による救済</h3>
        <label>この開催での救済<select required value={form.rescue} onChange={event => change("rescue", event.target.value as Form["rescue"])}>
          <option value="">明示的に選択してください</option><option value="no">付与による救済を使わない</option><option value="yes">条件を設定して使う</option>
        </select></label>
        <p className={styles.small}>救済は最終評価を中間まで補填します。参加資格・盤面の抜け道とは別の設定です。</p>
        {form.rescue === "yes" && <>
          <label className={styles.check}><input type="checkbox" checked={form.adminRescue} onChange={event => change("adminRescue", event.target.checked)} />管理者による救済付与を許可</label>
          {(["nibuichi", "neraiuchi"] as const).map(source => <label key={source} className={styles.check}><input type="checkbox" checked={form.eventSources.includes(source)}
            onChange={event => change("eventSources", event.target.checked ? [...form.eventSources, source] : form.eventSources.filter(value => value !== source))} />{source === "nibuichi" ? "ニブイチの的中" : "狙い撃ちの勝利"}を対象にする</label>)}
          <details><summary>対象結果の条件</summary><p className={styles.small}>開催期間内に確定した本人の勝利が対象です。ニブイチは的中記録の集計時刻、狙い撃ちは結果公開時刻で判定します。</p></details>
          <div className={styles.fields}>{([
            ["rescueFrom", "小径を使える使用回数（開催の使用上限まで）"], ["rescueBelow", "対象評価点の上限（この値未満、中間下限以下）"],
            ["rescueMax", "１人の救済付与上限（開催の使用上限まで）"],
          ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" required min={1} step={1}
            value={form[key]} onChange={event => change(key, event.target.value)} /></label>)}</div>
          <details><summary>分布試算の設定（任意）</summary>
            <p className={styles.small}>未入力の場合は救済保有率０%、使用回は開催の使用上限です。使用回が上限を超える場合は上限までに調整します。</p>
            <label>試算時の救済保有率（０〜100%）<input type="number" min={0} max={100} step="any"
              value={form.rescueRate} onChange={event => change("rescueRate", event.target.value)} /></label>
            <label>試算時に小径を使い始める使用回（１〜99）<input type="number" min={1} max={99} step={1}
              value={form.rescueTurn} onChange={event => change("rescueTurn", event.target.value)} /></label>
          </details>
        </>}
        {editable && <button className={styles.primary} disabled={busy}>下書きを保存</button>}
      </fieldset>
    </form>
    </details>
    {selected?.state === "draft" && <section className={`${styles.panel} ${styles.form}`}>
      <h2>開催の公開</h2>
      {dirty && <p className={styles.notice}>未保存の変更があります。公開前に保存してください。</p>}
      <details><summary>分布試算（任意）</summary>
      <p className={styles.small}>試算を実行しなくても公開できます。</p>
      <button disabled={busy || dirty} onClick={() => void work(async () => {
        await questCall("adminSimulateQuest", { runId: selected.id, version: selected.version }); await refreshSelected(selected.id);
        setConfirmed(false); setStatus("各２万件、６条件の試算を保存しました。");
      })}>保存した設定で分布を試算する</button>
      <p className={styles.small}>目標：最上位２%以下／上位約８%／中間約50%／下位約40%。</p>
      {selected.simulation && <div className={styles.report}><table><thead><tr><th>分岐／抜け道</th>{Object.values(questGroups).map(label => <th key={label}>{label}</th>)}<th>庭到達</th><th>塔到達</th><th>救済使用</th></tr></thead><tbody>
        {selected.simulation.map(result => <tr key={`${result.policy}-${result.shortcutUse}`}><th>{{ bridge: "橋", flower: "花壇", mixed: "各50%" }[result.policy]}／{result.shortcutUse ? "使用" : "見送り"}</th>
          {(["top", "upper", "middle", "lower"] as const).map(group => <td key={group}>{(result.groups[group] / result.trials * 100).toFixed(2)}%</td>)}
          <td>{(result.stage3 / result.trials * 100).toFixed(2)}%</td><td>{(result.stage4 / result.trials * 100).toFixed(2)}%</td><td>{(result.rescued / result.trials * 100).toFixed(2)}%</td>
        </tr>)}</tbody></table></div>}
      {selected.simulation?.some(result => result.groups.top / result.trials > .02) && <p className={styles.notice}>最上位２%を超える方針があります。境界と救済条件を再確認してください。</p>}
      </details>
      <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />参加対象・配布・救済・評価境界を確認しました</label>
      {publishBlockers.length > 0 && <div className={styles.notice} aria-live="polite">
        <strong>公開ボタンが無効になっている理由</strong>
        <ul>{publishBlockers.map(message => <li key={message}>{message}</li>)}</ul>
      </div>}
      <button className={styles.primary} disabled={busy || publishBlockers.length > 0}
        onClick={() => void work(async () => {
          await questCall("adminPublishQuest", { runId: selected.id, version: selected.version, confirmed });
          await refreshSelected(selected.id); setConfirmed(false); setStatus("開催を公開しました。参加対象・配布・評価設定は固定されています。");
        })}>確定した設定で開催を公開する</button>
      <p className={styles.small}>同時開催は１回です。前の開催を終了・集計してから公開してください。</p>
    </section>}
    {selected && (selected.state === "published" || currentBulk) && <section className={`${styles.panel} ${styles.form}`}>
      <h2>通常サイコロの全体配布</h2>
      {selected.rules.distribution.mode === "admin" ? <>
        <p>全体への配布済み累計：{selected.adminReleased ?? 0}／{selected.rules.maxTurns}個</p>
        <p className={styles.small}>途中参加者にも同じ配布済み分を渡します。個別分との合計は開催の上限までです。</p>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); void releaseBulkDice(); }}>
          <label>今回全体へ配る個数<input type="number" required min={1} max={currentBulk ? selected.rules.maxTurns : Math.max(1, selected.rules.maxTurns - (selected.adminReleased ?? 0))}
            readOnly={!!currentBulk} value={bulk.count} onChange={event => setBulk({ ...bulk, count: event.target.value })} /></label>
          <label>全体配布の理由<input required maxLength={500} readOnly={!!currentBulk} value={bulk.reason} onChange={event => setBulk({ ...bulk, reason: event.target.value })} /></label>
          {currentBulk && <p className={styles.notice}>配布ID：{currentBulk.grantId}。応答が不明な場合は同じIDで再送してください。新しく配り直す操作ではありません。</p>}
          <button className={styles.primary} disabled={busy || (!currentBulk && (selected.state !== "published" || (selected.adminReleased ?? 0) >= selected.rules.maxTurns))}>
            {currentBulk ? "同じ配布IDで再送して確認" : "全体へサイコロを配布する"}
          </button>
          <button type="button" disabled={busy} onClick={() => void work(async () => { await refreshSelected(selected.id); })}>全体の配布数を再取得</button>
        </form>
      </> : <p>日次・日時指定の開催は、設定された日時の配布分を利用者が受け取る方式です。全体への手動配布は管理者配布方式で利用できます。</p>}
      {selected.state === "published" && <details>
      <summary>個別付与</summary>
      <h2>通常サイコロ・救済の個別付与</h2>
      <p className={styles.small}>参加済みの利用者が対象です。再送時は同じ付与IDを使ってください。</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void work(async () => {
        const result = await questCall<{ granted: boolean }>("grantQuest", { runId: selected.id, ...grant, count: numberValue(grant.count, "付与数") });
        setStatus(result.granted ? "付与を保存しました。" : "この付与IDは反映済みです。");
      }); }}>
        <label>利用者UID<input required value={grant.uid} onChange={event => setGrant({ ...grant, uid: event.target.value })} /></label>
        <label>種別<select value={grant.kind} onChange={event => setGrant({ ...grant, kind: event.target.value })}><option value="normal">通常サイコロ</option><option value="rescue">救済権利</option></select></label>
        <label>付与数<input type="number" required min={1} max={grant.kind === "rescue" ? selected.rules.rescue.maxGrants : selected.rules.maxTurns} value={grant.count} onChange={event => setGrant({ ...grant, count: event.target.value })} /></label>
        <label>付与理由<input required maxLength={500} value={grant.reason} onChange={event => setGrant({ ...grant, reason: event.target.value })} /></label>
        <label>付与ID<input required pattern="[a-zA-Z0-9_-]{1,128}" value={grant.grantId} onChange={event => setGrant({ ...grant, grantId: event.target.value })} /></label>
        <button type="button" disabled={busy} onClick={() => setGrant({ ...grant, grantId: crypto.randomUUID() })}>新しい付与IDを発行</button>
        <button disabled={busy || selected.state !== "published"}>この付与IDで付与・再送する</button>
      </form>
      </details>}
    </section>}
    {selected && ["published", "settling", "archived"].includes(selected.state) && <section className={styles.panel}>
      <h2>終了・集計・アーカイブ</h2>
      {selected.state !== "archived" && <><p className={styles.small}>進行・配布を停止して結果を集計します。終了後は再開できません。</p>
      <button disabled={busy} onClick={() => {
        if (selected.state === "published" && !window.confirm("この開催の進行・付与を停止して結果の集計を始めます。開催期間中でも再開できません。よろしいですか？")) return;
        void work(async () => {
          const result = await questCall<{ complete: boolean }>("adminFinalizeQuest", { runId: selected.id, confirmed: true });
          await refreshSelected(selected.id); setStatus(result.complete ? "全員の結果を確定し、アーカイブへ移しました。" : "100人分を確定しました。もう一度押すと次のページから再開します。");
        });
      }}>{selected.state === "settling" ? "集計を続きから再開" : "進行を停止して結果を集計"}</button></>}
      {selected.summary && <p>全参加者 {selected.summary.total}人 ／ {selected.rules.maxTurns}回使用 {selected.summary.completed}人。結果は利用者アーカイブで確認できます。</p>}
    </section>}
    <details id="quest-menu" className={styles.panel}>
      <summary>トップメニューの公開範囲</summary>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault();
        if (!menuAccess) return;
        void work(async () => {
          const value = await questCall<QuestMenuAccess>("adminSetQuestMenuAccess", { mode: menuMode, version: menuAccess.version });
          setMenuAccess(value); setMenuMode(value.mode); setStatus("トップメニューの表示設定を保存しました。");
        });
      }}>
        <label>メニューのリンクを利用できる対象<select aria-label="メニューのリンクを利用できる対象" value={menuMode}
          disabled={busy || !menuAccess} onChange={event => setMenuMode(event.target.value as QuestMenuMode)}>
          {Object.entries(QUEST_MENU_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <p className={styles.small}>項目は全員に表示。対象外はグレーアウトします。参加条件は開催設定で指定してください。</p>
        <p className={styles.small}>保存済み：{menuAccess ? QUEST_MENU_LABELS[menuAccess.mode] : "確認中"}</p>
        <div><button disabled={busy || !menuAccess || menuMode === menuAccess.mode}>メニューの表示設定を保存</button>
          <button type="button" disabled={busy} onClick={() => void work(async () => {
            const value = await questCall<QuestMenuAccess>("getQuestMenuAccess", {});
            setMenuAccess(value); setMenuMode(value.mode);
          })}>表示設定を再取得</button></div>
      </form>
    </details>
  </main>;
}
