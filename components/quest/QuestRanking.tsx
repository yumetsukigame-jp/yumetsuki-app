"use client";

import { useEffect, useRef, useState } from "react";
import { QUEST_BOARD, questPercent } from "@/functions/src/quest/engine";
import type { QuestProgress, QuestPublicRun } from "@/functions/src/quest/types";
import { questCall, questError, type QuestRankingData } from "@/app/lib/quest";
import styles from "./quest.module.css";

export default function QuestRanking({ run, archive = false }: { run: QuestPublicRun; archive?: boolean }) {
  const [turn, setTurn] = useState("");
  const [data, setData] = useState<QuestRankingData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    questCall<QuestRankingData>("listQuestProgress", { runId: run.id, archive, ...(turn ? { turn: Number(turn) } : {}) })
      .then(value => { if (ticket === generation.current) setData(value); })
      .catch(error => { if (ticket === generation.current) setError(questError(error)); })
      .finally(() => { if (ticket === generation.current) setBusy(false); });
    return () => { generation.current = ticket + 1; };
  }, [run.id, archive, turn, reload]);
  async function more() {
    if (!data?.nextCursor || busy) return;
    const ticket = generation.current;
    setBusy(true); setError("");
    try {
      const next = await questCall<QuestRankingData>("listQuestProgress", { runId: run.id, archive,
        ...(turn ? { turn: Number(turn) } : {}), cursor: data.nextCursor });
      if (ticket === generation.current) setData({ ...next, items: [...data.items, ...next.items] });
    } catch (error) { if (ticket === generation.current) setError(questError(error)); }
    finally { if (ticket === generation.current) setBusy(false); }
  }
  function row(player: QuestProgress, own = false) {
    return <li key={player.id} className={own ? styles.ownRow : ""}>
      <strong>{player.rank}位　{player.displayName}{own ? "（あなた）" : ""}</strong>
      <span>{questPercent(player.score, run.rules)}% ／ Lv.{player.level} ／ 使用{player.used}回</span>
      <small>{QUEST_BOARD.stages[Number(player.tileId[1]) - 1].label}・{player.tileId}</small>
    </li>;
  }
  return <section className={styles.panel}>
    <h2>みんなの航路</h2>
    <p className={styles.small}>同じ開催回の参加者を集計しています。回数を選ぶと、その回を振り終えた時点の比較になります。</p>
    <label>比べる時点 <select value={turn} onChange={event => {
      setBusy(true); setData(null); setError(""); setTurn(event.target.value);
    }} disabled={busy}>
      <option value="">現在の進捗</option>
      {Array.from({ length: run.rules.maxTurns }, (_, index) => <option key={index} value={index + 1}>{index + 1}回使用した時点</option>)}
    </select></label>
    <div className={styles.routes} aria-label="舞台別の参加人数">
      {data?.stages.map(({ stage, count }) => <div key={stage} style={{
        backgroundImage: `linear-gradient(#151d40a8, #151d40d9), url(/quest/${QUEST_BOARD.stages[stage - 1].background})`,
        backgroundSize: "cover", color: "white",
      }}><span>{stage} {["書斎", "回廊", "庭", "塔"][stage - 1]}</span><strong>{count}人</strong></div>)}
    </div>
    <h2>星務進捗ランキング</h2>
    <p className={styles.small}>丸める前の評価点順。同点は同順位です。救済による最終評価の補填はこの達成率には加算しません。</p>
    {error && <p role="alert">{error}</p>}
    {data?.own ? <ol className={styles.ranking}>{row(data.own, true)}</ol> : data && <p>この比較時点のあなたの記録はまだありません。</p>}
    <ol className={styles.ranking}>{data?.items.map(player => row(player))}</ol>
    {busy && <p role="status">航路を読み込んでいます…</p>}
    {data?.items.length === 0 && <p>この時点の記録はまだありません。</p>}
    {data?.nextCursor && <button type="button" disabled={busy} onClick={() => void more()}>次の25人を見る</button>}
    <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(""); setReload(value => value + 1); }}>ランキングを更新</button>
  </section>;
}
