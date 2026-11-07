// src/web/components/modals/GenerateSchemaRecommendations.ts
import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

export interface ProfileRecommendation {
  profileId: string;
  reason: string;
  /** Доп. советы — «включите bulk», «проверьте меню» и т.д. */
  hints: string[];
  confidence: "high" | "medium" | "low";
}

export function recommendProfile(
  entity: EntityRecord | null,
  index: ModelIndex | null,
  domainId: string,
): ProfileRecommendation | null {
  if (!entity || !index) return null;

  const hints: string[] = [];

  // ── 1. Readonly-хэви: >70% атрибутов readonly ──
  const readonlyCount = entity.attributes.filter((a) => a.readonly).length;
  const readonlyRatio =
    entity.attributes.length > 0 ? readonlyCount / entity.attributes.length : 0;

  if (readonlyRatio >= 0.7 && entity.attributes.length >= 3) {
    return {
      profileId: "no-modals",
      reason: `${readonlyCount} из ${entity.attributes.length} атрибутов readonly — форма редактирования бессмысленна`,
      hints: ["Включите «Массовое удаление» — вероятно, понадобится"],
      confidence: "high",
    };
  }

  // ── 2. Справочник: мало атрибутов + есть уникальный identifier/name ──
  const hasIdentifier = entity.attributes.some(
    (a) => a.dataType === "Identifier" || a.id === "id" || a.id === "code",
  );
  const hasName = entity.attributes.some(
    (a) => a.id === "name" || a.id === "title" || a.id === "label",
  );
  if (
    entity.attributes.length >= 2 &&
    entity.attributes.length <= 10 &&
    hasIdentifier &&
    hasName
  ) {
    return {
      profileId: "dictionary",
      reason:
        "компактная сущность с identifier и name — типичный справочник (редактируется редко)",
      hints: [
        "Если в справочник будут попадать сотни записей — попробуйте «Без модалок»",
      ],
      confidence: "medium",
    };
  }

  // ── 3. Дерево: есть side-1 связи типа 1_n / n_n ──
  const fqid = entity.fqid.toLowerCase();
  const hasTreeLinkage = index.entityLinkages.some(
    (l) =>
      l.domainId === index.entitiesByFqid[fqid]?.domainId &&
      (l.side1Fqid === fqid || l.side2Fqid === fqid) &&
      (l.type === "1_n" || l.type === "n_n"),
  );
  if (hasTreeLinkage) {
    hints.push("Есть 1_n/n_n связи — включите «Связи (linkage-виджеты)»");
  }

  // ── 4. Меню: есть ли корень ──
  const hasMenuRoot = (
    index.schemasByDomain[domainId]?.sections.menus.items || []
  ).some((m: any) => m.type === "root_group" || m.type === "root_menu");
  if (!hasMenuRoot) {
    hints.push(
      "В домене нет корневого меню — пункт меню не сгенерируется (создайте вручную или через «domain-extras»)",
    );
  }

  // ── 5. Уже есть views/actions — предложить локальный режим ──
  const existingActions = (
    index.schemasByDomain[domainId]?.sections.actions.items || []
  ).filter((a: any) => a.entity === fqid);
  if (existingActions.length > 0) {
    hints.push(
      `У сущности уже ${existingActions.length} actions — включён «Пропускать существующие»`,
    );
  }

  // ── 6. Дефолт ──
  return {
    profileId: "crud",
    reason: "стандартный жизненный цикл сущности",
    hints,
    confidence: "low",
  };
}
