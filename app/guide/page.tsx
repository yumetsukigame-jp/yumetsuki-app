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
              遊んで、貯めて、
              <br />
              選べる。
            </h1>
            <p>
              「ゆめつきの書斎」は、ニブイチ・ゆめつきクイズ・ガチャ・ポイント機能などをひとつにまとめた、ゆめつきのためのWebアプリです。
            </p>
            <p>ホーム画面に追加すれば、アプリのような感覚でいつでも開けます。</p>
            <Link className={styles.primaryButton} href="/">
              ゆめつきの書斎を開く
            </Link>
          </div>
          <div className={styles.heroImage}>
            <Image priority src={heroImage} alt="ゆめつきアプリの使い方" />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <SectionHeading eyebrow="START" title="はじめ方は、とてもシンプル。">
            ブラウザからアクセスして登録。トップページから、いろいろな企画や機能を楽しめます。
          </SectionHeading>
          <div className={styles.steps}>
            <Step image={searchImage} number="01" title="yumetsuki.jpで検索">
              ブラウザからアクセスして、ゆめつきの書斎を開きます。
            </Step>
            <Step image={addToHomeImage} number="02" title="ホーム画面に追加">
              iPhoneでは「共有」から「ホーム画面に追加」を選ぶと、アプリのようにすぐ開けます。
            </Step>
            <Step image={signupImage} number="03" title="新規登録">
              名前・ニックネーム・Xアカウント・メールアドレス・パスワードを入力して登録します。
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
            <Feature image={homeImage} number="04" title="今日のニブイチ">
              4つの選択肢から今日の予想を選んで参加。ランキングや自分の結果履歴も確認できます。
            </Feature>
            <Feature image={gachaCodeImage} number="05" title="ガチャを楽しむ">
              ガチャコードを入力して確認。限定公開のガチャは、初回にコード入力が必要です。
            </Feature>
            <Feature image={gachaListImage} number="06" title="ガチャ一覧">
              開催中の公開ガチャを一覧から確認できます。抽選状況や結果も閲覧できます。
            </Feature>
            <Feature image={quizImage} number="07" title="クイズに挑戦">
              クイズ一覧から問題に回答。完了済みクイズやランキングも確認できます。
            </Feature>
            <Feature image={menuImage} number="08" title="ポイントを活用">
              コード入力や企画参加でポイントを獲得し、発送物の選択に利用できます。
            </Feature>
            <Feature image={topImage} number="09" title="アカウントを管理">
              プロフィールの編集や、書庫に保存された思い出・オリカの確認ができます。
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
              「ゆめつきクイズ」では、配信やゲームなどに関するクイズに挑戦できます。回答後は結果やランキングを確認できます。
            </p>
            <ol>
              <li>クイズ一覧から参加したい問題を選択</li>
              <li>答えを選んで回答</li>
              <li>結果を確認</li>
              <li>ポイントを次の楽しみに活用</li>
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
            <TextStep number="02" title="クイズや企画で遊ぶ">
              クイズに答えたり、ニブイチで予想したり、ガチャを引いたり。いろいろな楽しみ方があります。
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
