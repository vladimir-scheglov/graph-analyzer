import type { LineMap } from "./line-map";
import { SYSTEM_ATTRIBUTE_IDS } from "../../../core/analyzer/linter";

export interface UnusedAnalysis {
  /** entityId (lowercase), у которого нет ни одной ссылки. */
  entities: Set<string>;
  /** "entityId:attrId" (lowercase) атрибутов без ссылок. */
  attributes: Set<string>;
}

const WORD_RE = /[a-zA-Z_][a-zA-Z0-9_]*/g;
const DEF_ID_RE = /^\s*-\s+id\s*:\s*["']?([a-zA-Z_][a-zA-Z0-9_]*)["']?/;

/**
 * Локальный анализ «что нигде не используется» по тексту YAML.
 *
 * Правило: id считается неиспользуемым, если в тексте он встречается
 * столько же раз, сколько раз объявлен через `- id: <id>`. То есть кроме
 * собственного определения — ни одной ссылки.
 *
 * Совпадает с эвристикой, которую YamlViewerModal уже применяет для
 * затенения атрибутов в Monaco (unused-attribute-line / wordCounts-defCounts).
 * Разница в том, что здесь анализ дополнительно возвращает и entities.
 *
 * Не зависит от серверного ModelIndex — работает до сохранения и сразу
 * после генерации, когда views/actions уже вставлены, но индекс ещё старый.
 */
export function computeUnusedInYaml(
  content: string,
  lineMap: LineMap,
): UnusedAnalysis {
  const empty: UnusedAnalysis = {
    entities: new Set(),
    attributes: new Set(),
  };
  if (!content) return empty;

  // 1) Частоты word-токенов по всему тексту (комментарии — долой,
  //    иначе `# TODO refactor Device` сделает Device «used»).
  const text = content.replace(/#[^\n]*/g, "");
  const wordCounts = new Map<string, number>();
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0];
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }

  // 2) Частоты определений `- id: <id>`.
  const defCounts = new Map<string, number>();
  for (const line of text.split("\n")) {
    const m = line.match(DEF_ID_RE);
    if (!m) continue;
    defCounts.set(m[1], (defCounts.get(m[1]) || 0) + 1);
  }

  // 3) Сущности и их атрибуты — по lineMap (там уже правильные границы
  //    блоков, никакого собственного парсинга).
  const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
  if (!entitiesSection) return empty;

  for (const entityNode of entitiesSection.nodes) {
    const entityId = entityNode.id;
    const entityTotal = wordCounts.get(entityId) || 0;
    const entityDefs = defCounts.get(entityId) || 0;

    // `entityTotal <= entityDefs` — слово встречается только в своих
    // определениях. Пример: `- id: Foo` (1) + `Foo` в комментариях (0,
    // комментарии уже вырезаны) = 1, defs = 1 → orphan.
    // Если есть `entity: Foo` в view — total = 2, defs = 1 → used.
    if (entityTotal <= entityDefs) {
      empty.entities.add(entityId.toLowerCase());
    }

    // Атрибуты. Глобальная эвристика (как в Monaco): «attr id встречается
    // только в определениях». Если `name` используется где-то ещё
    // (в другой сущности или в views) — orphan не помечается.
    // Это осознанный компромисс: точная проверка «используется ли
    // Device.name конкретно в views для Device» требует резолва
    // attribute-ссылок внутри блоков, что дублирует лениво-резолвящийся
    // ModelIndex на клиенте. Глобальная эвристика даёт false negative
    // (что безопасно), но не false positive.
    for (const attrNode of entityNode.children || []) {
      if (attrNode.type !== "attribute") continue;
      const attrId = attrNode.id;
      if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) continue;

      const attrTotal = wordCounts.get(attrId) || 0;
      const attrDefs = defCounts.get(attrId) || 0;
      if (attrTotal <= attrDefs) {
        empty.attributes.add(
          `${entityId.toLowerCase()}:${attrId.toLowerCase()}`,
        );
      }
    }
  }

  return empty;
}
