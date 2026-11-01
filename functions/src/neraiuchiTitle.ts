export function neraiuchiTitleBody(title: string): string {
  return title.replace(/^(?:【第[0-9０-９]+回】\s*)+/, "");
}

export function numberedNeraiuchiTitle(title: string, roundNumber: unknown): string {
  if (roundNumber == null) return title;
  if (typeof roundNumber !== "number" || !Number.isSafeInteger(roundNumber) || roundNumber < 1) {
    throw new Error("開催回番号が不正です");
  }
  return `【第${roundNumber}回】${neraiuchiTitleBody(title)}`;
}
