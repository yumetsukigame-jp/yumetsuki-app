/* eslint-disable @typescript-eslint/no-require-imports -- Loopback UI checks; all external services are mocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const { initialQuestState, advanceQuest, updateQuestScore, questResult, QUEST_BOARD } = require("../functions/lib/quest/engine");
const { forecastQuest } = require("../functions/lib/quest/simulation");
const { applyQuestPsa } = require("../functions/lib/quest/psa");
const { rules } = require("../functions/test/quest-fixtures.cjs");
const base = process.env.QUEST_TEST_URL || "http://127.0.0.1:3216";
if (new URL(base).hostname !== "127.0.0.1") throw Error("Only loopback mock UI checks are allowed");
const root = path.join(__dirname, ".."), uid = "quest-browser-test";
const apiKey = fs.readFileSync(path.join(root, "firebase.ts"), "utf8").match(/apiKey: "([^"]+)"/)[1];
const token = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({
  aud: "point-app-1f854", sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: "password" },
})).toString("base64url")}.mock`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const createPlayer = (overrides = {}) => {
  const player = { ...initialQuestState(), publicId: "public-browser", displayName: "ローカル補佐役", normalGranted: 14,
    rescueGranted: 0, result: null, eligibleAt: Date.now(), eligibility: ["public"], ...overrides };
  updateQuestScore(player, rules); return player;
};
async function main() {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
      await context.addInitScript(({ uid, apiKey, token }) => {
        sessionStorage.setItem("home-user", JSON.stringify({ uid, nickname: "ローカル補佐役", points: 42, subscriber: false }));
        const open = indexedDB.open("firebaseLocalStorageDb", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
        open.onsuccess = () => {
          const tx = open.result.transaction("firebaseLocalStorage", "readwrite");
          tx.objectStore("firebaseLocalStorage").put({ fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`, value: {
            uid, email: "quest@example.invalid", emailVerified: true, isAnonymous: false, providerData: [], apiKey, appName: "[DEFAULT]",
            stsTokenManager: { refreshToken: "mock", accessToken: token, expirationTime: Date.now() + 3600000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
          } });
          tx.oncomplete = () => open.result.close();
        };
      }, { uid, apiKey, token });
      const run = { id: "current-quest", title: "画面検証の星務", description: "テスト用。本番開催ではありません。",
        thumbnail: "/quest/menu-thumbnail-v2.jpg", startsAt: Date.now() - 600000, endsAt: Date.now() + 3600000,
        publicFlags: ["public"], rules, version: 1, state: "published" };
      const archive = { ...run, id: "past-quest", title: "過去の星務", state: "archived",
        summary: { total: 3, completed: 2, groups: { top: 0, upper: 0, middle: 2, lower: 1 },
          completedGroups: { top: 0, upper: 0, middle: 1, lower: 1 }, stages: { 1: 3, 2: 3, 3: 2, 4: 0 } } };
      let player = createPlayer({ tileId: "s3-05", used: 8, starPoints: 35, pending: { kind: "branch", steps: 3 }, version: 8, lastDie: 5 });
      const requests = [], saves = new Map(), calls = [], errors = [], adminRuns = [];
      const bulkRequests = [], bulkSaves = new Map();
      const deleteRequests = [], deleteSaves = new Map();
      let dropBulkResponse = true;
      let dropDeleteResponse = true;
      let dropResponse = false;
      let runDeleted = false;
      let questReloadDelay = 0;
      let dueDice = 0;
      let nextDie = 6, psaReservedCount = 0;
      let menuAccess = { mode: "admin", version: 0, allowed: true }, menuFails = false;
      function ranking(input) {
        const row = { id: player.publicId, displayName: player.displayName, tileId: player.tileId, score: player.score, used: player.used, level: player.level, rank: 1 };
        return { items: input.cursor ? [{ ...row, id: "page-two", displayName: "続きの補佐役" }] : [row], own: row,
          nextCursor: input.cursor ? null : "page-one", stages: [1, 2, 3, 4].map(stage => ({ stage, count: stage === 3 ? 5 : 1 })) };
      }
      await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.origin === base) {
          if (/\/chunks\/app\/admin\/layout-[^/]+\.js$/.test(url.pathname)) {
            const response = await route.fetch(), text = await response.text(), cache = text.match(/([\w$]+)=new Set;/);
            assert.ok(cache && text.includes(`${cache[1]}.has(`), "Update the legacy admin cache fixture");
            return route.fulfill({ response, body: text.replace(cache[0], `${cache[1]}=new Set(["${uid}"]);`) });
          }
          return route.continue();
        }
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
          ...cors, "Access-Control-Allow-Headers": route.request().headers()["access-control-request-headers"] || "Authorization,Content-Type",
        } });
        if (url.hostname === "identitytoolkit.googleapis.com") return route.fulfill({ contentType: "application/json", headers: cors,
          body: JSON.stringify({ users: [{ localId: uid, email: "quest@example.invalid", emailVerified: true }] }) });
        if (url.hostname !== "us-east1-point-app-1f854.cloudfunctions.net") return route.abort();
        const action = url.pathname.split("/").at(-1), input = route.request().postDataJSON().data;
        calls.push({ action, input });
        let result;
        if (action === "getQuestMenuAccess") {
          if (menuFails) return route.fulfill({ status: 503, headers: cors, contentType: "application/json",
            body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "Menu fixture unavailable" } }) });
          result = menuAccess;
        } else if (action === "adminSetQuestMenuAccess") {
          assert.equal(input.version, menuAccess.version);
          menuAccess = { mode: input.mode, version: menuAccess.version + 1, allowed: true };
          result = menuAccess;
        } else if (action === "getQuest") {
          await new Promise(resolve => setTimeout(resolve, questReloadDelay));
          result = { run: input.archive ? archive : runDeleted ? null : { ...run, psaRemaining: Math.max(0, (run.rules.psaLimit ?? 0) - psaReservedCount) }, player: runDeleted && !input.archive ? null : player, reason: null,
            dueDice, serverNow: Date.now(), forecast: forecastQuest(player, run.rules, Math.min(run.rules.maxTurns, player.normalGranted + dueDice)) };
        }
        else if (action === "listQuestProgress") result = ranking(input);
        else if (action === "listQuestArchives") result = { items: [archive], nextCursor: null };
        else if (action === "actQuest") {
          if (runDeleted) return route.fulfill({ status: 404, headers: cors, contentType: "application/json",
            body: JSON.stringify({ error: { status: "NOT_FOUND", message: "開催が削除されています（画面テスト）" } }) });
          assert.deepEqual(Object.keys(input).sort(), ["action", "requestId", "runId", "version"]);
          requests.push(input);
          if (saves.has(input.requestId)) result = { player: saves.get(input.requestId), replay: true };
          else {
            assert.equal(input.version, player.version);
            player.normalGranted += dueDice; dueDice = 0;
            const previous = player;
            player = { ...player, ...advanceQuest(player, input.action, run.rules, input.action === "roll" ? nextDie : undefined, 7) };
            if (run.rules.psaLimit) {
              const prize = applyQuestPsa(previous, player, run.rules.psaLimit - psaReservedCount);
              player.psaFragments = prize.fragments; player.psaReserved = prize.reserved;
              if (prize.collected) player.psaCollectedTiles = [...(previous.psaCollectedTiles ?? []), player.tileId];
              if (prize.newlyReserved) psaReservedCount++;
              else if (previous.psaReserved && !prize.reserved && psaReservedCount < run.rules.psaLimit) psaReservedCount--;
            }
            saves.set(input.requestId, player); result = { player, replay: false };
          }
          if (dropResponse) {
            dropResponse = false;
            return route.fulfill({ status: 503, headers: cors, contentType: "application/json",
              body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "応答を受け取れませんでした（画面テスト）" } }) });
          }
          await new Promise(resolve => setTimeout(resolve, 150));
        } else if (action === "adminListQuest") result = { items: input.runId ? adminRuns.filter(run => run.id === input.runId) : adminRuns, nextCursor: null };
        else if (action === "adminDeleteQuest") {
          deleteRequests.push(input);
          if (deleteSaves.has(input.runId)) {
            assert.deepEqual(input, deleteSaves.get(input.runId));
            result = { deleted: true, replay: true };
          } else {
            const index = adminRuns.findIndex(run => run.id === input.runId);
            assert.ok(index >= 0);
            assert.equal(input.title, adminRuns[index].title);
            assert.equal(input.version, adminRuns[index].version);
            assert.equal(input.confirmed, true);
            adminRuns.splice(index, 1); deleteSaves.set(input.runId, input);
            result = { deleted: true, replay: false };
          }
          if (dropDeleteResponse) {
            dropDeleteResponse = false;
            return route.fulfill({ status: 503, headers: cors, contentType: "application/json",
              body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "削除の応答を受け取れませんでした（画面テスト）" } }) });
          }
        }
        else if (action === "adminSaveQuest") {
          assert.equal(input.draft.rules.maxTurns, 14);
          assert.equal(input.draft.rules.boardVersion, "quest-board-v3");
          assert.equal(input.draft.rules.middleMin, 52);
          assert.equal(input.draft.rules.psaLimit, 2);
          adminRuns.splice(0, adminRuns.length, { ...input.draft, id: "draft-quest", version: 1, state: "draft", simulation: null, simulatedVersion: null });
          result = { runId: "draft-quest", version: 1 };
        } else if (action === "adminSimulateQuest") {
          adminRuns[0].simulation = ["bridge", "flower", "mixed"].flatMap(policy => [true, false].map(shortcutUse => ({
            trials: 20000, policy, shortcutUse, groups: { top: 30, upper: 1600, middle: 10000, lower: 8370 },
            stage3: 19000, stage4: 400, shortcutOffered: 82, rescued: 800,
          })));
          adminRuns[0].simulatedVersion = 1; result = { reports: adminRuns[0].simulation };
        } else if (action === "adminPublishQuest") {
          assert.equal(input.confirmed, true);
          assert.deepEqual(Object.keys(input).sort(), ["confirmed", "runId", "version"]);
          assert.equal(adminRuns[0].simulation, null);
          adminRuns[0].state = "published"; adminRuns[0].version = 2; result = { runId: "draft-quest" };
        } else if (action === "adminReleaseQuestDice") {
          bulkRequests.push(input);
          if (bulkSaves.has(input.grantId)) {
            assert.deepEqual(input, bulkSaves.get(input.grantId).request);
            result = { ...bulkSaves.get(input.grantId).result, granted: false };
          } else {
            assert.equal(input.expectedTotal, adminRuns[0].adminReleased ?? 0);
            adminRuns[0].adminReleased = (adminRuns[0].adminReleased ?? 0) + input.count;
            result = { granted: true, releasedTotal: adminRuns[0].adminReleased, count: input.count };
            bulkSaves.set(input.grantId, { request: input, result });
          }
          await new Promise(resolve => setTimeout(resolve, 150));
          if (dropBulkResponse) {
            dropBulkResponse = false;
            return route.fulfill({ status: 503, headers: cors, contentType: "application/json",
              body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "全体配布の応答を受け取れませんでした（画面テスト）" } }) });
          }
        } else if (action === "grantQuest") result = { granted: true };
        else if (action === "adminFinalizeQuest") {
          const complete = adminRuns[0].state === "settling";
          adminRuns[0].state = complete ? "archived" : "settling"; result = { complete };
        } else if (action === "getNeraiuchiHomeStatus") result = { event: null, latestEnded: null, refreshAt: null };
        else if (action === "recordDailyLogin") result = { recorded: false, points: 42, totalLoginDays: 1 };
        else if (action === "getNibuichiUserStats") result = { global: {} };
        else throw Error(`Unmocked callable: ${action}`);
        return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ result }) });
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/quest`);
      await page.getByRole("heading", { name: "庭で道を選ぼう" }).waitFor();
      const gradeCard = page.locator('[aria-label="星務評価"]');
      await gradeCard.getByText("現在の星務評価", { exact: true }).waitFor();
      assert.equal(await gradeCard.locator('[aria-current="step"]').textContent(), "下位");
      await gradeCard.getByText("6点", { exact: true }).waitFor();
      await gradeCard.getByText(/終了見込み/).waitFor();
      await gradeCard.locator("summary").filter({ hasText: "見込みの試算条件" }).click();
      await gradeCard.getByText(/未付与分は含みません/).waitFor();
      await page.locator("summary").filter({ hasText: "評価点の内訳" }).click();
      await page.getByRole("meter", { name: "実績の星務達成率" }).waitFor();
      await page.getByText("実績の評価点：46点", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).isEnabled(), false);
      dropResponse = true;
      await page.getByRole("button", { name: "巡る花壇へ（星を集める）", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "応答を受け取れませんでした" }).waitFor();
      assert.equal(await gradeCard.getByText(/終了見込み/).count(), 0, "Unconfirmed operations must hide stale forecasts");
      run.endsAt = Date.now() - 1;
      await page.reload();
      await page.getByRole("button", { name: "前回の結果を確認" }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目" }).waitFor();
      assert.equal(requests.length, 2);
      assert.equal(requests[0].requestId, requests[1].requestId);
      assert.equal(player.used, 8);
      assert.equal(player.tileId, "s3-loop-03");
      run.endsAt = Date.now() + 3600000;
      await page.reload();
      await page.locator('[aria-label="星務評価"]').waitFor();
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
        for (const stage of QUEST_BOARD.stages) {
          await page.getByRole("button", { name: new RegExp(`^${stage.id} (書斎|回廊|庭|塔)`) }).click();
          assert.equal(await page.locator("button[data-kind][title]").count(), stage.tiles.length);
        }
        assert.ok(await page.locator('[aria-label="星務評価"]').isVisible());
      }
      run.rules = { ...rules, psaLimit: 2 };
      nextDie = 2;
      player = createPlayer();
      await page.reload();
      const preview = page.locator('[class*="dicePreview"]');
      const badges = page.locator('[class*="fragmentBadge"]');
      await preview.getByText("次の出目で起きること", { exact: true }).waitFor();
      assert.equal(await preview.locator("li").count(), 6);
      for (const [stage, count] of [[1, 10], [2, 7], [3, 2], [4, 0]]) {
        await page.getByRole("button", { name: new RegExp(`^${stage} (書斎|回廊|庭|塔)`) }).click();
        assert.equal(await badges.count(), count, `${name}: PSA fragment placement in stage ${stage}`);
      }
      await page.getByRole("button", { name: /^1 書斎/ }).click();
      await page.locator("button[data-kind]").filter({ has: badges }).first().click();
      await page.getByText(/止まるとPSAのかけら＋１/).waitFor();
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.locator('[data-overlay="reward"]').getByText("PSAのかけら ＋1", { exact: true }).waitFor();
      await page.getByText("PSAのかけら 1／5", { exact: true }).waitFor();
      assert.equal(await badges.count(), 9);
      await page.waitForFunction(() => !document.querySelector('[data-overlay]'));
      player = createPlayer({ psaFragments: 4 });
      await page.reload();
      await preview.locator("li").nth(1).getByText("PSAチケット枠を確保", { exact: false }).waitFor();
      dropResponse = true;
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "応答を受け取れませんでした" }).waitFor();
      assert.equal(await preview.count(), 0);
      const reservedRequest = requests.at(-1);
      await page.reload();
      await page.getByText("PSAチケット枠を確保済み", { exact: true }).waitFor();
      await page.getByRole("button", { name: "前回の結果を確認", exact: true }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "保存済みの結果" }).waitFor();
      assert.deepEqual(requests.at(-1), reservedRequest);
      assert.equal(psaReservedCount, 1);
      assert.equal(await page.locator("[data-overlay]").count(), 0);
      assert.equal(await badges.count(), 0);
      player = { ...player, tileId: "s3-20" };
      updateQuestScore(player, run.rules);
      await page.reload();
      await preview.locator("li").nth(1).getByText("PSAチケット枠が失効", { exact: false }).waitFor();
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.getByText("第４ステージ到達により、かけら・チケット枠は失効しました。", { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-overlay]'));
      await page.getByRole("button", { name: /^1 書斎/ }).click();
      assert.equal(await badges.count(), 0);
      psaReservedCount = 2;
      player = createPlayer({ psaFragments: 4 });
      await page.reload();
      await page.getByText("チケット枠が埋まり、かけらの出現は終了しました。", { exact: true }).waitFor();
      assert.equal(await badges.count(), 0);
      assert.ok(!(await preview.locator("li").allTextContents()).some(text => text.includes("PSA")));
      player = createPlayer({ psaReserved: true, psaTicketIssued: true });
      player.result = questResult(player, run.rules);
      run.state = "archived";
      await page.reload();
      await page.getByRole("link", { name: "何かのPSAガチャへ", exact: true }).waitFor();
      assert.equal(await preview.count(), 0);
      run.rules = rules; run.state = "published"; nextDie = 6; psaReservedCount = 0;
      const die = page.locator('[class*="diceResult"] > span[aria-hidden="true"]');
      const board = page.locator('[class*="playArea"] [class*="board"]');
      for (const [width, height] of [[360, 640], [390, 740], [1280, 900]]) {
        await page.setViewportSize({ width, height });
        dueDice = width === 360 ? 1 : 0;
        player = createPlayer({ tileId: "s2-00", used: 2, lastDie: 2, version: 2, originalRolls: [2, 2], normalGranted: 14 - dueDice });
        await page.reload();
        await page.getByText("出目 2", { exact: true }).waitFor();
        await page.getByRole("button", { name: /^4 塔/ }).click();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        questReloadDelay = 1000;
        await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).evaluate(button => button.click());
        await page.getByText("抽選中", { exact: true }).waitFor();
        assert.equal(await die.textContent(), "★", `${name}: previous die must disappear while rolling`);
        assert.equal(await page.getByRole("button", { name: /^2 回廊/ }).getAttribute("aria-pressed"), "true");
        await page.locator('[data-overlay="dice"]').getByText("出目 6").waitFor();
        assert.equal((await die.textContent()).trim(), "6", `${name}: confirmed die must remain visible during movement`);
        await page.locator('[class*="playFeedback"]').filter({ hasText: "出目 6" }).waitFor();
        assert.equal((await die.textContent()).trim(), "6", `${name}: confirmed die must not wait for reload`);
        const bounds = await board.boundingBox();
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height, `${name}: movement board outside ${width}x${height}: ${JSON.stringify(bounds)}`);
        assert.equal(await page.locator('button[aria-current="location"]').count(), 1);
        await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(button => button.textContent === "星のサイコロを振る").disabled);
        questReloadDelay = 0;
      }
      player = createPlayer({ tileId: "s2-00", used: 2, lastDie: 2, version: 2, originalRolls: [2, 2] });
      await page.reload();
      await page.getByText("出目 2", { exact: true }).waitFor();
      dropResponse = true;
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "応答を受け取れませんでした" }).waitFor();
      assert.equal((await die.textContent()).trim(), "?", "A lost response must not show the previous die");
      await page.reload();
      await page.getByText("出目は未確認", { exact: true }).waitFor();
      assert.equal((await die.textContent()).trim(), "?");
      const savedRoll = requests.at(-1);
      await page.getByRole("button", { name: "前回の結果を確認" }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目 6" }).waitFor();
      assert.equal((await die.textContent()).trim(), "6");
      assert.equal(await page.locator('[data-overlay]').count(), 0, "An already-visible replay must not repeat movement or rewards");
      assert.deepEqual(requests.at(-1), savedRoll);
      assert.equal(player.used, 3);
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(button => button.textContent === "星のサイコロを振る").disabled);
      player = createPlayer({ used: 5, tileId: "s1-07", starPoints: 12, originalRolls: [1, 2, 1, 2, 1], shortcut: "offered", pending: { kind: "shortcut", steps: 0 } });
      await page.reload();
      await page.getByRole("button", { name: "今回は見送る", exact: true }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目" }).waitFor();
      assert.equal(player.tileId, "s1-07");
      assert.equal(player.used, 5);
      player = createPlayer({ used: 5, tileId: "s1-07", starPoints: 12, originalRolls: [1, 2, 1, 2, 1], shortcut: "offered", pending: { kind: "shortcut", steps: 0 } });
      await page.reload();
      await page.getByRole("button", { name: "抜け道を使って庭へ進む", exact: true }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目" }).waitFor();
      assert.equal(player.tileId, "s3-00");
      const before = requests.length;
      const roll = page.getByRole("button", { name: "星のサイコロを振る", exact: true });
      await roll.evaluate(button => { button.click(); button.click(); });
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目 6" }).waitFor();
      assert.equal(requests.length, before + 1);
      assert.equal(player.used, 6);
      assert.equal(player.pending.kind, "branch");
      await page.getByLabel("比べる時点").selectOption("8");
      await page.getByRole("button", { name: "次の25人を見る" }).click();
      await page.getByText("続きの補佐役", { exact: false }).waitFor();
      assert.ok(calls.some(call => call.action === "listQuestProgress" && call.input.turn === 8 && call.input.cursor));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "星の橋へ（塔を目指す）" }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "出目" }).waitFor();
      if (process.env.QUEST_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.QUEST_SCREENSHOT_DIR, `quest-${name}-ui.png`), fullPage: true });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      player = createPlayer({ tileId: "s1-14", used: 5, starPoints: 20, version: 5, lastDie: 5 });
      await page.reload();
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.locator('[data-overlay="dice"]').getByText("出目 6").waitFor();
      const arrival = page.locator('[data-overlay="stage"]').getByText("月明かりの回廊");
      await arrival.waitFor();
      assert.ok(await arrival.locator('xpath=../..').locator('img[alt=""]').count());
      await page.locator('[data-overlay="reward"]').getByText("星ポイント ＋2").waitFor();
      await page.getByText("到達 +2点").waitFor();
      await page.getByRole("button", { name: /^1 書斎/ }).click();
      assert.ok(await page.locator('[data-visited="true"]').count() >= 4);
      run.rules = { ...rules, boardVersion: "quest-board-v3", maxTurns: 3,
        rescue: { ...rules.rescue, enabled: false, adminEnabled: false, eventSources: [],
          fromTurn: 3, simulationTurn: 3, simulationRate: 0 } };
      player = createPlayer({ tileId: "s3-05", used: 1, version: 1, lastDie: 2, normalGranted: 3,
        pending: { kind: "branch", steps: 3 } });
      await page.reload();
      await page.getByRole("button", { name: "巡る花壇へ（７つの花から星門を引く）", exact: true }).click();
      await page.locator('[class*="playFeedback"]').filter({ hasText: "星ポイント ＋12" }).waitFor();
      assert.equal(player.tileId, "s3-20");
      assert.equal(player.used, 1);
      assert.equal(await page.locator("button[data-kind][title]").count(), QUEST_BOARD.stages[2].tiles.length + 1);
      assert.equal(await page.getByLabel("比べる時点").locator("option").count(), 4);
      await page.getByText("1／3回", { exact: true }).waitFor();
      await page.locator('[data-overlay="stage"]').getByText("中間にランクアップ！", { exact: true }).waitFor();
      assert.equal(await gradeCard.locator('[aria-current="step"]').textContent(), "中間");
      await page.waitForFunction(() => !document.querySelector('[data-overlay]'));
      player = createPlayer({ tileId: "s4-02", used: 2, starPoints: 60, normalGranted: 3 });
      await page.reload();
      await gradeCard.getByText("次は", { exact: false }).waitFor();
      await gradeCard.getByText("○ 星見の塔・3マス目に到達", { exact: true }).waitFor();
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.locator('[data-overlay="stage"]').getByText("最上位にランクアップ！", { exact: true }).waitFor();
      assert.equal(await gradeCard.locator('[aria-current="step"]').textContent(), "最上位");
      assert.equal(await gradeCard.getByText(/終了見込み/).count(), 0);
      await page.waitForFunction(() => !document.querySelector('[data-overlay]'));
      player.result = questResult(player, run.rules);
      await page.reload();
      await gradeCard.getByText("最終グループ", { exact: true }).waitFor();
      assert.equal(await gradeCard.getByText(/暫定評価/).count(), 0);
      assert.equal(await gradeCard.getByText(/次は/).count(), 0);
      run.rules = rules;
      player = createPlayer({ used: 14, rescueUsed: true });
      await page.reload();
      await gradeCard.getByText(/中間への補填を適用しています/).waitFor();
      assert.equal(await gradeCard.locator('[aria-current="step"]').textContent(), "中間");
      await page.getByText("0%", { exact: true }).waitFor();
      await gradeCard.getByText("最終グループは開催終了後に確定します。", { exact: true }).waitFor();
      assert.equal(await gradeCard.getByText(/終了見込み/).count(), 0);
      player = createPlayer({ tileId: "s3-20", used: 1, normalGranted: 3 });
      await page.reload();
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(button => button.textContent === "星のサイコロを振る").disabled);
      dropResponse = true;
      await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "応答を受け取れませんでした" }).waitFor();
      runDeleted = true;
      await page.getByRole("button", { name: "前回の結果を確認", exact: true }).click();
      await page.getByText("現在表示できる開催はありません。", { exact: false }).waitFor();
      assert.equal(await page.evaluate(key => localStorage.getItem(key), `quest-request:${uid}:${run.id}`), null);
      runDeleted = false;
      const archiveCalls = calls.filter(call => call.action === "getQuest" && call.input.archive).length;
      await page.goto(`${base}/quest/archive`);
      await page.getByRole("button", { name: "この回の星務報告書を見る" }).waitFor();
      assert.equal(calls.filter(call => call.action === "getQuest" && call.input.archive).length, archiveCalls);
      await page.getByRole("button", { name: "この回の星務報告書を見る" }).click();
      await page.getByRole("heading", { name: "開催全体の星務報告" }).waitFor();
      assert.ok(calls.filter(call => call.action === "getQuest" && call.input.archive).every(call => call.input.runId === archive.id));
      assert.equal(await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).count(), 0);
      await page.goto(`${base}/quest/guide`);
      await page.getByRole("heading", { name: "ゆめつきクエストの遊び方" }).waitFor();
      assert.equal(await page.locator('img').evaluateAll(images => images.filter(image => decodeURIComponent(image.src).includes("/quest/")).length), 8);
      await page.goto(`${base}/admin/quest`);
      await page.getByRole("heading", { name: "新規開催の設定" }).waitFor();
      assert.equal(await page.getByLabel(/何かのPSAガチャ チケット上限/).inputValue(), "0");
      await page.locator("summary").filter({ hasText: /^トップメニューの公開範囲$/ }).click();
      const menuSelect = page.getByRole("combobox", { name: "メニューのリンクを利用できる対象" });
      await menuSelect.selectOption("subscriber");
      await page.getByRole("button", { name: "メニューの表示設定を保存", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "トップメニューの表示設定を保存しました。" }).waitFor();
      assert.equal(menuAccess.mode, "subscriber");
      await menuSelect.selectOption("admin");
      await page.getByRole("button", { name: "メニューの表示設定を保存", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "トップメニューの表示設定を保存しました。" }).waitFor();
      const fields = ["１歩あたりの星ポイント", "１レベル上がる星ポイント", "レベル上昇ごとの評価加点", "達成率100%に相当する評価点",
        "達成率の小数桁（０〜２）", "中間の下限評価点", "上位の下限評価点", "最上位の塔進捗点（59〜66）", "最上位の必要レベル"];
      for (let index = 0; index < fields.length; index++) assert.equal(
        await page.getByLabel(fields[index], { exact: true }).inputValue(), String([1, 12, 2, 80, 1, 52, 68, 66, 6][index]));
      assert.equal(await page.getByLabel("配布方式").inputValue(), "");
      assert.equal(await page.getByLabel("この開催での救済").inputValue(), "");
      await page.getByLabel("サイコロの使用上限", { exact: true }).fill("99");
      await page.getByLabel("配布方式").selectOption("schedule");
      assert.equal(await page.getByLabel(/個目の配布日時（日本時間）/).count(), 99);
      await page.getByLabel("サイコロの使用上限", { exact: true }).fill("1");
      assert.equal(await page.getByLabel(/個目の配布日時（日本時間）/).count(), 1);
      await page.getByLabel("サイコロの使用上限", { exact: true }).fill("14");
      await page.getByLabel("配布方式").selectOption("");
      assert.equal(await page.getByRole("button", { name: "確定した設定で開催を公開する" }).count(), 0);
      await page.getByLabel("開催名", { exact: true }).fill("ローカル検証のみ");
      await page.getByLabel(/何かのPSAガチャ チケット上限/).fill("2");
      await page.getByLabel("開始日時（日本時間）").fill("2026-11-23T12:00");
      await page.getByLabel("終了日時（日本時間）").fill("2026-12-10T12:00");
      await page.getByLabel("配布方式").selectOption("admin");
      await page.getByLabel("上位の下限評価点", { exact: true }).fill("64");
      await page.getByLabel("１レベル上がる星ポイント", { exact: true }).fill("15");
      await page.getByLabel("この開催での救済").selectOption("yes");
      await page.getByLabel("管理者による救済付与を許可", { exact: true }).check();
      await page.getByLabel("小径を使える使用回数（開催の使用上限まで）", { exact: true }).fill("14");
      await page.getByLabel("対象評価点の上限（この値未満、中間下限以下）", { exact: true }).fill("52");
      await page.getByLabel("１人の救済付与上限（開催の使用上限まで）", { exact: true }).fill("1");
      assert.equal(await page.getByLabel("試算時の救済保有率（０〜100%）", { exact: true }).getAttribute("required"), null);
      await page.getByRole("button", { name: "下書きを保存", exact: true }).click();
      assert.equal(adminRuns[0].rules.rescue.simulationRate, 0);
      assert.equal(adminRuns[0].rules.rescue.simulationTurn, 14);
      const publish = page.getByRole("button", { name: "確定した設定で開催を公開する", exact: true });
      await publish.waitFor();
      await page.getByRole("button", { name: "新しい開催を作る", exact: true }).click();
      assert.equal(await page.getByLabel("開催名", { exact: true }).inputValue(), "");
      assert.equal(await page.getByLabel(/何かのPSAガチャ チケット上限/).inputValue(), "0");
      assert.equal(await page.getByLabel("１レベル上がる星ポイント", { exact: true }).inputValue(), "12");
      assert.equal(await page.getByLabel("上位の下限評価点", { exact: true }).inputValue(), "68");
      assert.equal(await publish.count(), 0);
      await page.getByRole("button", { name: "この開催を選択", exact: true }).click();
      await publish.waitFor();
      assert.equal(await page.getByLabel(/何かのPSAガチャ チケット上限/).inputValue(), "2");
      assert.equal(await page.getByLabel("１レベル上がる星ポイント", { exact: true }).inputValue(), "15");
      assert.equal(await page.getByLabel("上位の下限評価点", { exact: true }).inputValue(), "64");
      assert.equal(await publish.isEnabled(), false);
      assert.equal(await page.getByText("最新版の設定で分布試算を行ってください。", { exact: true }).count(), 0);
      assert.equal(await page.getByLabel(/検討記録/).count(), 0);
      await page.getByText("下の設定確認にチェックしてください。", { exact: true }).waitFor();
      await page.getByLabel("参加対象・配布・救済・評価境界を確認しました", { exact: true }).check();
      assert.equal(await publish.isEnabled(), true);
      assert.equal(calls.filter(call => call.action === "adminSimulateQuest").length, 0);
      assert.equal(await page.getByText("公開ボタンが無効になっている理由", { exact: true }).count(), 0);
      await publish.click();
      await page.getByRole("heading", { name: "通常サイコロの全体配布" }).waitFor();
      let acceptDialog = true;
      page.on("dialog", dialog => acceptDialog ? dialog.accept() : dialog.dismiss());
      await page.getByLabel("今回全体へ配る個数", { exact: true }).fill("2");
      await page.getByRole("button", { name: "全体へサイコロを配布する", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "全体配布の応答を受け取れませんでした" }).waitFor();
      assert.equal(bulkRequests.length, 1);
      await page.reload();
      await page.getByRole("button", { name: "この開催を選択", exact: true }).click();
      const resendBulk = page.getByRole("button", { name: "同じ配布IDで再送して確認", exact: true });
      await resendBulk.waitFor();
      assert.equal(await page.getByLabel("今回全体へ配る個数", { exact: true }).inputValue(), "2");
      assert.equal(await page.getByLabel("今回全体へ配る個数", { exact: true }).getAttribute("readonly"), "");
      await resendBulk.dblclick();
      await page.getByRole("status").filter({ hasText: "この配布IDは反映済みです。" }).waitFor();
      assert.equal(bulkRequests.length, 2);
      assert.deepEqual(bulkRequests[0], bulkRequests[1]);
      assert.equal(bulkSaves.size, 1);
      await page.getByText("全体への配布済み累計：2／14個", { exact: true }).waitFor();
      await page.locator("summary").filter({ hasText: /^個別付与$/ }).click();
      await page.getByLabel("利用者UID", { exact: true }).fill(uid);
      await page.getByLabel("付与数", { exact: true }).fill("1");
      await page.getByLabel("付与理由", { exact: true }).fill("画面検証のみ");
      await page.getByRole("button", { name: "新しい付与IDを発行" }).click();
      const grantId = await page.getByLabel("付与ID", { exact: true }).inputValue();
      await page.getByRole("button", { name: "この付与IDで付与・再送する" }).click();
      await page.getByRole("status").filter({ hasText: "付与を保存しました。" }).waitFor();
      assert.equal(await page.getByLabel("付与ID", { exact: true }).inputValue(), grantId);
      await page.getByRole("button", { name: "進行を停止して結果を集計", exact: true }).click();
      await page.getByRole("button", { name: "集計を続きから再開" }).click();
      await page.getByRole("status").filter({ hasText: "全員の結果を確定し" }).waitFor();
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: admin overflow at ${width}`);
      }
      assert.equal(await page.getByRole("button", { name: "全体へサイコロを配布する", exact: true }).count(), 0);
      await page.locator("summary").filter({ hasText: /^開催を完全削除$/ }).click();
      const deleteButton = page.getByRole("button", { name: "この開催を完全削除する", exact: true });
      await page.getByLabel("削除する開催名を入力").fill("別の開催");
      assert.equal(await deleteButton.isEnabled(), false);
      await page.getByLabel("削除する開催名を入力").fill(adminRuns[0].title);
      acceptDialog = false;
      await deleteButton.click();
      assert.equal(deleteRequests.length, 0);
      acceptDialog = true;
      await deleteButton.click();
      await page.getByRole("alert").filter({ hasText: "削除の応答を受け取れませんでした" }).waitFor();
      assert.equal(deleteRequests.length, 1);
      await page.reload();
      await page.getByRole("button", { name: "削除を再開・確認", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "完全削除しました" }).waitFor();
      assert.equal(deleteRequests.length, 2);
      assert.deepEqual(deleteRequests[0], deleteRequests[1]);
      assert.equal(deleteSaves.size, 1);
      assert.equal(adminRuns.length, 0);
      adminRuns.push({ ...run, id: "discarded-draft", title: "削除用下書き", state: "draft",
        xAccountList: [], simulation: null, simulatedVersion: null });
      await page.getByRole("button", { name: "一覧を更新", exact: true }).click();
      await page.getByRole("button", { name: "この開催を選択", exact: true }).click();
      await page.locator("summary").filter({ hasText: /^開催を完全削除$/ }).click();
      await page.getByLabel("削除する開催名を入力").fill("削除用下書き");
      await deleteButton.click();
      await page.getByRole("status").filter({ hasText: "「削除用下書き」を完全削除しました" }).waitFor();
      assert.equal(adminRuns.length, 0);
      assert.equal(deleteSaves.size, 2);
      await page.setViewportSize({ width: 390, height: 950 });
      await page.goto(`${base}/`);
      const menu = page.getByRole("link", { name: /^ゆめつきクエスト/ });
      await menu.waitFor();
      assert.equal(await menu.getAttribute("href"), "/quest");
      assert.ok(decodeURIComponent(await menu.locator("img").getAttribute("src")).includes("/quest/menu-thumbnail-v2.jpg"));
      assert.deepEqual(await page.getByRole("region").filter({ has: page.locator("h3") }).locator("h3").allTextContents(),
        ["今日のニブイチ", "ガチャ", "ゆめつきクエスト", "何かの景品ガチャ", "クイズ", "ゆめつきの狙い撃ち", "ポイント関連", "アカウント"]);
      assert.ok(decodeURIComponent(await page.locator('a[href="/archive"] img').getAttribute("src")).includes("archive.webp?v=414dccbc1b0f"));
      for (const [mode, allowed] of [["admin", false], ["subscriber", false], ["subscriber", true], ["public", true], ["admin", true]]) {
        menuAccess = { ...menuAccess, mode, allowed };
        await page.reload();
        const section = page.getByRole("region", { name: "ゆめつきクエスト", exact: true });
        await section.waitFor();
        if (!allowed) {
          await section.getByText(mode === "admin" ? "現在は管理者向けに準備中です。" : "サブスク限定で公開しています。", { exact: false }).waitFor();
          await section.getByRole("button", { name: "ゆめつきクエストの詳細メニューを表示" }).click();
          assert.equal(await section.locator("a").count(), 0);
          assert.equal(await section.locator('[role="link"][aria-disabled="true"]').count(), 4);
          const disabledCard = section.getByRole("link", { name: /^ゆめつきクエスト/ });
          assert.equal(await disabledCard.evaluate(element => getComputedStyle(element).filter), "grayscale(1)");
          await disabledCard.evaluate(element => element.click());
          assert.equal(new URL(page.url()).pathname, "/");
          if (name === "chromium" && mode === "admin" && process.env.GUIDE_SCREENSHOT_DIR) {
            for (const [file, title] of [["home-menu", "ガチャ"], ["quest-menu", "ゆめつきクエスト"],
              ["nanika-menu", "何かの景品ガチャ"], ["neraiuchi-menu", "ゆめつきの狙い撃ち"]]) {
              const region = page.getByRole("region", { name: title, exact: true });
              await region.scrollIntoViewIfNeeded();
              await region.locator("img:visible").evaluateAll(images => Promise.all(images.map(image => image.decode())));
              await region.screenshot({ path: path.join(process.env.GUIDE_SCREENSHOT_DIR, `${file}.png`) });
            }
          }
        } else {
          await section.locator('a[href="/quest"]').waitFor();
          assert.equal(await section.locator('a[href="/quest"]').count(), 1);
        }
        assert.equal(await page.locator('a[href="/gacha/list"]').count(), 1);
      }
      menuFails = true;
      await page.reload();
      await page.getByRole("button", { name: "クエストの公開範囲を再確認" }).waitFor();
      assert.equal(await page.locator('a[href="/quest"]').count(), 0);
      menuFails = false;
      await page.getByRole("button", { name: "クエストの公開範囲を再確認" }).click();
      await page.locator('a[href="/quest"]').waitFor();
      assert.deepEqual(errors, [], `${name} page errors`);
      assert.ok(calls.filter(call => call.action === "getQuest" && !call.input.archive).every(call => !("runId" in call.input)));
      console.log(`${name}: mobile/desktop board, retry/reload, shortcut choices, double-click, ranking/archive isolation, admin draft/simulate/publish/grant/finalize passed (mock services only)`);
      await context.close();
    } finally { await browser.close(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
