"use client";

import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import { questBoard, questTile } from "@/functions/src/quest/engine";
import type { QuestPlayer, QuestRules, QuestStep } from "@/functions/src/quest/types";
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
export default function QuestBoard({ player, version, frames, overlay, children }: {
  player: QuestPlayer | null; version: QuestRules["boardVersion"]; frames?: QuestStep[];
  overlay?: { title: string; kind: "dice" | "stage" | "reward"; detail?: string } | null; children?: ReactNode;
}) {
  const board = questBoard(version);
  const frame = frames?.at(-1);
  const position = frame?.to ?? player?.tileId;
  const currentStage = position ? Number(position[1]) : 1;
  const traveled = [...(player?.visitedPaths ?? []), ...(frames ?? [])];
  const visited = new Set(["s1-00", ...traveled.flatMap(step => [step.from, step.to])]);
  const [previewStage, setPreviewStage] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const marker = useId().replace(/:/g, "");
  const stage = board.stages[(previewStage ?? currentStage) - 1];
  const selectedTile = selected ? questTile(selected, version) : null;
  const pawn = position && Number(position[1]) === stage.id ? questTile(position, version) : null;
  return <section className={styles.panel} aria-label="クエストの盤面">
    <div className={styles.tabs} aria-label="表示する舞台">
      {board.stages.map(item => <button key={item.id} type="button" aria-pressed={stage.id === item.id}
        disabled={!!overlay || !!frame} onClick={() => { setPreviewStage(item.id); setSelected(null); }}>
        {item.id} {["書斎", "回廊", "庭", "塔"][item.id - 1]}
        {player?.reachedStages.includes(item.id) ? " ✓" : ""}
      </button>)}
    </div>
    <h2>{stage.id}．{stage.label}</h2>
    {previewStage !== null && <button type="button" onClick={() => { setPreviewStage(null); setSelected(null); }}>現在地の舞台に戻る</button>}
    {children}
    <div className={styles.board}>
      <Image src={`/quest/${stage.background}`} alt="" fill sizes="(max-width: 600px) 94vw, 520px" priority />
      <svg className={styles.paths} viewBox="0 0 100 150" aria-hidden="true">
        <defs>
          <marker id={`${marker}-forward`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto-start-reverse"><path d="M0,0 L4,2 L0,4" fill="#fff1bc" /></marker>
          <marker id={`${marker}-return`} markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4" fill="#d2a7ff" /></marker>
        </defs>
        {stage.tiles.flatMap(tile => tile.next.filter(next => Number(next[1]) === stage.id).map(next => {
          const end = questTile(next, version);
          const used = traveled.some(step => step.from === tile.id && step.to === next);
          return <line key={`${tile.id}-${next}`} {...edge(tile, end)}
            stroke={used ? "#ffd573" : "#fff1bc80"} strokeWidth={used ? 1.45 : .65} markerEnd={`url(#${marker}-forward)`} />;
        }))}
        {stage.id === 3 && <>
          {(() => { const from = questTile("s3-12"), to = questTile("s3-09"); return <path
            d={`M ${from.x},${from.y * 1.5} Q 98,${from.y * 1.5} ${to.x},${to.y * 1.5 - 6}`}
            fill="none" stroke="#d2a7ff" strokeWidth="1.1" markerEnd={`url(#${marker}-return)`} />; })()}
          {(() => { const from = questTile(version === "quest-board-v3" ? "s3-loop-06" : "s3-loop-00", version), to = questTile(from.exitTo!, version); return <line {...edge(from, to)}
            stroke="white" strokeWidth="0.9" strokeDasharray="2 1" markerEnd={`url(#${marker}-forward)`} />; })()}
        </>}
        {traveled.filter(step => step.kind !== "walk" && Number(step.from[1]) === stage.id && Number(step.to[1]) === stage.id)
          .filter((step, i, steps) => steps.findIndex(item => item.from === step.from && item.to === step.to && item.kind === step.kind) === i)
          .map(step => <line key={`${step.from}-${step.to}`} {...edge(questTile(step.from, version), questTile(step.to, version))}
            stroke={step.kind === "return" ? "#e4aaff" : "#8dedff"} strokeWidth="1.25" strokeDasharray="2 1" />)}
      </svg>
      {stage.tiles.map(tile => {
        const art = ["star", "return", "starflower"].includes(tile.kind) ? tile.kind : "normal";
        const label = `${kindNames[tile.kind] ?? tile.kind}${visited.has(tile.id) ? "、通過済み" : ""}`;
        return <button key={tile.id} type="button" className={styles.tile} data-kind={tile.kind} data-visited={visited.has(tile.id)} data-active={frame?.to === tile.id}
          style={{ left: `${tile.x}%`, top: `${tile.y}%` }} title={label} aria-label={label}
          aria-current={position === tile.id ? "location" : undefined} onClick={() => setSelected(tile.id)}>
          <Image src={`/quest/tile-${art}.png`} alt="" width={100} height={100} />
          {(tile.kind === "gate" || tile.kind === "fork" || tile.kind === "finish" || tile.kind === "loop-exit") &&
            <span>{tile.kind === "fork" ? "分岐" : tile.kind === "finish" ? "奥" : tile.kind === "loop-exit" ? "出口" : "扉"}</span>}
        </button>;
      })}
      {stage.id === 3 && <span className={`${styles.rescueMarker} ${player?.rescueUsed ? styles.rescueOpen : ""}`}>☽ 月明かりの小径{player?.rescueUsed ? " 開通済み" : ""}</span>}
      {player?.pending?.kind === "shortcut" && stage.id === 1 && <Image className={styles.shortcutArt}
        src="/quest/tile-shortcut.png" alt="星渡りの抜け道が開きました" width={100} height={100} />}
      {pawn && <Image className={styles.pawn} data-moving={frame?.kind === "walk"} style={{ left: `${pawn.x}%`, top: `${pawn.y}%` }}
        src="/quest/pawn-assistant.png" alt="あなたのコマ" width={100} height={100} />}
      {overlay && <div key={overlay.kind + overlay.title} className={styles.mapOverlay} data-overlay={overlay.kind} role="status">
        {overlay.kind === "dice" && <span className={styles.mapDie} aria-hidden="true">{overlay.detail ??
          <span className={styles.dieCube}>{["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"].map(face => <span key={face}>{face}</span>)}</span>}
        </span>}
        <strong>{overlay.title}</strong>
        {overlay.kind !== "dice" && overlay.detail && <small>{overlay.detail}</small>}
      </div>}
    </div>
    {selectedTile && <p className={styles.small}>
{kindNames[selectedTile.kind] ?? selectedTile.kind}
      {selectedTile.effect?.starPoints ? ` · 止まると星ポイント＋${selectedTile.effect.starPoints}` : ""}
      {visited.has(selectedTile.id) ? " · 通過済み" : ""}</p>}
  </section>;
}
