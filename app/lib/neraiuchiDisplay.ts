import type { NeraiuchiEntry, NeraiuchiEvent } from "../../functions/src/neraiuchiTypes";

export const participationConfirmation =
  "無料・1アカウントにつき1企画1回です。サーバーで確定した順に番号を割り当てます。参加しますか？";

export function participationDisplay(event: NeraiuchiEvent, entry: NeraiuchiEntry | null) {
  const completed = event.resultsReleased || entry?.resultsReleased === true;
  return {
    canParticipate: !entry && !completed && event.availability === "open",
    buttonLabel: entry ? "すでに参加済み" : completed ? "受付終了" :
      event.availability === "open" ? "今回の狙い撃ちに参加" :
        event.availability === "upcoming" ? "受付開始前" : "新規参加停止中",
    resultLabel: completed ? "結果確定済み（終了）" : "結果未確定（終了後に公開）",
  };
}

export function nextNeraiuchiBoundary(events: NeraiuchiEvent[], serverNow: number): number | null {
  const times = events.filter((event) => !event.resultsReleased)
    .flatMap((event) => [event.startsAt, event.endsAt]).filter((time) => time > serverNow);
  return times.length ? Math.min(...times) : null;
}
