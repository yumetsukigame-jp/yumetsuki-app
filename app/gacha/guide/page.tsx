import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./guide.module.css";

import appIcon from "./images/app-icon.png";
import gachaListImage from "./images/gacha-list.jpeg";
import gachaMenuImage from "./images/gacha-menu.jpeg";
import gachaResultsImage from "./images/gacha-results.jpeg";
import osusowakeImage from "./images/osusowake.webp";

export const metadata: Metadata = {
  title: "ガチャの遊び方｜ゆめつきの書斎",
  description:
    "ゆめつきの書斎のガチャの使い方、引けるガチャの確認方法、結果や発送について画像つきで紹介します。",
};

const flow = [
  ["ログインする", "登録したメールアドレスとパスワードでログインします。"],
  ["ガチャを探す", "「ガチャ一覧を見る」から開催中のガチャを確認します。"],
  ["条件を確認する", "必要ポイント、回数上限、参加条件を確認します。"],
  ["ガチャを引く", "結果を確認し、対象商品はその場で発送希望を選びます。"],
];

const guideNav = [
  ["#start", "基本の流れ"],
  ["#find", "ガチャを探す"],
  ["#playable", "引けるガチャ"],
  ["#code", "コード入力"],
  ["#result", "結果・発送"],
  ["#tips", "活用方法"],
  ["#faq", "よくある質問"],
];

