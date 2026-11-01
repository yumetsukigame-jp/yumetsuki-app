import assert from "node:assert/strict";
import { test } from "node:test";
import { initialHomeAnnouncementIds } from "./homeAnnouncementsDisplay";

test("ended Neraiuchi notice stays in initial display beyond the two newest notices; top wins remain visible", () => {
  const announcements = [
    { id: "new1", type: "quiz_new" },
    { id: "regularWin", type: "gacha_win", isTopFrame: false },
    { id: "new2", type: "gacha_new" },
    { id: "old", type: "quiz" },
    { id: "ended", type: "neraiuchi" },
    { id: "topWin", type: "gacha_win", isTopFrame: true },
  ];
  const ids = initialHomeAnnouncementIds(announcements);
  assert.deepEqual(announcements.filter(item => ids.has(item.id)).map(item => item.id),
    ["new1", "new2", "ended", "topWin"]);
  const newestEnded = [announcements[4], ...announcements.filter(item => item.id !== "ended")];
  assert.deepEqual([...initialHomeAnnouncementIds(newestEnded)].sort(), ["ended", "new1", "new2", "topWin"]);
});
