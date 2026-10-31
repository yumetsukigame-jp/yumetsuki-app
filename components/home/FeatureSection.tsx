"use client";

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import type { HomeMenuSection } from "@/app/lib/homeMenu";
import MenuImageCard from "./MenuImageCard";
import IconMenuLink from "./IconMenuLink";
import styles from "./homeMenu.module.css";

export default function FeatureSection({ section }: { section: HomeMenuSection }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const style = { "--accent": section.accent, "--heading": section.color } as CSSProperties;
  return (
    <section className={styles.section} style={style} aria-labelledby={`${detailsId}-title`}>
      <div className={styles.sectionHeading}>
        <h3 id={`${detailsId}-title`}>{section.title}</h3>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={detailsId}
          aria-label={`${section.title}の詳細メニュー${open ? "を閉じる" : "を表示"}`}>
          {open ? "詳細を閉じる ▲" : "詳細を表示 ▼"}
        </button>
      </div>
      <div className={styles.links}>
        {section.cards.map((item) => <MenuImageCard key={item.href} item={item} />)}
        {section.guides.map((item) => <IconMenuLink key={item.href} item={item} />)}
      </div>
      {!open && <p className={styles.detailSummary}>詳細：{section.details.map((item) => item.label).join("・")}</p>}
      <div id={detailsId} hidden={!open} className={styles.links}>
        {section.details.map((item) => item.image
          ? <MenuImageCard key={item.href} item={item} />
          : <IconMenuLink key={item.href} item={item} />)}
      </div>
    </section>
  );
}