export default function GachaGuidePage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.brand}>
            <Image src={appIcon} alt="" />
            <span>ゆめつきの書斎</span>
          </div>
          <div className={styles.heroGrid}>
            <div>
              <p className={styles.eyebrow}>🎰 GACHA PLAY GUIDE</p>
              <h1>
                企画に参加したら、
                <br />
                ガチャまで。
              </h1>
              <p className={styles.lead}>
                ガチャの探し方から、引けるガチャの確認、抽選結果、当選品の発送まで。はじめてでも迷わないように、実際の画面と一緒にご案内します。
              </p>
              <div className={styles.ctaRow}>
                <a className={styles.button} href="#start">
                  使い方を見る ↓
                </a>
                <Link className={`${styles.button} ${styles.alt}`} href="/gacha/list">
                  ガチャ一覧を開く
                </Link>
              </div>
            </div>
            <div className={styles.heroArt}>
              <Image src={osusowakeImage} alt="ゆめつきのお裾分けガチャ" priority />
            </div>
          </div>
        </div>
      </header>

      <nav className={styles.nav} aria-label="ページ内メニュー">
        <div className={styles.wrap}>
          {guideNav.map(([href, label]) => (
            <a href={href} key={href}>
              {label}
            </a>
          ))}
        </div>
      </nav>

      <main className={`${styles.wrap} ${styles.main}`}>
        <GuideSection
          id="start"
          number="01 / START"
          title="ガチャは4ステップで楽しめます"
          intro="ホーム画面の「ガチャ」メニューからスタート。開催中の企画を選び、条件を確認して抽選結果を受け取ります。"
        >
          <div className={styles.flow}>
            {flow.map(([title, text]) => (
              <article className={styles.flowCard} key={title}>
                <strong>{title}</strong>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </GuideSection>

        <GuideSection
          id="find"
          number="02 / FIND"
          title="まずは「ガチャ一覧を見る」へ"
          intro="一覧では、ガチャの画像・タイトル・公開条件・抽選方式・必要ポイント・回数上限をまとめて確認できます。"
        >
          <div className={styles.feature}>
            <div className={styles.shot}>
              <Image src={gachaListImage} alt="ガチャ一覧の実際の画面" />
            </div>
            <div className={styles.copy}>
              <h3>新着順・人気順で探せます</h3>
              <p>
                気になるカードの「詳細を見る」を押すと、残りの枠や景品ごとの当選状況も確認できます。
              </p>
              <Steps
                items={[
                  "ホームの「ガチャ」メニューを開く",
                  "「ガチャ一覧を見る」を選ぶ",
                  "新着順・人気順を切り替えて探す",
                  "「詳細を見る」で内容を確認する",
                ]}
              />
              <div className={styles.tip}>
                <strong>週間のお裾分け企画に参加した方へ：</strong>
                <br />
                メイン当選の「ゆめつき賞」はアプリのガチャで決まります。企画への参加だけで終わらず、忘れずにガチャまで引きましょう。
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="playable"
          number="03 / CHECK"
          title="便利な「引けるガチャを確認する」"
          intro="一覧上部の確認ボタンを押すと、現在のポイントや参加条件をもとに、自分が今引けるガチャを確認できます。"
        >
          <div className={styles.checker}>
            <div className={styles.checkPanel}>
              <strong>ガチャ一覧の便利機能</strong>
              <div className={styles.fakeButton}>✓ 引けるガチャを確認する</div>
              <div className={styles.checkList}>
                <div>参加条件を満たしているか</div>
                <div>ポイントが足りているか</div>
                <div>回数上限に達していないか</div>
                <div>期限内かどうか</div>
              </div>
            </div>
            <div className={styles.legend}>
              <Legend icon="🌐" title="公開">一覧から参加できる一般公開ガチャ</Legend>
              <Legend icon="🔒" title="限定・コード">案内された専用コードの入力が必要</Legend>
              <Legend icon="⭐" title="サブスク限定">サブスクライバーのみ参加可能</Legend>
              <Legend icon="🎯" title="ニブイチ的中者限定">前日のニブイチ的中者が対象</Legend>
              <Legend icon="✍️" title="Xアカウント一致">
                企画の対象リストと登録Xアカウントが一致する方
              </Legend>
            </div>
          </div>
          <div className={`${styles.notice} ${styles.noticeSpacing}`}>
            <strong>「引けない」と表示されたときは</strong>
            <br />
            表示される理由をご確認ください。ポイント不足、コード未入力、対象Xアカウントの不一致、回数上限、期限切れなどが考えられます。
          </div>
        </GuideSection>

        <GuideSection
          id="code"
          number="04 / CODE"
          title="限定ガチャは専用コードで解放"
          intro="Xの企画投稿などでガチャコードが案内された場合は、ホームの「ガチャを引く」からコードを入力します。"
        >
          <div className={`${styles.feature} ${styles.reverse}`}>
            <div className={styles.shot}>
              <Image src={gachaMenuImage} alt="ホーム画面にあるガチャメニュー" />
            </div>
            <div className={styles.copy}>
              <h3>「ガチャを引く」を選択</h3>
              <Steps
                items={[
                  "案内されたガチャ専用コードをコピー",
                  "ホームで「ガチャを引く」を選ぶ",
                  "コードを入力して「ガチャを確認」",
                  "内容・必要ポイントを確認して抽選",
                ]}
              />
              <div className={styles.tip}>
                <strong>コードは2種類あります。</strong>
                <br />
                「ポイント付与コード」はポイント関連メニューで入力します。ガチャ専用コードとは入力場所が異なるのでご注意ください。
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="result"
          number="05 / RESULT"
          title="結果と残り枠もチェック"
          intro="一覧の詳細や結果ページでは、全体の使用状況、枠ごとの残数、ほかの参加者の当選状況を確認できます。"
        >
          <div className={styles.feature}>
            <div className={styles.shot}>
              <Image src={gachaResultsImage} alt="ガチャの枠ごとの残数と当選状況" />
            </div>
            <div className={styles.copy}>
              <h3>ガチャの“今”が分かります</h3>
              <p>
                個数限定のガチャでは、使用済み数・残数や景品枠ごとの状況が表示されます。挑戦する前後に確認すると、企画をもっと楽しめます。
              </p>
              <Steps
                items={[
                  "ガチャを引いたら結果を確認",
                  "発送対応の商品は、結果画面で発送希望を選択",
                  "ほかの結果は「ガチャ結果を見る」で確認",
                  "終了した企画は「ガチャアーカイブ」へ",
                ]}
              />
              <div className={styles.notice}>
                <strong>発送を希望する場合は、その結果画面で選択してください。</strong>
                <br />
                画面を離れた後や次のガチャを引いた後は発送を選べません。発送を選ばない場合は、表示された報酬ポイントが付与されます。
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="tips"
          number="06 / ENJOY"
          title="ガチャをもっと活用するコツ"
          intro="「一覧・確認・結果」を使い分けると、開催中の企画を見逃しにくくなります。"
        >
          <div className={styles.flow}>
            <FlowCard title="新着をこまめに確認">ガチャ一覧を新着順にして、新しい企画をチェック。</FlowCard>
            <FlowCard title="ニブイチにも参加">的中すると翌日の限定ガチャに参加できるチャンス。</FlowCard>
            <FlowCard title="ポイントをためる">クイズやコード、ニブイチなどでガチャに使えるポイントを獲得。</FlowCard>
            <FlowCard title="結果をみんなで楽しむ">
              結果一覧で当選状況を確認し、企画の盛り上がりを共有。
            </FlowCard>
          </div>
        </GuideSection>

        <GuideSection id="faq" number="07 / FAQ" title="よくある質問">
          <div className={styles.faq}>
            <Faq question="ガチャを引くにはログインが必要ですか？">
              基本的にログインが必要です。新規登録では、名前、ニックネーム、Xアカウント、メールアドレス、パスワードを入力します。
            </Faq>
            <Faq question="一覧にあるのに引けません">
              必要ポイント、回数上限、公開期限、サブスク・ニブイチ・Xアカウントなどの参加条件をご確認ください。「引けるガチャを確認する」も便利です。
            </Faq>
            <Faq question="Xアカウント一致とは何ですか？">
              企画で指定された対象者リストと、プロフィールに登録したXアカウントが一致していることが参加条件です。表記違いがないかプロフィールをご確認ください。
            </Faq>
            <Faq question="ガチャコードとポイントコードの違いは？">
              ガチャコードは限定ガチャを確認・解放するためのコードです。ポイントコードはポイント獲得用で、ホームの「コード入力でポイント獲得」から入力します。
            </Faq>
            <Faq question="過去のガチャ結果は見られますか？">
              はい。「ガチャ結果を見る」では現行ガチャ、「ガチャアーカイブを見る」では終了したガチャを確認できます。
            </Faq>
          </div>
        </GuideSection>

        <section className={styles.final}>
          <div>
            <h2>さあ、引けるガチャを見つけよう。</h2>
            <p>企画に参加したら、ガチャを引くところまでお忘れなく。</p>
          </div>
          <Link className={styles.button} href="/gacha/list">
            ガチャ一覧を開く →
          </Link>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.wrap}>
          ゆめつきの書斎｜ガチャ遊び方ガイド
          <br />
          ※開催内容・参加条件・必要ポイントはガチャごとに異なります。
        </div>
      </footer>
    </div>
  );
}

function GuideSection({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} id={id}>
      <div className={styles.sectionHead}>
        <span className={styles.num}>{number}</span>
        <div>
          <h2>{title}</h2>
          {intro && <p className={styles.sectionIntro}>{intro}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className={styles.steps}>
      {items.map((item, index) => (
        <li data-step={index + 1} key={item}>
          {item}
        </li>
      ))}
    </ol>
  );
}

function Legend({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.icon}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{children}</small>
      </div>
    </div>
  );
}

function FlowCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className={styles.flowCard}>
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{question}</summary>
      <p>{children}</p>
    </details>
  );
}
