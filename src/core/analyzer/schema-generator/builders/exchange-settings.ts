// src/core/analyzer/schema-generator/builders/exchange-settings.ts
import type { ModelIndex } from "../../../../shared/model-types";
import type { GeneratedBlock } from "../types";

type ForExportStrategy = "label" | "firstString" | "id";

function pickForExport(
  entityFqid: string,
  index: ModelIndex,
  strategy: ForExportStrategy,
): string | null {
  const entity = index.entitiesByFqid[entityFqid];
  if (!entity) return null;

  if (strategy === "label") return "label";
  if (strategy === "id") return null;

  const requiredString = entity.attributes.find(
    (a) => a.dataType === "String" && a.constraints.includes("required"),
  );
  if (requiredString) return requiredString.id;

  const firstString = entity.attributes.find((a) => a.dataType === "String");
  return firstString?.id ?? null;
}

export interface ExchangeSettingsResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "exchangeSettings";
    id: string;
    reason: string;
    hint?: string;
  }>;
}

/**
 * Скелет секции exchangeSettings. Секция — объект, не массив.
 * Merge в preflight.appendBlockToRaw для exchangeSettings делается отдельно
 * (см. Часть 2.7 — патч preflight).
 */
export function buildExchangeSettings(
  domainId: string,
  index: ModelIndex,
  options: {
    enable?: boolean;
    forExportStrategy?: ForExportStrategy;
    noCmsSync?: boolean;
    skipExisting: boolean;
  },
): ExchangeSettingsResult {
  const blocks: GeneratedBlock[] = [];
  const skipped: ExchangeSettingsResult["skipped"] = [];
  const blockId = `exchangeSettings:(root)`;

  const existing = index.exchangeSettingsByDomain[domainId];
  if (existing && options.skipExisting) {
    skipped.push({
      blockId,
      section: "exchangeSettings",
      id: "(root)",
      reason: "already-exists",
      hint: "Удалите секцию exchangeSettings из YAML вручную, если нужно перегенерировать",
    });
    return { blocks, skipped };
  }

  const strategy = options.forExportStrategy ?? "label";
  const entitiesConfig: Record<string, any> = {};

  for (const e of index.entities) {
    if (e.domainId !== domainId) continue;

    const forExport = pickForExport(e.fqid, index, strategy);
    if (!forExport) {
      skipped.push({
        blockId: `exchangeSettings:${e.entityId}`,
        section: "exchangeSettings",
        id: e.entityId,
        reason: "no-export-attribute",
        hint: "У сущности нет String-атрибута и стратегия forExport = firstString",
      });
      continue;
    }
    entitiesConfig[e.entityId] = {
      forExport,
      ...(options.noCmsSync ? { noCmsSync: true } : {}),
    };
  }

  if (Object.keys(entitiesConfig).length === 0) {
    skipped.push({
      blockId,
      section: "exchangeSettings",
      id: "(root)",
      reason: "no-entities",
      hint: "Ни у одной сущности не нашлось подходящего forExport",
    });
    return { blocks, skipped };
  }

  blocks.push({
    blockId,
    section: "exchangeSettings",
    groupPath: ["exchangeSettings"],
    payload: {
      enable: options.enable !== false,
      label: `Обмен данными: ${domainId}`,
      ...(options.noCmsSync ? { noCmsSync: true } : {}),
      entities: entitiesConfig,
    },
    dependsOn: [],
    dependents: [],
    title: `exchangeSettings (${Object.keys(entitiesConfig).length} сущностей)`,
  });

  return { blocks, skipped };
}
