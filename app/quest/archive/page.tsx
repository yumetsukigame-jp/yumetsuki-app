"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { questCall, questError } from "@/app/lib/quest";
import { formatJstDateTime } from "@/app/lib/dateTime";
import type { QuestPublicRun } from "@/functions/src/quest/types";
import QuestExperience from "@/components/quest/QuestExperience";
import styles from "@/components/quest/quest.module.css";

type Archives = { items: QuestPublicRun[]; nextCursor: string | null };
export default function QuestArchivesPage() {
  const [data, setData] = useState<Archives | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [selected, setSelected] = useState("");
  const [runId, setRunId] = useState("");
  const locked = useRef(false);
  async function load(cursor?: string) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const next = await questCall<Archives>("listQuestArchives", cursor ? { cursor } : {});
      setData(previous => ({ ...next, items: cursor && previous ? [...previous.items, ...next.items] : next.items }));
    } catch (error) { setError(questError(error)); }
    finally { locked.current = false; setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    questCall<Archives>("listQuestArchives", {}).then(value => { if (active) setData(value); })
      .catch(error => { if (active) setError(questError(error)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  return <>
    <section className={styles.page}>
      <nav className={styles.nav}><Link href="/quest">現在のクエストへ</Link><Link href="/quest/guide">遊び方</Link></nav>
      <h1>クエストアーカイブ</h1>
      <p>開催回を選んだときだけ、その回のあなたの記録とランキングを取得します。</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <ul className={styles.ranking}>{data?.items.map(run => <li key={run.id}>
        <strong>{run.title}</strong><span>終了 {formatJstDateTime(new Date(run.endsAt))} ／ 参加 {run.summary?.total ?? 0}人</span>
        <button onClick={() => setSelected(run.id)}>この回の星務報告書を見る</button>
      </li>)}</ul>
      {busy && <p role="status">開催一覧を読み込んでいます…</p>}
      {data?.items.length === 0 && <p>公開されたアーカイブはまだありません。</p>}
      {data?.nextCursor && <button disabled={busy} onClick={() => void load(data.nextCursor!)}>過去の開催をさらに見る</button>}
      {error && <button disabled={busy} onClick={() => void load()}>一覧を再取得</button>}
      <form className={`${styles.panel} ${styles.form}`} onSubmit={event => { event.preventDefault(); setSelected(runId.trim()); }}>
        <label>限定公開など、控えた開催回IDから選ぶ<input value={runId} required pattern="[a-zA-Z0-9_-]{1,128}" onChange={event => setRunId(event.target.value)} /></label>
        <button>この開催回を開く</button>
        <p className={styles.small}>非公開の回は、参加済み・コードで解放済みの本人だけが開けます。IDの入力だけでは参加資格は得られません。</p>
      </form>
      {selected && <button onClick={() => setSelected("")}>選択した報告書を閉じる</button>}
    </section>
    {selected && <QuestExperience key={selected} archiveId={selected} />}
  </>;
}
