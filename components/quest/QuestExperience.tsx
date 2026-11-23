"use client";

import Link from "next/link";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/firebase";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { questCall, questError, questFlags, questGroups, type QuestView } from "@/app/lib/quest";
import { questPercent, questTile } from "@/functions/src/quest/engine";
import type { QuestAction, QuestPlayer } from "@/functions/src/quest/types";
import QuestBoard from "./QuestBoard";
import QuestRanking from "./QuestRanking";
import styles from "./quest.module.css";

type Request = { runId: string; version: number; requestId: string; action: QuestAction | "sync" };
const requestKey = (uid: string, runId: string) => `quest-request:${uid}:${runId}`;
function savedRequest(uid: string, runId: string): Request | null {
  try {
    const value = JSON.parse(localStorage.getItem(requestKey(uid, runId)) ?? "null");
    return value?.runId === runId && typeof value.requestId === "string" && Number.isInteger(value.version) &&
      ["roll", "bridge", "flower", "shortcut-use", "shortcut-skip", "rescue", "sync"].includes(value.action) ? value : null;
  } catch { return null; }
}
export default function QuestExperience({ archiveId, rankingOnly = false }: { archiveId?: string; rankingOnly?: boolean }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [view, setView] = useState<QuestView | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<Request | null>(null);
  const [eventSource, setEventSource] = useState("nibuichi");
  const [eventId, setEventId] = useState("");
  const [clock, setClock] = useState(0);
  const offset = useRef(0), locked = useRef(false), generation = useRef(0);
  const reload = useCallback(async () => {
    const ticket = generation.current;
    const actor = auth.currentUser?.uid;
    const value = await questCall<QuestView>("getQuest", archiveId ? { runId: archiveId, archive: true } : {});
    if (ticket !== generation.current) return;
    offset.current = value.serverNow - Date.now(); setClock(value.serverNow); setView(value);
    if (actor && value.run && !archiveId) {
      const request = savedRequest(actor, value.run.id);
      setPending(previous => request ?? (previous?.runId === value.run!.id ? previous : null));
    }
  }, [archiveId]);
  useEffect(() => {
    let ticket = generation.current;
    const unsubscribe = onAuthStateChanged(auth, user => {
      ticket++; generation.current = ticket;
      const current = ticket;
      setUid(user?.uid ?? null); setView(null); setPending(null); setError(""); setStatus(""); setLoading(true);
      locked.current = false; setBusy(false);
      reload().catch(error => { if (current === generation.current) setError(questError(error)); })
        .finally(() => { if (current === generation.current) setLoading(false); });
    });
    return () => { unsubscribe(); generation.current = ticket + 1; };
  }, [reload]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now() + offset.current), 1000);
    return () => clearInterval(timer);
  }, []);
  async function operation(work: () => Promise<void>) {
    if (locked.current) return;
    const ticket = generation.current;
    locked.current = true; setBusy(true); setError(""); setStatus("");
    try { await work(); }
    catch (error) { if (ticket === generation.current) setError(questError(error)); }
    finally { if (ticket === generation.current) { locked.current = false; setBusy(false); } }
  }
  function clearRequest(request: Request, actor: string) {
    try { localStorage.removeItem(requestKey(actor, request.runId)); } catch { /* The in-memory request remains usable without storage. */ }
    setPending(null);
  }
  async function act(action: Request["action"], retry?: Request) {
    const actor = auth.currentUser?.uid, run = view?.run, player = view?.player;
    if (!actor || actor !== uid || !run || !player || archiveId || (pending && !retry)) return;
    await operation(async () => {
      const request: Request = retry ?? { runId: run.id, version: player.version, action, requestId: crypto.randomUUID() };
      setPending(request);
      try { localStorage.setItem(requestKey(actor, run.id), JSON.stringify(request)); } catch { /* Progress is always persisted by the server, not browser storage. */ }
      try {
        const [result] = await Promise.all([
          questCall<{ player: QuestPlayer; replay: boolean }>("actQuest", request),
          action === "roll" ? new Promise(resolve => setTimeout(resolve, 650)) : Promise.resolve(),
        ]);
        if (auth.currentUser?.uid !== actor) return;
        clearRequest(request, actor);
        setStatus(action === "roll" ? `星のサイコロの出目は${result.player.lastDie}。${result.replay ? "保存済みの結果を確認しました。" : "進行を保存しました。"}` : "選択・受け取りを保存しました。");
        await reload();
      } catch (error) {
        if (auth.currentUser?.uid !== actor) return;
        const code = (error as { code?: string }).code;
        if (["functions/aborted", "functions/failed-precondition", "functions/invalid-argument", "functions/permission-denied", "functions/already-exists"].includes(code ?? "")) {
          clearRequest(request, actor);
          await reload().catch(() => undefined);
        }
        throw error;
      }
    });
  }
  const run = view?.run, player = view?.player;
  const open = !!run && !archiveId && run.state === "published" && clock >= run.startsAt && clock < run.endsAt;
  const canRoll = open && !!player && !player.pending && player.used < 14 && questTile(player.tileId).kind !== "finish" &&
    player.used < player.normalGranted + (view?.dueDice ?? 0);
  const canRescue = open && player && run.rules.rescue.enabled && !player.rescueUsed && player.rescueCredits > 0 &&
    player.used >= run.rules.rescue.fromTurn && player.score < run.rules.rescue.belowScore;
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" prefetch={false}>トップ</Link><Link href="/quest" prefetch={false}>現在のクエスト</Link><Link href="/quest/guide" prefetch={false}>遊び方</Link><Link href="/quest/ranking" prefetch={false}>ランキング</Link><Link href="/quest/archive" prefetch={false}>アーカイブ</Link></nav>
    <h1>{archiveId ? "過去の星務報告書" : rankingOnly ? "星務進捗ランキング" : "ゆめつきクエスト"}</h1>
    <p>白い魔女の補佐役になって、星空に浮かぶ４つの舞台へ。星のサイコロを最大14回振って、旅の行方を見届けよう。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" aria-live="polite">{status}</p>
    {loading && <p role="status">開催と保存済みの進行を読み込んでいます…</p>}
    {!loading && !run && <p className={styles.notice}>現在表示できる開催はありません。限定公開の専用コードを受け取った方は、下の欄で解放してください。</p>}
    {!archiveId && !loading && uid && (!run || (!player && run.publicFlags.includes("limited"))) &&
      <form className={`${styles.panel} ${styles.form}`} onSubmit={event => {
        event.preventDefault();
        void operation(async () => { await questCall("unlockQuest", { code }); setCode(""); await reload(); });
      }}>
        <label>開催回の専用コード<input value={code} onChange={event => setCode(event.target.value)} maxLength={100} autoComplete="off" required /></label>
        <button disabled={busy || !code.trim()}>専用コードで解放する</button>
        <p className={styles.small}>コードを入力しても、サブスク・的中・Xアカウントなどの参加条件は別途確認されます。</p>
      </form>}
    {run && <>
      <section className={styles.panel}>
        <h2>{run.title}</h2>
        {!rankingOnly && <Image src={run.thumbnail} alt="" width={900} height={600} unoptimized style={{ width: "100%", height: "auto", maxHeight: 280, objectFit: "contain" }} />}
        <p style={{ whiteSpace: "pre-wrap" }}>{run.description}</p>
        <p className={styles.small}>{formatJstDateTime(new Date(run.startsAt))} 〜 {formatJstDateTime(new Date(run.endsAt))}</p>
        <p>公開・参加条件：{run.publicFlags.map(flag => questFlags[flag]).join(" ／ ")}</p>
        <p className={styles.small}>参加条件は参加時に確認し、この開催回の資格として保存します。参加無料。星ポイントはクエスト内の経験値で、通常ポイントや発送物には交換されません。</p>
        <details><summary>この回の配布・評価ルール</summary>
          <p>通常サイコロ：{run.rules.distribution.mode === "admin" ? "参加後、管理者が個別に付与します。" : run.rules.distribution.mode === "daily"
            ? `開始日分を含め、日本時間${run.rules.distribution.dailyStartHourJst}時の切り替えごとに１個。通算14個までです。` : "以下の日時に１個ずつ、合計14個を配布します。"}</p>
          {run.rules.distribution.mode === "schedule" && <ol>{run.rules.distribution.releaseAt.map((at, index) => <li key={index}>{formatJstDateTime(new Date(at))}</li>)}</ol>}
          <p>１歩の星ポイント {run.rules.stepStarPoints} ／ {run.rules.levelPoints}ポイントごとにLv.＋１。評価点は現在地の進捗点＋{run.rules.levelScore}×（Lv.−１）。{run.rules.percentMax}点を100%として小数{run.rules.percentDecimals}桁で表示します。</p>
          <p>最上位：塔の進捗点{run.rules.topMinProgress}以上かつLv.{run.rules.topMinLevel}以上。次に上位：評価点{run.rules.upperMin}以上、中間：{run.rules.middleMin}以上、それ以外は下位の順に判定します。</p>
        </details>
        {!open && !archiveId && <p className={styles.notice}>{clock < run.startsAt ? "開催開始前です。" : run.state === "settling" ? "星務報告書を集計しています。" : "この開催の進行受付は終了しました。結果は集計後にアーカイブへ残ります。"}</p>}
        {!uid && <Link href="/login">ログインして参加条件を確認する</Link>}
        {uid && !player && archiveId && <p>この開催回へのあなたの参加記録はありません。</p>}
        {uid && !player && !archiveId && <><p>{view.reason ?? "参加条件を満たしています。"}</p>
          <button type="button" className={styles.primary} disabled={busy || !open || !!view.reason} onClick={() => void operation(async () => {
            await questCall("joinQuest", { runId: run.id }); await reload(); setStatus("参加を保存しました。この開催回の続きから遊べます。");
          })}>参加条件を確認して、この回に参加する</button></>}
        <button type="button" disabled={busy} onClick={() => void operation(reload)}>保存済みの進行を再取得</button>
      </section>
      {player && !rankingOnly && <>
        <section className={styles.panel}>
          <h2>{player.result ? "星務報告書" : "あなたの星務"}</h2>
          <dl className={styles.stats}>
            <div><dt>星務達成率（実績）</dt><dd>{questPercent(player.score, run.rules)}%</dd></div>
            <div><dt>星ポイント・レベル</dt><dd>Lv.{player.level}</dd><small>{player.starPoints} 星ポイント</small></div>
            <div><dt>サイコロ使用回数</dt><dd>{player.used}／14回</dd></div>
          </dl>
          <div className={styles.meter} role="meter" aria-label="実績の星務達成率" aria-valuenow={questPercent(player.score, run.rules)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${questPercent(player.score, run.rules)}%` }} />
          </div>
          {view.forecast && player.used < 14 && questTile(player.tileId).kind !== "finish" ? <>
            <div className={styles.forecast}><span>終了見込み</span><strong>中央値 {questPercent(view.forecast.median, run.rules)}%</strong>
              <span>10〜90%の範囲：{questPercent(view.forecast.low, run.rules)}〜{questPercent(view.forecast.high, run.rules)}%</span></div>
            <p className={styles.small}>予定配布分と付与済み分での{view.forecast.samples}通りの試算です。{view.forecast.policy}確定結果や報酬の保証ではありません。</p>
          </> : <p>{player.result ? "確定した実績です。" : player.used === 14 || questTile(player.tileId).kind === "finish" ? "サイコロの進行は完了しました。最終グループは開催終了後に確定します。" : "開催終了のため、終了見込みの試算は行いません。"}</p>}
          <p>現在地：{player.tileId} ／ 評価点 {player.score}</p>
          <p>受け取り済み {player.normalGranted}個 ／ 配布待ちの受け取り分 {view.dueDice ?? 0}個 ／ 今振れる分 {canRoll ? Math.max(0, player.normalGranted + (view.dueDice ?? 0) - player.used) : 0}個</p>
          {player.result && <div className={styles.notice}>
            <h3>最終グループ：{questGroups[player.result.group]}</h3>
            <p>到達マス {player.result.tileId} ／ Lv.{player.result.level} ／ 使用{player.result.used}回</p>
            {player.result.rescueUsed && <p>月明かりの小径を使用。補填は中間の下限までで、実績の評価点は変わりません。</p>}
            <p>旅の記念：{player.souvenirs.map(value => value === "starflower" ? "星咲きの花" : `第${value.slice(-1)}舞台への到達`).join("、") || "書斎で受けた星務"}</p>
          </div>}
          <p className={styles.small}>星渡りの抜け道：{player.shortcut === "tracking" ? `１・２が５回続くと開放（${player.originalRolls.length}／５回）`
            : player.shortcut === "missed" ? "今回は条件に届きませんでした" : player.shortcut === "used" ? "使用済み" : player.shortcut === "declined" ? "今回は見送りました" : "扉が開いています"}</p>
          {pending && !archiveId && <div className={styles.notice}><p>前の操作の応答をまだ確認できていません。同じリクエストを再送して、保存済みの結果を確認します。サイコロを振り直す操作ではありません。受付終了後でも、保存済みの結果は確認できます。</p>
            <button type="button" disabled={busy} onClick={() => void act(pending.action, pending)}>前の操作を再送して確認</button></div>}
          {player.pending?.kind === "branch" && <div className={styles.notice}><h3>庭で道を選ぼう</h3><p>出目{player.lastDie}の残り{player.pending.steps}歩。選んだあとは同じターンを再開します。</p>
            <button disabled={busy || !!pending || !open} onClick={() => void act("bridge")}>星の橋へ（塔を目指す）</button>
            <button disabled={busy || !!pending || !open} onClick={() => void act("flower")}>巡る花壇へ（星を集める）</button></div>}
          {player.pending?.kind === "shortcut" && <div className={styles.notice}><h3>星渡りの抜け道が開きました</h3><p>最初の５回がすべて１か２でした。回数と獲得済みの星ポイントはそのまま、庭の入口へ進めます。飛ばしたマスの星や記念品は受け取りません。６回目を振る前に選んでください。</p>
            <button disabled={busy || !!pending || !open} onClick={() => void act("shortcut-use")}>抜け道を使って庭へ進む</button>
            <button disabled={busy || !!pending || !open} onClick={() => void act("shortcut-skip")}>今回は見送る</button></div>}
          {!archiveId && <>
            <span className={`${styles.dice} ${busy && pending?.action === "roll" ? styles.rolling : ""}`} aria-hidden="true">{busy && pending?.action === "roll" ? "★" : player.lastDie ?? "✧"}</span>
            <button className={styles.primary} disabled={busy || !!pending || !canRoll} onClick={() => void act("roll")}>星のサイコロを振る</button>
            {!!view.dueDice && <button disabled={busy || !!pending || !open} onClick={() => void act("sync")}>配布済みの{view.dueDice}個を受け取る</button>}
            <p className={styles.small}>出目と進行はサーバーで確定・保存します。分岐や抜け道の選択中は次を振れません。</p>
          </>}
        </section>
        <div className={styles.grid}><QuestBoard player={player} />
          <section className={styles.panel}><h2>月明かりの小径</h2>
            <p>救済は移動ではなく最終評価の補填です。下位だった場合のみ中間までとなり、上位・最上位には繰り上がりません。</p>
            {run.rules.rescue.enabled ? <>
              <p>この回の利用条件：{run.rules.rescue.fromTurn}回使用後、評価点{run.rules.rescue.belowScore}未満。救済権利を持つ方が１開催に１回使えます。</p>
              <p>救済権利：残り{player.rescueCredits} ／ {player.rescueUsed ? "小径は開通済みです" : "未使用"}</p>
              <p>付与元：{[...(run.rules.rescue.adminEnabled ? ["管理者付与"] : []),
                ...run.rules.rescue.eventSources.map(source => source === "nibuichi" ? "ニブイチの的中" : "狙い撃ちの勝利")].join("、") || "設定なし"}</p>
              <button disabled={busy || !!pending || !canRescue} onClick={() => void act("rescue")}>救済権利で小径を開く</button>
              {open && run.rules.rescue.eventSources.length > 0 && !player.rescueUsed && <form className={styles.form} onSubmit={event => {
                event.preventDefault();
                void operation(async () => {
                  await questCall("claimQuestEventRescue", { runId: run.id,
                    source: run.rules.rescue.eventSources.includes(eventSource as "nibuichi" | "neraiuchi") ? eventSource : run.rules.rescue.eventSources[0], eventId });
                  await reload(); setStatus("勝利結果と救済の付与状況を確認しました。");
                });
              }}>
                <label>救済対象の企画<select value={run.rules.rescue.eventSources.includes(eventSource as "nibuichi" | "neraiuchi") ? eventSource : run.rules.rescue.eventSources[0]}
                  onChange={event => setEventSource(event.target.value)}>{run.rules.rescue.eventSources.map(source => <option key={source} value={source}>{source === "nibuichi" ? "ニブイチ" : "狙い撃ち"}</option>)}</select></label>
                <label>ニブイチの対象日（YYYY-MM-DD）／狙い撃ちの企画ID<input required value={eventId} onChange={event => setEventId(event.target.value)} maxLength={128} /></label>
                <button disabled={busy || !!pending}>勝利結果を確認して救済を受け取る</button>
                <p className={styles.small}>この開催期間内に確定した本人の勝利だけを照合します。ニブイチは的中記録の集計時刻、狙い撃ちは結果公開時刻が基準です。通常ポイントの受け取りとは別です。</p>
              </form>}
            </> : <p>この開催ではイベント勝利・管理者付与の救済はありません。花壇の救済出口と星渡りの抜け道は盤面のルールとして利用できます。</p>}
          </section></div>
      </>}
      {!player && !rankingOnly && <QuestBoard player={null} />}
      {uid && <QuestRanking key={`${run.id}:${player?.version ?? 0}`} run={run} archive={!!archiveId} />}
      {run.summary && <section className={styles.panel}><h2>開催全体の星務報告</h2>
        <p>全参加者 {run.summary.total}人 ／ 14回使用 {run.summary.completed}人</p>
        <div className={styles.report}><table><thead><tr><th>グループ</th><th>全参加者</th><th>14回使用者のみ</th></tr></thead><tbody>
          {(["top", "upper", "middle", "lower"] as const).map(group => <tr key={group}><th>{questGroups[group]}</th>
            <td>{run.summary!.groups[group]}人</td><td>{run.summary!.completedGroups[group]}人</td></tr>)}
        </tbody></table></div>
        <p>第３舞台到達 {run.summary.stages["3"]}人 ／ 第４舞台到達 {run.summary.stages["4"]}人（途中で戻った方も含む到達実績）</p>
      </section>}
    </>}
    {archiveId && <p className={styles.small}>選択中の開催回ID：{archiveId}</p>}
    {!archiveId && uid && run && <p className={styles.small}>開催回ID：{run.id}。限定公開の回は、このIDを控えてアーカイブから選択できます。</p>}
    {!loading && error && <button disabled={busy} onClick={() => void operation(reload)}>再読み込み</button>}
  </main>;
}
