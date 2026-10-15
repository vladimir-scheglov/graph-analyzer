export function matchesNamespace(
  domainId: string,
  filterPattern: string,
): boolean {
  if (!filterPattern || filterPattern.trim() === "") return true;

  const tokens = filterPattern
    .replace(/[,;]/g, " ")
    .split(" ")
    .filter((p) => p.length > 0)
    .map((p) => p.toLowerCase());

  if (tokens.length === 0) return true;

  const id = domainId.toLowerCase();
  const include = tokens.filter((t) => t.charAt(0) !== "!");
  const exclude = tokens
    .filter((t) => t.charAt(0) === "!")
    .map((t) => t.slice(1))
    .filter((t) => t.length > 0);

  for (const ex of exclude) {
    if (simplePatternMatch(id, ex)) return false;
  }

  if (include.length === 0) return true;

  for (const inc of include) {
    if (simplePatternMatch(id, inc)) return true;
  }
  return false;
}

export function simplePatternMatch(domainId: string, pattern: string): boolean {
  if (pattern.indexOf("*") !== -1) {
    const parts = pattern.split("*");

    if (parts[0]) {
      const prefix = parts[0];
      const prefixNoDot =
        prefix.charAt(prefix.length - 1) === "." ? prefix.slice(0, -1) : prefix;
      if (domainId.indexOf(prefix) !== 0 && domainId !== prefixNoDot)
        return false;
    }

    if (parts[parts.length - 1]) {
      const last = parts[parts.length - 1];
      if (domainId.lastIndexOf(last) !== domainId.length - last.length)
        return false;
    }

    let pos = parts[0] ? parts[0].length : 0;
    for (let i = 1; i < parts.length - 1; i++) {
      if (!parts[i]) continue;
      const found = domainId.indexOf(parts[i], pos);
      if (found === -1) return false;
      pos = found + parts[i].length;
    }
    return true;
  }
  return domainId === pattern || domainId.indexOf(pattern + ".") === 0;
}
