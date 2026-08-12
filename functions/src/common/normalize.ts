export function normalizeX(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[()（）【】［］]/g, "")
    .replace(/[@＠]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}