const jstDateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatJstDateTime(date: Date): string {
  return `${jstDateTimeFormatter.format(date)} JST`;
}

export function parseJstDateTime(value: string): Date {
  // datetime-local values have no offset; always interpret them as Japan time.
  return new Date(`${value}+09:00`);
}
