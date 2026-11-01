export type HomeMenuLink = {
  label: string;
  href: string;
  icon?: string;
  image?: string;
  description?: string;
  imageWidth?: number;
  imageHeight?: number;
};
export type HomeMenuSection = {
  id: string;
  title: string;
  color: string;
  accent: string;
  cards: HomeMenuLink[];
  guides: HomeMenuLink[];
  details: HomeMenuLink[];
};

export const homeMenu: HomeMenuSection[] = [
  {
    id: "nibuichi", title: "今日のニブイチ", color: "#854d0e", accent: "#eab308",
    cards: [{ label: "今日のニブイチに参加する", href: "/nibuichi", image: "nibuichi", description: "今日の結果を予想しよう。" }],
    guides: [{ label: "ニブイチの遊び方を見る", href: "/nibuichi/guide", icon: "book" }],
    details: [
      { label: "ランキングを見る", href: "/nibuichi/ranking", icon: "ranking" },
      { label: "自分の結果履歴を見る", href: "/nibuichi/history", icon: "history" },
    ],
  },
  {
    id: "gacha", title: "ガチャ", color: "#6b21a8", accent: "#a855f7",
    cards: [{ label: "ガチャ一覧を見る", href: "/gacha/list", image: "gacha", description: "気になる企画を一覧から。" }],
    guides: [{ label: "ガチャの遊び方を見る", href: "/gacha/guide", icon: "book" }],
    details: [
      { label: "ガチャを引く", href: "/gacha", icon: "gacha" },
      { label: "ガチャ結果を見る", href: "/gacha/results", icon: "history" },
      { label: "ガチャアーカイブを見る", href: "/gacha/archive", icon: "book" },
    ],
  },
  {
    id: "nanika-gacha", title: "何かの景品ガチャ", color: "#4338ca", accent: "#818cf8",
    cards: [{ label: "何かの景品ガチャを見る", href: "/nanika-gacha", image: "nanika-gacha", imageWidth: 1536, imageHeight: 1024, description: "画像の景品を、発送またはポイントで。" }],
    guides: [{ label: "何かの景品ガチャの遊び方", href: "/nanika-gacha/guide", icon: "book" }],
    details: [{ label: "自分の当選・受取履歴を見る", href: "/nanika-gacha/history", icon: "history" }],
  },
  {
    id: "quiz", title: "クイズ", color: "#0369a1", accent: "#0ea5e9",
    cards: [{ label: "クイズ一覧を見る", href: "/quizzes", image: "quiz", description: "問題を選んで挑戦しよう。" }],
    guides: [{ label: "クイズの遊び方を見る", href: "/quizzes/guide", icon: "book" }],
    details: [
      { label: "完了済みクイズを見る", href: "/quizzes/archive", icon: "history" },
      { label: "クイズランキングを見る", href: "/quizzes/ranking", icon: "ranking" },
    ],
  },
  {
    id: "neraiuchi", title: "ゆめつきの狙い撃ち", color: "#0e7490", accent: "#22d3ee",
    cards: [{ label: "狙い撃ちの企画を見る", href: "/neraiuchi", image: "neraiuchi", description: "次の一押しに、期待を込めて。" }],
    guides: [{ label: "狙い撃ちの遊び方を見る", href: "/neraiuchi/guide", icon: "book" }],
    details: [{ label: "自分の参加履歴を見る", href: "/neraiuchi/history", icon: "history" }],
  },
  {
    id: "points", title: "ポイント関連", color: "#1d4ed8", accent: "#2563eb",
    cards: [
      { label: "コード入力でポイント獲得", href: "/code", image: "code", description: "受け取ったコードを入力。" },
      { label: "発送物を選ぶ", href: "/reward", image: "reward", description: "ポイントで選べる発送物を確認。" },
    ],
    guides: [],
    details: [{ label: "発送履歴を見る", href: "/history", icon: "history" }],
  },
  {
    id: "account", title: "アカウント", color: "#166534", accent: "#16a34a",
    cards: [{ label: "書庫を見る", href: "/archive", image: "archive", description: "オリカや、企画の思い出を。" }],
    guides: [],
    details: [{ label: "プロフィールを編集する", href: "/profile", image: "profile", description: "登録内容を確認・編集。" }],
  },
];

export const homeGuide: HomeMenuLink = {
  label: "ゆめつきの書斎の使い方を見る", href: "/guide", image: "guide",
  description: "アプリの機能や楽しみ方を画像つきで紹介しています。",
};

export function visibleHomeMenu(neraiuchiEnabled: boolean): HomeMenuSection[] {
  return homeMenu.filter((section) => section.id !== "neraiuchi" || neraiuchiEnabled);
}
