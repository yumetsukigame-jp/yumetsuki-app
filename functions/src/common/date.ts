/* ============================================================
   共通：JST 時刻ユーティリティ（6時切り替え対応版）
============================================================ */

export function nowJST(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
}

export function getDateStringJST(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getYesterdayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) now.setDate(now.getDate() - 2);
  else now.setDate(now.getDate() - 1);
  return getDateStringJST(now);
}

export function getTodayJST6(): string {
  const now = nowJST();
  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }
  return getDateStringJST(now);
}