import Image from "next/image";
import Link from "next/link";
import styles from "./guide.module.css";

import heroImage from "./images/IMG_8173.jpeg";
import signupImage from "./images/IMG_8174.jpeg";
import searchImage from "./images/IMG_8177.jpeg";
import homeImage from "./images/IMG_8178.jpeg";
import addToHomeImage from "./images/IMG_8179.jpeg";
import gachaCodeImage from "./images/IMG_8180.jpeg";
import gachaListImage from "./images/IMG_8181.jpeg";
import noticeImage from "./images/IMG_8182.jpeg";
import addToHomeMenuImage from "./images/IMG_8183.jpeg";
import addToHomeConfirmImage from "./images/IMG_8184.jpeg";
import gachaResultsImage from "./images/IMG_8185.jpeg";
import quizImage from "./images/IMG_8187.jpeg";
import menuImage from "./images/IMG_8188.jpeg";
import topImage from "./images/IMG_8189.jpeg";

const gallery = [
  { image: searchImage, alt: "yumetsuki.jpを検索する画面", caption: "01｜yumetsuki.jpで検索" },
  { image: addToHomeImage, alt: "ホーム画面に追加する操作例", caption: "02｜ホーム画面に追加" },
  { image: signupImage, alt: "新規登録画面", caption: "03｜新規登録" },
  { image: homeImage, alt: "トップページ", caption: "04｜トップページ" },
  { image: gachaCodeImage, alt: "ガチャコード入力画面", caption: "05｜ガチャを楽しむ" },
  { image: gachaListImage, alt: "ガチャ一覧画面", caption: "06｜ガチャ一覧" },
  { image: quizImage, alt: "クイズメニュー", caption: "07｜クイズに挑戦" },
  { image: menuImage, alt: "ニブイチとガチャのメニュー", caption: "08｜各機能を利用" },
  { image: gachaResultsImage, alt: "ガチャの結果一覧", caption: "09｜ガチャ結果を確認" },
  { image: addToHomeMenuImage, alt: "iPhoneの共有メニュー", caption: "ホーム画面へ追加する操作" },
  { image: addToHomeConfirmImage, alt: "ホーム画面に追加する確認画面", caption: "ホーム画面への追加確認" },
  { image: noticeImage, alt: "ご容赦くださいの案内", caption: "アプリについてのお知らせ" },
];

