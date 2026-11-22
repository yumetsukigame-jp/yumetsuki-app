import Link from "next/link";

export default function NanikaRightCompletePage() {
  return <div style={{ padding: 20, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
    <h1>景品ガチャの権利を付与しました</h1>
    <p>この時点では景品の発送は行われません。何かの景品ガチャで権利を使って抽選し、景品を確定してください。</p>
    <p>権利による抽選の追加参加費は0ポイントです。保有している権利と残り回数は、何かの景品ガチャの画面で確認できます。</p>
    <Link href="/nanika-gacha">何かの景品ガチャで景品を確定する</Link>
  </div>;
}
