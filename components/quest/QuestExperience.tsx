"use client";

import Link from "next/link";
import Image from "next/image";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth } from "@/firebase";
import { formatJstDateTime } from "@/app/lib/dateTime";
import { questCall, questError, questFlags, questGroups, type QuestView } from "@/app/lib/quest";
import { questBoard, questPercent, questTile } from "@/functions/src/quest/engine";
import type { QuestAction, QuestPlayer, QuestStep } from "@/functions/src/quest/types";
import QuestBoard from "./QuestBoard";
import QuestRanking from "./QuestRanking";
import styles from "./quest.module.css";

type Request = { runId: string; version: number; requestId: string; action: QuestAction | "sync" };
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
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
  const [checking, setChecking] = useState(false);
  const [confirmedDie, setConfirmedDie] = useState<number | null>(null);
  const [eventSource, setEventSource] = useState("nibuichi");
  const [eventId, setEventId] = useState("");
  const [clock, setClock] = useState(0);
  const [frames, setFrames] = useState<QuestStep[]>([]);
  const [overlay, setOverlay] = useState<{ title: string; kind: "dice" | "stage" | "reward"; detail?: string } | null>(null);
  const [scoreChange, setScoreChange] = useState("");
  const [boardFocus, setBoardFocus] = useState(0);
  const playArea = useRef<HTMLDivElement>(null);
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
      setUid(user?.uid ?? null); setView(null); setPending(null); setChecking(false); setConfirmedDie(null); setError(""); setStatus(""); setLoading(true); setFrames([]); setOverlay(null); setScoreChange("");
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
      const ticket = generation.current;
      const current = () => ticket === generation.current && auth.currentUser?.uid === actor;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setScoreChange(""); setChecking(!!retry); setConfirmedDie(null);
      const request: Request = retry ?? { runId: run.id, version: player.version, action, requestId: crypto.randomUUID() };
      setPending(request);
      try { localStorage.setItem(requestKey(actor, run.id), JSON.stringify(request)); } catch { /* Progress is always persisted by the server, not browser storage. */ }
      try {
        if (["roll", "bridge", "flower", "shortcut-use"].includes(action)) {
          setBoardFocus(value => value + 1);
          await new Promise<void>(resolve => requestAnimationFrame(() => {
            playArea.current?.scrollIntoView({ block: "start", behavior: "instant" });
            resolve();
          }));
        }
        if (auth.currentUser?.uid !== actor) return;
        if (action === "roll" && !retry) setOverlay({ title: "星のサイコロ", kind: "dice" });
        const [result] = await Promise.all([
          questCall<{ player: QuestPlayer; replay: boolean }>("actQuest", request),
          action === "roll" && !retry && !reduced ? wait(720) : Promise.resolve(),
        ]);
        if (!current()) return;
        if (action === "roll") setConfirmedDie(result.player.lastDie);
        if (result.replay && result.player.version <= player.version) {
          setOverlay(null); setFrames([]);
          clearRequest(request, actor);
          setStatus(`保存済みの結果（出目 ${result.player.lastDie ?? "—"}）を確認しました。追加の進行はありません。`);
          await reload();
          return;
        }
        const trace = result.player.lastTrace;
        if (action === "roll" && result.player.lastDie) {
          setOverlay({ title: `出目 ${result.player.lastDie}`, kind: "dice", detail: ["⚀","⚁","⚂","⚃","⚄","⚅"][result.player.lastDie-1] });
          await wait(reduced ? 100 : 420);
        }
        if (!current()) return;
        setOverlay(null);
        const sums = new Map<string, number>();
        for (const step of trace?.steps ?? []) {
          if (!current()) return;
          if (Number(step.from[1]) !== Number(step.to[1])) {
            setOverlay({ title: "星の扉が開く", kind: "stage" });
            await wait(reduced ? 0 : 390);
            if (!current()) return;
            setFrames(previous => [...previous, step]);
            setOverlay({ title: questBoard(run.rules.boardVersion).stages[Number(step.to[1])-1].label, detail: "新しい舞台へ", kind: "stage" });
            await wait(reduced ? 250 : 950);
            if (!current()) return;
            setOverlay(null);
          } else {
            setFrames(previous => [...previous, step]);
            if (step.kind !== "walk") {
              setOverlay({ title: step.kind === "return" ? "戻りの魔法陣" : "星のワープ", kind: "stage" });
              await wait(reduced ? 0 : 500);
              if (!current()) return;
              setOverlay(null);
            } else await wait(reduced ? 0 : 210);
          }
        }
        if (!current()) return;
        for (const reward of trace?.rewards ?? []) sums.set(reward.label, (sums.get(reward.label) ?? 0) + reward.points);
        const earned = result.player.starPoints - player.starPoints;
        const moveScore = questTile(result.player.tileId).progress - questTile(player.tileId).progress;
        const levelScore = (result.player.level - player.level) * run.rules.levelScore;
        const signed = (value: number) => value > 0 ? "+" + value : String(value);
        setScoreChange([moveScore && `到達 ${signed(moveScore)}点`, levelScore && `レベル ${signed(levelScore)}点`].filter(Boolean).join(" ／ "));
        const rewardText = [...sums].map(([label, points]) => `${label} ＋${points}`).join(" ／ ");
        if (earned > 0) setOverlay({ title: `星ポイント ＋${earned}`, kind: "reward", detail: rewardText });
        setFrames([]);
        setView(previous => previous?.run?.id === run.id ? { ...previous, player: result.player, dueDice: 0 } : previous);
        clearRequest(request, actor);
        setStatus([`出目 ${result.player.lastDie ?? "—"}`, earned > 0 && `星ポイント ＋${earned} ${rewardText}`, result.player.level > player.level && `Lv.${player.level} → ${result.player.level}`].filter(Boolean).join(" · "));
        await reload();
        if (current() && earned > 0) {
          await wait(reduced ? 400 : 1100);
          if (current()) setOverlay(null);
        }
      } catch (error) {
        if (auth.currentUser?.uid !== actor) return;
        setOverlay(null); setFrames([]);
        const code = (error as { code?: string }).code;
        if (["functions/aborted", "functions/failed-precondition", "functions/invalid-argument", "functions/permission-denied", "functions/already-exists", "functions/not-found"].includes(code ?? "")) {
          clearRequest(request, actor);
          await reload().catch(() => undefined);
        }
        throw error;
      }
    });
  }
  const run = view?.run, player = view?.player;
  const open = !!run && !archiveId && run.state === "published" && clock >= run.startsAt && clock < run.endsAt;
  const canRoll = open && !!player && !player.pending && player.used < run.rules.maxTurns && questTile(player.tileId).kind !== "finish" &&
    player.used < player.normalGranted + (view?.dueDice ?? 0);
  const canRescue = open && player && run.rules.rescue.enabled && !player.rescueUsed && player.rescueCredits > 0 &&
    player.used >= run.rules.rescue.fromTurn && player.score < run.rules.rescue.belowScore;
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" prefetch={false}>トップ</Link><Link href="/quest" prefetch={false}>現在のクエスト</Link><Link href="/quest/guide" prefetch={false}>遊び方</Link><Link href="/quest/ranking" prefetch={false}>ランキング</Link><Link href="/quest/archive" prefetch={false}>アーカイブ</Link></nav>
    <h1>{archiveId ? "過去の星務報告書" : rankingOnly ? "星務進捗ランキング" : "ゆめつきクエスト"}</h1>
    <p>白い魔女の補佐役になって、星空に浮かぶ４つの舞台へ。星のサイコロを振って、旅の行方を見届けよう。</p>
    {(!player || rankingOnly) && <>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p role="status" aria-live="polite">{status}</p>
    </>}
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
          <p>通常サイコロ：{run.rules.distribution.mode === "admin" ? `管理者が全体・個別に付与します。全体配布済みは累計${run.adminReleased ?? 0}個。途中参加でも未受取分を受け取れ、個別分との合計は${run.rules.maxTurns}個までです。` : run.rules.distribution.mode === "daily"
            ? `開始日分を含め、日本時間${run.rules.distribution.dailyStartHourJst}時の切り替えごとに１個。通算${run.rules.maxTurns}個までです。` : `以下の日時に１個ずつ、合計${run.rules.maxTurns}個を配布します。`}</p>
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
        <div ref={playArea} className={styles.playArea}>
          <QuestBoard key={`${run.id}:${boardFocus}`} player={player} version={run.rules.boardVersion} frames={frames} overlay={overlay}>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <p role="status" aria-live="polite" className={styles.playFeedback}>{status}</p>
            {!archiveId && <>
              <div className={styles.diceControls}>
                <div className={styles.diceResult} aria-live="polite">
                  <span className={`${styles.dice} ${busy && pending?.action === "roll" && confirmedDie === null ? styles.rolling : ""}`} aria-hidden="true">
                    {pending?.action === "roll" ? confirmedDie ?? (busy ? "★" : "?") : player.lastDie ?? "✧"}
                  </span>
                  <span>{pending?.action === "roll" ? confirmedDie !== null ? `出目 ${confirmedDie}` : busy ? checking ? "確認中" : "抽選中" : "出目は未確認" : player.lastDie ? `出目 ${player.lastDie}` : "星のサイコロ"}</span>
                </div>
                <button className={styles.primary} disabled={busy || !!pending || !canRoll} onClick={() => void act("roll")}>星のサイコロを振る</button>
              </div>
            </>}
          </QuestBoard>
          {!archiveId && !!view.dueDice && <button disabled={busy || !!pending || !open} onClick={() => void act("sync")}>配布済みの{view.dueDice}個を受け取る</button>}
          {pending && !busy && !archiveId && <div className={styles.notice}><p>前の操作の結果を確認できませんでした。</p>
            <button type="button" disabled={busy} onClick={() => void act(pending.action, pending)}>前回の結果を確認</button></div>}
          {player.pending?.kind === "branch" && <div className={styles.notice}><h3>庭で道を選ぼう</h3><p>出目{player.lastDie}の残り{player.pending.steps}歩。選んだあとは同じターンを再開します。</p>
            <button disabled={busy || !!pending || !open} onClick={() => void act("bridge")}>星の橋へ（塔を目指す）</button>
            <button disabled={busy || !!pending || !open} onClick={() => void act("flower")}>巡る花壇へ（{run.rules.boardVersion === "quest-board-v3" ? "７つの花から星門を引く" : "星を集める"}）</button></div>}
          {player.pending?.kind === "shortcut" && <div className={styles.notice}><h3>星渡りの抜け道が開きました</h3><p>最初の５回がすべて１か２。サイコロの追加消費なしで、庭の入口へ進めます。</p>
            <button disabled={busy || !!pending || !open} onClick={() => void act("shortcut-use")}>抜け道を使って庭へ進む</button>
            <button disabled={busy || !!pending || !open} onClick={() => void act("shortcut-skip")}>今回は見送る</button></div>}
        </div>
        <section className={styles.panel}>
          <h2>{player.result ? "星務報告書" : "あなたの星務"}</h2>
          <dl className={styles.stats}>
            <div><dt>星務達成率（実績）</dt><dd>{questPercent(player.score, run.rules)}%</dd></div>
            <div><dt>星ポイント・レベル</dt><dd>Lv.{player.level}</dd><small>{player.starPoints} 星ポイント</small></div>
            <div><dt>サイコロ使用回数</dt><dd>{player.used}／{run.rules.maxTurns}回</dd></div>
          </dl>
          <div className={styles.meter} role="meter" aria-label="実績の星務達成率" aria-valuenow={questPercent(player.score, run.rules)} aria-valuemin={0} aria-valuemax={100}>
            <span className={styles.progressFill} style={{ width: `${questPercent(questTile(player.tileId).progress, run.rules)}%` }} />
            <span className={styles.levelFill} style={{
              width: `${questPercent(player.score, run.rules) - questPercent(questTile(player.tileId).progress, run.rules)}%`,
            }} />
          </div>
          {view.forecast && player.used < run.rules.maxTurns && questTile(player.tileId).kind !== "finish" ? <>
            <div className={styles.forecast}><span>終了見込み</span><strong>中央値 {questPercent(view.forecast.median, run.rules)}%</strong>
              <span>10〜90%の範囲：{questPercent(view.forecast.low, run.rules)}〜{questPercent(view.forecast.high, run.rules)}%</span></div>

          </> : <p>{player.result ? "確定した実績です。" : player.used === run.rules.maxTurns || questTile(player.tileId).kind === "finish" ? "サイコロの進行は完了しました。最終グループは開催終了後に確定します。" : "開催終了のため、終了見込みの試算は行いません。"}</p>}
          <p className={styles.meterKey}><span>到達 {questTile(player.tileId).progress}点</span><span>レベル {(player.level-1)*run.rules.levelScore}点</span></p>
          {scoreChange && <p className={styles.scoreChange}>{scoreChange}</p>}
          <p className={styles.small}>次のレベルまで星ポイント {run.rules.levelPoints - player.starPoints % run.rules.levelPoints}</p>
          <p>受け取り済み {player.normalGranted}個 ／ 配布待ちの受け取り分 {view.dueDice ?? 0}個 ／ 今振れる分 {canRoll ? Math.max(0, player.normalGranted + (view.dueDice ?? 0) - player.used) : 0}個</p>
          {player.result && <div className={styles.notice}>
            <h3>最終グループ：{questGroups[player.result.group]}</h3>
            <p>到達マス {player.result.tileId} ／ Lv.{player.result.level} ／ 使用{player.result.used}回</p>
            {player.result.rescueUsed && <p>月明かりの小径を使用。補填は中間の下限までで、実績の評価点は変わりません。</p>}
            <p>旅の記念：{player.souvenirs.map(value => value === "starflower" ? "星咲きの花" : `第${value.slice(-1)}舞台への到達`).join("、") || "書斎で受けた星務"}</p>
          </div>}
          <p className={styles.small}>星渡りの抜け道：{player.shortcut === "tracking" ? `１・２が５回続くと開放（${player.originalRolls.length}／５回）`
            : player.shortcut === "missed" ? "今回は条件に届きませんでした" : player.shortcut === "used" ? "使用済み" : player.shortcut === "declined" ? "今回は見送りました" : "扉が開いています"}</p>

        </section>
          <section className={styles.panel}><h2>月明かりの小径</h2>
            <p>条件を満たすと、最終評価を中間まで補えます。</p>
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
          </section>
      </>}
      {!player && !rankingOnly && <QuestBoard player={null} version={run?.rules.boardVersion ?? "quest-board-v3"} />}
      {uid && <QuestRanking key={`${run.id}:${player?.version ?? 0}`} run={run} archive={!!archiveId} />}
      {run.summary && <section className={styles.panel}><h2>開催全体の星務報告</h2>
        <p>全参加者 {run.summary.total}人 ／ {run.rules.maxTurns}回使用 {run.summary.completed}人</p>
        <div className={styles.report}><table><thead><tr><th>グループ</th><th>全参加者</th><th>{run.rules.maxTurns}回使用者のみ</th></tr></thead><tbody>
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
