import Link from "next/link";
import { NanikaFrame } from "@/components/nanika-gacha/NanikaCommon";
import styles from "@/components/nanika-gacha/nanika.module.css";

export default function NanikaGuide() {
  return <NanikaFrame title="何かの景品ガチャ：遊び方">
    <section className={styles.hero}><h2>候補は見える。中身は抽選でお楽しみ。</h2>
      <p>企画や購入で得た「何かのPSA」。その中身を、候補を見ながら抽選で決められます。</p>
      <Link href="/nanika-gacha/prizes" className={styles.prizeListLink}>景品候補を見る（ログイン不要）</Link>
    </section>
    <section className={styles.card}><h2>景品を見て、権利を選んで、引く</h2>
      <ol className={styles.steps}>
        <li>4種類のガチャから、気になる景品候補を見つけます。</li>
        <li>受付中のガチャで「当選権利で引く」または「挑戦権利で引く」を選びます。</li>
        <li>使う権利・消費ポイント・受取ポイント・72時間の条件を確認して引きます。</li>
        <li>抽選で決まった景品を、発送またはポイントで受け取ります。</li>
      </ol>
      <p>景品は指定できません。そのガチャの抽選可能な景品から均等に決まります。</p>
    </section>
    <section className={styles.card}><h2>当選権利と挑戦権利の違い</h2>
      <p><strong>当選権利で引く：</strong>当選権利を1回分使います。追加のポイント消費はありません。</p>
      <p><strong>挑戦権利で引く：</strong>挑戦権利を1回分と、ガチャに設定された消費ポイントを使います。0 ptならポイントは不要です。</p>
      <p>もう一方の権利は使いません。取得経路だけで権利の種類が決まるわけではありません。</p>
      <p>当選権利は本人専用・期限なしで、次の開催回にも持ち越せます。挑戦権利は登録済みのXアカウントで利用でき、開催回終了後は持ち越せません。</p>
      <p>購入・ポイント交換などで権利を取得する際の費用と、ここで引く際の消費ポイントは別です。抽選後に権利や消費ポイントは戻りません。</p>
      <p><strong>受取ポイント</strong>は、景品を発送せずポイントで受け取る場合の値です。挑戦権利で引く際の消費ポイントとは異なります。</p>
    </section>
    <section className={styles.warning}><h2>72時間以内に受取方法を選んでください</h2>
      <p>当選後は「発送」か「ポイントで受け取る」を選びます。確定後は受取方法を変更できません。</p>
      <p><strong>抽選成立から72時間を過ぎると、抽選時の受取ポイントで自動確定し、発送できなくなります。</strong></p>
      <p>画面を閉じても期限は進みます。期限内なら、開催終了後でも<Link href="/nanika-gacha/history">当選・受取</Link>から再開できます。自動確定の反映には数分かかる場合があります。</p>
      <p>景品の画像・名前・受取ポイントを確認し、同意と最終確認をしてから確定してください。</p>
    </section>
    <section className={styles.card}><h2>よくある質問</h2>
      <details><summary>候補を見れば、その景品を必ず受け取れますか？</summary>
        <p>掲載は当選や確保の保証ではありません。景品候補は抽選や受取状況により変わります。</p>
      </details>
      <details><summary>受取方法によって景品候補は変わりますか？</summary>
        <p>発送を選んだ景品は次の抽選から外れ、ポイントで受け取った景品は候補に戻ります。</p>
      </details>
      <details><summary>通信エラーで結果がわからないときは？</summary>
        <p>もう一度引く前に、当選・受取を確認してください。受取操作のエラー時も履歴を更新して確定状況を確認してください。</p>
      </details>
      <details><summary>発送状況はどこで確認できますか？</summary>
        <p><Link href="/history">発送履歴</Link>で確認できます。権利の取得だけでは発送されません。ここで景品を決めて発送を依頼してください。</p>
      </details>
    </section>
  </NanikaFrame>;
}
