import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./guide.module.css";

import appIcon from "./images/app-icon.png";
import quizMenuImage from "./images/quiz-menu.jpeg";

export const metadata: Metadata = {
  title: "クイズの遊び方｜ゆめつきの書斎",
  description:
    "ゆめつきクイズの参加方法、回答、ポイント山分け、完了済みクイズやランキングの見方を画像つきで紹介します。",
};

const guideNav = [
  ["#start", "基本の流れ"],
  ["#find", "クイズを探す"],
  ["#answer", "回答する"],
  ["#points", "ポイント"],
  ["#archive", "結果・アーカイブ"],
  ["#ranking", "ランキング"],
  ["#faq", "よくある質問"],
];

export default function QuizGuidePage() {
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
              <p className={styles.eyebrow}>🧠 YUMETSUKI QUIZ GUIDE</p>
              <h1>
                ひらめきが、
                <br />
                ポイントになる。
              </h1>
              <p className={styles.lead}>
                開催中の問題に答えて、正解者でポイントを山分け。クイズの探し方から回答、結果確認、ランキングまで分かりやすくご案内します。
              </p>
              <div className={styles.buttons}>
                <a className={styles.button} href="#start">
                  遊び方を見る ↓
                </a>
                <Link className={`${styles.button} ${styles.alt}`} href="/quizzes">
                  クイズ一覧を開く
                </Link>
              </div>
            </div>
            <div className={styles.heroArt}>
              <div className={styles.quizMark}>
                <div>
                  <span>?</span>
                  <strong>QUIZ CHALLENGE</strong>
                </div>
              </div>
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
          title="クイズは4ステップで参加できます"
          intro="ホーム画面の「クイズ」メニューから、気になる問題を選んで回答。終了後に正解と山分け結果を確認できます。"
        >
          <div className={styles.flow}>
            <FlowCard title="一覧を開く">ホームから「クイズ一覧を見る」を選びます。</FlowCard>
            <FlowCard title="問題を選ぶ">タイトルと山分けポイントを確認します。</FlowCard>
            <FlowCard title="答えを送る">回答欄に文字を入力して送信します。</FlowCard>
            <FlowCard title="結果を確認">終了後に正解・解説・獲得ポイントを確認します。</FlowCard>
          </div>
        </GuideSection>

        <GuideSection
          id="find"
          number="02 / FIND"
          title="「クイズ一覧を見る」から挑戦"
          intro="クイズメニューには、開催中、完了済み、ランキングへの入口がまとまっています。"
        >
          <div className={styles.feature}>
            <div className={styles.visual}>
              <Image src={quizMenuImage} alt="ホーム画面のクイズメニュー" />
            </div>
            <div className={styles.copy}>
              <h3>参加中と過去のクイズを使い分け</h3>
              <Steps
                items={[
                  "ホームの「クイズ」を開く",
                  "「クイズ一覧を見る」を選択",
                  "気になるクイズのカードを開く",
                  "問題と山分けポイントを確認",
                ]}
              />
              <div className={styles.tip}>
                <strong>「完了済みクイズ」も便利です。</strong>
                <br />
                終了した問題の正解や解説を振り返りたいときは、完了済みクイズから確認できます。
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="answer"
          number="03 / ANSWER"
          title="答えを入力して送信"
          intro="クイズ詳細で問題を読み、回答欄に答えを入力します。回答は送信後も追加できます。"
        >
          <div className={`${styles.feature} ${styles.reverse}`}>
            <div className={styles.visual}>
              <QuizDemo
                badge="開催中"
                title="ゆめつきクイズ"
                body="問題文をよく読んで、答えを入力してください。"
                reward="山分けポイント：1,000 pt"
                afterReward={
                  <>
                    <div className={styles.answerBox}>新しい回答</div>
                    <div className={styles.fakeButton}>回答する</div>
                  </>
                }
              />
            </div>
            <div className={styles.copy}>
              <h3>表記まで丁寧に考えてみよう</h3>
              <Steps
                items={[
                  "問題文を最後まで読む",
                  "回答欄に答えを文字で入力",
                  "「回答する」を押して送信",
                  "自分の過去の回答を確認",
                ]}
              />
              <div className={styles.notice}>
                <strong>回答は複数回送れます。</strong>
                <br />
                思いついた別の答えを追加することもできます。正解判定は登録された正解との一致で行われるため、文字や表記にも注意しましょう。
              </div>
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="points"
          number="04 / POINTS"
          title="正解者でポイントを山分け"
          intro="クイズに設定された山分けポイントを、正解したユーザーで均等に分けます。"
        >
          <div className={styles.split}>
            <Info icon="🎯" title="正解者が対象">
              複数の回答を送っていても、その中に正解があれば正解者として集計されます。
            </Info>
            <Info icon="🤝" title="1人1枠で山分け">
              同じ人が複数回正解しても重複加算せず、正解ユーザー単位で山分けします。
            </Info>
          </div>
          <div className={styles.tip}>
            <strong>例：</strong>
            山分けポイントが1,000pt、正解者が4人なら、1人あたり250ptです。端数が出る場合は小数点以下が切り捨てられます。
          </div>
        </GuideSection>

        <GuideSection
          id="archive"
          number="05 / ARCHIVE"
          title="終了後は答え合わせを楽しむ"
          intro="完了済みクイズでは、正解、解説、山分けポイント、参加者の回答を振り返れます。"
        >
          <div className={styles.feature}>
            <div className={styles.visual}>
              <QuizDemo
                badge="完了済み"
                title="クイズ結果を発表！"
                body={<><strong>正解：</strong>〇〇〇</>}
                reward="山分け結果：250 pt"
                beforeReward={
                  <p>
                    <strong>解説：</strong>配信で登場したエピソードがヒントでした。
                  </p>
                }
                afterReward={<div className={styles.fakeButton}>みんなの回答を見る</div>}
              />
            </div>
            <div className={styles.copy}>
              <h3>答えだけでなく、回答の盛り上がりも</h3>
              <p>
                自分の回答を振り返るほか、どんな回答が集まったのかも確認できます。次のクイズのヒント探しにもおすすめです。
              </p>
              <Steps
                items={[
                  "「完了済みクイズを見る」を選ぶ",
                  "振り返りたいクイズを開く",
                  "正解・解説・山分け結果を確認",
                  "参加者の回答もチェック",
                ]}
              />
            </div>
          </div>
        </GuideSection>

        <GuideSection
          id="ranking"
          number="06 / RANKING"
          title="回答数ランキングで人気問題を発見"
          intro="クイズランキングでは、完了済みクイズを回答数の多い順に確認できます。"
        >
          <div className={styles.split}>
            <Info icon="🏆" title="盛り上がったクイズが分かる">
              回答が多く集まったクイズから順番に表示。人気だった問題をすぐに見つけられます。
            </Info>
            <Info icon="💡" title="正解と解説をまとめて確認">
              ランキングから詳細を開き、正解・解説・山分け内容を振り返れます。
            </Info>
          </div>
          <div className={styles.notice}>
            <strong>これはユーザー順位ではありません。</strong>
            <br />
            現在のクイズランキングは、完了した「クイズ自体」を回答数順に並べる機能です。
          </div>
        </GuideSection>

        <GuideSection id="faq" number="07 / FAQ" title="よくある質問">
          <div className={styles.faq}>
            <Faq question="クイズへの参加にポイントは必要ですか？">
              現在の仕組みでは、回答時にポイントを消費する処理はありません。開催中のクイズを開いて回答できます。
            </Faq>
            <Faq question="回答は一度しか送れませんか？">
              複数の回答を追加できます。送信した内容は「あなたの過去の回答」で確認できます。
            </Faq>
            <Faq question="正解者が複数いる場合はどうなりますか？">
              設定されたポイントを正解ユーザー数で割り、均等に付与します。小数点以下は切り捨てです。
            </Faq>
            <Faq question="複数回正解するとポイントも増えますか？">
              いいえ。1つのクイズにつき、正解したユーザー1人を1枠として山分けします。
            </Faq>
            <Faq question="終了したクイズはどこで見られますか？">
              ホームのクイズメニューにある「完了済みクイズを見る」から確認できます。
            </Faq>
          </div>
        </GuideSection>

        <section className={styles.final}>
          <div>
            <h2>今日のひらめきを試してみよう。</h2>
            <p>開催中のクイズを開いて、ポイント獲得にチャレンジ。</p>
          </div>
          <Link className={styles.button} href="/quizzes">
            クイズ一覧を開く →
          </Link>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.wrap}>
          ゆめつきの書斎｜クイズ遊び方ガイド
          <br />
          ※問題内容・山分けポイントはクイズごとに異なります。
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

function FlowCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className={styles.flowCard}>
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
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

function QuizDemo({
  badge,
  title,
  body,
  reward,
  beforeReward,
  afterReward,
}: {
  badge: string;
  title: string;
  body: React.ReactNode;
  reward: string;
  beforeReward?: React.ReactNode;
  afterReward?: React.ReactNode;
}) {
  return (
    <div className={styles.demo}>
      <article className={styles.quizCard}>
        <span className={styles.badge}>{badge}</span>
        <h4>{title}</h4>
        <p>{body}</p>
        {beforeReward}
        <p className={styles.reward}>{reward}</p>
        {afterReward}
      </article>
    </div>
  );
}

function Info({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.info}>
      <div className={styles.icon}>{icon}</div>
      <h3>{title}</h3>
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
