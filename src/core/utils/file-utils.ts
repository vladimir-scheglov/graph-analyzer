export function sanitizeFileName(name: string): string {
  const s = String(name)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim();
  return (s || "unnamed").slice(0, 200);
}

export function truncate(
  str: string | null | undefined,
  maxLength: number,
): string {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}
