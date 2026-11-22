/* eslint-disable @typescript-eslint/no-require-imports -- Loopback-only UI checks with mock services. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const base = process.env.NANIKA_TEST_URL || "http://127.0.0.1:3215";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Only loopback UI checks are allowed");
const image = fs.readFileSync(path.join(__dirname, "..", "public/menu/thumbnails/nanika-gacha.png"));

async function run() {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      let satelliteFails = true;
      const catalogueRequests = [], imageRequests = [], errors = [];
      await context.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === "us-east1-point-app-1f854.cloudfunctions.net" && url.pathname.endsWith("/listNanikaGachaPrizes")) {
          const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
          if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
          const { tier } = request.postDataJSON().data;
          return route.fulfill({ contentType: "application/json", headers, body: JSON.stringify({
            result: { items: [{ id: "existing-gallery", tier, name: "既存ページの景品",
              image: "/api/nanika-gacha/images/existing-gallery" }], nextCursor: null },
          }) });
        }
        if (url.origin !== base) return route.abort();
        if (url.pathname === "/api/nanika-gacha/prizes") {
          assert.equal(request.headers().authorization, undefined);
          catalogueRequests.push(url);
          const tier = url.searchParams.get("tier"), cursor = url.searchParams.get("cursor");
          if (tier === "satellite" && satelliteFails) {
            return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Mock failure"}' });
          }
          const indexes = tier === "star" ? [] : tier === "psa" ? cursor ? [49, 50] : Array.from({ length: 50 }, (_, i) => i) : [0];
          return route.fulfill({ contentType: "application/json", body: JSON.stringify({
            items: indexes.map(index => ({ id: `${tier}-${index}`, tier, name: tier === "planet" ?
              "2026 POKEMON JAPANESE M3-NULLIFYING ZERO 115 ROSA'S ENCOURAGEMENT SPECIAL ART RARE" : `${tier}景品${index}`,
              image: `/api/nanika-gacha/images/${tier}-${index}` })),
            nextCursor: tier === "psa" && !cursor ? "next" : null,
          }) });
        }
        if (url.pathname.startsWith("/api/nanika-gacha/images/")) {
          imageRequests.push(url);
          return route.fulfill({ contentType: "image/png", body: image });
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/nanika-gacha/guide`);
      await page.getByRole("link", { name: "4カテゴリーの景品一覧を見る（ログイン不要）" }).click();
      await page.getByRole("heading", { name: "何かの景品ガチャ：景品一覧", exact: true }).waitFor();
      assert.equal(await page.locator('section[id^="prizes-"]').count(), 4);
      const psa = page.locator("#prizes-psa"), satellite = page.locator("#prizes-satellite");
      const planet = page.locator("#prizes-planet"), star = page.locator("#prizes-star");
      await psa.getByRole("button", { name: "psa景品0を拡大", exact: true }).waitFor();
      assert.deepEqual([...new Set(catalogueRequests.map(url => url.searchParams.get("tier")))].sort(), ["planet", "psa", "satellite", "star"]);
      assert.equal(await psa.locator("li").count(), 50);
      await satellite.getByRole("alert").waitFor();
      await star.getByText("現在抽選できる景品はありません。").waitFor();
      assert.equal(await planet.locator("li").count(), 1, "One category failure must not hide the others");
      assert.ok(imageRequests.every(url => !url.searchParams.has("size")), "Full images must be fetched only after selection");
      await psa.getByRole("button", { name: "psa景品0を拡大", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "psa景品0", exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('dialog img')?.complete);
      assert.ok(imageRequests.some(url => url.pathname.endsWith("/psa-0") && url.searchParams.get("size") === "full"));
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
      await psa.getByRole("button", { name: "何かのPSAガチャの次の50件を表示", exact: true }).click();
      await psa.getByRole("button", { name: "psa景品50を拡大", exact: true }).waitFor();
      assert.equal(await psa.locator("li").count(), 51);
      satelliteFails = false;
      await satellite.getByRole("button", { name: /景品一覧を再取得/ }).click();
      await satellite.getByRole("button", { name: "satellite景品0を拡大", exact: true }).waitFor();
      assert.equal(await satellite.getByRole("alert").count(), 0);
      await satellite.getByRole("button", { name: "satellite景品0を拡大", exact: true }).click();
      await dialog.getByRole("heading", { name: "satellite景品0", exact: true }).waitFor();
      assert.equal(await dialog.getAttribute("aria-labelledby"), "nanika-prize-name-satellite");
      await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.ok(await page.evaluate(() => [...document.querySelectorAll('[aria-hidden="true"]')].some(element =>
        getComputedStyle(element).backgroundImage.includes("yumetsuki-stars.webp"))));
      const publicRequestCount = catalogueRequests.length;
      await page.goto(`${base}/nanika-gacha/prizes/planet`);
      await page.getByRole("heading", { name: "何かのPSA10ガチャ（惑星級）の景品一覧", exact: true }).waitFor();
      await page.getByRole("button", { name: "景品1を拡大", exact: true }).click();
      await page.getByRole("dialog").getByRole("heading", { name: "既存ページの景品", exact: true }).waitFor();
      assert.equal(catalogueRequests.length, publicRequestCount, "Existing single-category pages retain their original callable");
      await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`Guest catalogue UI passed at ${width}px`);
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
