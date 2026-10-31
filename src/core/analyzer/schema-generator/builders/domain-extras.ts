// src/core/analyzer/schema-generator/builders/domain-extras.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock } from "../types";
import type { RawDomainEntry } from "../../model-builder";

const BASE_MEDIAS = [
  { id: "iconsAdd", iconName: "plus" },
  { id: "iconsEdit", iconName: "pencil" },
  { id: "iconsDelete", iconName: "trash" },
  { id: "iconsView", iconName: "eye" },
  { id: "iconsSave", iconName: "save" },
  { id: "iconsCancel", iconName: "close" },
  { id: "iconsReload", iconName: "refresh" },
  { id: "iconsSearch", iconName: "search" },
  { id: "iconsFilter", iconName: "filter_list" },
  { id: "iconsSettings", iconName: "settings" },
] as const;

export interface DomainExtrasResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "menus" | "medias";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

function entityUiFlags(
  rawDomain: RawDomainEntry | undefined,
  entityId: string,
): {
  hasList: boolean;
  hasPage: boolean;
  isDictionary: boolean;
} {
  const raw = rawDomain?.rawData?.entities;
  const item = Array.isArray(raw)
    ? raw.find((x: any) => String(x?.id) === entityId)
    : null;
  const ui = item?.ui && typeof item.ui === "object" ? item.ui : null;
  const hasList = ui?.list !== false;
  const hasPage = ui?.page === true;
  const isDictionary = !hasList && ui?.modals === false;
  return { hasList, hasPage, isDictionary };
}

export function buildDomainExtras(
  domainId: string,
  index: ModelIndex,
  allDomains: RawDomainEntry[],
  options: {
    scaffoldCreateMenuRoot: boolean;
    scaffoldCreateMedias: boolean;
    /** Генерировать пункты меню для сущностей домена. Default: false. */
    menuIncludeItems?: boolean;
  },
): DomainExtrasResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: DomainExtrasResult["skipped"] = [];

  const rawDomain = allDomains.find((d) => d.id === domainId);
  const domain = index.domains.find((d) => d.id === domainId);
  const domainName = domain?.name || domainId;

  // ── 1. root_group ──
  const existingRoots = index.menus.filter(
    (m) => m.domainId === domainId && m.type === "root_group",
  );
  const slug = domainId.split(".")[0] || "domain";
  const rootRoute = `/${slug}`;
  const rootId = `menus_${slug}`;

  let activeRootId: string | null = null;
  let rootInYaml = false;

  if (existingRoots.length > 0) {
    activeRootId = existingRoots[0].id;
    rootInYaml = true;
    if (options.scaffoldCreateMenuRoot) {
      skipped.push({
        blockId: `menu:(root)`,
        section: "menus",
        id: "(root_group)",
        reason: "already-exists",
        hint: `В домене уже есть root_group: ${existingRoots.map((m) => m.id).join(", ")}`,
      });
    }
  } else if (options.scaffoldCreateMenuRoot) {
    activeRootId = rootId;
    blocks.push({
      blockId: `menu:${rootId}`,
      section: "menus",
      groupPath: ["menus"],
      payload: {
        id: rootId,
        route: rootRoute,
        label: domainName,
        type: "root_group",
        placement: "top",
        items: [],
      },
      dependsOn: [],
      dependents: [],
      title: `Корневое меню ${rootId}`,
    });
  }

  // ── 2. menu items ──
  if (options.menuIncludeItems) {
    if (!activeRootId) {
      skipped.push({
        blockId: `menu:(items)`,
        section: "menus",
        id: "(items)",
        reason: "no-menu-root",
        hint: "Включите «Создать корневое меню» или создайте root_group в menus[] вручную",
      });
    } else {
      const existingItemIds = new Set<string>();
      const existingRoot = index.menus.find((m) => m.id === activeRootId);
      for (const it of existingRoot?.items || []) existingItemIds.add(it.id);

      const existingViewIds = new Set<string>(
        (index.schemasByDomain[domainId]?.sections?.views?.items || []).map(
          (v: any) => String(v.id).toLowerCase(),
        ),
      );

      for (const e of index.entities) {
        if (e.domainId !== domainId) continue;
        const flags = entityUiFlags(rawDomain, e.entityId);
        if (!flags.hasList || flags.isDictionary) continue;

        const listId = `lists_${e.entityId.toLowerCase()}`;
        if (!existingViewIds.has(listId.toLowerCase())) {
          skipped.push({
            blockId: `menuItem:${activeRootId}/${e.entityId}Menu`,
            section: "menus",
            id: `${e.entityId}Menu`,
            reason: "no-list-view",
            hint: `Сгенерируйте ${listId} (профиль CRUD) — тогда пункт меню добавится`,
          });
          continue;
        }

        const itemId = `${e.entityId}Menu`;
        if (existingItemIds.has(itemId)) {
          skipped.push({
            blockId: `menuItem:${activeRootId}/${itemId}`,
            section: "menus",
            id: itemId,
            reason: "already-exists",
          });
          continue;
        }

        blocks.push({
          blockId: `menuItem:${activeRootId}/${itemId}`,
          section: "menus",
          groupPath: ["menus", activeRootId],
          payload: {
            id: itemId,
            route: `${rootRoute}/${e.entityId.toLowerCase()}`,
            label: e.name || e.entityId,
            type: "menu",
            view: listId,
          },
          dependsOn: [`view:${listId}`],
          dependents: [],
          title: `Пункт меню ${itemId} → ${listId}`,
          menuRootId: activeRootId,
        });
      }
    }
  }

  // ── 3. medias palette ──
  if (options.scaffoldCreateMedias) {
    const existing = index.medias.filter((m) => m.domainId === domainId);
    if (existing.length >= 3) {
      skipped.push({
        blockId: `media:(palette)`,
        section: "medias",
        id: "(palette)",
        reason: "already-exists",
        hint: `В домене уже ${existing.length} медиа — палитра не генерируется`,
      });
    } else {
      const existingIds = new Set(existing.map((m) => m.id));
      for (const m of BASE_MEDIAS) {
        if (existingIds.has(m.id)) {
          skipped.push({
            blockId: `media:${m.id}`,
            section: "medias",
            id: m.id,
            reason: "already-exists",
          });
          continue;
        }
        blocks.push({
          blockId: `media:${m.id}`,
          section: "medias",
          groupPath: ["medias"],
          payload: { id: m.id, type: "icon_name", iconName: m.iconName },
          dependsOn: [],
          dependents: [],
          title: `Иконка ${m.id} (${m.iconName})`,
        });
      }
    }
  }

  return { blocks, skipped };
}
