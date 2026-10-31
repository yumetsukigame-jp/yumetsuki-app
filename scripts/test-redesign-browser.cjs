/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local browser validation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const functionRequire = createRequire(path.join(__dirname, "../functions/lib/neraiuchi.js"));
const admin = functionRequire("firebase-admin");
const { getFirestore, Timestamp } = functionRequire("firebase-admin/firestore");

if (process.env.GCLOUD_PROJECT !== "demo-yumetsuki" ||
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
  throw new Error("Only demo-yumetsuki loopback emulators are allowed.");
}
const base = process.env.REDESIGN_TEST_URL || "http://127.0.0.1:3123";
if (new URL(base).hostname !== "127.0.0.1") throw new Error("Browser target must be loopback.");
process.env.NERAIUCHI_ENABLED = "true";
const api = require("../functions/lib/neraiuchi");
const db = getFirestore();
const artifacts = process.env.REDESIGN_TEST_ARTIFACTS;

async function account(isAdmin) {
  const email = `${randomUUID()}@example.invalid`;
  const password = "emulator-only-password";
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  const { localId: uid } = await response.json();
  await db.collection("users").doc(uid).set({
    displayName: "画面検証用アカウント", xAccount: "@emulator_sample",
    points: 123, totalLoginDays: 42, subscriber: true,
  });
  if (isAdmin) await db.collection("admins").doc(uid).set({ testOnly: true });
  return { uid, email, password };
}

async function login(page, actor) {
  const errors = [];
  const captureError = (message) => {
    if (message.type() === "error") errors.push(message.text());
  };
  page.on("console", captureError);
  await page.goto(`${base}/login`);
  // SSR inputs appear before React can update their controlled values.
  await page.waitForFunction(() => ["メールアドレス", "パスワード"].every((placeholder) => {
    const input = document.querySelector(`input[placeholder="${placeholder}"]`);
    return input && Object.entries(input).some(([key, props]) =>
      key.startsWith("__reactProps$") && typeof props.onChange === "function");
  }));
  await page.getByPlaceholder("メールアドレス").fill(actor.email);
  await page.getByPlaceholder("パスワード", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  try {
    await page.waitForURL(`${base}/`);
  } catch (error) {
    await screenshot(page, "login-failure.png");
    console.error("Emulator-only login diagnostic:", page.url(), await page.locator("body").innerText());
    console.error("Emulator-only browser errors:", errors);
    throw error;
  } finally {
    page.off("console", captureError);
  }
  await page.getByRole("heading", { name: /画面検証用アカウント/ }).waitFor();
}

async function context(browser, options = {}) {
  const ctx = await browser.newContext({ reducedMotion: "reduce", ...options });
  await ctx.route("**/*", (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (!["127.0.0.1", "localhost"].includes(hostname)) return route.abort();
    return route.continue();
  });
  return ctx;
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    `Horizontal overflow: ${page.url()}`);
}

async function background(page, expected) {
  const layer = page.locator('div[aria-hidden="true"]').filter({ hasNot: page.locator("img") });
  const found = await page.evaluate(() => [...document.querySelectorAll('div[aria-hidden="true"]')]
    .find((element) => getComputedStyle(element).backgroundImage.includes("yumetsuki-stars")));
  assert.equal(Boolean(found), expected);
  if (expected) {
    const properties = await layer.evaluateAll((elements) => {
      const element = elements.find((node) => getComputedStyle(node).backgroundImage.includes("yumetsuki-stars"));
      const style = getComputedStyle(element);
      return { position: style.position, events: style.pointerEvents, repeat: style.backgroundRepeat, color: style.backgroundColor };
    });
    assert.deepEqual(properties, { position: "fixed", events: "none", repeat: "no-repeat", color: "rgb(8, 21, 46)" });
  }
}

async function screenshot(page, name, fullPage = false) {
  if (!artifacts) return;
  fs.mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, name), fullPage });
}

