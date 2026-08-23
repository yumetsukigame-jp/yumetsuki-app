import Link from "next/link";

const sections = [
  {
    title: "はじめに",
    items: [
      "新規登録では、名前・ニックネーム・Xアカウント・メールアドレス・パスワードを入力します。",
      "名前は外部に表示されません。ニックネームとXアカウントは、ランキングなどで表示される場合があります。",
      "登録済みの方は、メールアドレスとパスワードでログインしてください。",
    ],
  },
  {
    title: "ポイントをためる",
    items: [
      "配布されたコードを「コード入力でポイント獲得」から入力すると、ポイントを受け取れます。",
      "クイズやニブイチの結果によってポイントを獲得できる場合があります。",
      "現在のポイントはトップページで確認できます。",
    ],
  },
  {
    title: "今日のニブイチ",
    items: [
      "「今日のニブイチに参加する」から、4つの選択肢の中から予想を1つ選んで確定します。",
      "その日の結果が確定すると、トップページ・ランキング・結果履歴で参加状況を確認できます。",
      "総合戦績と個人戦績もニブイチのページで確認できます。",
    ],
  },
  {
    title: "ガチャ・クイズ",
    items: [
      "ガチャ一覧から、公開されているガチャを選んで引けます。結果は「ガチャ結果を見る」で確認できます。",
      "クイズ一覧からクイズに回答できます。回答後のクイズやランキングは、クイズの各メニューから確認できます。",
    ],
  },
  {
    title: "発送物を選ぶ",
    items: [
      "必要なポイントがたまったら、「発送物を選ぶ」から希望する商品を選択できます。",
      "選択した発送物の状況は「発送履歴を見る」で確認できます。",
    ],
  },
  {
    title: "プロフィール・書庫",
    items: [
      "ニックネームやXアカウントなどは「プロフィールを編集する」から変更できます。",
      "入手した思い出やオリカは「書庫を見る」から確認できます。",
    ],
  },
];

export default function GuidePage() {
  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "32px 20px",
      }}
    >
      <h1 style={{ textAlign: "center", marginBottom: "12px" }}>
        ゆめつきの書斎の使い方
      </h1>
      <p
        style={{
          textAlign: "center",
          color: "#555",
          marginBottom: "28px",
          lineHeight: 1.7,
        }}
      >
        ゆめつきの書斎で楽しめる機能と、基本的な使い方を紹介します。
      </p>

      {sections.map((section) => (
        <section
          key={section.title}
          style={{
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            marginBottom: "20px",
            padding: "20px",
          }}
        >
          <h2 style={{ color: "#4f46e5", fontSize: "20px", marginBottom: "12px" }}>
            {section.title}
          </h2>
          <ul style={{ margin: 0, paddingLeft: "22px", lineHeight: 1.8 }}>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <div style={{ textAlign: "center", marginTop: "28px" }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            background: "#4f46e5",
            borderRadius: "8px",
            color: "white",
            fontWeight: "bold",
            padding: "12px 24px",
            textDecoration: "none",
          }}
        >
          トップページへ
        </Link>
      </div>
    </main>
  );
}
