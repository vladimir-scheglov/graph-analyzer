import type { EntityRecord, ModelIndex } from "../../../shared/model-types";

// ─── Типы и хелперы ────────────────────────────────────────────────

type Severity = "error" | "warning" | "info";

interface EmitFn {
  (msg: string, line: number, code: string, severity: Severity): void;
}

interface TopSection {
  startIdx: number; // 0-based, line with `key:`
  endIdx: number; // 0-based, exclusive
}

interface Item {
  id: string;
  startIdx: number; // 0-based, `- id:` line
  endIdx: number; // 0-based, exclusive
  dashIndent: number;
  fields: Map<string, { value: string; lineIdx: number }>;
}

const SYSTEM_ATTRS = new Set([
  "id",
  "label",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "organizationId",
  "domainId",
  "entityId",
  "tenantId",
  "version",
]);

function findTopSection(lines: string[], key: string): TopSection | null {
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([a-zA-Z_][\w]*)\s*:/);
    if (m && m[1] === key) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (/^[a-zA-Z_]/.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  return { startIdx, endIdx };
}

function unquote(raw: string): string {
  let v = raw.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

function collectItems(
  lines: string[],
  sec: TopSection,
  startIdx?: number,
  endIdx?: number,
): Item[] {
  const from = startIdx ?? sec.startIdx + 1;
  const to = endIdx ?? sec.endIdx;
  const items: Item[] = [];
  let dashIndent = -1;
  let current: Item | null = null;

  const close = (end: number) => {
    if (current) {
      current.endIdx = end;
      items.push(current);
      current = null;
    }
  };

  for (let i = from; i < to; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^(\s*)-\s+id\s*:\s*["']?([^\s"'#]+)["']?/);
    if (m) {
      if (dashIndent < 0) dashIndent = m[1].length;
      if (m[1].length === dashIndent) {
        close(i);
        current = {
          id: m[2],
          startIdx: i,
          endIdx: to,
          dashIndent,
          fields: new Map(),
        };
        continue;
      }
    }
    if (!current) continue;
    const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
    if (ind === current.dashIndent + 2) {
      const fm = line.match(/^\s*([a-zA-Z_][\w]*)\s*:\s*(.*?)\s*(?:#.*)?$/);
      if (fm) {
        const field = fm[1];
        if (!current.fields.has(field)) {
          current.fields.set(field, { value: unquote(fm[2]), lineIdx: i });
        }
      }
    }
  }
  close(to);
  return items;
}

function findContainerIdx(lines: string[], item: Item, key: string): number {
  const fieldIndent = item.dashIndent + 2;
  for (let i = item.startIdx; i < item.endIdx; i++) {
    const ind = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
    if (ind !== fieldIndent) continue;
    if (new RegExp(`^(?:-\\s+)?${key}\\s*:`).test(lines[i].trim())) return i;
  }
  return -1;
}

function collectNestedItems(
  lines: string[],
  parent: Item,
  container: string,
): Item[] {
  const containerIdx = findContainerIdx(lines, parent, container);
  if (containerIdx < 0) return [];
  const fieldIndent = parent.dashIndent + 2;
  return collectItems(
    lines,
    { startIdx: containerIdx, endIdx: parent.endIdx },
    containerIdx + 1,
    parent.endIdx,
  );
}

// ─── Проверки по атрибутам ────────────────────────────────────────

function checkAttribute(_lines: string[], attr: Item, emit: EmitFn): void {
  const dataType = attr.fields.get("dataType")?.value;
  const entity = attr.fields.get("entity");
  const seq = attr.fields.get("sequence");
  const tmpl = attr.fields.get("template");
  const defPrefix = attr.fields.get("defaultPrefix");
  const hasPrefixRules = attr.fields.has("prefixRules");

  // 1. Reference без entity
  if (dataType === "Reference" && !entity) {
    emit(
      `dataType: Reference требует поле entity: (на какую сущность указывает)`,
      attr.startIdx + 1,
      "attribute/reference-without-entity",
      "warning",
    );
  }

  // 2. Identifier — sequence и template взаимоисключающие
  if (dataType === "Identifier" && seq && tmpl) {
    emit(
      `dataType: Identifier — поля sequence: и template: взаимоисключающие`,
      tmpl.lineIdx + 1,
      "attribute/identifier-conflict",
      "error",
    );
  }

  if (!tmpl) return;
  const t = tmpl.value;

  // 3. template без {@inc}
  if (dataType === "Identifier" && !t.includes("{@inc}")) {
    emit(
      `template: не содержит {@inc} — обязателен для Identifier`,
      tmpl.lineIdx + 1,
      "attribute/template-missing-inc",
      "error",
    );
  }

  // 4. Повторяющиеся литералы даты
  for (const tok of ["{@YYYY}", "{@YY}", "{@MM}", "{@DD}"]) {
    const c = t.split(tok).length - 1;
    if (c > 1) {
      emit(
        `В template ${tok} встречается ${c} раз — литералы даты обычно не повторяются`,
        tmpl.lineIdx + 1,
        "attribute/template-duplicate-date",
        "warning",
      );
    }
  }

  // 5. {@prefix} без defaultPrefix / prefixRules
  if (t.includes("{@prefix}") && !defPrefix && !hasPrefixRules) {
    emit(
      `template: содержит {@prefix}, но нет defaultPrefix: и нет prefixRules: — префикс будет пустым`,
      tmpl.lineIdx + 1,
      "attribute/prefix-not-configured",
      "warning",
    );
  }

  // 6. defaultPrefix без {@prefix}
  if (defPrefix && defPrefix.value && !t.includes("{@prefix}")) {
    emit(
      `defaultPrefix: задан, но в template нет {@prefix} — значение не используется`,
      defPrefix.lineIdx + 1,
      "attribute/prefix-not-used",
      "warning",
    );
  }
}

function checkAllAttributes(lines: string[], emit: EmitFn): void {
  const sec = findTopSection(lines, "entities");
  if (!sec) return;
  const entities = collectItems(lines, sec);
  for (const entity of entities) {
    const attrs = collectNestedItems(lines, entity, "attributes");
    for (const attr of attrs) checkAttribute(lines, attr, emit);
  }
}

// ─── Linkages ──────────────────────────────────────────────────────

function checkLinkages(lines: string[], emit: EmitFn): void {
  const sec = findTopSection(lines, "linkages");
  if (!sec) return;
  const linkages = collectItems(lines, sec);
  for (const lk of linkages) {
    const useForSearch = lk.fields.get("useForSearch")?.value === "true";
    const excludeOnGraph = lk.fields.get("excludeOnGraph")?.value;

    if (!useForSearch) {
      // ищем searchable: true у attributes
      const attrs = collectNestedItems(lines, lk, "attributes");
      for (const a of attrs) {
        const searchable = a.fields.get("searchable");
        if (searchable && searchable.value === "true") {
          emit(
            `searchable: true у атрибута «${a.id}», но useForSearch: false у связи — searchable игнорируется`,
            searchable.lineIdx + 1,
            "linkage/searchable-ignored",
            "warning",
          );
        }
      }
    }

    if (excludeOnGraph === "off") {
      emit(
        `excludeOnGraph: off — связь невидима на графе, пока не настроен фильтр`,
        lk.fields.get("excludeOnGraph")!.lineIdx + 1,
        "linkage/exclude-on-graph-off",
        "info",
      );
    }
  }
}

// ─── Actions ───────────────────────────────────────────────────────

function checkActions(
  lines: string[],
  emit: EmitFn,
  index: ModelIndex | null,
  domainId: string,
): void {
  const sec = findTopSection(lines, "actions");
  if (!sec) return;
  const actions = collectItems(lines, sec);

  for (const a of actions) {
    const type = a.fields.get("type")?.value;
    const operation = a.fields.get("operation");
    const view = a.fields.get("view");
    const pageView = a.fields.get("pageView");
    const entity = a.fields.get("entity");

    if (
      type === "open_page" &&
      operation?.value === "create" &&
      !view &&
      !pageView
    ) {
      emit(
        `open_page с operation: create требует view: (или pageView:)`,
        operation.lineIdx + 1,
        "action/open-page-create-without-view",
        "error",
      );
    }

    if (type === "open_list") {
      const hasAttr = a.fields.has("attribute");
      const hasLinkage = a.fields.has("linkage");
      const hasJoin = a.fields.has("join");
      const hasWidget = a.fields.has("widgetId");
      const hasPin = a.fields.has("contextPin");
      if (!hasAttr && !hasLinkage && !hasJoin && !hasWidget && !hasPin) {
        emit(
          `open_list без attribute / linkage / join / widgetId / contextPin открывает список без контекста`,
          a.startIdx + 1,
          "action/open-list-without-context",
          "info",
        );
      }
      if (hasAttr && hasLinkage) {
        emit(
          `open_list: attribute: и linkage: взаимоисключающие`,
          a.fields.get("linkage")!.lineIdx + 1,
          "action/open-list-attr-linkage-conflict",
          "error",
        );
      }
    }

    if (type === "bulk") {
      if (operation?.value === "edit") {
        if (!a.fields.has("attributes") && !a.fields.has("linkages")) {
          emit(
            `bulk с operation: edit требует attributes: или linkages:`,
            operation.lineIdx + 1,
            "action/bulk-edit-without-target",
            "warning",
          );
        }
      }
      if (operation?.value === "edit_attribute") {
        if (!a.fields.has("values")) {
          emit(
            `bulk с operation: edit_attribute требует values: с полями attribute + value`,
            operation.lineIdx + 1,
            "action/bulk-edit-attr-without-values",
            "error",
          );
        }
        // проверка типа атрибута через index
        if (entity && index) {
          const fqid = entity.value.includes("/")
            ? entity.value.toLowerCase()
            : `${domainId}/${entity.value}`.toLowerCase();
          const entityRec = index.entitiesByFqid[fqid];
          if (entityRec) {
            for (let i = a.startIdx; i < a.endIdx; i++) {
              const m = lines[i].match(
                /^\s*-\s+attribute\s*:\s*["']?([^\s"'#]+)["']?/,
              );
              if (!m) continue;
              const attrId = m[1];
              const attr = entityRec.attributes.find(
                (x: any) => x.id === attrId,
              );
              if (!attr) continue;
              const isBool = attr.dataType === "Bool";
              const isWorkflow =
                attr.dataTypeKind === "custom" &&
                index.dataTypes?.some(
                  (d: any) =>
                    d.domainId === domainId &&
                    d.id === attr.dataType &&
                    d.kind === "Workflow",
                );
              if (!isBool && !isWorkflow) {
                emit(
                  `operation: edit_attribute поддерживает только Bool или Workflow. Атрибут «${attrId}» — ${attr.dataType}`,
                  i + 1,
                  "action/bulk-edit-attr-wrong-type",
                  "warning",
                );
              }
            }
          }
        }
      }
    }
  }
}

// ─── DataRules ─────────────────────────────────────────────────────

function checkDataRules(lines: string[], emit: EmitFn): void {
  const sec = findTopSection(lines, "dataRules");
  if (!sec) return;
  const rules = collectItems(lines, sec);

  for (const rule of rules) {
    const target = rule.fields.get("target")?.value;

    const nestedIdx = findContainerIdx(lines, rule, "nested");
    if (target === "entityAttribute" && nestedIdx < 0) {
      emit(
        `target: entityAttribute требует nested: (type: table или type: array)`,
        rule.startIdx + 1,
        "datarule/entityAttribute-without-nested",
        "error",
      );
      continue;
    }
    if (nestedIdx < 0) continue;

    const nestedIndent = (lines[nestedIdx].match(/^(\s*)/) || ["", ""])[1]
      .length;
    let nestedType = "";
    let hasItems = false;
    let hasAttributes = false;
    for (let i = nestedIdx + 1; i < rule.endIdx; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (ind <= nestedIndent) break;
      const m = line.match(/^\s*([a-zA-Z_][\w]*)\s*:\s*(.*?)\s*(?:#.*)?$/);
      if (!m) continue;
      if (m[1] === "type" && ind === nestedIndent + 2)
        nestedType = unquote(m[2]);
      if (m[1] === "items") hasItems = true;
      if (m[1] === "attributes") hasAttributes = true;
    }

    if (nestedType === "array" && !hasItems) {
      emit(
        `nested.type: array требует nested.items: (индексы или '*')`,
        nestedIdx + 1,
        "datarule/nested-array-without-items",
        "error",
      );
    }
    if (nestedType === "table" && !hasAttributes) {
      emit(
        `nested.type: table требует nested.attributes: (колонки таблицы)`,
        nestedIdx + 1,
        "datarule/nested-table-without-attributes",
        "error",
      );
    }
  }
}

function checkDataRuleConflicts(
  lines: string[],
  emit: EmitFn,
  domainId: string,
): void {
  const sec = findTopSection(lines, "dataRules");
  if (!sec) return;
  const rules = collectItems(lines, sec);

  interface Entry {
    hidden?: number;
    readonly?: number;
    required?: number;
  }
  const map = new Map<string, Entry>();

  for (const rule of rules) {
    const entity = rule.fields.get("entity")?.value;
    const effect = rule.fields.get("effect")?.value;
    if (!entity || !effect) continue;
    const fqid = entity.includes("/")
      ? entity.toLowerCase()
      : `${domainId}/${entity}`.toLowerCase();

    // в rule.attributes[] (block `rule:` → `attributes:`)
    const ruleIdx = findContainerIdx(lines, rule, "rule");
    if (ruleIdx < 0) continue;
    const attrsContainerIdx = (() => {
      for (let i = ruleIdx + 1; i < rule.endIdx; i++) {
        const ind = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
        if (ind <= (lines[ruleIdx].match(/^(\s*)/) || ["", ""])[1].length)
          break;
        if (/^\s*attributes\s*:/.test(lines[i])) return i;
      }
      return -1;
    })();
    if (attrsContainerIdx < 0) continue;

    for (let i = attrsContainerIdx + 1; i < rule.endIdx; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
      if (
        ind <= (lines[attrsContainerIdx].match(/^(\s*)/) || ["", ""])[1].length
      )
        break;
      const m = line.match(/^\s*-\s+attribute\s*:\s*["']?([^\s"'#]+)["']?/);
      if (!m) continue;
      const key = `${fqid}#${m[1]}`;
      let e = map.get(key);
      if (!e) {
        e = {};
        map.set(key, e);
      }
      if (effect === "hidden") e.hidden = i + 1;
      else if (effect === "readonly") e.readonly = i + 1;
      else if (effect === "required") e.required = i + 1;
    }
  }

  for (const [, e] of map) {
    if (e.hidden && e.readonly) {
      emit(
        `⚠ Циклическая зависимость: атрибут одновременно hidden и readonly в разных правилах`,
        e.hidden,
        "datarule/conflict-hidden-readonly",
        "warning",
      );
    }
    if (e.hidden && e.required) {
      emit(
        `⚠ Конфликт: атрибут required и hidden одновременно — объект нельзя будет создать`,
        e.required,
        "datarule/conflict-required-hidden",
        "error",
      );
    }
  }
}

// ─── Workflows ─────────────────────────────────────────────────────

function checkWorkflows(lines: string[], emit: EmitFn): void {
  const sec = findTopSection(lines, "dataTypes");
  if (!sec) return;
  const dts = collectItems(lines, sec);

  for (const dt of dts) {
    if (dt.fields.get("dataType")?.value !== "Workflow") continue;

    // statuses
    const statusesIdx = findContainerIdx(lines, dt, "statuses");
    const statuses = new Set<string>();
    if (statusesIdx >= 0) {
      const si = (lines[statusesIdx].match(/^(\s*)/) || ["", ""])[1].length;
      for (let i = statusesIdx + 1; i < dt.endIdx; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (ind <= si) break;
        const m = line.match(/^\s*-\s+id\s*:\s*["']?([^\s"'#]+)["']?/);
        if (m) statuses.add(m[1]);
      }
    }

    const initial = dt.fields.get("initial");
    if (initial?.value) {
      if (!statuses.has(initial.value)) {
        emit(
          `initial: «${initial.value}» не найден в statuses[]`,
          initial.lineIdx + 1,
          "datatype/workflow-initial-unknown",
          "error",
        );
      } else {
        // transitions из initial
        const trIdx = findContainerIdx(lines, dt, "transitions");
        if (trIdx >= 0) {
          const ti = (lines[trIdx].match(/^(\s*)/) || ["", ""])[1].length;
          let hasFromInitial = false;
          for (let i = trIdx + 1; i < dt.endIdx; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
            if (ind <= ti) break;
            const m = line.match(
              /^\s*(?:-\s+)?from\s*:\s*["']?([^\s"'#]+)["']?/,
            );
            if (m && (m[1] === initial.value || m[1] === "*")) {
              hasFromInitial = true;
              break;
            }
          }
          if (!hasFromInitial) {
            emit(
              `Нет transition из initial «${initial.value}» — статус нельзя покинуть`,
              initial.lineIdx + 1,
              "datatype/workflow-initial-stuck",
              "warning",
            );
          }
        }
      }
    }
  }
}

// ─── Menus ─────────────────────────────────────────────────────────

function checkMenus(lines: string[], emit: EmitFn): void {
  const sec = findTopSection(lines, "menus");
  if (!sec) return;
  const menus = collectItems(lines, sec);

  for (const menu of menus) {
    const priority = menu.fields.get("priority");
    const type = menu.fields.get("type")?.value;

    if (priority) {
      const p = parseInt(priority.value, 10);
      if (!isNaN(p) && p < 1000) {
        emit(
          `priority: ${p} — должно быть ≥ 1000`,
          priority.lineIdx + 1,
          "menu/priority-too-low",
          "warning",
        );
      }
    }

    if (type === "root_menu" && menu.fields.has("items")) {
      emit(
        `items: у root_menu игнорируется (используйте root_group)`,
        menu.fields.get("items")!.lineIdx + 1,
        "menu/root-menu-with-items",
        "warning",
      );
    }
  }

  // Дубликаты route
  const routeLines = new Map<string, number[]>();
  for (let i = sec.startIdx; i < sec.endIdx; i++) {
    const m = lines[i].match(/^\s*(?:-\s+)?route\s*:\s*["']?([^\s"'#]+)["']?/);
    if (!m) continue;
    if (!routeLines.has(m[1])) routeLines.set(m[1], []);
    routeLines.get(m[1])!.push(i + 1);
  }
  for (const [route, ls] of routeLines) {
    if (ls.length < 2) continue;
    for (const ln of ls) {
      emit(
        `Route «${route}» дублируется (строки ${ls.join(", ")})`,
        ln,
        "menu/route-duplicate",
        "error",
      );
    }
  }
}

// ─── Label {attr} ──────────────────────────────────────────────────

function checkLabels(
  lines: string[],
  emit: EmitFn,
  index: ModelIndex | null,
  domainId: string,
): void {
  const sec = findTopSection(lines, "entities");
  if (!sec) return;
  const entities = collectItems(lines, sec);

  for (const entity of entities) {
    const label = entity.fields.get("label");
    if (!label) continue;

    const attrIds = new Set<string>(SYSTEM_ATTRS);
    collectNestedItems(lines, entity, "attributes").forEach((a) =>
      attrIds.add(a.id),
    );

    if (index) {
      const fqid = `${domainId}/${entity.id}`.toLowerCase();
      let e: EntityRecord | undefined = index.entitiesByFqid[fqid];
      const seen = new Set<string>();
      while (e && !seen.has(e.fqid)) {
        seen.add(e.fqid);
        for (const a of e.attributes) attrIds.add(a.id);
        e = e.inherits ? index.entitiesByFqid[e.inherits] : undefined;
      }
    }

    const re = /\{([a-zA-Z_][\w]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(label.value)) !== null) {
      if (!attrIds.has(m[1])) {
        emit(
          `label: ссылается на неизвестный атрибут «${m[1]}»`,
          label.lineIdx + 1,
          "entity/label-unknown-attribute",
          "warning",
        );
      }
    }
  }
}

// ─── Публичная функция ─────────────────────────────────────────────

export function applySemanticValidators(
  monaco: any,
  model: any,
  lines: string[],
  index: ModelIndex | null,
  domainId: string,
): void {
  const markers: any[] = [];
  const sevMap = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
  };

  const emit: EmitFn = (msg, line, code, severity) => {
    if (!line || line < 1 || line > lines.length) return;
    markers.push({
      severity: sevMap[severity],
      message: msg,
      startLineNumber: line,
      startColumn: 1,
      endLineNumber: line,
      endColumn: 1_000_000,
      source: "semantic-validator",
      code,
    });
  };

  try {
    checkAllAttributes(lines, emit);
  } catch (e) {
    console.warn("[sem/attr]", e);
  }
  try {
    checkLinkages(lines, emit);
  } catch (e) {
    console.warn("[sem/link]", e);
  }
  try {
    checkActions(lines, emit, index, domainId);
  } catch (e) {
    console.warn("[sem/act]", e);
  }
  try {
    checkDataRules(lines, emit);
  } catch (e) {
    console.warn("[sem/dr]", e);
  }
  try {
    checkDataRuleConflicts(lines, emit, domainId);
  } catch (e) {
    console.warn("[sem/drc]", e);
  }
  try {
    checkWorkflows(lines, emit);
  } catch (e) {
    console.warn("[sem/wf]", e);
  }
  try {
    checkMenus(lines, emit);
  } catch (e) {
    console.warn("[sem/menu]", e);
  }
  try {
    checkLabels(lines, emit, index, domainId);
  } catch (e) {
    console.warn("[sem/lbl]", e);
  }

  monaco.editor.setModelMarkers(model, "semantic-validator", markers);
}
