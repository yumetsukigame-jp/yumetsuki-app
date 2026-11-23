"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/firebase";
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
type AdminRun = QuestPublicRun & { xAccountList: string[]; simulation: QuestSimulation[] | null; simulatedVersion: number | null };
type Listing = { items: AdminRun[]; nextCursor: string | null };
const localJst = (ms: number) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16);
function numberValue(value: string, label: string) {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error(`${label}を入力してください`);
  return Number(value);
}
function newForm() {
  return { title: "", description: "", thumbnail: "/quest/menu-thumbnail-v2.jpg", startsAt: "", endsAt: "",
    flags: ["public"] as QuestFlag[], xText: "", accessCode: "",
    numbers: Object.fromEntries(Object.keys(numericFields).map(key => [key, ""])) as Record<Numeric, string>,
    distribution: "" as "" | QuestRules["distribution"]["mode"], releaseAt: Array<string>(14).fill(""), dailyHour: "",
    rescue: "" as "" | "yes" | "no", adminRescue: false, eventSources: [] as QuestRules["rescue"]["eventSources"],
    rescueFrom: "", rescueBelow: "", rescueMax: "", rescueRate: "", rescueTurn: "" };
}
type Form = ReturnType<typeof newForm>;
function fromRun(run: AdminRun): Form {
  const r = run.rules;
  return { title: run.title, description: run.description, thumbnail: run.thumbnail,
    startsAt: localJst(run.startsAt), endsAt: localJst(run.endsAt), flags: run.publicFlags,
    xText: run.xAccountList.join("\n"), accessCode: "",
    numbers: Object.fromEntries(Object.keys(numericFields).map(key => [key, String(r[key as Numeric])])) as Record<Numeric, string>,
    distribution: r.distribution.mode, releaseAt: Array.from({ length: 14 }, (_, index) =>
      r.distribution.releaseAt[index] === undefined ? "" : localJst(r.distribution.releaseAt[index])),
    dailyHour: String(r.distribution.dailyStartHourJst), rescue: r.rescue.enabled ? "yes" : "no",
    adminRescue: r.rescue.adminEnabled, eventSources: r.rescue.eventSources, rescueFrom: String(r.rescue.fromTurn),
    rescueBelow: String(r.rescue.belowScore), rescueMax: String(r.rescue.maxGrants),
    rescueRate: String(r.rescue.simulationRate * 100), rescueTurn: String(r.rescue.simulationTurn) };
}
function toDraft(form: Form): QuestDraft {
  if (!form.distribution || !form.rescue) throw new Error("配布方式と救済の有無を明示的に選んでください");
  const numbers = Object.fromEntries(Object.entries(form.numbers).map(([key, value]) => [key, numberValue(value, numericFields[key as Numeric])])) as Record<Numeric, number>;
  const distribution: QuestRules["distribution"] = {
    mode: form.distribution, releaseAt: form.distribution === "schedule" ? form.releaseAt.map(value => parseJstDateTime(value).getTime()) : [],
    dailyStartHourJst: form.distribution === "daily" ? numberValue(form.dailyHour, "日次切替時刻") : 0,
  };
  const rescue: QuestRules["rescue"] = form.rescue === "no"
    ? { enabled: false, adminEnabled: false, eventSources: [], fromTurn: 14, belowScore: numbers.middleMin,
      maxGrants: 1, simulationRate: 0, simulationTurn: 14 }
    : { enabled: true, adminEnabled: form.adminRescue, eventSources: form.eventSources,
      fromTurn: numberValue(form.rescueFrom, "救済を使える使用回数"), belowScore: numberValue(form.rescueBelow, "救済対象の評価点上限"),
      maxGrants: numberValue(form.rescueMax, "救済付与上限"), simulationRate: numberValue(form.rescueRate, "試算時の救済保有率") / 100,
      simulationTurn: numberValue(form.rescueTurn, "試算時の救済使用回") };
  return { title: form.title, description: form.description, thumbnail: form.thumbnail,
    startsAt: parseJstDateTime(form.startsAt).getTime(), endsAt: parseJstDateTime(form.endsAt).getTime(),
    publicFlags: form.flags, xAccountList: form.xText.split(/\r?\n/).map(line => line.trim()).filter(Boolean), accessCode: form.accessCode,
    rules: { boardVersion: "quest-board-v2", maxTurns: 14, ...numbers, distribution, rescue } };
}
export default function QuestAdminPage() {
  const [form, setForm] = useState(newForm);
  const [selected, setSelected] = useState<AdminRun | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [images, setImages] = useState<string[]>(["/quest/menu-thumbnail-v2.jpg"]);
  const [busy, setBusy] = useState(false), lock = useRef(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [confirmed, setConfirmed] = useState(false), [review, setReview] = useState("");
  const [dirty, setDirty] = useState(false);
  const [grant, setGrant] = useState({ uid: "", grantId: "", kind: "normal", count: "", reason: "" });
  const [menuAccess, setMenuAccess] = useState<QuestMenuAccess | null>(null);
  const [menuMode, setMenuMode] = useState<QuestMenuMode>("admin");
  const editable = !selected || selected.state === "draft";
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
    questCall<Listing>("adminListQuest", {}).then(value => { if (active) setListing(value); })
      .catch(error => { if (active) setError(questError(error)); });
    questCall<QuestMenuAccess>("getQuestMenuAccess", {}).then(value => {
      if (active) { setMenuAccess(value); setMenuMode(value.mode); }
    }).catch(error => { if (active) setError(questError(error)); });
    return () => { active = false; };
  }, []);
  async function work(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setStatus("");
    try { await action(); } catch (error) { setError(questError(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  function pick(run: AdminRun) {
    setSelected(run); setForm(fromRun(run)); setConfirmed(false); setReview(""); setDirty(false); setError(""); setStatus("");
  }
  async function refreshSelected(id: string) {
    const value = await load();
    const item = value.items.find(item => item.id === id);
    if (item) { setSelected(item); setDirty(false); }
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
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/admin">管理者トップ</Link><Link href="/quest">利用者画面</Link><Link href="/quest/guide">遊び方</Link></nav>
    <h1>ゆめつきクエスト 開催管理</h1>
    <div className={styles.notice}>盤面v2・４ステージ76マス・上限14回。配布・救済・評価境界に試作値の初期入力はありません。下書き保存 → 14回の試算 → 運用条件の確認 → 公開の順に進めてください。公開後の設定は固定されます。</div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p role="status">{status}</p>
    <form className={`${styles.panel} ${styles.form}`} onSubmit={event => {
      event.preventDefault();
      if (!menuAccess) return;
      void work(async () => {
        const value = await questCall<QuestMenuAccess>("adminSetQuestMenuAccess", { mode: menuMode, version: menuAccess.version });
        setMenuAccess(value); setMenuMode(value.mode); setStatus("トップメニューの表示設定を保存しました。次回のトップ表示・再読み込みから反映されます。");
      });
    }}>
      <h2>トップメニューの公開範囲</h2>
      <p>項目は全員に表示します。対象外の方にはサムネイルと関連メニューをグレーアウトし、リンクを付けません。未設定時は「管理者のみ」です。管理者はすべての公開範囲でリンクを利用できます。</p>
      <label>メニューのリンクを利用できる対象<select aria-label="メニューのリンクを利用できる対象" value={menuMode}
        disabled={busy || !menuAccess} onChange={event => setMenuMode(event.target.value as QuestMenuMode)}>
        {Object.entries(QUEST_MENU_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <p className={styles.small}>保存済み：{menuAccess ? QUEST_MENU_LABELS[menuAccess.mode] : "確認中"}。この設定はトップメニューのリンクのみです。URL直アクセス・APIの制限や、開催回の公開・参加条件は変更しません。</p>
      <div><button disabled={busy || !menuAccess || menuMode === menuAccess.mode}>メニューの表示設定を保存</button>
        <button type="button" disabled={busy} onClick={() => void work(async () => {
          const value = await questCall<QuestMenuAccess>("getQuestMenuAccess", {});
          setMenuAccess(value); setMenuMode(value.mode);
        })}>表示設定を再取得</button></div>
    </form>
    <section className={styles.panel}><h2>開催一覧</h2>
      <button disabled={busy} onClick={() => { setSelected(null); setForm(newForm()); setDirty(false); setConfirmed(false); setReview(""); }}>新しい開催を作る</button>
      <ul className={styles.ranking}>{listing?.items.map(run => <li key={run.id}><strong>{run.title} ／ {{ draft: "下書き", published: "公開中", settling: "集計中", archived: "アーカイブ" }[run.state]}</strong>
        <small>{run.id} ／ 終了 {formatJstDateTime(new Date(run.endsAt))}</small>
        <button disabled={busy} onClick={() => pick(run)}>この開催を選択</button></li>)}</ul>
      {listing?.nextCursor && <button disabled={busy} onClick={() => void work(async () => { await load(listing.nextCursor!); })}>さらに20件</button>}
      <button disabled={busy} onClick={() => void work(async () => { await load(); })}>一覧を更新</button>
    </section>
    <form className={`${styles.panel} ${styles.form}`} onSubmit={event => {
      event.preventDefault();
      void work(async () => {
        const result = await questCall<{ runId: string; version: number }>("adminSaveQuest", {
          ...(selected ? { runId: selected.id, version: selected.version } : {}), draft: toDraft(form),
        });
        await refreshSelected(result.runId); setConfirmed(false); setStatus("下書きを保存しました。設定を変えた場合は、再度試算が必要です。");
      });
    }}>
      <h2>{selected ? `${selected.title} の設定` : "新規開催の設定"}</h2>
      {selected && <p>開催回ID {selected.id} ／ 版 {selected.version}。{editable ? "限定コードは保管しません。限定開催の再保存時は入力し直してください。" : "公開後の設定は編集できません。"}</p>}
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
        <p className={styles.small}>全体公開は一覧への表示です。限定公開・サブスク・前日のニブイチ的中・X一致は、選択した条件をすべて満たす必要があります。「おすすめ」は参加条件ではないため設けていません。資格は参加時に保存します。</p>
        {(!form.flags.includes("public") || form.flags.includes("limited")) && <label>この回の専用コード（８文字以上）<input type="password" autoComplete="new-password" required minLength={8} maxLength={100}
          value={form.accessCode} onChange={event => change("accessCode", event.target.value)} /></label>}
        {form.flags.includes("x_account_match") && <label>対象Xアカウント一覧（１行１アカウント、@を含む）<textarea required value={form.xText} onChange={event => change("xText", event.target.value)} /></label>}
        <h3>通常サイコロの配布（救済とは別）</h3>
        <label>配布方式<select required value={form.distribution} onChange={event => change("distribution", event.target.value as Form["distribution"])}>
          <option value="">選択してください</option><option value="admin">管理者が参加者へ付与</option><option value="daily">開催日から日次で１個、最大14個</option><option value="schedule">14個分の配布日時を指定</option>
        </select></label>
        <p className={styles.small}>日次分は参加前・未受け取りの分も期間中に受け取れます。途中参加でも、その開催で配布済みの分は繰り越します。管理者付与方式では予定されていない未付与分を終了見込みに含めません。</p>
        {form.distribution === "daily" && <label>日次切替時刻（日本時間の時、０〜23）<input type="number" min={0} max={23} required value={form.dailyHour} onChange={event => change("dailyHour", event.target.value)} /></label>}
        {form.distribution === "schedule" && <div className={styles.fields}>{form.releaseAt.map((value, index) => <label key={index}>{index + 1}個目の配布日時（日本時間）
          <input type="datetime-local" required value={value} onChange={event => change("releaseAt", form.releaseAt.map((at, i) => i === index ? event.target.value : at))} /></label>)}</div>}
        <h3>星ポイント・評価境界</h3>
        <p className={styles.small}>評価点＝現在地の進捗点＋レベル加点×（Lv.−１）。最上位は塔の指定進捗点とレベルの両方を満たす方です。盤面の金の星・星咲き・出口の効果はboard-v2に固定されています。</p>
        <div className={styles.fields}>{Object.entries(numericFields).map(([key, label]) => <label key={key}>{label}<input type="number" required min={key === "stepStarPoints" || key === "levelScore" || key === "percentDecimals" ? 0 : 1}
          step={1} value={form.numbers[key as Numeric]} onChange={event => change("numbers", { ...form.numbers, [key]: event.target.value })} /></label>)}</div>
        <h3>イベント勝利・管理者付与による救済</h3>
        <label>この開催での救済<select required value={form.rescue} onChange={event => change("rescue", event.target.value as Form["rescue"])}>
          <option value="">明示的に選択してください</option><option value="no">付与による救済を使わない</option><option value="yes">条件を設定して使う</option>
        </select></label>
        <p className={styles.small}>参加資格と独立した設定です。補填は中間の下限までで、コマや実績スコアは動かしません。花壇の救済出口と５回連続の抜け道は、救済付与の有無によらず盤面v2のルールとして動きます。</p>
        {form.rescue === "yes" && <>
          <label className={styles.check}><input type="checkbox" checked={form.adminRescue} onChange={event => change("adminRescue", event.target.checked)} />管理者による救済付与を許可</label>
          {(["nibuichi", "neraiuchi"] as const).map(source => <label key={source} className={styles.check}><input type="checkbox" checked={form.eventSources.includes(source)}
            onChange={event => change("eventSources", event.target.checked ? [...form.eventSources, source] : form.eventSources.filter(value => value !== source))} />{source === "nibuichi" ? "ニブイチの的中" : "狙い撃ちの勝利"}を対象にする</label>)}
          <p className={styles.small}>開催期間内に確定した本人の結果を、本人が企画ID・対象日から確認して受け取ります。ニブイチは的中記録の集計時刻、狙い撃ちは結果公開時刻が基準です。通常のガチャ当選は自動連携しません。</p>
          <div className={styles.fields}>{([
            ["rescueFrom", "小径を使える使用回数（１〜14）"], ["rescueBelow", "対象評価点の上限（この値未満、中間下限以下）"],
            ["rescueMax", "１人の救済付与上限（１〜14）"], ["rescueRate", "試算時の救済保有率（０〜100%）"], ["rescueTurn", "試算時に小径を使い始める使用回（１〜14）"],
          ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" required min={key === "rescueRate" ? 0 : 1} step={key === "rescueRate" ? "any" : 1}
            value={form[key]} onChange={event => change(key, event.target.value)} /></label>)}</div>
        </>}
        <button className={styles.primary} disabled={busy || !editable}>下書きを保存</button>
      </fieldset>
    </form>
    {selected?.state === "draft" && <section className={`${styles.panel} ${styles.form}`}>
      <h2>14回の分布試算と公開</h2>
      {dirty && <p className={styles.notice}>未保存の変更があります。保存してから再試算してください。</p>}
      <button disabled={busy || dirty} onClick={() => void work(async () => {
        await questCall("adminSimulateQuest", { runId: selected.id, version: selected.version }); await refreshSelected(selected.id);
        setConfirmed(false); setStatus("各２万件、６条件の試算を保存しました。方針による差と救済保有率を確認してください。");
      })}>保存した設定で14回を試算する</button>
      <p>目標：最上位２%以下、上位約８%、中間約50%、下位約40%。選択方針・救済の保有率で分布は変わります。救済保有は出目・分岐と独立とした試算です。全参加者の実績分布とは区別してください。</p>
      {selected.simulation && <div className={styles.report}><table><thead><tr><th>分岐／抜け道</th>{Object.values(questGroups).map(label => <th key={label}>{label}</th>)}<th>庭到達</th><th>塔到達</th><th>救済使用</th></tr></thead><tbody>
        {selected.simulation.map(result => <tr key={`${result.policy}-${result.shortcutUse}`}><th>{{ bridge: "橋", flower: "花壇", mixed: "各50%" }[result.policy]}／{result.shortcutUse ? "使用" : "見送り"}</th>
          {(["top", "upper", "middle", "lower"] as const).map(group => <td key={group}>{(result.groups[group] / result.trials * 100).toFixed(2)}%</td>)}
          <td>{(result.stage3 / result.trials * 100).toFixed(2)}%</td><td>{(result.stage4 / result.trials * 100).toFixed(2)}%</td><td>{(result.rescued / result.trials * 100).toFixed(2)}%</td>
        </tr>)}</tbody></table></div>}
      {selected.simulation?.some(result => result.groups.top / result.trials > .02) && <p className={styles.notice}>最上位２%を超える方針があります。境界と救済条件を再確認してください。</p>}
      <label>確定した配布・救済・評価境界と分布の検討記録（20文字以上）<textarea value={review} onChange={event => { setReview(event.target.value); setConfirmed(false); }} minLength={20} maxLength={2000} /></label>
      <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />試作の数値を転用せず、運用条件と目標分布を確認し、この設定を本番の開催条件として確定しました</label>
      <button className={styles.primary} disabled={busy || dirty || !confirmed || review.trim().length < 20 || selected.simulatedVersion !== selected.version}
        onClick={() => void work(async () => {
          await questCall("adminPublishQuest", { runId: selected.id, version: selected.version, confirmed, reviewNote: review });
          await refreshSelected(selected.id); setConfirmed(false); setStatus("開催を公開しました。参加対象・配布・評価設定は固定されています。");
        })}>確定した設定で開催を公開する</button>
      <p className={styles.small}>同時開催は１回です。前の開催の集計を完了してから公開できます。この操作で通常ポイントや発送物は付与しません。</p>
    </section>}
    {selected && selected.state !== "draft" && <section className={`${styles.panel} ${styles.form}`}>
      <h2>通常サイコロ・救済の個別付与</h2>
      <p>参加済みの利用者に限ります。通常分は管理者配布方式のみ・通算14個まで。救済は設定された上限までで、使用は１回です。通信再送には必ず同じ付与IDを使ってください。</p>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); void work(async () => {
        const result = await questCall<{ granted: boolean }>("grantQuest", { runId: selected.id, ...grant, count: numberValue(grant.count, "付与数") });
        setStatus(result.granted ? "付与を保存しました。新たな付与を行う場合は、新しい付与IDを発行してください。" : "同じ付与IDはすでに反映済みです。追加の付与はしていません。");
      }); }}>
        <label>利用者UID<input required value={grant.uid} onChange={event => setGrant({ ...grant, uid: event.target.value })} /></label>
        <label>種別<select value={grant.kind} onChange={event => setGrant({ ...grant, kind: event.target.value })}><option value="normal">通常サイコロ</option><option value="rescue">救済権利</option></select></label>
        <label>付与数<input type="number" required min={1} max={14} value={grant.count} onChange={event => setGrant({ ...grant, count: event.target.value })} /></label>
        <label>付与理由<input required maxLength={500} value={grant.reason} onChange={event => setGrant({ ...grant, reason: event.target.value })} /></label>
        <label>付与ID<input required pattern="[a-zA-Z0-9_-]{1,128}" value={grant.grantId} onChange={event => setGrant({ ...grant, grantId: event.target.value })} /></label>
        <button type="button" disabled={busy} onClick={() => setGrant({ ...grant, grantId: crypto.randomUUID() })}>新しい付与IDを発行</button>
        <button disabled={busy || selected.state !== "published"}>この付与IDで付与・再送する</button>
      </form>
      <h2>終了・集計・アーカイブ</h2>
      <p>進行と付与を止め、100人ずつ結果を確定します。集計途中で止まった場合は同じボタンで続けられます。未選択の分岐は残りの歩数を進めず、現在の確定マスで判定します。</p>
      <button disabled={busy || selected.state === "archived"} onClick={() => {
        if (selected.state === "published" && !window.confirm("この開催の進行・付与を停止して結果の集計を始めます。開催期間中でも再開できません。よろしいですか？")) return;
        void work(async () => {
          const result = await questCall<{ complete: boolean }>("adminFinalizeQuest", { runId: selected.id, confirmed: true });
          await refreshSelected(selected.id); setStatus(result.complete ? "全員の結果を確定し、アーカイブへ移しました。" : "100人分を確定しました。もう一度押すと次のページから再開します。");
        });
      }}>{selected.state === "settling" ? "集計を続きから再開" : "進行を停止して結果を集計"}</button>
      {selected.summary && <p>全参加者 {selected.summary.total}人 ／ 14回使用 {selected.summary.completed}人。結果は利用者アーカイブで確認できます。</p>}
    </section>}
  </main>;
}
