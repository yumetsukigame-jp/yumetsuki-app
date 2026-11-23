import Link from "next/link";
import { NanikaFrame } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaRightCompletePage() {
  return <NanikaFrame title="当選権利を取得しました">
    <section className={styles.card}>
      <p>候補を見ながら、当選権利で商品の中身を抽選で決めましょう。まだ発送は依頼されていません。</p>
      <p>当選権利で引くときの追加ポイント消費は0 ptです。取得時の購入・交換ポイントとは別です。</p>
      <Link href="/nanika-gacha" className={styles.prizeListLink}>当選権利で引く</Link>
    </section>
  </NanikaFrame>;
}
