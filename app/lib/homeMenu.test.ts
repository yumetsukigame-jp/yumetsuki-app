import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { homeGuide, visibleHomeMenu } from "./homeMenu";

const links = (enabled: boolean) => [
  ...visibleHomeMenu(enabled).flatMap((section) => [...section.cards, ...section.guides, ...section.details].map((link) => link.href)),
  homeGuide.href, "https://yumetsuki.base.shop", "/admin",
];

test("all 21 existing destinations are preserved; Nanika is separate and Neraiuchi remains flag-gated", () => {
  const old = [
    "/nibuichi", "/nibuichi/guide", "/nibuichi/ranking", "/nibuichi/history",
    "/gacha/list", "/gacha/guide", "/gacha", "/gacha/results", "/gacha/archive",
    "/quizzes", "/quizzes/guide", "/quizzes/archive", "/quizzes/ranking",
    "/code", "/reward", "/history", "/archive", "/profile", "/guide",
    "https://yumetsuki.base.shop", "/admin",
  ];
  const nanika = ["/nanika-gacha", "/nanika-gacha/guide", "/nanika-gacha/history"];
  assert.deepEqual(new Set(links(false)), new Set([...old, ...nanika]));
  assert.deepEqual(new Set(links(true)), new Set([...old, ...nanika, "/neraiuchi", "/neraiuchi/guide", "/neraiuchi/history"]));
  assert.deepEqual(visibleHomeMenu(true).map((section) => section.id),
    ["nibuichi", "gacha", "nanika-gacha", "quiz", "neraiuchi", "points", "account"]);
  assert.ok(visibleHomeMenu(false).every((section) => section.id !== "neraiuchi"));
});

test("every menu destination and original/optimized image exists; profile stays in details", () => {
  for (const href of links(true).filter((href) => href.startsWith("/"))) {
    assert.ok(existsSync(`app${href}/page.tsx`), href);
  }
  for (const section of visibleHomeMenu(true)) {
    for (const item of [...section.cards, ...section.guides, ...section.details]) {
      if (item.image) {
        assert.ok(existsSync(`public/menu/thumbnails/${item.image}.png`));
        assert.ok(existsSync(`public/menu/thumbnails/${item.image}.webp`));
      }
      if (item.icon) assert.ok(existsSync(`public/menu/icons/${item.icon}.webp`));
    }
  }
  const account = visibleHomeMenu(true).find((section) => section.id === "account")!;
  assert.deepEqual(account.cards.map((item) => item.href), ["/archive"]);
  assert.deepEqual(account.details.map((item) => item.href), ["/profile"]);
});
