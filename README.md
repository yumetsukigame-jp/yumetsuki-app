This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## パスワード再設定メールの配信設定

パスワード再設定メールは `sendPasswordResetLink` Cloud Function から送信します。
この Function がサーバー側で Firebase Authentication の再設定リンクを生成し、
Resend を使ってメールを配信します。

1. Resend のダッシュボードで `yumetsuki.jp` ドメインを認証（DNSレコード設定）します。
2. プロジェクトのルートディレクトリで、次のコマンドを順に実行します（値はプロンプトで入力）。

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set RESEND_FROM_EMAIL
```

3. `RESEND_API_KEY` には `re_` で始まる Resend の API キーを入力します。
4. `RESEND_FROM_EMAIL` には、手順 1 で認証したドメインの送信元アドレス（例: `no-reply@yumetsuki.jp`）を入力します。
5. 両方を設定した後、次のコマンドで Function をデプロイします。

```bash
firebase deploy --only functions
```

6. Firebase Console の **Authentication** → **Settings** → **Authorized domains** で、
パスワード再設定後の遷移先に使うドメインを許可します。
7. 設定後の疎通確認には `sendTestResendEmail` Cloud Function（管理者のみ呼び出し可能）を利用し、
任意の宛先にテストメールを送信して受信を確認できます。
