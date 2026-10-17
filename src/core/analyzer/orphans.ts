import type { ModelOrphans } from "../../shared/model-types";

interface RawDomainForOrphans {
  id: string;
  rawData: any;
}

const VIEW_REF_KEYS_IN_ACTION = [
  "modal",
  "panel",
  "form",
  "tab",
  "list",
  "view",
  "page",
];

/**
 * Проходит по всем views.widgets (рекурсивно) и собирает ссылки на actions и medias.
 */
function collectWidgetUsage(
  widgets: any,
  ctx: { actions: Set<string>; medias: Set<string>; views: Set<string> },
): void {
  if (!Array.isArray(widgets)) return;
  for (const w of widgets) {
    if (!w || typeof w !== "object") continue;

    if (w.type === "action" && w.action) {
      ctx.actions.add(String(w.action));
      // Может быть массив actions
    }
    if (Array.isArray(w.actions)) {
      w.actions.forEach((a: any) => {
        const id = typeof a === "string" ? a : a?.action;
        if (id) ctx.actions.add(String(id));
      });
    }
    if (w.control) {
      if (w.control.icon) ctx.medias.add(String(w.control.icon));
      if (w.control.iconName) ctx.medias.add(String(w.control.iconName));
      if (w.control.view) ctx.views.add(String(w.control.view));
    }
    if (w.entity_lists) {
      // linkage_list, может ссылаться на views
      if (Array.isArray(w.entity_lists)) {
        w.entity_lists.forEach((el: any) => {
          if (el?.list) ctx.views.add(String(el.list));
        });
      }
    }

    // Рекурсия по вложенным widgets (редко, но бывает)
    if (w.widgets) collectWidgetUsage(w.widgets, ctx);
  }
}

function collectGroupUsage(
  groups: any,
  ctx: { actions: Set<string>; medias: Set<string>; views: Set<string> },
): void {
  if (!Array.isArray(groups)) return;
  for (const g of groups) {
    if (!g || typeof g !== "object") continue;
    if (Array.isArray(g.components)) {
      g.components.forEach((c: any) => {
        if (c?.widget && typeof c.widget === "string") {
          // components.widget — ссылка на widget id, не на action.
          // Но widget может быть типа action — тогда это не сюда.
        }
        if (c?.block && typeof c.block === "string") {
          // ссылка на другой group типа block
        }
      });
    }
  }
}

/**
 * Возвращает набор "используемых" id по каждому типу элемента.
 *
 * ВАЖНО: использование мы отслеживаем по всему графу domains —
 * элемент считается используемым, если на него сослался кто угодно.
 *
 * Ключи — полные FQID в lowercase: `domain.tld/id`.
 * Для локальных ссылок разворачиваем в `<domainId>/<localId>`.
 */
function collectUsage(domains: RawDomainForOrphans[]): {
  views: Set<string>;
  actions: Set<string>;
  dataTypes: Set<string>;
  sequences: Set<string>;
  medias: Set<string>;
} {
  const views = new Set<string>();
  const actions = new Set<string>();
  const dataTypes = new Set<string>();
  const sequences = new Set<string>();
  const medias = new Set<string>();

  const normalize = (raw: any, domainId: string): string | null => {
    if (!raw || typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;
    if (s.includes("/")) return s.toLowerCase();
    return (domainId + "/" + s).toLowerCase();
  };

  // Ключи, значения которых — это ссылки на views
  const VIEW_REF_KEYS = new Set([
    "modal",
    "panel",
    "form",
    "tab",
    "list",
    "page",
    "addLinksView",
    "view",
    "fromView",
  ]);

  for (const d of domains) {
    const raw = d.rawData || {};

    const walk = (node: any): void => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        // ============ Actions ============
        if (key === "action" && typeof value === "string") {
          const id = normalize(value, d.id);
          if (id) actions.add(id);
        }
        if (key === "actions") {
          if (typeof value === "string") {
            const id = normalize(value, d.id);
            if (id) actions.add(id);
          } else if (Array.isArray(value)) {
            value.forEach((v) => {
              if (typeof v === "string") {
                const id = normalize(v, d.id);
                if (id) actions.add(id);
              } else if (
                v &&
                typeof v === "object" &&
                typeof (v as any).action === "string"
              ) {
                const id = normalize((v as any).action, d.id);
                if (id) actions.add(id);
              }
            });
          }
        }

        // ============ DataTypes ============
        // Собираем из ЛЮБОГО ключа dataType — включая linkages[].attributes[]
        if (key === "dataType" && typeof value === "string") {
          const id = normalize(value, d.id);
          if (id) dataTypes.add(id);
        }

        // ============ Sequences ============
        if (key === "sequence" && typeof value === "string") {
          const id = normalize(value, d.id);
          if (id) sequences.add(id);
        }

        // ============ Medias (иконки) ============
        if (
          (key === "icon" || key === "iconName") &&
          typeof value === "string"
        ) {
          const id = normalize(value, d.id);
          if (id) medias.add(id);
        }

        // ============ Views ============
        // Только по явным ключам-ссылкам. НЕ обходим всё подряд,
        // чтобы не собирать определений (views[].id) как ссылки.
        if (VIEW_REF_KEYS.has(key) && typeof value === "string") {
          const id = normalize(value, d.id);
          if (id) views.add(id);
        }

        // Рекурсия
        if (typeof value === "object" && value !== null) {
          walk(value);
        }
      }
    };

    walk(raw);
  }

  return { views, actions, dataTypes, sequences, medias };
}

