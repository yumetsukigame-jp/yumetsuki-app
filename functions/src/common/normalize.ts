export function normalizeX(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[()（）【】［］]/g, "")
    .replace(/[@＠]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

export function matchesXAccountRow(line: unknown, account: unknown): boolean {
  if (typeof line !== "string" || typeof account !== "string") return false;
  const normalized = normalizeX(account);
  const handles = line.replace(/＠/g, "@").match(/@[a-zA-Z0-9_]{1,15}(?![a-zA-Z0-9_])/g);
  return Boolean(normalized && handles?.some(handle => normalizeX(handle) === normalized));
}