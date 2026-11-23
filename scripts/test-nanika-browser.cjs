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
      if (process.env.REWARD_UI_TEST_ONLY === "1") {
        await context.addInitScript(() => {
          window.mockRewardDoc = async () => ({ exists: () => true, data: () => ({ points: 500 }) });
          window.mockRewardDocs = async () => ({
            forEach(callback) {
              for (const tier of ["psa", "satellite", "planet", "star"]) callback({
                id: `right-${tier}`, data: () => ({ name: `${tier}の当選権利`, cost: 30, stock: 2, nanikaTier: tier }),
              });
              callback({ id: "ordinary", data: () => ({ name: "通常の発送物", cost: 40, stock: 2 }) });
            },
          });
        });
      }
      if (process.env.ADMIN_REWARD_IMAGE_TEST_ONLY === "1") {
        await context.addInitScript(() => {
          window.adminRewardWrites = [];
          window.mockAdminRewardDocs = async ref => ({
            docs: ref.path === "imageMeta" ? [
              { id: "ordinary-image", data: () => ({ url: "/rewards/nanikaPSA.webp", prefix: "既存画像", folder: "rewards" }) },
              { id: "duplicate-image", data: () => ({ url: "/nanika-gacha/thumbnails/01-nanika-psa-yumetsuki-v2.webp", prefix: "重複", folder: "rewards" }) },
            ] : [{ id: "mock-right", data: () => ({
              name: "編集確認用の権利", cost: 85, stock: 7, image: "/rewards/nanikaPSA.webp", nanikaTier: "planet",
            }) }],
          });
          window.mockAdminRewardWrite = async (ref, data) => { window.adminRewardWrites.push({ id: ref.id, data }); };
        });
      }
      let slots = ["psa", "satellite", "planet", "star"].map(tier => ({
        tier, fee: 10, exchangePoints: 30, visible: true, version: 1, roundId: "mock-round",
        publishedAt: Date.parse("2026-11-01T11:56:00.000Z"),
        available: 2, remainingUses: 2, remainingRights: 1, xAccounts: ["@browser_test", "@browser_test"],
      }));
      const receipts = [];
      const images = [];
      const imageRequests = [];
      let homeStatusFails = false;
      let videoFails = false;
      let normalOutcome = "win", normalDraws = 0;
      let nanikaAnimationLevel;
      let claims = 0, draws = 0;
      let pointsBalance = 100, listFails = false, drawFails = false, claimFails = false;
      const drawInputs = [];
      const rewardInputs = [];
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === base) {
          if (process.env.ADMIN_REWARD_IMAGE_TEST_ONLY === "1" && /\/chunks\/app\/admin\/rewards\/(?:add\/|edit\/[^/]+\/)?page-[^/]+\.js$/.test(url.pathname)) {
            const response = await route.fetch(), text = await response.text();
            const read = text.match(/await (\(0,[\w$]+\.[\w$]+\))\(\(0,[\w$]+\.[\w$]+\)\([\w$.]+,"(?:imageMeta|rewards)"\)\)/)
              || text.match(/await (\(0,[\w$]+\.[\w$]+\))\([\w$]+\)\)\.docs/);
            assert.ok(read, `Admin reward document-read fixture needs updating: ${url.pathname}`);
            const write = text.match(/await (\(0,[\w$]+\.[\w$]+\))\(\(0,[\w$]+\.[\w$]+\)\([\w$.]+,"rewards",/);
            let body = text.replaceAll(read[1], "window.mockAdminRewardDocs");
            if (write) body = body.replaceAll(write[1], "window.mockAdminRewardWrite");
            return route.fulfill({ response, body });
          }
          if (process.env.REWARD_UI_TEST_ONLY === "1" && /\/chunks\/app\/reward\/page-[^/]+\.js$/.test(url.pathname)) {
            const response = await route.fetch(), text = await response.text();
            const list = text.match(/await (\(0,[\w$]+\.[\w$]+\))\(\(0,[\w$]+\.[\w$]+\)\([\w$.]+,"rewards"\)\)/);
            const account = text.match(/"users",[\w$.]+\),[\w$]+=await (\(0,[\w$]+\.[\w$]+\))\(/);
            assert.ok(list && account, "Reward document-read fixture needs updating");
            return route.fulfill({ response, body: text.replaceAll(list[1], "window.mockRewardDocs")
              .replaceAll(account[1], "window.mockRewardDoc") });
          }
          if (process.env.GACHA_VIDEO_TEST_ONLY === "1" && /\/chunks\/app\/gacha\/page-[^/]+\.js$/.test(url.pathname)) {
            // Replace only legacy document reads; all draw/claim calls remain network mocks.
            const response = await route.fetch(), text = await response.text();
            const read = text.match(/await (\(0,[\w$]+\.[\w$]+\))\(\(0,[\w$]+\.[\w$]+\)\([\w$.]+,"gachaCodes"/);
            assert.ok(read, "Legacy gacha document-read fixture needs updating");
            return route.fulfill({ response, body: text.replaceAll(read[1], "window.mockGachaDocument") });
          }
          if (videoFails && /^\/gacha\/animations\/(top|atari|hazure)\/(dore|sumon)\.mp4$/.test(url.pathname)) {
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
          if (url.pathname === "/api/nanika-gacha/prizes") {
            const tier = url.searchParams.get("tier"), cursor = url.searchParams.get("cursor");
            const start = cursor ? 50 : 0, end = cursor ? 51 : 50;
            return route.fulfill({ contentType: "application/json", body: JSON.stringify({
              items: Array.from({ length: end - start }, (_, index) => ({
                id: `gallery-${tier}-${start + index}`, tier, name: `${tier}景品${start + index}`,
                image: `/api/nanika-gacha/images/gallery-${tier}-${start + index}`,
              })), nextCursor: cursor ? null : "gallery-cursor",
            }) });
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
        if (process.env.NANIKA_UI_TEST_ONLY === "1" && ["drawNanikaGacha", "claimNanikaGacha"].includes(action)) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if ((action === "listNanikaGacha" && listFails) || (action === "drawNanikaGacha" && drawFails) || (action === "claimNanikaGacha" && claimFails)) {
          return route.fulfill({ status: 500, contentType: "application/json", headers: cors,
            body: JSON.stringify({ error: { status: "INTERNAL", message: "Mock communication failure" } }) });
        }
        if (action === "listNanikaGacha" || action === "adminGetNanikaGacha") result = { items: slots, points: pointsBalance };
        else if (action === "adminListNanikaRights") result = { items: [], nextCursor: null };
        else if (action === "redeemReward") {
          assert.equal(input.participantUid, uid);
          assert.equal(input.confirmed, true);
          assert.equal(input.cost, 30);
          assert.equal(input.rewardId, `right-${input.nanikaTier}`);
          rewardInputs.push(input);
          result = { requestId: `mock-redemption-${rewardInputs.length}`, points: 500 - rewardInputs.length * 30, nanikaTier: input.nanikaTier };
        }
        else if (action === "unlockGachaCode") result = {};
        else if (action === "useGachaCode") {
          normalDraws++;
          result = { resultId: `normal-video-${normalDraws}`, frame: normalOutcome !== "lose" ? "当たり" : "はずれ",
            ...(normalOutcome === "top" ? { animationLevel: "top" } : {}),
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
          drawInputs.push(input);
          const slot = slots.find(slot => slot.tier === input.tier);
          assert.equal(input.fee, input.useRight ? 0 : slot.fee);
          assert.ok(pointsBalance >= input.fee);
          draws++; slot.available--; pointsBalance -= input.fee;
          if (input.useRight) slot.remainingRights--; else slot.remainingUses--;
          const receipt = { id: `nanika_gacha_${uid}_${input.requestId}`, tier: input.tier, roundId: input.roundId,
            ...(nanikaAnimationLevel ? { animationLevel: nanikaAnimationLevel } : {}),
            imageId: "mock-image", name: "画面確認用の景品", image: "/api/nanika-gacha/images/mock-image",
            fee: input.fee, exchangePoints: input.exchangePoints, acceptedAt: Date.now(), deadline: Date.now() + 72 * 3600000,
            choice: "pending", automatic: false, usedRight: input.useRight === true };
          receipts.unshift(receipt); result = { receipt };
        } else if (action === "getNanikaGachaHistory") result = { items: receipts, nextCursor: null };
        else if (action === "getNanikaGachaReceipt") result = { receipt: receipts.find(item => item.id === input.id) };
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
        else if (action === "adminSetNanikaImageAnimation") {
          const image = images.find(image => image.id === input.id);
          assert.equal(image.state, "ready");
          assert.ok(["top", "atari", "hazure"].includes(input.animationLevel));
          image.animationLevel = input.animationLevel;
          result = { id: image.id };
        }
        else if (action === "adminUploadNanikaImage") {
          assert.ok(Buffer.from(input.base64, "base64").length <= 6 * 1024 * 1024);
          images.push({ id: input.id, name: input.name, tier: input.tier, state: "ready",
            image: `/api/nanika-gacha/images/${input.id}`, animationLevel: "atari", largeBytes: 100000, thumbnailBytes: 10000, canPurge: false });
          result = { id: input.id };
        } else throw Error(`Unexpected callable in local test: ${action}`);
        return route.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ result: { ...result, serverNow: Date.now() } }) });
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      if (process.env.ADMIN_REWARD_IMAGE_TEST_ONLY === "1") {
        page.on("dialog", dialog => dialog.accept());
        const names = ["何かのPSAガチャ", "何かのPSA10ガチャ（衛星級）", "何かのPSA10ガチャ（惑星級）", "何かのPSA10ガチャ（恒星級）"];
        for (const width of [360, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          for (const screen of ["add", "edit/mock-right"]) {
            await page.goto(`${base}/admin/rewards/${screen}`);
            const group = page.getByRole("group", { name: "画像を選択", exact: true });
            await group.getByRole("button", { name: "既存画像を選択", exact: true }).waitFor();
            assert.equal(await group.getByRole("button").count(), 5);
            for (const name of names) {
              const button = group.getByRole("button", { name: `${name}を選択`, exact: true });
              await button.focus(); await page.keyboard.press("Space");
              assert.equal(await button.getAttribute("aria-pressed"), "true");
              assert.equal(await page.getByRole("button", { pressed: true }).count(), 1);
            }
            await page.waitForFunction(() => [...document.querySelectorAll("fieldset img")].every(img => img.complete && img.naturalWidth > 0));
            const overflow = await page.evaluate(() => ({
              width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
              elements: [...document.querySelectorAll("select, fieldset, button")].filter(element =>
                element.getBoundingClientRect().right > innerWidth).map(element => ({ tag: element.tagName, width: element.getBoundingClientRect().width })),
            }));
            assert.ok(overflow.scrollWidth <= overflow.width, `${screen}: ${JSON.stringify(overflow)}`);
            assert.equal(await page.evaluate(() => window.adminRewardWrites.length), 0, "Image selection must not submit the form");
          }
        }
        await page.getByRole("button", { name: "更新する", exact: true }).click();
        await page.waitForFunction(() => window.adminRewardWrites.length === 1);
        await page.getByRole("heading", { name: "発送物一覧（管理者）", exact: true }).waitFor();
        const edit = await page.evaluate(() => window.adminRewardWrites[0]);
        assert.equal(edit.id, "mock-right");
        assert.equal(edit.data.image, "/nanika-gacha/thumbnails/04-star-psa10-yumetsuki-v2.webp");
        assert.equal(edit.data.cost, 85); assert.equal(edit.data.stock, 7);
        assert.equal(edit.data.nanikaTier, "planet", "Image selection must not change the right type");
        await page.goto(`${base}/admin/rewards/add`);
        await page.getByRole("button", { name: `${names[1]}を選択`, exact: true }).click();
        await page.locator('input[type="text"]').fill("追加確認用の権利");
        await page.locator('input[type="number"]').nth(0).fill("30");
        await page.locator('input[type="number"]').nth(1).fill("2");
        await page.getByRole("combobox").selectOption("satellite");
        await page.getByRole("button", { name: "追加する", exact: true }).click();
        await page.waitForFunction(() => window.adminRewardWrites.length === 1);
        await page.getByRole("heading", { name: "発送物一覧（管理者）", exact: true }).waitFor();
        const added = await page.evaluate(() => window.adminRewardWrites[0]);
        assert.equal(added.data.image, "/nanika-gacha/thumbnails/02-satellite-psa10-yumetsuki-v2.webp");
        assert.equal(added.data.nanikaTier, "satellite");
        assert.equal(added.data.cost, 30); assert.equal(added.data.stock, 2);
        assert.deepEqual(errors, []);
        console.log(`${name}: add/edit show all four thumbnails at 360/390/1280px; keyboard selection preserves right type and mock writes save the chosen image.`);
        continue;
      }
      if (process.env.REWARD_UI_TEST_ONLY === "1") {
        page.on("dialog", dialog => dialog.accept());
        for (const width of [360, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${base}/reward`);
          await page.getByText("現在のポイント: 500", { exact: true }).waitFor();
          assert.equal(await page.getByRole("button", { name: "当選権利を取得する", exact: true }).count(), 4);
          assert.equal(await page.getByRole("button", { name: "この商品を選ぶ", exact: true }).count(), 1);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        for (const [index, tier] of ["psa", "satellite", "planet", "star"].entries()) {
          await page.goto(`${base}/reward`);
          await page.getByText("現在のポイント: 500", { exact: true }).waitFor();
          await page.getByRole("button", { name: "当選権利を取得する", exact: true }).nth(index).click();
          await page.getByRole("heading", { name: "当選権利を取得しました", exact: true }).waitFor();
          assert.equal(rewardInputs.at(-1).nanikaTier, tier);
          await page.getByText(/取得時の購入・交換ポイントとは別/).waitFor();
        }
        assert.equal(rewardInputs.length, 4);
        assert.equal(draws, 0); assert.equal(claims, 0);
        assert.equal(new Set(rewardInputs.map(input => input.requestId)).size, 4);
        assert.deepEqual(errors, []);
        console.log(`${name}: registered rights appear beside ordinary rewards; all four redemptions reach right-complete without drawing or requesting shipment.`);
        continue;
      }
      if (process.env.NANIKA_UI_TEST_ONLY === "1") {
        page.on("dialog", dialog => dialog.accept());
        const winning = () => page.getByRole("button", { name: "当選権利で引く", exact: true }).first();
        const challenge = () => page.getByRole("button", { name: "挑戦権利で引く", exact: true }).first();
        const reload = async () => {
          await page.goto(`${base}/nanika-gacha`);
          await page.getByText("現在のポイント：", { exact: false }).waitFor();
        };
        for (const width of [360, 390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await reload();
          assert.equal(await winning().isEnabled(), true);
          assert.equal(await challenge().isEnabled(), true);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.waitForFunction(() => [...document.querySelectorAll('img[src*="nanika-gacha/thumbnails"]')]
            .every(img => img.complete && img.naturalWidth > 0));
          assert.equal(await winning().evaluate(button => button.getBoundingClientRect().height >= 48), true);
          if (process.env.NANIKA_TEST_ARTIFACTS) {
            fs.mkdirSync(process.env.NANIKA_TEST_ARTIFACTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.NANIKA_TEST_ARTIFACTS, `rights-${name}-${width}.png`), fullPage: true });
          }
          await page.goto(`${base}/nanika-gacha/guide`);
          await page.getByRole("heading", { name: "当選権利と挑戦権利の違い" }).waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        pointsBalance = 3; slots[0].fee = 10;
        await reload();
        assert.equal(await winning().isEnabled(), true);
        assert.equal(await challenge().isDisabled(), true);
        await page.getByText("あと7 pt必要です。", { exact: true }).first().waitFor();
        slots[0].remainingRights = 0; pointsBalance = 100;
        await reload();
        assert.equal(await winning().isDisabled(), true);
        assert.equal(await challenge().isEnabled(), true);
        slots[0].remainingRights = 1; slots[0].remainingUses = 0;
        await reload();
        assert.equal(await winning().isEnabled(), true);
        assert.equal(await challenge().isDisabled(), true);
        slots[0].visible = false;
        await reload();
        assert.equal(await winning().isDisabled(), true);
        await page.getByText("当選権利：", { exact: false }).first().waitFor();
        slots[0].visible = true; slots[0].available = 0;
        await reload();
        assert.equal(await winning().isDisabled(), true);
        slots[0].available = 10; slots[0].remainingUses = 4;
        const confirmation = page.getByRole("region", { name: "抽選前の確認" });
        const checkControls = async (section, label) => {
          for (const width of [360, 390, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            assert.equal(await section.locator("button").evaluateAll(buttons =>
              buttons.every(button => button.getBoundingClientRect().height >= 48)), true);
            if (process.env.NANIKA_TEST_ARTIFACTS) {
              await section.screenshot({ path: path.join(process.env.NANIKA_TEST_ARTIFACTS, `${label}-${name}-${width}.png`) });
            }
          }
        };
        for (const [useRight, fee] of [[true, 0], [false, 10], [false, 0]]) {
          slots[0].fee = useRight ? 10 : fee;
          await reload();
          await (useRight ? winning() : challenge()).click();
          await confirmation.getByText(`消費ポイント：${fee} pt`, { exact: true }).waitFor();
          await confirmation.getByText("ポイントで受け取る場合：30 pt", { exact: true }).waitFor();
          const submit = confirmation.getByRole("button", { name: "この内容で引く", exact: true });
          assert.equal(await submit.isDisabled(), true);
          assert.equal(await confirmation.getByRole("checkbox").isChecked(), false);
          await checkControls(confirmation, `confirm-${useRight}-${fee}`);
          await confirmation.getByRole("checkbox").check();
          await submit.click();
          assert.equal(await confirmation.getByRole("button", { name: "景品を確認しています…", exact: true }).isDisabled(), true);
          await page.getByRole("button", { name: "ポイントで受け取る", exact: true }).waitFor({ timeout: 15000 });
          assert.equal(drawInputs.at(-1).useRight, useRight);
          assert.equal(drawInputs.at(-1).fee, fee);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
          await page.getByRole("link", { name: "あとで選ぶ", exact: true }).click();
          await page.getByRole("heading", { name: "何かの景品ガチャ：当選・受取", exact: true }).waitFor();
          assert.equal(claims, 0, "Choosing later must not settle a receipt");
        }
        const pointsConfirm = page.getByRole("region", { name: "ポイント受取の最終確認" });
        await page.getByRole("button", { name: "ポイントで受け取る", exact: true }).first().click();
        const pointsSubmit = pointsConfirm.getByRole("button", { name: "ポイント受取を確定", exact: true });
        assert.equal(await pointsSubmit.isDisabled(), true);
        await checkControls(pointsConfirm, "points-confirm");
        await pointsConfirm.getByRole("checkbox").check();
        claimFails = true;
        await pointsSubmit.click();
        await page.getByRole("alert").getByText(/履歴を更新/).waitFor();
        assert.equal(claims, 0);
        claimFails = false;
        await pointsSubmit.click();
        await page.getByText("30ポイント受取済み", { exact: true }).waitFor();
        await page.getByRole("button", { name: "発送を依頼", exact: true }).first().click();
        await page.getByText("発送依頼済み", { exact: true }).waitFor();
        assert.equal(claims, 2);
        receipts[2].deadline = Date.now() - 1000;
        await page.getByRole("button", { name: "更新", exact: true }).click();
        await page.getByText("期限を過ぎました。ポイント受取の反映を待っています。", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "発送を依頼", exact: true }).count(), 0);
        assert.equal(draws, 3);
        slots[0].remainingUses = 3; drawFails = true;
        await reload(); await challenge().click(); await confirmation.getByRole("checkbox").check();
        await confirmation.getByRole("button", { name: "この内容で引く", exact: true }).click();
        await page.getByRole("alert").getByText(/もう一度引く前に/).waitFor();
        assert.equal(draws, 3);
        drawFails = false; listFails = true;
        await page.getByRole("button", { name: "最新の状態に更新", exact: true }).click();
        await page.locator('p[role="alert"]').waitFor();
        listFails = false;
        await page.getByRole("button", { name: "最新の状態に更新", exact: true }).click();
        await page.locator('p[role="alert"]').waitFor({ state: "detached" });
        receipts.length = 0;
        await page.goto(`${base}/nanika-gacha/history`);
        await page.getByText(/当選履歴はまだありません/).waitFor();
        assert.deepEqual(errors, []);
        console.log(`${name}: rights/cost matrix, 360/390/1280px, consent, history, shipping/points, expiry and communication errors passed.`);
        continue;
      }
      if (process.env.GACHA_VIDEO_TEST_ONLY === "1") {
        await context.addInitScript(() => {
          window.mockGachaDocument = async ref => ({
            exists: () => true,
            data: () => ref.path.startsWith("gachaCodes/") ? {
              title: "動画の通常ガチャ確認", publicFlags: ["public"], frames: [
                { label: "当たり" }, { label: "名前の長い景品も省略せずに確認できる特別な景品枠の表示確認" }, { label: "はずれ" },
              ],
            } : { points: 100 },
          });
        });
        page.on("dialog", dialog => dialog.accept());
        await page.goto(`${base}/nanika-gacha`);
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "挑戦権利で引く" && !b.disabled));
        const draw = async () => {
          slots[0].available = 10; slots[0].remainingUses = 10;
          pointsBalance = 100;
          await page.getByRole("button", { name: "最新の状態に更新", exact: true }).click();
          await page.getByRole("button", { name: "挑戦権利で引く", exact: true }).first().click();
          const confirmation = page.getByRole("region", { name: "抽選前の確認" });
          await confirmation.getByRole("checkbox").check();
          await confirmation.getByRole("button", { name: "この内容で引く" }).click();
          await confirmation.waitFor({ state: "detached" });
        };
        const result = page.getByRole("button", { name: "ポイントで受け取る", exact: true });
        const video = page.locator("video");
        await draw();
        await video.waitFor();
        await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0);
        assert.match(await video.getAttribute("src"), /^\/gacha\/animations\/atari\/(dore|sumon)\.mp4$/);
        assert.equal(await video.evaluate(element => element.muted && element.playsInline), true);
        assert.equal(await page.getByRole("button", { name: /スキップ/ }).count(), 0);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(4000);
        assert.equal(await result.count(), 0, "The former 3.5-second timer must not cut the video short");
        assert.equal(await video.isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await result.waitFor({ timeout: 15000 });
        assert.equal(await video.count(), 0, "Natural video completion reveals the committed receipt");
        assert.equal(draws, 1); assert.equal(claims, 0);
        videoFails = true;
        nanikaAnimationLevel = "top";
        await draw();
        const retry = page.getByRole("button", { name: "動画の再生をやり直す", exact: true });
        await retry.waitFor();
        const failedSource = await video.getAttribute("src");
        assert.match(failedSource, /^\/gacha\/animations\/top\/(dore|sumon)\.mp4$/);
        assert.equal(await result.count(), 0, "Failed video requests must not bypass playback");
        videoFails = false;
        await retry.click();
        assert.equal(await video.getAttribute("src"), failedSource, "Playback retries must keep the same randomly selected video");
        await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0);
        await result.waitFor({ timeout: 15000 });
        assert.equal(draws, 2); assert.equal(claims, 0, "Video retries must not redraw or claim the prize");
        await page.evaluate(() => {
          window.originalGachaPlay = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function () {
            this.pause();
            return Promise.reject(new DOMException("Mock autoplay rejection", "NotAllowedError"));
          };
        });
        nanikaAnimationLevel = "hazure";
        await draw();
        await retry.waitFor();
        assert.match(await video.getAttribute("src"), /^\/gacha\/animations\/hazure\/(dore|sumon)\.mp4$/);
        assert.equal(await result.count(), 0, "Autoplay rejection must not reveal the receipt");
        await page.evaluate(() => {
          HTMLMediaElement.prototype.play = window.originalGachaPlay;
        });
        await retry.click();
        await result.waitFor({ timeout: 15000 });
        await page.evaluate(() => {
          window.originalGachaTimeout = window.setTimeout;
          window.setTimeout = (callback, delay, ...args) => window.originalGachaTimeout(callback, delay === 30000 ? 50 : delay, ...args);
        });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await draw();
        await video.waitFor();
        await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0);
        await video.evaluate(element => { element.pause(); element.dispatchEvent(new Event("stalled")); });
        await retry.waitFor();
        await page.waitForTimeout(100);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Tab");
        assert.equal(await retry.evaluate(element => element === document.activeElement), true);
        assert.equal(await result.count(), 0, "Stalls, timeouts and reduced motion must not bypass playback");
        await page.evaluate(() => { window.setTimeout = window.originalGachaTimeout; });
        await retry.click();
        await result.waitFor({ timeout: 15000 });
        assert.equal(draws, 4); assert.equal(claims, 0, "Playback must never trigger draws or prize claims");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        for (const outcome of ["win", "lose", "top"]) {
          normalOutcome = outcome;
          await page.goto(`${base}/gacha?code=mock-video`);
          await page.getByRole("button", { name: "ガチャを確認", exact: true }).click();
          const frames = page.getByRole("list", { name: "景品枠一覧", exact: true });
          await frames.waitFor();
          assert.equal(await frames.locator("li").count(), 3, "Every frame is available in the static preview");
          for (const width of [360, 390, 768]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Frame previews must wrap on narrow screens");
          }
          await page.getByRole("button", { name: "ガチャを引く", exact: true }).click();
          await video.waitFor();
          const level = outcome === "win" ? "atari" : outcome === "lose" ? "hazure" : "top";
          assert.match(await video.getAttribute("src"), new RegExp(`^/gacha/animations/${level}/(dore|sumon)\\.mp4$`));
          assert.equal(await page.getByRole("heading", { name: "🎉 結果", exact: true }).count(), 0);
          assert.equal(await page.getByRole("button", { name: /スキップ/ }).count(), 0);
          if (outcome === "win") {
            const dialog = page.getByRole("dialog", { name: "抽選結果の演出", exact: true });
            assert.equal(await dialog.evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Tab");
            assert.equal(await dialog.evaluate(element => element === document.activeElement), true);
            await page.keyboard.press("Escape");
            await video.click();
            assert.equal(await page.getByRole("heading", { name: "🎉 結果", exact: true }).count(), 0);
          } else {
            await video.evaluate(element => { element.pause(); element.dispatchEvent(new Event("error")); });
            await retry.waitFor();
            assert.equal(await page.getByRole("heading", { name: "🎉 結果", exact: true }).count(), 0);
            await retry.click();
          }
          await page.getByRole("heading", { name: "🎉 結果", exact: true }).waitFor({ timeout: 15000 });
          await page.waitForFunction(() => document.querySelector('[aria-label="抽選結果"]') === document.activeElement);
          const resultCard = page.getByRole("region", { name: "抽選結果", exact: true });
          await resultCard.getByText(`枠： ${outcome !== "lose" ? "当たり" : "はずれ"}`, { exact: true }).waitFor();
          await resultCard.getByText("報酬： 30 pt", { exact: true }).waitFor();
          if (process.env.NANIKA_TEST_ARTIFACTS) {
            fs.mkdirSync(process.env.NANIKA_TEST_ARTIFACTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.NANIKA_TEST_ARTIFACTS, `normal-gacha-${name}-${outcome}.png`), fullPage: true });
          }
          assert.equal(await page.getByRole("button", { name: "ガチャを引く", exact: true }).isEnabled(), true);
          if (outcome === "lose") await page.getByRole("button", { name: "📦 この商品を発送する", exact: true }).waitFor();
        }
        assert.equal(normalDraws, 3, "Finishing an animation must not repeat a normal draw");
        assert.deepEqual(errors, [], "Uncaught browser errors");
        console.log(`${name}: both gacha flows wait for video completion; skip/Escape, failures, retries, stalls and reduced motion cannot bypass playback.`);
        continue;
      }
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/nanika-gacha`);
        await page.getByRole("button", { name: "挑戦権利で引く", exact: true }).first().waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b => b.textContent === "挑戦権利で引く" && !b.disabled));
        assert.equal(await page.getByRole("button", { name: "挑戦権利で引く", exact: true }).count(), 4);
        assert.equal(await page.getByText("公開日時：2026/11/01 20:56:00 JST", { exact: true }).count(), 4);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.NANIKA_TEST_ARTIFACTS) {
          fs.mkdirSync(process.env.NANIKA_TEST_ARTIFACTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.NANIKA_TEST_ARTIFACTS, `nanika-${name}-${width}.png`), fullPage: true });
        }
      }
      await page.getByRole("link", { name: "景品候補を見る", exact: true }).first().click();
      await page.getByRole("heading", { name: "何かのPSAガチャの景品一覧", exact: true }).waitFor();
      await page.getByRole("button", { name: "psa景品0を拡大", exact: true }).waitFor();
      assert.equal(await page.getByRole("list", { name: "景品の縮小画像一覧" }).locator("li").count(), 50);
      assert.equal(await page.getByText("psa景品0", { exact: true }).count(), 1, "Candidate names are visible before selection");
      assert.equal(imageRequests.filter(url => url.searchParams.get("size") === "full").length, 0);
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      const firstPrize = page.getByRole("button", { name: "psa景品0を拡大", exact: true });
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
      await page.getByRole("button", { name: "psa景品50を拡大", exact: true }).waitFor();
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
      await page.getByRole("button", { name: "挑戦権利で引く", exact: true }).first().waitFor();
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "挑戦権利で引く", exact: true }).first().click();
      const confirmation = page.getByRole("region", { name: "抽選前の確認" });
      assert.equal(await confirmation.getByRole("button", { name: "この内容で引く" }).isDisabled(), true);
      await confirmation.getByRole("checkbox").check();
      await confirmation.getByRole("button", { name: "この内容で引く" }).click();
      await page.getByRole("button", { name: "ポイントで受け取る", exact: true }).waitFor({ timeout: 15000 });
      assert.equal(draws, 1); assert.equal(claims, 0);
      await page.goto(`${base}/nanika-gacha/history`);
      await page.getByRole("button", { name: "ポイントで受け取る", exact: true }).click();
      assert.equal(claims, 0, "Navigation must not auto-convert the prize");
      const points = page.getByRole("region", { name: "ポイント受取の最終確認" });
      const final = points.getByRole("button", { name: "ポイント受取を確定" });
      assert.equal(await final.isDisabled(), true);
      await points.getByRole("checkbox").check(); await final.click();
      await page.getByText("30ポイント受取済み", { exact: true }).waitFor();
      assert.equal(claims, 1); assert.equal(slots[0].available, 2);
      await page.goto(`${base}/admin/nanika-gacha`);
      await page.getByRole("button", { name: "設定を保存", exact: true }).first().waitFor();
      await page.getByLabel("挑戦権利で引く際の消費ポイント").first().fill("42");
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
      assert.equal(images[0].animationLevel, "atari");
      const animationSelect = page.getByLabel("演出属性");
      assert.equal(await animationSelect.inputValue(), "atari");
      for (const level of ["top", "hazure", "atari"]) {
        await Promise.all([
          page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/adminListNanikaImages")),
          animationSelect.selectOption(level),
        ]);
        await page.waitForFunction(() => !document.querySelector('input[type="file"]')?.disabled);
        assert.equal(images[0].animationLevel, level);
        assert.equal(await animationSelect.inputValue(), level);
      }
      const originalImageId = images[0].id;
      images.push({ id: "reserved-only", tier: "psa", name: "選択待ちの景品", state: "reserved",
        image: "/api/nanika-gacha/images/reserved-only", animationLevel: "atari", largeBytes: 100000, thumbnailBytes: 10000, canPurge: false });
      await page.getByRole("button", { name: "画像を再取得", exact: true }).click();
      const pendingCard = page.getByRole("heading", { name: "選択待ちの景品", exact: true }).locator("..");
      await pendingCard.waitFor();
      assert.equal(await pendingCard.getByLabel("演出属性").isDisabled(), true);
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