/**
 * Ищет осиротевшие элементы в доменах.
 * Возвращает готовые списки для отчёта.
 */
export function detectOrphans(domains: RawDomainForOrphans[]): ModelOrphans {
  const usage = collectUsage(domains);

  const orphanViews: ModelOrphans["views"] = [];
  const orphanActions: ModelOrphans["actions"] = [];
  const orphanDataTypes: ModelOrphans["dataTypes"] = [];
  const orphanSequences: ModelOrphans["sequences"] = [];
  const orphanMedias: ModelOrphans["medias"] = [];

  for (const d of domains) {
    const raw = d.rawData || {};

    // Views
    (raw.views || []).forEach((v: any) => {
      if (!v?.id) return;

      // Mixin-views — вызываются через mixins[], не считаем сиротами
      if (v.isMixin === true) return;

      // Top-level entity-view — контейнер для панелей и модалок сущности.
      // Вызывается системой неявно (по entity), никто не ссылается по id.
      if (v.type === "entity") return;

      // dashboard_tree — верхний уровень навигации, вызывается из UI системы
      if (v.type === "dashboard_tree") return;

      const key = (d.id + "/" + v.id).toLowerCase();
      if (!usage.views.has(key)) {
        orphanViews.push({
          domainId: d.id,
          id: String(v.id),
          type: String(v.type || ""),
          entity: v.entity ? String(v.entity) : undefined,
        });
      }
    });

    // Actions
    (raw.actions || []).forEach((a: any) => {
      if (!a?.id) return;
      const key = (d.id + "/" + a.id).toLowerCase();
      if (!usage.actions.has(key)) {
        orphanActions.push({
          domainId: d.id,
          id: String(a.id),
          name: String(a.name || a.id),
          type: String(a.type || ""),
        });
      }
    });

    // DataTypes
    (raw.dataTypes || []).forEach((dt: any) => {
      if (!dt?.id) return;
      const key = (d.id + "/" + dt.id).toLowerCase();
      if (!usage.dataTypes.has(key)) {
        orphanDataTypes.push({
          domainId: d.id,
          id: String(dt.id),
          kind: String(dt.dataType || ""),
          name: String(dt.name || dt.id),
        });
      }
    });

    // Sequences
    (raw.sequences || []).forEach((s: any) => {
      if (!s?.id) return;
      const key = (d.id + "/" + s.id).toLowerCase();
      if (!usage.sequences.has(key)) {
        const n = Number(s.startFrom);
        orphanSequences.push({
          domainId: d.id,
          id: String(s.id),
          startFrom: Number.isFinite(n) && n > 0 ? n : 1,
        });
      }
    });

    // Medias
    (raw.medias || []).forEach((m: any) => {
      if (!m?.id) return;
      const key = (d.id + "/" + m.id).toLowerCase();
      if (!usage.medias.has(key)) {
        orphanMedias.push({
          domainId: d.id,
          id: String(m.id),
          iconName: m.iconName ? String(m.iconName) : undefined,
        });
      }
    });
  }

  // Сортируем для стабильности
  const sortBy = (arr: any[]) =>
    arr.sort((a, b) => {
      if (a.domainId !== b.domainId)
        return a.domainId.localeCompare(b.domainId);
      return a.id.localeCompare(b.id);
    });

  return {
    views: sortBy(orphanViews),
    actions: sortBy(orphanActions),
    dataTypes: sortBy(orphanDataTypes),
    sequences: sortBy(orphanSequences),
    medias: sortBy(orphanMedias),
  };
}
