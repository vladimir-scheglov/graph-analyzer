// src/web/components/modals/GenerateSchemaPresets.ts
import type { ModelIndex, EntityRecord } from "../../../shared/model-types";

export interface PresetApply {
  /** Имя профиля из PROFILE_INFO. */
  profile: string;
  /** Частичный патч опций — merge с текущими. */
  options: Record<string, any>;
}

export interface QuickPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** Профили, к которым применим этот preset. */
  forProfiles: string[];
  /** entity- или domain-скоуп. */
  scope: "entity" | "domain";
  apply: PresetApply;
  /** Дополнительная логика: скрыть пресет, если не применим. */
  isAvailable?: (ctx: PresetContext) => boolean;
}

export interface PresetContext {
  index: ModelIndex | null;
  domainId: string;
  entity: EntityRecord | null;
}

const ENTITY_PROFILES = new Set([
  "crud",
  "crud-with-page",
  "dictionary",
  "no-modals",
  "tree-view",
  "auto",
]);

export const QUICK_PRESETS: QuickPreset[] = [
  {
    id: "preset-full-crud",
    label: "CRUD целиком",
    description:
      "Действия, представления, меню, связи — полный жизненный цикл сущности",
    icon: "checklist",
    forProfiles: ["crud", "crud-with-page", "auto"],
    scope: "entity",
    apply: {
      profile: "crud",
      options: {
        includeBulk: true,
        includeLinkageWidgets: true,
        skipExisting: true,
      },
    },
  },
  {
    id: "preset-only-actions",
    label: "Только actions",
    description: "Кнопки создать/изменить/удалить без views и меню",
    icon: "bolt",
    forProfiles: ["crud", "crud-with-page", "dictionary", "no-modals", "auto"],
    scope: "entity",
    apply: {
      profile: "crud",
      options: {
        includeBulk: true,
        includeLinkageWidgets: false,
        includePage: false,
      },
    },
    isAvailable: (ctx) => !!ctx.entity,
  },
  {
    id: "preset-only-views",
    label: "Только views",
    description:
      "Entity-view, list-view, панель и модалки без изменения actions",
    icon: "view_quilt",
    forProfiles: ["crud", "crud-with-page", "dictionary", "no-modals", "auto"],
    scope: "entity",
    apply: {
      profile: "crud",
      options: {
        includeBulk: false,
        includeLinkageWidgets: true,
        includePage: false,
      },
    },
    isAvailable: (ctx) => !!ctx.entity,
  },
  {
    id: "preset-only-menu",
    label: "Только меню",
    description: "Пункт меню в первом root_group для уже существующего view",
    icon: "menu",
    forProfiles: ["crud", "crud-with-page", "auto"],
    scope: "entity",
    apply: {
      profile: "crud",
      options: {
        includeBulk: false,
        includePage: false,
        includeLinkageWidgets: false,
      },
    },
    isAvailable: (ctx) => {
      if (!ctx.entity || !ctx.index) return false;
      // Только если уже есть entity-view, чтобы не дублировать
      const views = ctx.index.viewWidgets.filter(
        (w) => w.domainId === ctx.domainId && w.type === "attribute", // грубая проверка, что entity-view уже есть
      );
      return views.length > 0;
    },
  },
  {
    id: "preset-sorting-searching",
    label: "Сортировки / поиск",
    description: "Добавить sorting[] и searching[] к существующей сущности",
    icon: "sort",
    forProfiles: ["sorting-searching"],
    scope: "entity",
    apply: {
      profile: "sorting-searching",
      options: {
        includeSorting: true,
        includeSearching: true,
      },
    },
  },
  {
    id: "preset-linkages",
    label: "Связи (linkage-виджеты)",
    description: "Только linkage-виджеты в существующий entity-view",
    icon: "link",
    forProfiles: ["crud", "crud-with-page", "auto"],
    scope: "entity",
    apply: {
      profile: "crud",
      options: {
        includeBulk: false,
        includePage: false,
        includeLinkageWidgets: true,
      },
    },
    isAvailable: (ctx) => {
      if (!ctx.entity || !ctx.index) return false;
      // Есть хотя бы одна связь с участием этой сущности
      return ctx.index.entityLinkages.some(
        (l) =>
          l.domainId === ctx.domainId &&
          (l.side1Fqid === ctx.entity!.fqid ||
            l.side2Fqid === ctx.entity!.fqid),
      );
    },
  },
];

export function availablePresetsForProfile(
  profile: string,
  ctx: PresetContext,
): QuickPreset[] {
  return QUICK_PRESETS.filter((p) => {
    if (!p.forProfiles.includes(profile)) return false;
    if (p.scope === "entity" && !ctx.entity) return false;
    if (p.isAvailable && !p.isAvailable(ctx)) return false;
    return true;
  });
}
