import Image from "next/image";
import Link from "next/link";
import styles from "./guide.module.css";

import loginImage from "./images/IMG_8175.png";
import installImage from "./images/IMG_8180.jpeg";

const choices = [
  { name: "ニブニ", detail: "2勝 / 2回" },
  { name: "ニブイチ", detail: "1勝 / 2回" },
  { name: "ニブゼロ", detail: "0勝 / 2回" },
  { name: "爆アド", detail: "特別にうれしい結果" },
];

export default function NibuichiGuidePage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroInner}`}>
          <div>
            <p className={styles.eyebrow}>毎日開催・参加無料のミニ企画</p>
            <h1>
              今日の運、
              <br />
              <span>ニブイチ</span>で予想しよう。
            </h1>
            <p className={styles.lead}>
              ゆめつきが引く50%ガチャ、2回の結果を予想。的中するとポイントと特別ガチャへのチャンスがあります。
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryButton} href="/nibuichi">
                アプリで今日の予想をする
              </Link>
              <a className={styles.ghostButton} href="#howto">
                参加方法を見る
              </a>
            </div>
          </div>
          <div className={styles.predictPanel}>
            <p>今日の結果を予想</p>
            <div className={styles.choiceGrid}>
              {choices.map((choice) => (
                <div
                  className={choice.name === "爆アド" ? styles.specialChoice : styles.choice}
                  key={choice.name}
                >
                  <strong>{choice.name}</strong>
                  <span>{choice.detail}</span>
                </div>
              ))}
            </div>
            <small>選ぶのは、この4つだけ。</small>
          </div>
        </div>
      </section>

      <section className={styles.quickSection}>
        <div className={`${styles.container} ${styles.quickGrid}`}>
          <p>🎯 <strong>4つから選ぶだけ</strong> かんたん予想</p>
          <p>🎁 <strong>当たればポイント</strong> みんなで山分け</p>
          <p>🌙 <strong>毎日じゃなくてOK</strong> 見かけた日に参加</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.container} ${styles.aboutGrid}`}>
          <div className={styles.moonCard}>
            <p>YUMETSUKI DAILY PROJECT</p>
            <h2>毎日に、<br />ひとつのワクワクを。</h2>
          </div>
          <div>
            <h2>#ゆめつき今日のニブイチってなに？</h2>
            <p className={styles.muted}>
              ゆめつきが毎日開催している、気軽に参加できる無料の予想企画です。
            </p>
            <ol className={styles.flow}>
              <li><strong>50%のオンラインガチャを2回</strong><span>ゆめつきがオリパ系などのガチャを引きます。</span></li>
              <li><strong>結果を事前に予想</strong><span>何勝するかを、アプリから選ぶだけです。</span></li>
              <li><strong>的中したら、うれしい特典</strong><span>ポイント分配と特別ガチャのチャンスがあります。</span></li>
            </ol>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.lightSection}`}>
        <div className={styles.container}>
          <SectionHeading title="予想するのは、この4つ">
            ガチャ2回の勝敗をイメージして、直感で選びましょう。
          </SectionHeading>
          <div className={styles.resultGrid}>
            {choices.map((choice, index) => (
              <div
                className={choice.name === "爆アド" ? styles.specialResult : styles.result}
                key={choice.name}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{choice.name}</strong>
                <small>{choice.detail}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="howto">
        <div className={`${styles.container} ${styles.howGrid}`}>
          <div className={styles.phoneShot}>
            <Image src={loginImage} alt="ゆめつきの書斎のログイン画面" />
          </div>
          <div>
            <h2>参加方法は、とってもシンプル</h2>
            <div className={styles.steps}>
              <Step number="1" title="ゆめつきアプリを開く">
                ログイン後、トップページの「今日のニブイチに参加する」から開きます。
              </Step>
              <Step number="2" title="今日のガチャ結果を予想">
                「ニブニ」「ニブイチ」「ニブゼロ」「爆アド」から1つ選びます。
              </Step>
              <Step number="3" title="結果発表を見守る">
                指定時刻にライブ録画しながらガチャを引くため、公平に結果が決まります。
              </Step>
              <Step number="4" title="当たったらポイントGET">
                正答者でポイントを分配。特別ガチャにも挑戦できます。
              </Step>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.rewardSection}`}>
        <div className={styles.container}>
          <SectionHeading title="予想が当たると、こんな楽しみも">
            当たっても外れても、次の日が少し楽しみになる。
          </SectionHeading>
          <div className={styles.rewardGrid}>
            <Reward icon="💰" title="ポイントを山分け">
              設定されたポイントを、正答者で分配します。
            </Reward>
            <Reward icon="🎰" title="特別ガチャに挑戦">
              的中者は特別ガチャを引ける場合があります。
            </Reward>
            <Reward icon="✨" title="毎日の小さな高揚感">
              ポケカ・オリパ好きなら、結果を待つ時間まで楽しめます。
            </Reward>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={`${styles.container} ${styles.tipsGrid}`}>
          <div>
            <h2>気軽に、あなたのペースで。</h2>
            <ul className={styles.checkList}>
              <li><strong>参加費は完全無料</strong></li>
              <li>毎日参加しなくても大丈夫</li>
              <li>目についた日だけの参加も大歓迎</li>
              <li>ガチャは録画で、公平なルール</li>
            </ul>
          </div>
          <aside className={styles.infoBox}>
            <h3>お知らせ</h3>
            <p>結果発表は翌朝になる場合もあります。アプリを開いて、今日の結果をチェックしてみてください。</p>
          </aside>
        </div>
      </section>

      <section className={styles.installSection}>
        <div className={`${styles.container} ${styles.installGrid}`}>
          <div>
            <h2>今日の予想から、はじめよう。</h2>
            <p>ホーム画面に追加すれば、いつでもすぐにゆめつきへ。毎日に、小さなワクワクをひとつ。</p>
            <div className={styles.actions}>
              <Link className={styles.primaryButton} href="/nibuichi">
                ゆめつきアプリを開く
              </Link>
            </div>
          </div>
          <Image className={styles.installImage} src={installImage} alt="ホーム画面に追加する案内" />
        </div>
      </section>
    </main>
  );
}

function SectionHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.sectionHeading}>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className={styles.step}>
      <span>{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

function Reward({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <article className={styles.reward}>
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
