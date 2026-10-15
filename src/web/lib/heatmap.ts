export interface HeatmapScheme {
  label: string;
  low: string;
  mid: string;
  high: string;
}

export const HEATMAPS: Record<string, HeatmapScheme> = {
  health: { label: "Health", low: "#dc2626", mid: "#f59e0b", high: "#10b981" },
  degree: { label: "Связей", low: "#334155", mid: "#3b82f6", high: "#10b981" },
  entities: {
    label: "Entities",
    low: "#334155",
    mid: "#8b5cf6",
    high: "#ec4899",
  },
  fqid: {
    label: "FQID-ссылок",
    low: "#334155",
    mid: "#0891b2",
    high: "#22d3ee",
  },
};

function hexToRgb(h: string): [number, number, number] {
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return [r, g, b];
}

function lerp(
  a: [number, number, number],
  b: [number, number, number],
  k: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

export function heatColor(
  value: number,
  min: number,
  max: number,
  scheme: HeatmapScheme,
): string {
  if (max === min) return scheme.mid;

  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

  let from: [number, number, number];
  let to: [number, number, number];
  let k: number;
  if (t < 0.5) {
    from = hexToRgb(scheme.low);
    to = hexToRgb(scheme.mid);
    k = t * 2;
  } else {
    from = hexToRgb(scheme.mid);
    to = hexToRgb(scheme.high);
    k = (t - 0.5) * 2;
  }

  const rgb = lerp(from, to, k);
  return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
}
