/* eslint-disable @typescript-eslint/no-require-imports -- Local browser checks with mock services only. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const base = process.env.GACHA_CREATE_TEST_URL || "http://127.0.0.1:3227";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Only loopback UI tests are allowed");
const root = path.join(__dirname, "..");
const apiKey = fs.readFileSync(path.join(root, "firebase.ts"), "utf8").match(/apiKey: "([^"]+)"/)[1];
const uid = "gacha_layout_test";
const token = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({
  aud: "point-app-1f854", sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: "password" },
})).toString("base64url")}.mock`;
const cors = { "Access-Control-Allow-Origin": base, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function checkLayout(page) {
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    controls: [...document.querySelector('[role="main"]').querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), textarea, select')].map(element => {
      const rect = element.getBoundingClientRect();
      return { type: element.type, width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(element).fontSize),
        visible: rect.left >= 0 && rect.right <= window.innerWidth };
    }),
  }));
  assert.equal(layout.overflow, false, "The page must not scroll horizontally");
  assert.ok(layout.controls.length >= 10);
  for (const control of layout.controls) {
    assert.ok(control.visible, "Every input must fit in the viewport");
    assert.ok(control.height >= 44, `Input touch targets must be at least 44px tall: ${JSON.stringify(control)}`);
    assert.ok(control.font >= 16, "Input text must stay readable and avoid iOS focus zoom");
    assert.ok(control.width >= (control.type === "number" ? 96 : 180), "Inputs must not shrink into narrow strips");
  }
}

async function run() {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 375, 390, 768, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        try {
          const imageUrl = `${base}/mock-gacha-image/${"long-name-".repeat(40)}.png`;
          await context.addInitScript(({ apiKey, uid, token, imageUrl }) => {
            sessionStorage.setItem("home-user", JSON.stringify({
              uid, nickname: "ローカル画面検証", points: 100, totalLoginDays: 1, subscriber: false,
            }));
            window.mockGachaImages = [
              { url: imageUrl, folder: "gacha/regular" },
              { url: imageUrl + "?event", folder: "gacha/event" },
            ];
            const open = indexedDB.open("firebaseLocalStorageDb", 1);
            open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
            open.onsuccess = () => {
              const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
              tx.objectStore("firebaseLocalStorage").put({
                fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
                value: { uid, email: "local@example.invalid", emailVerified: true, isAnonymous: false,
                  providerData: [], apiKey, appName: "[DEFAULT]",
                  stsTokenManager: { refreshToken: "mock-only", accessToken: token, expirationTime: Date.now() + 3600000 },
                  createdAt: String(Date.now()), lastLoginAt: String(Date.now()) },
              });
              tx.oncomplete = () => { open.result.close(); window.gachaSeeded = true; };
            };
          }, { apiKey, uid, token, imageUrl });
          const requests = [];
          await context.route("**/*", async route => {
            const url = new URL(route.request().url());
            if (url.origin === base) {
              if (url.pathname === "/mock-gacha-bootstrap") return route.fulfill({ contentType: "text/html", body: "<html><body></body></html>" });
              if (/\/chunks\/app\/admin\/layout-[^/]+\.js$/.test(url.pathname)) {
                const response = await route.fetch(), text = await response.text();
                const cache = text.match(/([\w$]+)=new Set;/);
                assert.ok(cache && text.includes(`${cache[1]}.has(`), "Admin role cache fixture needs updating");
                return route.fulfill({ response, body: text.replace(cache[0], `${cache[1]}=new Set(["${uid}"]);`) });
              }
              if (/\/chunks\/app\/admin\/gacha\/page-[^/]+\.js$/.test(url.pathname)) {
                const response = await route.fetch(), text = await response.text();
                const loader = text.match(/([\w$]+)=async ([\w$]+)=>\{let [\w$]+=1===\2\.length\?[\s\S]*?"imageMeta"[\s\S]*?\.filter\([\s\S]*?\)\};/);
                assert.ok(loader, "Image loader fixture needs updating");
                return route.fulfill({ response, body: text.replace(loader[0], `${loader[1]}=async folders=>window.mockGachaImages.filter(image=>folders.includes(image.folder));`) });
              }
              if (url.pathname.startsWith("/mock-gacha-image/")) return route.fulfill({
                contentType: "image/png", body: fs.readFileSync(path.join(root, "public/menu/thumbnails/nanika-gacha.png")),
              });
              return route.continue();
            }
            if (route.request().method() === "OPTIONS") return route.fulfill({
              status: 204, headers: { ...cors, "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] || cors["Access-Control-Allow-Headers"] },
            });
            if (url.hostname === "identitytoolkit.googleapis.com") return route.fulfill({
              contentType: "application/json", headers: cors,
              body: JSON.stringify({ users: [{ localId: uid, email: "local@example.invalid", emailVerified: true }] }),
            });
            if (url.hostname === "us-east1-point-app-1f854.cloudfunctions.net" && url.pathname === "/createGachaCode") {
              requests.push(route.request().postDataJSON().data);
              return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ result: { code: "YG-MOCK" } }) });
            }
            if (url.hostname === "us-east1-point-app-1f854.cloudfunctions.net" && url.pathname === "/recordDailyLogin") {
              return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ result: { points: 100, totalLoginDays: 1 } }) });
            }
            return route.abort();
          });
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", error => errors.push(error.message.replace(/\?key=[^\s]+/g, "?key=[redacted]")));
          page.on("dialog", dialog => dialog.accept());
          await page.goto(`${base}/mock-gacha-bootstrap`);
          await page.waitForFunction(() => window.gachaSeeded);
          await page.goto(`${base}/admin/gacha`);
          await page.getByRole("heading", { name: "🎰 ガチャ作成" }).waitFor();
          await page.locator('h1').evaluate(element => element.parentElement.setAttribute("role", "main"));

          await page.getByLabel("ガチャタイトル", { exact: true }).fill("スマホから作成する景品ガチャ");
          await page.getByLabel("ガチャの説明文（任意）", { exact: true }).fill("長い説明文".repeat(20));
          await page.getByLabel("Xアカウント使用型", { exact: true }).check();
          await page.getByLabel("Xアカウント一覧（長文貼り付けOK）", { exact: true }).fill("@sample\n@another");
          await page.getByRole("group", { name: "レギュラーのサムネイル画像" }).getByRole("button").click();
          await page.getByRole("button", { name: "イベント画像を読み込む" }).click();
          await page.getByRole("group", { name: "イベントのサムネイル画像" }).getByRole("button").waitFor();
          await page.getByLabel("総数", { exact: true }).fill("10");
          await page.getByLabel("消費ポイント", { exact: true }).fill("100");
          await page.getByLabel("上限回数", { exact: true }).fill("2");
          await page.getByLabel("締切日時（日本時間・JST）", { exact: true }).fill("2026-12-31T23:59");
          const first = page.getByRole("region", { name: "枠 1", exact: true });
          const longName = "何かのPSA10ガチャの権利を獲得できる特別な景品枠";
          await first.getByLabel("枠名", { exact: true }).fill(longName);
          await first.getByRole("combobox", { name: "演出", exact: true }).selectOption("top");
          await first.getByLabel("上限数", { exact: true }).fill("7");
          await first.getByLabel("最小報酬（pt）", { exact: true }).fill("20");
          await first.getByLabel("最大報酬（pt）", { exact: true }).fill("30");
          await first.getByRole("combobox", { name: "景品の受取内容", exact: true }).selectOption("star");
          await checkLayout(page);
          await page.getByRole("button", { name: "ガチャを作成する", exact: true }).click();
          await page.getByText("作成されたコード：").waitFor();
          assert.equal(requests.length, 1);
          assert.equal(requests[0].frames[0].label, longName);
          assert.equal(requests[0].frames[0].nanikaTier, "star");
          assert.equal(requests[0].frames[0].animationLevel, "top");
          assert.equal(requests[0].frames[1].maxCount, 3);
          assert.equal(requests[0].thumbnail, imageUrl);
          assert.equal(requests[0].resetType, "x_account");
          assert.deepEqual(requests[0].xAccountList, ["@sample", "@another"]);

          await page.getByLabel("確率方式", { exact: true }).check();
          await first.getByLabel("確率（%）", { exact: true }).fill("37.5");
          await page.getByRole("button", { name: "ガチャを作成する", exact: true }).click();
          await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(button => button.textContent === "作成中…"));
          assert.equal(requests.length, 2);
          assert.equal(requests[1].mode, "probability");
          assert.equal(requests[1].frames[0].probability, 0.375);
          assert.equal(requests[1].frames[1].probability, 0.625);
          await page.getByRole("button", { name: "＋ 枠を追加" }).click();
          await page.getByRole("region", { name: "枠 3（最後の枠）" }).waitFor();
          await checkLayout(page);
          assert.deepEqual(errors, []);
          if (process.env.GACHA_CREATE_TEST_ARTIFACTS && width === 390) {
            await fs.promises.mkdir(process.env.GACHA_CREATE_TEST_ARTIFACTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.GACHA_CREATE_TEST_ARTIFACTS, `gacha-create-${name}.png`), fullPage: true });
          }
          console.log(`${name} ${width}px: readable inputs, no overflow, count/probability creation preserved`);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
