const IS_TTY = !!process.stdout.isTTY;

export function writeProgress(text: string): void {
  if (!IS_TTY) return;
  const t = text.slice(0, 110);
  process.stdout.write("\r" + t + " ".repeat(Math.max(0, 110 - t.length)));
}

export function endProgress(): void {
  if (!IS_TTY) return;
  process.stdout.write("\r" + " ".repeat(110) + "\r");
}

export function makeProgressBar(
  current: number,
  total: number,
  width = 30,
): string {
  if (total === 0) return "[" + "░".repeat(width) + "] 0/0";
  const pct = Math.min(1, Math.max(0, current / total));
  const filled = Math.round(pct * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${current}/${total}`;
}

export function info(msg: string): void {
  console.log(msg);
}
export function warn(msg: string): void {
  console.warn("⚠️  " + msg);
}
export function error(msg: string): void {
  console.error("❌ " + msg);
}
