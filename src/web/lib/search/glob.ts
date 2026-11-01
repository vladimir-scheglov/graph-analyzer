/** Glob на `*` и `?`, case-insensitive. */
export function globMatch(str: string, pattern: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return str.toLowerCase().includes(pattern.toLowerCase());
  }
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += "\\" + ch;
    else re += ch;
  }
  return new RegExp("^" + re + "$", "i").test(str);
}

export function globContains(str: string, pattern: string): boolean {
  if (!pattern) return false;
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return str.toLowerCase().includes(pattern.toLowerCase());
  }
  let re = "";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "?") re += ".";
    else if (/[.+^${}()|[\]\\]/.test(ch)) re += "\\" + ch;
    else re += ch;
  }
  return new RegExp(re, "i").test(str);
}
