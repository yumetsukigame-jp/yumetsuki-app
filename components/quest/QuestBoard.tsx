"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { QUEST_BOARD, questTile } from "@/functions/src/quest/engine";
import type { QuestPlayer } from "@/functions/src/quest/types";
import styles from "./quest.module.css";

const kindNames: Record<string, string> = {
  normal: "道", start: "入口", star: "金の星", starflower: "星咲きの花",
  return: "戻りの魔法陣", gate: "次の舞台への扉", fork: "分かれ道", finish: "塔の奥", "loop-exit": "花壇の出口",
};
function edge(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = (to.y - from.y) * 1.5;
  const length = Math.hypot(dx, dy);
  return { x1: from.x, y1: from.y * 1.5, x2: to.x - dx / length * 6, y2: to.y * 1.5 - dy / length * 6 };
}
export default function QuestBoard({ player }: { player: QuestPlayer | null }) {
  const currentStage = player ? Number(player.tileId[1]) : 1;
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const marker = useId().replace(/:/g, "");
  const stage = QUEST_BOARD.stages[(previewStage ?? currentStage) - 1];
  const selectedTile = selected ? questTile(selected) : null;
  const pawn = player && Number(player.tileId[1]) === stage.id ? questTile(player.tileId) : null;
  return <section className={styles.panel} aria-label="クエストの盤面">
    <div className={styles.tabs} aria-label="表示する舞台">
      {QUEST_BOARD.stages.map(item => <button key={item.id} type="button" aria-pressed={stage.id === item.id}
        onClick={() => { setPreviewStage(item.id); setSelected(null); }}>
        {item.id} {["書斎", "回廊", "庭", "塔"][item.id - 1]}
        {player?.reachedStages.includes(item.id) ? " ✓" : ""}
      </button>)}
    </div>
    <h2>{stage.id}．{stage.label}</h2>
    {previewStage !== null && <button type="button" onClick={() => { setPreviewStage(null); setSelected(null); }}>現在地の舞台に戻る</button>}
    <div className={styles.board}>
      <Image src={`/quest/${stage.background}`} alt="" fill sizes="(max-width: 600px) 94vw, 520px" priority />
      <svg className={styles.paths} viewBox="0 0 100 150" aria-hidden="true">
        <defs>
          <marker id={`${marker}-forward`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto-start-reverse"><path d="M0,0 L4,2 L0,4" fill="#fff1bc" /></marker>
          <marker id={`${marker}-return`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="#d2a7ff" /></marker>
        </defs>
        {stage.tiles.flatMap(tile => tile.next.filter(next => Number(next[1]) === stage.id).map(next => {
          const end = questTile(next);
          return <line key={`${tile.id}-${next}`} {...edge(tile, end)}
            stroke="#fff1bc" strokeWidth="0.8" markerEnd={`url(#${marker}-forward)`} />;
        }))}
        {stage.id === 3 && <>
          {(() => { const from = questTile("s3-12"), to = questTile("s3-09"); return <path
            d={`M ${from.x},${from.y * 1.5} Q 98,${from.y * 1.5} ${to.x},${to.y * 1.5 - 6}`}
            fill="none" stroke="#d2a7ff" strokeWidth="1.1" markerEnd={`url(#${marker}-return)`} />; })()}
          {(() => { const from = questTile("s3-loop-00"), to = questTile("s3-07"); return <line {...edge(from, to)}
            stroke="white" strokeWidth="0.9" strokeDasharray="2 1" markerEnd={`url(#${marker}-forward)`} />; })()}
        </>}
      </svg>
      {stage.tiles.map(tile => {
        const art = ["star", "return", "starflower"].includes(tile.kind) ? tile.kind : "normal";
        const label = `${tile.id} ${kindNames[tile.kind] ?? tile.kind}、進捗点${tile.progress}`;
        return <button key={tile.id} type="button" className={styles.tile} data-kind={tile.kind}
          style={{ left: `${tile.x}%`, top: `${tile.y}%` }} title={label} aria-label={label}
          aria-current={player?.tileId === tile.id ? "location" : undefined} onClick={() => setSelected(tile.id)}>
          <Image src={`/quest/tile-${art}.png`} alt="" width={100} height={100} />
          {(tile.kind === "gate" || tile.kind === "fork" || tile.kind === "finish" || tile.kind === "loop-exit") &&
            <span>{tile.kind === "fork" ? "分岐" : tile.kind === "finish" ? "奥" : tile.kind === "loop-exit" ? "出口" : "扉"}</span>}
        </button>;
      })}
      {stage.id === 3 && <span className={`${styles.rescueMarker} ${player?.rescueUsed ? styles.rescueOpen : ""}`}>☽ 月明かりの小径{player?.rescueUsed ? " 開通済み" : ""}</span>}
      {player?.pending?.kind === "shortcut" && stage.id === 1 && <Image className={styles.shortcutArt}
        src="/quest/tile-shortcut.png" alt="星渡りの抜け道が開きました" width={100} height={100} />}
      {pawn && <Image className={styles.pawn} style={{ left: `${pawn.x}%`, top: `${pawn.y}%` }}
        src="/quest/pawn-assistant.png" alt={`あなたの現在地 ${player!.tileId}`} width={100} height={100} />}
    </div>
    <p className={styles.small}>{selectedTile
      ? `${selectedTile.id}：${kindNames[selectedTile.kind] ?? selectedTile.kind}／進捗点 ${selectedTile.progress}`
      : "マスを押すと種類と進捗点を確認できます。舞台の切り替えでコマは移動しません。"}</p>
    <p className={styles.small}>金の星：追加の星ポイント ／ 紫の矢印：戻る方向 ／ 白い点線：花壇からの合流</p>
  </section>;
}
