/* eslint-disable @typescript-eslint/no-require-imports -- Standalone local browser validation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const base = process.env.BRANDING_TEST_URL || "http://127.0.0.1:3198";
const target = new URL(base);
if (target.hostname !== "127.0.0.1" || target.protocol !== "http:") {
  throw new Error("Browser target must be loopback HTTP.");
}

async function run() {
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await engine.launch();
    try {
      const context = await browser.newContext({ reducedMotion: "reduce" });
      await context.route("**/*", (route) => {
        if (new URL(route.request().url()).origin !== target.origin) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}/login`);
        const header = page.locator('img[src="/branding/header-starry-wide.svg"]');
        const footer = page.locator('img[src="/branding/footer-starry-wide.svg"]');
        assert.equal(await header.count(), 1);
        assert.equal(await footer.count(), 1);
        await footer.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => [...document.querySelectorAll('img[src^="/branding/"]')]
          .every((image) => image.complete && image.naturalWidth === 2100));
        for (const image of [header, footer]) {
          const box = await image.boundingBox();
          assert.ok(box);
          const expected = Math.min(width, 840);
          assert.ok(Math.abs(box.width - expected) < 1, `${name} ${width}: banner width`);
          assert.ok(Math.abs(box.height - expected / 7) < 1, `${name} ${width}: banner ratio`);
          assert.ok(box.height <= 120);
          assert.ok(Math.abs(box.x - (width - expected) / 2) < 1, "Banner must be centered");
          assert.equal(await image.getAttribute("width"), "2100");
          assert.equal(await image.getAttribute("height"), "300");
          const link = image.locator("..");
          assert.equal(await link.getAttribute("href"), "/");
          await link.focus();
          assert.equal(await link.evaluate((element) => element.matches(":focus-visible")), true);
          assert.equal(await link.evaluate((element) => getComputedStyle(element).outlineColor), "rgb(250, 204, 21)");
        }
        assert.equal(await header.getAttribute("alt"), "ゆめつきの書斎");
        assert.equal(await footer.getAttribute("alt"), "");
        const footerLink = footer.locator("..");
        assert.equal(await footerLink.getAttribute("aria-label"), "トップページへ戻る");
        assert.equal(await footerLink.locator("small").innerText(), "クリックでトップページへ");
        assert.equal(await footerLink.locator("small").evaluate((element) => getComputedStyle(element).fontSize), "12px");
        for (const element of [header.locator("../.."), footerLink.locator("..")]) {
          assert.equal(await element.evaluate((node) => getComputedStyle(node).position), "static");
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (process.env.BRANDING_TEST_ARTIFACTS) {
          fs.mkdirSync(process.env.BRANDING_TEST_ARTIFACTS, { recursive: true });
          await page.screenshot({
            path: path.join(process.env.BRANDING_TEST_ARTIFACTS, `branding-${name}-${width}.png`),
            fullPage: true,
          });
        }
      }

      await page.locator('footer a[aria-label="トップページへ戻る"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(`${base}/`);
      assert.equal(await page.getByRole("button", { name: "一つ前の画面に戻る", exact: true }).count(), 0);
      await page.goto(`${base}/guide`);
      await page.goto(`${base}/login`);
      await page.getByRole("button", { name: "一つ前の画面に戻る", exact: true }).click();
      await page.waitForURL(`${base}/guide`);
      await page.getByRole("link", { name: "ゆめつきの書斎 トップへ", exact: true }).click();
      await page.waitForURL(`${base}/`);
      assert.deepEqual(errors, [], `${name}: uncaught browser errors`);
      console.log(`${name}: four widths, SVG loading, focus, no overflow, and both navigation actions passed.`);
    } finally {
      await browser.close();
    }
  }
  const css = fs.readFileSync(path.join(__dirname, "../components/UserBranding.module.css"), "utf8");
  assert.ok(css.includes("env(safe-area-inset-bottom, 0px)"));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
