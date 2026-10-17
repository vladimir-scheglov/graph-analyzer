import type {
  ModelIndex,
  EntityRecord,
  AttributeRecord,
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

// ============ Внутренние структуры ============

interface LintContext {
  index: ModelIndex;
  issues: LintIssue[];
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

// ============ Main ============

export function lintModel(index: ModelIndex): LintReport {
  const ctx: LintContext = { index, issues: [] };

  for (const e of index.entities) {
    checkEntityNaming(ctx, e);
    checkEntityRequired(ctx, e);
    checkEntityRecommended(ctx, e);
    checkInheritance(ctx, e);
    checkEntityAttributes(ctx, e);
    checkDuplicateAttributes(ctx, e);

    for (const a of e.attributes) {
      checkAttributeNaming(ctx, e, a);
      checkAttributeRecommended(ctx, e, a);
      checkReference(ctx, e, a);
      checkValidationByHeuristic(ctx, e, a);
    }
  }

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
};

const CATEGORY_WEIGHTS: Record<LintRuleCategory, number> = {
  reference: 5, // битые ссылки критичнее всего
  semantic: 4,
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
