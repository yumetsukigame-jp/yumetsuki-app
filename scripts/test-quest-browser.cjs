/* eslint-disable @typescript-eslint/no-require-imports -- Loopback UI checks; all external services are mocked. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const { initialQuestState, advanceQuest, updateQuestScore, QUEST_BOARD } = require("../functions/lib/quest/engine");
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
      let dropResponse = false;
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
        } else if (action === "getQuest") result = { run: input.archive ? archive : run, player, reason: null,
          dueDice: 0, serverNow: Date.now(), forecast: { low: 48, median: 59, high: 70, samples: 256, policy: "ローカル画面検証の試算" } };
        else if (action === "listQuestProgress") result = ranking(input);
        else if (action === "listQuestArchives") result = { items: [archive], nextCursor: null };
        else if (action === "actQuest") {
          assert.deepEqual(Object.keys(input).sort(), ["action", "requestId", "runId", "version"]);
          requests.push(input);
          if (saves.has(input.requestId)) result = { player: saves.get(input.requestId), replay: true };
          else {
            assert.equal(input.version, player.version);
            player = { ...player, ...advanceQuest(player, input.action, rules, input.action === "roll" ? 6 : undefined) };
            saves.set(input.requestId, player); result = { player, replay: false };
          }
          if (dropResponse) {
            dropResponse = false;
            return route.fulfill({ status: 503, headers: cors, contentType: "application/json",
              body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "応答を受け取れませんでした（画面テスト）" } }) });
          }
          await new Promise(resolve => setTimeout(resolve, 150));
        } else if (action === "adminListQuest") result = { items: adminRuns, nextCursor: null };
        else if (action === "adminSaveQuest") {
          assert.equal(input.draft.rules.maxTurns, 14);
          assert.equal(input.draft.rules.middleMin, 52);
          adminRuns.splice(0, adminRuns.length, { ...input.draft, id: "draft-quest", version: 1, state: "draft", simulation: null, simulatedVersion: null });
          result = { runId: "draft-quest", version: 1 };
        } else if (action === "adminSimulateQuest") {
          adminRuns[0].simulation = ["bridge", "flower", "mixed"].flatMap(policy => [true, false].map(shortcutUse => ({
            trials: 20000, policy, shortcutUse, groups: { top: 30, upper: 1600, middle: 10000, lower: 8370 },
            stage3: 19000, stage4: 400, shortcutOffered: 82, rescued: 800,
          })));
          adminRuns[0].simulatedVersion = 1; result = { reports: adminRuns[0].simulation };
        } else if (action === "adminPublishQuest") {
          assert.equal(input.confirmed, true); assert.ok(input.reviewNote.length >= 20);
          adminRuns[0].state = "published"; adminRuns[0].version = 2; result = { runId: "draft-quest" };
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
      assert.equal(await page.getByRole("button", { name: "星のサイコロを振る", exact: true }).isEnabled(), false);
      dropResponse = true;
      await page.getByRole("button", { name: "巡る花壇へ（星を集める）", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "応答を受け取れませんでした" }).waitFor();
      run.endsAt = Date.now() - 1;
      await page.reload();
      await page.getByRole("button", { name: "前の操作を再送して確認" }).click();
      await page.getByRole("status").filter({ hasText: "選択・受け取りを保存しました。" }).waitFor();
      assert.equal(requests.length, 2);
      assert.equal(requests[0].requestId, requests[1].requestId);
      assert.equal(player.used, 8);
      assert.equal(player.tileId, "s3-loop-03");
      run.endsAt = Date.now() + 3600000;
      await page.reload();
      await page.getByRole("meter", { name: "実績の星務達成率" }).waitFor();
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
        for (const stage of QUEST_BOARD.stages) {
          await page.getByRole("button", { name: new RegExp(`^${stage.id} (書斎|回廊|庭|塔)`) }).click();
          assert.equal(await page.locator("button[aria-label^='s'][title]").count(), stage.tiles.length);
        }
        assert.ok(await page.getByRole("meter", { name: "実績の星務達成率" }).isVisible());
      }
      player = createPlayer({ used: 5, tileId: "s1-07", starPoints: 12, originalRolls: [1, 2, 1, 2, 1], shortcut: "offered", pending: { kind: "shortcut", steps: 0 } });
      await page.reload();
      await page.getByRole("button", { name: "今回は見送る", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "選択・受け取りを保存しました。" }).waitFor();
      assert.equal(player.tileId, "s1-07");
      assert.equal(player.used, 5);
      player = createPlayer({ used: 5, tileId: "s1-07", starPoints: 12, originalRolls: [1, 2, 1, 2, 1], shortcut: "offered", pending: { kind: "shortcut", steps: 0 } });
      await page.reload();
      await page.getByRole("button", { name: "抜け道を使って庭へ進む", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "選択・受け取りを保存しました。" }).waitFor();
      assert.equal(player.tileId, "s3-00");
      const before = requests.length;
      const roll = page.getByRole("button", { name: "星のサイコロを振る", exact: true });
      await roll.evaluate(button => { button.click(); button.click(); });
      await page.getByRole("status").filter({ hasText: "星のサイコロの出目は6" }).waitFor();
      assert.equal(requests.length, before + 1);
      assert.equal(player.used, 6);
      assert.equal(player.pending.kind, "branch");
      await page.getByLabel("比べる時点").selectOption("8");
      await page.getByRole("button", { name: "次の25人を見る" }).click();
      await page.getByText("続きの補佐役", { exact: false }).waitFor();
      assert.ok(calls.some(call => call.action === "listQuestProgress" && call.input.turn === 8 && call.input.cursor));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.getByRole("button", { name: "星の橋へ（塔を目指す）" }).click();
      await page.getByRole("status").filter({ hasText: "選択・受け取りを保存しました。" }).waitFor();
      if (process.env.QUEST_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.QUEST_SCREENSHOT_DIR, `quest-${name}-ui.png`), fullPage: true });
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
      const menuSelect = page.getByRole("combobox", { name: "メニューのリンクを利用できる対象" });
      await menuSelect.selectOption("subscriber");
      await page.getByRole("button", { name: "メニューの表示設定を保存", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "トップメニューの表示設定を保存しました。" }).waitFor();
      assert.equal(menuAccess.mode, "subscriber");
      await menuSelect.selectOption("admin");
      await page.getByRole("button", { name: "メニューの表示設定を保存", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "トップメニューの表示設定を保存しました。" }).waitFor();
      assert.equal(await page.getByLabel("１レベル上がる星ポイント", { exact: true }).inputValue(), "");
      assert.equal(await page.getByRole("button", { name: "確定した設定で開催を公開する" }).count(), 0);
      await page.getByLabel("開催名", { exact: true }).fill("ローカル検証のみ");
      await page.getByLabel("開始日時（日本時間）").fill("2026-11-23T12:00");
      await page.getByLabel("終了日時（日本時間）").fill("2026-12-10T12:00");
      await page.getByLabel("配布方式").selectOption("admin");
      const fields = ["１歩あたりの星ポイント", "１レベル上がる星ポイント", "レベル上昇ごとの評価加点", "達成率100%に相当する評価点",
        "達成率の小数桁（０〜２）", "中間の下限評価点", "上位の下限評価点", "最上位の塔進捗点（59〜66）", "最上位の必要レベル"];
      for (let index = 0; index < fields.length; index++) await page.getByLabel(fields[index], { exact: true }).fill(String([1, 12, 2, 80, 1, 52, 64, 61, 6][index]));
      await page.getByLabel("この開催での救済").selectOption("no");
      await page.getByRole("button", { name: "下書きを保存", exact: true }).click();
      const publish = page.getByRole("button", { name: "確定した設定で開催を公開する", exact: true });
      await publish.waitFor();
      assert.equal(await publish.isEnabled(), false);
      await page.getByRole("button", { name: "保存した設定で14回を試算する" }).click();
      await page.getByText("各２万件、６条件の試算を保存しました。", { exact: false }).waitFor();
      assert.equal(await publish.isEnabled(), false);
      await page.getByLabel("確定した配布・救済・評価境界と分布の検討記録（20文字以上）").fill("ローカルモックでの操作検証のみ。本番の開催設定ではありません。");
      await page.getByLabel("試作の数値を転用せず", { exact: false }).check();
      assert.equal(await publish.isEnabled(), true);
      await publish.click();
      await page.getByRole("heading", { name: "通常サイコロ・救済の個別付与" }).waitFor();
      await page.getByLabel("利用者UID", { exact: true }).fill(uid);
      await page.getByLabel("付与数", { exact: true }).fill("1");
      await page.getByLabel("付与理由", { exact: true }).fill("画面検証のみ");
      await page.getByRole("button", { name: "新しい付与IDを発行" }).click();
      const grantId = await page.getByLabel("付与ID", { exact: true }).inputValue();
      await page.getByRole("button", { name: "この付与IDで付与・再送する" }).click();
      await page.getByRole("status").filter({ hasText: "付与を保存しました。" }).waitFor();
      assert.equal(await page.getByLabel("付与ID", { exact: true }).inputValue(), grantId);
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "進行を停止して結果を集計", exact: true }).click();
      await page.getByRole("button", { name: "集計を続きから再開" }).click();
      await page.getByRole("status").filter({ hasText: "全員の結果を確定し" }).waitFor();
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 950 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: admin overflow at ${width}`);
      }
      await page.goto(`${base}/`);
      const menu = page.getByRole("link", { name: /^ゆめつきクエスト/ });
      await menu.waitFor();
      assert.equal(await menu.getAttribute("href"), "/quest");
      assert.ok(decodeURIComponent(await menu.locator("img").getAttribute("src")).includes("/quest/menu-thumbnail-v2.jpg"));
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
