import type {
  ModelIndex,
  EntityRecord,
  AttributeRecord,
  UiRuleRecord,
  EntityIdentificationRule,
  DataRuleRecord,
  EntityLinkage,
  TreeRecord,
  TreeHierarchyChild,
  TransitiveLinkageRecord,
  TransitiveLinkageJoin,
  MenuRecord,
  MediaRecord,
  PermissionRecord,
  AccessRuleRecord,
  AccessRuleItem,
  AccessRuleException,
  LocalizationRecord,
  ViewActionPanelRecord,
  ViewGroupRecord,
  ViewWidgetRecord,
} from "../../shared/model-types";
import type {
  LintIssue,
  LintReport,
  LintSeverity,
  LintRuleCategory,
  SonarScore,
  DomainSonarScores,
} from "../../shared/lint-types";
import { checkRqlExpression } from "./rql-check";

// ============ Правила именования ============

const RE_ENTITY_ID = /^[A-Z][a-zA-Z0-9]*$/; // CamelCase
const RE_ATTRIBUTE_ID = /^[a-z][a-zA-Z0-9]*$/; // camelCase
const RE_DATA_TYPE_ID = /^[A-Z][a-zA-Z0-9]*$/;
const RE_VIEW_ID = /^[a-z][a-zA-Z0-9_:#@$.]*$/;
const RE_ENUM_VALUE_ID = /^[a-z][a-z0-9_]*$/;

const MAX_ENTITY_ID_LEN = 30;
const MAX_ATTRIBUTE_ID_LEN = 30;
const MAX_DATA_TYPE_ID_LEN = 63;
const MAX_VIEW_ID_LEN = 63;

// ============ Эвристики PII/валидации ============

const EMAIL_PATTERN = /\b(e?mail|emailaddress)\b/i;
const IP_PATTERN = /\b(ip|ipaddr|ipaddress|ipv4|ipv6|host)\b/i;
const PHONE_PATTERN = /\b(phone|mobile|tel|telephone)\b/i;
const URL_PATTERN = /\b(url|website|link|href)\b/i;
const DATE_PATTERN =
  /\b(date|birthdate|createdat|updatedat|expiresat|startedat)\b/i;
const MAC_PATTERN = /\bmac(address)?\b/i;

const SYSTEM_ATTRIBUTE_IDS = new Set([
  "id",
  "label",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "organizationId",
  "tenantId",
  "domainId",
  "entityId",
  "entityName",
  "version",
]);

// ============ Action enums ============

const KNOWN_ACTION_TYPES = new Set<string>([
  "open_panel",
  "open_modal",
  "open_page",
  "open_graph_view",
  "open_board_view",
  "open_list",
  "open_tree",
  "open_view",
  "remove",
  "bulk",
  "tree_bulk",
  "set_attribute_value",
  "automation",
  "scenario",
  "generate_qr_code",
  "copy_entity_link",
  "open_external_widget_modal",
  "workflow",
]);

const ACTION_OPERATIONS_BY_TYPE: Record<string, Set<string>> = {
  open_modal: new Set(["create", "edit"]),
  open_page: new Set(["create", "edit", "view"]),
  bulk: new Set(["remove", "edit", "edit_attribute", "import", "export"]),
  tree_bulk: new Set(["edit", "remove"]),
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Типы системных атрибутов — используются, когда линтер «находит» системный атрибут. */
const SYSTEM_ATTRIBUTE_TYPES: Record<string, string> = {
  id: "Uuid",
  label: "String",
  createdAt: "Timestamp",
  updatedAt: "Timestamp",
  createdBy: "Reference",
  updatedBy: "Reference",
  organizationId: "Reference",
  tenantId: "Reference",
  domainId: "String",
  entityId: "String",
  entityName: "String",
  version: "Integer",
};

const IDENTIFIER_KNOWN_SEGMENTS = new Set([
  "@inc",
  "@prefix",
  "@YYYY",
  "@YY",
  "@MM",
  "@DD",
]);

// ============ View enums (PR 6) ============

const VIEW_TOP_TYPES = new Set<string>([
  "entity",
  "list",
  "tree",
  "tabs_list",
  "dashboard",
  "dashboard_tree",
]);

const VIEW_NESTED_TYPES = new Set<string>(["panel", "modal", "page"]);

const VIEW_GROUP_TYPES = new Set<string>([
  "block",
  "form",
  "tab",
  "tabs",
  "resizable_block_pair",
]);

const VIEW_WIDGET_TYPES = new Set<string>([
  "attribute",
  "action",
  "linkage",
  "linkage_list",
  "linked_objects_groups",
  "join",
  "history",
  "runs_history",
  "comments",
  "conversation",
  "visualization",
  "diagram",
  "calculation",
  "template_editor",
  "addressBook",
]);

const VIEW_CONTROL_TYPES = new Set<string>([
  // attribute-control
  "uuid",
  "text",
  "text_area",
  "date",
  "time",
  "timestamp",
  "timestamp_range",
  "integer",
  "decimal",
  "float",
  "integer_slider",
  "decimal_slider",
  "float_slider",
  "bool_text",
  "checkbox",
  "switch",
  "select",
  "level",
  "radio",
  "multi_select",
  "mitre_multi_select",
  "tag_list",
  "tag",
  "ip",
  "mac",
  "cidr",
  "file",
  "link",
  "url",
  "counter",
  "tree_path",
  "drag_drop_area",
  "rql",
  "external",
  // linkage-control
  "table",
  "list",
  "tree",
  // action-control
  "regular_button",
  "dropdown",
]);

/**
 * true, если ancestorFqid === descendantFqid или ancestorFqid — предок
 * descendantFqid. Симметричности НЕТ — это ключевое отличие от
 * предыдущей реализации.
 */
function isSameOrAncestor(
  ctx: LintContext,
  ancestorFqid: string,
  descendantFqid: string,
): boolean {
  if (!ancestorFqid || !descendantFqid) return false;
  if (ancestorFqid === descendantFqid) return true;
  const seen = new Set<string>();
  let cur: string | undefined = descendantFqid;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const e = ctx.index.entitiesByFqid[cur];
    if (!e || !e.inherits) return false;
    if (e.inherits === ancestorFqid) return true;
    cur = e.inherits;
  }
  return false;
}

/**
 * Ищет AttributeRecord в сущности с учётом наследования.
 * Используется там, где нужен сам record (dataType, constraints), а не факт наличия.
 *
 * Системные атрибуты (id, label, createdAt, …) в YAML не описываются,
 * но доступны на любой сущности. Для них возвращается «синтетический» record,
 * чтобы правила данных, деревья, сортировки и т.д. не давали ложных
 * `attribute-unknown`.
 */
function findAttributeWithInheritance(
  ctx: LintContext,
  entityFqid: string,
  attributeId: string,
): AttributeRecord | null {
  if (SYSTEM_ATTRIBUTE_IDS.has(attributeId)) {
    return {
      id: attributeId,
      entityFqid,
      name: attributeId,
      description: "",
      dataType: SYSTEM_ATTRIBUTE_TYPES[attributeId] || "String",
      dataTypeKind: "base",
      constraints: [],
      usedInViews: 0,
      usedInRules: 0,
    };
  }

  const seen = new Set<string>();
  let cur: EntityRecord | undefined = ctx.index.entitiesByFqid[entityFqid];
  while (cur && !seen.has(cur.fqid)) {
    seen.add(cur.fqid);
    const hit = cur.attributes.find((a) => a.id === attributeId);
    if (hit) return hit;
    cur = cur.inherits ? ctx.index.entitiesByFqid[cur.inherits] : undefined;
  }
  return null;
}

function findAncestorAndOwnAttributes(
  ctx: LintContext,
  e: EntityRecord,
): Set<string> {
  const ids = new Set<string>();
  const seen = new Set<string>();
  let cur: EntityRecord | undefined = e;
  while (cur && !seen.has(cur.fqid)) {
    seen.add(cur.fqid);
    cur.attributes.forEach((a) => ids.add(a.id));
    cur = cur.inherits ? ctx.index.entitiesByFqid[cur.inherits] : undefined;
  }
  return ids;
}

// ============ System ID ============
function checkSystemIdUsage(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (SYSTEM_ATTRIBUTE_IDS.has(a.id)) {
    emit(ctx, {
      ruleId: "naming/system-id-attribute",
      severity: "error",
      category: "naming",
      rule: "Использование системного ID запрещено",
      message: `атрибут «${e.entityId}.${a.id}» использует системный идентификатор`,
      hint: "Системные атрибуты создаются автоматически и не могут быть переопределены",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

// ============ Identifier ============
function checkIdentifier(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (a.dataType !== "Identifier") return;

  if (!a.template && !a.sequence) {
    emit(ctx, {
      ruleId: "identifier/no-spec",
      severity: "warning",
      category: "semantic",
      rule: "Identifier имеет template или sequence",
      message: `атрибут «${e.entityId}.${a.id}» типа Identifier без template и без sequence`,
      hint: "Укажите template (сегментированный) или sequence (несегментированный)",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  if (a.template) {
    const segments = [...a.template.matchAll(/{(.*?)}/g)].map((m) =>
      m[1].trim(),
    );
    if (!segments.includes("@inc")) {
      emit(ctx, {
        ruleId: "identifier/no-inc",
        severity: "error",
        category: "semantic",
        rule: "Template содержит {@inc}",
        message: `атрибут «${e.entityId}.${a.id}»: в template отсутствует {@inc}`,
        hint: "Литерал {@inc} обязателен в любом шаблоне Identifier",
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: a.id,
      });
    }
    segments.forEach((s) => {
      if (!IDENTIFIER_KNOWN_SEGMENTS.has(s)) {
        emit(ctx, {
          ruleId: "identifier/unknown-segment",
          severity: "error",
          category: "semantic",
          rule: "Template использует только известные литералы",
          message: `атрибут «${e.entityId}.${a.id}»: неизвестный литерал ${s}`,
          hint: "Допустимы: @inc, @prefix, @YYYY, @YY, @MM, @DD",
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
        });
      }
    });
    if (segments.includes("@prefix") && !a.defaultPrefix) {
      emit(ctx, {
        ruleId: "identifier/prefix-no-default",
        severity: "error",
        category: "semantic",
        rule: "При {@prefix} задан defaultPrefix",
        message: `атрибут «${e.entityId}.${a.id}»: {@prefix} в template, но defaultPrefix пуст`,
        hint: "Заполните defaultPrefix или уберите {@prefix} из template",
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: a.id,
      });
    }
    if (a.sequence) {
      emit(ctx, {
        ruleId: "identifier/template-and-sequence",
        severity: "warning",
        category: "semantic",
        rule: "template несовместим с sequence",
        message: `атрибут «${e.entityId}.${a.id}»: одновременно template и sequence`,
        hint: "Несегментированный идентификатор (sequence) не требует template",
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: a.id,
      });
    }
  }

  if (a.incrementTemplate && !/^0{2,10}$/.test(a.incrementTemplate)) {
    emit(ctx, {
      ruleId: "identifier/bad-increment-template",
      severity: "error",
      category: "semantic",
      rule: "incrementTemplate = 2–10 нулей",
      message: `атрибут «${e.entityId}.${a.id}»: incrementTemplate = "${a.incrementTemplate}"`,
      hint: 'Пример: "0000" (4 нуля)',
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  if (a.segment && a.sequence) {
    emit(ctx, {
      ruleId: "identifier/segment-and-sequence",
      severity: "error",
      category: "semantic",
      rule: "segment и sequence несовместимы",
      message: `атрибут «${e.entityId}.${a.id}»: одновременно segment и sequence`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  if (a.segment && a.segment.length > 0) {
    const KNOWN_SEGMENTS = new Set(["@prefix", "@YYYY", "@YY", "@MM", "@DD"]);
    const normalize = (s: string): string => {
      const t = String(s || "").trim();
      if (!t) return "";
      return t.startsWith("@") ? t : "@" + t;
    };
    const order = ["@prefix", "@YYYY", "@YY", "@MM", "@DD"];
    const normalized = a.segment.map(normalize).filter(Boolean);

    for (const seg of normalized) {
      if (!KNOWN_SEGMENTS.has(seg)) {
        emit(ctx, {
          ruleId: "identifier/unknown-segment-token",
          severity: "error",
          category: "semantic",
          rule: "segment использует только @prefix/@YYYY/@YY/@MM/@DD",
          message: `атрибут «${e.entityId}.${a.id}»: неизвестный сегмент «${seg}»`,
          hint: "Допустимы: @prefix, @YYYY, @YY, @MM, @DD (можно без @)",
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
        });
      }
    }

    const idxs = normalized.map((s) => order.indexOf(s)).filter((i) => i >= 0);
    const sorted = [...idxs].sort((x, y) => x - y);
    if (idxs.join(",") !== sorted.join(",")) {
      emit(ctx, {
        ruleId: "identifier/bad-segment-order",
        severity: "warning",
        category: "semantic",
        rule: "segment в каноничном порядке",
        message: `атрибут «${e.entityId}.${a.id}»: segment не в порядке @prefix → YYYY → MM → DD`,
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: a.id,
      });
    }
  }

  // prefixRules
  // prefixRules
  if (a.prefixRules && a.prefixRules.length > 0) {
    for (const r of a.prefixRules) {
      // ============ attribute — резолвим как обычную ссылку ============
      if (r.attribute) {
        const res = resolveAttributeRef(ctx, e, r.attribute);
        if (!res.ok) {
          emit(ctx, {
            ruleId: "identifier/prefix-attribute-unknown",
            severity: "warning",
            category: "semantic",
            rule: "prefixRules[].attribute существует",
            message: `атрибут «${e.entityId}.${a.id}»: prefixRules[${r.id}].attribute = "${r.attribute}" — ${res.reason}`,
            domainId: e.domainId,
            entityFqid: e.fqid,
            attributeId: a.id,
          });
        }
      }

      // ============ source.entity — сущность-справочник ============
      const srcEntity = ctx.index.entitiesByFqid[r.source.entity];
      if (!srcEntity) {
        emit(ctx, {
          ruleId: "identifier/prefix-source-entity-unknown",
          severity: "error",
          category: "semantic",
          rule: "prefixRules[].source.entity существует",
          message: `атрибут «${e.entityId}.${a.id}»: source.entity = "${r.source.entity}" не найден в индексе`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: a.id,
        });
      } else {
        // ============ source.key / source.value — локальные атрибуты справочника ============
        // Здесь НЕТ нотации "Entity.attr" — источник задан явно через source.entity,
        // поэтому ищем только по прямой id.
        const srcAttrs = new Set(srcEntity.attributes.map((x) => x.id));
        if (r.source.key && !srcAttrs.has(r.source.key)) {
          emit(ctx, {
            ruleId: "identifier/prefix-source-key-unknown",
            severity: "warning",
            category: "semantic",
            rule: "prefixRules[].source.key существует в сущности-справочнике",
            message: `атрибут «${e.entityId}.${a.id}»: source.key = "${r.source.key}" не найден в ${r.source.entity}`,
            domainId: e.domainId,
            entityFqid: e.fqid,
            attributeId: a.id,
          });
        }
        if (r.source.value && !srcAttrs.has(r.source.value)) {
          emit(ctx, {
            ruleId: "identifier/prefix-source-value-unknown",
            severity: "warning",
            category: "semantic",
            rule: "prefixRules[].source.value существует в сущности-справочнике",
            message: `атрибут «${e.entityId}.${a.id}»: source.value = "${r.source.value}" не найден в ${r.source.entity}`,
            domainId: e.domainId,
            entityFqid: e.fqid,
            attributeId: a.id,
          });
        }
      }
    }
  }
}

// ============ Calculation ============
function checkCalculation(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (a.dataType !== "Calculation") return;
  if (!a.calculation || !a.calculation.schemaId || !a.calculation.id) {
    emit(ctx, {
      ruleId: "required/calculation-refs",
      severity: "error",
      category: "required",
      rule: "Calculation требует schemaId и id",
      message: `атрибут «${e.entityId}.${a.id}» типа Calculation без обязательных полей`,
      hint: "Заполните calculation: { schemaId, id }",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

// ============ Workflow: required запрещён ============
function checkWorkflowConstraints(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (a.dataTypeKind !== "custom") return;
  const dt = ctx.index.dataTypes.find(
    (d) => d.id === a.dataType && d.domainId === e.domainId,
  );
  if (!dt || dt.kind !== "Workflow") return;
  if (a.constraints.includes("required")) {
    emit(ctx, {
      ruleId: "validation/workflow-required",
      severity: "error",
      category: "validation",
      rule: "Workflow не поддерживает required",
      message: `атрибут «${e.entityId}.${a.id}» типа Workflow с constraint required`,
      hint: "Уберите required — у Workflow всегда есть initial-статус",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

// ============ Entity: ссылки внутри самой сущности ============
function checkEntityReferences(ctx: LintContext, e: EntityRecord): void {
  // ============ searching: каноничный формат ============
  if (e.searchingForm === "object") {
    emit(ctx, {
      ruleId: "entity/searching-object-form",
      severity: "warning",
      category: "semantic",
      rule: "searching — массив [{attribute}]",
      message: `сущность «${e.entityId}»: searching задан объектом {attributes: [...]}`,
      hint: "Формат: searching: [{attribute: attr1}, {attribute: attr2}]",
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }

  // ============ label ============
  if (e.label) {
    const placeholders = [...e.label.matchAll(/{(.*?)}/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    placeholders.forEach((ph) => {
      const res = resolveAttributeRef(ctx, e, ph);
      if (!res.ok) {
        emit(ctx, {
          ruleId: "semantic/label-attribute-unknown",
          severity: "warning",
          category: "semantic",
          rule: "label использует существующие атрибуты",
          message: `сущность «${e.entityId}»: label ссылается на «${ph}» — ${res.reason}`,
          hint: "Проверьте имя атрибута; для родителя используйте Entity.attr",
          domainId: e.domainId,
          entityFqid: e.fqid,
        });
      }
    });
  }

  // ============ searching ============
  for (const s of e.searching || []) {
    const res = resolveAttributeRef(ctx, e, s.attribute);
    if (!res.ok) {
      emit(ctx, {
        ruleId: "semantic/searching-attribute-unknown",
        severity: "warning",
        category: "semantic",
        rule: "searching[].attribute существует",
        message: `сущность «${e.entityId}»: searching.attribute = "${s.attribute}" — ${res.reason}`,
        domainId: e.domainId,
        entityFqid: e.fqid,
      });
    }
  }

  // ============ sorting ============
  for (const s of e.sorting || []) {
    for (const b of s.by) {
      const res = resolveAttributeRef(ctx, e, b.attribute);
      if (!res.ok) {
        emit(ctx, {
          ruleId: "semantic/sorting-attribute-unknown",
          severity: "warning",
          category: "semantic",
          rule: "sorting[].by[].attribute существует",
          message: `сущность «${e.entityId}»: sorting[${s.id}] attribute = "${b.attribute}" — ${res.reason}`,
          domainId: e.domainId,
          entityFqid: e.fqid,
        });
      }
    }
  }

  // ============ identification ============
  const walkRule = (rules: EntityIdentificationRule[], path: string): void => {
    for (const r of rules) {
      if (r.attribute) {
        const res = resolveAttributeRef(ctx, e, r.attribute);
        if (!res.ok) {
          emit(ctx, {
            ruleId: "semantic/identification-attribute-unknown",
            severity: "warning",
            category: "semantic",
            rule: "identification[].rule[].attribute существует",
            message: `сущность «${e.entityId}»: identification ${path}: attribute = "${r.attribute}" — ${res.reason}`,
            domainId: e.domainId,
            entityFqid: e.fqid,
          });
        }
      }
      if (Array.isArray(r.and)) walkRule(r.and, `${path}.and`);
      if (Array.isArray(r.or)) walkRule(r.or, `${path}.or`);
    }
  };
  for (const id of e.identification || []) walkRule(id.rule, id.id);

  // ============ reconciliation ============
  for (const r of e.reconciliation || []) {
    if (r.attribute) {
      const res = resolveAttributeRef(ctx, e, r.attribute);
      if (!res.ok) {
        emit(ctx, {
          ruleId: "semantic/reconciliation-attribute-unknown",
          severity: "warning",
          category: "semantic",
          rule: "reconciliation[].attribute существует",
          message: `сущность «${e.entityId}»: reconciliation.attribute = "${r.attribute}" — ${res.reason}`,
          domainId: e.domainId,
          entityFqid: e.fqid,
        });
      }
    }
  }

  // ============ projection ============
  for (const p of e.projection || []) {
    const res = resolveAttributeRef(ctx, e, p.attribute);
    if (!res.ok) {
      emit(ctx, {
        ruleId: "semantic/projection-attribute-unknown",
        severity: "warning",
        category: "semantic",
        rule: "projection[].attribute существует",
        message: `сущность «${e.entityId}»: projection.attribute = "${p.attribute}" — ${res.reason}`,
        domainId: e.domainId,
        entityFqid: e.fqid,
      });
    }
  }
}

// ============ Linkage: nameFrom / descendants ============
function checkEntityLinkageSemantics(ctx: LintContext): void {
  for (const l of ctx.index.entityLinkages) {
    // side1Descendants / side2Descendants — auto-only
    if (
      (l.side1Descendants && l.side1Descendants.length > 0) ||
      (l.side2Descendants && l.side2Descendants.length > 0)
    ) {
      emit(ctx, {
        ruleId: "semantic/linkage-descendants-manual",
        severity: "warning",
        category: "semantic",
        rule: "side1Descendants/side2Descendants — auto-only",
        message: `связь «${l.id}»: поля sideNDescendants заданы вручную`,
        hint: "Эти поля вычисляются автоматически, удалите их из схемы",
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}]`,
      });
    }

    // nameFrom.side1 === side2 для направленных
    const isDirected = !(l.type === "n_n" && l.undirected);
    if (
      isDirected &&
      l.nameFrom?.side1 &&
      l.nameFrom?.side2 &&
      l.nameFrom.side1 === l.nameFrom.side2
    ) {
      emit(ctx, {
        ruleId: "semantic/linkage-namefrom-equal",
        severity: "warning",
        category: "semantic",
        rule: "Для направленных связей nameFrom.side1 ≠ nameFrom.side2",
        message: `связь «${l.id}»: nameFrom.side1 === nameFrom.side2 («${l.nameFrom.side1}»)`,
        hint: "Сделайте глагольные формы разными или пометьте связь как undirected",
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].nameFrom`,
      });
    }

    // linkage-атрибуты: системный ID
    for (const a of l.attributes || []) {
      if (SYSTEM_ATTRIBUTE_IDS.has(a.id)) {
        emit(ctx, {
          ruleId: "naming/system-id-linkage-attribute",
          severity: "error",
          category: "naming",
          rule: "Использование системного ID в атрибутах связи запрещено",
          message: `связь «${l.id}».${a.id}: системный идентификатор`,
          domainId: l.domainId,
          propertyPath: `linkages[${l.id}].attributes[${a.id}]`,
        });
      }
    }

    // linkage.searching — атрибуты связи должны существовать
    const linkageAttrs = new Set((l.attributes || []).map((a) => a.id));
    for (const s of l.searching || []) {
      if (!linkageAttrs.has(s.attribute)) {
        emit(ctx, {
          ruleId: "semantic/linkage-searching-attribute-unknown",
          severity: "warning",
          category: "semantic",
          rule: "linkages[].searching[].attribute существует",
          message: `связь «${l.id}»: searching.attribute = "${s.attribute}" не найден в атрибутах связи`,
          domainId: l.domainId,
          propertyPath: `linkages[${l.id}].searching`,
        });
      }
    }
  }
}

// ============ Внутренние структуры ============

interface LintContext {
  index: ModelIndex;
  issues: LintIssue[];
  viewElementSets: Map<
    string,
    Map<
      string,
      { widgets: Set<string>; groups: Set<string>; columns: Set<string> }
    >
  >;
  presetSets: Map<string, Set<string>>;
  /** domainId → (viewId → parentViewId | null). */
  parentViewByDomain: Map<string, Map<string, string | null>>;
  /** domainId → viewId → widgetId → { type, dataType, nestedColumns }. */
  widgetInfoByDomain: Map<
    string,
    Map<
      string,
      Map<
        string,
        { type?: string; dataType?: string; nestedColumns?: string[] }
      >
    >
  >;
}

function precomputeLintIndex(index: ModelIndex): {
  viewElementSets: LintContext["viewElementSets"];
  presetSets: LintContext["presetSets"];
  parentViewByDomain: LintContext["parentViewByDomain"];
  widgetInfoByDomain: LintContext["widgetInfoByDomain"];
} {
  const viewElementSets: LintContext["viewElementSets"] = new Map();
  for (const [domainId, byView] of Object.entries(
    index.viewElementsByDomain || {},
  )) {
    const map = new Map<
      string,
      { widgets: Set<string>; groups: Set<string>; columns: Set<string> }
    >();
    for (const [viewId, elements] of Object.entries(byView)) {
      map.set(viewId, {
        widgets: new Set(elements.widgets || []),
        groups: new Set(elements.groups || []),
        columns: new Set(elements.columns || []),
      });
    }
    viewElementSets.set(domainId, map);
  }

  const presetSets: LintContext["presetSets"] = new Map();
  for (const [domainId, ids] of Object.entries(index.uiPresetsByDomain || {})) {
    presetSets.set(domainId, new Set(ids || []));
  }

  // parentViewByDomain — из schemasByDomain.allViews
  const parentViewByDomain: LintContext["parentViewByDomain"] = new Map();
  for (const [domainId, schema] of Object.entries(
    index.schemasByDomain || {},
  )) {
    const m = new Map<string, string | null>();
    if (Array.isArray(schema?.allViews)) {
      for (const v of schema.allViews) {
        m.set(v.id, v.parentViewId || null);
      }
    } else if (schema?.sections?.views?.items) {
      for (const v of schema.sections.views.items) {
        m.set(v.id, null);
      }
    }
    parentViewByDomain.set(domainId, m);
  }

  // widgetInfoByDomain — из viewElementsByDomain[*][*].widgetsWithType
  const widgetInfoByDomain: LintContext["widgetInfoByDomain"] = new Map();
  for (const [domainId, byView] of Object.entries(
    index.viewElementsByDomain || {},
  )) {
    const byViewMap = new Map<
      string,
      Map<
        string,
        { type?: string; dataType?: string; nestedColumns?: string[] }
      >
    >();
    for (const [viewId, elements] of Object.entries(byView)) {
      const m = new Map<
        string,
        { type?: string; dataType?: string; nestedColumns?: string[] }
      >();
      for (const w of elements.widgetsWithType || []) {
        m.set(w.id, {
          type: w.type,
          dataType: w.attributeDataType,
          nestedColumns: w.attributeNestedColumns,
        });
      }
      byViewMap.set(viewId, m);
    }
    widgetInfoByDomain.set(domainId, byViewMap);
  }

  return {
    viewElementSets,
    presetSets,
    parentViewByDomain,
    widgetInfoByDomain,
  };
}

function emit(
  ctx: LintContext,
  issue: Omit<LintIssue, "severity" | "category" | "ruleId"> & {
    ruleId: string;
    severity: LintSeverity;
    category: LintRuleCategory;
    rule: string;
  },
): void {
  ctx.issues.push(issue);
}

// ============ Правила ============

function checkEntityNaming(ctx: LintContext, e: EntityRecord): void {
  if (e.entityId.length > MAX_ENTITY_ID_LEN) {
    emit(ctx, {
      ruleId: "naming/entity-length",
      severity: "warning",
      category: "naming",
      rule: "Длина entityId ≤ 30",
      message: `entityId «${e.entityId}» длиной ${e.entityId.length} символов`,
      hint: `Сократите до ${MAX_ENTITY_ID_LEN} символов`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      propertyPath: `entities[${e.entityId}].id`,
    });
  }
  if (!RE_ENTITY_ID.test(e.entityId)) {
    emit(ctx, {
      ruleId: "naming/entity-camelcase",
      severity: "warning",
      category: "naming",
      rule: "entityId в CamelCase",
      message: `entityId «${e.entityId}» не в CamelCase`,
      hint: "Первая буква заглавная, разделителей нет: Device, ServerConfig",
      domainId: e.domainId,
      entityFqid: e.fqid,
      propertyPath: `entities[${e.entityId}].id`,
    });
  }
}

function checkAttributeNaming(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (a.id.length > MAX_ATTRIBUTE_ID_LEN) {
    emit(ctx, {
      ruleId: "naming/attribute-length",
      severity: "warning",
      category: "naming",
      rule: "Длина attribute.id ≤ 30",
      message: `атрибут «${e.entityId}.${a.id}» длиной ${a.id.length} символов`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
      propertyPath: `entities[${e.entityId}].attributes[${a.id}].id`,
    });
  }
  if (!RE_ATTRIBUTE_ID.test(a.id)) {
    emit(ctx, {
      ruleId: "naming/attribute-camelcase",
      severity: "warning",
      category: "naming",
      rule: "attribute.id в camelCase",
      message: `атрибут «${e.entityId}.${a.id}» не в camelCase`,
      hint: "Первая буква строчная: firstName, ipAddress",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
      propertyPath: `entities[${e.entityId}].attributes[${a.id}].id`,
    });
  }
}

function checkEntityRequired(ctx: LintContext, e: EntityRecord): void {
  if (!e.name || e.name === e.entityId) {
    emit(ctx, {
      ruleId: "required/entity-name",
      severity: "info",
      category: "required",
      rule: "У сущности задано name",
      message: `у сущности «${e.entityId}» нет человекочитаемого name`,
      hint: "name отображается в интерфейсе вместо id",
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }
}

function checkEntityRecommended(ctx: LintContext, e: EntityRecord): void {
  if (!e.description) {
    emit(ctx, {
      ruleId: "recommended/entity-description",
      severity: "info",
      category: "recommended",
      rule: "У сущности есть description",
      message: `у сущности «${e.entityId}» нет description`,
      hint: "Описание помогает команде понять назначение",
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }
  if (!e.label) {
    emit(ctx, {
      ruleId: "recommended/entity-label",
      severity: "info",
      category: "recommended",
      rule: "У сущности задан label",
      message: `у сущности «${e.entityId}» нет label — в UI будут показываться UUID`,
      hint: "label задаёт шаблон отображаемого имени объекта",
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }
}

function checkAttributeRecommended(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  if (!a.description) {
    emit(ctx, {
      ruleId: "recommended/attribute-description",
      severity: "info",
      category: "recommended",
      rule: "У атрибута есть description",
      message: `у атрибута «${e.entityId}.${a.id}» нет description`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

function checkReference(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  // external:<id> допустим только в widget-ref; в Reference — нет.
  if (a.referenceEntity?.startsWith("external:")) {
    emit(ctx, {
      ruleId: "reference/external-not-allowed",
      severity: "error",
      category: "reference",
      rule: "Reference не может использовать external:",
      message: `атрибут «${e.entityId}.${a.id}» указывает на ${a.referenceEntity} — external: допустим только в виджетах`,
      hint: "Укажите FQID сущности (Domain/Entity) или локальный EntityId",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
  if (a.itemReferenceEntity?.startsWith("external:")) {
    emit(ctx, {
      ruleId: "reference/array-external-not-allowed",
      severity: "error",
      category: "reference",
      rule: "Array<Reference> не может использовать external:",
      message: `атрибут «${e.entityId}.${a.id}» указывает на ${a.itemReferenceEntity} — external: допустим только в виджетах`,
      hint: "Укажите FQID сущности (Domain/Entity) или локальный EntityId",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  if (a.dataType === "Reference" && !a.referenceEntity) {
    emit(ctx, {
      ruleId: "reference/attribute-entity-missing",
      severity: "error",
      category: "reference",
      rule: "У Reference-атрибута указан entity",
      message: `атрибут «${e.entityId}.${a.id}» типа Reference без поля entity`,
      hint: "Добавьте entity: <FQID целевой сущности>",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
  if (
    a.dataType === "Array" &&
    a.itemDataType === "Reference" &&
    !a.itemReferenceEntity
  ) {
    emit(ctx, {
      ruleId: "reference/array-reference-entity-missing",
      severity: "error",
      category: "reference",
      rule: "У Array<Reference> указан item.entity",
      message: `атрибут «${e.entityId}.${a.id}» типа Array<Reference> без item.entity`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
  if (a.referenceEntity && !ctx.index.entitiesByFqid[a.referenceEntity]) {
    emit(ctx, {
      ruleId: "reference/entity-unknown",
      severity: "error",
      category: "reference",
      rule: "Reference указывает на существующую сущность",
      message: `атрибут «${e.entityId}.${a.id}» ссылается на несуществующую сущность ${a.referenceEntity}`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
  if (
    a.itemReferenceEntity &&
    !ctx.index.entitiesByFqid[a.itemReferenceEntity]
  ) {
    emit(ctx, {
      ruleId: "reference/array-entity-unknown",
      severity: "error",
      category: "reference",
      rule: "Array<Reference> указывает на существующую сущность",
      message: `атрибут «${e.entityId}.${a.id}» ссылается на несуществующую сущность ${a.itemReferenceEntity}`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

function checkInheritance(ctx: LintContext, e: EntityRecord): void {
  if (e.inherits === e.fqid) {
    emit(ctx, {
      ruleId: "semantic/self-inheritance",
      severity: "error",
      category: "semantic",
      rule: "Сущность не наследует сама себя",
      message: `сущность «${e.entityId}» наследует саму себя`,
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }
}

function checkEntityAttributes(ctx: LintContext, e: EntityRecord): void {
  if (e.attributes.length === 0 && !e.inherits) {
    emit(ctx, {
      ruleId: "semantic/entity-empty-attributes",
      severity: "info",
      category: "semantic",
      rule: "У сущности есть атрибуты или родитель",
      message: `сущность «${e.entityId}» без атрибутов и без inherits — вероятно, недоработана`,
      domainId: e.domainId,
      entityFqid: e.fqid,
    });
  }
}

function checkDuplicateAttributes(ctx: LintContext, e: EntityRecord): void {
  const seen = new Map<string, number>();
  e.attributes.forEach((a) => {
    seen.set(a.id, (seen.get(a.id) || 0) + 1);
  });
  seen.forEach((count, id) => {
    if (count > 1) {
      emit(ctx, {
        ruleId: "semantic/duplicate-attribute",
        severity: "error",
        category: "semantic",
        rule: "Нет дубликатов attribute.id",
        message: `у сущности «${e.entityId}» ${count} атрибутов с id «${id}»`,
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: id,
      });
    }
  });
}

// ============ Валидация по типу ============

function checkValidationByHeuristic(
  ctx: LintContext,
  e: EntityRecord,
  a: AttributeRecord,
): void {
  const nameToCheck = (a.id + " " + a.name).toLowerCase();

  // Email должен иметь regexp или явный dataType
  if (EMAIL_PATTERN.test(nameToCheck)) {
    const isEmail = a.dataType === "String";
    if (
      isEmail &&
      !a.constraints.includes("regexp") &&
      !a.constraints.includes("length")
    ) {
      emit(ctx, {
        ruleId: "validation/email-no-regexp",
        severity: "info",
        category: "validation",
        rule: "Email-атрибут имеет regexp-валидацию",
        message: `атрибут «${e.entityId}.${a.id}» похож на email, но без regexp`,
        hint: "Добавьте constraint с kind: regexp или kind: length",
        domainId: e.domainId,
        entityFqid: e.fqid,
        attributeId: a.id,
      });
    }
  }

  // IP должен быть dataType: IpAddress
  if (IP_PATTERN.test(nameToCheck) && a.dataType === "String") {
    emit(ctx, {
      ruleId: "validation/ip-as-string",
      severity: "warning",
      category: "validation",
      rule: "IP-адрес хранится как IpAddress",
      message: `атрибут «${e.entityId}.${a.id}» выглядит как IP, но тип — String`,
      hint: "Замените dataType на IpAddress для валидации",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  // URL должен быть dataType: URL
  if (URL_PATTERN.test(nameToCheck) && a.dataType === "String") {
    emit(ctx, {
      ruleId: "validation/url-as-string",
      severity: "info",
      category: "validation",
      rule: "URL хранится как URL",
      message: `атрибут «${e.entityId}.${a.id}» похож на URL, но тип — String`,
      hint: "Замените dataType на URL",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  // Date-подобный должен быть Timestamp/Date
  if (DATE_PATTERN.test(nameToCheck) && a.dataType === "String") {
    emit(ctx, {
      ruleId: "validation/date-as-string",
      severity: "warning",
      category: "validation",
      rule: "Дата хранится как Timestamp/Date",
      message: `атрибут «${e.entityId}.${a.id}» похож на дату, но тип — String`,
      hint: "Замените dataType на Timestamp или Date",
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  // MAC-адрес
  if (MAC_PATTERN.test(nameToCheck) && a.dataType !== "MAC") {
    emit(ctx, {
      ruleId: "validation/mac-wrong-type",
      severity: "info",
      category: "validation",
      rule: "MAC-адрес хранится как MAC",
      message: `атрибут «${e.entityId}.${a.id}» похож на MAC, тип — ${a.dataType}`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }

  // Phone без regexp
  if (
    PHONE_PATTERN.test(nameToCheck) &&
    a.dataType === "String" &&
    !a.constraints.includes("regexp")
  ) {
    emit(ctx, {
      ruleId: "validation/phone-no-regexp",
      severity: "info",
      category: "validation",
      rule: "Телефон имеет regexp-валидацию",
      message: `атрибут «${e.entityId}.${a.id}» похож на телефон, без regexp`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      attributeId: a.id,
    });
  }
}

// ============ UI Rules ============

/**
 * Известные view-id домена, разделённые по типу.
 * Возвращает lowercase id (без домена).
 */
function getKnownViews(
  ctx: LintContext,
  domainId: string,
): { any: Set<string>; modal: Set<string>; panel: Set<string> } {
  const any = new Set<string>();
  const modal = new Set<string>();
  const panel = new Set<string>();

  const schema = ctx.index.schemasByDomain?.[domainId];
  if (schema?.allViews) {
    for (const v of schema.allViews) {
      const id = String(v.id).toLowerCase();
      any.add(id);
      if (v.type === "modal") modal.add(id);
      if (v.type === "panel") panel.add(id);
    }
  } else if (schema?.sections?.views?.items) {
    for (const v of schema.sections.views.items) {
      const id = String(v.id).toLowerCase();
      any.add(id);
      if (v.type === "modal") modal.add(id);
      if (v.type === "panel") panel.add(id);
    }
  }
  return { any, modal, panel };
}

function checkUiRule(ctx: LintContext, rule: UiRuleRecord): void {
  const domainId = rule.domainId;

  // Пустое правило
  if (
    rule.widgets.length === 0 &&
    rule.groups.length === 0 &&
    rule.columns.length === 0
  ) {
    emit(ctx, {
      ruleId: "uirules/empty-rule",
      severity: "warning",
      category: "uirules",
      rule: "Правило содержит widgets/groups/columns",
      message: `Правило «${rule.id}» не содержит widgets, groups или columns — не применяется ни к чему`,
      hint: "Добавьте хотя бы один элемент в widgets/groups/columns",
      domainId,
      propertyPath: `uiRules[${rule.id}]`,
    });
  }

  // Внешний view — пропускаем детальную валидацию
  if (rule.view && rule.view.includes("/")) return;
  if (!rule.view) return;

  const domainViews = ctx.viewElementSets.get(domainId);
  const viewElements = domainViews?.get(rule.view);

  if (!viewElements) {
    emit(ctx, {
      ruleId: "uirules/unknown-view",
      severity: "error",
      category: "uirules",
      rule: "Правило ссылается на существующий view",
      message: `Правило «${rule.id}» ссылается на несуществующий view «${rule.view}»`,
      hint: "Проверьте id view в поле `view`",
      domainId,
      propertyPath: `uiRules[${rule.id}].view`,
    });
    return;
  }

  for (const w of rule.widgets) {
    // Внешние и FQID-ссылки локально не проверить.
    if (!w.widget) continue;
    if (w.widget.includes("/") || w.widget.startsWith("external:")) continue;

    if (!viewElements.widgets.has(w.widget)) {
      emit(ctx, {
        ruleId: "uirules/unknown-widget",
        severity: "error",
        category: "uirules",
        rule: "Виджет существует во view",
        message: `Правило «${rule.id}» ссылается на несуществующий виджет «${w.widget}» во view «${rule.view}»`,
        hint: "Проверьте id виджета в widgets[] соответствующего view",
        domainId,
        propertyPath: `uiRules[${rule.id}].rule.widgets`,
      });
    }
  }

  for (const g of rule.groups) {
    // Внешние и FQID-ссылки локально не проверить.
    if (!g.group) continue;
    if (g.group.includes("/") || g.group.startsWith("external:")) continue;

    if (!viewElements.groups.has(g.group)) {
      emit(ctx, {
        ruleId: "uirules/unknown-group",
        severity: "error",
        category: "uirules",
        rule: "Группа существует во view",
        message: `Правило «${rule.id}» ссылается на несуществующую группу «${g.group}» во view «${rule.view}»`,
        hint: "Проверьте id группы в groups[] соответствующего view",
        domainId,
        propertyPath: `uiRules[${rule.id}].rule.groups`,
      });
    }
  }

  for (const c of rule.columns) {
    // Внешние и FQID-ссылки локально не проверить.
    if (!c.column) continue;
    if (c.column.includes("/") || c.column.startsWith("external:")) continue;

    if (!viewElements.columns.has(c.column)) {
      emit(ctx, {
        ruleId: "uirules/unknown-column",
        severity: "error",
        category: "uirules",
        rule: "Колонка существует во view",
        message: `Правило «${rule.id}» ссылается на несуществующую колонку «${c.column}» во view «${rule.view}»`,
        hint: "Проверьте id колонки в table.columns[] соответствующего view",
        domainId,
        propertyPath: `uiRules[${rule.id}].rule.columns`,
      });
    }
  }

  const domainPresets = ctx.presetSets.get(domainId) || new Set<string>();
  const usedPresets = new Set<string>([
    ...rule.presets,
    ...rule.widgets.flatMap((w) => w.presets || []),
    ...rule.groups.flatMap((g) => g.presets || []),
    ...rule.columns.flatMap((c) => c.presets || []),
  ]);
  for (const p of usedPresets) {
    if (!domainPresets.has(p)) {
      emit(ctx, {
        ruleId: "uirules/unknown-preset",
        severity: "warning",
        category: "uirules",
        rule: "Пресет существует в домене",
        message: `Правило «${rule.id}» ссылается на несуществующий пресет «${p}»`,
        hint: "Проверьте id пресета в uiPresets[]",
        domainId,
        propertyPath: `uiRules[${rule.id}]`,
      });
    }
  }

  // ============ Валидация enum'ов ============
  const KNOWN_TARGETS = new Set([
    "list_view",
    "entity_view",
    "entity_attribute",
  ]);
  const KNOWN_EFFECTS = new Set([
    "hidden",
    "show",
    "hiddenEmpty",
    "readonly",
    "editable",
    "inherit",
    "variant",
  ]);
  const KNOWN_OPERATIONS = new Set(["view", "edit", "create"]);

  if (rule.target && !KNOWN_TARGETS.has(String(rule.target))) {
    emit(ctx, {
      ruleId: "uirules/unknown-target",
      severity: "warning",
      category: "uirules",
      rule: "target: list_view | entity_view | entity_attribute",
      message: `Правило «${rule.id}»: неизвестный target «${rule.target}»`,
      domainId,
      propertyPath: `uiRules[${rule.id}].target`,
    });
  }

  if (rule.effect && !KNOWN_EFFECTS.has(String(rule.effect))) {
    emit(ctx, {
      ruleId: "uirules/unknown-effect",
      severity: "warning",
      category: "uirules",
      rule: "effect: hidden | show | hiddenEmpty | readonly | editable | inherit | variant",
      message: `Правило «${rule.id}»: неизвестный effect «${rule.effect}»`,
      domainId,
      propertyPath: `uiRules[${rule.id}].rule.effect`,
    });
  }

  if (rule.operations) {
    for (const op of rule.operations) {
      if (!KNOWN_OPERATIONS.has(String(op))) {
        emit(ctx, {
          ruleId: "uirules/unknown-operation",
          severity: "warning",
          category: "uirules",
          rule: "operations: view | edit | create",
          message: `Правило «${rule.id}»: неизвестная операция «${op}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].operations`,
        });
      }
    }
  }

  // ============ rule.view соответствует target ============
  // Per docs:
  //   list_view        → view типа list / tree / tabs_list
  //   entity_view      → view типа entity
  //   entity_attribute → entity (виджет лежит в entity view)
  if (rule.view && !rule.view.includes("/")) {
    const domainViews = ctx.viewElementSets.get(domainId);
    // Всё, что мы можем проверить локально: view вообще существует.
    // Тип view есть только в schemasByDomain — достаём оттуда.
    const schema = ctx.index.schemasByDomain?.[domainId];
    const viewTypes = new Map<string, string>();
    if (schema?.allViews) {
      for (const v of schema.allViews) {
        if (v.parentViewId) continue; // nested не участвует в target
        viewTypes.set(v.id, v.type);
      }
    } else if (schema?.sections?.views?.items) {
      for (const v of schema.sections.views.items) {
        viewTypes.set(v.id, v.type);
      }
    }

    const viewType = viewTypes.get(rule.view);
    if (viewType) {
      const LIST_TYPES = new Set(["list", "tree", "tabs_list"]);
      const ENTITY_TYPES = new Set(["entity"]);

      const target = String(rule.target || "");
      const isListTarget = target === "list_view";
      const isEntityTarget =
        target === "entity_view" || target === "entity_attribute";

      if (isListTarget && !LIST_TYPES.has(viewType)) {
        emit(ctx, {
          ruleId: "uirules/target-view-mismatch",
          severity: "warning",
          category: "uirules",
          rule: "target: list_view ссылается на list/tree/tabs_list",
          message: `Правило «${rule.id}»: target=list_view, но view «${rule.view}» имеет тип «${viewType}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].view`,
        });
      }

      if (isEntityTarget && !ENTITY_TYPES.has(viewType)) {
        emit(ctx, {
          ruleId: "uirules/target-view-mismatch",
          severity: "warning",
          category: "uirules",
          rule: "target: entity_view ссылается на entity",
          message: `Правило «${rule.id}»: target=${target}, но view «${rule.view}» имеет тип «${viewType}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].view`,
        });
      }
    } else if (domainViews && !domainViews.has(rule.view)) {
      // Сюда попадаем, если view вообще нет в домене — это уже поймано выше
      // (uirules/unknown-view), второй раз не ругаемся.
    }
  }

  // ============ Target-specific проверки ============
  const target = String(rule.target || "");

  // entity_view: columns не поддерживаются (только widgets и groups)
  if (target === "entity_view" && rule.columns.length > 0) {
    emit(ctx, {
      ruleId: "uirules/columns-on-entity-view",
      severity: "warning",
      category: "uirules",
      rule: "columns не поддерживаются для entity_view",
      message: `Правило «${rule.id}»: columns указаны для target: entity_view — они будут проигнорированы`,
      hint: "Используйте target: list_view или entity_attribute для columns",
      domainId,
      propertyPath: `uiRules[${rule.id}].rule.columns`,
    });
  }

  // list_view: groups не поддерживаются (только widgets и columns)
  if (target === "list_view" && rule.groups.length > 0) {
    emit(ctx, {
      ruleId: "uirules/groups-on-list-view",
      severity: "warning",
      category: "uirules",
      rule: "groups не поддерживаются для list_view",
      message: `Правило «${rule.id}»: groups указаны для target: list_view — они будут проигнорированы`,
      hint: "Используйте target: entity_view для groups",
      domainId,
      propertyPath: `uiRules[${rule.id}].rule.groups`,
    });
  }

  // list_view: readonly/editable не поддерживаются
  if (
    target === "list_view" &&
    (rule.effect === "readonly" || rule.effect === "editable")
  ) {
    emit(ctx, {
      ruleId: "uirules/readonly-on-list-view",
      severity: "warning",
      category: "uirules",
      rule: "readonly/editable не поддерживаются для list_view",
      message: `Правило «${rule.id}»: effect «${rule.effect}» не поддерживается для target: list_view`,
      domainId,
      propertyPath: `uiRules[${rule.id}].rule.effect`,
    });
  }

  // entity_attribute: все widgets должны иметь nested
  if (target === "entity_attribute") {
    for (const w of rule.widgets) {
      if (!w.nested) {
        emit(ctx, {
          ruleId: "uirules/entity-attribute-without-nested",
          severity: "warning",
          category: "uirules",
          rule: "target: entity_attribute требует nested",
          message: `Правило «${rule.id}»: виджет «${w.widget}» без nested`,
          hint: "Укажите nested: { type: table | array, … }",
          domainId,
          propertyPath: `uiRules[${rule.id}].rule.widgets`,
        });
      }
    }
  }

  // variant: должен ссылаться хотя бы на один preset
  if (rule.effect === "variant") {
    const anyPreset =
      rule.presets.length > 0 ||
      rule.widgets.some((w) => (w.presets || []).length > 0) ||
      rule.groups.some((g) => (g.presets || []).length > 0) ||
      rule.columns.some((c) => (c.presets || []).length > 0);
    if (!anyPreset) {
      emit(ctx, {
        ruleId: "uirules/variant-without-presets",
        severity: "warning",
        category: "uirules",
        rule: "effect: variant требует presets",
        message: `Правило «${rule.id}»: effect «variant», но ни один preset не указан`,
        hint: "Укажите presets на правиле или на элементах",
        domainId,
        propertyPath: `uiRules[${rule.id}]`,
      });
    }
  }

  // ============ context.views[] ============
  if (rule.contextViews.length > 0) {
    const parentMap = ctx.parentViewByDomain.get(domainId);
    for (const ctxView of rule.contextViews) {
      if (!ctxView || ctxView.includes("/")) continue;
      if (!parentMap || !parentMap.has(ctxView)) {
        emit(ctx, {
          ruleId: "uirules/unknown-context-view",
          severity: "warning",
          category: "uirules",
          rule: "context.views[] существует",
          message: `Правило «${rule.id}»: context.views[] ссылается на несуществующий view «${ctxView}»`,
          hint: "Укажите id panel/modal/page, объявленный внутри rule.view",
          domainId,
          propertyPath: `uiRules[${rule.id}].context.views`,
        });
        continue;
      }
      const parentView = parentMap.get(ctxView);
      if (!parentView) {
        emit(ctx, {
          ruleId: "uirules/context-view-not-nested",
          severity: "info",
          category: "uirules",
          rule: "context.views[] — nested views от rule.view",
          message: `Правило «${rule.id}»: context.views[] содержит «${ctxView}» — это top-level view, не nested`,
          hint: "context.views принимает только panel/modal/page, объявленные внутри rule.view",
          domainId,
          propertyPath: `uiRules[${rule.id}].context.views`,
        });
      } else if (rule.view && parentView !== rule.view) {
        emit(ctx, {
          ruleId: "uirules/context-view-mismatch",
          severity: "warning",
          category: "uirules",
          rule: "context.views[] — nested views от rule.view",
          message: `Правило «${rule.id}»: context.view «${ctxView}» принадлежит «${parentView}», а не «${rule.view}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].context.views`,
        });
      }
    }
  }

  // ============ readonly/editable — только для attribute/linkage/linkage_list ============
  if (
    (rule.effect === "readonly" || rule.effect === "editable") &&
    target !== "list_view" &&
    rule.widgets.length > 0
  ) {
    const widgetInfo = ctx.widgetInfoByDomain.get(domainId)?.get(rule.view);
    const allowedTypes = new Set(["attribute", "linkage", "linkage_list"]);
    for (const w of rule.widgets) {
      const info = widgetInfo?.get(w.widget);
      if (!info) continue; // не нашли во view — уже покрыто unknown-widget
      const wType = String(info.type || "");
      if (!wType) continue; // тип не определён — молчим
      if (!allowedTypes.has(wType)) {
        emit(ctx, {
          ruleId: "uirules/readonly-on-unsupported-widget",
          severity: "warning",
          category: "uirules",
          rule: "readonly/editable только для attribute/linkage/linkage_list",
          message: `Правило «${rule.id}»: effect «${rule.effect}» на виджете «${w.widget}» типа «${wType}» не поддерживается`,
          hint: "readonly/editable применимы только к виджетам атрибутов и связей",
          domainId,
          propertyPath: `uiRules[${rule.id}].rule.widgets`,
        });
      }
    }
  }

  // ============ nested.type ↔ dataType виджета; nested.attributes[] ↔ колонки Table ============
  if (target === "entity_attribute" && rule.widgets.length > 0) {
    const widgetInfo = ctx.widgetInfoByDomain.get(domainId)?.get(rule.view);
    for (const w of rule.widgets) {
      if (!w.nested) continue;

      // ============ nested.type-specific структура ============
      const nestedType = w.nested.type;

      if (nestedType === "table") {
        if (!w.nested.attributes || w.nested.attributes.length === 0) {
          emit(ctx, {
            ruleId: "uirules/nested-table-attributes-empty",
            severity: "error",
            category: "required",
            rule: 'nested.type: "table" требует attributes[]',
            message: `Правило «${rule.id}», виджет «${w.widget}»: nested.type = table, attributes[] пуст`,
            hint: "Перечислите хотя бы одну колонку Table-атрибута",
            domainId,
            propertyPath: `uiRules[${rule.id}].rule.widgets`,
          });
        }
        if (Array.isArray(w.nested.items) && w.nested.items.length > 0) {
          emit(ctx, {
            ruleId: "uirules/nested-items-on-table",
            severity: "error",
            category: "semantic",
            rule: 'nested.type: "table" запрещает items[]',
            message: `Правило «${rule.id}», виджет «${w.widget}»: nested.type = table, но заданы items[]`,
            domainId,
            propertyPath: `uiRules[${rule.id}].rule.widgets`,
          });
        }
      }

      if (nestedType === "array") {
        if (!w.nested.items || w.nested.items.length === 0) {
          emit(ctx, {
            ruleId: "uirules/nested-array-items-empty",
            severity: "error",
            category: "required",
            rule: 'nested.type: "array" требует items[]',
            message: `Правило «${rule.id}», виджет «${w.widget}»: nested.type = array, items[] пуст`,
            hint: 'Укажите индексы элементов (0, 1, ...) или "*"',
            domainId,
            propertyPath: `uiRules[${rule.id}].rule.widgets`,
          });
        }
        if (
          Array.isArray(w.nested.attributes) &&
          w.nested.attributes.length > 0
        ) {
          emit(ctx, {
            ruleId: "uirules/nested-attributes-on-array",
            severity: "error",
            category: "semantic",
            rule: 'nested.type: "array" запрещает attributes[]',
            message: `Правило «${rule.id}», виджет «${w.widget}»: nested.type = array, но заданы attributes[]`,
            domainId,
            propertyPath: `uiRules[${rule.id}].rule.widgets`,
          });
        }
        // Проверка формата items: "*" или целое ≥ 0
        for (const item of w.nested.items || []) {
          const s = String(item).trim();
          if (s === "*") continue;
          const n = Number(s);
          if (!Number.isInteger(n) || n < 0 || s === "") {
            emit(ctx, {
              ruleId: "uirules/nested-array-item-invalid",
              severity: "error",
              category: "semantic",
              rule: 'nested.items[] — "*" или целое ≥ 0',
              message: `Правило «${rule.id}», виджет «${w.widget}»: недопустимый item "${s}"`,
              hint: 'Пример: items: [0, 1, "*"]',
              domainId,
              propertyPath: `uiRules[${rule.id}].rule.widgets`,
            });
          }
        }
      }

      const info = widgetInfo?.get(w.widget);
      if (!info) continue;
      const dataType = String(info.dataType || "");
      if (!dataType) continue; // dataType не определён — молчим, чтобы не шуметь

      if (w.nested.type === "table" && dataType !== "Table") {
        emit(ctx, {
          ruleId: "uirules/nested-type-mismatch",
          severity: "warning",
          category: "uirules",
          rule: 'nested.type: "table" соответствует dataType: Table',
          message: `Правило «${rule.id}»: nested.type = "table", а виджет «${w.widget}» имеет dataType «${dataType}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].rule.widgets`,
        });
      }
      if (w.nested.type === "array" && dataType !== "Array") {
        emit(ctx, {
          ruleId: "uirules/nested-type-mismatch",
          severity: "warning",
          category: "uirules",
          rule: 'nested.type: "array" соответствует dataType: Array',
          message: `Правило «${rule.id}»: nested.type = "array", а виджет «${w.widget}» имеет dataType «${dataType}»`,
          domainId,
          propertyPath: `uiRules[${rule.id}].rule.widgets`,
        });
      }

      if (
        w.nested.type === "table" &&
        Array.isArray(w.nested.attributes) &&
        info.nestedColumns &&
        info.nestedColumns.length > 0
      ) {
        const knownCols = new Set(info.nestedColumns);
        for (const col of w.nested.attributes) {
          if (!knownCols.has(col)) {
            emit(ctx, {
              ruleId: "uirules/nested-column-unknown",
              severity: "warning",
              category: "uirules",
              rule: "nested.attributes[] существует в Table",
              message: `Правило «${rule.id}»: nested.attributes[] содержит «${col}», которого нет в Table-атрибуте «${w.widget}»`,
              hint: "Проверьте id колонки в attributes[] Table-типа",
              domainId,
              propertyPath: `uiRules[${rule.id}].rule.widgets`,
            });
          }
        }
      }
    }
  }
}

function checkOrphanPresets(ctx: LintContext): void {
  const used = new Set<string>();
  for (const r of ctx.index.uiRules || []) {
    const add = (p: string) => used.add(`${r.domainId}#${p}`);
    r.presets.forEach(add);
    r.widgets.forEach((w) => (w.presets || []).forEach(add));
    r.groups.forEach((g) => (g.presets || []).forEach(add));
    r.columns.forEach((c) => (c.presets || []).forEach(add));
  }

  for (const p of ctx.index.uiPresets || []) {
    if (!used.has(`${p.domainId}#${p.id}`)) {
      emit(ctx, {
        ruleId: "uirules/orphan-preset",
        severity: "info",
        category: "uirules",
        rule: "Пресет используется",
        message: `Пресет «${p.id}» не используется ни в одном UI Rule`,
        hint: "Мёртвый код — можно удалить из uiPresets[]",
        domainId: p.domainId,
        propertyPath: `uiPresets[${p.id}]`,
      });
    }
  }
}

function checkConflictingEffects(ctx: LintContext): void {
  // Per docs: hidden/show и readonly/editable — дуальные эффекты, их одновременное
  // присутствие штатно (белый/чёрный список). Поэтому мы НЕ помечаем такие пары
  // как конфликт. Ищем только буквальные дубликаты:
  //   - один и тот же элемент
  //   - одинаковый effect
  //   - одинаковый condition / operations / contextViews
  // Нижестоящее правило в схеме перекрывает вышестоящее — это и есть «проблема».

  type Bucket = {
    domainId: string;
    view: string;
    kind: "widget" | "group" | "column";
    id: string;
    rules: UiRuleRecord[];
  };

  const bucket = new Map<string, Bucket>();

  const add = (
    domainId: string,
    view: string,
    kind: Bucket["kind"],
    id: string,
    rule: UiRuleRecord,
  ) => {
    const key = `${domainId}|${view}|${kind}:${id}`;
    let b = bucket.get(key);
    if (!b) {
      b = { domainId, view, kind, id, rules: [] };
      bucket.set(key, b);
    }
    b.rules.push(rule);
  };

  for (const r of ctx.index.uiRules || []) {
    for (const w of r.widgets) add(r.domainId, r.view, "widget", w.widget, r);
    for (const g of r.groups) add(r.domainId, r.view, "group", g.group, r);
    for (const c of r.columns) add(r.domainId, r.view, "column", c.column, r);
  }

  const canonOps = (ops: string[] | undefined): string =>
    JSON.stringify((ops || []).slice().sort());

  const canonCtx = (views: string[] | undefined): string =>
    JSON.stringify((views || []).slice().sort());

  bucket.forEach((b) => {
    if (b.rules.length < 2) return;

    for (let i = 0; i < b.rules.length; i++) {
      for (let j = i + 1; j < b.rules.length; j++) {
        const a = b.rules[i];
        const bb = b.rules[j];
        if (a.id === bb.id) continue;

        const sameEffect = a.effect === bb.effect;
        const sameCondition =
          (a.condition || "").trim() === (bb.condition || "").trim();
        const sameOps = canonOps(a.operations) === canonOps(bb.operations);
        const sameCtx = canonCtx(a.contextViews) === canonCtx(bb.contextViews);

        if (sameEffect && sameCondition && sameOps && sameCtx) {
          emit(ctx, {
            ruleId: "uirules/duplicate-rule",
            severity: "warning",
            category: "uirules",
            rule: "Нет дублирующих правил для одного элемента",
            message: `Правило «${bb.id}» дублирует «${a.id}» на ${b.kind} «${b.id}» с тем же условием и эффектом`,
            hint: "Нижестоящее правило в схеме имеет приоритет — уберите или объедините",
            domainId: bb.domainId,
            propertyPath: `uiRules[${bb.id}]`,
          });
        }
      }
    }
  });
}

// ============ DataRules ============

// ============ Mixins ============

function checkMixins(ctx: LintContext): void {
  const mixins = ctx.index.mixins || [];
  if (mixins.length === 0) return;

  // Кэш существующих групп/action для доменов — переиспользуем на итерации.
  const groupsByDomain = new Map<string, Set<string>>();
  const actionsByDomain = new Map<string, Set<string>>();

  const getGroups = (domainId: string): Set<string> => {
    let set = groupsByDomain.get(domainId);
    if (set) return set;
    set = new Set<string>();
    const elements = ctx.index.viewElementsByDomain?.[domainId] || {};
    for (const byView of Object.values(elements)) {
      for (const g of byView.groups || []) set.add(String(g));
    }
    groupsByDomain.set(domainId, set);
    return set;
  };

  const getActions = (domainId: string): Set<string> => {
    let set = actionsByDomain.get(domainId);
    if (set) return set;
    set = new Set<string>();
    for (const a of ctx.index.actions) {
      if (a.domainId === domainId) set.add(a.id);
    }
    actionsByDomain.set(domainId, set);
    return set;
  };

  // Индекс связей — по FQID.
  const linkageMap = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageMap.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  for (const m of mixins) {
    const domainId = m.domainId;

    // ============ targetEntityFqid ============
    if (!ctx.index.entitiesByFqid[m.targetEntityFqid]) {
      emit(ctx, {
        ruleId: "mixin/target-entity-unknown",
        severity: "error",
        category: "reference",
        rule: "targetEntityFqid существует",
        message: `Примесь «${m.id}»: целевая сущность «${m.targetEntityFqid}» не найдена`,
        domainId,
        propertyPath: `mixins[${m.id}].entity`,
      });
    }

    // ============ type: linkage ============
    if (m.type === "linkage") {
      // entity.from
      if (!m.sourceEntityFqid) {
        emit(ctx, {
          ruleId: "mixin/from-missing",
          severity: "error",
          category: "required",
          rule: "type: linkage требует entity.from",
          message: `Примесь «${m.id}»: entity.from не задан`,
          domainId,
          propertyPath: `mixins[${m.id}].entity.from`,
        });
      } else if (!ctx.index.entitiesByFqid[m.sourceEntityFqid]) {
        emit(ctx, {
          ruleId: "mixin/from-unknown",
          severity: "error",
          category: "reference",
          rule: "entity.from существует",
          message: `Примесь «${m.id}»: entity.from «${m.sourceEntityFqid}» не найдена`,
          domainId,
          propertyPath: `mixins[${m.id}].entity.from`,
        });
      }

      // linkage
      if (!m.linkageFqid) {
        emit(ctx, {
          ruleId: "mixin/linkage-missing",
          severity: "error",
          category: "required",
          rule: "type: linkage требует linkage",
          message: `Примесь «${m.id}»: type = linkage, linkage не задан`,
          domainId,
          propertyPath: `mixins[${m.id}].linkage`,
        });
      } else {
        const linkageRecord = linkageMap.get(m.linkageFqid.toLowerCase());
        if (!linkageRecord) {
          emit(ctx, {
            ruleId: "mixin/linkage-unknown",
            severity: "error",
            category: "reference",
            rule: "linkage существует",
            message: `Примесь «${m.id}»: linkage «${m.linkageFqid}» не найдена`,
            domainId,
            propertyPath: `mixins[${m.id}].linkage`,
          });
        } else {
          // ============ undirected запрещено для mixin linkage ============
          if (linkageRecord.undirected === true) {
            emit(ctx, {
              ruleId: "mixin/linkage-undirected",
              severity: "error",
              category: "semantic",
              rule: "linkage примеси — направленная",
              message: `Примесь «${m.id}»: linkage «${m.linkageFqid}» — ненаправленная`,
              hint: "Используйте направленную связь типа 1_1 или 1_n",
              domainId,
              propertyPath: `mixins[${m.id}].linkage`,
            });
          }

          // ============ type: 1_1 | 1_n ============
          if (linkageRecord.type === "n_n") {
            emit(ctx, {
              ruleId: "mixin/linkage-type-nn",
              severity: "error",
              category: "semantic",
              rule: "Примесь linkage: type — 1_1 или 1_n",
              message: `Примесь «${m.id}»: linkage «${m.linkageFqid}» типа n_n`,
              hint: "Для примеси linkage допускаются связи 1_1 и 1_n",
              domainId,
              propertyPath: `mixins[${m.id}].linkage`,
            });
          }

          // ============ from/to ↔ стороны связи ============
          const src = (m.sourceEntityFqid || "").toLowerCase() || null;
          const tgt = (m.targetEntityFqid || "").toLowerCase() || null;
          const side1 = (linkageRecord.side1Fqid || "").toLowerCase();
          const side2 = (linkageRecord.side2Fqid || "").toLowerCase();
          const isSymmetricLinkage = side1 === side2 && side1 !== "";

          // 1) sourceEntityFqid — на стороне связи
          let fromSide: 1 | 2 | null = null;
          if (src) {
            if (side1 === src) fromSide = 1;
            else if (side2 === src) fromSide = 2;
            else if (!isSymmetricLinkage) {
              emit(ctx, {
                ruleId: "mixin/from-not-linked",
                severity: "error",
                category: "semantic",
                rule: "entity.from участвует в связи",
                message: `Примесь «${m.id}»: entity.from «${m.sourceEntityFqid}» не является стороной связи «${m.linkageFqid}»`,
                domainId,
                propertyPath: `mixins[${m.id}].entity.from`,
              });
            }
            // isSymmetricLinkage + from не совпал — это уже не from-not-linked,
            // а случай self-linkage; если from !== side1 — это ошибка.
            if (isSymmetricLinkage && src !== side1) {
              emit(ctx, {
                ruleId: "mixin/from-not-linked",
                severity: "error",
                category: "semantic",
                rule: "entity.from участвует в связи",
                message: `Примесь «${m.id}»: entity.from «${m.sourceEntityFqid}» не является стороной симметричной связи «${m.linkageFqid}»`,
                domainId,
                propertyPath: `mixins[${m.id}].entity.from`,
              });
            }
          }

          // 2) targetEntityFqid — противоположная сторона
          if (tgt && fromSide !== null) {
            const expectedOther = fromSide === 1 ? side2 : side1;
            if (tgt !== expectedOther) {
              emit(ctx, {
                ruleId: "mixin/to-not-opposite-side",
                severity: "error",
                category: "semantic",
                rule: "entity.to — противоположная сторона связи",
                message: `Примесь «${m.id}»: entity.to «${m.targetEntityFqid}» не совпадает с противоположной стороной связи «${linkageRecord.side1Fqid} ↔ ${linkageRecord.side2Fqid}»`,
                domainId,
                propertyPath: `mixins[${m.id}].entity.to`,
              });
            }
          }

          // 3) type: 1_n → from должен быть на стороне 1
          if (
            linkageRecord.type === "1_n" &&
            fromSide === 2 &&
            !isSymmetricLinkage
          ) {
            emit(ctx, {
              ruleId: "mixin/linkage-1n-from-side",
              severity: "error",
              category: "semantic",
              rule: "type: 1_n — entity.from со стороны 1",
              message: `Примесь «${m.id}»: linkage «${m.linkageFqid}» типа 1_n, но entity.from «${m.sourceEntityFqid}» на стороне 2`,
              hint: "Поменяйте стороны связи или используйте type: 1_1",
              domainId,
              propertyPath: `mixins[${m.id}].linkage`,
            });
          }
        }
      }
    }

    // ============ views[] ============
    const view = m.view;
    if (!view) continue;

    const toKeys = (["panel", "tab", "form", "list", "page"] as const).filter(
      (k) => !!view.to[k],
    );
    if (toKeys.length === 0) {
      emit(ctx, {
        ruleId: "mixin/to-missing",
        severity: "error",
        category: "required",
        rule: "to содержит ровно одно поле",
        message: `Примесь «${m.id}», view «${view.id}»: to без поля`,
        domainId,
        propertyPath: `mixins[${m.id}].views[${view.id}].to`,
      });
    } else if (toKeys.length > 1) {
      emit(ctx, {
        ruleId: "mixin/to-multiple",
        severity: "warning",
        category: "semantic",
        rule: "to содержит ровно одно поле",
        message: `Примесь «${m.id}», view «${view.id}»: to содержит несколько полей (${toKeys.join(", ")})`,
        domainId,
        propertyPath: `mixins[${m.id}].views[${view.id}].to`,
      });
    }

    // fromView — обязателен для type: view
    if (m.type === "view") {
      if (!view.fromView) {
        emit(ctx, {
          ruleId: "mixin/from-view-missing",
          severity: "error",
          category: "required",
          rule: "type: view требует fromView",
          message: `Примесь «${m.id}», view «${view.id}»: fromView не задан`,
          domainId,
          propertyPath: `mixins[${m.id}].views[${view.id}].fromView`,
        });
      } else if (!view.fromView.includes("/")) {
        const known = ctx.index.schemasByDomain[domainId]?.allViews || [];
        const exists = known.some(
          (v) => String(v.id).toLowerCase() === view.fromView!.toLowerCase(),
        );
        if (!exists) {
          emit(ctx, {
            ruleId: "mixin/from-view-unknown",
            severity: "warning",
            category: "reference",
            rule: "fromView существует",
            message: `Примесь «${m.id}», view «${view.id}»: fromView «${view.fromView}» не найден`,
            domainId,
            propertyPath: `mixins[${m.id}].views[${view.id}].fromView`,
          });
        }
      }
    }

    // change vs replace
    if (m.type === "view") {
      if (view.change && view.replace) {
        emit(ctx, {
          ruleId: "mixin/change-and-replace",
          severity: "error",
          category: "semantic",
          rule: "change и replace взаимоисключающие",
          message: `Примесь «${m.id}», view «${view.id}»: заданы и change, и replace`,
          domainId,
          propertyPath: `mixins[${m.id}].views[${view.id}]`,
        });
      } else if (!view.change && !view.replace) {
        emit(ctx, {
          ruleId: "mixin/change-or-replace-missing",
          severity: "error",
          category: "required",
          rule: "type: view требует change или replace",
          message: `Примесь «${m.id}», view «${view.id}»: не задан ни change, ни replace`,
          domainId,
          propertyPath: `mixins[${m.id}].views[${view.id}]`,
        });
      }
    } else {
      if (!view.change) {
        emit(ctx, {
          ruleId: "mixin/change-missing",
          severity: "error",
          category: "required",
          rule: "type: linkage требует change",
          message: `Примесь «${m.id}», view «${view.id}»: type = linkage, change не задан`,
          domainId,
          propertyPath: `mixins[${m.id}].views[${view.id}].change`,
        });
      }
    }

    // ============ to.<key> существует ============
    // Zod (`Qt` → `U`): to.* резолвится в домене целевой сущности.
    //   targetEntityFqid = it.assets.rvision.ru/AssetGroups
    //   targetDomain     = it.assets.rvision.ru
    // Если целевая сущность в другом домене — ссылка кросс-доменная,
    // в zod она НЕ проверяется локально (`d.startsWith(`${mixinDomain}/`)` = false).
    // В линтере так же: пропускаем cross-domain, чтобы не давать ложных
    // предупреждений (например, `to.panel: panels.info` из чужого домена).
    if (toKeys.length === 1) {
      const toKey = toKeys[0];
      const toId = view.to[toKey];
      const slashIdx = m.targetEntityFqid.indexOf("/");
      const targetDomain =
        slashIdx > 0
          ? m.targetEntityFqid.slice(0, slashIdx).toLowerCase()
          : domainId.toLowerCase();
      const isCrossDomain = targetDomain !== domainId.toLowerCase();

      if (
        typeof toId === "string" &&
        toId &&
        !toId.includes("/") &&
        !isCrossDomain
      ) {
        let exists = false;

        if (toKey === "list") {
          const known = ctx.index.schemasByDomain[targetDomain]?.allViews || [];
          exists = known.some(
            (v) =>
              String(v.id).toLowerCase() === toId.toLowerCase() &&
              v.type === "list",
          );
        } else if (toKey === "form" || toKey === "tab") {
          exists = getGroups(targetDomain).has(toId);
        } else {
          // panel / page
          const known = ctx.index.schemasByDomain[targetDomain]?.allViews || [];
          exists = known.some(
            (v) =>
              String(v.id).toLowerCase() === toId.toLowerCase() &&
              v.type === toKey,
          );
        }

        if (!exists) {
          emit(ctx, {
            ruleId: "mixin/to-target-unknown",
            severity: "warning",
            category: "reference",
            rule: "to.<panel|tab|form|list|page> существует",
            message: `Примесь «${m.id}», view «${view.id}»: to.${toKey} «${toId}» не найден в домене «${targetDomain}»`,
            hint: "Целевое представление объявляется в домене целевой сущности",
            domainId,
            propertyPath: `mixins[${m.id}].views[${view.id}].to.${toKey}`,
          });
        }
      }
      // Cross-domain: пропускаем. Опечатку в имени поймает публикация
      // (это поведение zod — «локально не проверяем чужой домен»).
    }

    // ============ change.add.tabs[].tab — группа ============
    if (view.change?.add?.tabs) {
      const knownGroups = getGroups(domainId);
      for (const t of view.change.add.tabs) {
        if (t.tab.includes("/")) continue;
        if (!knownGroups.has(t.tab)) {
          emit(ctx, {
            ruleId: "mixin/add-tab-unknown",
            severity: "warning",
            category: "reference",
            rule: "change.add.tabs[].tab существует",
            message: `Примесь «${m.id}»: add.tabs «${t.tab}» не найден`,
            domainId,
            propertyPath: `mixins[${m.id}].views[${view.id}].change.add.tabs`,
          });
        }
      }
    }

    // ============ change.add.menu[].action — action ============
    if (view.change?.add?.menu) {
      const known = getActions(domainId);
      for (const a of view.change.add.menu) {
        if (a.action.includes("/")) continue;
        if (!known.has(a.action)) {
          emit(ctx, {
            ruleId: "mixin/add-menu-action-unknown",
            severity: "warning",
            category: "reference",
            rule: "change.add.menu[].action существует",
            message: `Примесь «${m.id}»: add.menu «${a.action}» не найден`,
            domainId,
            propertyPath: `mixins[${m.id}].views[${view.id}].change.add.menu`,
          });
        }
      }
    }

    // ============ change.add.components[].widget — виджет ============
    if (view.change?.add?.components) {
      const knownWidgets = new Set<string>();
      const elements = ctx.index.viewElementsByDomain?.[domainId] || {};
      for (const byView of Object.values(elements)) {
        for (const w of byView.widgets || []) knownWidgets.add(String(w));
      }
      for (const c of view.change.add.components) {
        if (!c.widget) continue;
        if (c.widget.startsWith("external:")) continue;
        if (c.widget.includes("/")) continue;
        if (!knownWidgets.has(c.widget)) {
          emit(ctx, {
            ruleId: "mixin/add-widget-unknown",
            severity: "warning",
            category: "reference",
            rule: "change.add.components[].widget существует",
            message: `Примесь «${m.id}»: add.components «${c.widget}» не найден`,
            domainId,
            propertyPath: `mixins[${m.id}].views[${view.id}].change.add.components`,
          });
        }
      }
    }
  }
}

function checkDataRules(ctx: LintContext): void {
  const rules = ctx.index.dataRules;
  if (!rules || rules.length === 0) return;
  for (const dr of rules) {
    checkDataRuleTarget(ctx, dr);
    checkDataRuleEffectAttributes(ctx, dr);
    checkDataRuleEffectLinkages(ctx, dr);
    checkDataRuleMessages(ctx, dr);
    checkDataRuleNested(ctx, dr);
    checkDataRuleCondition(ctx, dr);
  }
}

// ============ Actions ============

function checkActions(ctx: LintContext): void {
  const actions = ctx.index.actions || [];
  if (actions.length === 0) return;

  // ============ Уникальность id в домене ============
  const seenByDomain = new Map<string, Set<string>>();
  for (const a of actions) {
    let set = seenByDomain.get(a.domainId);
    if (!set) {
      set = new Set();
      seenByDomain.set(a.domainId, set);
    }
    if (set.has(a.id)) {
      emit(ctx, {
        ruleId: "action/duplicate-id",
        severity: "error",
        category: "semantic",
        rule: "ID действия уникален в домене",
        message: `Действие «${a.id}»: дубликат id в домене ${a.domainId}`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}]`,
      });
    } else {
      set.add(a.id);
    }
  }

  // Кэши: known views на домен + linkage lookup на домен
  const viewsCache = new Map<
    string,
    { any: Set<string>; modal: Set<string>; panel: Set<string> }
  >();
  const knownViewsOf = (domainId: string) => {
    let v = viewsCache.get(domainId);
    if (!v) {
      v = getKnownViews(ctx, domainId);
      viewsCache.set(domainId, v);
    }
    return v;
  };

  const linkageKey = (domainId: string, id: string) =>
    `${domainId}/${id}`.toLowerCase();
  const linkageMap = new Map<
    string,
    (typeof ctx.index.entityLinkages)[number]
  >();
  for (const l of ctx.index.entityLinkages) {
    linkageMap.set(linkageKey(l.domainId, l.id), l);
  }

  for (const a of actions) {
    const domLower = a.domainId.toLowerCase();
    const localOf = (fqid: string): string | null => {
      const prefix = domLower + "/";
      return fqid.toLowerCase().startsWith(prefix)
        ? fqid.slice(prefix.length)
        : null;
    };

    // ============ type ============
    if (!KNOWN_ACTION_TYPES.has(a.type)) {
      emit(ctx, {
        ruleId: "action/unknown-type",
        severity: "warning",
        category: "semantic",
        rule: "type — валидный enum",
        message: `Действие «${a.id}»: неизвестный type «${a.type}»`,
        hint: "Допустимые типы перечислены в docs раздела «Действия»",
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].type`,
      });
    }

    // open_external_widget_modal: params.widget обязателен
    if (a.type === "open_external_widget_modal") {
      if (!a.widgetParams?.widget) {
        emit(ctx, {
          ruleId: "action/external-widget-params-missing",
          severity: "error",
          category: "required",
          rule: "open_external_widget_modal требует params.widget",
          message: `Действие «${a.id}»: params.widget не задан`,
          hint: "params: { widget: <string> }",
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].params`,
        });
      }
    }

    // ============ entity ============
    if (a.entity) {
      const localEntity = localOf(a.entity);
      if (localEntity && !ctx.index.entitiesByFqid[a.entity]) {
        emit(ctx, {
          ruleId: "action/entity-unknown",
          severity: "error",
          category: "reference",
          rule: "entity существует",
          message: `Действие «${a.id}»: entity «${a.entity}» не найдена`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].entity`,
        });
      }
    }

    // ============ modal / panel / view ============
    const views = knownViewsOf(a.domainId);

    if (a.modal) {
      const local = localOf(a.modal);
      if (local && !views.modal.has(local)) {
        emit(ctx, {
          ruleId: "action/modal-unknown",
          severity: "warning",
          category: "reference",
          rule: "modal существует и является modal",
          message: `Действие «${a.id}»: modal «${a.modal}» не найден или не типа modal`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].modal`,
        });
      }
    }

    if (a.panel) {
      const local = localOf(a.panel);
      if (local && !views.panel.has(local)) {
        emit(ctx, {
          ruleId: "action/panel-unknown",
          severity: "warning",
          category: "reference",
          rule: "panel существует и является panel",
          message: `Действие «${a.id}»: panel «${a.panel}» не найден или не типа panel`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].panel`,
        });
      }
    }

    if (a.view) {
      const local = localOf(a.view);
      if (local && !views.any.has(local)) {
        emit(ctx, {
          ruleId: "action/view-unknown",
          severity: "warning",
          category: "reference",
          rule: "view существует",
          message: `Действие «${a.id}»: view «${a.view}» не найден`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].view`,
        });
      }
    }

    // ============ operation ↔ type ============
    if (a.operation && ACTION_OPERATIONS_BY_TYPE[a.type]) {
      if (!ACTION_OPERATIONS_BY_TYPE[a.type].has(a.operation)) {
        emit(ctx, {
          ruleId: "action/operation-mismatch",
          severity: "warning",
          category: "semantic",
          rule: `operation совместим с type: ${a.type}`,
          message: `Действие «${a.id}»: operation «${a.operation}» несовместим с type «${a.type}»`,
          hint: `Допустимые операции: ${[...ACTION_OPERATIONS_BY_TYPE[a.type]].join(", ")}`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].operation`,
        });
      }
    }

    // ============ scenario ============
    if (a.type === "scenario" && !a.scenario) {
      emit(ctx, {
        ruleId: "action/scenario-required",
        severity: "error",
        category: "required",
        rule: "type: scenario требует scenario",
        message: `Действие «${a.id}»: type = scenario, но поле scenario не задано`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].scenario`,
      });
    }
    if (a.type !== "scenario" && a.scenario) {
      emit(ctx, {
        ruleId: "action/scenario-unexpected",
        severity: "warning",
        category: "semantic",
        rule: "scenario имеет смысл только при type: scenario",
        message: `Действие «${a.id}»: scenario указан при type «${a.type}»`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].scenario`,
      });
    }

    // ============ automation.id ============
    if (a.automationId && !UUID_RE.test(a.automationId)) {
      emit(ctx, {
        ruleId: "action/automation-id-invalid",
        severity: "warning",
        category: "semantic",
        rule: "automation.id — UUID",
        message: `Действие «${a.id}»: automation.id «${a.automationId}» не UUID`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].automation.id`,
      });
    }

    // ============ values[] (set_attribute_value) ============
    if (a.type === "set_attribute_value" && a.values && a.values.length > 0) {
      if (!a.entity) {
        emit(ctx, {
          ruleId: "action/set-value-no-entity",
          severity: "error",
          category: "required",
          rule: "set_attribute_value требует entity",
          message: `Действие «${a.id}»: type = set_attribute_value, но entity не задано`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].entity`,
        });
      } else if (ctx.index.entitiesByFqid[a.entity]) {
        for (let i = 0; i < a.values.length; i++) {
          const v = a.values[i];
          const attr = findAttributeWithInheritance(ctx, a.entity, v.attribute);
          if (!attr) {
            emit(ctx, {
              ruleId: "action/value-attribute-unknown",
              severity: "error",
              category: "reference",
              rule: "values[].attribute существует",
              message: `Действие «${a.id}»: values[${i}].attribute «${v.attribute}» не найден в «${a.entity}»`,
              domainId: a.domainId,
              propertyPath: `actions[${a.id}].values`,
            });
          } else if (attr.dataType !== "Bool") {
            emit(ctx, {
              ruleId: "action/value-attribute-not-bool",
              severity: "warning",
              category: "semantic",
              rule: "values[].attribute — Bool",
              message: `Действие «${a.id}»: values[${i}].attribute «${v.attribute}» имеет тип «${attr.dataType}», ожидается Bool`,
              domainId: a.domainId,
              propertyPath: `actions[${a.id}].values`,
            });
          }
        }
      }
    }

    // ============ bulk + edit_attribute: values[] + control ============
    // Zod: для operation=edit_attribute требуется values: [{attribute, value}],
    // а при Bool-атрибуте — control: { type, trueText, falseText }.
    if (a.type === "bulk" && a.operation === "edit_attribute") {
      if (!a.values || a.values.length === 0) {
        emit(ctx, {
          ruleId: "action/bulk-edit-attribute-values-required",
          severity: "error",
          category: "required",
          rule: "bulk + edit_attribute требует values[]",
          message: `Действие «${a.id}»: operation = edit_attribute, но values[] пуст`,
          hint: "Укажите values: [{ attribute, value }]",
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].values`,
        });
      } else if (a.entity && ctx.index.entitiesByFqid[a.entity]) {
        for (let i = 0; i < a.values.length; i++) {
          const v = a.values[i];
          const attr = findAttributeWithInheritance(ctx, a.entity, v.attribute);
          if (!attr) {
            emit(ctx, {
              ruleId: "action/bulk-edit-attribute-unknown",
              severity: "error",
              category: "reference",
              rule: "values[].attribute существует",
              message: `Действие «${a.id}»: values[${i}].attribute «${v.attribute}» не найден в «${a.entity}»`,
              domainId: a.domainId,
              propertyPath: `actions[${a.id}].values`,
            });
            continue;
          }
          if (attr.dataType !== "Bool") {
            emit(ctx, {
              ruleId: "action/bulk-edit-attribute-not-bool",
              severity: "warning",
              category: "semantic",
              rule: "values[].attribute — Bool",
              message: `Действие «${a.id}»: values[${i}].attribute «${v.attribute}» имеет тип «${attr.dataType}», ожидается Bool`,
              domainId: a.domainId,
              propertyPath: `actions[${a.id}].values`,
            });
          }
        }

        // control нужен только когда цель — Bool-атрибут.
        const firstAttr = findAttributeWithInheritance(
          ctx,
          a.entity,
          a.values[0].attribute,
        );
        if (firstAttr?.dataType === "Bool") {
          if (!a.control) {
            emit(ctx, {
              ruleId: "action/bulk-edit-attribute-control-required",
              severity: "error",
              category: "required",
              rule: "bulk edit_attribute для Bool требует control",
              message: `Действие «${a.id}»: для Bool-атрибута нужен control с trueText и falseText`,
              hint: "control: { type: bool_text, trueText: ..., falseText: ... }",
              domainId: a.domainId,
              propertyPath: `actions[${a.id}].control`,
            });
          } else {
            if (!a.control.trueText) {
              emit(ctx, {
                ruleId: "action/bulk-edit-attribute-control-text-missing",
                severity: "error",
                category: "required",
                rule: "control.trueText задан",
                message: `Действие «${a.id}»: control.trueText не задан`,
                domainId: a.domainId,
                propertyPath: `actions[${a.id}].control.trueText`,
              });
            }
            if (!a.control.falseText) {
              emit(ctx, {
                ruleId: "action/bulk-edit-attribute-control-text-missing",
                severity: "error",
                category: "required",
                rule: "control.falseText задан",
                message: `Действие «${a.id}»: control.falseText не задан`,
                domainId: a.domainId,
                propertyPath: `actions[${a.id}].control.falseText`,
              });
            }
          }
        }
      }
    }

    // ============ bulkSettings[] (tree_bulk) ============
    if (a.type === "tree_bulk" && a.bulkSettings && a.bulkSettings.length > 0) {
      for (let i = 0; i < a.bulkSettings.length; i++) {
        const bs = a.bulkSettings[i];
        if (!bs.entity) {
          emit(ctx, {
            ruleId: "action/bulk-entity-missing",
            severity: "error",
            category: "required",
            rule: "bulkSettings[].entity задан",
            message: `Действие «${a.id}»: bulkSettings[${i}].entity не задан`,
            domainId: a.domainId,
            propertyPath: `actions[${a.id}].bulkSettings`,
          });
          continue;
        }
        const entity = ctx.index.entitiesByFqid[bs.entity];
        if (!entity && bs.entity.toLowerCase().startsWith(domLower + "/")) {
          emit(ctx, {
            ruleId: "action/bulk-entity-unknown",
            severity: "error",
            category: "reference",
            rule: "bulkSettings[].entity существует",
            message: `Действие «${a.id}»: bulkSettings[${i}].entity «${bs.entity}» не найдена`,
            domainId: a.domainId,
            propertyPath: `actions[${a.id}].bulkSettings`,
          });
          continue;
        }

        if (bs.attributes?.type === "specific" && bs.attributes.use) {
          for (const u of bs.attributes.use) {
            const attr = findAttributeWithInheritance(
              ctx,
              bs.entity,
              u.attribute,
            );
            if (!attr) {
              emit(ctx, {
                ruleId: "action/bulk-attribute-unknown",
                severity: "error",
                category: "reference",
                rule: "bulkSettings[].attributes.use[].attribute существует",
                message: `Действие «${a.id}»: attributes.use «${u.attribute}» не найден в «${bs.entity}»`,
                domainId: a.domainId,
                propertyPath: `actions[${a.id}].bulkSettings`,
              });
            } else if (attr.readonly) {
              emit(ctx, {
                ruleId: "action/bulk-attribute-readonly",
                severity: "warning",
                category: "semantic",
                rule: "bulkSettings[].attributes.use[].attribute не readonly",
                message: `Действие «${a.id}»: attributes.use «${u.attribute}» помечен readonly`,
                domainId: a.domainId,
                propertyPath: `actions[${a.id}].bulkSettings`,
              });
            }
          }
        }

        if (bs.linkages?.type === "specific" && bs.linkages.use) {
          const widgetIds = new Set<string>();
          const els = ctx.index.viewElementsByDomain?.[a.domainId];
          if (els) {
            for (const byView of Object.values(els)) {
              for (const w of byView.widgets || []) widgetIds.add(w);
            }
          }
          for (const u of bs.linkages.use) {
            if (!widgetIds.has(u.widget) && !u.widget.includes("/")) {
              emit(ctx, {
                ruleId: "action/bulk-widget-unknown",
                severity: "warning",
                category: "reference",
                rule: "bulkSettings[].linkages.use[].widget существует",
                message: `Действие «${a.id}»: linkages.use «${u.widget}» не найден ни в одном view домена`,
                domainId: a.domainId,
                propertyPath: `actions[${a.id}].bulkSettings`,
              });
            }
          }
        }
      }
    }

    // ============ open_list: linkage + side ============
    if (a.type === "open_list" && a.linkage) {
      const lk = a.linkage;
      const localLinkage = lk.toLowerCase().startsWith(domLower + "/")
        ? lk.slice(domLower.length + 1)
        : lk;
      const linkageRecord = linkageMap.get(
        linkageKey(a.domainId, localLinkage),
      );
      if (linkageRecord) {
        const isSymmetric = linkageRecord.side1Fqid === linkageRecord.side2Fqid;
        const isDirected = !(
          linkageRecord.type === "n_n" && linkageRecord.undirected
        );
        if (isSymmetric && isDirected && !a.side) {
          emit(ctx, {
            ruleId: "action/linkage-side-required",
            severity: "warning",
            category: "semantic",
            rule: "Для симметричной направленной связи нужен side",
            message: `Действие «${a.id}»: linkage «${a.linkage}» симметричная направленная — укажите side`,
            domainId: a.domainId,
            propertyPath: `actions[${a.id}].side`,
          });
        }
      }
    }

    // ============ open_list: attribute → Reference ============
    // По docs: `attribute` — это атрибут-ссылка, по значению которого
    // применяется контекст списка. Ожидаем dataType: Reference.
    if (a.type === "open_list" && a.attribute && a.entity) {
      if (ctx.index.entitiesByFqid[a.entity]) {
        const attr = findAttributeWithInheritance(ctx, a.entity, a.attribute);
        if (!attr) {
          emit(ctx, {
            ruleId: "action/open-list-attribute-unknown",
            severity: "error",
            category: "reference",
            rule: "open_list.attribute существует",
            message: `Действие «${a.id}»: attribute «${a.attribute}» не найден в «${a.entity}»`,
            domainId: a.domainId,
            propertyPath: `actions[${a.id}].attribute`,
          });
        } else if (attr.dataType !== "Reference") {
          emit(ctx, {
            ruleId: "action/open-list-attribute-not-reference",
            severity: "warning",
            category: "semantic",
            rule: "open_list.attribute — Reference",
            message: `Действие «${a.id}»: attribute «${a.attribute}» имеет тип «${attr.dataType}», ожидается Reference`,
            domainId: a.domainId,
            propertyPath: `actions[${a.id}].attribute`,
          });
        }
      }
    }
  }
}

// ============ Views ============

// ============ View columns (PR 6b) ============

// ============ View table.filter / table.sortingBy (PR 6c) ============

/**
 * Валидация `view.source.joins[]` (legacy list-view).
 * Для каждой записи: linkage существует, side обязателен для симметричной
 * направленной.
 */
function checkViewSourceJoins(ctx: LintContext): void {
  const joins = ctx.index.viewSourceJoins || [];
  if (joins.length === 0) return;

  // domainId#viewId → Set<joinId> (для уникальности)
  const seenJoinIds = new Map<string, Set<string>>();

  for (const j of joins) {
    const linkageRecord = ctx.index.entityLinkages.find(
      (l) => `${l.domainId}/${l.id}`.toLowerCase() === j.linkage.toLowerCase(),
    );
    if (!linkageRecord) {
      emit(ctx, {
        ruleId: "view/source-join-linkage-unknown",
        severity: "warning",
        category: "reference",
        rule: "source.joins[].linkage существует",
        message: `View «${j.viewId}»: join «${j.id}» ссылается на несуществующий linkage «${j.linkage}»`,
        domainId: j.domainId,
        propertyPath: `${j.propertyPath}.linkage`,
      });
      continue;
    }

    // ============ side для симметричной направленной ============
    const isSymmetric = linkageRecord.side1Fqid === linkageRecord.side2Fqid;
    const isDirected = !(
      linkageRecord.type === "n_n" && linkageRecord.undirected
    );
    if (isSymmetric && isDirected && j.side === undefined) {
      emit(ctx, {
        ruleId: "view/source-join-side-required",
        severity: "warning",
        category: "semantic",
        rule: "source.joins[].side задан для симметричной направленной",
        message: `View «${j.viewId}», join «${j.id}»: linkage «${j.linkage}» симметричная направленная — укажите side`,
        domainId: j.domainId,
        propertyPath: `${j.propertyPath}.side`,
      });
    }

    // ============ linkage касается source.entity ============
    const schema = ctx.index.schemasByDomain?.[j.domainId];
    const viewItem = schema?.sections?.views?.items?.find(
      (v) => v.id === j.viewId,
    );
    const sourceEntityRaw = viewItem?.sourceEntity;
    if (sourceEntityRaw) {
      const sourceFqid = String(sourceEntityRaw).includes("/")
        ? String(sourceEntityRaw).toLowerCase()
        : `${j.domainId}/${sourceEntityRaw}`.toLowerCase();

      const side1 = (linkageRecord.side1Fqid || "").toLowerCase();
      const side2 = (linkageRecord.side2Fqid || "").toLowerCase();

      if (side1 !== sourceFqid && side2 !== sourceFqid) {
        emit(ctx, {
          ruleId: "view/source-join-not-related",
          severity: "warning",
          category: "semantic",
          rule: "linkage касается source.entity",
          message: `View «${j.viewId}», join «${j.id}»: linkage «${j.linkage}» (${linkageRecord.side1Fqid} ↔ ${linkageRecord.side2Fqid}) не касается source.entity «${sourceEntityRaw}»`,
          hint: "source.joins[] должен содержать только связи, в которых участвует source.entity",
          domainId: j.domainId,
          propertyPath: `${j.propertyPath}.linkage`,
        });
      }
    }

    // ============ уникальность join-id в рамках view ============
    const key = `${j.domainId}#${j.viewId}`;
    let set = seenJoinIds.get(key);
    if (!set) {
      set = new Set();
      seenJoinIds.set(key, set);
    }
    if (set.has(j.id)) {
      emit(ctx, {
        ruleId: "view/source-join-duplicate-id",
        severity: "error",
        category: "semantic",
        rule: "source.joins[].id уникален в рамках view",
        message: `View «${j.viewId}»: join-id «${j.id}» встречается дважды`,
        domainId: j.domainId,
        propertyPath: `${j.propertyPath}.id`,
      });
    } else {
      set.add(j.id);
    }
  }
}

function checkViewTableMeta(ctx: LintContext): void {
  const filters = ctx.index.viewTableFilters || [];
  const sortings = ctx.index.viewTableSortings || [];
  if (filters.length === 0 && sortings.length === 0) return;

  // ============ Индексы (совпадают с checkViewColumns) ============
  const viewEntityByDomain = new Map<string, Map<string, string | null>>();
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const m = new Map<string, string | null>();
    const topViews = schema?.sections?.views?.items || [];
    const treeRoot = new Map<string, string>();
    const trees = schema?.sections?.trees?.items || [];
    for (const t of trees) {
      if (t.id && t.rootEntity) {
        treeRoot.set(String(t.id), String(t.rootEntity).toLowerCase());
      }
    }
    for (const v of topViews) {
      const id = String(v.id);
      if (v.type === "list") {
        const s = (v as any).sourceEntity;
        if (typeof s === "string" && s) {
          m.set(
            id,
            s.includes("/")
              ? s.toLowerCase()
              : `${domainId}/${s}`.toLowerCase(),
          );
        } else m.set(id, null);
      } else if (v.type === "tree") {
        const treeId = (v as any).tree;
        if (typeof treeId === "string" && treeRoot.has(treeId)) {
          m.set(id, treeRoot.get(treeId) || null);
        } else m.set(id, null);
      } else if (v.type === "entity" && v.entity) {
        m.set(
          id,
          String(v.entity).includes("/")
            ? String(v.entity).toLowerCase()
            : `${domainId}/${v.entity}`.toLowerCase(),
        );
      } else {
        m.set(id, null);
      }
    }
    viewEntityByDomain.set(domainId, m);
  }

  // ============ Индекс linkage-атрибутов ============
  // `${domainId}/${linkageId}` (lowercase) → Set<attrId>
  const linkageAttrs = new Map<string, Set<string>>();
  // `${domainId}/${linkageId}` (lowercase) → linkageRecord
  const linkageLookup = new Map<
    string,
    (typeof ctx.index.entityLinkages)[number]
  >();
  for (const l of ctx.index.entityLinkages) {
    const key = `${l.domainId}/${l.id}`.toLowerCase();
    linkageLookup.set(key, l);
    if (l.attributes) {
      linkageAttrs.set(key, new Set(l.attributes.map((a) => a.id)));
    }
  }

  // ============ Индекс сортировок: существует ли sortingId ============
  // Источники sorting:
  //   - entities[].sorting[].id
  //   - linkages[].sorting[].id
  //   - trees[].sorting[].id              ← PR 6c-fix
  const knownSortingIdsByDomain = new Map<string, Set<string>>();
  const ensureSortingSet = (domainId: string): Set<string> => {
    let set = knownSortingIdsByDomain.get(domainId);
    if (!set) {
      set = new Set();
      knownSortingIdsByDomain.set(domainId, set);
    }
    return set;
  };

  for (const e of ctx.index.entities) {
    const set = ensureSortingSet(e.domainId);
    for (const s of e.sorting || []) set.add(s.id);
  }
  for (const l of ctx.index.entityLinkages) {
    const set = ensureSortingSet(l.domainId);
    for (const s of l.sorting || []) set.add(s.id);
  }
  for (const t of ctx.index.trees || []) {
    const set = ensureSortingSet(t.domainId);
    for (const s of t.sorting || []) set.add(s.id);
  }

  // dataTypes[].sorting[].id — у ModelIndex.dataTypes может не быть sorting;
  // берём из schema.sections.dataTypes.items (если появится) или из raw.
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const set = ensureSortingSet(domainId);
    const dts = schema?.sections?.dataTypes?.items || [];
    for (const dt of dts) {
      const sortings = (dt as any).sorting;
      if (Array.isArray(sortings)) {
        for (const s of sortings) {
          if (s && typeof s.id === "string") set.add(s.id);
        }
      }
    }
  }

  // ============ Индекс join-ids ============
  const joinIdsByDomain = new Map<string, Set<string>>();
  for (const tl of ctx.index.transitiveLinkages || []) {
    let set = joinIdsByDomain.get(tl.domainId);
    if (!set) {
      set = new Set();
      joinIdsByDomain.set(tl.domainId, set);
    }
    const walkJoin = (j: any): void => {
      if (!j || typeof j !== "object") return;
      if (typeof j.id === "string") set!.add(j.id);
      if (Array.isArray(j.joins)) j.joins.forEach(walkJoin);
    };
    tl.joins.forEach(walkJoin);
  }

  // ============ Индекс колонок по view ============
  const columnsByView = new Map<string, Map<string, Set<string>>>();
  for (const c of ctx.index.viewColumns || []) {
    if (!columnsByView.has(c.domainId))
      columnsByView.set(c.domainId, new Map());
    const byView = columnsByView.get(c.domainId)!;
    if (!byView.has(c.viewId)) byView.set(c.viewId, new Set());
    byView.get(c.viewId)!.add(c.id);
  }

  // ============ filter.attributes / filter.linkages ============
  for (const f of filters) {
    const viewEntity = viewEntityByDomain.get(f.domainId)?.get(f.viewId);
    if (!viewEntity) continue;

    // attributes
    const viewEntityRecord = ctx.index.entitiesByFqid[viewEntity];
    if (!viewEntityRecord) continue;

    for (const a of f.attributes) {
      if (SYSTEM_ATTRIBUTE_IDS.has(a.attribute)) continue;
      if (a.attribute.includes("/")) continue;
      const res = resolveAttributeRef(ctx, viewEntityRecord, a.attribute);
      if (!res.ok) {
        emit(ctx, {
          ruleId: "view/filter-attribute-unknown",
          severity: "warning",
          category: "reference",
          rule: "filter.attributes.use[].attribute существует",
          message: `View «${f.viewId}»: filter.attribute «${a.attribute}» не найден в «${viewEntity}»`,
          hint: "Проверьте id атрибута в attributes[] соответствующей сущности (или нотацию Entity.attr для родителя)",
          domainId: f.domainId,
          propertyPath: `views[${f.viewId}].table.filter.attributes.use`,
        });
      }
    }

    // linkages
    for (const lk of f.linkages) {
      if (lk.linkage) {
        const localLinkage = lk.linkage
          .toLowerCase()
          .startsWith(f.domainId.toLowerCase() + "/")
          ? lk.linkage.slice(f.domainId.length + 1)
          : lk.linkage;
        const key = `${f.domainId}/${localLinkage}`.toLowerCase();
        const linkageRecord = linkageLookup.get(key);

        if (!linkageRecord && !lk.linkage.includes("/")) {
          // Локальная ссылка, но не найдена
          emit(ctx, {
            ruleId: "view/filter-linkage-unknown",
            severity: "warning",
            category: "reference",
            rule: "filter.linkages.use[].linkage существует",
            message: `View «${f.viewId}»: filter.linkage «${lk.linkage}» не найден в домене`,
            domainId: f.domainId,
            propertyPath: `views[${f.viewId}].table.filter.linkages.use`,
          });
        }

        // link_attributes
        if (
          linkageRecord &&
          lk.linkAttributes &&
          lk.linkAttributes.length > 0
        ) {
          const attrIds = linkageAttrs.get(key) || new Set<string>();
          for (const attrId of lk.linkAttributes) {
            if (!attrIds.has(attrId)) {
              emit(ctx, {
                ruleId: "view/filter-linkage-attribute-unknown",
                severity: "warning",
                category: "reference",
                rule: "filter.linkages.use[].link_attributes[].attribute существует",
                message: `View «${f.viewId}»: link_attribute «${attrId}» не найден в связи «${lk.linkage}»`,
                domainId: f.domainId,
                propertyPath: `views[${f.viewId}].table.filter.linkages.use`,
              });
            }
          }
        }

        // linkedEntity — атрибуты связанной сущности
        if (linkageRecord && lk.linkedEntity && lk.linkedEntity.length > 0) {
          // Берём "противоположную" сущность от viewEntity
          const side1 = linkageRecord.side1Fqid;
          const side2 = linkageRecord.side2Fqid;
          let targetEntity: string | null = null;
          if (side1 === viewEntity) targetEntity = side2;
          else if (side2 === viewEntity) targetEntity = side1;
          else targetEntity = side1 !== viewEntity ? side1 : side2;

          if (targetEntity) {
            const targetRecord = ctx.index.entitiesByFqid[targetEntity];
            if (targetRecord) {
              for (const attrId of lk.linkedEntity) {
                if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) continue;
                const res = resolveAttributeRef(ctx, targetRecord, attrId);
                if (!res.ok) {
                  emit(ctx, {
                    ruleId: "view/filter-linked-entity-attribute-unknown",
                    severity: "warning",
                    category: "reference",
                    rule: "filter.linkages.use[].linkedEntity[].attribute существует",
                    message: `View «${f.viewId}»: linkedEntity.attribute «${attrId}» не найден в «${targetEntity}»`,
                    domainId: f.domainId,
                    propertyPath: `views[${f.viewId}].table.filter.linkages.use`,
                  });
                }
              }
            }
          }
        }
      }

      // join
      if (lk.join) {
        const knownJoins = joinIdsByDomain.get(f.domainId);
        if (knownJoins && !knownJoins.has(lk.join)) {
          emit(ctx, {
            ruleId: "view/filter-join-unknown",
            severity: "warning",
            category: "reference",
            rule: "filter.linkages.use[].join существует в transitiveLinkages",
            message: `View «${f.viewId}»: filter.join «${lk.join}» не найден в transitiveLinkages домена`,
            domainId: f.domainId,
            propertyPath: `views[${f.viewId}].table.filter.linkages.use`,
          });
        }
      }
    }
  }

  // ============ sortingBy ============
  for (const s of sortings) {
    const cols = columnsByView.get(s.domainId)?.get(s.viewId);

    // Если для view вообще нет колонок (например, entity-view) — молчим.
    // Для list/tree cols будет Set (возможно пустой) — там проверяем.
    if (!cols) continue;

    const knownSorting =
      knownSortingIdsByDomain.get(s.domainId) || new Set<string>();

    for (const sc of s.columns) {
      if (!cols.has(sc.column)) {
        emit(ctx, {
          ruleId: "view/sorting-column-unknown",
          severity: "warning",
          category: "reference",
          rule: "sortingBy.columns[].column существует в columns[]",
          message: `View «${s.viewId}»: sorting.column «${sc.column}» не найден среди columns[]`,
          hint: "Проверьте id колонки в table.columns[] этого view",
          domainId: s.domainId,
          propertyPath: `views[${s.viewId}].table.sortingBy.columns`,
        });
      }

      if (
        sc.sorting &&
        !sc.sorting.includes("/") &&
        !knownSorting.has(sc.sorting)
      ) {
        emit(ctx, {
          ruleId: "view/sorting-unknown",
          severity: "warning",
          category: "reference",
          rule: "sortingBy.columns[].sorting существует в entity/linkage/tree",
          message: `View «${s.viewId}»: sorting «${sc.sorting}» не найден среди sorting[] сущностей, связей или деревьев домена`,
          hint: "Проверьте id в sorting[] соответствующей сущности/связи/дерева",
          domainId: s.domainId,
          propertyPath: `views[${s.viewId}].table.sortingBy.columns`,
        });
      }
    }

    if (s.defaultColumn && !cols.has(s.defaultColumn)) {
      emit(ctx, {
        ruleId: "view/sorting-default-column-unknown",
        severity: "warning",
        category: "reference",
        rule: "sortingBy.defaults.column существует в columns[]",
        message: `View «${s.viewId}»: defaults.column «${s.defaultColumn}» не найден среди columns[]`,
        domainId: s.domainId,
        propertyPath: `views[${s.viewId}].table.sortingBy.defaults.column`,
      });
    }
  }

  // ============ paging ============
  for (const p of ctx.index.viewTablePagings || []) {
    // sizes[] — массив целых положительных
    for (let i = 0; i < p.rawSizes.length; i++) {
      const raw = p.rawSizes[i];
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        emit(ctx, {
          ruleId: "view/paging-size-invalid",
          severity: "error",
          category: "validation",
          rule: "paging.sizes[] — массив целых положительных чисел",
          message: `View «${p.viewId}»: sizes[${i}] = «${String(raw)}» — ожидается целое положительное число`,
          domainId: p.domainId,
          propertyPath: `views[${p.viewId}].table.paging.sizes`,
        });
      }
    }

    // defaultSize — целое положительное и в sizes[]
    if (p.rawDefaultSize !== undefined) {
      const n =
        typeof p.rawDefaultSize === "number"
          ? p.rawDefaultSize
          : Number(p.rawDefaultSize);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        emit(ctx, {
          ruleId: "view/paging-default-invalid",
          severity: "error",
          category: "validation",
          rule: "paging.defaultSize — целое положительное число",
          message: `View «${p.viewId}»: defaultSize = «${String(p.rawDefaultSize)}» — ожидается целое положительное число`,
          domainId: p.domainId,
          propertyPath: `views[${p.viewId}].table.paging.defaultSize`,
        });
      } else if (p.sizes.length > 0 && !p.sizes.includes(n)) {
        emit(ctx, {
          ruleId: "view/paging-default-not-in-sizes",
          severity: "warning",
          category: "semantic",
          rule: "paging.defaultSize ∈ paging.sizes[]",
          message: `View «${p.viewId}»: defaultSize = ${n} отсутствует в sizes[] (${p.sizes.join(", ")})`,
          domainId: p.domainId,
          propertyPath: `views[${p.viewId}].table.paging.defaultSize`,
        });
      }
    }
  }

  // ============ table.actions[] ============
  const actionsDomain = ctx.index.actions || [];
  const actionsByDomain = new Map<string, Set<string>>();
  for (const a of actionsDomain) {
    let set = actionsByDomain.get(a.domainId);
    if (!set) {
      set = new Set();
      actionsByDomain.set(a.domainId, set);
    }
    set.add(a.id);
  }

  const KNOWN_TABLE_ACTION_TYPES = new Set<string>([
    "row_click",
    "row_double_click",
    "row_context_menu",
  ]);

  for (const a of ctx.index.viewTableActions || []) {
    if (!KNOWN_TABLE_ACTION_TYPES.has(a.type)) {
      emit(ctx, {
        ruleId: "view/table-action-unknown-type",
        severity: "warning",
        category: "semantic",
        rule: "actions[].type — row_click | row_double_click | row_context_menu",
        message: `View «${a.viewId}»: actions.type «${a.type}» неизвестен`,
        domainId: a.domainId,
        propertyPath: `views[${a.viewId}].table.actions`,
      });
    }

    const known = actionsByDomain.get(a.domainId) || new Set<string>();

    // action (row_click / row_double_click)
    if (a.type === "row_click" || a.type === "row_double_click") {
      if (!a.action) {
        emit(ctx, {
          ruleId: "view/table-action-action-missing",
          severity: "error",
          category: "required",
          rule: `actions[].action задан для type: ${a.type}`,
          message: `View «${a.viewId}»: actions[].type = ${a.type}, но action не задан`,
          domainId: a.domainId,
          propertyPath: `views[${a.viewId}].table.actions`,
        });
      } else if (!a.action.includes("/") && !known.has(a.action)) {
        emit(ctx, {
          ruleId: "view/table-action-unknown",
          severity: "warning",
          category: "reference",
          rule: "actions[].action существует в actions[] домена",
          message: `View «${a.viewId}»: actions[].action «${a.action}» не найден в actions[] домена`,
          domainId: a.domainId,
          propertyPath: `views[${a.viewId}].table.actions`,
        });
      }
    }

    // items (row_context_menu)
    if (a.type === "row_context_menu") {
      if (a.items.length === 0) {
        emit(ctx, {
          ruleId: "view/table-action-menu-empty",
          severity: "warning",
          category: "semantic",
          rule: "actions[] с type: row_context_menu содержат items[]",
          message: `View «${a.viewId}»: row_context_menu без items`,
          domainId: a.domainId,
          propertyPath: `views[${a.viewId}].table.actions`,
        });
      }
      if (a.items.length > 7) {
        emit(ctx, {
          ruleId: "view/table-action-menu-too-many",
          severity: "warning",
          category: "semantic",
          rule: "items[] в row_context_menu — не более 7",
          message: `View «${a.viewId}»: row_context_menu содержит ${a.items.length} items (максимум 7)`,
          domainId: a.domainId,
          propertyPath: `views[${a.viewId}].table.actions`,
        });
      }
      for (const it of a.items) {
        if (!it.action.includes("/") && !known.has(it.action)) {
          emit(ctx, {
            ruleId: "view/table-action-menu-action-unknown",
            severity: "warning",
            category: "reference",
            rule: "items[].action существует в actions[] домена",
            message: `View «${a.viewId}»: items[].action «${it.action}» не найден в actions[] домена`,
            domainId: a.domainId,
            propertyPath: `views[${a.viewId}].table.actions`,
          });
        }
      }
    }
  }
}

/**
 * FQID всех сущностей из иерархии дерева: корень + все дети рекурсивно.
 * В tree-view колонка/виджет может ссылаться на атрибут ЛЮБОЙ сущности
 * иерархии, не только корня.
 */
function collectTreeEntityFqids(tree: TreeRecord): string[] {
  const result: string[] = [tree.hierarchy.entity.toLowerCase()];
  const seen = new Set<string>(result);
  const walk = (children: TreeHierarchyChild[] | undefined): void => {
    if (!children) return;
    for (const child of children) {
      const fqid = child.entity.toLowerCase();
      if (!seen.has(fqid)) {
        seen.add(fqid);
        result.push(fqid);
      }
      walk(child.children);
    }
  };
  walk(tree.hierarchy.children);
  return result;
}

/**
 * domainId → viewId → массив FQID сущностей, чьи атрибуты доступны во view.
 *   - list    → [source.entity]
 *   - tree    → [root + все children из trees[].hierarchy]
 *   - entity  → [entity]
 *   - прочие  → []  (dashboard* — атрибуты не проверяем)
 */
function buildViewEntitiesByDomain(
  ctx: LintContext,
): Map<string, Map<string, string[]>> {
  const result = new Map<string, Map<string, string[]>>();

  // Composite-ключ `${domainId}#${treeId}` — потому что ctx.index.trees
  // содержит деревья всех доменов.
  const treeFqids = new Map<string, string[]>();
  for (const tree of ctx.index.trees || []) {
    treeFqids.set(`${tree.domainId}#${tree.id}`, collectTreeEntityFqids(tree));
  }

  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const m = new Map<string, string[]>();
    const topViews = schema?.sections?.views?.items || [];

    for (const v of topViews) {
      const id = String(v.id);
      if (v.type === "list") {
        const s = (v as any).sourceEntity;
        m.set(
          id,
          typeof s === "string" && s
            ? [
                s.includes("/")
                  ? s.toLowerCase()
                  : `${domainId}/${s}`.toLowerCase(),
              ]
            : [],
        );
      } else if (v.type === "tree") {
        const treeId = (v as any).tree;
        if (typeof treeId === "string" && treeId) {
          const slash = treeId.indexOf("/");
          const key =
            slash > 0
              ? `${treeId.slice(0, slash).toLowerCase()}#${treeId.slice(slash + 1)}`
              : `${domainId}#${treeId}`;
          m.set(id, treeFqids.get(key) || []);
        } else {
          m.set(id, []);
        }
      } else if (v.type === "entity" && v.entity) {
        m.set(id, [
          String(v.entity).includes("/")
            ? String(v.entity).toLowerCase()
            : `${domainId}/${v.entity}`.toLowerCase(),
        ]);
      } else {
        m.set(id, []);
      }
    }
    result.set(domainId, m);
  }
  return result;
}

/**
 * Разрешает `attrRef` хотя бы в одной из сущностей view.
 * Поддерживает:
 *   - `<attrId>`             — атрибут текущей/родительской сущности;
 *   - `<EntityId>.<attrId>`  — атрибут родителя (per docs);
 *   - `<domain>/<Entity>.<attrId>` — кросс-домен (если ModelIndex его знает);
 *   - системные (`createdAt`, `entityName`, …).
 */
function resolveAttributeInView(
  ctx: LintContext,
  viewEntities: string[],
  attrRef: string,
): { ok: boolean; reason?: string } {
  const reasons: string[] = [];
  for (const fqid of viewEntities) {
    const entity = ctx.index.entitiesByFqid[fqid];
    if (!entity) {
      reasons.push(`${fqid}: сущность не найдена`);
      continue;
    }
    const res = resolveAttributeRef(ctx, entity, attrRef);
    if (res.ok) return { ok: true };
    if (res.reason) reasons.push(`${entity.entityId}: ${res.reason}`);
  }
  return { ok: false, reason: reasons.join("; ") };
}

/**
 * Валидация `views[type=tree].table.filter[]`.
 * Для каждой сущности дерева проверяем:
 *   - attributes.use[].attribute — атрибут этой сущности (с наследованием);
 *   - linkages.use[].linkage — существует;
 *   - linkAttributes — атрибуты связи;
 *   - linkedEntity — атрибуты связанной сущности.
 *
 * `join` (транзитивные связи) локально не проверяем — это требует
 * раскрытия дерева joins в transitiveLinkages, что вне scope линтера.
 */
function checkViewTreeFilters(ctx: LintContext): void {
  const filters = ctx.index.viewTreeFilters || [];
  if (filters.length === 0) return;

  const linkageMap = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageMap.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  for (const f of filters) {
    const entity = ctx.index.entitiesByFqid[f.entity];
    if (!entity) {
      emit(ctx, {
        ruleId: "view/tree-filter-entity-unknown",
        severity: "warning",
        category: "reference",
        rule: "tree filter.entity существует",
        message: `View «${f.viewId}»: tree filter.entity «${f.entity}» не найдена`,
        domainId: f.domainId,
        propertyPath: `${f.propertyPath}.entity`,
      });
      continue;
    }

    // ============ attributes ============
    for (const a of f.attributes) {
      if (SYSTEM_ATTRIBUTE_IDS.has(a.attribute)) continue;
      if (a.attribute.includes("/")) continue;

      const res = resolveAttributeRef(ctx, entity, a.attribute);
      if (!res.ok) {
        emit(ctx, {
          ruleId: "view/tree-filter-attribute-unknown",
          severity: "warning",
          category: "reference",
          rule: "tree filter.attributes[].attribute существует",
          message: `View «${f.viewId}»: tree filter.attribute «${a.attribute}» не найден в «${f.entity}»`,
          hint: "Проверьте id атрибута в attributes[] (или нотацию Entity.attr для родителя)",
          domainId: f.domainId,
          propertyPath: `${f.propertyPath}.attributes`,
        });
      }
    }

    // ============ linkages ============
    for (const lk of f.linkages) {
      if (!lk.linkage) continue;

      const linkageRecord = linkageMap.get(lk.linkage.toLowerCase());
      if (!linkageRecord && !lk.linkage.includes("/")) {
        emit(ctx, {
          ruleId: "view/tree-filter-linkage-unknown",
          severity: "warning",
          category: "reference",
          rule: "tree filter.linkages[].linkage существует",
          message: `View «${f.viewId}»: tree filter.linkage «${lk.linkage}» не найдена`,
          domainId: f.domainId,
          propertyPath: `${f.propertyPath}.linkages`,
        });
      }

      // linkAttributes — атрибуты самой связи
      if (linkageRecord && lk.linkAttributes) {
        const knownAttrs = new Set(
          (linkageRecord.attributes || []).map((a) => a.id),
        );
        for (const attrId of lk.linkAttributes) {
          if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) continue;
          if (!knownAttrs.has(attrId)) {
            emit(ctx, {
              ruleId: "view/tree-filter-linkage-attr-unknown",
              severity: "warning",
              category: "reference",
              rule: "tree filter.linkAttributes существует в связи",
              message: `View «${f.viewId}»: linkAttribute «${attrId}» не найден в связи «${lk.linkage}»`,
              domainId: f.domainId,
              propertyPath: `${f.propertyPath}.linkages`,
            });
          }
        }
      }

      // linkedEntity — атрибуты связанной сущности (противоположной стороны)
      if (linkageRecord && lk.linkedEntity) {
        const viewFqidLower = f.entity.toLowerCase();
        const oppositeFqid =
          linkageRecord.side1Fqid === viewFqidLower
            ? linkageRecord.side2Fqid
            : linkageRecord.side2Fqid === viewFqidLower
              ? linkageRecord.side1Fqid
              : linkageRecord.side1Fqid;

        const opposite = ctx.index.entitiesByFqid[oppositeFqid];
        if (opposite) {
          for (const attrId of lk.linkedEntity) {
            if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) continue;
            if (attrId.includes("/")) continue;

            const res = resolveAttributeRef(ctx, opposite, attrId);
            if (!res.ok) {
              emit(ctx, {
                ruleId: "view/tree-filter-linked-entity-attr-unknown",
                severity: "warning",
                category: "reference",
                rule: "tree filter.linkedEntity[].attribute существует",
                message: `View «${f.viewId}»: linkedEntity «${attrId}» не найден в «${oppositeFqid}»`,
                domainId: f.domainId,
                propertyPath: `${f.propertyPath}.linkages`,
              });
            }
          }
        }
      }
    }
  }
}

/**
 * Валидация tabs_list / dashboard / dashboard_tree:
 *   - ссылки на view в tabs[] и defaultTab;
 *   - ссылки на виджеты в dashboard.widgets[];
 *   - tree[].view / autoTree.entity / defaultItem в dashboard_tree.
 *
 * Отдельно от checkViews, т.к. проверки специфичны и опираются на уже
 * нормализованные поля DomainSchemaViewItem.
 */
function checkSpecialViews(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const topViews = schema?.sections?.views?.items || [];
    if (topViews.length === 0) continue;

    // view-id → type для этого домена (только top-level)
    const viewTypeMap = new Map<string, string>();
    for (const v of topViews) viewTypeMap.set(String(v.id), String(v.type));

    // Все id виджетов домена (view-level + domain-level).
    const widgetIds = new Set<string>();
    const viewElements = ctx.index.viewElementsByDomain?.[domainId];
    if (viewElements) {
      for (const byView of Object.values(viewElements)) {
        for (const w of byView.widgets || []) widgetIds.add(w);
      }
    }
    const domainWidgets = schema?.sections?.widgets?.items || [];
    for (const dw of domainWidgets) widgetIds.add(dw.id);

    for (const v of topViews) {
      const viewId = String(v.id);

      // ============ tree ============
      if (v.type === "tree") {
        const chunkSize = v.nodeChunkSize;
        if (chunkSize !== undefined) {
          if (!Number.isInteger(chunkSize) || chunkSize < 1) {
            emit(ctx, {
              ruleId: "view/tree-node-chunk-size-invalid",
              severity: "warning",
              category: "validation",
              rule: "nodeChunkSize — целое положительное число",
              message: `View «${viewId}»: nodeChunkSize = ${chunkSize}`,
              hint: "Допустимо целое число от 1 до 100",
              domainId,
              propertyPath: `views[${viewId}].nodeChunkSize`,
            });
          } else if (chunkSize > 100) {
            emit(ctx, {
              ruleId: "view/tree-node-chunk-size-too-big",
              severity: "warning",
              category: "validation",
              rule: "nodeChunkSize ≤ 100",
              message: `View «${viewId}»: nodeChunkSize = ${chunkSize} превышает 100`,
              hint: "максимальное допустимое значение — 100",
              domainId,
              propertyPath: `views[${viewId}].nodeChunkSize`,
            });
          }
        }
        continue;
      }

      // ============ tabs_list ============
      if (v.type === "tabs_list") {
        const tabs = v.tabs || [];

        for (const tabId of tabs) {
          if (tabId.includes("/")) continue; // кросс-домен не проверяем
          const t = viewTypeMap.get(tabId);
          if (!t) {
            emit(ctx, {
              ruleId: "view/tabs-list-view-unknown",
              severity: "error",
              category: "reference",
              rule: "tabs_list.tabs[].view существует",
              message: `View «${viewId}»: tabs[].view «${tabId}» не найден в домене`,
              domainId,
              propertyPath: `views[${viewId}].tabs`,
            });
          } else if (t !== "list") {
            emit(ctx, {
              ruleId: "view/tabs-list-view-type",
              severity: "warning",
              category: "semantic",
              rule: "tabs_list.tabs[].view — list",
              message: `View «${viewId}»: tabs[].view «${tabId}» имеет тип «${t}», ожидается list`,
              domainId,
              propertyPath: `views[${viewId}].tabs`,
            });
          }
        }

        if (v.defaultTab && !v.defaultTab.includes("/")) {
          const dt = v.defaultTab;
          if (!viewTypeMap.has(dt)) {
            emit(ctx, {
              ruleId: "view/tabs-list-default-unknown",
              severity: "error",
              category: "reference",
              rule: "tabs_list.defaultTab существует",
              message: `View «${viewId}»: defaultTab «${dt}» не найден в домене`,
              domainId,
              propertyPath: `views[${viewId}].defaultTab`,
            });
          } else if (!tabs.includes(dt)) {
            emit(ctx, {
              ruleId: "view/tabs-list-default-not-in-tabs",
              severity: "warning",
              category: "semantic",
              rule: "tabs_list.defaultTab присутствует в tabs[]",
              message: `View «${viewId}»: defaultTab «${dt}» отсутствует в tabs[]`,
              domainId,
              propertyPath: `views[${viewId}].defaultTab`,
            });
          }
        }
        continue;
      }

      // ============ dashboard ============
      if (v.type === "dashboard") {
        for (const wId of v.dashboardWidgets || []) {
          if (wId.startsWith("external:")) continue;
          if (wId.includes("/")) continue; // кросс-домен
          if (!widgetIds.has(wId)) {
            emit(ctx, {
              ruleId: "view/dashboard-widget-unknown",
              severity: "warning",
              category: "reference",
              rule: "dashboard.widgets[].widget существует",
              message: `View «${viewId}»: widget «${wId}» не найден ни в одном view и не объявлен в widgets[]`,
              hint: "Укажите id виджета из views[].widgets[] или из widgets[] (доменные виджеты)",
              domainId,
              propertyPath: `views[${viewId}].widgets`,
            });
          }
        }
        continue;
      }

      // ============ dashboard_tree ============
      if (v.type === "dashboard_tree") {
        for (const vId of v.dashboardTreeViews || []) {
          if (vId.includes("/")) continue;
          const t = viewTypeMap.get(vId);
          if (!t) {
            emit(ctx, {
              ruleId: "view/dashboard-tree-view-unknown",
              severity: "error",
              category: "reference",
              rule: "dashboard_tree.tree[].view существует",
              message: `View «${viewId}»: tree[].view «${vId}» не найден в домене`,
              domainId,
              propertyPath: `views[${viewId}].tree`,
            });
          } else if (t !== "dashboard" && t !== "list") {
            emit(ctx, {
              ruleId: "view/dashboard-tree-view-type",
              severity: "warning",
              category: "semantic",
              rule: "dashboard_tree.tree[].view — dashboard или list",
              message: `View «${viewId}»: tree[].view «${vId}» имеет тип «${t}», ожидается dashboard или list`,
              domainId,
              propertyPath: `views[${viewId}].tree`,
            });
          }
        }

        for (const entityRef of v.dashboardTreeAutoTreeEntities || []) {
          const fqid = entityRef.includes("/")
            ? entityRef.toLowerCase()
            : `${domainId}/${entityRef}`.toLowerCase();
          if (!ctx.index.entitiesByFqid[fqid]) {
            emit(ctx, {
              ruleId: "view/dashboard-tree-autotree-entity-unknown",
              severity: "error",
              category: "reference",
              rule: "dashboard_tree.tree[].autoTree.entity существует",
              message: `View «${viewId}»: autoTree.entity «${entityRef}» не найден`,
              domainId,
              propertyPath: `views[${viewId}].tree`,
            });
          }
        }

        // autoTree и children не должны сосуществовать.
        if (
          v.dashboardTreeHasAutoTree === true &&
          v.dashboardTreeHasChildren === true
        ) {
          emit(ctx, {
            ruleId: "view/dashboard-tree-autotree-with-children",
            severity: "error",
            category: "semantic",
            rule: "tree[].autoTree несовместим с tree[].children",
            message: `View «${viewId}»: в tree[] одновременно заданы autoTree и children`,
            hint: "Доступно только одно из полей на узел: autoTree или children",
            domainId,
            propertyPath: `views[${viewId}].tree`,
          });
        }

        if (v.defaultItem && !v.defaultItem.includes("/")) {
          const dt = v.defaultItem;
          const t = viewTypeMap.get(dt);
          if (!t) {
            emit(ctx, {
              ruleId: "view/dashboard-tree-default-item-unknown",
              severity: "error",
              category: "reference",
              rule: "dashboard_tree.defaultItem существует",
              message: `View «${viewId}»: defaultItem «${dt}» не найден в домене`,
              domainId,
              propertyPath: `views[${viewId}].defaultItem`,
            });
          } else if (t !== "dashboard") {
            emit(ctx, {
              ruleId: "view/dashboard-tree-default-item-type",
              severity: "warning",
              category: "semantic",
              rule: "dashboard_tree.defaultItem — dashboard",
              message: `View «${viewId}»: defaultItem «${dt}» имеет тип «${t}», ожидается dashboard`,
              domainId,
              propertyPath: `views[${viewId}].defaultItem`,
            });
          }
        }
        continue;
      }
    }
  }
}

interface JoinTargetInfo {
  /** FQID целевой сущности (после перехода). */
  targetFqid: string;
  /** FQID linkage, через который совершен переход. */
  linkageFqid: string;
}

/**
 * Строит карту `domainId#joinId` → JoinTargetInfo.
 * Для join из `transitiveLinkages` мы рекурсивно идём от `entity`,
 * для каждого join определяем child entity по linkage и `side`.
 *
 *   side=1 (default): parent на side1, child на side2
 *   side=2:           parent на side2, child на side1
 */
function buildJoinTargetIndex(ctx: LintContext): Map<string, JoinTargetInfo> {
  const map = new Map<string, JoinTargetInfo>();

  const linkageMap = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageMap.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  const getChildEntity = (
    linkageFqid: string,
    parentFqid: string,
    side: 1 | 2 | undefined,
  ): string | null => {
    const linkage = linkageMap.get(linkageFqid.toLowerCase());
    if (!linkage) return null;
    const parentLower = parentFqid.toLowerCase();
    const s1 = linkage.side1Fqid;
    const s2 = linkage.side2Fqid;

    // Симметричная (side1 === side2): parent === child.
    if (s1 === s2) {
      return s1 === parentLower ? s2 : null;
    }

    // Направленный случай: используем side, если задан, иначе parent→child
    // по умолчанию: parent на side1, child на side2 (side=1).
    const effectiveSide: 1 | 2 = side === 2 ? 2 : 1;
    const parentSide = effectiveSide === 1 ? s1 : s2;
    const childSide = effectiveSide === 1 ? s2 : s1;
    if (parentSide === parentLower) return childSide;
    // Fallback — если пользователь указал не тот side, но одна из сторон совпала
    if (s1 === parentLower) return s2;
    if (s2 === parentLower) return s1;
    return null;
  };

  const walk = (
    domainId: string,
    parentFqid: string,
    joins: any[] | undefined,
  ): void => {
    if (!joins) return;
    for (const j of joins) {
      if (!j || typeof j !== "object") continue;
      if (typeof j.id !== "string" || !j.id) continue;
      if (typeof j.linkage !== "string" || !j.linkage) continue;
      const linkageFqid = j.linkage.includes("/")
        ? j.linkage.toLowerCase()
        : `${domainId}/${j.linkage}`.toLowerCase();
      const child = getChildEntity(
        linkageFqid,
        parentFqid,
        j.side === 1 || j.side === 2 ? (j.side as 1 | 2) : undefined,
      );
      if (!child) continue;
      const key = `${domainId}#${j.id}`.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { targetFqid: child, linkageFqid });
      }
      walk(domainId, child, j.joins);
    }
  };

  for (const tl of ctx.index.transitiveLinkages || []) {
    walk(tl.domainId, tl.entity.toLowerCase(), tl.joins as any[]);
  }

  return map;
}

/**
 * Проверка `views[].widgets[type=linkage]`:
 *   - linkage существует (FQID-aware);
 *   - side задан для симметричной направленной связи;
 *   - side не задан для ненаправленной;
 *   - attributes[].attribute существует в linkage.attributes.
 *
 * Аналог проверок Zod (`Qt`), но в терминах линтера. Системные
 * атрибуты связи (`createdAt`, `updatedAt`, …) пропускаем.
 */
function checkViewLinkageRefs(ctx: LintContext): void {
  const widgets = ctx.index.viewWidgets || [];
  if (widgets.length === 0) return;

  const joinIndex = buildJoinTargetIndex(ctx);

  // target entity viewEntity (для widget.linkage без side)
  const getViewEntity = (w: ViewWidgetRecord): string | null => {
    const v = ctx.index.schemasByDomain[
      w.domainId
    ]?.sections?.views?.items?.find((v) => String(v.id) === w.parentViewId);
    if (!v) return null;
    if (v.type === "entity" && v.entity) {
      const e = String(v.entity);
      return e.includes("/")
        ? e.toLowerCase()
        : `${w.domainId}/${e}`.toLowerCase();
    }
    return null;
  };

  // Резолвит join-id по приоритету:
  //   1) view.source.joins (legacy) — у того же view
  //   2) transitiveLinkages (глобально)
  const resolveJoinTarget = (
    domainId: string,
    parentViewId: string,
    joinId: string,
    parentEntityFqid: string | null,
  ): { targetFqid: string; linkageFqid: string } | null => {
    // (1) legacy view.source.joins
    const legacy = (ctx.index.viewSourceJoins || []).find(
      (j) =>
        j.domainId === domainId && j.viewId === parentViewId && j.id === joinId,
    );
    if (legacy) {
      const linkage = ctx.index.entityLinkages.find(
        (l) =>
          `${l.domainId}/${l.id}`.toLowerCase() ===
          legacy.linkage.toLowerCase(),
      );
      if (!linkage) return null;
      const parentLower = (parentEntityFqid || "").toLowerCase();
      const child =
        linkage.side1Fqid === parentLower
          ? linkage.side2Fqid
          : linkage.side2Fqid === parentLower
            ? linkage.side1Fqid
            : linkage.side1Fqid;
      return { targetFqid: child, linkageFqid: legacy.linkage };
    }
    // (2) transitiveLinkages
    const key = `${domainId}#${joinId}`.toLowerCase();
    const info = joinIndex.get(key);
    if (info)
      return { targetFqid: info.targetFqid, linkageFqid: info.linkageFqid };
    return null;
  };

  for (const w of widgets) {
    // ============ type: join ============
    if (w.type === "join") {
      if (w.joinId) {
        const info = resolveJoinTarget(
          w.domainId,
          w.parentViewId,
          w.joinId,
          getViewEntity(w),
        );
        if (!info) {
          emit(ctx, {
            ruleId: "view/widget-join-unknown",
            severity: "warning",
            category: "reference",
            rule: "widget.joinId существует",
            message: `Виджет «${w.id}» во view «${w.parentViewId}»: joinId «${w.joinId}» не найден в view.source.joins или transitiveLinkages`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].joinId`,
          });
        }
      }
      if (w.openView) {
        const actionsDomain = ctx.index.actions.filter(
          (a) => a.domainId === w.domainId,
        );
        const target = actionsDomain.find((a) => a.id === w.openView);
        if (!target) {
          emit(ctx, {
            ruleId: "view/widget-join-openview-unknown",
            severity: "warning",
            category: "reference",
            rule: "widget.openView существует",
            message: `Виджет «${w.id}» во view «${w.parentViewId}»: openView «${w.openView}» не найден`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].openView`,
          });
        } else if (target.type !== "open_list" || !target.join) {
          emit(ctx, {
            ruleId: "view/widget-join-openview-not-open-list",
            severity: "warning",
            category: "semantic",
            rule: "widget.openView — open_list с join",
            message: `Виджет «${w.id}»: openView «${w.openView}» должен быть open_list с заданным join`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].openView`,
          });
        }
      }
      continue;
    }

    // ============ type: linked_objects_groups ============
    if (w.type === "linked_objects_groups") {
      for (const ref of w.linkedGroupsLinkages || []) {
        const linkageRecord = resolveLinkageRef(ctx, ref.linkage, w.domainId);
        if (!linkageRecord) {
          emit(ctx, {
            ruleId: "view/linked-groups-linkage-unknown",
            severity: "warning",
            category: "reference",
            rule: "widget.linkages[].linkage существует",
            message: `Виджет «${w.id}» во view «${w.parentViewId}»: linkage «${ref.linkage}» не найден`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].linkages`,
          });
          continue;
        }
        const isSymmetric = linkageRecord.side1Fqid === linkageRecord.side2Fqid;
        const isDirected = !(
          linkageRecord.type === "n_n" && linkageRecord.undirected
        );
        if (isSymmetric && isDirected && ref.side === undefined) {
          emit(ctx, {
            ruleId: "view/linked-groups-linkage-side-required",
            severity: "warning",
            category: "semantic",
            rule: "side задан для симметричной направленной связи",
            message: `Виджет «${w.id}»: linkage «${ref.linkage}» симметричная направленная — укажите side`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].linkages`,
          });
        }
      }
      continue;
    }

    // ============ type: linkage ============
    if (w.type !== "linkage") continue;

    const linkageRecord = w.linkage
      ? resolveLinkageRef(ctx, w.linkage, w.domainId)
      : null;

    if (w.linkage && !linkageRecord) {
      emit(ctx, {
        ruleId: "view/widget-linkage-unknown",
        severity: "warning",
        category: "reference",
        rule: "widget.linkage существует",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: linkage «${w.linkage}» не найден`,
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].linkage`,
      });
    }

    // ============ control.type=table обязателен columns[] и addLinksView ============
    if (w.controlType === "table") {
      if (!w.controlColumns || w.controlColumns.length === 0) {
        emit(ctx, {
          ruleId: "view/linkage-table-columns-missing",
          severity: "error",
          category: "required",
          rule: "linkage-виджет с control.type=table требует columns[]",
          message: `Виджет «${w.id}» во view «${w.parentViewId}»: control.type = table, но columns[] пуст`,
          hint: "Добавьте колонки: control: { type: table, columns: [...] }",
          domainId: w.domainId,
          propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
        });
      }
      if (!w.addLinksView) {
        emit(ctx, {
          ruleId: "view/linkage-table-addlinksview-missing",
          severity: "error",
          category: "required",
          rule: "linkage-виджет с control.type=table требует addLinksView",
          message: `Виджет «${w.id}» во view «${w.parentViewId}»: control.type = table, но addLinksView не задан`,
          hint: "Укажите список для выбора: control: { type: table, addLinksView: lists_xxx, ... }",
          domainId: w.domainId,
          propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.addLinksView`,
        });
      }
    }

    // ============ control.type=table + колонки ============
    if (w.controlType === "table" && w.controlColumns) {
      const viewEntity = getViewEntity(w);

      // Для linkage-виджета с заданным linkage: "своя" сущность от viewEntity
      const opposite = (() => {
        if (!linkageRecord || !viewEntity) return null;
        if (linkageRecord.side1Fqid === viewEntity)
          return linkageRecord.side2Fqid;
        if (linkageRecord.side2Fqid === viewEntity)
          return linkageRecord.side1Fqid;
        // viewEntity — в цепочке наследования? Упрощённо: не находим.
        return null;
      })();

      const linkageAttrs = linkageRecord?.attributes || [];
      const linkageAttrSet = new Set(linkageAttrs.map((a) => a.id));

      for (const col of w.controlColumns) {
        // (a) join — резолвим target entity
        if (col.join) {
          const info = resolveJoinTarget(
            w.domainId,
            w.parentViewId,
            col.join,
            viewEntity,
          );
          if (!info) {
            emit(ctx, {
              ruleId: "view/widget-column-join-unknown",
              severity: "warning",
              category: "reference",
              rule: "column.join существует",
              message: `Колонка «${col.id}» виджета «${w.id}»: join «${col.join}» не найден`,
              domainId: w.domainId,
              propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
            });
            continue;
          }
          if (col.attribute) {
            const targetEntity = ctx.index.entitiesByFqid[info.targetFqid];
            if (targetEntity && !col.attribute.includes("/")) {
              const res = resolveAttributeRef(ctx, targetEntity, col.attribute);
              if (!res.ok) {
                emit(ctx, {
                  ruleId: "view/widget-column-attr-unknown",
                  severity: "warning",
                  category: "reference",
                  rule: "column.attribute существует в target-entity join",
                  message: `Колонка «${col.id}»: attribute «${col.attribute}» не найден в «${info.targetFqid}»`,
                  domainId: w.domainId,
                  propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
                });
              }
            }
          }
          continue;
        }

        // (b) linkageAttribute — резолвим в widget.linkage.attributes
        if (col.linkageAttribute) {
          if (SYSTEM_ATTRIBUTE_IDS.has(col.linkageAttribute)) continue;
          if (!linkageRecord) continue; // уже отругали за widget.linkage
          if (!linkageAttrSet.has(col.linkageAttribute)) {
            emit(ctx, {
              ruleId: "view/widget-column-linkage-attr-unknown",
              severity: "warning",
              category: "reference",
              rule: "column.linkageAttribute существует в linkage.attributes",
              message: `Колонка «${col.id}»: linkageAttribute «${col.linkageAttribute}» не найден в связи «${w.linkage}»`,
              domainId: w.domainId,
              propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
            });
          }
          continue;
        }

        // (c) attribute — резолвим в противоположной сущности
        if (col.attribute && w.linkage) {
          if (!opposite) continue; // viewEntity не связан со связью
          if (col.attribute.includes("/")) continue;
          const targetEntity = ctx.index.entitiesByFqid[opposite];
          if (!targetEntity) continue;
          const res = resolveAttributeRef(ctx, targetEntity, col.attribute);
          if (!res.ok) {
            emit(ctx, {
              ruleId: "view/widget-column-attr-unknown",
              severity: "warning",
              category: "reference",
              rule: "column.attribute существует в противоположной сущности связи",
              message: `Колонка «${col.id}»: attribute «${col.attribute}» не найден в «${opposite}»`,
              domainId: w.domainId,
              propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
            });
          }
          continue;
        }

        // (d) без linkage — все колонки должны иметь join (Zod)
        if (!w.linkage && !col.join) {
          emit(ctx, {
            ruleId: "view/widget-column-join-required",
            severity: "error",
            category: "required",
            rule: "linkage-виджет без linkage требует join в колонках",
            message: `Колонка «${col.id}» виджета «${w.id}»: нет ни widget.linkage, ни column.join`,
            hint: "Укажите widget.linkage или column.join",
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.columns`,
          });
        }
      }
    }

    // ============ side (для linkage-виджета) ============
    if (linkageRecord) {
      const isSymmetric = linkageRecord.side1Fqid === linkageRecord.side2Fqid;
      const isDirected = !(
        linkageRecord.type === "n_n" && linkageRecord.undirected
      );
      if (isSymmetric && isDirected && w.side === undefined) {
        emit(ctx, {
          ruleId: "view/widget-linkage-side-required",
          severity: "warning",
          category: "semantic",
          rule: "side задан для симметричной направленной связи",
          message: `Виджет «${w.id}» во view «${w.parentViewId}»: linkage «${w.linkage}» симметричная направленная — укажите side`,
          domainId: w.domainId,
          propertyPath: `views[${w.parentViewId}].widgets[${w.id}].side`,
        });
      }
      if (!isDirected && w.side !== undefined) {
        emit(ctx, {
          ruleId: "view/widget-linkage-side-on-undirected",
          severity: "info",
          category: "semantic",
          rule: "side не задан для ненаправленной связи",
          message: `Виджет «${w.id}»: linkage «${w.linkage}» ненаправленная — side игнорируется`,
          domainId: w.domainId,
          propertyPath: `views[${w.parentViewId}].widgets[${w.id}].side`,
        });
      }
    }

    // ============ legacy attributes[].attribute ============
    if (
      w.linkageAttributes &&
      w.linkageAttributes.length > 0 &&
      linkageRecord
    ) {
      const known = new Set((linkageRecord.attributes || []).map((a) => a.id));
      for (const attrId of w.linkageAttributes) {
        if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) continue;
        if (!known.has(attrId)) {
          emit(ctx, {
            ruleId: "view/widget-linkage-attr-unknown",
            severity: "warning",
            category: "reference",
            rule: "widget.attributes[].attribute существует в связи",
            message: `Виджет «${w.id}»: linkage-attribute «${attrId}» не найден в связи «${w.linkage}»`,
            domainId: w.domainId,
            propertyPath: `views[${w.parentViewId}].widgets[${w.id}].attributes`,
          });
        }
      }
    }
  }
}

function checkViewColumns(ctx: LintContext): void {
  const columns = ctx.index.viewColumns || [];
  const widgets = ctx.index.viewWidgets || [];
  if (columns.length === 0 && widgets.length === 0) return;

  const viewEntitiesByDomain = buildViewEntitiesByDomain(ctx);

  // ============ tree_path: control.tree существует ============
  const treeIdsByDomain = new Map<string, Set<string>>();
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const set = new Set<string>();
    const trees = schema?.sections?.trees?.items || [];
    for (const t of trees) if (t.id) set.add(String(t.id));
    treeIdsByDomain.set(domainId, set);
  }

  for (const c of columns) {
    if (c.controlType === "tree_path" && c.controlTree) {
      if (!c.controlTree.includes("/")) {
        const known = treeIdsByDomain.get(c.domainId);
        if (known && !known.has(c.controlTree)) {
          emit(ctx, {
            ruleId: "view/column-tree-unknown",
            severity: "warning",
            category: "reference",
            rule: "control.tree существует в trees[]",
            message: `Колонка «${c.id}» во view «${c.viewId}»: tree «${c.controlTree}» не найден в домене`,
            hint: "Укажите id дерева из trees[] или FQID",
            domainId: c.domainId,
            propertyPath: `views[${c.viewId}].table.columns[${c.id}].control.tree`,
          });
        }
      }
    }

    // Колонки с join/linkageAttribute относятся к другой сущности
    // (связанной через связь), локально проверить нельзя — пропускаем.
    if (c.join || c.linkageAttribute) continue;
    if (!c.attribute) continue;
    if (SYSTEM_ATTRIBUTE_IDS.has(c.attribute)) continue;
    if (c.controlType === "tree_path") continue;
    // Кросс-доменные FQID (domain.tld/Entity.attr) не проверяем локально.
    if (c.attribute.includes("/")) continue;

    const viewEntities = viewEntitiesByDomain.get(c.domainId)?.get(c.viewId);
    if (!viewEntities || viewEntities.length === 0) continue;

    const res = resolveAttributeInView(ctx, viewEntities, c.attribute);
    if (!res.ok) {
      const entityLabel =
        viewEntities.length === 1
          ? viewEntities[0]
          : `${viewEntities.map((f) => f.split("/").pop()).join(", ")}`;
      emit(ctx, {
        ruleId: "view/column-attribute-unknown",
        severity: "warning",
        category: "reference",
        rule: "column.attribute существует в сущности представления",
        message:
          viewEntities.length === 1
            ? `Колонка «${c.id}» во view «${c.viewId}»: attribute «${c.attribute}» не найден в «${entityLabel}»`
            : `Колонка «${c.id}» во view «${c.viewId}»: attribute «${c.attribute}» не найден ни в одной из сущностей дерева (${entityLabel})`,
        hint: "Проверьте id атрибута в attributes[] соответствующей сущности (или нотацию Entity.attr для родителя)",
        domainId: c.domainId,
        propertyPath: `views[${c.viewId}].table.columns[${c.id}].attribute`,
      });
    }
  }

  // ============ attribute-виджеты в entity-view ============
  for (const w of widgets) {
    if (w.type !== "attribute") continue;
    if (!w.attribute) continue;
    if (w.controlType === "tree_path") continue;
    if (SYSTEM_ATTRIBUTE_IDS.has(w.attribute)) continue;
    if (w.attribute.includes("/")) continue;

    const viewEntities = viewEntitiesByDomain
      .get(w.domainId)
      ?.get(w.parentViewId);
    if (!viewEntities || viewEntities.length === 0) continue;

    const res = resolveAttributeInView(ctx, viewEntities, w.attribute);
    if (!res.ok) {
      const entityLabel =
        viewEntities.length === 1
          ? viewEntities[0]
          : `${viewEntities.map((f) => f.split("/").pop()).join(", ")}`;
      emit(ctx, {
        ruleId: "view/widget-attribute-unknown",
        severity: "warning",
        category: "reference",
        rule: "widget.attribute существует в сущности представления",
        message:
          viewEntities.length === 1
            ? `Виджет «${w.id}» во view «${w.parentViewId}»: attribute «${w.attribute}» не найден в «${entityLabel}»`
            : `Виджет «${w.id}» во view «${w.parentViewId}»: attribute «${w.attribute}» не найден ни в одной из сущностей (${entityLabel})`,
        hint: "Проверьте id атрибута в attributes[] соответствующей сущности (или нотацию Entity.attr для родителя)",
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].attribute`,
      });
    }
  }
}

// ============ exchangeSettings ============

/**
 * Валидация `exchangeSettings` (обмен данными).
 *
 * Проверки:
 *   - entities[].entityFqid существует в домене;
 *   - forExport — атрибут сущности (с учётом наследования) или системный;
 *   - upsertWith[] / ignoreAttributes[] — атрибуты сущности либо системные;
 *   - exportSystemAttributes[] — только системные имена, либо "all";
 *   - attributeFormats.* — непустые строки (формат Moment не проверяем).
 */
function checkExchangeSettings(ctx: LintContext): void {
  const map = ctx.index.exchangeSettingsByDomain || {};
  const domains = Object.keys(map);
  if (domains.length === 0) return;

  const SYSTEM_ATTRS_FOR_EXPORT = new Set([
    "id",
    "label",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
    "organizationId",
    "tenantId",
    "domainId",
    "entityId",
    "entityName",
    "version",
  ]);

  // ============ isSameOrAncestorSimple(a, b): a == b или a — предок b ============
  // Защита от циклов в inherits через seen.
  const isSameOrAncestorSimple = (
    ancestorFqid: string,
    descendantFqid: string,
  ): boolean => {
    if (!ancestorFqid || !descendantFqid) return false;
    if (ancestorFqid === descendantFqid) return true;
    const seen = new Set<string>();
    let cur: string | undefined = descendantFqid;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const e = ctx.index.entitiesByFqid[cur];
      if (!e || !e.inherits) return false;
      if (e.inherits === ancestorFqid) return true;
      cur = e.inherits;
    }
    return false;
  };

  // ============ Резолвер: ссылка на linkage (локально или FQID) ============
  // Возвращает exists = «линкейдж с таким id есть в индексе»
  //               touchesEntity = «этот линкейдж связан с entity с одной из сторон»
  const resolveLinkage = (
    domainId: string,
    item: string,
    entityFqid: string,
  ): { exists: boolean; touchesEntity: boolean } => {
    const trimmed = item.trim();
    if (!trimmed) return { exists: false, touchesEntity: false };

    const slash = trimmed.indexOf("/");
    const targetDomain =
      slash > 0
        ? trimmed.slice(0, slash).toLowerCase()
        : domainId.toLowerCase();
    const targetId = slash > 0 ? trimmed.slice(slash + 1) : trimmed;
    const normalizedId = targetId.toLowerCase();

    const linkage = ctx.index.entityLinkages.find(
      (l) =>
        l.domainId.toLowerCase() === targetDomain &&
        l.id.toLowerCase() === normalizedId,
    );
    if (!linkage) return { exists: false, touchesEntity: false };
    // Связь «касается» сущности, если её сторона — сама сущность,
    // её предок или её потомок (exchangeSettings родителя влияют
    // на наследников и наоборот).
    const touchesEntity =
      isSameOrAncestorSimple(entityFqid, linkage.side1Fqid) ||
      isSameOrAncestorSimple(entityFqid, linkage.side2Fqid) ||
      isSameOrAncestorSimple(linkage.side1Fqid, entityFqid) ||
      isSameOrAncestorSimple(linkage.side2Fqid, entityFqid);

    return { exists: true, touchesEntity };
  };

  // ============ Валидация одного элемента списка ============
  // Документация: upsertWith / ignoreAttributes — атрибуты И связи.
  const checkListedItem = (
    rawItem: string,
    entity: EntityRecord | undefined,
    entityFqid: string,
    displayId: string,
    domainId: string,
    fieldName: "upsertWith" | "ignoreAttributes",
  ): void => {
    if (!rawItem) return;
    if (SYSTEM_ATTRS_FOR_EXPORT.has(rawItem)) return;

    // 1) Пробуем как атрибут (с учётом наследования, FQID, Entity.attr)
    if (entity) {
      const attrRes = resolveAttributeRef(ctx, entity, rawItem);
      if (attrRes.ok) return;
    }

    // 2) Пробуем как linkage
    const lk = resolveLinkage(domainId, rawItem, entityFqid);
    if (lk.exists) {
      if (!lk.touchesEntity) {
        emit(ctx, {
          ruleId: `exchange/${fieldName}-linkage-not-related`,
          severity: "warning",
          category: "semantic",
          rule: `${fieldName}[]: связь должна касаться сущности`,
          message: `exchangeSettings.entities[${displayId}]: ${fieldName} «${rawItem}» — связь не связана с этой сущностью (ни напрямую, ни через наследование)`,
          hint: "Связь должна иметь эту сущность или её предка/потомка хотя бы с одной стороны",
          domainId,
          propertyPath: `exchangeSettings.entities[${displayId}].${fieldName}`,
        });
      }
      return;
    }

    // 3) Ни атрибут, ни связь
    emit(ctx, {
      ruleId: `exchange/${fieldName === "upsertWith" ? "upsert-with" : "ignore-attributes"}-unknown`,
      severity: "warning",
      category: "reference",
      rule: `${fieldName}[] — существующие атрибуты или связи`,
      message: `exchangeSettings.entities[${displayId}]: ${fieldName} «${rawItem}» не найден среди атрибутов и связей`,
      hint: "Перечислите через запятую id атрибутов, id связей или системные имена",
      domainId,
      propertyPath: `exchangeSettings.entities[${displayId}].${fieldName}`,
    });
  };

  for (const domainId of domains) {
    const es = map[domainId];
    if (!es) continue;

    for (const entry of es.entities) {
      const entity = ctx.index.entitiesByFqid[entry.entityFqid];
      const displayId = entry.entityIdRaw;

      if (!entity) {
        emit(ctx, {
          ruleId: "exchange/entity-unknown",
          severity: "error",
          category: "reference",
          rule: "entities[].entityFqid существует",
          message: `exchangeSettings: сущность «${displayId}» не найдена в домене`,
          domainId,
          propertyPath: `exchangeSettings.entities[${displayId}]`,
        });
        continue;
      }

      // ============ forExport — только атрибут (по докам) ============
      if (entry.forExport) {
        const res = resolveAttributeRef(ctx, entity, entry.forExport);
        if (!res.ok && !SYSTEM_ATTRS_FOR_EXPORT.has(entry.forExport)) {
          emit(ctx, {
            ruleId: "exchange/for-export-unknown",
            severity: "warning",
            category: "reference",
            rule: "forExport — существующий атрибут",
            message: `exchangeSettings.entities[${displayId}]: forExport «${entry.forExport}» не найден в сущности`,
            hint: "Укажите id атрибута (например, name) или системный атрибут",
            domainId,
            propertyPath: `exchangeSettings.entities[${displayId}].forExport`,
          });
        }
      }

      // ============ upsertWith[] — атрибуты И связи ============
      if (entry.upsertWith) {
        for (const item of entry.upsertWith) {
          checkListedItem(
            item,
            entity,
            entry.entityFqid,
            displayId,
            domainId,
            "upsertWith",
          );
        }
      }

      // ============ ignoreAttributes[] — атрибуты И связи ============
      if (entry.ignoreAttributes) {
        for (const item of entry.ignoreAttributes) {
          checkListedItem(
            item,
            entity,
            entry.entityFqid,
            displayId,
            domainId,
            "ignoreAttributes",
          );
        }
      }

      // ============ exportSystemAttributes[] — без изменений ============
      if (Array.isArray(entry.exportSystemAttributes)) {
        for (const item of entry.exportSystemAttributes) {
          if (!SYSTEM_ATTRS_FOR_EXPORT.has(item)) {
            emit(ctx, {
              ruleId: "exchange/export-system-attributes-unknown",
              severity: "warning",
              category: "semantic",
              rule: "exportSystemAttributes[] — только системные атрибуты",
              message: `exchangeSettings.entities[${displayId}]: exportSystemAttributes «${item}» — не системный`,
              hint: "Допустимы: id, label, createdAt, updatedAt, createdBy, updatedBy, organizationId, tenantId, domainId, entityId, entityName, version; либо all",
              domainId,
              propertyPath: `exchangeSettings.entities[${displayId}].exportSystemAttributes`,
            });
          }
        }
      }
    }
  }
}

// ============ DataTypes ============

/**
 * Валидация `dataTypes[]`:
 *   - Enum.view[].value ∈ values[], value уникален, color валиден;
 *   - Workflow: initial/finals[]/transitions[].from/.to ∈ statuses[];
 *     view[].status ∈ statuses[], status уникален, color валиден;
 *   - Table.view: columns[].id уникален; columns[].attribute ∈ attributes[];
 *     layout.width согласован; sortingBy.columns[].column ∈ columns[];
 *     sortingBy.default.column ∈ sortingBy.columns[]; paging.defaultSize ∈ sizes[];
 *     paging.sizes[] — целые положительные; rowHeight — целое положительное;
 *     maxRows — целое положительное.
 */
function checkDataTypes(ctx: LintContext): void {
  const dataTypes = ctx.index.dataTypes || [];
  if (dataTypes.length === 0) return;

  // CSS-цвет — либо #rgb/#rrggbb, либо цвет-функция/переменная, либо
  // именованный цвет (permissive, чтобы не шуметь на var(--accent) и rgb()).
  // Заменить существующую isColorLike на:
  function isZodCompatibleColor(s: string): boolean {
    if (!s || typeof s !== "string") return false;
    const t = s.trim();
    if (!t) return false;
    if (/^#[0-9a-f]{3}$/i.test(t)) return true;
    if (/^#[0-9a-f]{6}$/i.test(t)) return true;
    // named-цвета (упрощённая проверка — только ASCII-буквы)
    if (/^[a-z]+$/i.test(t)) return true;
    return false;
  }

  for (const dt of dataTypes) {
    // ============ Enum ============
    if (dt.kind === "Enum") {
      const valueIds = new Set(dt.values || []);
      const view = dt.enumView || [];
      const seen = new Set<string>();

      for (let i = 0; i < view.length; i++) {
        const v = view[i];
        if (!v.value) continue;

        if (!valueIds.has(v.value)) {
          emit(ctx, {
            ruleId: "dataType/enum-view-value-unknown",
            severity: "warning",
            category: "reference",
            rule: "view[].value существует в values[]",
            message: `Тип «${dt.id}»: view[${i}].value «${v.value}» не найден в values[]`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view[${i}].value`,
          });
        }
        if (seen.has(v.value)) {
          emit(ctx, {
            ruleId: "dataType/enum-view-duplicate-value",
            severity: "warning",
            category: "semantic",
            rule: "view[].value уникален",
            message: `Тип «${dt.id}»: view[].value «${v.value}» встречается дважды`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view`,
          });
        }
        seen.add(v.value);

        if (v.color && !isZodCompatibleColor(v.color)) {
          emit(ctx, {
            ruleId: "dataType/enum-view-color-invalid",
            severity: "warning",
            category: "validation",
            rule: "view[].color — валидный CSS-цвет",
            message: `Тип «${dt.id}»: view[${i}].color «${v.color}» не является CSS-цветом`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view[${i}].color`,
          });
        }
      }
      continue;
    }

    // ============ Workflow ============
    if (dt.kind === "Workflow") {
      const statusIds = new Set(dt.statuses || []);

      if (dt.initial && !statusIds.has(dt.initial)) {
        emit(ctx, {
          ruleId: "dataType/workflow-initial-unknown",
          severity: "error",
          category: "reference",
          rule: "initial существует в statuses[]",
          message: `Тип «${dt.id}»: initial «${dt.initial}» не найден в statuses[]`,
          domainId: dt.domainId,
          propertyPath: `dataTypes[${dt.id}].initial`,
        });
      }

      for (const f of dt.finals || []) {
        if (!statusIds.has(f)) {
          emit(ctx, {
            ruleId: "dataType/workflow-final-unknown",
            severity: "error",
            category: "reference",
            rule: "finals[] существуют в statuses[]",
            message: `Тип «${dt.id}»: final «${f}» не найден в statuses[]`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].finals`,
          });
        }
      }

      const transitions = dt.transitions || [];
      for (let i = 0; i < transitions.length; i++) {
        const tr = transitions[i];
        if (tr.from !== "*" && !statusIds.has(tr.from)) {
          emit(ctx, {
            ruleId: "dataType/workflow-transition-from-unknown",
            severity: "error",
            category: "reference",
            rule: "transitions[].from ∈ statuses[] или *",
            message: `Тип «${dt.id}»: transitions[${i}].from «${tr.from}» не найден`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].transitions[${i}].from`,
          });
        }
        if (tr.to !== "*" && !statusIds.has(tr.to)) {
          emit(ctx, {
            ruleId: "dataType/workflow-transition-to-unknown",
            severity: "error",
            category: "reference",
            rule: "transitions[].to ∈ statuses[] или *",
            message: `Тип «${dt.id}»: transitions[${i}].to «${tr.to}» не найден`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].transitions[${i}].to`,
          });
        }
      }

      const view = dt.workflowView || [];
      const seen = new Set<string>();
      for (let i = 0; i < view.length; i++) {
        const v = view[i];
        if (!v.status) continue;
        if (!statusIds.has(v.status)) {
          emit(ctx, {
            ruleId: "dataType/workflow-view-status-unknown",
            severity: "warning",
            category: "reference",
            rule: "view[].status существует в statuses[]",
            message: `Тип «${dt.id}»: view[${i}].status «${v.status}» не найден`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view[${i}].status`,
          });
        }
        if (seen.has(v.status)) {
          emit(ctx, {
            ruleId: "dataType/workflow-view-duplicate-status",
            severity: "warning",
            category: "semantic",
            rule: "view[].status уникален",
            message: `Тип «${dt.id}»: view[].status «${v.status}» встречается дважды`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view`,
          });
        }
        seen.add(v.status);
        if (v.color && !isZodCompatibleColor(v.color)) {
          emit(ctx, {
            ruleId: "dataType/workflow-view-color-invalid",
            severity: "warning",
            category: "validation",
            rule: "view[].color — валидный CSS-цвет",
            message: `Тип «${dt.id}»: view[${i}].color «${v.color}» не является CSS-цветом`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view[${i}].color`,
          });
        }
      }
      continue;
    }

    // ============ Table ============
    if (dt.kind === "Table") {
      if (
        dt.maxRows !== undefined &&
        (!Number.isInteger(dt.maxRows) || dt.maxRows < 1)
      ) {
        emit(ctx, {
          ruleId: "dataType/table-max-rows-invalid",
          severity: "warning",
          category: "validation",
          rule: "maxRows — целое положительное",
          message: `Тип «${dt.id}»: maxRows = ${dt.maxRows}`,
          domainId: dt.domainId,
          propertyPath: `dataTypes[${dt.id}].maxRows`,
        });
      }

      const view = dt.tableView;
      if (!view) continue;

      const attrIds = new Set(dt.columns || []);

      // ============ columns ============
      const colIds = new Set<string>();
      for (let i = 0; i < view.columns.length; i++) {
        const c = view.columns[i];

        if (colIds.has(c.id)) {
          emit(ctx, {
            ruleId: "dataType/table-view-column-id-duplicate",
            severity: "error",
            category: "semantic",
            rule: "view.columns[].id уникален",
            message: `Тип «${dt.id}»: view.columns id «${c.id}» встречается дважды`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view.columns`,
          });
        }
        colIds.add(c.id);

        if (c.attribute && !c.attribute.includes("/")) {
          if (!attrIds.has(c.attribute)) {
            emit(ctx, {
              ruleId: "dataType/table-view-column-attr-unknown",
              severity: "warning",
              category: "reference",
              rule: "view.columns[].attribute существует в attributes[]",
              message: `Тип «${dt.id}»: view.columns[${i}].attribute «${c.attribute}» не найден в attributes[]`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.columns[${i}].attribute`,
            });
          }
        }

        const w = c.layout?.width;
        if (w) {
          if (w.min !== undefined && w.max !== undefined && w.min > w.max) {
            emit(ctx, {
              ruleId: "dataType/table-view-column-width-min-gt-max",
              severity: "warning",
              category: "validation",
              rule: "width.min ≤ width.max",
              message: `Тип «${dt.id}»: колонка «${c.id}»: min (${w.min}) > max (${w.max})`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.columns[${i}].layout.width`,
            });
          }
          if (
            w.default !== undefined &&
            w.min !== undefined &&
            w.default < w.min
          ) {
            emit(ctx, {
              ruleId: "dataType/table-view-column-width-default-lt-min",
              severity: "warning",
              category: "validation",
              rule: "width.min ≤ width.default",
              message: `Тип «${dt.id}»: колонка «${c.id}»: default (${w.default}) < min (${w.min})`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.columns[${i}].layout.width`,
            });
          }
          if (
            w.default !== undefined &&
            w.max !== undefined &&
            w.default > w.max
          ) {
            emit(ctx, {
              ruleId: "dataType/table-view-column-width-default-gt-max",
              severity: "warning",
              category: "validation",
              rule: "width.default ≤ width.max",
              message: `Тип «${dt.id}»: колонка «${c.id}»: default (${w.default}) > max (${w.max})`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.columns[${i}].layout.width`,
            });
          }
        }
      }

      // ============ sortingBy ============
      const sortingBy = view.sortingBy;
      if (sortingBy) {
        for (let i = 0; i < sortingBy.columns.length; i++) {
          const sc = sortingBy.columns[i];
          if (sc.column && !colIds.has(sc.column)) {
            emit(ctx, {
              ruleId: "dataType/table-view-sorting-column-unknown",
              severity: "warning",
              category: "reference",
              rule: "sortingBy.columns[].column существует в view.columns[]",
              message: `Тип «${dt.id}»: sortingBy[${i}].column «${sc.column}» не найден в columns[]`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.sortingBy.columns[${i}].column`,
            });
          }
        }
        if (sortingBy.defaultColumn) {
          if (!colIds.has(sortingBy.defaultColumn)) {
            emit(ctx, {
              ruleId: "dataType/table-view-sorting-default-unknown",
              severity: "warning",
              category: "reference",
              rule: "sortingBy.default.column существует в view.columns[]",
              message: `Тип «${dt.id}»: default.column «${sortingBy.defaultColumn}» не найден в columns[]`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.sortingBy.default`,
            });
          }
          const inList = sortingBy.columns.some(
            (c) => c.column === sortingBy.defaultColumn,
          );
          if (!inList) {
            emit(ctx, {
              ruleId: "dataType/table-view-sorting-default-not-in-list",
              severity: "warning",
              category: "semantic",
              rule: "sortingBy.default.column ∈ sortingBy.columns[]",
              message: `Тип «${dt.id}»: default.column «${sortingBy.defaultColumn}» отсутствует в sortingBy.columns[]`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.sortingBy.default`,
            });
          }
        }
      }

      // ============ paging ============
      const paging = view.paging;
      if (paging) {
        for (let i = 0; i < paging.rawSizes.length; i++) {
          const raw = paging.rawSizes[i];
          const n = typeof raw === "number" ? raw : Number(raw);
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
            emit(ctx, {
              ruleId: "dataType/table-view-paging-size-invalid",
              severity: "error",
              category: "validation",
              rule: "paging.sizes[] — целые положительные",
              message: `Тип «${dt.id}»: sizes[${i}] = «${String(raw)}»`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.paging.sizes`,
            });
          }
        }
        if (paging.rawDefaultSize !== undefined) {
          const n =
            typeof paging.rawDefaultSize === "number"
              ? paging.rawDefaultSize
              : Number(paging.rawDefaultSize);
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
            emit(ctx, {
              ruleId: "dataType/table-view-paging-default-invalid",
              severity: "error",
              category: "validation",
              rule: "paging.defaultSize — целое положительное",
              message: `Тип «${dt.id}»: defaultSize = «${String(paging.rawDefaultSize)}»`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.paging.defaultSize`,
            });
          } else if (paging.sizes.length > 0 && !paging.sizes.includes(n)) {
            emit(ctx, {
              ruleId: "dataType/table-view-paging-default-not-in-sizes",
              severity: "warning",
              category: "semantic",
              rule: "paging.defaultSize ∈ paging.sizes[]",
              message: `Тип «${dt.id}»: defaultSize (${n}) отсутствует в sizes[] (${paging.sizes.join(", ")})`,
              domainId: dt.domainId,
              propertyPath: `dataTypes[${dt.id}].view.paging.defaultSize`,
            });
          }
        }
      }

      // ============ rowHeight ============
      if (view.rowHeight !== undefined) {
        if (!Number.isInteger(view.rowHeight) || view.rowHeight < 1) {
          emit(ctx, {
            ruleId: "dataType/table-view-row-height-invalid",
            severity: "warning",
            category: "validation",
            rule: "view.rowHeight — целое положительное",
            message: `Тип «${dt.id}»: rowHeight = ${view.rowHeight}`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].view.rowHeight`,
          });
        }
      }
    }
  }
}

function checkViews(ctx: LintContext): void {
  // Индексы: domainId → parentViewId → [records]
  const groupsByView = new Map<string, Map<string, ViewGroupRecord[]>>();
  for (const g of ctx.index.viewGroups || []) {
    if (!groupsByView.has(g.domainId)) groupsByView.set(g.domainId, new Map());
    const byView = groupsByView.get(g.domainId)!;
    if (!byView.has(g.parentViewId)) byView.set(g.parentViewId, []);
    byView.get(g.parentViewId)!.push(g);
  }

  const widgetsByView = new Map<string, Map<string, ViewWidgetRecord[]>>();
  for (const w of ctx.index.viewWidgets || []) {
    if (!widgetsByView.has(w.domainId))
      widgetsByView.set(w.domainId, new Map());
    const byView = widgetsByView.get(w.domainId)!;
    if (!byView.has(w.parentViewId)) byView.set(w.parentViewId, []);
    byView.get(w.parentViewId)!.push(w);
  }

  const actionPanelsByView = new Map<
    string,
    Map<string, ViewActionPanelRecord[]>
  >();
  for (const ap of ctx.index.viewActionPanels || []) {
    if (!actionPanelsByView.has(ap.domainId))
      actionPanelsByView.set(ap.domainId, new Map());
    const byView = actionPanelsByView.get(ap.domainId)!;
    if (!byView.has(ap.viewId)) byView.set(ap.viewId, []);
    byView.get(ap.viewId)!.push(ap);
  }

  // ============ Widget types / control types / attribute ============
  for (const w of ctx.index.viewWidgets || []) {
    // type
    if (w.type && !VIEW_WIDGET_TYPES.has(w.type)) {
      emit(ctx, {
        ruleId: "view/widget-unknown-type",
        severity: "warning",
        category: "semantic",
        rule: "widget.type — валидный enum",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: неизвестный type «${w.type}»`,
        hint: "Допустимые: attribute, action, linkage, linkage_list, join, …",
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].type`,
      });
    }

    // control.type
    if (w.controlType && !VIEW_CONTROL_TYPES.has(w.controlType)) {
      emit(ctx, {
        ruleId: "view/widget-unknown-control-type",
        severity: "warning",
        category: "semantic",
        rule: "widget.control.type — валидный enum",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: неизвестный control.type «${w.controlType}»`,
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.type`,
      });
    }
  }

  // ============ View types + nested refs ============
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    // Top-level view types
    const topViews = schema?.sections?.views?.items || [];
    for (const v of topViews) {
      if (!v.type) continue;
      if (!VIEW_TOP_TYPES.has(String(v.type))) {
        emit(ctx, {
          ruleId: "view/unknown-top-type",
          severity: "warning",
          category: "semantic",
          rule: "view.type (top-level) — валидный enum",
          message: `View «${v.id}»: неизвестный type «${v.type}»`,
          hint: "Допустимые: entity, list, tree, tabs_list, dashboard, dashboard_tree",
          domainId,
          propertyPath: `views[${v.id}].type`,
        });
      }
    }

    if (!Array.isArray(schema?.allViews)) continue;

    // Индекс top-level view по id — для поиска entity
    const topViewById = new Map<string, any>();
    for (const v of topViews) topViewById.set(v.id, v);

    const groupsOfTopView = (topViewId: string): ViewGroupRecord[] =>
      groupsByView.get(domainId)?.get(topViewId) || [];

    const findGroup = (
      topViewId: string,
      groupId: string,
      expectedType: string,
    ): ViewGroupRecord | null => {
      const list = groupsOfTopView(topViewId);
      return (
        list.find((g) => g.id === groupId && g.type === expectedType) || null
      );
    };

    const groupExists = (topViewId: string, groupId: string): boolean =>
      groupsOfTopView(topViewId).some((g) => g.id === groupId);

    // ============ Индексы для fix: list/tree → action-widgets entity-view ============
    // entityFqid → entityViewId
    const entityViewByEntity = new Map<string, string>();
    for (const tv of topViews) {
      if (tv.type === "entity" && tv.entity) {
        const fqid = String(tv.entity).includes("/")
          ? String(tv.entity).toLowerCase()
          : `${domainId}/${tv.entity}`.toLowerCase();
        entityViewByEntity.set(fqid, tv.id);
      }
    }

    // treeId → rootEntity (fqid)
    const treeRootEntity = new Map<string, string>();
    const treesSection = schema?.sections?.trees?.items || [];
    for (const t of treesSection) {
      if (t.id && t.rootEntity) {
        treeRootEntity.set(String(t.id), String(t.rootEntity).toLowerCase());
      }
    }

    const widgetsByTopView = widgetsByView.get(domainId);

    /** Пул action-виджетов, доступных list/tree view по ссылке. */
    const getActionWidgetPool = (v: {
      type: string;
      sourceEntity?: string;
      tree?: string;
    }): Set<string> => {
      let entityFqid: string | null = null;

      if (v.type === "list" && v.sourceEntity) {
        entityFqid = v.sourceEntity.includes("/")
          ? v.sourceEntity.toLowerCase()
          : `${domainId}/${v.sourceEntity}`.toLowerCase();
      } else if (v.type === "tree" && v.tree) {
        entityFqid = treeRootEntity.get(v.tree) || null;
      }

      const pool = new Set<string>();

      if (entityFqid) {
        const entityViewId = entityViewByEntity.get(entityFqid);
        if (entityViewId) {
          const widgets = widgetsByTopView?.get(entityViewId) || [];
          for (const w of widgets) pool.add(w.id);
          return pool;
        }
      }

      // Fallback: entity-view не найден → все action-виджеты домена
      // (то же поведение, что в collectViewElements до этого PR).
      if (widgetsByTopView) {
        for (const viewWidgets of widgetsByTopView.values()) {
          for (const w of viewWidgets) {
            if (w.type === "action") pool.add(w.id);
          }
        }
      }
      return pool;
    };

    for (const v of schema.allViews) {
      const isNested = !!v.parentViewId;

      // Nested view type
      if (isNested && v.type && !VIEW_NESTED_TYPES.has(String(v.type))) {
        emit(ctx, {
          ruleId: "view/unknown-nested-type",
          severity: "warning",
          category: "semantic",
          rule: "nested view.type — panel | modal | page",
          message: `Nested view «${v.id}»: неизвестный type «${v.type}»`,
          domainId,
          propertyPath: `views[${v.parentViewId}].views[${v.id}].type`,
        });
      }

      // source.entity (list)
      if (v.type === "list" && v.sourceEntity) {
        const fqid = v.sourceEntity.includes("/")
          ? v.sourceEntity.toLowerCase()
          : `${domainId}/${v.sourceEntity}`.toLowerCase();
        if (!ctx.index.entitiesByFqid[fqid]) {
          emit(ctx, {
            ruleId: "view/source-entity-unknown",
            severity: "error",
            category: "reference",
            rule: "source.entity существует",
            message: `View «${v.id}»: source.entity «${v.sourceEntity}» не найдена`,
            domainId,
            propertyPath: `views[${v.id}].source.entity`,
          });
        }
      }

      // actionPanel[].widget — на любом view
      const apWidgets = v.actionPanelWidgets || [];
      if (apWidgets.length > 0) {
        // Для top-level view берём sourceEntity/tree из sections.views.items,
        // для nested — этих полей нет (и не нужно: они ищутся в parentViewId).
        const topLevelMeta = v.parentViewId ? null : topViewById.get(v.id);

        let knownWidgetIds: Set<string>;

        if (v.type === "list" || v.type === "tree") {
          knownWidgetIds = getActionWidgetPool({
            type: v.type,
            sourceEntity: topLevelMeta?.sourceEntity,
            tree: topLevelMeta?.tree,
          });
          // Плюс собственные виджеты (если вдруг заданы прямо на list/tree)
          const ownWidgets = widgetsByTopView?.get(v.id) || [];
          for (const w of ownWidgets) knownWidgetIds.add(w.id);
        } else {
          const topViewId = v.parentViewId || v.id;
          const widgets = widgetsByTopView?.get(topViewId) || [];
          knownWidgetIds = new Set(widgets.map((w) => w.id));
        }

        for (const wid of apWidgets) {
          if (wid.startsWith("external:")) continue;
          if (wid.includes("/")) continue;
          if (!knownWidgetIds.has(wid)) {
            emit(ctx, {
              ruleId: "view/action-panel-widget-unknown",
              severity: "warning",
              category: "reference",
              rule: "actionPanel[].widget существует",
              message: `View «${v.id}»: actionPanel.widget «${wid}» не найден в доступном пуле виджетов`,
              hint:
                v.type === "list" || v.type === "tree"
                  ? "Виджет должен быть объявлен в entity-view соответствующей сущности (или задан как FQID на другой домен)"
                  : "Проверьте id виджета в widgets[] соответствующего view",
              domainId,
              propertyPath: `views[${v.id}].actionPanel`,
            });
          }
        }
      }

      // ============ Только nested: form / block / tabs / pinnedBlock ============
      if (!isNested || !v.parentViewId) continue;

      // modal.form
      if (v.type === "modal" && v.form) {
        if (!findGroup(v.parentViewId, v.form, "form")) {
          emit(ctx, {
            ruleId: "view/modal-form-unknown",
            severity: "error",
            category: "reference",
            rule: "modal.form — существующая группа type: form",
            message: `View «${v.id}»: form «${v.form}» не найден или не типа form`,
            domainId,
            propertyPath: `views[${v.parentViewId}].views[${v.id}].form`,
          });
        }
      }

      // page: block и tabs не одновременно
      if (v.type === "page" && v.block && v.tabs && v.tabs.length > 0) {
        emit(ctx, {
          ruleId: "view/page-block-and-tabs",
          severity: "error",
          category: "semantic",
          rule: "page не может одновременно иметь block и tabs",
          message: `View «${v.id}»: одновременно заданы block и tabs`,
          domainId,
          propertyPath: `views[${v.parentViewId}].views[${v.id}]`,
        });
      }

      if (v.type === "page" && v.block) {
        if (!findGroup(v.parentViewId, v.block, "block")) {
          emit(ctx, {
            ruleId: "view/page-block-unknown",
            severity: "error",
            category: "reference",
            rule: "page.block — существующая группа type: block",
            message: `View «${v.id}»: block «${v.block}» не найден или не типа block`,
            domainId,
            propertyPath: `views[${v.parentViewId}].views[${v.id}].block`,
          });
        }
      }

      if (v.type === "page" && Array.isArray(v.tabs)) {
        for (const tabId of v.tabs) {
          if (!findGroup(v.parentViewId, tabId, "tab")) {
            emit(ctx, {
              ruleId: "view/page-tab-unknown",
              severity: "error",
              category: "reference",
              rule: "page.tabs[].tab — существующая группа type: tab",
              message: `View «${v.id}»: tab «${tabId}» не найден или не типа tab`,
              domainId,
              propertyPath: `views[${v.parentViewId}].views[${v.id}].tabs`,
            });
          }
        }
      }

      if (v.type === "page" && v.pinnedBlock) {
        if (!findGroup(v.parentViewId, v.pinnedBlock, "block")) {
          emit(ctx, {
            ruleId: "view/pinned-block-unknown",
            severity: "error",
            category: "reference",
            rule: "pinnedView.block — существующая группа type: block",
            message: `View «${v.id}»: pinnedView.block «${v.pinnedBlock}» не найден или не типа block`,
            domainId,
            propertyPath: `views[${v.parentViewId}].views[${v.id}].pinnedView.block`,
          });
        }
      }
    }

    // ============ Group types ============
    for (const g of ctx.index.viewGroups || []) {
      if (g.domainId !== domainId) continue;
      if (!g.type) continue;
      if (!VIEW_GROUP_TYPES.has(g.type)) {
        emit(ctx, {
          ruleId: "view/group-unknown-type",
          severity: "warning",
          category: "semantic",
          rule: "group.type — валидный enum",
          message: `Группа «${g.id}» во view «${g.parentViewId}»: неизвестный type «${g.type}»`,
          hint: "Допустимые: block, form, tab, tabs, resizable_block_pair",
          domainId,
          propertyPath: `views[${g.parentViewId}].groups[${g.id}].type`,
        });
      }
    }
  }
}

// ============ RQL в условиях правил (DataRules + UiRules) ============

function checkRqlConditions(ctx: LintContext): void {
  // --- DataRules ---
  for (const dr of ctx.index.dataRules || []) {
    const rawCond = dr.condition;
    if (typeof rawCond === "boolean") continue; // literal true/false — уже покрыто checkDataRuleCondition
    const condition = String(rawCond || "").trim();
    if (!condition) continue; // уже покрыто checkDataRuleCondition (condition-empty)

    let entityId: string | null = null;
    if (dr.entity) {
      const slash = dr.entity.indexOf("/");
      entityId = slash >= 0 ? dr.entity.slice(slash + 1) : dr.entity;
    }

    let issues;
    try {
      issues = checkRqlExpression(condition, 1, {
        entityId,
        modelIndex: ctx.index,
      });
    } catch {
      continue;
    }

    for (const issue of issues) {
      emit(ctx, {
        ruleId:
          issue.severity === "error"
            ? "rql/syntax-error"
            : "rql/context-warning",
        severity: issue.severity,
        category: "semantic",
        rule: "RQL-выражение корректно",
        message: `правило «${dr.id}», condition: ${issue.message}`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].condition`,
      });
    }
  }

  // --- UiRules ---
  for (const ur of ctx.index.uiRules || []) {
    const rawCond = ur.condition;
    if (typeof rawCond === "boolean") continue;
    const condition = String(rawCond || "").trim();
    if (!condition) continue;

    let entityId: string | null = null;
    if (
      ur.contextData &&
      ur.contextData.type === "entity" &&
      ur.contextData.entity
    ) {
      const slash = ur.contextData.entity.indexOf("/");
      entityId =
        slash >= 0
          ? ur.contextData.entity.slice(slash + 1)
          : ur.contextData.entity;
    }

    let issues;
    try {
      issues = checkRqlExpression(condition, 1, {
        entityId,
        modelIndex: ctx.index,
      });
    } catch {
      continue;
    }

    for (const issue of issues) {
      emit(ctx, {
        ruleId:
          issue.severity === "error"
            ? "rql/syntax-error"
            : "rql/context-warning",
        severity: issue.severity,
        category: "semantic",
        rule: "RQL-выражение корректно",
        message: `правило «${ur.id}», condition: ${issue.message}`,
        domainId: ur.domainId,
        propertyPath: `uiRules[${ur.id}].condition`,
      });
    }
  }
}

function checkDataRuleTarget(ctx: LintContext, dr: DataRuleRecord): void {
  // ============ target: linkage ============
  if (dr.target === "linkage") {
    if (!dr.linkage) {
      emit(ctx, {
        ruleId: "dataRule/linkage-missing",
        severity: "error",
        category: "required",
        rule: "target: linkage требует linkage",
        message: `правило «${dr.id}»: target = linkage, но linkage не указана`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].linkage`,
      });
      return;
    }

    const linkage = ctx.index.entityLinkages.find(
      (l) =>
        `${l.domainId}/${l.id}`.toLowerCase() === dr.linkage!.toLowerCase(),
    );
    if (!linkage) {
      emit(ctx, {
        ruleId: "dataRule/linkage-unknown",
        severity: "error",
        category: "reference",
        rule: "linkage правила существует",
        message: `правило «${dr.id}»: linkage = "${dr.linkage}" не найдена`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].linkage`,
      });
      return;
    }

    if (dr.effect === "default") {
      emit(ctx, {
        ruleId: "dataRule/linkage-default-unsupported",
        severity: "error",
        category: "semantic",
        rule: "effect: default не поддерживается для target: linkage",
        message: `правило «${dr.id}»: effect = default с target = linkage`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.effect`,
      });
    }
    // attributes[] валидируется отдельно в checkDataRuleEffectAttributes
    return;
  }

  // ============ target: entity / entityAttribute (как было) ============
  if (!dr.entity) {
    emit(ctx, {
      ruleId: "dataRule/entity-missing",
      severity: "error",
      category: "required",
      rule: "У правила задана entity",
      message: `правило «${dr.id}»: не указано entity`,
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].entity`,
    });
    return;
  }

  const entity = ctx.index.entitiesByFqid[dr.entity];
  if (!entity) {
    emit(ctx, {
      ruleId: "dataRule/entity-unknown",
      severity: "error",
      category: "reference",
      rule: "entity правила существует",
      message: `правило «${dr.id}»: entity = "${dr.entity}" не найдена`,
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].entity`,
    });
    return;
  }

  if (dr.target === "entity") {
    const hasAttrs = Array.isArray(dr.attributes) && dr.attributes.length > 0;
    const hasLinkages = Array.isArray(dr.linkages) && dr.linkages.length > 0;
    if (!hasAttrs && !hasLinkages) {
      emit(ctx, {
        ruleId: "dataRule/entity-target-empty",
        severity: "error",
        category: "required",
        rule: "У target: entity заданы attributes или linkages",
        message: `правило «${dr.id}»: нет ни attributes[], ни linkages[] — правило ни на что не действует`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule`,
      });
    }
  }

  if (dr.target === "entityAttribute") {
    if (!dr.attribute) {
      emit(ctx, {
        ruleId: "dataRule/attribute-missing",
        severity: "error",
        category: "required",
        rule: "У target: entityAttribute задан attribute",
        message: `правило «${dr.id}»: не указано attribute`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].attribute`,
      });
    } else {
      const attr = findAttributeWithInheritance(ctx, entity.fqid, dr.attribute);
      if (!attr) {
        emit(ctx, {
          ruleId: "dataRule/attribute-unknown",
          severity: "error",
          category: "reference",
          rule: "attribute правила существует",
          message: `правило «${dr.id}»: attribute = "${dr.attribute}" не найден в ${entity.fqid}`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].attribute`,
        });
      } else if (attr.dataType !== "Table" && attr.dataType !== "Array") {
        emit(ctx, {
          ruleId: "dataRule/attribute-not-table-or-array",
          severity: "error",
          category: "semantic",
          rule: "attribute — Table или Array",
          message: `правило «${dr.id}»: attribute "${dr.attribute}" имеет тип "${attr.dataType}", ожидается Table или Array`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].attribute`,
        });
      } else if (dr.nested) {
        const expected = attr.dataType === "Array" ? "array" : "table";
        if (dr.nested.type !== expected) {
          emit(ctx, {
            ruleId: "dataRule/nested-type-mismatch",
            severity: "warning",
            category: "semantic",
            rule: "nested.type соответствует типу атрибута",
            message: `правило «${dr.id}»: атрибут "${dr.attribute}" — ${attr.dataType}, а nested.type = "${dr.nested.type}"`,
            domainId: dr.domainId,
            propertyPath: `dataRules[${dr.id}].rule.nested.type`,
          });
        }
      }
    }
    if (dr.effect === "allowed") {
      emit(ctx, {
        ruleId: "dataRule/entity-attribute-allowed-unsupported",
        severity: "error",
        category: "semantic",
        rule: "entityAttribute + allowed не поддерживается",
        message: `правило «${dr.id}»: для target: entityAttribute effect: allowed не поддерживается`,
        hint: "Используйте target: entity для effect: allowed",
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.effect`,
      });
    }
  }
}

function checkTableAttributeConstraints(ctx: LintContext): void {
  const ALLOWED = new Set(["required", "unique"]);
  for (const dt of ctx.index.dataTypes) {
    if (dt.kind !== "Table") continue;
    for (const a of dt.tableAttributes || []) {
      for (const c of a.constraintDetails || []) {
        if (!ALLOWED.has(c.kind)) {
          emit(ctx, {
            ruleId: "dataType/table-attribute-constraint-invalid",
            severity: "error",
            category: "semantic",
            rule: "Для Table-атрибутов допустимы только required | unique",
            message: `Тип «${dt.id}», колонка «${a.id}»: constraint «${c.kind}» не поддерживается`,
            domainId: dt.domainId,
            propertyPath: `dataTypes[${dt.id}].attributes[${a.id}].constraints`,
          });
        }
      }
    }
  }
}

function checkEntitySortingRql(ctx: LintContext): void {
  for (const e of ctx.index.entities) {
    for (const s of e.sorting || []) {
      for (const b of s.by) {
        const attr = findAttributeWithInheritance(ctx, e.fqid, b.attribute);
        if (attr && attr.dataType === "RQL") {
          emit(ctx, {
            ruleId: "entity/sorting-attribute-rql",
            severity: "error",
            category: "semantic",
            rule: "RQL не используется в сортировке",
            message: `Сущность «${e.entityId}», sorting[${s.id}]: attribute «${b.attribute}» имеет тип RQL`,
            domainId: e.domainId,
            entityFqid: e.fqid,
            propertyPath: `entities[${e.entityId}].sorting[${s.id}].by`,
          });
        }
      }
    }
  }
}

function checkEntityExternals(ctx: LintContext): void {
  for (const e of ctx.index.entities) {
    for (const fqid of e.externals?.entities || []) {
      if (!ctx.index.entitiesByFqid[fqid]) {
        emit(ctx, {
          ruleId: "entity/externals-entity-unknown",
          severity: "error",
          category: "reference",
          rule: "externals.entities[] — существующие сущности",
          message: `Сущность «${e.entityId}»: externals «${fqid}» не найдена`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].externals.entities`,
        });
      }
    }
  }
}

function checkEntityBindAliases(ctx: LintContext): void {
  for (const e of ctx.index.entities) {
    if (!e.bind?.aliases) continue;
    const seenInternal = new Set<string>();
    const seenExternal = new Set<string>();
    for (const al of e.bind.aliases) {
      if (seenInternal.has(al.internal)) {
        emit(ctx, {
          ruleId: "entity/bind-alias-duplicate",
          severity: "error",
          category: "semantic",
          rule: "bind.aliases[].internal уникален",
          message: `Сущность «${e.entityId}»: bind.aliases.internal «${al.internal}» повторяется`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].bind.aliases`,
        });
      }
      seenInternal.add(al.internal);

      if (seenExternal.has(al.external)) {
        emit(ctx, {
          ruleId: "entity/bind-alias-duplicate",
          severity: "error",
          category: "semantic",
          rule: "bind.aliases[].external уникален",
          message: `Сущность «${e.entityId}»: bind.aliases.external «${al.external}» повторяется`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].bind.aliases`,
        });
      }
      seenExternal.add(al.external);
    }
  }
}

function checkViewLabelTemplates(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const allViews = schema?.allViews || [];
    for (const v of allViews) {
      if (!v.label || !v.entity) continue;
      const entityFqid = v.entity.includes("/")
        ? v.entity.toLowerCase()
        : `${domainId}/${v.entity}`.toLowerCase();
      const entity = ctx.index.entitiesByFqid[entityFqid];
      if (!entity) continue;

      const placeholders = [...v.label.matchAll(/{(.+?)}/g)].map((m) =>
        m[1].trim(),
      );
      for (const ph of placeholders) {
        if (SYSTEM_ATTRIBUTE_IDS.has(ph)) continue;
        const res = resolveAttributeRef(ctx, entity, ph);
        if (!res.ok) {
          emit(ctx, {
            ruleId: "view/label-template-unknown",
            severity: "warning",
            category: "reference",
            rule: "label ссылается на существующий атрибут",
            message: `View «${v.id}»: label ссылается на «${ph}» — ${res.reason}`,
            domainId,
            propertyPath: `views[${v.parentViewId || ""}].views[${v.id}].label`,
          });
        }
      }
    }
  }
}

function checkCounterColorSingular(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    if (schema?.flags?.hasCounterColorPattern) {
      emit(ctx, {
        ruleId: "counterColorPattern/legacy-singular",
        severity: "warning",
        category: "semantic",
        rule: "counterColorPatterns (plural) предпочтительнее",
        message: `Домен «${domainId}»: используется legacy-поле counterColorPattern (sing.)`,
        hint: "Zod-схема R-Vision ожидает counterColorPatterns",
        domainId,
        propertyPath: `counterColorPattern`,
      });
    }
  }
}

function checkDataRuleEffectAttributes(
  ctx: LintContext,
  dr: DataRuleRecord,
): void {
  const attrs = dr.attributes;
  if (!attrs || attrs.length === 0) return;

  // ============ target: linkage → атрибуты связи ============
  if (dr.target === "linkage") {
    if (!dr.linkage) return;
    const linkage = ctx.index.entityLinkages.find(
      (l) =>
        `${l.domainId}/${l.id}`.toLowerCase() === dr.linkage!.toLowerCase(),
    );
    if (!linkage) return;
    const linkageAttrs = new Set((linkage.attributes || []).map((a) => a.id));
    for (const a of attrs) {
      if (!linkageAttrs.has(a.attribute)) {
        emit(ctx, {
          ruleId: "dataRule/linkage-attribute-unknown",
          severity: "error",
          category: "reference",
          rule: "attributes[].attribute существует в linkage",
          message: `правило «${dr.id}»: attributes[].attribute = "${a.attribute}" не найден в связи «${dr.linkage}»`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }
    return;
  }

  if (!dr.entity) return;
  const entity = ctx.index.entitiesByFqid[dr.entity];
  if (!entity) return;

  for (const a of attrs) {
    const attr = findAttributeWithInheritance(ctx, entity.fqid, a.attribute);
    if (!attr) {
      emit(ctx, {
        ruleId: "dataRule/attribute-action-unknown",
        severity: "error",
        category: "reference",
        rule: "attributes[].attribute существует",
        message: `правило «${dr.id}»: attributes[].attribute = "${a.attribute}" не найден в ${entity.fqid}`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.attributes`,
      });
      continue;
    }

    // ============ effect: default ============
    if (dr.effect === "default") {
      if (a.value === undefined && !a.expression) {
        emit(ctx, {
          ruleId: "dataRule/default-needs-value-or-expression",
          severity: "error",
          category: "required",
          rule: "effect: default требует value или expression",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: не задано ни value, ни expression`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
      if (a.message !== undefined) {
        emit(ctx, {
          ruleId: "dataRule/default-has-message",
          severity: "error",
          category: "semantic",
          rule: "effect: default запрещает message",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: message не поддерживается для default`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }

    // ============ effect: allowed ============
    if (dr.effect === "allowed") {
      if (!a.constraint && !a.expression) {
        emit(ctx, {
          ruleId: "dataRule/allowed-needs-constraint-or-expression",
          severity: "error",
          category: "required",
          rule: "effect: allowed требует constraint или expression",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: не задано ни constraint, ни expression`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }

    // ============ effect: hidden ============
    if (dr.effect === "hidden") {
      if (a.help !== undefined) {
        emit(ctx, {
          ruleId: "dataRule/hidden-has-help",
          severity: "error",
          category: "semantic",
          rule: "effect: hidden запрещает help",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: help не поддерживается для hidden`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
      if (attr.dataType === "Counter") {
        emit(ctx, {
          ruleId: "dataRule/hidden-on-counter",
          severity: "warning",
          category: "semantic",
          rule: "effect: hidden не поддерживается для Counter",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: hidden на Counter не поддерживается`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }

    // ============ effect: readonly ============
    if (dr.effect === "readonly") {
      if (
        attr.dataType === "Counter" ||
        attr.dataType === "Identifier" ||
        attr.dataType === "RQL"
      ) {
        emit(ctx, {
          ruleId: "dataRule/readonly-on-unsupported-type",
          severity: "warning",
          category: "semantic",
          rule: "effect: readonly не поддерживается для Counter/Identifier/RQL",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: readonly на ${attr.dataType} не поддерживается`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
      if (
        SYSTEM_ATTRIBUTE_IDS.has(a.attribute) &&
        a.attribute !== "organizationId"
      ) {
        emit(ctx, {
          ruleId: "dataRule/readonly-on-system",
          severity: "warning",
          category: "semantic",
          rule: "effect: readonly не поддерживается для системных (кроме organizationId)",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: readonly на системный атрибут`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
      if (
        a.constraint !== undefined ||
        a.expression !== undefined ||
        a.value !== undefined
      ) {
        emit(ctx, {
          ruleId: "dataRule/readonly-has-payload",
          severity: "warning",
          category: "semantic",
          rule: "effect: readonly не поддерживает constraint/expression/value",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: лишние поля в action`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }

    // ============ effect: required ============
    if (dr.effect === "required") {
      if (attr.dataType === "Counter" || attr.dataType === "Identifier") {
        emit(ctx, {
          ruleId: "dataRule/required-on-unsupported-type",
          severity: "warning",
          category: "semantic",
          rule: "effect: required не поддерживается для Counter/Identifier",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: required на ${attr.dataType} не поддерживается`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
      if (
        SYSTEM_ATTRIBUTE_IDS.has(a.attribute) &&
        a.attribute !== "organizationId"
      ) {
        emit(ctx, {
          ruleId: "dataRule/required-on-system",
          severity: "warning",
          category: "semantic",
          rule: "effect: required не поддерживается для системных (кроме organizationId)",
          message: `правило «${dr.id}», атрибут «${a.attribute}»: required на системный атрибут`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.attributes`,
        });
      }
    }
  }
}

function checkDataRuleEffectLinkages(
  ctx: LintContext,
  dr: DataRuleRecord,
): void {
  const linkages = dr.linkages;
  if (!linkages || linkages.length === 0) return;

  const linkageByFqid = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageByFqid.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  for (const l of linkages) {
    const record = linkageByFqid.get(l.linkage.toLowerCase());
    if (!record) {
      emit(ctx, {
        ruleId: "dataRule/linkage-action-unknown",
        severity: "error",
        category: "reference",
        rule: "linkages[].linkage существует",
        message: `правило «${dr.id}»: linkages[].linkage = "${l.linkage}" не найдена`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.linkages`,
      });
      continue;
    }

    // side для симметричной направленной связи
    const isSymmetric = record.side1Fqid === record.side2Fqid;
    const isDirected = !(record.type === "n_n" && record.undirected);
    if (isSymmetric && isDirected && !l.side) {
      emit(ctx, {
        ruleId: "dataRule/linkage-side-required",
        severity: "warning",
        category: "semantic",
        rule: "Для симметричной направленной связи нужен side",
        message: `правило «${dr.id}», linkages[].linkage = "${l.linkage}": связь симметричная направленная — укажите side 1 или 2`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.linkages`,
      });
    }

    // effect: allowed — нужен constraint/expression/min_count/max_count
    if (dr.effect === "allowed") {
      if (
        !l.constraint &&
        !l.expression &&
        l.min_count === undefined &&
        l.max_count === undefined
      ) {
        emit(ctx, {
          ruleId: "dataRule/allowed-linkage-needs-payload",
          severity: "error",
          category: "required",
          rule: "effect: allowed для linkages требует payload",
          message: `правило «${dr.id}», linkage = "${l.linkage}": не задано ни constraint/expression, ни min_count/max_count`,
          domainId: dr.domainId,
          propertyPath: `dataRules[${dr.id}].rule.linkages`,
        });
      }
    } else if (l.min_count !== undefined || l.max_count !== undefined) {
      emit(ctx, {
        ruleId: "dataRule/count-limit-on-non-allowed",
        severity: "error",
        category: "semantic",
        rule: "min_count/max_count только для effect: allowed",
        message: `правило «${dr.id}», linkage = "${l.linkage}": min_count/max_count применимы только к allowed`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.linkages`,
      });
    }
  }
}

function checkDataRuleMessages(ctx: LintContext, dr: DataRuleRecord): void {
  if (dr.effect === "default" && dr.message !== undefined) {
    emit(ctx, {
      ruleId: "dataRule/default-top-message",
      severity: "error",
      category: "semantic",
      rule: "effect: default запрещает message",
      message: `правило «${dr.id}»: message не поддерживается для effect: default`,
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].message`,
    });
  }
  if (dr.effect === "hidden" && dr.help !== undefined) {
    emit(ctx, {
      ruleId: "dataRule/hidden-top-help",
      severity: "error",
      category: "semantic",
      rule: "effect: hidden запрещает help",
      message: `правило «${dr.id}»: help не поддерживается для effect: hidden`,
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].help`,
    });
  }
}

function checkDataRuleNested(ctx: LintContext, dr: DataRuleRecord): void {
  if (dr.target !== "entityAttribute") return;

  if (!dr.nested) {
    emit(ctx, {
      ruleId: "dataRule/nested-missing",
      severity: "error",
      category: "required",
      rule: "У entityAttribute задан nested",
      message: `правило «${dr.id}»: nested обязателен для target: entityAttribute`,
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].rule.nested`,
    });
    return;
  }

  if (dr.nested.type === "table" && dr.entity && dr.attribute) {
    const parent = findAttributeWithInheritance(ctx, dr.entity, dr.attribute);
    if (parent?.nestedAttributes) {
      const knownCols = new Set(parent.nestedAttributes.map((a) => a.id));
      for (const na of dr.nested.attributes) {
        if (!knownCols.has(na.attribute)) {
          emit(ctx, {
            ruleId: "dataRule/nested-attribute-unknown",
            severity: "warning",
            category: "reference",
            rule: "nested.attributes[].attribute существует в Table",
            message: `правило «${dr.id}»: nested.attributes[].attribute = "${na.attribute}" не найден в "${dr.attribute}"`,
            domainId: dr.domainId,
            propertyPath: `dataRules[${dr.id}].rule.nested.attributes`,
          });
        }
      }
    }
  }

  if (dr.nested.type === "array") {
    for (const it of dr.nested.items) {
      if (it.item === "*") continue;
      if (typeof it.item === "number" && it.item >= 0) continue;
      emit(ctx, {
        ruleId: "dataRule/nested-item-invalid",
        severity: "error",
        category: "semantic",
        rule: 'nested.items[].item — число ≥ 0 или "*"',
        message: `правило «${dr.id}»: недопустимый item = ${String(it.item)}`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule.nested.items`,
      });
    }
  }
}

function checkDataRuleCondition(ctx: LintContext, dr: DataRuleRecord): void {
  if (typeof dr.condition === "boolean") return;
  const c = String(dr.condition).trim();
  if (!c) {
    emit(ctx, {
      ruleId: "dataRule/condition-empty",
      severity: "warning",
      category: "semantic",
      rule: "Условие правила непустое или true",
      message: `правило «${dr.id}»: пустое condition`,
      hint: "Укажите RQL-выражение (!rql ...) или true",
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].condition`,
    });
  }
}

// ============ Trees ============

function checkTrees(ctx: LintContext): void {
  const trees = ctx.index.trees;
  if (!trees || trees.length === 0) return;

  const entityByFqid = new Map<string, EntityRecord>();
  for (const e of ctx.index.entities) entityByFqid.set(e.fqid, e);

  const linkageByFqid = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageByFqid.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  for (const tree of trees) {
    checkTreeHierarchy(ctx, tree, entityByFqid, linkageByFqid);
    checkTreeSorting(ctx, tree, entityByFqid);
    checkTreeMaxInstances(ctx, tree);
    checkTreeMultiparent(ctx, tree);
  }
}

function checkTreeHierarchy(
  ctx: LintContext,
  tree: TreeRecord,
  entityByFqid: Map<string, EntityRecord>,
  linkageByFqid: Map<string, EntityLinkage>,
): void {
  // ============ maxDepth ============
  if (tree.maxDepth !== undefined && tree.maxDepth < 1) {
    emit(ctx, {
      ruleId: "tree/max-depth-invalid",
      severity: "error",
      category: "semantic",
      rule: "maxDepth ≥ 1",
      message: `дерево «${tree.id}»: maxDepth = ${tree.maxDepth}`,
      domainId: tree.domainId,
      propertyPath: `trees[${tree.id}].maxDepth`,
    });
  }

  // ============ root entity ============
  if (!entityByFqid.has(tree.hierarchy.entity)) {
    emit(ctx, {
      ruleId: "tree/hierarchy-entity-unknown",
      severity: "error",
      category: "reference",
      rule: "hierarchy.entity существует",
      message: `дерево «${tree.id}»: hierarchy.entity = "${tree.hierarchy.entity}" не найдена`,
      domainId: tree.domainId,
      propertyPath: `trees[${tree.id}].hierarchy.entity`,
    });
  }

  const walk = (
    children: TreeHierarchyChild[] | undefined,
    parentEntityFqid: string,
    path: string,
  ): void => {
    if (!children) return;
    for (const child of children) {
      // ============ entity ============
      if (!entityByFqid.has(child.entity)) {
        emit(ctx, {
          ruleId: "tree/children-entity-unknown",
          severity: "error",
          category: "reference",
          rule: "children[].entity существует",
          message: `дерево «${tree.id}», ${path}: entity = "${child.entity}" не найдена`,
          domainId: tree.domainId,
          propertyPath: path + ".entity",
        });
      }

      // ============ linkage ============
      const linkage = linkageByFqid.get(child.linkage.toLowerCase());
      if (!linkage) {
        emit(ctx, {
          ruleId: "tree/children-linkage-unknown",
          severity: "error",
          category: "reference",
          rule: "children[].linkage существует",
          message: `дерево «${tree.id}», ${path}: linkage = "${child.linkage}" не найдена`,
          domainId: tree.domainId,
          propertyPath: path + ".linkage",
        });
        if (child.children) {
          walk(child.children, child.entity, path + ".children");
        }
        continue;
      }

      // ============ undirected n_n ============
      if (linkage.type === "n_n" && linkage.undirected) {
        emit(ctx, {
          ruleId: "tree/children-undirected-nn",
          severity: "error",
          category: "semantic",
          rule: "В деревьях не используется n_n undirected",
          message: `дерево «${tree.id}», ${path}: linkage "${child.linkage}" — n_n undirected`,
          domainId: tree.domainId,
          propertyPath: path + ".linkage",
        });
      }

      // ============ side ============
      // Мягкая проверка: связь должна соединять parent и child хотя бы в одной ориентации.
      // Для несимметричных с явным side — по Zod-логике (side = сторона ребёнка).
      const isSymmetric = linkage.side1Fqid === linkage.side2Fqid;
      if (!isSymmetric) {
        // Учитываем наследование: сторона связи может быть предком/потомком
        // parent/child, объявленных в дереве.
        const parentMatchesSide1 = isSameOrAncestor(
          ctx,
          linkage.side1Fqid,
          parentEntityFqid,
        );
        const childMatchesSide2 = isSameOrAncestor(
          ctx,
          linkage.side2Fqid,
          child.entity,
        );
        const parentMatchesSide2 = isSameOrAncestor(
          ctx,
          linkage.side2Fqid,
          parentEntityFqid,
        );
        const childMatchesSide1 = isSameOrAncestor(
          ctx,
          linkage.side1Fqid,
          child.entity,
        );

        const connectsForward = parentMatchesSide1 && childMatchesSide2;
        const connectsBackward = parentMatchesSide2 && childMatchesSide1;

        if (!connectsForward && !connectsBackward) {
          emit(ctx, {
            ruleId: "tree/children-side-mismatch",
            severity: "error",
            category: "semantic",
            rule: "linkage соединяет parent и child",
            message: `дерево «${tree.id}», ${path}: linkage "${child.linkage}" (side1=${linkage.side1Fqid}, side2=${linkage.side2Fqid}) не связывает parent="${parentEntityFqid}" и child="${child.entity}"`,
            hint: "parent/child должны совпадать со сторонами связи или быть их наследниками (более узкий класс). Предок стороны связи — ошибка.",
            domainId: tree.domainId,
            propertyPath: path + ".linkage",
          });
        } else if (child.side !== undefined) {
          // R-Vision docs: side — сторона, с которой находится РОДИТЕЛЬ.
          // side=1 → parent на side1, child на side2 (connectsForward).
          // side=2 → parent на side2, child на side1 (connectsBackward).
          const expectedSide: 1 | 2 = connectsForward ? 1 : 2;
          if (child.side !== expectedSide) {
            emit(ctx, {
              ruleId: "tree/children-side-opposite",
              severity: "warning",
              category: "semantic",
              rule: "side соответствует ориентации связи",
              message: `дерево «${tree.id}», ${path}: linkage "${child.linkage}" по ориентации ожидает side=${expectedSide}, указан side=${child.side}`,
              domainId: tree.domainId,
              propertyPath: path + ".side",
            });
          }
        }
      }

      // ============ maxInstances / maxChildren ============
      if (child.maxInstances !== undefined && child.maxInstances < 1) {
        emit(ctx, {
          ruleId: "tree/children-max-instances-invalid",
          severity: "warning",
          category: "semantic",
          rule: "maxInstances ≥ 1",
          message: `дерево «${tree.id}», ${path}: maxInstances = ${child.maxInstances}`,
          domainId: tree.domainId,
          propertyPath: path + ".maxInstances",
        });
      }
      if (child.maxChildren !== undefined && child.maxChildren < 1) {
        emit(ctx, {
          ruleId: "tree/children-max-children-invalid",
          severity: "warning",
          category: "semantic",
          rule: "maxChildren ≥ 1",
          message: `дерево «${tree.id}», ${path}: maxChildren = ${child.maxChildren}`,
          domainId: tree.domainId,
          propertyPath: path + ".maxChildren",
        });
      }

      if (child.children) {
        walk(child.children, child.entity, path + ".children");
      }
    }
  };

  walk(
    tree.hierarchy.children,
    tree.hierarchy.entity,
    `trees[${tree.id}].hierarchy.children`,
  );
}

function checkTreeSorting(
  ctx: LintContext,
  tree: TreeRecord,
  entityByFqid: Map<string, EntityRecord>,
): void {
  if (!tree.sorting || tree.sorting.length === 0) return;

  // Все entity, участвующие в дереве
  const treeEntities = new Set<string>([tree.hierarchy.entity]);
  const collect = (children: TreeHierarchyChild[] | undefined): void => {
    if (!children) return;
    for (const c of children) {
      treeEntities.add(c.entity);
      collect(c.children);
    }
  };
  collect(tree.hierarchy.children);

  for (const sorting of tree.sorting) {
    for (const by of sorting.by) {
      const entity = entityByFqid.get(by.entity);
      if (!entity) {
        emit(ctx, {
          ruleId: "tree/sorting-entity-unknown",
          severity: "error",
          category: "reference",
          rule: "sorting[].by[].entity существует",
          message: `дерево «${tree.id}», sorting[${sorting.id}]: entity = "${by.entity}" не найдена`,
          domainId: tree.domainId,
          propertyPath: `trees[${tree.id}].sorting[${sorting.id}].by`,
        });
        continue;
      }

      if (!treeEntities.has(by.entity)) {
        emit(ctx, {
          ruleId: "tree/sorting-entity-not-in-tree",
          severity: "warning",
          category: "semantic",
          rule: "sorting[].by[].entity участвует в hierarchy",
          message: `дерево «${tree.id}», sorting[${sorting.id}]: entity = "${by.entity}" не участвует в hierarchy`,
          domainId: tree.domainId,
          propertyPath: `trees[${tree.id}].sorting[${sorting.id}].by`,
        });
      }

      for (const inner of by.by) {
        const attr = findAttributeWithInheritance(
          ctx,
          entity.fqid,
          inner.attribute,
        );
        if (!attr) {
          emit(ctx, {
            ruleId: "tree/sorting-attribute-unknown",
            severity: "warning",
            category: "reference",
            rule: "sorting[].by[].by[].attribute существует",
            message: `дерево «${tree.id}», sorting[${sorting.id}]: attribute = "${inner.attribute}" не найден в "${by.entity}"`,
            domainId: tree.domainId,
            propertyPath: `trees[${tree.id}].sorting[${sorting.id}].by`,
          });
        } else if (attr.dataType === "RQL") {
          emit(ctx, {
            ruleId: "tree/sorting-attribute-rql",
            severity: "warning",
            category: "semantic",
            rule: "RQL нельзя использовать в сортировке",
            message: `дерево «${tree.id}», sorting[${sorting.id}]: attribute "${inner.attribute}" имеет тип RQL`,
            domainId: tree.domainId,
            propertyPath: `trees[${tree.id}].sorting[${sorting.id}].by`,
          });
        }
      }
    }
  }
}

/**
 * Проверяет, что maxInstances не задан дважды на одну entity в дереве.
 *
 * ВАЖНО: повторение одной и той же entity в дереве — валидный кейс
 * (например, для деревьев, где entity может быть дочерней к разным
 * родителям, или для multiparent-структур). Поэтому проверки на
 * уникальность entity в дереве больше нет.
 *
 * maxInstances осмысленно задавать один раз на entity — если он задан
 * на нескольких копиях, система не знает, какое значение применить.
 */
function checkTreeMaxInstances(ctx: LintContext, tree: TreeRecord): void {
  const maxInstancesSeen = new Set<string>();

  const register = (fqid: string, maxInstances?: number): void => {
    if (maxInstances === undefined) return;
    if (maxInstancesSeen.has(fqid)) {
      emit(ctx, {
        ruleId: "tree/duplicate-max-instances",
        severity: "warning",
        category: "semantic",
        rule: "maxInstances задаётся один раз на entity",
        message: `дерево «${tree.id}»: maxInstances указан дважды для "${fqid}"`,
        domainId: tree.domainId,
        propertyPath: `trees[${tree.id}].hierarchy`,
      });
    }
    maxInstancesSeen.add(fqid);
  };

  register(tree.hierarchy.entity, tree.hierarchy.maxInstances);

  const walk = (children: TreeHierarchyChild[] | undefined): void => {
    if (!children) return;
    for (const c of children) {
      register(c.entity, c.maxInstances);
      walk(c.children);
    }
  };
  walk(tree.hierarchy.children);
} 

function checkTreeMultiparent(ctx: LintContext, tree: TreeRecord): void {
  if (tree.type !== "multiparent") return;

  let leafCount = 0;
  const walk = (children: TreeHierarchyChild[] | undefined): void => {
    if (!children) return;
    for (const c of children) {
      if (!c.children || c.children.length === 0) leafCount++;
      else walk(c.children);
    }
  };
  walk(tree.hierarchy.children);

  if (leafCount > 1) {
    emit(ctx, {
      ruleId: "tree/multiparent-multiple-leaves",
      severity: "error",
      category: "semantic",
      rule: "multiparent: только один leaf",
      message: `дерево «${tree.id}» типа multiparent имеет ${leafCount} leaf-сущностей`,
      hint: "Используйте обычное дерево или оставьте один лист",
      domainId: tree.domainId,
      propertyPath: `trees[${tree.id}].hierarchy`,
    });
  }
}

// ============ TransitiveLinkages ============

function checkTransitiveLinkages(ctx: LintContext): void {
  const tls = ctx.index.transitiveLinkages;
  if (!tls || tls.length === 0) return;

  const entityByFqid = new Map<string, EntityRecord>();
  for (const e of ctx.index.entities) entityByFqid.set(e.fqid, e);

  const linkageByFqid = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageByFqid.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  // entity → [domainId, count]
  const entityTrees = new Map<string, { domainId: string; count: number }>();

  // Собираем ancestors для side-достижимости (linkage может ссылаться на предка)
  const buildAncestors = (entityFqid: string): Set<string> => {
    const out = new Set<string>();
    const seen = new Set<string>();
    let cur = entityByFqid.get(entityFqid);
    while (cur && !seen.has(cur.fqid)) {
      seen.add(cur.fqid);
      if (!cur.inherits) break;
      const parent = entityByFqid.get(cur.inherits);
      if (parent) out.add(parent.fqid);
      cur = parent;
    }
    return out;
  };

  const checkJoinIdsUniqueness = (
    joins: TransitiveLinkageJoin[],
    path: string,
    tlId: string,
    domainId: string,
  ): void => {
    const seen = new Set<string>();
    for (const j of joins) {
      if (seen.has(j.id)) {
        emit(ctx, {
          ruleId: "transitiveLinkage/duplicate-join-id",
          severity: "error",
          category: "semantic",
          rule: "joins[].id уникален в ветке",
          message: `транзитивная связь «${tlId}», ${path}: id "${j.id}" встречается дважды`,
          domainId,
          propertyPath: path,
        });
      }
      seen.add(j.id);
    }
  };

  const walkJoins = (
    joins: TransitiveLinkageJoin[],
    parentEntityFqid: string,
    parentAncestors: Set<string>,
    path: string,
    tl: TransitiveLinkageRecord,
  ): void => {
    checkJoinIdsUniqueness(joins, path, tl.id, tl.domainId);

    for (const j of joins) {
      const linkage = linkageByFqid.get(j.linkage.toLowerCase());
      if (!linkage) {
        emit(ctx, {
          ruleId: "transitiveLinkage/linkage-unknown",
          severity: "error",
          category: "reference",
          rule: "joins[].linkage существует",
          message: `транзитивная связь «${tl.id}», ${path}: linkage = "${j.linkage}" не найдена`,
          domainId: tl.domainId,
          propertyPath: path + ".linkage",
        });
        continue;
      }

      // side для симметричной направленной
      const isSymmetric = linkage.side1Fqid === linkage.side2Fqid;
      const isDirected = !(linkage.type === "n_n" && linkage.undirected);
      if (isSymmetric && isDirected && !j.side) {
        emit(ctx, {
          ruleId: "transitiveLinkage/side-required",
          severity: "warning",
          category: "semantic",
          rule: "Для симметричной направленной связи нужен side",
          message: `транзитивная связь «${tl.id}», ${path}: linkage "${j.linkage}" симметричная направленная — укажите side 1 или 2`,
          domainId: tl.domainId,
          propertyPath: path + ".side",
        });
      }

      // достижимость от parent
      const reachableForward = linkage.side1Fqid === parentEntityFqid;
      const reachableBackward = linkage.side2Fqid === parentEntityFqid;
      const reachableViaAncestor =
        parentAncestors.has(linkage.side1Fqid) ||
        parentAncestors.has(linkage.side2Fqid);

      if (!reachableForward && !reachableBackward && !reachableViaAncestor) {
        emit(ctx, {
          ruleId: "transitiveLinkage/not-reachable",
          severity: "error",
          category: "semantic",
          rule: "linkage соединяет parent-entity",
          message: `транзитивная связь «${tl.id}», ${path}: linkage "${j.linkage}" не соединяет parent "${parentEntityFqid}"`,
          domainId: tl.domainId,
          propertyPath: path + ".linkage",
        });
        continue;
      }

      // Определяем «child» — противоположную сторону
      let childFqid: string | null = null;
      if (reachableForward) childFqid = linkage.side2Fqid;
      else if (reachableBackward) childFqid = linkage.side1Fqid;
      else childFqid = linkage.side1Fqid; // ancestor-случай: child — любая сторона

      // Проверка side на соответствие
      if (j.side !== undefined && isSymmetric && isDirected) {
        // side не имеет смысла для симметричной — предупредим
        emit(ctx, {
          ruleId: "transitiveLinkage/side-on-symmetric",
          severity: "info",
          category: "semantic",
          rule: "side не нужен для симметричной связи",
          message: `транзитивная связь «${tl.id}», ${path}: linkage "${j.linkage}" симметричная — side игнорируется`,
          domainId: tl.domainId,
          propertyPath: path + ".side",
        });
      }

      if (childFqid && j.joins) {
        const childAncestors = buildAncestors(childFqid);
        walkJoins(j.joins, childFqid, childAncestors, path + ".joins", tl);
      }
    }
  };

  for (const tl of tls) {
    // ============ entity существует ============
    if (!entityByFqid.has(tl.entity)) {
      emit(ctx, {
        ruleId: "transitiveLinkage/entity-unknown",
        severity: "error",
        category: "reference",
        rule: "entity существует",
        message: `транзитивная связь «${tl.id}»: entity = "${tl.entity}" не найдена`,
        domainId: tl.domainId,
        propertyPath: `transitiveLinkages[${tl.id}].entity`,
      });
    }

    // ============ entity только в одном дереве ============
    if (!entityTrees.has(tl.entity)) {
      entityTrees.set(tl.entity, { domainId: tl.domainId, count: 0 });
    }
    entityTrees.get(tl.entity)!.count++;

    // ============ joins ============
    const rootAncestors = buildAncestors(tl.entity);
    walkJoins(
      tl.joins,
      tl.entity,
      rootAncestors,
      `transitiveLinkages[${tl.id}].joins`,
      tl,
    );
  }

  // ============ дублирование entity между деревьями ============
  entityTrees.forEach(({ domainId, count }, entityFqid) => {
    if (count > 1) {
      emit(ctx, {
        ruleId: "transitiveLinkage/duplicate-entity-tree",
        severity: "warning",
        category: "semantic",
        rule: "У entity одно дерево транзитивных связей",
        message: `сущность "${entityFqid}" используется в ${count} деревьях транзитивных связей`,
        hint: "Объедините деревья или уберите лишние",
        domainId,
        propertyPath: `transitiveLinkages`,
      });
    }
  });
}

// ============ Menus ============

function checkMenus(ctx: LintContext): void {
  const menus = ctx.index.menus;
  if (!menus || menus.length === 0) return;

  const viewIds = new Set<string>();
  for (const d of ctx.index.domains) {
    const schema = ctx.index.schemasByDomain?.[d.id];
    if (schema?.allViews) {
      for (const v of schema.allViews) {
        viewIds.add(`${d.id}/${v.id}`.toLowerCase());
      }
    }
    if (schema?.sections?.views?.items) {
      for (const v of schema.sections.views.items) {
        viewIds.add(`${d.id}/${v.id}`.toLowerCase());
      }
    }
  }

  const mediaIds = new Set<string>();
  for (const m of ctx.index.medias) {
    mediaIds.add(`${m.domainId}/${m.id}`.toLowerCase());
  }

  const idSeen = new Map<string, string>(); // "domain#id"  → domain
  const routeSeen = new Map<string, string>(); // "domain#route" → domain

  for (const menu of menus) {
    // ============ уникальность id в домене ============
    const idKey = `${menu.domainId}#${menu.id}`;
    if (idSeen.has(idKey)) {
      emit(ctx, {
        ruleId: "menu/duplicate-id",
        severity: "error",
        category: "semantic",
        rule: "ID меню уникален",
        message: `меню «${menu.id}»: дубликат id в домене ${menu.domainId}`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}]`,
      });
    } else {
      idSeen.set(idKey, menu.domainId);
    }

    // ============ уникальность route в домене ============
    const routeKey = `${menu.domainId}#${menu.route}`;
    if (menu.route) {
      if (routeSeen.has(routeKey)) {
        emit(ctx, {
          ruleId: "menu/duplicate-route",
          severity: "error",
          category: "semantic",
          rule: "route меню уникален",
          message: `меню «${menu.id}»: route "${menu.route}" уже используется`,
          domainId: menu.domainId,
          propertyPath: `menus[${menu.id}].route`,
        });
      } else {
        routeSeen.set(routeKey, menu.domainId);
      }
    }

    // ============ placement ============
    if (menu.__rawPlacement !== undefined) {
      emit(ctx, {
        ruleId: "menu/placement-invalid",
        severity: "error",
        category: "semantic",
        rule: "placement: top | settings",
        message: `меню «${menu.id}»: неизвестный placement «${menu.__rawPlacement}»`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].placement`,
      });
    }

    // ============ type ============
    if (menu.__rawType !== undefined) {
      emit(ctx, {
        ruleId: "menu/type-invalid",
        severity: "error",
        category: "semantic",
        rule: "type: root_group | root_menu",
        message: `меню «${menu.id}»: неизвестный type «${menu.__rawType}»`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].type`,
      });
    }

    // ============ label ============
    if (menu.__rawLabelMissing) {
      emit(ctx, {
        ruleId: "menu/label-missing",
        severity: "warning",
        category: "required",
        rule: "У меню задан label",
        message: `меню «${menu.id}»: label не задан`,
        hint: "Отображается в левой панели; без него используется id",
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].label`,
      });
    }

    // ============ route формат ============
    if (
      menu.route &&
      !/^\/(?!-)[a-z0-9-]+(?<!-)(\/(?!-)[a-z0-9-]+(?<!-))*$/.test(menu.route)
    ) {
      emit(ctx, {
        ruleId: "menu/route-format",
        severity: "warning",
        category: "semantic",
        rule: "route в формате /path/segment",
        message: `меню «${menu.id}»: route "${menu.route}" не соответствует формату`,
        hint: "Допустимы /, строчные буквы, цифры и дефис (без дефиса в начале/конце сегмента)",
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].route`,
      });
    }

    // ============ root_menu: view обязателен и существует ============
    if (menu.type === "root_menu") {
      if (!menu.view) {
        emit(ctx, {
          ruleId: "menu/root-menu-no-view",
          severity: "error",
          category: "required",
          rule: "root_menu имеет view",
          message: `меню «${menu.id}»: root_menu без view`,
          domainId: menu.domainId,
          propertyPath: `menus[${menu.id}].view`,
        });
      } else if (!viewIds.has(menu.view.toLowerCase())) {
        emit(ctx, {
          ruleId: "menu/view-unknown",
          severity: "error",
          category: "reference",
          rule: "view меню существует",
          message: `меню «${menu.id}»: view "${menu.view}" не найден`,
          domainId: menu.domainId,
          propertyPath: `menus[${menu.id}].view`,
        });
      }
    }

    // ============ root_group: items[] непуст, items[].view существует ============
    if (menu.type === "root_group") {
      if (!menu.items || menu.items.length === 0) {
        emit(ctx, {
          ruleId: "menu/root-group-no-items",
          severity: "error",
          category: "required",
          rule: "root_group содержит items",
          message: `меню «${menu.id}»: root_group без items`,
          domainId: menu.domainId,
          propertyPath: `menus[${menu.id}].items`,
        });
      } else {
        for (const item of menu.items) {
          if (!viewIds.has(item.view.toLowerCase())) {
            emit(ctx, {
              ruleId: "menu/item-view-unknown",
              severity: "error",
              category: "reference",
              rule: "items[].view существует",
              message: `меню «${menu.id}», items[${item.id}]: view "${item.view}" не найден`,
              domainId: menu.domainId,
              propertyPath: `menus[${menu.id}].items[${item.id}].view`,
            });
          }
        }
        // ============ default ∈ items ============
        if (menu.defaultItem) {
          const known = menu.items.some((it) => it.id === menu.defaultItem);
          if (!known) {
            emit(ctx, {
              ruleId: "menu/default-item-unknown",
              severity: "error",
              category: "reference",
              rule: "default ссылается на items[]",
              message: `меню «${menu.id}»: default = "${menu.defaultItem}" не найден в items`,
              domainId: menu.domainId,
              propertyPath: `menus[${menu.id}].default`,
            });
          }
        }
      }
    }

    // ============ icon ∈ medias ============
    if (menu.icon && !mediaIds.has(menu.icon.toLowerCase())) {
      emit(ctx, {
        ruleId: "menu/icon-unknown",
        severity: "warning",
        category: "reference",
        rule: "icon меню существует в medias",
        message: `меню «${menu.id}»: icon "${menu.icon}" не найден`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].icon`,
      });
    }

    // ============ priority ≥ 1000 ============
    if (menu.priority !== undefined && menu.priority < 1000) {
      emit(ctx, {
        ruleId: "menu/priority-too-low",
        severity: "warning",
        category: "semantic",
        rule: "priority ≥ 1000",
        message: `меню «${menu.id}»: priority = ${menu.priority}`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].priority`,
      });
    }
  }
}

// ============ Medias ============

function checkMedias(ctx: LintContext): void {
  const medias = ctx.index.medias;
  if (!medias || medias.length === 0) return;

  const seen = new Set<string>();
  for (const m of medias) {
    const key = `${m.domainId}#${m.id}`;
    if (seen.has(key)) {
      emit(ctx, {
        ruleId: "media/duplicate-id",
        severity: "error",
        category: "semantic",
        rule: "ID медиа уникален",
        message: `медиа «${m.id}»: дубликат id в домене ${m.domainId}`,
        domainId: m.domainId,
        propertyPath: `medias[${m.id}]`,
      });
    } else {
      seen.add(key);
    }

    // ============ type-specific ============
    if (m.type === "icon_name" && !m.iconName) {
      emit(ctx, {
        ruleId: "media/icon-name-missing",
        severity: "error",
        category: "required",
        rule: "type: icon_name требует iconName",
        message: `медиа «${m.id}»: отсутствует iconName`,
        domainId: m.domainId,
        propertyPath: `medias[${m.id}].iconName`,
      });
    }
    if (m.type === "data" && !m.data) {
      emit(ctx, {
        ruleId: "media/data-missing",
        severity: "error",
        category: "required",
        rule: "type: data требует data",
        message: `медиа «${m.id}»: отсутствует data`,
        domainId: m.domainId,
        propertyPath: `medias[${m.id}].data`,
      });
    }
  }
}

// ============ Permissions ============

function checkPermissions(ctx: LintContext): void {
  const permissions = ctx.index.permissions;
  if (!permissions || permissions.length === 0) return;

  const seen = new Set<string>();
  for (const p of permissions) {
    const key = `${p.domainId}#${p.id}`;
    if (seen.has(key)) {
      emit(ctx, {
        ruleId: "permission/duplicate-id",
        severity: "error",
        category: "semantic",
        rule: "ID разрешения уникален",
        message: `разрешение «${p.id}»: дубликат id в домене ${p.domainId}`,
        domainId: p.domainId,
        propertyPath: `permissions[${p.id}]`,
      });
    } else {
      seen.add(key);
    }
  }
}

// ============ AccessRules ============

function checkAccessRules(ctx: LintContext): void {
  const accessRules = ctx.index.accessRules;
  if (!accessRules || accessRules.length === 0) return;

  // Индекс permissions по FQID
  const permissionIds = new Set<string>();
  for (const p of ctx.index.permissions) {
    permissionIds.add(`${p.domainId}/${p.id}`.toLowerCase());
  }

  const entityByFqid = new Map<string, EntityRecord>();
  for (const e of ctx.index.entities) entityByFqid.set(e.fqid, e);

  const linkageByFqid = new Map<string, EntityLinkage>();
  for (const l of ctx.index.entityLinkages) {
    linkageByFqid.set(`${l.domainId}/${l.id}`.toLowerCase(), l);
  }

  accessRules.forEach((rule, ruleIdx) => {
    // ============ entity/linkage — обязательность ============
    if (rule.target === "entity" && !rule.entity) {
      emit(ctx, {
        ruleId: "accessRule/entity-missing",
        severity: "error",
        category: "required",
        rule: "target: entity требует entity",
        message: `правило доступа #${ruleIdx + 1}: target entity без entity`,
        domainId: rule.domainId,
        propertyPath: `accessRules[${ruleIdx}].entity`,
      });
    }
    if (rule.target === "linkage" && !rule.linkage) {
      emit(ctx, {
        ruleId: "accessRule/linkage-missing",
        severity: "error",
        category: "required",
        rule: "target: linkage требует linkage",
        message: `правило доступа #${ruleIdx + 1}: target linkage без linkage`,
        domainId: rule.domainId,
        propertyPath: `accessRules[${ruleIdx}].linkage`,
      });
    }

    // ============ entity/linkage — существование ============
    if (rule.target === "entity" && rule.entity) {
      if (!entityByFqid.has(rule.entity)) {
        emit(ctx, {
          ruleId: "accessRule/entity-unknown",
          severity: "error",
          category: "reference",
          rule: "entity существует",
          message: `правило доступа #${ruleIdx + 1}: entity "${rule.entity}" не найдена`,
          domainId: rule.domainId,
          propertyPath: `accessRules[${ruleIdx}].entity`,
        });
      }
    }
    if (rule.target === "linkage" && rule.linkage) {
      if (!linkageByFqid.has(rule.linkage.toLowerCase())) {
        emit(ctx, {
          ruleId: "accessRule/linkage-unknown",
          severity: "error",
          category: "reference",
          rule: "linkage существует",
          message: `правило доступа #${ruleIdx + 1}: linkage "${rule.linkage}" не найдена`,
          domainId: rule.domainId,
          propertyPath: `accessRules[${ruleIdx}].linkage`,
        });
      }
    }

    // ============ launch обязателен для action/any_action ============
    if (
      (rule.target === "action" || rule.target === "any_action") &&
      (!rule.launch || rule.launch.length === 0)
    ) {
      emit(ctx, {
        ruleId: "accessRule/launch-missing",
        severity: "error",
        category: "required",
        rule: "target: action/any_action требует launch",
        message: `правило доступа #${ruleIdx + 1}: target ${rule.target} без launch`,
        domainId: rule.domainId,
        propertyPath: `accessRules[${ruleIdx}].launch`,
      });
    }

    // ============ action существует ============
    if (rule.target === "action") {
      if (!rule.actionId) {
        emit(ctx, {
          ruleId: "accessRule/action-missing",
          severity: "error",
          category: "required",
          rule: "target: action требует id",
          message: `правило доступа #${ruleIdx + 1}: target = action, но id не задан`,
          domainId: rule.domainId,
          propertyPath: `accessRules[${ruleIdx}].id`,
        });
      } else {
        const actionExists = ctx.index.actions.some(
          (a) => a.domainId === rule.domainId && a.id === rule.actionId,
        );
        if (!actionExists) {
          emit(ctx, {
            ruleId: "accessRule/action-unknown",
            severity: "error",
            category: "reference",
            rule: "action существует",
            message: `правило доступа #${ruleIdx + 1}: action "${rule.actionId}" не найден`,
            domainId: rule.domainId,
            propertyPath: `accessRules[${ruleIdx}].id`,
          });
        }
      }
    }

    // ============ Проверка permission в scope ============
    const scopePaths: Array<{
      scope: "create" | "delete" | "edit" | "view" | "launch";
      items?: AccessRuleItem[];
    }> = [
      { scope: "create", items: rule.create },
      { scope: "delete", items: rule.delete },
      { scope: "edit", items: rule.edit },
      { scope: "view", items: rule.view },
      { scope: "launch", items: rule.launch },
    ];

    // Атрибуты сущности/связи для except-проверки
    let allowedAttrs: Set<string> | null = null;
    if (rule.target === "entity" && rule.entity) {
      const entity = entityByFqid.get(rule.entity);
      if (entity) {
        const set = new Set<string>();
        const seen = new Set<string>();
        let cur: EntityRecord | undefined = entity;
        while (cur && !seen.has(cur.fqid)) {
          seen.add(cur.fqid);
          cur.attributes.forEach((a) => set.add(a.id));
          cur = cur.inherits ? entityByFqid.get(cur.inherits) : undefined;
        }
        allowedAttrs = set;
      }
    } else if (rule.target === "linkage" && rule.linkage) {
      const linkage = linkageByFqid.get(rule.linkage.toLowerCase());
      if (linkage?.attributes) {
        allowedAttrs = new Set(linkage.attributes.map((a) => a.id));
      }
    }

    for (const { scope, items } of scopePaths) {
      if (!items || items.length === 0) continue;

      items.forEach((item, itemIdx) => {
        // ============ permission ∈ permissions ============
        if (item.kind === "permission") {
          if (!item.permission) {
            emit(ctx, {
              ruleId: "accessRule/permission-missing",
              severity: "error",
              category: "required",
              rule: "kind: permission требует permission",
              message: `правило доступа #${ruleIdx + 1}, ${scope}[${itemIdx}]: permission не указан`,
              domainId: rule.domainId,
              propertyPath: `accessRules[${ruleIdx}].${scope}[${itemIdx}].permission`,
            });
          } else {
            const expected =
              `${rule.domainId}/${item.permission}`.toLowerCase();
            if (!permissionIds.has(expected)) {
              emit(ctx, {
                ruleId: "accessRule/permission-unknown",
                severity: "error",
                category: "reference",
                rule: "permission существует",
                message: `правило доступа #${ruleIdx + 1}, ${scope}[${itemIdx}]: permission "${item.permission}" не найдено`,
                domainId: rule.domainId,
                propertyPath: `accessRules[${ruleIdx}].${scope}[${itemIdx}].permission`,
              });
            }
          }
        }

        // ============ kind: condition требует condition ============
        if (item.kind === "condition") {
          const c = item.condition;
          if (c === undefined || (typeof c === "string" && !c.trim())) {
            emit(ctx, {
              ruleId: "accessRule/condition-missing",
              severity: "error",
              category: "required",
              rule: "kind: condition требует condition",
              message: `правило доступа #${ruleIdx + 1}, ${scope}[${itemIdx}]: condition пуст`,
              domainId: rule.domainId,
              propertyPath: `accessRules[${ruleIdx}].${scope}[${itemIdx}].condition`,
            });
          }
        }

        // ============ kind: pass не имеет permission/condition ============
        if (item.kind === "pass") {
          if (item.permission || item.condition !== undefined) {
            emit(ctx, {
              ruleId: "accessRule/pass-has-extra",
              severity: "warning",
              category: "semantic",
              rule: "kind: pass не поддерживает permission/condition",
              message: `правило доступа #${ruleIdx + 1}, ${scope}[${itemIdx}]: лишние поля для pass`,
              domainId: rule.domainId,
              propertyPath: `accessRules[${ruleIdx}].${scope}[${itemIdx}]`,
            });
          }
        }

        // ============ except[].attribute существует ============
        if (item.except && allowedAttrs) {
          item.except.forEach((ex, exIdx) => {
            if (!allowedAttrs!.has(ex.attribute)) {
              emit(ctx, {
                ruleId: "accessRule/except-attribute-unknown",
                severity: "warning",
                category: "reference",
                rule: "except[].attribute существует",
                message: `правило доступа #${ruleIdx + 1}, ${scope}[${itemIdx}].except[${exIdx}]: attribute "${ex.attribute}" не найден`,
                domainId: rule.domainId,
                propertyPath: `accessRules[${ruleIdx}].${scope}[${itemIdx}].except[${exIdx}].attribute`,
              });
            }
          });
        }
      });
    }

    // ============ scope для entity/linkage/any_*: не должно быть launch ============
    if (
      (rule.target === "entity" ||
        rule.target === "linkage" ||
        rule.target === "any_entity" ||
        rule.target === "any_linkage") &&
      rule.launch
    ) {
      emit(ctx, {
        ruleId: "accessRule/launch-on-entity",
        severity: "error",
        category: "semantic",
        rule: "launch только для action/any_action",
        message: `правило доступа #${ruleIdx + 1}: launch при target ${rule.target}`,
        domainId: rule.domainId,
        propertyPath: `accessRules[${ruleIdx}].launch`,
      });
    }
    // И наоборот: create/delete/edit/view для action/any_action
    if (
      (rule.target === "action" || rule.target === "any_action") &&
      (rule.create || rule.delete || rule.edit || rule.view)
    ) {
      emit(ctx, {
        ruleId: "accessRule/entity-scopes-on-action",
        severity: "error",
        category: "semantic",
        rule: "create/delete/edit/view только для entity/linkage",
        message: `правило доступа #${ruleIdx + 1}: create/delete/edit/view при target ${rule.target}`,
        domainId: rule.domainId,
        propertyPath: `accessRules[${ruleIdx}]`,
      });
    }
  });
}

// ============ Localizations ============

function checkLocalizations(ctx: LintContext): void {
  const localizations = ctx.index.localizations;
  if (!localizations || localizations.length === 0) return;

  const langSeen = new Set<string>();
  for (const loc of localizations) {
    const langKey = `${loc.domainId}#${loc.language}`;
    if (langSeen.has(langKey)) {
      emit(ctx, {
        ruleId: "localization/duplicate-language",
        severity: "error",
        category: "semantic",
        rule: "Язык уникален в домене",
        message: `локализация: язык "${loc.language}" объявлен дважды в ${loc.domainId}`,
        domainId: loc.domainId,
        propertyPath: `localizations[${loc.language}]`,
      });
    } else {
      langSeen.add(langKey);
    }

    const keySeen = new Set<string>();
    for (const k of loc.keys) {
      if (keySeen.has(k.key)) {
        emit(ctx, {
          ruleId: "localization/duplicate-key",
          severity: "error",
          category: "semantic",
          rule: "Ключ уникален в языке",
          message: `локализация "${loc.language}": ключ "${k.key}" объявлен дважды`,
          domainId: loc.domainId,
          propertyPath: `localizations[${loc.language}].keys`,
        });
      } else {
        keySeen.add(k.key);
      }
    }
  }
}

// ============ Универсальная уникальность ID по секциям ============

function checkUniqueIds(ctx: LintContext): void {
  type Item = { id: string; domainId: string };

  const checkSection = (
    items: Item[],
    sectionKey: string,
    pathFor: (domainId: string, id: string) => string,
  ): void => {
    const seenByDomain = new Map<string, Map<string, number>>();
    for (const item of items) {
      if (!item?.id || !item?.domainId) continue;
      let m = seenByDomain.get(item.domainId);
      if (!m) {
        m = new Map();
        seenByDomain.set(item.domainId, m);
      }
      m.set(item.id, (m.get(item.id) || 0) + 1);
    }
    seenByDomain.forEach((counts, domainId) => {
      counts.forEach((count, id) => {
        if (count > 1) {
          emit(ctx, {
            ruleId: `duplicate-id/${sectionKey}`,
            severity: "error",
            category: "semantic",
            rule: `ID уникален в секции ${sectionKey}`,
            message: `«${id}» встречается ${count} раз в домене ${domainId} (${sectionKey})`,
            hint: "Удалите дубликат — иначе поведение схемы непредсказуемо",
            domainId,
            propertyPath: pathFor(domainId, id),
          });
        }
      });
    });
  };

  checkSection(
    ctx.index.entities.map((e) => ({ id: e.entityId, domainId: e.domainId })),
    "entities",
    (d, id) => `entities[${id}]`,
  );
  checkSection(
    ctx.index.entityLinkages.map((l) => ({
      id: l.id,
      domainId: l.domainId,
    })),
    "linkages",
    (d, id) => `linkages[${id}]`,
  );
  checkSection(
    ctx.index.dataTypes.map((dt) => ({ id: dt.id, domainId: dt.domainId })),
    "dataTypes",
    (d, id) => `dataTypes[${id}]`,
  );
  checkSection(
    ctx.index.sequences.map((s) => ({ id: s.id, domainId: s.domainId })),
    "sequences",
    (d, id) => `sequences[${id}]`,
  );
  checkSection(
    ctx.index.mixins.map((m) => ({ id: m.id, domainId: m.domainId })),
    "mixins",
    (d, id) => `mixins[${id}]`,
  );
  checkSection(
    ctx.index.dataRules.map((r) => ({ id: r.id, domainId: r.domainId })),
    "dataRules",
    (d, id) => `dataRules[${id}]`,
  );
  checkSection(
    ctx.index.uiRules.map((r) => ({ id: r.id, domainId: r.domainId })),
    "uiRules",
    (d, id) => `uiRules[${id}]`,
  );
  checkSection(
    ctx.index.uiPresets.map((p) => ({ id: p.id, domainId: p.domainId })),
    "uiPresets",
    (d, id) => `uiPresets[${id}]`,
  );
  checkSection(
    ctx.index.counterColorPatterns.map((c) => ({
      id: c.id,
      domainId: c.domainId,
    })),
    "counterColorPatterns",
    (d, id) => `counterColorPatterns[${id}]`,
  );

    checkSection(
    ctx.index.trees.map((t) => ({ id: t.id, domainId: t.domainId })),
    "trees",
    (d, id) => `trees[${id}]`,
  );

  // widgets (доменные, не путать с view-виджетами)
  const domainWidgets: Array<{ id: string; domainId: string }> = [];
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const items = schema?.sections?.widgets?.items || [];
    for (const w of items) {
      if (w?.id) domainWidgets.push({ id: String(w.id), domainId });
    }
  }
  checkSection(
    domainWidgets,
    "widgets",
    (_d, id) => `widgets[${id}]`,
  );

  // menuItems (menus[].items[])
  const menuItems: Array<{ id: string; domainId: string }> = [];
  for (const menu of ctx.index.menus || []) {
    if (menu.type !== "root_group") continue;
    for (const it of menu.items || []) {
      if (it?.id) menuItems.push({ id: it.id, domainId: menu.domainId });
    }
  }
  checkSection(
    menuItems,
    "menuItems",
    (_d, id) => `menus[..].items[${id}]`,
  );
}

function checkActionOpenListContext(ctx: LintContext): void {
  for (const a of ctx.index.actions) {
    if (a.type !== "open_list") continue;
    const set: string[] = [];
    if (a.attribute !== undefined) set.push("attribute");
    if (a.linkage !== undefined) set.push("linkage");
    if (a.join !== undefined) set.push("join");
    if (set.length > 1) {
      emit(ctx, {
        ruleId: "action/open-list-only-one-context",
        severity: "error",
        category: "semantic",
        rule: "Только одно из attribute / linkage / join",
        message: `Действие «${a.id}»: одновременно задано: ${set.join(", ")}`,
        hint: "Оставьте ровно одно из полей контекста",
        domainId: a.domainId,
        propertyPath: `actions[${a.id}]`,
      });
    }
  }
}

function checkActionOpenPageView(ctx: LintContext): void {
  const viewsByFqid = new Map<string, { type: string; entity?: string }>();
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const all = schema?.allViews || [];
    for (const v of all) {
      viewsByFqid.set(`${domainId}/${v.id}`.toLowerCase(), {
        type: String(v.type),
        entity: v.entity,
      });
    }
    const items = schema?.sections?.views?.items || [];
    for (const v of items) {
      const key = `${domainId}/${v.id}`.toLowerCase();
      if (!viewsByFqid.has(key)) {
        viewsByFqid.set(key, { type: String(v.type), entity: v.entity });
      }
    }
  }

  for (const a of ctx.index.actions) {
    if (a.type !== "open_page") continue;
    const viewRef = a.pageView || a.view;

    if (!viewRef) {
      emit(ctx, {
        ruleId: "action/open-page-view-missing",
        severity: "error",
        category: "required",
        rule: "open_page требует view",
        message: `Действие «${a.id}»: type = open_page, но view не задан`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].view`,
      });
      continue;
    }

    const view = viewsByFqid.get(viewRef.toLowerCase());
    if (!view) {
      emit(ctx, {
        ruleId: "action/open-page-view-invalid",
        severity: "error",
        category: "reference",
        rule: "view существует",
        message: `Действие «${a.id}»: view «${viewRef}» не найден`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].view`,
      });
      continue;
    }

    if (view.type !== "page") {
      emit(ctx, {
        ruleId: "action/open-page-view-invalid",
        severity: "error",
        category: "semantic",
        rule: "open_page.view ссылается на view типа page",
        message: `Действие «${a.id}»: view «${viewRef}» имеет тип «${view.type}»`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].view`,
      });
    }

    if (a.entity && view.entity) {
      const viewEntity = view.entity.includes("/")
        ? view.entity.toLowerCase()
        : `${a.domainId}/${view.entity}`.toLowerCase();
      if (viewEntity !== a.entity.toLowerCase()) {
        emit(ctx, {
          ruleId: "action/open-page-entity-mismatch",
          severity: "warning",
          category: "semantic",
          rule: "entity действия и entity view совпадают",
          message: `Действие «${a.id}»: entity «${a.entity}» ≠ entity view «${view.entity}»`,
          domainId: a.domainId,
          propertyPath: `actions[${a.id}].view`,
        });
      }
    }
  }
}

function checkBulkInContextMenus(ctx: LintContext): void {
  const actionTypeByFqid = new Map<string, string>();
  for (const a of ctx.index.actions) {
    actionTypeByFqid.set(`${a.domainId}/${a.id}`.toLowerCase(), a.type);
  }

  const resolveType = (domainId: string, actionId: string): string | null => {
    if (actionId.includes("/")) {
      return actionTypeByFqid.get(actionId.toLowerCase()) ?? null;
    }
    return (
      actionTypeByFqid.get(`${domainId}/${actionId}`.toLowerCase()) ?? null
    );
  };

  const BULK_TYPES = new Set(["bulk", "tree_bulk"]);

  // row_context_menu
  for (const a of ctx.index.viewTableActions || []) {
    if (a.type !== "row_context_menu") continue;
    for (const it of a.items) {
      const t = resolveType(a.domainId, it.action);
      if (t && BULK_TYPES.has(t)) {
        emit(ctx, {
          ruleId: "action/bulk-in-context-menu",
          severity: "error",
          category: "semantic",
          rule: "bulk / tree_bulk запрещён в row_context_menu",
          message: `View «${a.viewId}»: row_context_menu содержит действие «${it.action}» типа ${t}`,
          domainId: a.domainId,
          propertyPath: `views[${a.viewId}].table.actions`,
        });
      }
    }
  }

  // table.columns[].actions[]
  for (const c of ctx.index.viewColumns || []) {
    if (!c.actionTypes || c.actionTypes.length === 0) continue;
    for (const actId of c.actionTypes) {
      const t = resolveType(c.domainId, actId);
      if (t && BULK_TYPES.has(t)) {
        emit(ctx, {
          ruleId: "action/bulk-in-column-action",
          severity: "error",
          category: "semantic",
          rule: "bulk / tree_bulk запрещён в column.actions[]",
          message: `Колонка «${c.id}» во view «${c.viewId}»: действие «${actId}» типа ${t}`,
          domainId: c.domainId,
          propertyPath: `views[${c.viewId}].table.columns[${c.id}].actions`,
        });
      }
    }
  }
}

function checkLinkageNameFrom(ctx: LintContext): void {
  for (const l of ctx.index.entityLinkages) {
    if (!l.nameFrom?.side1) {
      emit(ctx, {
        ruleId: "linkage/name-from-missing",
        severity: "error",
        category: "required",
        rule: "nameFrom.side1 обязателен",
        message: `Связь «${l.id}»: nameFrom.side1 не задан`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].nameFrom.side1`,
      });
    }
    if (!l.nameFrom?.side2) {
      emit(ctx, {
        ruleId: "linkage/name-from-missing",
        severity: "error",
        category: "required",
        rule: "nameFrom.side2 обязателен",
        message: `Связь «${l.id}»: nameFrom.side2 не задан`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].nameFrom.side2`,
      });
    }
  }
}

function checkLinkageUndirected(ctx: LintContext): void {
  for (const l of ctx.index.entityLinkages) {
    if (l.undirected && l.type !== "n_n") {
      emit(ctx, {
        ruleId: "linkage/undirected-only-nn",
        severity: "error",
        category: "semantic",
        rule: "undirected допустим только для n_n",
        message: `Связь «${l.id}»: type = «${l.type}», но undirected = true`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].undirected`,
      });
    }
  }
}

function checkLinkageExcludeOnGraph(ctx: LintContext): void {
  const VALID = new Set(["true", "false", "off"]);
  for (const l of ctx.index.entityLinkages) {
    const v = l.excludeOnGraph;
    if (v === undefined || v === null) continue;
    if (!VALID.has(String(v))) {
      emit(ctx, {
        ruleId: "linkage/exclude-on-graph-invalid",
        severity: "error",
        category: "semantic",
        rule: "excludeOnGraph: true | false | off",
        message: `Связь «${l.id}»: excludeOnGraph = «${String(v)}»`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].excludeOnGraph`,
      });
    }
  }
}

function checkViewSourceType(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const items = schema?.sections?.views?.items || [];
    for (const v of items) {
      if (v.type !== "list") continue;
      if (v.sourceType && v.sourceType !== "operational") {
        emit(ctx, {
          ruleId: "view/source-type-invalid",
          severity: "error",
          category: "semantic",
          rule: "source.type — только operational",
          message: `View «${v.id}»: source.type = «${v.sourceType}», ожидается operational`,
          domainId,
          propertyPath: `views[${v.id}].source.type`,
        });
      }
    }
  }
}

function checkPageMenuItem(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const allViews = schema?.allViews || [];
    for (const v of allViews) {
      if (v.type !== "page") continue;
      if (!v.parentViewId) continue; // top-level page в R-Vision не бывает
      if (!v.menuItem) {
        emit(ctx, {
          ruleId: "view/page-menu-item-missing",
          severity: "error",
          category: "required",
          rule: "page.menuItem обязателен",
          message: `View «${v.id}» (page): menuItem не задан`,
          domainId,
          propertyPath: `views[${v.parentViewId}].views[${v.id}].menuItem`,
        });
      }
    }
  }
}

function checkLinkedGroupsControl(ctx: LintContext): void {
  for (const w of ctx.index.viewWidgets) {
    if (w.type !== "linked_objects_groups") continue;

    // control.type по умолчанию table. Если задан иной — ошибка.
    if (w.controlType && w.controlType !== "table") {
      emit(ctx, {
        ruleId: "view/linked-groups-control-invalid",
        severity: "error",
        category: "semantic",
        rule: "linked_objects_groups.control.type = table",
        message: `Виджет «${w.id}»: control.type = «${w.controlType}», ожидается table`,
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].control.type`,
      });
      // Дальнейшие проверки (columns/groupingBy) имеют смысл только при
      // control=table; если control явно другой — пропускаем.
      continue;
    }

    // control не задан → неявно table. columns[] обязателен.
    if (!w.linkedGroupsColumns || w.linkedGroupsColumns.length === 0) {
      emit(ctx, {
        ruleId: "view/linked-groups-columns-missing",
        severity: "error",
        category: "required",
        rule: "linked_objects_groups требует columns[]",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: columns[] пуст`,
        hint: "control.type = table (по умолчанию) требует columns[]",
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].columns`,
      });
    }

    // groupingBy[] обязателен.
    if (!w.linkedGroupsGroupingBy || w.linkedGroupsGroupingBy.length === 0) {
      emit(ctx, {
        ruleId: "view/linked-groups-grouping-missing",
        severity: "error",
        category: "required",
        rule: "linked_objects_groups требует groupingBy[]",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: groupingBy[] пуст`,
        hint: "Укажите хотя бы один атрибут для группировки",
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}].groupingBy`,
      });
    }
  }
}

function checkMenuViewTypes(ctx: LintContext): void {
  const ALLOWED = new Set([
    "list",
    "tabs_list",
    "tree",
    "dashboard",
    "dashboard_tree",
  ]);
  const typeByFqid = new Map<string, string>();
  for (const [domainId, schema] of Object.entries(
    ctx.index.schemasByDomain || {},
  )) {
    const items = schema?.sections?.views?.items || [];
    for (const v of items) {
      typeByFqid.set(`${domainId}/${v.id}`.toLowerCase(), String(v.type));
    }
  }
  for (const menu of ctx.index.menus) {
    const check = (view: string | undefined, path: string): void => {
      if (!view) return;
      const t = typeByFqid.get(view.toLowerCase());
      if (!t) return; // существование уже проверено в checkMenus
      if (!ALLOWED.has(t)) {
        emit(ctx, {
          ruleId: "menu/view-type-invalid",
          severity: "error",
          category: "semantic",
          rule: "view меню — list / tabs_list / tree / dashboard / dashboard_tree",
          message: `Меню «${menu.id}»: view «${view}» имеет тип «${t}»`,
          domainId: menu.domainId,
          propertyPath: path,
        });
      }
    };
    if (menu.type === "root_menu") check(menu.view, `menus[${menu.id}].view`);
    for (const it of menu.items || [])
      check(it.view, `menus[${menu.id}].items[${it.id}].view`);
  }
}

function checkMenuIconType(ctx: LintContext): void {
  const mediaByFqid = new Map<string, { type: string }>();
  for (const m of ctx.index.medias) {
    mediaByFqid.set(`${m.domainId}/${m.id}`.toLowerCase(), { type: m.type });
  }
  for (const menu of ctx.index.menus) {
    if (!menu.icon) continue;
    const media = mediaByFqid.get(menu.icon.toLowerCase());
    if (media && media.type !== "icon_name") {
      emit(ctx, {
        ruleId: "menu/icon-not-icon-name",
        severity: "error",
        category: "semantic",
        rule: "menus[].icon — только type: icon_name",
        message: `Меню «${menu.id}»: icon «${menu.icon}» имеет тип «${media.type}»`,
        domainId: menu.domainId,
        propertyPath: `menus[${menu.id}].icon`,
      });
    }
  }
}

function checkDataRuleConditionRequired(ctx: LintContext): void {
  for (const dr of ctx.index.dataRules) {
    if (dr.effect !== "default" && dr.effect !== "allowed") continue;
    const c = String(dr.condition ?? "").trim();
    if (!c) {
      emit(ctx, {
        ruleId: "dataRule/condition-required",
        severity: "error",
        category: "required",
        rule: "condition обязателен для effect: default | allowed",
        message: `Правило «${dr.id}»: effect = ${dr.effect}, но condition пуст`,
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].condition`,
      });
    }
  }
}

// ============ Main ============

export function lintModel(index: ModelIndex): LintReport {
  const {
    viewElementSets,
    presetSets,
    parentViewByDomain,
    widgetInfoByDomain,
  } = precomputeLintIndex(index);
  const ctx: LintContext = {
    index,
    issues: [],
    viewElementSets,
    presetSets,
    parentViewByDomain,
    widgetInfoByDomain,
  };

  // ============ Structure (Zod-compatible, editor-visible) ============
  checkCircularInheritanceLint(ctx);
  checkDuplicateEntityIdLint(ctx);

  for (const e of index.entities) {
    checkEntityNaming(ctx, e);
    checkEntityRequired(ctx, e);
    checkEntityRecommended(ctx, e);
    checkInheritance(ctx, e);
    checkEntityAttributes(ctx, e);
    checkDuplicateAttributes(ctx, e);
    checkEntityReferences(ctx, e);
    checkEntityLabelRules(ctx, e);
    checkEntitySorting(ctx, e);
    checkEntityIdentification(ctx, e);
    checkReconciliationOrder(ctx, e);
    checkReconciliationSources(ctx, e);

    for (const a of e.attributes) {
      checkAttributeNaming(ctx, e, a);
      checkAttributeRecommended(ctx, e, a);
      checkReference(ctx, e, a);
      checkValidationByHeuristic(ctx, e, a);
      checkSystemIdUsage(ctx, e, a);
      checkIdentifier(ctx, e, a);
      checkCalculation(ctx, e, a);
      checkWorkflowConstraints(ctx, e, a);
    }
  }

  checkReconciliationStrategies(ctx);

  // ============ Linkages ============
  checkEntityLinkageSemantics(ctx);
  checkLinkageSides(ctx);
  checkLinkageAttributeTypes(ctx);
  checkLinkageSearchability(ctx);
  checkGraphIconColors(ctx);

  // ============ DataRules ============
  checkDataRules(ctx);

  // ============ DataTypes ============
  checkDataTypes(ctx);

  checkCounterColorPatternFormat(ctx);

  // ============ exchangeSettings ============
  checkExchangeSettings(ctx);

  // ============ Mixins ============
  checkMixins(ctx);

  // ============ Actions ============
  checkActions(ctx);
  checkActionTransitions(ctx);

  // ============ Views ============
  checkViews(ctx);
  checkViewEntityExistence(ctx);
  checkViewLinkageRefs(ctx);
  checkLinkedObjectsGroups(ctx);
  checkViewGroupComponents(ctx);
  checkViewSourceJoins(ctx);
  checkViewColumns(ctx);
  checkViewTableMeta(ctx);
  checkViewTreeFilters(ctx);
  checkSpecialViews(ctx);
  checkViewMenuActions(ctx);

  // ============ RQL в condition ============
  checkRqlConditions(ctx);

  // ============ Trees ============
  checkTrees(ctx);

  // ============ TransitiveLinkages ============
  checkTransitiveLinkages(ctx);

  // ============ Menus ============
  checkMenus(ctx);

  // ============ Medias ============
  checkMedias(ctx);

  // ============ Permissions ============
  checkPermissions(ctx);

  // ============ AccessRules ============
  checkAccessRules(ctx);

  // ============ Localizations ============
  checkLocalizations(ctx);

  // ============ UI Rules ============
  for (const rule of index.uiRules || []) {
    checkUiRule(ctx, rule);
  }
  checkCounterColorPatterns(ctx);
  checkOrphanPresets(ctx);
  checkConflictingEffects(ctx);

  // ============ Новые правила (Zod-совместимость) ============
  checkUniqueIds(ctx);
  checkActionOpenListContext(ctx);
  checkActionOpenPageView(ctx);
  checkBulkInContextMenus(ctx);
  checkLinkageNameFrom(ctx);
  checkLinkageUndirected(ctx);
  checkLinkageExcludeOnGraph(ctx);
  checkViewSourceType(ctx);
  checkPageMenuItem(ctx);
  checkLinkedGroupsControl(ctx);
  checkMenuViewTypes(ctx);
  checkMenuIconType(ctx);
  checkDataRuleConditionRequired(ctx);
  checkTableAttributeConstraints(ctx);
  checkEntitySortingRql(ctx);
  checkEntityExternals(ctx);
  checkEntityBindAliases(ctx);
  checkViewLabelTemplates(ctx);
  checkCounterColorSingular(ctx);

  // ============ Итоговая статистика ============
  const bySeverity: Record<LintSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };
  const byCategory: Record<LintRuleCategory, number> = {
    naming: 0,
    required: 0,
    recommended: 0,
    reference: 0,
    semantic: 0,
    validation: 0,
    uirules: 0,
  };
  const byRuleMap = new Map<
    string,
    { rule: string; severity: LintSeverity; count: number }
  >();

  ctx.issues.forEach((i) => {
    bySeverity[i.severity]++;
    byCategory[i.category]++;
    const key = i.ruleId;
    if (!byRuleMap.has(key)) {
      byRuleMap.set(key, { rule: i.rule, severity: i.severity, count: 0 });
    }
    byRuleMap.get(key)!.count++;
  });

  const byRule = Array.from(byRuleMap.entries())
    .map(([ruleId, v]) => ({
      ruleId,
      rule: v.rule,
      severity: v.severity,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    issues: ctx.issues,
    stats: {
      total: ctx.issues.length,
      bySeverity,
      byCategory,
      byRule,
    },
  };
}

// ============ Sonar score ============

const CATEGORY_LABELS: Record<LintRuleCategory, string> = {
  naming: "Соглашения именования",
  required: "Обязательные поля",
  recommended: "Рекомендованные поля",
  reference: "Ссылочная целостность",
  semantic: "Семантика",
  validation: "Валидация данных",
  uirules: "UI Rules",
};

const CATEGORY_WEIGHTS: Record<LintRuleCategory, number> = {
  reference: 5,
  semantic: 4,
  uirules: 3,
  naming: 2,
  validation: 2,
  required: 1,
  recommended: 1,
};

export function computeSonarScores(
  index: ModelIndex,
  lint: LintReport,
): DomainSonarScores {
  // Считаем количество «единиц работы» в домене — сущностей + атрибутов
  // Это знаменатель для оценки плотности проблем.
  const domainWeight = new Map<string, number>();
  for (const e of index.entities) {
    let weight = 1;
    e.attributes.forEach((a) => {
      weight++;
      if (a.nestedAttributes) weight += a.nestedAttributes.length;
    });
    domainWeight.set(e.domainId, (domainWeight.get(e.domainId) || 0) + weight);
  }

  // Группируем issues по домену и категории
  const issuesByDomainCategory = new Map<
    string,
    Map<LintRuleCategory, number>
  >();
  for (const i of lint.issues) {
    if (!issuesByDomainCategory.has(i.domainId)) {
      issuesByDomainCategory.set(i.domainId, new Map());
    }
    const m = issuesByDomainCategory.get(i.domainId)!;
    m.set(i.category, (m.get(i.category) || 0) + 1);
  }

  const byDomain: Record<string, SonarScore> = {};

  const computeScore = (domainId: string): SonarScore => {
    const weight = Math.max(1, domainWeight.get(domainId) || 1);
    const issuesForDomain = issuesByDomainCategory.get(domainId) || new Map();

    const breakdown: SonarScore["breakdown"] = [];
    let totalScore = 0;
    let totalWeight = 0;

    (Object.keys(CATEGORY_LABELS) as LintRuleCategory[]).forEach((cat) => {
      const count = issuesForDomain.get(cat) || 0;
      // Оценка категории = 100 минус штраф.
      // Штраф пропорционален количеству проблем на единицу работы.
      // 1 issue на 10 единиц работы ≈ штраф 10 баллов.
      const ratio = count / weight;
      const catScore = Math.max(0, Math.round(100 - ratio * 100));
      const w = CATEGORY_WEIGHTS[cat];

      breakdown.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        score: catScore,
        weight: w,
        issueCount: count,
      });

      totalScore += catScore * w;
      totalWeight += w;
    });

    const score = Math.round(totalScore / totalWeight);
    const grade: SonarScore["grade"] =
      score >= 90
        ? "A"
        : score >= 75
          ? "B"
          : score >= 60
            ? "C"
            : score >= 40
              ? "D"
              : "E";

    return { score, grade, breakdown };
  };

  // Считаем для каждого домена, где есть сущности
  const allDomains = new Set(index.entities.map((e) => e.domainId));
  allDomains.forEach((d) => {
    byDomain[d] = computeScore(d);
  });

  // Общий score — средневзвешенный по всем доменам
  const domains = Array.from(allDomains);
  if (domains.length === 0) {
    const empty: SonarScore = { score: 100, grade: "A", breakdown: [] };
    return { byDomain, overall: empty };
  }

  let sumScore = 0;
  let sumWeight = 0;
  domains.forEach((d) => {
    const w = domainWeight.get(d) || 1;
    sumScore += byDomain[d].score * w;
    sumWeight += w;
  });

  const overallScore = Math.round(sumScore / sumWeight);
  const overallGrade: SonarScore["grade"] =
    overallScore >= 90
      ? "A"
      : overallScore >= 75
        ? "B"
        : overallScore >= 60
          ? "C"
          : overallScore >= 40
            ? "D"
            : "E";

  return {
    byDomain,
    overall: {
      score: overallScore,
      grade: overallGrade,
      breakdown: [],
    },
  };
}

/**
 * Резолвит ссылку на linkage:
 *   - `<linkageId>` → `currentDomainId/linkageId`
 *   - `<domain>/<linkageId>` → FQID
 * Возвращает найденный EntityLinkage или null.
 */
function resolveLinkageRef(
  ctx: LintContext,
  ref: string,
  currentDomainId: string,
): EntityLinkage | null {
  if (!ref || typeof ref !== "string") return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const slash = trimmed.indexOf("/");
  const targetDomain =
    slash > 0
      ? trimmed.slice(0, slash).toLowerCase()
      : currentDomainId.toLowerCase();
  const linkageId = slash > 0 ? trimmed.slice(slash + 1) : trimmed;

  const wantedFqid = `${targetDomain}/${linkageId}`.toLowerCase();
  for (const l of ctx.index.entityLinkages) {
    const lFqid = `${l.domainId}/${l.id}`.toLowerCase();
    if (lFqid === wantedFqid) return l;
  }
  return null;
}

/**
 * Разрешает ссылку на атрибут в контексте сущности `e`.
 * Поддерживает 3 формы:
 *   - "attrId"             — атрибут `e` или любого предка
 *   - "EntityId.attrId"    — атрибут указанной сущности в том же домене
 *   - "domain.tld/EntityId.attrId" — FQID (кросс-домен не проверяем глубоко)
 */
function resolveAttributeRef(
  ctx: LintContext,
  e: EntityRecord,
  ref: string | null | undefined,
): { ok: boolean; reason?: string } {
  if (!ref || typeof ref !== "string")
    return { ok: false, reason: "пустая ссылка" };
  const trimmed = ref.trim();
  if (!trimmed) return { ok: false, reason: "пустая ссылка" };

  // ============ Системный атрибут (id, createdAt, entityName, …) ============
  // Применим в любом контексте: entity, sorting, searching, projection, …
  if (SYSTEM_ATTRIBUTE_IDS.has(trimmed)) return { ok: true };

  // ============ 1. FQID: domain.tld/Entity.attr ============
  if (trimmed.includes("/")) {
    const slash = trimmed.indexOf("/");
    const domain = trimmed.slice(0, slash).toLowerCase();
    const rest = trimmed.slice(slash + 1);
    const dot = rest.indexOf(".");
    if (dot < 0)
      return { ok: false, reason: "FQID без атрибута (domain/Entity.attr)" };
    const entityId = rest.slice(0, dot).toLowerCase();
    const attrId = rest.slice(dot + 1);

    // Системный атрибут в FQID: domain/Entity.createdAt
    if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) return { ok: true };

    const fqid = `${domain}/${entityId}`;
    const target = ctx.index.entitiesByFqid[fqid];
    if (!target) return { ok: false, reason: `сущность ${fqid} не найдена` };
    const has = target.attributes.some((a) => a.id === attrId);
    return has
      ? { ok: true }
      : { ok: false, reason: `атрибут ${attrId} не найден в ${fqid}` };
  }

  // ============ 2. EntityId.attrId ============
  const dot = trimmed.indexOf(".");
  if (dot > 0) {
    const entityId = trimmed.slice(0, dot);
    const attrId = trimmed.slice(dot + 1);

    // Системный атрибут в Entity.attr: Requirement.entityName
    if (SYSTEM_ATTRIBUTE_IDS.has(attrId)) return { ok: true };

    const entityLower = entityId.toLowerCase();

    // Кандидаты: сам e, потомки (не нужно), предки
    const candidates: EntityRecord[] = [];
    const seen = new Set<string>();
    let cur: EntityRecord | undefined = e;
    while (cur && !seen.has(cur.fqid)) {
      seen.add(cur.fqid);
      candidates.push(cur);
      cur = cur.inherits ? ctx.index.entitiesByFqid[cur.inherits] : undefined;
    }

    const match = candidates.find(
      (c) =>
        c.domainId.toLowerCase() === e.domainId.toLowerCase() &&
        c.entityId.toLowerCase() === entityLower,
    );
    if (!match) {
      return {
        ok: false,
        reason: `сущность «${entityId}» не является предком «${e.entityId}»`,
      };
    }
    const has = match.attributes.some((a) => a.id === attrId);
    return has
      ? { ok: true }
      : { ok: false, reason: `атрибут ${attrId} не найден в ${match.fqid}` };
  }

  // ============ 3. attrId — ищем в цепочке наследования ============
  let cur: EntityRecord | undefined = e;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.fqid)) {
    seen.add(cur.fqid);
    if (cur.attributes.some((a) => a.id === trimmed)) return { ok: true };
    cur = cur.inherits ? ctx.index.entitiesByFqid[cur.inherits] : undefined;
  }
  return { ok: false, reason: `атрибут ${trimmed} не найден` };
}

// ============ CounterColorPatterns ============

function checkCounterColorPatterns(ctx: LintContext): void {
  const byDomain = ctx.index.counterColorPatternsByDomain || {};

  const knownIn = (domainId: string): Set<string> => {
    const ids = byDomain[domainId] || [];
    return new Set(ids.map(String));
  };

  // views[].widgets[].counterColorPattern
  // views[].table.columns[].counterColorPattern
  for (const [domainId, byView] of Object.entries(
    ctx.index.viewElementsByDomain || {},
  )) {
    const known = knownIn(domainId);

    for (const [viewId, elements] of Object.entries(byView)) {
      const widgets = elements.widgetsWithType || [];
      const columns = elements.columnsWithType || [];

      for (const w of widgets) {
        if (!w.counterColorPattern) continue;
        const ref = String(w.counterColorPattern);
        // FQID на другой домен не проверяем локально.
        if (ref.includes("/")) continue;
        if (!known.has(ref)) {
          emit(ctx, {
            ruleId: "counterColorPattern/widget-unknown",
            severity: "warning",
            category: "semantic",
            rule: "counterColorPattern существует",
            message: `Виджет «${w.id}» во view «${viewId}» ссылается на несуществующий counterColorPattern «${ref}»`,
            hint: "Проверьте id в counterColorPatterns[] домена",
            domainId,
            propertyPath: `views[${viewId}].widgets[${w.id}].counterColorPattern`,
          });
        }
      }

      for (const c of columns) {
        if (!c.counterColorPattern) continue;
        const ref = String(c.counterColorPattern);
        if (ref.includes("/")) continue;
        if (!known.has(ref)) {
          emit(ctx, {
            ruleId: "counterColorPattern/column-unknown",
            severity: "warning",
            category: "semantic",
            rule: "counterColorPattern существует",
            message: `Колонка «${c.id}» во view «${viewId}» ссылается на несуществующий counterColorPattern «${ref}»`,
            hint: "Проверьте id в counterColorPatterns[] домена",
            domainId,
            propertyPath: `views[${viewId}].table.columns[${c.id}].counterColorPattern`,
          });
        }
      }
    }
  }
}

function checkLinkageSides(ctx: LintContext): void {
  for (const l of ctx.index.entityLinkages) {
    if (!ctx.index.entitiesByFqid[l.side1Fqid]) {
      emit(ctx, {
        ruleId: "linkage/side1-unknown",
        severity: "error",
        category: "reference",
        rule: "side1 ссылается на существующую сущность",
        message: `связь «${l.id}»: side1 = "${l.side1Fqid}" не найдена в индексе`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].side1`,
      });
    }
    if (!ctx.index.entitiesByFqid[l.side2Fqid]) {
      emit(ctx, {
        ruleId: "linkage/side2-unknown",
        severity: "error",
        category: "reference",
        rule: "side2 ссылается на существующую сущность",
        message: `связь «${l.id}»: side2 = "${l.side2Fqid}" не найдена в индексе`,
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].side2`,
      });
    }
  }
}
const COUNTER_TIME_RE = /^([1-9][0-9]*[wdhm])+$/;
const COUNTER_PERCENT_RE = /^(?!0%)([1-9][0-9]?|100)%$/;

function parseCounterTimeToMinutes(s: string): number {
  let total = 0;
  const matches = s.matchAll(/([1-9][0-9]*)([wdhm])/g);
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    if (u === "w") total += n * 60 * 24 * 7;
    else if (u === "d") total += n * 60 * 24;
    else if (u === "h") total += n * 60;
    else if (u === "m") total += n;
  }
  return total;
}

function checkCounterColorPatternFormat(ctx: LintContext): void {
  const patterns = ctx.index.counterColorPatterns || [];
  if (patterns.length === 0) return;

  for (const p of patterns) {
    const redValid =
      COUNTER_TIME_RE.test(p.red) || COUNTER_PERCENT_RE.test(p.red);
    const yellowValid =
      COUNTER_TIME_RE.test(p.yellow) || COUNTER_PERCENT_RE.test(p.yellow);

    if (!redValid) {
      emit(ctx, {
        ruleId: "counterColorPattern/red-format",
        severity: "error",
        category: "validation",
        rule: "Формат red: числа с единицей w|d|h|m или проценты",
        message: `правило «${p.id}»: red = "${p.red}" — неверный формат`,
        hint: "Примеры: 1w2d3h4m или 60%",
        domainId: p.domainId,
        propertyPath: `counterColorPatterns[${p.id}].red`,
      });
    }
    if (!yellowValid) {
      emit(ctx, {
        ruleId: "counterColorPattern/yellow-format",
        severity: "error",
        category: "validation",
        rule: "Формат yellow: числа с единицей w|d|h|m или проценты",
        message: `правило «${p.id}»: yellow = "${p.yellow}" — неверный формат`,
        hint: "Примеры: 2d или 40%",
        domainId: p.domainId,
        propertyPath: `counterColorPatterns[${p.id}].yellow`,
      });
    }
    if (!redValid || !yellowValid) continue;

    const redIsPercent = p.red.includes("%");
    const yellowIsPercent = p.yellow.includes("%");
    if (redIsPercent !== yellowIsPercent) {
      emit(ctx, {
        ruleId: "counterColorPattern/format-mismatch",
        severity: "error",
        category: "semantic",
        rule: "red и yellow в одной шкале",
        message: `правило «${p.id}»: red и yellow заданы в разных шкалах`,
        domainId: p.domainId,
        propertyPath: `counterColorPatterns[${p.id}]`,
      });
      continue;
    }

    if (redIsPercent) {
      const r = parseInt(p.red.replace("%", ""), 10);
      const y = parseInt(p.yellow.replace("%", ""), 10);
      if (y > r) {
        emit(ctx, {
          ruleId: "counterColorPattern/yellow-gt-red",
          severity: "error",
          category: "semantic",
          rule: "yellow ≤ red",
          message: `правило «${p.id}»: yellow (${y}%) > red (${r}%)`,
          domainId: p.domainId,
          propertyPath: `counterColorPatterns[${p.id}]`,
        });
      }
    } else {
      const r = parseCounterTimeToMinutes(p.red);
      const y = parseCounterTimeToMinutes(p.yellow);
      if (y > r) {
        emit(ctx, {
          ruleId: "counterColorPattern/yellow-gt-red",
          severity: "error",
          category: "semantic",
          rule: "yellow ≤ red",
          message: `правило «${p.id}»: yellow (${y}м) > red (${r}м)`,
          domainId: p.domainId,
          propertyPath: `counterColorPatterns[${p.id}]`,
        });
      }
    }
  }
}
function checkViewMenuActions(ctx: LintContext): void {
  const actionsByDomain = new Map<string, Set<string>>();
  for (const a of ctx.index.actions) {
    let set = actionsByDomain.get(a.domainId);
    if (!set) {
      set = new Set();
      actionsByDomain.set(a.domainId, set);
    }
    set.add(a.id);
  }

  for (const rec of ctx.index.viewMenuActions || []) {
    if (rec.action.includes("/")) continue; // cross-domain не проверяем
    const known = actionsByDomain.get(rec.domainId) || new Set<string>();
    if (!known.has(rec.action)) {
      emit(ctx, {
        ruleId: "view/panel-menu-action-unknown",
        severity: "warning",
        category: "reference",
        rule: "views[].views[].menu[].action существует",
        message: `View «${rec.panelViewId}»: menu[${rec.index}].action «${rec.action}» не найден`,
        domainId: rec.domainId,
        propertyPath: `views[${rec.viewId}].views[${rec.panelViewId}].menu`,
      });
    }
  }
}
function checkReconciliationStrategies(ctx: LintContext): void {
  const KNOWN = new Set([
    "replace",
    "array_merge",
    "array_concat",
    "earliest_date",
    "latest_date",
  ]);
  const ARRAY_STRATEGIES = new Set(["array_merge", "array_concat"]);
  const DATE_STRATEGIES = new Set(["earliest_date", "latest_date"]);
  const DATE_TYPES = new Set(["Timestamp", "Date", "Time"]);

  for (const e of ctx.index.entities) {
    for (const r of e.reconciliation || []) {
      if (!r.attribute) continue;
      const attr = findAttributeWithInheritance(ctx, e.fqid, r.attribute);
      if (!attr) continue;

      if (!r.mergeStrategy) continue;
      const strategy = r.mergeStrategy;

      if (!KNOWN.has(strategy)) {
        emit(ctx, {
          ruleId: "entity/reconciliation-strategy-unknown",
          severity: "warning",
          category: "semantic",
          rule: "mergeStrategy.type — известное значение",
          message: `сущность «${e.entityId}», attribute «${r.attribute}»: неизвестная стратегия «${strategy}»`,
          hint: "Допустимые: replace, array_merge, array_concat, earliest_date, latest_date",
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: r.attribute,
          propertyPath: `entities[${e.entityId}].reconciliation`,
        });
        continue;
      }

      if (ARRAY_STRATEGIES.has(strategy) && attr.dataType !== "Array") {
        emit(ctx, {
          ruleId: "entity/reconciliation-strategy-mismatch",
          severity: "warning",
          category: "semantic",
          rule: "array_merge / array_concat требуют Array",
          message: `сущность «${e.entityId}», attribute «${r.attribute}»: стратегия «${strategy}» для типа «${attr.dataType}»`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: r.attribute,
          propertyPath: `entities[${e.entityId}].reconciliation`,
        });
      }

      if (DATE_STRATEGIES.has(strategy) && !DATE_TYPES.has(attr.dataType)) {
        emit(ctx, {
          ruleId: "entity/reconciliation-strategy-mismatch",
          severity: "warning",
          category: "semantic",
          rule: "earliest_date / latest_date требуют Timestamp/Date/Time",
          message: `сущность «${e.entityId}», attribute «${r.attribute}»: стратегия «${strategy}» для типа «${attr.dataType}»`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: r.attribute,
          propertyPath: `entities[${e.entityId}].reconciliation`,
        });
      }
    }
  }
}
const GRAPH_ICON_COLORS = new Set<string>([
  "red",
  "pink",
  "lightpink",
  "orange",
  "peach",
  "yellow",
  "green",
  "lightgreen",
  "turquoise",
  "lightblue",
  "blue",
  "violet",
  "purple",
  "grey",
]);

function checkGraphIconColors(ctx: LintContext): void {
  for (const e of ctx.index.entities) {
    if (
      e.graphView?.iconColor &&
      !GRAPH_ICON_COLORS.has(e.graphView.iconColor)
    ) {
      emit(ctx, {
        ruleId: "entity/graphView-iconColor-invalid",
        severity: "warning",
        category: "validation",
        rule: "graphView.iconColor — допустимый цвет",
        message: `сущность «${e.entityId}»: неизвестный цвет «${e.graphView.iconColor}»`,
        hint: "Допустимые: red, pink, lightpink, orange, peach, yellow, green, lightgreen, turquoise, lightblue, blue, violet, purple, grey",
        domainId: e.domainId,
        entityFqid: e.fqid,
        propertyPath: `entities[${e.entityId}].graphView.iconColor`,
      });
    }
  }
  for (const l of ctx.index.entityLinkages) {
    if (l.view?.iconColor && !GRAPH_ICON_COLORS.has(l.view.iconColor)) {
      emit(ctx, {
        ruleId: "linkage/view-iconColor-invalid",
        severity: "warning",
        category: "validation",
        rule: "view.iconColor — допустимый цвет",
        message: `связь «${l.id}»: неизвестный цвет «${l.view.iconColor}»`,
        hint: "Допустимые: red, pink, lightpink, orange, peach, yellow, green, lightgreen, turquoise, lightblue, blue, violet, purple, grey",
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].view.iconColor`,
      });
    }
  }
}
function checkLinkageAttributeTypes(ctx: LintContext): void {
  const FORBIDDEN_BASE = new Set(["Automation", "Configuration", "Variable"]);
  for (const l of ctx.index.entityLinkages) {
    for (const a of l.attributes || []) {
      if (FORBIDDEN_BASE.has(a.dataType)) {
        emit(ctx, {
          ruleId: "linkage/attribute-forbidden-type",
          severity: "error",
          category: "validation",
          rule: "Тип атрибута связи — не Automation/Configuration/Variable",
          message: `связь «${l.id}», атрибут «${a.id}»: тип «${a.dataType}» запрещён`,
          domainId: l.domainId,
          propertyPath: `linkages[${l.id}].attributes[${a.id}].dataType`,
        });
        continue;
      }
      if (a.dataTypeKind === "custom") {
        const dt = ctx.index.dataTypes.find(
          (d) => d.domainId === l.domainId && d.id === a.dataType,
        );
        if (dt && dt.kind === "Table") {
          emit(ctx, {
            ruleId: "linkage/attribute-table-type",
            severity: "error",
            category: "validation",
            rule: "Table не поддерживается в атрибутах связи",
            message: `связь «${l.id}», атрибут «${a.id}»: тип Table запрещён`,
            domainId: l.domainId,
            propertyPath: `linkages[${l.id}].attributes[${a.id}].dataType`,
          });
        }
      }
    }
  }
}
const LABEL_SYSTEM_ALLOWED = new Set([
  "createdAt",
  "createdBy",
  "domainId",
  "entityId",
  "entityName",
  "id",
  "organizationId",
  "updatedAt",
  "updatedBy",
  "version",
]);

function checkEntityLabelRules(ctx: LintContext, e: EntityRecord): void {
  if (!e.label) return;
  const placeholders = [...e.label.matchAll(/{(.*?)}/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);

  for (const ph of placeholders) {
    if (SYSTEM_ATTRIBUTE_IDS.has(ph)) {
      if (!LABEL_SYSTEM_ALLOWED.has(ph)) {
        emit(ctx, {
          ruleId: "entity/label-system-attribute-forbidden",
          severity: "warning",
          category: "semantic",
          rule: "label не ссылается на запрещённый системный атрибут",
          message: `сущность «${e.entityId}»: label ссылается на системный «${ph}»`,
          hint: "Разрешены: createdAt, createdBy, domainId, entityId, entityName, id, organizationId, updatedAt, updatedBy, version",
          domainId: e.domainId,
          entityFqid: e.fqid,
        });
      }
      continue;
    }

    // ссылка на атрибут
    if (ph.includes("/") || ph.includes(".")) continue; // кросс-домен/нотация Entity.attr — не проверяем

    const attr = findAttributeWithInheritance(ctx, e.fqid, ph);
    if (attr && attr.dataType === "Reference") {
      emit(ctx, {
        ruleId: "entity/label-reference-attribute",
        severity: "warning",
        category: "semantic",
        rule: "label не использует Reference-атрибут",
        message: `сущность «${e.entityId}»: label ссылается на «${ph}» типа Reference`,
        hint: "Reference в label работает некорректно; используйте проекцию",
        domainId: e.domainId,
        entityFqid: e.fqid,
      });
    }
  }
}
function checkActionTransitions(ctx: LintContext): void {
  for (const a of ctx.index.actions) {
    if (a.type !== "workflow") continue;

    if (!a.transition?.to) {
      emit(ctx, {
        ruleId: "action/workflow-transition-missing",
        severity: "error",
        category: "required",
        rule: "type: workflow требует transition.to",
        message: `действие «${a.id}»: type = workflow, но transition.to не задан`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].transition`,
      });
      continue;
    }

    if (!a.entity) {
      emit(ctx, {
        ruleId: "action/workflow-entity-missing",
        severity: "error",
        category: "required",
        rule: "type: workflow требует entity",
        message: `действие «${a.id}»: type = workflow, но entity не указан`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].entity`,
      });
      continue;
    }

    const entity = ctx.index.entitiesByFqid[a.entity];
    if (!entity) continue;

    if (!a.attribute) {
      emit(ctx, {
        ruleId: "action/workflow-attribute-missing",
        severity: "error",
        category: "required",
        rule: "type: workflow требует attribute",
        message: `действие «${a.id}»: type = workflow, но attribute не указан`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].attribute`,
      });
      continue;
    }

    const attr = findAttributeWithInheritance(ctx, a.entity, a.attribute);
    if (!attr) {
      emit(ctx, {
        ruleId: "action/workflow-attribute-unknown",
        severity: "error",
        category: "reference",
        rule: "attribute действия workflow существует",
        message: `действие «${a.id}»: attribute «${a.attribute}» не найден в «${a.entity}»`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].attribute`,
      });
      continue;
    }

    const dt =
      attr.dataTypeKind === "custom"
        ? ctx.index.dataTypes.find(
            (d) => d.domainId === entity.domainId && d.id === attr.dataType,
          )
        : null;

    if (!dt || dt.kind !== "Workflow") {
      emit(ctx, {
        ruleId: "action/workflow-attribute-not-workflow",
        severity: "error",
        category: "semantic",
        rule: "attribute действия workflow — Workflow",
        message: `действие «${a.id}»: attribute «${a.attribute}» имеет тип «${attr.dataType}», ожидается Workflow`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].attribute`,
      });
      continue;
    }

    const statuses = new Set(dt.statuses || []);
    if (!statuses.has(a.transition.to)) {
      emit(ctx, {
        ruleId: "action/workflow-transition-unknown",
        severity: "error",
        category: "reference",
        rule: "transition.to — статус workflow",
        message: `действие «${a.id}»: transition.to «${a.transition.to}» не найден среди статусов «${attr.dataType}»`,
        domainId: a.domainId,
        propertyPath: `actions[${a.id}].transition.to`,
      });
    }
  }
}

function checkViewGroupComponents(ctx: LintContext): void {
  const components = ctx.index.viewGroupComponents || [];
  if (components.length === 0) return;

  // domainId → viewId → Set<widgetId>
  const widgetsByView = new Map<string, Map<string, Set<string>>>();
  for (const w of ctx.index.viewWidgets) {
    let byView = widgetsByView.get(w.domainId);
    if (!byView) {
      byView = new Map();
      widgetsByView.set(w.domainId, byView);
    }
    let set = byView.get(w.parentViewId);
    if (!set) {
      set = new Set();
      byView.set(w.parentViewId, set);
    }
    set.add(w.id);
  }

  // domainId → viewId → Map<groupId, groupType>
  const groupsByView = new Map<string, Map<string, Map<string, string>>>();
  for (const g of ctx.index.viewGroups) {
    let byView = groupsByView.get(g.domainId);
    if (!byView) {
      byView = new Map();
      groupsByView.set(g.domainId, byView);
    }
    let map = byView.get(g.parentViewId);
    if (!map) {
      map = new Map();
      byView.set(g.parentViewId, map);
    }
    map.set(g.id, g.type);
  }

  for (const c of components) {
    // ============ kind: block ============
    if (c.kind === "block") {
      const blockId = c.block;
      if (!blockId) continue;
      if (blockId.includes("/")) continue; // кросс-домен — не проверяем

      const map = groupsByView.get(c.domainId)?.get(c.viewId);
      if (!map) continue;
      const t = map.get(blockId);
      if (!t) {
        emit(ctx, {
          ruleId: "view/group-component-block-unknown",
          severity: "error",
          category: "reference",
          rule: "group.components[].block существует",
          message: `View «${c.viewId}», группа «${c.groupId}»: компонент [${c.index}].block «${blockId}» не найден среди groups[] этого view`,
          hint: "Проверьте id группы в views[].groups[]",
          domainId: c.domainId,
          propertyPath: `views[${c.viewId}].groups[${c.groupId}].components`,
        });
      } else if (t !== "block") {
        emit(ctx, {
          ruleId: "view/group-component-block-wrong-type",
          severity: "warning",
          category: "semantic",
          rule: "components[].block — группа type: block",
          message: `View «${c.viewId}», группа «${c.groupId}»: блок «${blockId}» имеет type «${t}», ожидается «block»`,
          domainId: c.domainId,
          propertyPath: `views[${c.viewId}].groups[${c.groupId}].components`,
        });
      }
      continue;
    }

    // ============ kind: widget ============
    const widgetId = c.widget;
    if (!widgetId) continue;
    if (widgetId.startsWith("external:")) continue;
    if (widgetId.includes("/")) continue;

    const known = widgetsByView.get(c.domainId)?.get(c.viewId);
    if (!known) continue;
    if (!known.has(widgetId)) {
      emit(ctx, {
        ruleId: "view/group-component-widget-unknown",
        severity: "error",
        category: "reference",
        rule: "group.components[].widget существует",
        message: `View «${c.viewId}», группа «${c.groupId}»: компонент [${c.index}].widget «${widgetId}» не найден среди widgets[] этого view`,
        hint: "Проверьте id виджета в views[].widgets[]",
        domainId: c.domainId,
        propertyPath: `views[${c.viewId}].groups[${c.groupId}].components`,
      });
    }
  }
}

function checkLinkedObjectsGroups(ctx: LintContext): void {
  // Индекс join-id из всех transitiveLinkages
  const knownJoins = new Set<string>();
  for (const tl of ctx.index.transitiveLinkages || []) {
    const walk = (joins: any[] | undefined): void => {
      if (!Array.isArray(joins)) return;
      for (const j of joins) {
        if (j?.id) knownJoins.add(String(j.id));
        if (j?.joins) walk(j.joins);
      }
    };
    walk(tl.joins as any[]);
  }

  for (const w of ctx.index.viewWidgets) {
    if (w.type !== "linked_objects_groups") continue;

    const hasLinkages = (w.linkedGroupsLinkages || []).length > 0;
    const hasJoins = (w.linkedGroupsJoins || []).length > 0;

    if (!hasLinkages && !hasJoins) {
      emit(ctx, {
        ruleId: "view/linked-groups-empty",
        severity: "error",
        category: "required",
        rule: "linked_objects_groups требует linkages или joins",
        message: `Виджет «${w.id}» во view «${w.parentViewId}»: не задано ни linkages, ни joins`,
        domainId: w.domainId,
        propertyPath: `views[${w.parentViewId}].widgets[${w.id}]`,
      });
    }

    for (const jid of w.linkedGroupsJoins || []) {
      if (!knownJoins.has(jid)) {
        emit(ctx, {
          ruleId: "view/linked-groups-join-unknown",
          severity: "warning",
          category: "reference",
          rule: "linked_objects_groups.joins[] существует",
          message: `Виджет «${w.id}»: join «${jid}» не найден в transitiveLinkages`,
          domainId: w.domainId,
          propertyPath: `views[${w.parentViewId}].widgets[${w.id}].joins`,
        });
      }
    }
  }
}

// Константа — вынести наверх (рядом с GRAPH_ICON_COLORS)
const FORBIDDEN_SORTING_ATTRS = new Set(["id", "tenantId", "organizationId"]);

function checkEntitySorting(ctx: LintContext, e: EntityRecord): void {
  for (const s of e.sorting || []) {
    const seen = new Map<string, number>();

    for (const b of s.by) {
      if (FORBIDDEN_SORTING_ATTRS.has(b.attribute)) {
        emit(ctx, {
          ruleId: "entity/sorting-forbidden-attribute",
          severity: "warning",
          category: "semantic",
          rule: "sorting[].by[].attribute не id/tenantId/organizationId",
          message: `сущность «${e.entityId}», sorting[${s.id}]: атрибут «${b.attribute}» запрещён в сортировке`,
          hint: "Используйте createdAt или предметный атрибут",
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].sorting[${s.id}].by`,
        });
      }
      seen.set(b.attribute, (seen.get(b.attribute) || 0) + 1);
    }

    seen.forEach((count, attr) => {
      if (count > 1) {
        emit(ctx, {
          ruleId: "entity/sorting-duplicate-attribute",
          severity: "warning",
          category: "semantic",
          rule: "sorting[].by[] без дубликатов attribute",
          message: `сущность «${e.entityId}», sorting[${s.id}]: атрибут «${attr}» указан ${count} раза`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].sorting[${s.id}].by`,
        });
      }
    });
  }
}

function checkIdentificationRules(
  ctx: LintContext,
  e: EntityRecord,
  ruleId: string,
  rules: EntityIdentificationRule[],
  pathPrefix: string,
): void {
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    const path = `${pathPrefix}[${i}]`;

    if (r.attribute) {
      const attr = findAttributeWithInheritance(ctx, e.fqid, r.attribute);
      if (attr && attr.dataType === "Array") {
        emit(ctx, {
          ruleId: "entity/identification-array-attribute",
          severity: "error",
          category: "semantic",
          rule: "identification не использует Array",
          message: `сущность «${e.entityId}»: identification[${ruleId}]${path}: атрибут «${r.attribute}» имеет тип Array`,
          hint: "Array нельзя использовать для идентификации — сломает дедупликацию",
          domainId: e.domainId,
          entityFqid: e.fqid,
          attributeId: r.attribute,
          propertyPath: `entities[${e.entityId}].identification[${ruleId}].rule`,
        });
      }
    }

    if (Array.isArray(r.and)) {
      checkIdentificationRules(ctx, e, ruleId, r.and, `${path}.and`);
    }
    if (Array.isArray(r.or)) {
      checkIdentificationRules(ctx, e, ruleId, r.or, `${path}.or`);
    }
  }
}

function checkEntityIdentification(ctx: LintContext, e: EntityRecord): void {
  for (const idr of e.identification || []) {
    checkIdentificationRules(ctx, e, idr.id, idr.rule || [], "");
  }
}

function checkReconciliationOrder(ctx: LintContext, e: EntityRecord): void {
  const recon = e.reconciliation || [];
  if (recon.length === 0) return;

  let defaultIndex = -1;
  let defaultCount = 0;

  for (let i = 0; i < recon.length; i++) {
    if (recon[i].default && recon[i].default!.length > 0) {
      defaultCount++;
      defaultIndex = i;
    }
  }

  if (defaultCount > 1) {
    emit(ctx, {
      ruleId: "entity/reconciliation-default-multiple",
      severity: "error",
      category: "semantic",
      rule: "reconciliation.default — один раз",
      message: `сущность «${e.entityId}»: default задан ${defaultCount} раз`,
      domainId: e.domainId,
      entityFqid: e.fqid,
      propertyPath: `entities[${e.entityId}].reconciliation`,
    });
  }

  if (defaultIndex >= 0 && defaultIndex !== recon.length - 1) {
    emit(ctx, {
      ruleId: "entity/reconciliation-default-not-last",
      severity: "error",
      category: "semantic",
      rule: "reconciliation.default — последний элемент",
      message: `сущность «${e.entityId}»: default должен быть последним элементом reconciliation`,
      hint: "Все attribute+sourcePriority должны идти до default",
      domainId: e.domainId,
      entityFqid: e.fqid,
      propertyPath: `entities[${e.entityId}].reconciliation`,
    });
  }
}

function checkReconciliationSources(ctx: LintContext, e: EntityRecord): void {
  const recon = e.reconciliation || [];

  for (let ri = 0; ri < recon.length; ri++) {
    const item = recon[ri];
    const lists: Array<{ name: string; values: string[] }> = [];
    if (item.sourcePriority && item.sourcePriority.length > 0) {
      lists.push({ name: "sourcePriority", values: item.sourcePriority });
    }
    if (item.default && item.default.length > 0) {
      lists.push({ name: "default", values: item.default });
    }

    for (const { name, values } of lists) {
      const seen = new Set<string>();
      let asteriskIndex = -1;

      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (seen.has(v)) {
          emit(ctx, {
            ruleId: "entity/reconciliation-duplicate-source",
            severity: "warning",
            category: "semantic",
            rule: `${name}[] без дубликатов source`,
            message: `сущность «${e.entityId}»: reconciliation[${ri}].${name}: «${v}» повторяется`,
            domainId: e.domainId,
            entityFqid: e.fqid,
            propertyPath: `entities[${e.entityId}].reconciliation`,
          });
        }
        seen.add(v);
        if (v === "*") asteriskIndex = i;
      }

      if (asteriskIndex >= 0 && asteriskIndex !== values.length - 1) {
        emit(ctx, {
          ruleId: "entity/reconciliation-asterisk-not-last",
          severity: "warning",
          category: "semantic",
          rule: `"*" — последний элемент в ${name}[]`,
          message: `сущность «${e.entityId}»: reconciliation[${ri}].${name}: "*" должен быть последним`,
          domainId: e.domainId,
          entityFqid: e.fqid,
          propertyPath: `entities[${e.entityId}].reconciliation`,
        });
      }
    }
  }
}

function checkLinkageSearchability(ctx: LintContext): void {
  for (const l of ctx.index.entityLinkages) {
    if (!l.useForSearch) continue;
    if (!l.attributes || l.attributes.length === 0) continue;

    const hasSearchable = l.attributes.some((a) => a.searchable !== false);
    if (!hasSearchable) {
      emit(ctx, {
        ruleId: "linkage/use-for-search-no-attributes",
        severity: "warning",
        category: "semantic",
        rule: "useForSearch: true требует хотя бы один searchable атрибут",
        message: `связь «${l.id}»: useForSearch = true, но все атрибуты связи имеют searchable: false`,
        hint: "Либо снимите useForSearch, либо отметьте хотя бы один атрибут searchable: true",
        domainId: l.domainId,
        propertyPath: `linkages[${l.id}].useForSearch`,
      });
    }
  }
}

function checkViewEntityExistence(ctx: LintContext): void {
  for (const [domainId, schema] of Object.entries(ctx.index.schemasByDomain)) {
    const views = schema?.sections?.views?.items || [];
    for (const v of views) {
      if (v.type !== "entity" || !v.entity) continue;
      const fqid = String(v.entity).includes("/")
        ? String(v.entity).toLowerCase()
        : `${domainId}/${String(v.entity)}`.toLowerCase();
      if (!ctx.index.entitiesByFqid[fqid]) {
        emit(ctx, {
          ruleId: "view/entity-unknown",
          severity: "error",
          category: "reference",
          rule: "entity во view существует",
          message: `View «${v.id}»: entity «${v.entity}» не найдена в домене`,
          hint: "Проверьте id сущности в entities[] (регистр не важен, но сущность должна существовать)",
          domainId,
          propertyPath: `views[${v.id}].entity`,
        });
      }
    }
  }
}
// ============ Structure: циклы наследования (U3.1) ============

function checkCircularInheritanceLint(ctx: LintContext): void {
  const entities = ctx.index.entities;
  if (entities.length === 0) return;

  const byFqid = new Map<string, EntityRecord>();
  for (const e of entities) byFqid.set(e.fqid, e);

  // 0 — не посещён, 1 — в стеке, 2 — обработан
  const state = new Map<string, 0 | 1 | 2>();
  const cycleNodes = new Set<string>();

  const visit = (fqid: string, stack: string[]): void => {
    const st = state.get(fqid);
    if (st === 2) return;

    if (st === 1) {
      // back-edge → найден цикл
      const idx = stack.indexOf(fqid);
      // stack.length - idx > 2 отсекает self-edge (a → a):
      // его уже ловит semantic/self-inheritance
      if (idx >= 0 && stack.length - idx > 2) {
        for (let i = idx; i < stack.length - 1; i++) {
          cycleNodes.add(stack[i]);
        }
      }
      return;
    }

    state.set(fqid, 1);
    stack.push(fqid);

    const e = byFqid.get(fqid);
    if (e?.inherits) {
      const parent = byFqid.get(e.inherits);
      if (parent) visit(parent.fqid, stack);
    }

    stack.pop();
    state.set(fqid, 2);
  };

  for (const e of entities) {
    if (state.get(e.fqid) !== 2) visit(e.fqid, []);
  }

  // Один issue на каждый узел цикла (чтобы findIssueLine дал маркер в YAML)
  const emitted = new Set<string>();
  for (const fqid of cycleNodes) {
    if (emitted.has(fqid)) continue;
    const e = byFqid.get(fqid);
    if (!e) continue;
    emitted.add(fqid);
    emit(ctx, {
      ruleId: "structure/circular-inheritance",
      severity: "error",
      category: "semantic",
      rule: "Цикл наследования",
      message: `Сущность «${e.entityId}» участвует в цикле наследования`,
      hint: "Разорвите цепочку inherits",
      domainId: e.domainId,
      entityFqid: e.fqid,
      propertyPath: `entities[${e.entityId}].inherits`,
    });
  }
}

// ============ Structure: кросс-доменные дубликаты entityId (U3.2) ============
//
// Внутридоменные дубликаты ловит duplicate-id/entities (checkUniqueIds).
// Здесь — только меж-доменные, один emit на домен.

function checkDuplicateEntityIdLint(ctx: LintContext): void {
  // entityId.toLowerCase() → domainId → первый EntityRecord в этом домене
  const byId = new Map<string, Map<string, EntityRecord>>();

  for (const e of ctx.index.entities) {
    const key = e.entityId.toLowerCase();
    let byDom = byId.get(key);
    if (!byDom) {
      byDom = new Map();
      byId.set(key, byDom);
    }
    if (!byDom.has(e.domainId)) byDom.set(e.domainId, e);
  }

  byId.forEach((byDom) => {
    if (byDom.size <= 1) return;
    const domains = Array.from(byDom.keys()).sort();
    for (const [domainId, e] of byDom.entries()) {
      const others = domains.filter((d) => d !== domainId);
      emit(ctx, {
        ruleId: "structure/duplicate-entity-id",
        severity: "warning",
        category: "reference",
        rule: "entityId уникален в индексе",
        message: `entityId «${e.entityId}» также используется в: ${others.join(", ")}`,
        hint: "Уникальность entityId нужна для однозначности FQID-ссылок",
        domainId,
        entityFqid: e.fqid,
        propertyPath: `entities[${e.entityId}]`,
      });
    }
  });
}