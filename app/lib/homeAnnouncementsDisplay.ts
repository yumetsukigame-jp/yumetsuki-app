export function initialHomeAnnouncementIds(announcements: {
  id: string; type: string; isTopFrame?: boolean;
}[]) {
  return new Set([
    ...announcements.filter(item => item.type !== "gacha_win" && item.type !== "neraiuchi").slice(0, 2).map(item => item.id),
    ...announcements.filter(item => item.type === "neraiuchi" ||
      (item.type === "gacha_win" && item.isTopFrame === true)).map(item => item.id),
  ]);
}
