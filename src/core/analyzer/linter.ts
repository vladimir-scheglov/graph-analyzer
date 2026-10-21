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
} from "../../shared/model-types";
import type {
  LintIssue,
  LintReport,
  LintSeverity,
  LintRuleCategory,
  SonarScore,
  DomainSonarScores,
} from "../../shared/lint-types";

// ============ Правила именования ============

const RE_ENTITY_ID = /^[A-Z][a-zA-Z0-9]*$/; // CamelCase
const RE_ATTRIBUTE_ID = /^[a-z][a-zA-Z0-9]*$/; // camelCase
const RE_DATA_TYPE_ID = /^[A-Z][a-zA-Z0-9]*$/;
const RE_VIEW_ID = /^[a-z][a-zA-Z0-9_]*$/;
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

const IDENTIFIER_KNOWN_SEGMENTS = new Set([
  "@inc",
  "@prefix",
  "@YYYY",
  "@YY",
  "@MM",
  "@DD",
]);

/**
 * Ищет AttributeRecord в сущности с учётом наследования.
 * Используется там, где нужен сам record (dataType, constraints), а не факт наличия.
 */
function findAttributeWithInheritance(
  ctx: LintContext,
  entityFqid: string,
  attributeId: string,
): AttributeRecord | null {
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
    const order = ["@prefix", "@YYYY", "@YY", "@MM", "@DD"];
    const idxs: number[] = a.segment
      .map((s) => order.indexOf(s))
      .filter((i) => i >= 0);
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
}

function precomputeLintIndex(index: ModelIndex): {
  viewElementSets: LintContext["viewElementSets"];
  presetSets: LintContext["presetSets"];
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

  return { viewElementSets, presetSets };
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
  const effectMap = new Map<
    string,
    { hidden: UiRuleRecord[]; show: UiRuleRecord[] }
  >();

  for (const r of ctx.index.uiRules || []) {
    if (r.effect !== "hidden" && r.effect !== "show") continue;
    const add = (key: string) => {
      if (!effectMap.has(key)) effectMap.set(key, { hidden: [], show: [] });
      const entry = effectMap.get(key)!;
      if (r.effect === "hidden") entry.hidden.push(r);
      else entry.show.push(r);
    };
    r.widgets.forEach((w) => add(`${r.domainId}|${r.view}|w:${w.widget}`));
    r.groups.forEach((g) => add(`${r.domainId}|${r.view}|g:${g.group}`));
    r.columns.forEach((c) => add(`${r.domainId}|${r.view}|c:${c.column}`));
  }

  effectMap.forEach((entry, key) => {
    if (entry.hidden.length > 0 && entry.show.length > 0) {
      const parts = key.split("|");
      const domainId = parts[0];
      const view = parts[1];
      const element = parts[2];
      const hiddenIds = entry.hidden.map((r) => r.id).join(", ");
      const showIds = entry.show.map((r) => r.id).join(", ");
      emit(ctx, {
        ruleId: "uirules/conflicting-effects",
        severity: "warning",
        category: "uirules",
        rule: "Нет противоречащих правил для одного элемента",
        message: `Конфликт для ${element} во view «${view}»: hidden (${hiddenIds}) vs show (${showIds})`,
        hint: "Проверьте порядок применения — какое правило сработает",
        domainId,
        propertyPath: `uiRules`,
      });
    }
  });
}

// ============ DataRules ============

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

function checkDataRuleTarget(ctx: LintContext, dr: DataRuleRecord): void {
  // ============ target: linkage — не поддерживается ============
  if (dr.target === "linkage") {
    emit(ctx, {
      ruleId: "dataRule/linkage-target-unsupported",
      severity: "error",
      category: "semantic",
      rule: "target: linkage не поддерживается",
      message: `правило «${dr.id}»: target: linkage в текущей реализации не поддерживается`,
      hint: "Используйте target: entity или entityAttribute",
      domainId: dr.domainId,
      propertyPath: `dataRules[${dr.id}].target`,
    });
    return;
  }

  // ============ entity / entityAttribute: сущность обязательна ============
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

  // ============ target: entity ============
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
        hint: "Для target: entity укажите хотя бы один атрибут или связь",
        domainId: dr.domainId,
        propertyPath: `dataRules[${dr.id}].rule`,
      });
    }
  }

  // ============ target: entityAttribute ============
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
        // nested.type должен соответствовать dataType атрибута
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

    // allowed + entityAttribute — запрещено (Zod)
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

