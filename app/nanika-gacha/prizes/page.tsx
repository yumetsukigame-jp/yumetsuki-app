import type { Metadata } from "next";
import Image from "next/image";
import { NANIKA_TIERS } from "@/functions/src/nanikaGachaTypes";
import { NanikaFrame } from "@/components/nanika-gacha/NanikaCommon";
import NanikaPrizeGallery from "@/components/nanika-gacha/NanikaPrizeGallery";
import styles from "./catalog.module.css";

export const metadata: Metadata = {
  title: "何かの景品ガチャの景品一覧｜ゆめつきの書斎",
  description: "何かのPSAガチャと衛星級・惑星級・恒星級の景品を、ログインせずにカテゴリーごとに確認できます。",
};

export default function NanikaPrizeCatalogPage() {
  return <NanikaFrame title="何かの景品ガチャ：景品一覧">
    <div className={styles.intro}>
      <p className={styles.eyebrow}>4つのカテゴリー、気になる景品を探してみよう。</p>
      <p>ログインせずに景品の画像と名称をご覧いただけます。画像を押すと拡大できます。</p>
      <p>開催状況にかかわらず現在の景品在庫を掲載しています。抽選への参加は、受付中の企画でログイン後に行ってください。受取保留中・発送対象・除外済みの景品は表示されません。</p>
    </div>
    <nav className={styles.categories} aria-label="景品のカテゴリー">
      {NANIKA_TIERS.map(tier => <a key={tier.id} href={`#prizes-${tier.id}`}>{tier.label}</a>)}
    </nav>
    {NANIKA_TIERS.map(tier => <section key={tier.id} id={`prizes-${tier.id}`} className={styles.category}
      aria-labelledby={`prizes-heading-${tier.id}`}>
      <div className={styles.categoryHeader}>
        <Image src={`/nanika-gacha/thumbnails/${tier.thumbnail}.webp`} alt="" width={1536} height={1024} className={styles.categoryImage} />
        <h2 id={`prizes-heading-${tier.id}`}>{tier.label}</h2>
      </div>
      <NanikaPrizeGallery tier={tier.id} embedded publicCatalog />
    </section>)}
    <p className={styles.note}>景品在庫は抽選や受取状況によって変わります。表示されている景品の当選・確保をお約束するものではありません。</p>
  </NanikaFrame>;
}
