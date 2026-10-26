/**
 * FNV-1a 32-bit hex. Не криптографический — только для детекции ручных правок.
 * 32 бита → коллизии ~1 к 4 млрд, достаточно для «не менялось ли вручную».
 */
export function hashPayload(payload: unknown): string {
  let str: string;
  try {
    str = JSON.stringify(payload);
  } catch {
    str = "";
  }
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
