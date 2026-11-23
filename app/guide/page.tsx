import Image from "next/image";
import Link from "next/link";
import styles from "./guide.module.css";

import heroImage from "./images/IMG_8173.jpeg";
import signupImage from "./images/IMG_8174.jpeg";
import searchImage from "./images/IMG_8177.jpeg";
import homeImage from "./images/home-menu.webp";
import nanikaMenuImage from "./images/nanika-menu.webp";
import neraiuchiMenuImage from "./images/neraiuchi-menu.webp";
import questMenuImage from "./images/quest-menu.webp";
import addToHomeImage from "./images/IMG_8179.jpeg";
import gachaCodeImage from "./images/IMG_8180.jpeg";
import gachaListImage from "./images/IMG_8181.jpeg";
import noticeImage from "./images/IMG_8182.jpeg";
import addToHomeMenuImage from "./images/IMG_8183.jpeg";
import addToHomeConfirmImage from "./images/IMG_8184.jpeg";
import gachaResultsImage from "./images/IMG_8185.jpeg";
import quizImage from "./images/IMG_8187.jpeg";

const gallery = [
  { image: searchImage, alt: "yumetsuki.jpを検索する画面", caption: "01｜yumetsuki.jpで検索" },
  { image: addToHomeImage, alt: "ホーム画面に追加する操作例", caption: "02｜ホーム画面に追加" },
  { image: signupImage, alt: "新規登録画面", caption: "03｜新規登録" },
  { image: homeImage, alt: "画像カードと遊び方、詳細ボタンがあるガチャメニューの画面例", caption: "04｜新しい画像メニュー" },
  { image: gachaCodeImage, alt: "ガチャコード入力画面", caption: "05｜ガチャを楽しむ" },
  { image: gachaListImage, alt: "ガチャ一覧画面", caption: "06｜ガチャ一覧" },
  { image: quizImage, alt: "クイズメニュー", caption: "07｜クイズに挑戦" },
  { image: nanikaMenuImage, alt: "何かの景品ガチャのトップメニューの画面例", caption: "08｜何かの景品ガチャ" },
  { image: gachaResultsImage, alt: "ガチャの結果一覧", caption: "09｜ガチャ結果を確認" },
  { image: questMenuImage, alt: "リンクが無効なときのゆめつきクエストメニューの画面例", caption: "公開対象外のメニュー表示例" },
  { image: neraiuchiMenuImage, alt: "ゆめつきの狙い撃ちのトップメニューの画面例", caption: "狙い撃ちの企画・遊び方・履歴" },
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
            トップはカテゴリー別の画像メニューです。大きなカードから各機能へ、遊び方から説明へ進めます。「詳細を表示」で履歴などの関連リンクも開きます。通常ガチャの次は、ゆめつきクエストです。
          </SectionHeading>
          <p className={styles.note}>メニュー画像は説明用のログイン状態で撮影した画面例です。開催・公開範囲は実際の案内をご確認ください。グレーの項目はトップから開けません。</p>
          <div className={styles.features}>
            <Feature image={homeImage} number="04" title="画像メニューから選ぶ">
              今日のニブイチ、ガチャ、クイズなどをカテゴリー別に表示。履歴やランキングは、それぞれの「詳細を表示」から確認できます。
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
            <Feature image={nanikaMenuImage} number="08" title="何かの景品ガチャ" badges={["当選権利", "挑戦権利"]}>
              企画や購入で得た権利を使い、候補を見ながら商品の中身を抽選で決めます。当選権利は追加ポイント不要、挑戦権利は設定された消費ポイントも必要です。消費ポイントと受取ポイントは別です。<Link href="/nanika-gacha/guide">詳しい遊び方を見る</Link>。
            </Feature>
            <Feature image={questMenuImage} number="09" title="ゆめつきクエスト" badges={["最大14回", "開催回別に保存"]}>
              星のサイコロで４つの舞台を巡るイベント。星ポイントはクエスト内の経験値で、通常ポイントとは別です。項目は全員に表示されますが、公開対象外の間はグレー表示・リンクなしになります。<Link href="/quest/guide">クエストの遊び方を見る</Link>。
            </Feature>
            <Feature image={neraiuchiMenuImage} number="10" title="ゆめつきの狙い撃ち" badges={["参加無料", "１企画１回"]}>
              受付期間に参加すると、サーバーで成立した順に参加番号が決まります。当選番号と一致すれば当選。押す速さで当選が保証される仕組みではなく、番号・当落・参加人数は企画終了後に公開します。<Link href="/neraiuchi/guide">詳しい遊び方を見る</Link>。
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
            トップメニューは現在の画面例に更新しています。登録・ホーム画面への追加などは旧画面を含む操作例です。端末や更新によって表示が異なる場合があります。
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
  badges = ["ゆめつき企画", "ポイント"],
  children,
}: {
  image: typeof heroImage;
  number: string;
  title: string;
  badges?: string[];
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
          {badges.map(badge => <span key={badge}>{badge}</span>)}
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
