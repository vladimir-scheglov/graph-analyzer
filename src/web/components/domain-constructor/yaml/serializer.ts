import { YamlDocument, setRql, type YamlPath } from "./document";
import type {
  Metadata,
  EntitySchema,
  AttributeSchema,
  ElementKey,
  PathMap,
  DataRuleSchema,
  UiRuleSchema,
} from "../types";

/**
 * Точечные правки YAML-документа.
 *
 * - Неизвестные поля не трогаются.
 * - Для RQL-полей — setRql() (с '!rql').
 * - Для новых элементов — appendToSeq() + регистрация в pathMap.
 */
export class DomainSerializer {
  constructor(
    private doc: YamlDocument,
    private pathMap: PathMap,
  ) {}

  // ============ Метаданные ============

  setMetadata(field: keyof Metadata, value: unknown): void {
    this.doc.set([field as string], value);
  }

  // ============ Сущность ============

  setEntityField(entityId: string, field: string, value: unknown): void {
    const path = this.requirePath(`entity:${entityId}`);
    this.doc.set([...path, field], value);
  }

  addEntity(partial: EntitySchema): YamlPath {
    const path: YamlPath = ["entities", this.seqLength(["entities"])];
    this.doc.set(path, {
      id: partial.id,
      name: partial.name,
      attributes: [],
    });
    this.pathMap.set(`entity:${partial.id}`, path);
    return path;
  }

  deleteEntity(entityId: string): void {
    const path = this.requirePath(`entity:${entityId}`);
    // удалить из seq — eemeli/yaml сам сдвинет индексы
    this.doc.doc.deleteIn(path as any);
    // после удаления пересчитать pathMap — в реальном коде делаем
    // это через re-parse (см. hint ниже)
  }

  // ============ Атрибут ============

  setAttributeField(
    entityId: string,
    attrId: string,
    field: string,
    value: unknown,
  ): void {
    const path = this.requirePath(`entity:${entityId}/attribute:${attrId}`);
    this.doc.set([...path, field], value);
  }

  addAttribute(entityId: string, attr: AttributeSchema): YamlPath {
    const entityPath = this.requirePath(`entity:${entityId}`);
    const attrsPath = [...entityPath, "attributes"];
    const idx = this.seqLength(attrsPath);
    const attrPath: YamlPath = [...attrsPath, idx];
    this.doc.set(attrPath, {
      id: attr.id,
      dataType: attr.dataType,
      ...(attr.name ? { name: attr.name } : {}),
    });
    this.pathMap.set(`entity:${entityId}/attribute:${attr.id}`, attrPath);
    return attrPath;
  }

  // ============ RQL-поля ============

  setDataRuleCondition(ruleId: string, rql: string | null): void {
    const path = this.requirePath(`dataRule:${ruleId}`);
    if (rql === null) {
      // «применять всегда»
      this.doc.set([...path, "condition"], true);
    } else {
      setRql(this.doc, [...path, "condition"], rql);
    }
  }

  setDataRuleAttributeConstraint(
    ruleId: string,
    attrId: string,
    field: "constraint" | "expression",
    rql: string | null,
  ): void {
    const path = this.requirePath(`dataRule:${ruleId}`);
    // найти индекс атрибута в rule.attributes
    const attrs = this.doc.get([...path, "rule", "attributes"]) as unknown[];
    const idx = Array.isArray(attrs)
      ? attrs.findIndex((a: any) => a && a.attribute === attrId)
      : -1;
    if (idx < 0) return;
    setRql(this.doc, [...path, "rule", "attributes", idx, field], rql);
  }

  setUiRuleCondition(ruleId: string, rql: string | null): void {
    const path = this.requirePath(`uiRule:${ruleId}`);
    if (rql === null) return;
    setRql(this.doc, [...path, "condition"], rql);
  }

  // ============ Вспомогательное ============

  private requirePath(key: ElementKey): YamlPath {
    const p = this.pathMap.get(key);
    if (!p) throw new Error(`DomainSerializer: нет пути для "${key}"`);
    return p;
  }

  private seqLength(path: YamlPath): number {
    const seq = this.doc.get(path);
    return Array.isArray(seq) ? seq.length : 0;
  }
}