export default function GuidePage() {
  return (
    <main>
      <section className={styles.hero}>
        <div className={`${styles.container} ${styles.heroInner}`}>
          <div>
            <span className={styles.kicker}>完全自作のゆめつきアプリ</span>
            <h1>
              週間のお裾分け、
              <br />
              トップを飾る大賞はガチャから。
            </h1>
            <p>
              「ゆめつきの書斎」は、週間のお裾分け企画を楽しむうえでも重要なWebアプリです。メインの当たりである「ゆめつき賞」は、このアプリのガチャによって当選者が決まります。
            </p>
            <p>企画に参加したら、ガチャを引くところまでが大切です。</p>
            <Link className={styles.primaryButton} href="/">
              ゆめつきの書斎を開く
            </Link>
          </div>
          <div className={styles.heroImage}>
            <Image priority src={heroImage} alt="ゆめつきアプリの使い方" />
          </div>
        </div>
      </section>

      <section className={styles.award}>
        <div className={styles.container}>
          <div className={styles.awardInner}>
            <p className={styles.awardLabel}>WEEKLY SHARE</p>
            <h2>
              「ゆめつき賞」は
              <br />
              <span>ゆめつきの書斎のガチャ</span>で決まります。
            </h2>
            <p>
              毎週開催している「ゆめつきのお裾分け企画」。企画に参加するだけでは終わりません。メインの当たり「ゆめつき賞」の当選決定に、アプリのガチャが使われます。
            </p>
            <div className={styles.awardFlow}>
              <FlowStep title="企画に参加" description="Xなどからお裾分け企画へ" />
              <span>→</span>
              <FlowStep title="アプリを開く" description="yumetsuki.jpへアクセス" />
              <span>→</span>
              <FlowStep title="ガチャを引く" description="ここを忘れない！" />
              <span>→</span>
              <FlowStep title="ゆめつき賞の当選決定" description="ガチャ結果を確認" highlighted />
            </div>
            <p className={styles.awardWarning}>
              「企画には参加したけど、ガチャを引いていない」と、せっかくのチャンスを逃してしまう可能性があります。参加したら、忘れずにガチャまで！
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHeading eyebrow="START" title="企画に参加したら、ガチャまでやろう。">
            お裾分け企画への参加後は、ブラウザから「ゆめつきの書斎」へ。登録・アクセスして、忘れずにガチャを引きましょう。
          </SectionHeading>
          <div className={styles.steps}>
            <Step image={searchImage} number="01" title="yumetsuki.jpで検索">
              ブラウザからアクセス。まずは「yumetsuki.jp」を検索・入力するところからスタートです。
            </Step>
            <Step image={addToHomeImage} number="02" title="ホーム画面に追加">
              iPhoneでは「共有」から「ホーム画面に追加」を選ぶと、アプリのようにすぐ開けます。
            </Step>
            <Step image={signupImage} number="03" title="新規登録">
              ニックネームなどを入力して登録。登録後はトップページから各機能へ進めます。
            </Step>
          </div>
          <div className={styles.note}>
            <strong>ポイント：</strong>
            iPhoneではSafariの共有メニューから「ホーム画面に追加」を選ぶと便利です。
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.featureBand}`}>
        <div className={styles.container}>
          <SectionHeading eyebrow="FEATURES" title="「ゆめつきの書斎」でできること">
            主な機能を、実際の画面と一緒に紹介します。
          </SectionHeading>
          <div className={styles.features}>
            <Feature image={homeImage} number="04" title="ニブイチ企画">
              ガチャ結果を予想する参加型コンテンツ。リアルタイムの参加状況も楽しめます。
            </Feature>
            <Feature image={gachaCodeImage} number="05" title="ガチャを引く【重要】">
              週間のお裾分け企画では、メインの当たり「ゆめつき賞」の当選決定にガチャを使用します。企画に参加したら、忘れずにガチャを引きましょう。
            </Feature>
            <Feature image={gachaListImage} number="06" title="ガチャ一覧">
              開催中のガチャや「お裾分け」企画を一覧から確認できます。
            </Feature>
            <Feature image={quizImage} number="07" title="クイズでポイントGET">
              「ゆめつきクイズ」で問題に挑戦。正解や参加を通じてポイントを獲得できます。
            </Feature>
            <Feature image={menuImage} number="08" title="ポイントを活用">
              貯めたポイントを使って、景品選択などの楽しみに繋げられます。
            </Feature>
            <Feature image={topImage} number="09" title="機能をまとめて利用">
              クイズ、ガチャ、ミッション、ランキング、アカウント関連などをひとまとめに。
            </Feature>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.quizSection}`}>
        <div className={`${styles.container} ${styles.quizGrid}`}>
          <div>
            <p className={styles.lightEyebrow}>QUIZ</p>
            <h2>クイズに挑戦して、ポイントをためよう。</h2>
            <p>
              「ゆめつきクイズ」では、配信やゲームなどに関するクイズに挑戦できます。参加・正解を通じてポイントを獲得し、貯めたポイントを景品選択などに活用できます。
            </p>
            <ol>
              <li>クイズ一覧から参加したい問題を選択</li>
              <li>答えを選んで回答</li>
              <li>結果を確認してポイントGET</li>
              <li>貯めたポイントを次の楽しみに活用</li>
            </ol>
          </div>
          <div className={styles.quizImage}>
            <Image src={quizImage} alt="ゆめつきクイズの画面" />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHeading eyebrow="HOW TO ENJOY" title="こんな遊び方がおすすめ" />
          <div className={styles.steps}>
            <TextStep number="01" title="企画を見つける">
              開催中のガチャやニブイチをチェック。気になる企画を見つけたら参加してみましょう。
            </TextStep>
            <TextStep number="02" title="企画参加後はガチャまで">
              お裾分け企画に参加したら、ガチャを引くところまで忘れずに。ゆめつき賞の当選決定に関わる大切なステップです。
            </TextStep>
            <TextStep number="03" title="ポイントを次の楽しみに">
              ためたポイントを活用して、発送物を選択できます。
            </TextStep>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.featureBand}`}>
        <div className={styles.container}>
          <SectionHeading eyebrow="SCREEN GALLERY" title="実際の画面をチェック">
            検索から登録、ホーム、ガチャ、クイズ、ポイント関連まで、操作イメージをまとめています。
          </SectionHeading>
          <div className={styles.gallery}>
            {gallery.map((item) => (
              <figure key={item.caption}>
                <Image src={item.image} alt={item.alt} />
                <figcaption>{item.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.final}`}>
        <div className={styles.container}>
          <div className={styles.finalBox}>
            <p className={styles.eyebrow}>LET&apos;S START</p>
            <h2>まずは、ゆめつきの書斎へ。</h2>
            <p>
              企画に参加する人も、クイズを楽しみたい人も、ポイントをためたい人も。ゆめつきの遊び方を、ひとつの場所に。
            </p>
            <p className={styles.url}>yumetsuki.jp</p>
            <Link className={styles.primaryButton} href="/">
              今すぐアクセスする
            </Link>
            <p className={styles.disclaimer}>
              完全自作のため、バグや不具合が発生する場合があります。あらかじめご了承ください。
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.sectionHeading}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function Step({
  image,
  number,
  title,
  children,
}: {
  image: typeof heroImage;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.step}>
      <Image src={image} alt={title} />
      <div className={styles.cardBody}>
        <span className={styles.number}>{number}</span>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

function Feature({
  image,
  number,
  title,
  children,
}: {
  image: typeof heroImage;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.feature}>
      <Image src={image} alt={title} />
      <div>
        <span className={styles.number}>{number}</span>
        <h3>{title}</h3>
        <p>{children}</p>
        <div className={styles.badges}>
          <span>ゆめつき企画</span>
          <span>ポイント</span>
        </div>
      </div>
    </article>
  );
}

function TextStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`${styles.step} ${styles.textStep}`}>
      <div className={styles.cardBody}>
        <span className={styles.number}>{number}</span>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

function FlowStep({
  title,
  description,
  highlighted = false,
}: {
  title: string;
  description: string;
  highlighted?: boolean;
}) {
  return (
    <div className={highlighted ? styles.flowWin : undefined}>
      <strong>{title}</strong>
      <small>{description}</small>
    </div>
  );
}
