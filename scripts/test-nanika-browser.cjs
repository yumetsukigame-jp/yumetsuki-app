/* eslint-disable @typescript-eslint/no-require-imports -- Local UI checks with mock services only. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const base = process.env.NANIKA_TEST_URL || "http://127.0.0.1:3215";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Only loopback UI tests are allowed");
const root = path.join(__dirname, "..");
const apiKey = fs.readFileSync(path.join(root, "firebase.ts"), "utf8").match(/apiKey: "([^"]+)"/)[1];
const uid = "browser_test";
const token = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({
  aud: "point-app-1f854", sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: "password" },
})).toString("base64url")}.mock`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function run() {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: "no-preference" });
      await context.addInitScript(({ apiKey, uid, token }) => {
        sessionStorage.setItem("home-user", JSON.stringify({
          uid, nickname: "ローカル画面検証", points: 100, totalLoginDays: 1, subscriber: false,
        }));
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
          tx.oncomplete = () => { open.result.close(); window.nanikaSeeded = true; };
        };
      }, { apiKey, uid, token });
      let slots = ["psa", "satellite", "planet", "star"].map(tier => ({
        tier, fee: 10, exchangePoints: 30, visible: true, version: 1, roundId: "mock-round",
        publishedAt: Date.parse("2026-11-01T11:56:00.000Z"),
        available: 2, remainingUses: 2, xAccounts: ["@browser_test", "@browser_test"],
      }));
      const receipts = [];
      const images = [];
      const imageRequests = [];
      let homeStatusFails = false;
      let videoFails = false;
      let normalOutcome = "win", normalDraws = 0;
      let claims = 0, draws = 0;
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === base) {
          if (process.env.GACHA_VIDEO_TEST_ONLY === "1" && /\/chunks\/app\/gacha\/page-[^/]+\.js$/.test(url.pathname)) {
            // Replace only legacy document reads; all draw/claim calls remain network mocks.
            const response = await route.fetch(), text = await response.text();
            const read = text.match(/await (\(0,[\w$]+\.[\w$]+\))\(\(0,[\w$]+\.[\w$]+\)\([\w$.]+,"gachaCodes"/);
            assert.ok(read, "Legacy gacha document-read fixture needs updating");
            return route.fulfill({ response, body: text.replaceAll(read[1], "window.mockGachaDocument") });
          }
          if (videoFails && /^\/gacha\/(win|lose)\.mp4$/.test(url.pathname)) {
            return route.fulfill({ status: 503, body: "Mock video failure" });
          }
          if (/\/chunks\/app\/admin\/layout-[^/]+\.js$/.test(url.pathname)) {
            // Mock the legacy client role cache only; actual new API authorization is tested separately.
            const response = await route.fetch(), text = await response.text();
            const cache = text.match(/([\w$]+)=new Set;/);
            assert.ok(cache && text.includes(`${cache[1]}.has(`) && text.includes(`${cache[1]}.add(`), "Admin role cache fixture needs updating");
            return route.fulfill({ response, body: text.replace(cache[0], `${cache[1]}=new Set(["${uid}"]);`) });
          }
          if (url.pathname.startsWith("/api/nanika-gacha/images/")) {
            imageRequests.push(url);
            return route.fulfill({
              contentType: "image/png", body: fs.readFileSync(path.join(root, "public/menu/thumbnails/nanika-gacha.png")),
            });
          }
          return route.continue();
        }
        if (["identitytoolkit.googleapis.com", "us-east1-point-app-1f854.cloudfunctions.net"].includes(url.hostname) && route.request().method() === "OPTIONS") {
          return route.fulfill({ status: 204, headers: { ...cors, "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] || "Authorization,Content-Type" } });
        }
        if (url.hostname === "identitytoolkit.googleapis.com") return route.fulfill({
          contentType: "application/json", headers: cors,
          body: JSON.stringify({ users: [{ localId: uid, email: "local@example.invalid", emailVerified: true }] }),
        });
        if (url.hostname !== "us-east1-point-app-1f854.cloudfunctions.net") return route.abort();
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        const action = url.pathname.split("/").at(-1), input = route.request().postDataJSON().data;
        let result;
        if (action === "listNanikaGacha" || action === "adminGetNanikaGacha") result = { items: slots };
        else if (action === "unlockGachaCode") result = {};
        else if (action === "useGachaCode") {
          normalDraws++;
          result = { resultId: `normal-video-${normalDraws}`, frame: normalOutcome === "win" ? "当たり" : "はずれ",
            reward: 30, shippingEnabled: normalOutcome === "lose" };
        }
        else if (action === "listNanikaGachaPrizes") {
          const start = input.cursor ? 50 : 0, end = input.cursor ? 51 : 50;
          result = { items: Array.from({ length: end - start }, (_, index) => ({
            id: `gallery-${input.tier}-${start + index}`, tier: input.tier, name: `${input.tier}景品${start + index}`,
            image: `/api/nanika-gacha/images/gallery-${input.tier}-${start + index}`,
          })), nextCursor: input.cursor ? null : "gallery-cursor" };
        }
        else if (action === "getNeraiuchiHomeStatus") {
          if (homeStatusFails) return route.fulfill({
            status: 500, contentType: "application/json", headers: cors,
            body: JSON.stringify({ error: { status: "INTERNAL", message: "Mock status failure" } }),
          });
          result = { event: null, latestEnded: { id: "ended-event", title: "終了告知の画面検証", endedAt: Date.now() - 1000 }, refreshAt: null };
        }
        else if (action === "recordDailyLogin") result = { points: 100, totalLoginDays: 1 };
        else if (action === "getNibuichiUserStats") result = { global: {} };
        else if (action === "drawNanikaGacha") {
          assert.equal(input.consent72h, true); assert.equal(input.participantUid, uid);
          draws++; slots[0].available--; slots[0].remainingUses--;
          const receipt = { id: `nanika_gacha_${uid}_${input.requestId}`, tier: input.tier, roundId: input.roundId,
            imageId: "mock-image", name: "画面確認用の景品", image: "/api/nanika-gacha/images/mock-image",
            fee: input.fee, exchangePoints: input.exchangePoints, acceptedAt: Date.now(), deadline: Date.now() + 72 * 3600000,
            choice: "pending", automatic: false };
          receipts.unshift(receipt); result = { receipt };
        } else if (action === "getNanikaGachaHistory") result = { items: receipts, nextCursor: null };
        else if (action === "claimNanikaGacha") {
          claims++; assert.equal(input.confirmed, true);
          const receipt = receipts.find(item => item.id === input.id);
          receipt.choice = input.choice; if (input.choice === "points") slots[0].available++;
          result = { receipt };
        } else if (action === "adminSaveNanikaGacha") {
          slots = slots.map(slot => slot.tier === input.tier ? {
            ...slot, ...input, publishedAt: input.visible && !slot.visible ? Date.now() : slot.publishedAt, version: slot.version + 1,
          } : slot);
          result = { items: slots };
        } else if (action === "adminListNanikaImages") result = {
          items: images.filter(image => image.tier === input.tier && (input.past ? ["shipping", "removed"] : ["ready", "reserved"]).includes(image.state)), nextCursor: null,
        };
        else if (action === "adminMoveNanikaImage") {
          assert.equal(input.confirmed, true);
          const image = images.find(image => image.id === input.id);
          assert.equal(image.tier, input.fromTier);
          assert.equal(image.state, "ready");
          assert.notEqual(input.tier, input.fromTier);
          image.tier = input.tier;
          slots = slots.map(slot => ({ ...slot, available: slot.available + (slot.tier === input.tier ? 1 : slot.tier === input.fromTier ? -1 : 0) }));
          result = { id: image.id, tier: image.tier };
        }
        else if (action === "adminUploadNanikaImage") {
          assert.ok(Buffer.from(input.base64, "base64").length <= 6 * 1024 * 1024);
          images.push({ id: input.id, name: input.name, tier: input.tier, state: "ready",
            image: `/api/nanika-gacha/images/${input.id}`, largeBytes: 100000, thumbnailBytes: 10000, canPurge: false });
          result = { id: input.id };
        } else throw Error(`Unexpected callable in local test: ${action}`);
        return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ result: { ...result, serverNow: Date.now() } }) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      if (process.env.GACHA_VIDEO_TEST_ONLY === "1") {
        await context.addInitScript(() => {
          window.mockGachaDocument = async ref => ({
            exists: () => true,
            data: () => ref.path.startsWith("gachaCodes/") ? {
              title: "動画の通常ガチャ確認", publicFlags: ["public"], frames: [{ label: "当たり" }, { label: "はずれ" }],
            } : { points: 100 },
          });
        });
        page.on("dialog", dialog => dialog.accept());
        await page.goto(`${base}/nanika-gacha`);
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "参加条件を確認" && !b.disabled));
        const draw = async () => {
          slots[0].available = 10; slots[0].remainingUses = 10;
          await page.getByRole("button", { name: "受付状況を再取得", exact: true }).click();
          await page.getByRole("button", { name: "参加条件を確認", exact: true }).first().click();
          const confirmation = page.getByRole("region", { name: "抽選前の確認" });
          await confirmation.getByRole("checkbox").check();
          await confirmation.getByRole("button", { name: "最終確認して抽選する" }).click();
          await confirmation.waitFor({ state: "detached" });
        };
        const result = page.getByRole("button", { name: "ポイント化の確認へ" });
        const video = page.locator("video");
        await draw();
        await video.waitFor();
        await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0);
        assert.equal(await video.getAttribute("src"), "/gacha/win.mp4");
        assert.equal(await video.evaluate(element => element.muted && element.playsInline), true);
        await page.waitForTimeout(4000);
        assert.equal(await result.count(), 0, "The former 3.5-second timer must not cut the video short");
        assert.equal(await video.isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await result.waitFor({ timeout: 15000 });
        assert.equal(await video.count(), 0, "Natural video completion reveals the committed receipt");
        assert.equal(draws, 1); assert.equal(claims, 0);
        await draw();
        await video.waitFor();
        await page.getByRole("button", { name: "演出をスキップして当選品を見る" }).click();
        await result.waitFor();
        assert.equal(draws, 2); assert.equal(claims, 0);
        videoFails = true;
        await draw();
        await result.waitFor();
        assert.equal(await video.count(), 0, "Failed video requests cannot hide the receipt");
        videoFails = false;
        await page.evaluate(() => {
          window.originalGachaPlay = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Mock autoplay rejection", "NotAllowedError"));
        });
        await draw();
        await result.waitFor();
        assert.equal(await video.count(), 0, "Autoplay rejection reveals the receipt");
        await page.evaluate(() => {
          HTMLMediaElement.prototype.play = window.originalGachaPlay;
          window.originalGachaTimeout = window.setTimeout;
          window.setTimeout = (callback, delay, ...args) => window.originalGachaTimeout(callback, delay === 30000 ? 50 : delay, ...args);
        });
        await draw();
        await result.waitFor();
        assert.equal(await video.count(), 0, "The playback watchdog reveals the receipt without an ended event");
        await page.evaluate(() => { window.setTimeout = window.originalGachaTimeout; });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await draw();
        await result.waitFor();
        assert.equal(await video.count(), 0, "Reduced motion skips the video");
        assert.equal(draws, 6); assert.equal(claims, 0, "Playback must never trigger draws or prize claims");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        for (const outcome of ["win", "lose"]) {
          normalOutcome = outcome;
          await page.goto(`${base}/gacha?code=mock-video`);
          await page.getByRole("button", { name: "ガチャを確認", exact: true }).click();
          await page.getByRole("button", { name: "ガチャを引く", exact: true }).click();
          await video.waitFor();
          assert.equal(await video.getAttribute("src"), `/gacha/${outcome}.mp4`);
          assert.equal(await page.getByRole("heading", { name: "🎉 結果", exact: true }).count(), 0);
          if (outcome === "win") {
            const skip = page.getByRole("button", { name: "演出をスキップして当選品を見る" });
            assert.equal(await skip.evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Tab");
            assert.equal(await skip.evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Escape");
          } else {
            await video.evaluate(element => element.dispatchEvent(new Event("error")));
          }
          await page.getByRole("heading", { name: "🎉 結果", exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "ガチャを引く", exact: true }).isEnabled(), true);
          if (outcome === "lose") await page.getByRole("button", { name: "📦 この商品を発送する", exact: true }).waitFor();
        }
        assert.equal(normalDraws, 2, "Finishing an animation must not repeat a normal draw");
        assert.deepEqual(errors, [], "Uncaught browser errors");
        console.log(`${name}: both normal outcomes and shipping eligibility; Nanika natural end, skip, failed request, rejected autoplay, watchdog and reduced motion passed.`);
        continue;
      }
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/nanika-gacha`);
        await page.getByRole("button", { name: "参加条件を確認", exact: true }).first().waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "参加条件を確認" && !b.disabled));
        assert.equal(await page.getByRole("button", { name: "参加条件を確認", exact: true }).count(), 4);
        assert.equal(await page.getByText("公開日時：2026/11/01 20:56:00 JST", { exact: true }).count(), 4);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.NANIKA_TEST_ARTIFACTS) {
          fs.mkdirSync(process.env.NANIKA_TEST_ARTIFACTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.NANIKA_TEST_ARTIFACTS, `nanika-${name}-${width}.png`), fullPage: true });
        }
      }
      await page.getByRole("link", { name: "景品一覧を表示", exact: true }).first().click();
      await page.getByRole("heading", { name: "何かのPSAガチャの景品一覧", exact: true }).waitFor();
      await page.getByRole("button", { name: "景品1を拡大", exact: true }).waitFor();
      assert.equal(await page.getByRole("list", { name: "景品の縮小画像一覧" }).locator("li").count(), 50);
      assert.equal(await page.getByText("psa景品0", { exact: true }).count(), 0, "Names are not displayed in the thumbnail grid");
      assert.equal(imageRequests.filter(url => url.searchParams.get("size") === "full").length, 0);
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      const firstPrize = page.getByRole("button", { name: "景品1を拡大", exact: true });
      await firstPrize.click();
      const dialog = page.getByRole("dialog", { name: "psa景品0" });
      await dialog.waitFor();
      await dialog.locator('img[src$="?size=full"]').waitFor();
      await page.waitForFunction(() => document.querySelector('dialog img')?.complete);
      assert.equal(imageRequests.filter(url => url.searchParams.get("size") === "full").length, 1);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await firstPrize.evaluate(element => element === document.activeElement), true);
      await page.getByRole("button", { name: "次の50件を表示" }).click();
      await page.getByRole("button", { name: "景品51を拡大", exact: true }).waitFor();
      assert.equal(await page.getByRole("list", { name: "景品の縮小画像一覧" }).locator("li").count(), 51);
      await page.goto(`${base}/`);
      const endedNotice = page.getByRole("link", { name: /ゆめつきの狙い撃ち企画「終了告知の画面検証」が終了しました/ });
      await endedNotice.waitFor();
      assert.equal(await endedNotice.getAttribute("href"), "/neraiuchi/ended-event");
      homeStatusFails = true;
      await page.goto(`${base}/`);
      await page.getByText("ゆめつきの狙い撃ち企画の開催状況が確認できませんでした。", { exact: false }).waitFor();
      homeStatusFails = false;
      await page.getByRole("button", { name: "開催状況を再取得", exact: true }).click();
      await endedNotice.waitFor();
      await page.goto(`${base}/nanika-gacha`);
      await page.getByRole("button", { name: "参加条件を確認", exact: true }).first().waitFor();
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "参加条件を確認", exact: true }).first().click();
      const confirmation = page.getByRole("region", { name: "抽選前の確認" });
      assert.equal(await confirmation.getByRole("button", { name: "最終確認して抽選する" }).isDisabled(), true);
      await confirmation.getByRole("checkbox").check();
      await confirmation.getByRole("button", { name: "最終確認して抽選する" }).click();
      await page.getByRole("button", { name: "演出をスキップして当選品を見る" }).click();
      await page.getByRole("button", { name: "ポイント化の確認へ" }).waitFor();
      assert.equal(draws, 1); assert.equal(claims, 0);
      await page.goto(`${base}/nanika-gacha/history`);
      await page.getByRole("button", { name: "ポイント化の確認へ" }).click();
      assert.equal(claims, 0, "Navigation must not auto-convert the prize");
      const points = page.getByRole("region", { name: "ポイント化の最終確認" });
      const final = points.getByRole("button", { name: "最終確認して30ポイントを受け取る" });
      assert.equal(await final.isDisabled(), true);
      await points.getByRole("checkbox").check(); await final.click();
      await page.getByText("30ポイント受取済み", { exact: true }).waitFor();
      assert.equal(claims, 1); assert.equal(slots[0].available, 2);
      await page.goto(`${base}/admin/nanika-gacha`);
      await page.getByRole("button", { name: "設定を保存", exact: true }).first().waitFor();
      await page.getByLabel("参加費用（ポイント）").first().fill("42");
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/adminSaveNanikaGacha")),
        page.getByRole("button", { name: "設定を保存", exact: true }).first().click(),
      ]);
      await page.waitForFunction(() => document.querySelector('input[type="number"]')?.value === "42");
      assert.equal(slots[0].fee, 42); assert.equal(slots[1].fee, 10);
      await page.goto(`${base}/admin/nanika-gacha/images`);
      await page.getByLabel("景品画像を複数選択").setInputFiles(path.join(root, "public/menu/thumbnails/nanika-gacha.png"));
      await page.getByLabel("景品名", { exact: true }).fill("一括アップロード確認");
      await page.getByRole("button", { name: "未完了の画像を一括アップロード" }).click();
      await page.getByText("一括アップロードが完了しました", { exact: true }).waitFor();
      assert.equal(images[0].name, "一括アップロード確認");
      const originalImageId = images[0].id;
      images.push({ id: "reserved-only", tier: "psa", name: "選択待ちの景品", state: "reserved",
        image: "/api/nanika-gacha/images/reserved-only", largeBytes: 100000, thumbnailBytes: 10000, canPurge: false });
      await page.getByRole("button", { name: "画像を再取得", exact: true }).click();
      const pendingCard = page.getByRole("heading", { name: "選択待ちの景品", exact: true }).locator("..");
      await pendingCard.waitFor();
      assert.equal(await pendingCard.getByRole("button", { name: "別のカテゴリへ移動" }).count(), 0);
      const uploadedCard = page.getByRole("heading", { name: "一括アップロード確認", exact: true }).locator("..");
      await uploadedCard.getByRole("button", { name: "別のカテゴリへ移動" }).click();
      const moveForm = page.getByRole("region", { name: "一括アップロード確認のカテゴリ移動" });
      assert.equal(await moveForm.getByRole("button", { name: "変更を確定", exact: true }).isDisabled(), true);
      const destination = moveForm.getByLabel("移動先カテゴリ");
      assert.equal(await destination.locator('option[value="psa"]').count(), 0);
      await destination.selectOption("satellite");
      await moveForm.getByRole("button", { name: "変更を確定", exact: true }).click();
      await page.getByText("一括アップロード確認を「何かのPSA10ガチャ（衛星級）」へ移動しました。", { exact: true }).waitFor();
      assert.equal(images.find(image => image.id === originalImageId).tier, "satellite");
      await page.getByLabel("表示カテゴリ").selectOption("satellite");
      await page.getByRole("heading", { name: "一括アップロード確認", exact: true }).waitFor();
      assert.equal(images.filter(image => image.id === originalImageId).length, 1);
      assert.deepEqual(errors, [], "Uncaught browser errors");
      console.log(`${name}: publication dates, confirmed category moves, thumbnail gallery, notices and existing Nanika flows passed.`);
    } finally { await browser.close(); }
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
