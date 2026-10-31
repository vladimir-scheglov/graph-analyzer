import type { ModelIndex } from "../../../../shared/model-types";
import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock } from "../types";

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

interface DefaultCandidate {
  attributeId: string;
  dataType: string;
  kind: "Bool" | "Enum" | "Workflow";
  value: any;
}

/**
 * Собирает список атрибутов сущности, для которых имеет смысл
 * сгенерировать dataRules.default:
 *   - Bool   → defaultsBoolValue (по умолчанию false)
 *   - Enum   → первое НЕ hidden значение из dataTypes[]
 *   - Workflow → initial-статус (если не hidden)
 *
 * Пропускает атрибуты, у которых уже есть dataRules.default
 * (по target: entity + attributes[].attribute === attrId).
 */
function collectCandidates(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    includeBool: boolean;
    includeEnum: boolean;
    includeWorkflow: boolean;
    boolValue: boolean;
  },
): DefaultCandidate[] {
  const existingDefaultAttrs = new Set<string>();
  for (const r of index.dataRules) {
    if (r.domainId !== ctx.domainId) continue;
    if (r.effect !== "default") continue;
    if (r.target !== "entity" && r.target !== "entityAttribute") continue;
    if (r.entity !== ctx.entity.fqid) continue;
    if (r.target === "entityAttribute" && r.attribute) {
      existingDefaultAttrs.add(r.attribute);
    }
    for (const a of r.attributes || []) {
      existingDefaultAttrs.add(a.attribute);
    }
  }

  const out: DefaultCandidate[] = [];
  for (const a of ctx.entity.attributes) {
    if (existingDefaultAttrs.has(a.id)) continue;

    if (a.dataType === "Bool" && options.includeBool) {
      out.push({
        attributeId: a.id,
        dataType: "Bool",
        kind: "Bool",
        value: options.boolValue,
      });
      continue;
    }

    if (a.dataTypeKind === "custom") {
      const dt = index.dataTypes.find(
        (d) => d.domainId === ctx.domainId && d.id === a.dataType,
      );
      if (!dt) continue;

      if (dt.kind === "Enum" && options.includeEnum) {
        const enumView = dt.enumView || [];
        const hiddenValues = new Set(
          enumView
            .filter((v: any) => v.hidden === true)
            .map((v: any) => String(v.value)),
        );
        const first = (dt.values || []).find((v) => !hiddenValues.has(v));
        if (first) {
          out.push({
            attributeId: a.id,
            dataType: a.dataType,
            kind: "Enum",
            value: first,
          });
        }
        continue;
      }

      if (dt.kind === "Workflow" && options.includeWorkflow) {
        const statuses = dt.statuses || [];
        const initial = dt.initial || statuses[0];
        if (!initial) continue;
        const workflowView = dt.workflowView || [];
        const isHidden = workflowView.some(
          (v: any) => v.status === initial && v.hidden === true,
        );
        if (isHidden) continue;
        out.push({
          attributeId: a.id,
          dataType: a.dataType,
          kind: "Workflow",
          value: initial,
        });
      }
    }
  }
  return out;
}

export interface DataRulesDefaultsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "dataRules";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

/**
 * Генерирует одно dataRules-правило на сущность:
 *   id: defaults_<entityLower>
 *   target: entity
 *   effect: default
 *   attributes[]: [{ attribute, value }]
 *
 * Одно правило, а не N — так проще редактировать в YAML и меньше
 * дублирования в UI линтера.
 */
export function buildDataRulesDefaults(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    includeBool: boolean;
    includeEnum: boolean;
    includeWorkflow: boolean;
    boolValue: boolean;
    skipExisting: boolean;
  },
): DataRulesDefaultsResult {
  const E = ctx.entity.entityId;
  const ruleId = `defaults_${E.toLowerCase()}`;
  const blockId = `dataRule:${ruleId}`;

  if (
    !options.includeBool &&
    !options.includeEnum &&
    !options.includeWorkflow
  ) {
    return {
      blocks: [],
      skipped: [
        {
          blockId,
          section: "dataRules",
          id: ruleId,
          reason: "nothing-to-generate",
          hint: "Включите хотя бы один тип атрибутов в параметрах профиля",
        },
      ],
    };
  }

  if (
    options.skipExisting &&
    index.dataRules.some((r) => r.domainId === ctx.domainId && r.id === ruleId)
  ) {
    return {
      blocks: [],
      skipped: [
        {
          blockId,
          section: "dataRules",
          id: ruleId,
          reason: "already-exists",
        },
      ],
    };
  }

  const candidates = collectCandidates(ctx, index, {
    includeBool: options.includeBool,
    includeEnum: options.includeEnum,
    includeWorkflow: options.includeWorkflow,
    boolValue: options.boolValue,
  });

  if (candidates.length === 0) {
    return {
      blocks: [],
      skipped: [
        {
          blockId,
          section: "dataRules",
          id: ruleId,
          reason: "no-suitable-attributes",
          hint:
            "Все подходящие атрибуты уже имеют dataRules.default — " +
            "удалите правила вручную, если нужно перегенерировать",
        },
      ],
    };
  }

  const parts = candidates
    .map((c) => `${c.attributeId}=${JSON.stringify(c.value)}`)
    .join(", ");

  return {
    blocks: [
      {
        blockId,
        section: "dataRules",
        groupPath: ["dataRules"],
        payload: {
          id: ruleId,
          name: `Значения по умолчанию (${E})`,
          target: "entity",
          entity: `${ctx.domainId}/${E}`,
          condition: true,
          rule: {
            effect: "default",
            attributes: candidates.map((c) => ({
              attribute: c.attributeId,
              value: c.value,
            })),
          },
        },
        dependsOn: [],
        dependents: [],
        title: `Defaults для ${E} (${parts})`,
      },
    ],
    skipped: [],
  };
}
