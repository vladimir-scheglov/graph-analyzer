const MIME_HINTS: Record<string, string> = {
  "application/pdf": "PDF-документ",
  "image/png": "PNG-изображение",
  "image/jpeg": "JPEG-изображение",
  "image/gif": "GIF-изображение",
  "image/svg+xml": "SVG-вектор",
  "text/plain": "Текстовый файл",
  "text/csv": "CSV",
  "application/zip": "ZIP-архив",
  "application/json": "JSON",
};

export function buildMimeHover(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (MIME_HINTS[v]) return `**${v}** — ${MIME_HINTS[v]}`;
  if (/^image\//.test(v)) return `**${v}** — изображение`;
  if (/^audio\//.test(v)) return `**${v}** — аудио`;
  if (/^video\//.test(v)) return `**${v}** — видео`;
  if (/^text\//.test(v)) return `**${v}** — текст`;
  return null;
}

export function buildRegexpHover(value: string): string {
  const parts: string[] = [];
  if (value.startsWith("^")) parts.push("начинается с начала строки");
  if (value.endsWith("$")) parts.push("заканчивается на конце");
  if (/\\d/.test(value)) parts.push("содержит цифры (\\d)");
  if (/\\w/.test(value)) parts.push("словесные символы (\\w)");
  if (/\[a-z\]/i.test(value)) parts.push("диапазон букв");
  if (/\{[0-9,]+\}/.test(value)) parts.push("квантификатор повторений");
  return `**regexp** — ${parts.length ? parts.join(", ") : "регулярное выражение"}.\n\nПроверить: [regex101.com](https://regex101.com/?regex=${encodeURIComponent(value)})`;
}

export function buildTemplatePlaceholderHover(
  placeholder: string,
): string | null {
  switch (placeholder) {
    case "{@inc}":
      return "**{@inc}** — **обязателен**. Инкрементальный счётчик. Ширина из `incrementTemplate`.";
    case "{@prefix}":
      return "**{@prefix}** — префикс. Из `prefixRules` по совпадению, иначе `defaultPrefix`.";
    case "{@YYYY}":
      return "**{@YYYY}** — текущий год, 4 цифры.";
    case "{@YY}":
      return "**{@YY}** — текущий год, 2 цифры.";
    case "{@MM}":
      return "**{@MM}** — месяц, 2 цифры (01–12).";
    case "{@DD}":
      return "**{@DD}** — день месяца, 2 цифры (01–31).";
    default:
      return null;
  }
}

export function buildLabelPlaceholderHover(attrId: string): string {
  return `**{${attrId}}** — подстановка значения атрибута \`${attrId}\`.`;
}

export function buildColorHover(value: string): string {
  const v = value.trim();
  const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    const hex = m[1];
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `**${v}** — rgb(${r}, ${g}, ${b})`;
  }
  return `**${v}** — CSS-цвет`;
}

export function buildConditionTrueHover(): string {
  return "**condition: true** — правило применяется всегда, без проверки.\n\nДля `effect: hidden` это «скрыть всегда». Обычно не нужно — используйте RQL-условие.";
}