function checkDataRuleEffectAttributes(
  ctx: LintContext,
  dr: DataRuleRecord,
): void {
  if (dr.target === "linkage") return;
  const attrs = dr.attributes;
  if (!attrs || attrs.length === 0) return;
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
  if (dr.target === "linkage") return;

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
  if (dr.effect === "default" || dr.effect === "allowed") return;
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
    checkTreeDuplicates(ctx, tree);
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
        const connectsForward =
          linkage.side1Fqid === parentEntityFqid &&
          linkage.side2Fqid === child.entity;
        const connectsBackward =
          linkage.side2Fqid === parentEntityFqid &&
          linkage.side1Fqid === child.entity;

        if (!connectsForward && !connectsBackward) {
          emit(ctx, {
            ruleId: "tree/children-side-mismatch",
            severity: "error",
            category: "semantic",
            rule: "linkage соединяет parent и child",
            message: `дерево «${tree.id}», ${path}: linkage "${child.linkage}" (side1=${linkage.side1Fqid}, side2=${linkage.side2Fqid}) не связывает parent="${parentEntityFqid}" и child="${child.entity}"`,
            hint: "Проверьте linkage.side1/side2 и направление ребра в дереве",
            domainId: tree.domainId,
            propertyPath: path + ".linkage",
          });
        } else if (child.side !== undefined) {
          // Явный side: по Zod side=1 → parent на side2, child на side1;
          // side=2 → parent на side1, child на side2.
          const expectedSide: 1 | 2 = connectsForward ? 2 : 1;
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

function checkTreeDuplicates(ctx: LintContext, tree: TreeRecord): void {
  const counts = new Map<string, number>();
  const maxInstancesSeen = new Set<string>();

  const register = (fqid: string, maxInstances?: number): void => {
    counts.set(fqid, (counts.get(fqid) || 0) + 1);
    if (maxInstances !== undefined) {
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
    }
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

  counts.forEach((count, fqid) => {
    if (count > 1) {
      emit(ctx, {
        ruleId: "tree/duplicate-entity",
        severity: "warning",
        category: "semantic",
        rule: "entity используется в дереве один раз",
        message: `дерево «${tree.id}»: entity "${fqid}" встречается ${count} раз`,
        domainId: tree.domainId,
        propertyPath: `trees[${tree.id}].hierarchy`,
      });
    }
  });
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

  const idSeen = new Map<string, string>();      // "domain#id"  → domain
  const routeSeen = new Map<string, string>();   // "domain#route" → domain

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

    // ============ route формат ============
    if (menu.route && !/^\/(?!-)[a-z0-9-]+(?<!-)(\/(?!-)[a-z0-9-]+(?<!-))*$/.test(menu.route)) {
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
            const expected = `${rule.domainId}/${item.permission}`.toLowerCase();
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

// ============ Main ============

export function lintModel(index: ModelIndex): LintReport {
  const { viewElementSets, presetSets } = precomputeLintIndex(index);
  const ctx: LintContext = { index, issues: [], viewElementSets, presetSets };

  for (const e of index.entities) {
    checkEntityNaming(ctx, e);
    checkEntityRequired(ctx, e);
    checkEntityRecommended(ctx, e);
    checkInheritance(ctx, e);
    checkEntityAttributes(ctx, e);
    checkDuplicateAttributes(ctx, e);
    checkEntityReferences(ctx, e);

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

  // ============ Linkages ============
  checkEntityLinkageSemantics(ctx);

  // ============ DataRules ============
  checkDataRules(ctx);

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
  checkOrphanPresets(ctx);
  checkConflictingEffects(ctx);

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
