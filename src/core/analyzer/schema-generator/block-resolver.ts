/**
 * Находит текущий payload блока в сыром YAML по blockId.
 * Нужен для сравнения «сгенерировано ранее» vs «сейчас в YAML».
 *
 * blockId-формат (см. detect/builders):
 *   action:<actionId>
 *   media:<mediaId>
 *   menuItem:<rootGroupId>/<itemId>
 *   view:<viewId>                              — top-level
 *   view:<nestedViewId>  + parentViewId        — nested
 *   widget:<parentViewId>/<widgetId>
 *   group:<parentViewId>/<groupId>
 */
export function findPayloadByBlockId(
  rawData: any,
  blockId: string,
  parentViewId?: string,
): any | null {
  if (!rawData || typeof blockId !== "string") return null;
  const colon = blockId.indexOf(":");
  if (colon < 0) return null;
  const kind = blockId.slice(0, colon);
  const rest = blockId.slice(colon + 1);

  if (kind === "action") {
    return (rawData.actions || []).find((a: any) => a?.id === rest) ?? null;
  }
  if (kind === "media") {
    return (rawData.medias || []).find((m: any) => m?.id === rest) ?? null;
  }
  if (kind === "menuItem") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const rootId = rest.slice(0, slash);
    const itemId = rest.slice(slash + 1);
    const root = (rawData.menus || []).find((m: any) => m?.id === rootId);
    if (!root || !Array.isArray(root.items)) return null;
    return root.items.find((it: any) => it?.id === itemId) ?? null;
  }
  if (kind === "view") {
    if (parentViewId) {
      const parent = (rawData.views || []).find(
        (v: any) => v?.id === parentViewId,
      );
      if (!parent || !Array.isArray(parent.views)) return null;
      return parent.views.find((x: any) => x?.id === rest) ?? null;
    }
    return (rawData.views || []).find((v: any) => v?.id === rest) ?? null;
  }
  if (kind === "widget") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const parentId = rest.slice(0, slash);
    const widgetId = rest.slice(slash + 1);
    const parent = (rawData.views || []).find((v: any) => v?.id === parentId);
    if (!parent || !Array.isArray(parent.widgets)) return null;
    return parent.widgets.find((w: any) => w?.id === widgetId) ?? null;
  }
  if (kind === "group") {
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    const parentId = rest.slice(0, slash);
    const groupId = rest.slice(slash + 1);
    const parent = (rawData.views || []).find((v: any) => v?.id === parentId);
    if (!parent || !Array.isArray(parent.groups)) return null;
    return parent.groups.find((g: any) => g?.id === groupId) ?? null;
  }
  if (kind === "tree") {
    return (rawData.trees || []).find((t: any) => t?.id === rest) ?? null;
  }
  return null;
}

// добавь в конец файла

/**
 * Проверяет, ссылается ли текущий YAML на этот блок:
 *   - widget → actionPanel[].widget, groups[].components[].widget;
 *   - group → groups[].components[].block (для tab — tabs[].tab);
 *   - view  → menus[].items[].view, actions[].modal/panel/pageView/view,
 *             tabs[].tab, menu[].action, footer[].action.
 *
 * Нужен для auto-restore orphaned: если на orphaned-блок есть живая
 * ссылка — это broken reference, восстановить без явной галки.
 */
export function isBlockReferencedInYaml(
    rawData: any,
    blockId: string,
    parentViewId?: string,
): boolean {
    if (!rawData) return false;
    const colon = blockId.indexOf(":");
    if (colon < 0) return false;
    const kind = blockId.slice(0, colon);
    const rest = blockId.slice(colon + 1);

    if (kind === "widget") {
        const slash = rest.indexOf("/");
        const widgetId = slash >= 0 ? rest.slice(slash + 1) : rest;
        return hasWidgetReference(rawData, widgetId);
    }
    if (kind === "group") {
        const slash = rest.indexOf("/");
        const groupId = slash >= 0 ? rest.slice(slash + 1) : rest;
        return hasGroupReference(rawData, groupId);
    }
    if (kind === "view") {
        return hasNestedViewReference(rawData, rest);
    }
    return false;
}

function walkViews(node: any, visit: (n: any) => boolean): boolean {
    if (!node || typeof node !== "object") return false;
    if (visit(node)) return true;
    if (Array.isArray(node.views)) {
        for (const nv of node.views) {
            if (walkViews(nv, visit)) return true;
        }
    }
    return false;
}

function hasWidgetReference(rawData: any, widgetId: string): boolean {
    if (!Array.isArray(rawData.views)) return false;
    for (const v of rawData.views) {
        if (
            walkViews(v, (n) => {
                if (Array.isArray(n.actionPanel)) {
                    for (const ap of n.actionPanel) {
                        if (ap?.widget === widgetId) return true;
                    }
                }
                if (Array.isArray(n.groups)) {
                    for (const g of n.groups) {
                        if (!Array.isArray(g?.components)) continue;
                        for (const c of g.components) {
                            if (c?.widget === widgetId) return true;
                        }
                    }
                }
                return false;
            })
        ) {
            return true;
        }
    }
    return false;
}

function hasGroupReference(rawData: any, groupId: string): boolean {
    if (!Array.isArray(rawData.views)) return false;
    for (const v of rawData.views) {
        if (
            walkViews(v, (n) => {
                if (Array.isArray(n.groups)) {
                    for (const g of n.groups) {
                        if (!Array.isArray(g?.components)) continue;
                        for (const c of g.components) {
                            if (c?.block === groupId) return true;
                        }
                    }
                }
                // tabs[].tab может ссылаться на группу type: tab
                if (Array.isArray(n.tabs)) {
                    for (const t of n.tabs) {
                        if (t?.tab === groupId) return true;
                    }
                }
                // views[].block может ссылаться на группу type: block
                if (n.block === groupId) return true;
                return false;
            })
        ) {
            return true;
        }
    }
    return false;
}

function hasNestedViewReference(rawData: any, viewId: string): boolean {
    if (Array.isArray(rawData.menus)) {
        for (const m of rawData.menus) {
            if (m?.view === viewId) return true;
            if (Array.isArray(m?.items)) {
                for (const it of m.items) {
                    if (it?.view === viewId) return true;
                }
            }
        }
    }
    if (Array.isArray(rawData.actions)) {
        for (const a of rawData.actions) {
            if (
                a?.view === viewId ||
                a?.modal === viewId ||
                a?.panel === viewId ||
                a?.pageView === viewId
            ) {
                return true;
            }
        }
    }
    if (!Array.isArray(rawData.views)) return false;
    for (const v of rawData.views) {
        if (
            walkViews(v, (n) => {
                if (Array.isArray(n.tabs)) {
                    for (const t of n.tabs) {
                        if (t?.tab === viewId) return true;
                    }
                }
                if (Array.isArray(n.menu)) {
                    for (const m of n.menu) {
                        if (m?.action === viewId) return true;
                    }
                }
                if (Array.isArray(n.footer)) {
                    for (const f of n.footer) {
                        if (f?.action === viewId) return true;
                    }
                }
                if (n.block === viewId) return true;
                return false;
            })
        ) {
            return true;
        }
    }
    return false;
}