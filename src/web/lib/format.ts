export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "с";
  const m = Math.floor(s / 60);
  return m + "м " + (s % 60) + "с";
}

export function truncate(
  str: string | null | undefined,
  maxLength: number,
): string {
  if (!str) return "";
  return str.length > maxLength ? str.substring(0, maxLength - 3) + "..." : str;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "только что";
  if (min < 60) return min + " мин назад";
  const h = Math.floor(min / 60);
  if (h < 24) return h + " ч назад";
  const d = Math.floor(h / 24);
  return d + " дн назад";
}

export function formatSavedAt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return diffMin + " мин назад";
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return diffH + " ч назад";
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return diffD + " дн назад";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[c];
  });
}

export function sourceIcon(source: string | null | undefined): string {
  if (source === "graphql") return "cloud_done";
  if (source === "fs") return "hard_drive";
  return "help";
}

export function sourceLabel(source: string | null | undefined): string {
  if (source === "graphql") return "обновлён на сервере";
  if (source === "fs") return "изменён локально";
  return "источник неизвестен";
}

export function sourceColor(source: string | null | undefined): string {
  if (source === "graphql") return "var(--accent-hover)";
  if (source === "fs") return "var(--warning)";
  return "var(--text-500)";
}

export function relativeTimeShort(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "только что";
    if (min < 60) return `${min}м`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}ч`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}д`;
    if (d < 30) return `${Math.floor(d / 7)}н`;
    if (d < 365) return `${Math.floor(d / 30)}м`;
    return `${Math.floor(d / 365)}г`;
  } catch {
    return "";
  }
}