async function run() {
  const actor = await account(true);
  const nonAdmin = await account(false);
  const losingActor = await account(false);
  const now = Date.now();
  await db.collection("homeAnnouncements").doc("archiveUpdates").set({
    items: Array.from({ length: 4 }, (_, index) => ({
      id: `ui-${index}`, type: "quiz_new", title: `検証用お知らせ${index}`,
      archivedAt: Timestamp.fromMillis(now - index),
    })),
  });
  const saved = await api.adminSaveNeraiuchiDraft.run({
    title: "検証用の狙い撃ち", description: "エミュレータでの画面検証です。実際の賞品はありません。",
    thumbnailPath: "/menu/thumbnails/neraiuchi.png", startsAt: now - 10000, endsAt: now + 3600000,
    maxEntries: 10, prizes: [
      { number: 1, label: "発送検証用の架空賞品", points: 25, shippingEnabled: true },
      { number: 3, label: "検証用ポイント", points: 50, shippingEnabled: false },
    ], claimInstructions: "隔離エミュレータ内の検証です。本物の発送は行いません。",
  }, { auth: { uid: actor.uid } });
  const published = await api.adminPublishNeraiuchi.run({ eventId: saved.eventId, expectedVersion: saved.version }, { auth: { uid: actor.uid } });
  const expectedLinks = [
    "/nibuichi", "/nibuichi/guide", "/nibuichi/ranking", "/nibuichi/history",
    "/gacha/list", "/gacha/guide", "/gacha", "/gacha/results", "/gacha/archive",
    "/quizzes", "/quizzes/guide", "/quizzes/archive", "/quizzes/ranking",
    "/neraiuchi", "/neraiuchi/guide", "/neraiuchi/history",
    "/code", "/reward", "/history", "/archive", "/profile", "/guide", "/admin",
    "https://yumetsuki.base.shop",
  ];
  if (process.env.REDESIGN_TEST_WEBKIT_ONLY !== "true") {
  const browser = await chromium.launch();
  try {
    const ctx = await context(browser, { viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.getByText("ログインしてください。", { exact: false }).waitFor();
    await background(page, true); await noOverflow(page);
    await screenshot(page, "logged-out-390.png");
    await login(page, actor);
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base);
      await page.getByRole("heading", { name: /画面検証用アカウント/ }).waitFor();
      assert.equal(await page.locator('a[href="/profile"]').isVisible(), false);
      const closedButtons = page.getByRole("button", { name: /の詳細メニューを表示/ });
      while (await closedButtons.count()) {
        const button = closedButtons.first();
        const controls = await button.getAttribute("aria-controls");
        assert.equal(await button.getAttribute("aria-expanded"), "false");
        await button.click();
        await page.waitForFunction((id) => [...document.querySelectorAll("button")]
          .some((element) => element.getAttribute("aria-controls") === id && element.getAttribute("aria-expanded") === "true"), controls);
      }
      const links = await page.locator("a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
      assert.ok(expectedLinks.every((href) => links.includes(href)));
      await noOverflow(page); await background(page, true);
      await screenshot(page, `home-${width}.png`, true);
      await page.evaluate(() => window.scrollTo(0, 1700));
      await screenshot(page, `home-scrolled-${width}.png`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base);
    await page.getByRole("button", { name: /詳細を表示（残り/ }).waitFor();
    await page.getByRole("button", { name: /詳細を表示（残り/ }).click();
    await page.getByText("検証用お知らせ3", { exact: false }).waitFor();
    await page.getByRole("button", { name: "詳細を閉じる", exact: true }).click();
    for (const route of ["/nibuichi", "/gacha/list", "/quizzes", "/code", "/reward", "/history", "/archive", "/profile", "/guide", "/login", "/signup"]) {
      await page.goto(base + route);
      await background(page, true); await noOverflow(page);
      assert.equal(await page.locator("#page-content").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(255, 255, 255)");
    }
    await page.goto(base + "/admin/neraiuchi");
    await page.getByRole("heading", { name: "企画一覧" }).waitFor();
    await page.getByText("新しい企画を下書きで作成", { exact: true }).click();
    const form = page.locator("form").first();
    assert.equal(await form.locator("fieldset").count(), 1);
    await form.getByRole("button", { name: "当選枠を追加" }).click();
    assert.equal(await form.locator("fieldset").count(), 2);
    await form.getByRole("button", { name: "当選枠 2を削除" }).click();
    assert.equal(await form.locator("fieldset").count(), 1);
    await form.getByLabel("この商品を発送できるようにする").check();
    await form.getByLabel("発送を選択しない場合のポイント").waitFor();
    await form.getByLabel("企画名（80文字まで）").fill("画面入力で保存する検証用下書き");
    await form.getByLabel("説明（2,000文字まで）").fill("エミュレータ内だけで検証します。");
    const startsInput = new Date(now + 9 * 3600000).toISOString().slice(0, 19);
    const endsInput = new Date(now + 10 * 3600000).toISOString().slice(0, 19);
    await form.getByLabel("開始日時（日本時間）").fill(startsInput);
    await form.getByLabel("終了日時（日本時間・この時刻から受付不可）").fill(endsInput);
    await form.getByLabel("賞品名（発送する商品名／ポイントの名称）").fill("フォーム入力の架空発送品");
    await form.getByLabel("発送を選択しない場合のポイント").fill("32");
    await form.getByRole("button", { name: "当選枠を追加" }).click();
    const secondPrize = form.locator("fieldset").nth(1);
    await secondPrize.getByLabel("賞品名（発送する商品名／ポイントの名称）").fill("フォーム入力のポイント");
    await secondPrize.getByLabel("受け取りポイント").fill("7");
    await form.getByRole("button", { name: "下書きを保存" }).click();
    await page.waitForURL(/\/admin\/neraiuchi\/[A-Za-z0-9_-]+$/);
    const formEventId = new URL(page.url()).pathname.split("/").pop();
    const formEvent = await api.adminGetNeraiuchiEvent.run({ eventId: formEventId }, { auth: { uid: actor.uid } });
    assert.deepEqual(formEvent.event.prizes, [
      { number: 1, label: "フォーム入力の架空発送品", points: 32, shippingEnabled: true },
      { number: 2, label: "フォーム入力のポイント", points: 7, shippingEnabled: false },
    ]);
    assert.equal(formEvent.event.startsAt, Math.floor(now / 1000) * 1000);
    await screenshot(page, "neraiuchi-admin-prizes-390.png", true);
    await background(page, false); await noOverflow(page);
    await page.goto(`${base}/admin/neraiuchi/${saved.eventId}`);
    await page.getByText("管理者のみ：当選番号", { exact: false }).waitFor();
    await page.getByRole("button", { name: "参加結果を取得・更新" }).click();
    await noOverflow(page); await screenshot(page, "admin-390.png", true);
    await page.goto(`${base}/neraiuchi/${saved.eventId}`);
    await page.getByRole("button", { name: "狙い撃ちに参加！" }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "狙い撃ちに参加！" }).click();
    await page.getByRole("heading", { name: "参加済みです" }).waitFor();
    assert.equal(await page.getByText("あなたの参加番号：", { exact: false }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "当選品を受け取る" }).count(), 0);
    assert.equal(await page.locator("table").count(), 0);
    await screenshot(page, "neraiuchi-pending-390.png", true);
    await page.reload();
    await page.getByRole("heading", { name: "参加済みです" }).waitFor();
    await page.goto(`${base}/neraiuchi/history`);
    await page.getByRole("heading", { name: "参加済みです" }).waitFor();
    assert.equal(await page.getByText("あなたの参加番号：", { exact: false }).count(), 0);
    await noOverflow(page); await screenshot(page, "history-390.png", true);
    await api.joinNeraiuchi.run({ eventId: saved.eventId }, { auth: { uid: losingActor.uid } });

    const deniedCtx = await context(browser);
    const denied = await deniedCtx.newPage();
    await login(denied, nonAdmin);
    await denied.goto(`${base}/neraiuchi/${saved.eventId}`);
    denied.once("dialog", (dialog) => dialog.accept());
    await denied.getByRole("button", { name: "狙い撃ちに参加！" }).click();
    await denied.getByRole("heading", { name: "参加済みです" }).waitFor();
    await denied.goto(`${base}/admin/neraiuchi/${saved.eventId}`);
    await denied.getByRole("alert").waitFor();
    assert.equal(await denied.getByText("管理者のみ：当選番号", { exact: false }).count(), 0);

    await api.adminCloseNeraiuchi.run({
      eventId: saved.eventId, expectedVersion: published.version, reason: "Emulator browser check",
    }, { auth: { uid: actor.uid } });
    await page.goto(`${base}/neraiuchi/${saved.eventId}`);
    await page.getByRole("heading", { name: "当選おめでとうございます！" }).waitFor();
    await page.locator('tr[data-self="true"][data-winner="true"]').waitFor();
    assert.equal(await page.locator("tbody tr").count(), 3);
    await page.getByRole("button", { name: "自分の位置を表示" }).click();
    await page.locator('tr[data-self="true"][data-winner="true"]').waitFor();
    await noOverflow(page); await screenshot(page, "neraiuchi-results-390.png", true);
    await page.getByRole("button", { name: "当選品を受け取る" }).click();
    await page.getByRole("button", { name: "この商品を発送する" }).waitFor();
    await screenshot(page, "neraiuchi-claim-390.png", true);
    await page.goto(`${base}/neraiuchi/${saved.eventId}`);
    await page.getByRole("button", { name: "当選品を受け取る" }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "この商品を発送する" }).click();
    await page.waitForURL(`${base}/reward/complete`);
    const pending = await db.collection("shippingPending").where("eventId", "==", saved.eventId).get();
    assert.equal(pending.size, 1);
    assert.equal(pending.docs[0].get("uid"), actor.uid);
    assert.equal((await db.collection("users").doc(actor.uid).get()).get("points"), 123);
    await page.goto(`${base}/neraiuchi/${saved.eventId}`);
    await page.getByText("発送依頼は受付済みです。", { exact: false }).waitFor();
    assert.equal(await page.getByRole("button", { name: "当選品を受け取る" }).count(), 0);

    await denied.goto(`${base}/neraiuchi/${saved.eventId}`);
    await denied.getByRole("button", { name: "当選品を受け取る" }).click();
    assert.equal(await denied.getByRole("button", { name: "この商品を発送する" }).count(), 0);
    denied.once("dialog", (dialog) => dialog.accept());
    await denied.getByRole("button", { name: "50ポイントで受け取る" }).click();
    await denied.getByText("50ポイントを受け取り済みです。", { exact: false }).waitFor();
    await denied.reload();
    await denied.getByText("50ポイントを受け取り済みです。", { exact: false }).waitFor();
    assert.equal((await db.collection("users").doc(nonAdmin.uid).get()).get("points"), 173);
    assert.equal((await db.collection("neraiuchiEventsArchive").doc(saved.eventId).get()).get("acceptedCount"), 3);
    await deniedCtx.close();

    await ctx.route("**/_next/image?*", (route) => new URL(route.request().url()).searchParams.get("url")?.includes("/menu/")
      ? route.abort() : route.continue());
    await ctx.route("**/backgrounds/yumetsuki-stars.webp", (route) => route.abort());
    await page.goto(base);
    const card = page.getByRole("link", { name: /今日のニブイチに参加する/ });
    await card.waitFor();
    await page.waitForFunction(() => {
      const link = document.querySelector('a[href="/nibuichi"]');
      return link && !link.querySelector("img");
    });
    await background(page, true); await noOverflow(page);
    await card.focus();
    assert.equal(await card.evaluate((element) => getComputedStyle(element).outlineWidth), "3px");
    await screenshot(page, "image-fallback-390.png", true);
    await ctx.close();
  } finally { await browser.close(); }
  }

  if (process.env.REDESIGN_TEST_WEBKIT_ONLY === "true") {
    await api.joinNeraiuchi.run({ eventId: saved.eventId }, { auth: { uid: actor.uid } });
    await api.adminCloseNeraiuchi.run({
      eventId: saved.eventId, expectedVersion: published.version, reason: "WebKit emulator check",
    }, { auth: { uid: actor.uid } });
  }
  const safari = await webkit.launch();
  try {
    const ctx = await context(safari, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page, actor);
    await background(page, true); await noOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 1400));
    await screenshot(page, "webkit-mobile-scrolled.png");
    await page.goto(base + "/login");
    await background(page, true); await noOverflow(page);
    await page.getByPlaceholder("メールアドレス").fill("emulator@example.invalid");
    await screenshot(page, "webkit-mobile-form.png");
    await page.goto(`${base}/neraiuchi/${saved.eventId}`);
    await page.locator('tr[data-self="true"][data-winner="true"]').waitFor();
    await noOverflow(page); await screenshot(page, "webkit-neraiuchi-results.png", true);
    await ctx.close();
  } finally { await safari.close(); }
  console.log(process.env.REDESIGN_TEST_WEBKIT_ONLY === "true"
    ? "PASS: WebKit mobile scrolling, background, readable panels, input and highlighted results."
    : "PASS: Chromium 360/390/768/1280; WebKit mobile; 24 links; private pending results; addable prizes; highlighted timeline; one-time shipping/points claims; admin denial.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await Promise.all(admin.apps.map((app) => app.delete())); });
