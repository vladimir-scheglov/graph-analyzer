/**
 * Глубокий клон через JSON.
 * Достаточно для YAML-объектов: undefined и functions в схемах не встречаются,
 * Date — тоже (все даты в схемах строки).
 */
export function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
