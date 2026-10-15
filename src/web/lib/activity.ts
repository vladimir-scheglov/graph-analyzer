export interface ActivityBucket {
  date: Date;
  day: number;
  month: number;
  count: number;
}

export function buildActivityBuckets(
  nodes: any[],
  days: number,
): ActivityBucket[] {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const startMs = now.getTime() - (days - 1) * 24 * 60 * 60 * 1000;

  const arr: ActivityBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    arr.push({ date: d, day: d.getDate(), month: d.getMonth(), count: 0 });
  }

  nodes.forEach((n) => {
    if (!n.data || n.data.nodeType !== "domain") return;
    if (!n.data.updatedAt) return;
    let t: number;
    try {
      t = new Date(n.data.updatedAt).getTime();
    } catch {
      return;
    }
    if (isNaN(t) || t < startMs) return;
    const idx = Math.floor((t - startMs) / (24 * 60 * 60 * 1000));
    if (idx >= 0 && idx < days) arr[idx].count++;
  });

  return arr;
}
