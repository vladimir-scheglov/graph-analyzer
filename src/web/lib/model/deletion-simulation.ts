import type {
  EntityRecord,
  ModelIndex,
  EntityLinkage,
  TreeRecord,
  TransitiveLinkageRecord,
} from "../../../shared/model-types";

export type DeletionSeverity = "safe" | "risky" | "breaking";

export interface DeletionReference {
  /** Кто ссылается (сущность-источник). */
  fromEntity: EntityRecord;
  attributeId: string;
  attributeName: string;
  dataType: string;
  /** true = деструктивно. Сейчас всегда true: Reference и Array<Reference>. */
  breaking: true;
}

export interface DeletionInheritance {
  child: EntityRecord;
  breaking: true;
}

export interface DeletionLinkage {
  linkage: EntityLinkage;
  breaking: true;
}

export interface DeletionView {
  domainId: string;
  viewId: string;
  viewType: string;
  reason: string;
  viewLabel?: string;
}

export interface DeletionDataRule {
  domainId: string;
  ruleId: string;
  ruleName: string;
  effect: string;
}

export interface DeletionAction {
  domainId: string;
  actionId: string;
  actionName: string;
  actionType: string;
}

export interface DeletionMixin {
  domainId: string;
  mixinId: string;
  mixinType: string;
  reason: "target" | "from";
}

export interface DeletionTree {
  domainId: string;
  treeId: string;
  treeName?: string;
}

export interface DeletionTransitive {
  domainId: string;
  tlId: string;
}

export interface DeletionSimulation {
  entity: EntityRecord;
  domainId: string;

  /** Breaking — удаление сломает схему или данные. */
  references: DeletionReference[];
  inheritance: DeletionInheritance[];
  linkages: DeletionLinkage[];

  /** Warning — блоки, которые станут «висячими» и должны быть почищены. */
  views: DeletionView[];
  dataRules: DeletionDataRule[];
  actions: DeletionAction[];
  mixins: DeletionMixin[];
  trees: DeletionTree[];
  transitiveLinkages: DeletionTransitive[];

  summary: {
    severity: DeletionSeverity;
    breakingCount: number;
    warningCount: number;
    /** Отсортированные FQDN доменов, затронутых удалением (включая целевой). */
    affectedDomains: string[];
    /** Доменов, кроме домена-владельца сущности. */
    externalDomainCount: number;
    /** true, если breakingCount === 0 — удаление не сломает схему. */
    canSafelyDelete: boolean;
  };

  /** Пошаговый план миграции. */
  steps: string[];
}

// ============ helpers ============

function lowerFqid(fqid: string | null | undefined): string {
  return (fqid || "").toLowerCase();
}

function normalizeToDomain(
  raw: string | null | undefined,
  currentDomain: string,
): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.includes("/")
    ? s.toLowerCase()
    : `${currentDomain.toLowerCase()}/${s.toLowerCase()}`;
}

function treeHierarchyTouches(tree: TreeRecord, targetFqid: string): boolean {
  const walk = (
    node: { entity?: string; children?: any[] } | undefined,
  ): boolean => {
    if (!node) return false;
    if (lowerFqid(node.entity) === targetFqid) return true;
    for (const c of node.children || []) {
      if (walk(c)) return true;
    }
    return false;
  };
  return walk(tree.hierarchy as any);
}

function transitiveTouches(
  tl: TransitiveLinkageRecord,
  targetFqid: string,
): boolean {
  if (lowerFqid(tl.entity) === targetFqid) return true;
  const walk = (joins: any[] | undefined): boolean => {
    for (const j of joins || []) {
      if (j?.joins && walk(j.joins)) return true;
    }
    return false;
  };
  // joins сами по себе ссылаются на linkage, а не на сущность.
  // Дополнительно проверяем, что linkage касается targetFqid — но это
  // уже покрывается проверкой linkages. Здесь — только через entity.
  return walk(tl.joins as any);
}

// ============ main ============

export function simulateEntityDeletion(
  fqid: string,
  index: ModelIndex,
): DeletionSimulation | null {
  const entity = index.entitiesByFqid[lowerFqid(fqid)];
  if (!entity) return null;

  const targetFqid = lowerFqid(entity.fqid);
  const targetDomain = lowerFqid(entity.domainId);

  // ============ Breaking: Reference из других сущностей ============
  const references: DeletionReference[] = [];
  for (const e of index.entities) {
    if (lowerFqid(e.fqid) === targetFqid) continue;
    for (const a of e.attributes) {
      if (lowerFqid(a.referenceEntity) === targetFqid) {
        references.push({
          fromEntity: e,
          attributeId: a.id,
          attributeName: a.name || a.id,
          dataType: a.dataType,
          breaking: true,
        });
      }
      if (lowerFqid(a.itemReferenceEntity) === targetFqid) {
        references.push({
          fromEntity: e,
          attributeId: a.id,
          attributeName: a.name || a.id,
          dataType: `Array<${a.itemDataType || "Reference"}>`,
          breaking: true,
        });
      }
      // Вложенные колонки Table-атрибута
      for (const na of a.nestedAttributes || []) {
        if (lowerFqid(na.referenceEntity) === targetFqid) {
          references.push({
            fromEntity: e,
            attributeId: `${a.id}.${na.id}`,
            attributeName: na.name || na.id,
            dataType: na.dataType,
            breaking: true,
          });
        }
      }
    }
  }

  // ============ Breaking: наследники ============
  const inheritance: DeletionInheritance[] = [];
  for (const e of index.entities) {
    if (lowerFqid(e.inherits) === targetFqid) {
      inheritance.push({ child: e, breaking: true });
    }
  }

  // ============ Breaking: linkages ============
  const linkages: DeletionLinkage[] = [];
  for (const l of index.entityLinkages) {
    if (
      lowerFqid(l.side1Fqid) === targetFqid ||
      lowerFqid(l.side2Fqid) === targetFqid
    ) {
      linkages.push({ linkage: l, breaking: true });
    }
  }

  // ============ Warnings: views ============
  const views: DeletionView[] = [];
  const seenViews = new Set<string>();
  for (const [domainId, schema] of Object.entries(
    index.schemasByDomain || {},
  )) {
    for (const v of schema.allViews || []) {
      const key = `${domainId}#${v.id}`;
      if (seenViews.has(key)) continue;

      if (v.type === "entity") {
        const ref = normalizeToDomain(v.entity, domainId);
        if (ref === targetFqid) {
          seenViews.add(key);
          views.push({
            domainId,
            viewId: v.id,
            viewType: v.type,
            reason: "entity-view",
            viewLabel: v.label,
          });
        }
      } else if (v.type === "list") {
        const ref = normalizeToDomain(v.sourceEntity, domainId);
        if (ref === targetFqid) {
          seenViews.add(key);
          views.push({
            domainId,
            viewId: v.id,
            viewType: v.type,
            reason: "list-view",
            viewLabel: v.label,
          });
        }
      } else if (v.type === "tree" && v.tree) {
        const treeId = String(v.tree);
        const domainForTree = treeId.includes("/")
          ? treeId.split("/")[0].toLowerCase()
          : domainId.toLowerCase();
        const idForTree = treeId.includes("/") ? treeId.split("/")[1] : treeId;
        const tree = index.trees.find(
          (t) =>
            t.domainId.toLowerCase() === domainForTree && t.id === idForTree,
        );
        if (tree && treeHierarchyTouches(tree, targetFqid)) {
          seenViews.add(key);
          views.push({
            domainId,
            viewId: v.id,
            viewType: v.type,
            reason: `tree (${tree.id})`,
            viewLabel: v.label,
          });
        }
      }
    }
  }

  // ============ Warnings: dataRules ============
  const dataRules: DeletionDataRule[] = [];
  for (const r of index.dataRules) {
    if (lowerFqid(r.entity) === targetFqid) {
      dataRules.push({
        domainId: r.domainId,
        ruleId: r.id,
        ruleName: r.name,
        effect: r.effect,
      });
      continue;
    }
    if (r.target === "linkage" && r.linkage) {
      const lk = index.entityLinkages.find(
        (l) => lowerFqid(`${l.domainId}/${l.id}`) === lowerFqid(r.linkage),
      );
      if (
        lk &&
        (lowerFqid(lk.side1Fqid) === targetFqid ||
          lowerFqid(lk.side2Fqid) === targetFqid)
      ) {
        dataRules.push({
          domainId: r.domainId,
          ruleId: r.id,
          ruleName: r.name,
          effect: r.effect,
        });
      }
    }
  }

  // ============ Warnings: actions ============
  const actions: DeletionAction[] = [];
  for (const a of index.actions || []) {
    if (lowerFqid(a.entity) === targetFqid) {
      actions.push({
        domainId: a.domainId,
        actionId: a.id,
        actionName: a.name,
        actionType: a.type,
      });
    }
  }

  // ============ Warnings: mixins ============
  const mixins: DeletionMixin[] = [];
  for (const m of index.mixins || []) {
    if (lowerFqid(m.targetEntityFqid) === targetFqid) {
      mixins.push({
        domainId: m.domainId,
        mixinId: m.id,
        mixinType: m.type,
        reason: "target",
      });
    } else if (lowerFqid(m.sourceEntityFqid) === targetFqid) {
      mixins.push({
        domainId: m.domainId,
        mixinId: m.id,
        mixinType: m.type,
        reason: "from",
      });
    }
  }

  // ============ Warnings: trees ============
  const trees: DeletionTree[] = [];
  for (const t of index.trees) {
    if (treeHierarchyTouches(t, targetFqid)) {
      trees.push({
        domainId: t.domainId,
        treeId: t.id,
        treeName: t.name,
      });
    }
  }

  // ============ Warnings: transitiveLinkages ============
  const transitiveLinkages: DeletionTransitive[] = [];
  for (const tl of index.transitiveLinkages) {
    if (transitiveTouches(tl, targetFqid)) {
      transitiveLinkages.push({
        domainId: tl.domainId,
        tlId: tl.id,
      });
    }
  }

  // ============ Сводка ============
  const affectedDomainsSet = new Set<string>();
  affectedDomainsSet.add(entity.domainId);
  references.forEach((r) => affectedDomainsSet.add(r.fromEntity.domainId));
  inheritance.forEach((i) => affectedDomainsSet.add(i.child.domainId));
  linkages.forEach((l) => affectedDomainsSet.add(l.linkage.domainId));
  views.forEach((v) => affectedDomainsSet.add(v.domainId));
  dataRules.forEach((r) => affectedDomainsSet.add(r.domainId));
  actions.forEach((a) => affectedDomainsSet.add(a.domainId));
  mixins.forEach((m) => affectedDomainsSet.add(m.domainId));
  trees.forEach((t) => affectedDomainsSet.add(t.domainId));
  transitiveLinkages.forEach((t) => affectedDomainsSet.add(t.domainId));

  const affectedDomains = Array.from(affectedDomainsSet).sort();
  const externalDomainCount = affectedDomains.filter(
    (d) => lowerFqid(d) !== targetDomain,
  ).length;

  const breakingCount =
    references.length + inheritance.length + linkages.length;
  const warningCount =
    views.length +
    dataRules.length +
    actions.length +
    mixins.length +
    trees.length +
    transitiveLinkages.length;

  const severity: DeletionSeverity =
    breakingCount > 0 ? "breaking" : warningCount > 0 ? "risky" : "safe";

  // ============ План миграции ============
  const steps: string[] = [];

  if (references.length > 0) {
    steps.push(
      `Убрать ${references.length} Reference-ссылк${references.length === 1 ? "у" : "и"} на сущность — удалить атрибуты или перенаправить на другую сущность.`,
    );
  }
  if (inheritance.length > 0) {
    steps.push(
      `Назначить новую родительскую сущность для ${inheritance.length} наследник${inheritance.length === 1 ? "а" : "ов"}: ${inheritance
        .map((i) => i.child.entityId)
        .join(", ")}.`,
    );
  }
  if (linkages.length > 0) {
    steps.push(
      `Удалить ${linkages.length} связ${linkages.length === 1 ? "ь" : "ей"}, в которых участвует сущность.`,
    );
  }
  if (views.length > 0) {
    steps.push(
      `Удалить ${views.length} view (entity / list / tree), привязанных к сущности.`,
    );
  }
  if (dataRules.length > 0) {
    steps.push(
      `Удалить или переписать ${dataRules.length} правил${dataRules.length === 1 ? "о" : "а"} данных.`,
    );
  }
  if (actions.length > 0) {
    steps.push(
      `Удалить ${actions.length} действи${actions.length === 1 ? "е" : "й"}, у которых entity = ${entity.entityId}.`,
    );
  }
  if (mixins.length > 0) {
    steps.push(
      `Проверить ${mixins.length} примес${mixins.length === 1 ? "ь" : "и"} — они ссылаются на сущность.`,
    );
  }
  if (trees.length > 0) {
    steps.push(
      `Удалить или переделать ${trees.length} дерев${trees.length === 1 ? "о" : "а"}: ${trees.map((t) => t.treeId).join(", ")}.`,
    );
  }
  if (transitiveLinkages.length > 0) {
    steps.push(
      `Удалить ${transitiveLinkages.length} транзитивн${transitiveLinkages.length === 1 ? "ую связь" : "ых связи"}: ${transitiveLinkages.map((t) => t.tlId).join(", ")}.`,
    );
  }
  if (steps.length === 0) {
    steps.push("Ничего не сломается — сущность не используется.");
  } else {
    steps.push("После всех шагов — прогнать линтер схем (Ctrl+Shift+L).");
  }

  return {
    entity,
    domainId: entity.domainId,
    references,
    inheritance,
    linkages,
    views,
    dataRules,
    actions,
    mixins,
    trees,
    transitiveLinkages,
    summary: {
      severity,
      breakingCount,
      warningCount,
      affectedDomains,
      externalDomainCount,
      canSafelyDelete: breakingCount === 0,
    },
    steps,
  };
}

// ============ Markdown export ============

export function generateDeletionSimulationMarkdown(
  sim: DeletionSimulation,
): string {
  const lines: string[] = [];
  const entity = sim.entity;
  const s = sim.summary;

  lines.push(`# Что если удалить: ${entity.entityId}`);
  lines.push("");
  lines.push(`**FQID:** \`${entity.fqid}\`  `);
  lines.push(`**Домен:** \`${sim.domainId}\`  `);
  lines.push(
    `**Severity:** ${s.severity === "safe" ? "✅ безопасно" : s.severity === "risky" ? "⚠️ требует чистки" : "🛑 сломает схему"}`,
  );
  lines.push("");
  lines.push("## Сводка");
  lines.push("");
  lines.push("| Метрика | Значение |");
  lines.push("| --- | ---: |");
  lines.push(`| Breaking-изменений | ${s.breakingCount} |`);
  lines.push(`| Warning-изменений | ${s.warningCount} |`);
  lines.push(`| Затронуто доменов | ${s.affectedDomains.length} |`);
  lines.push(`| Внешних доменов | ${s.externalDomainCount} |`);
  lines.push("");

  if (sim.references.length > 0) {
    lines.push(`## 🛑 Reference на эту сущность (${sim.references.length})`);
    lines.push("");
    lines.push("| Домен | Сущность | Атрибут | Тип |");
    lines.push("| --- | --- | --- | --- |");
    for (const r of sim.references) {
      lines.push(
        `| \`${r.fromEntity.domainId}\` | \`${r.fromEntity.entityId}\` | \`${r.attributeId}\` | ${r.dataType} |`,
      );
    }
    lines.push("");
  }

  if (sim.inheritance.length > 0) {
    lines.push(`## 🛑 Наследники (${sim.inheritance.length})`);
    lines.push("");
    for (const i of sim.inheritance) {
      lines.push(`- \`${i.child.fqid}\``);
    }
    lines.push("");
  }

  if (sim.linkages.length > 0) {
    lines.push(`## 🛑 Связи (${sim.linkages.length})`);
    lines.push("");
    lines.push("| Домен | Связь | Сторона 1 | Сторона 2 |");
    lines.push("| --- | --- | --- | --- |");
    for (const l of sim.linkages) {
      lines.push(
        `| \`${l.linkage.domainId}\` | \`${l.linkage.id}\` | \`${l.linkage.side1Fqid}\` | \`${l.linkage.side2Fqid}\` |`,
      );
    }
    lines.push("");
  }

  if (sim.views.length > 0) {
    lines.push(`## ⚠️ Views (${sim.views.length})`);
    lines.push("");
    for (const v of sim.views) {
      lines.push(
        `- \`${v.domainId}/${v.viewId}\` (${v.viewType}${v.reason ? `, ${v.reason}` : ""})`,
      );
    }
    lines.push("");
  }

  if (sim.dataRules.length > 0) {
    lines.push(`## ⚠️ Правила данных (${sim.dataRules.length})`);
    lines.push("");
    for (const r of sim.dataRules) {
      lines.push(
        `- \`${r.domainId}/${r.ruleId}\` — ${r.ruleName} (effect: ${r.effect})`,
      );
    }
    lines.push("");
  }

  if (sim.actions.length > 0) {
    lines.push(`## ⚠️ Действия (${sim.actions.length})`);
    lines.push("");
    for (const a of sim.actions) {
      lines.push(
        `- \`${a.domainId}/${a.actionId}\` — ${a.actionName} (${a.actionType})`,
      );
    }
    lines.push("");
  }

  if (sim.mixins.length > 0) {
    lines.push(`## ⚠️ Примеси (${sim.mixins.length})`);
    lines.push("");
    for (const m of sim.mixins) {
      lines.push(
        `- \`${m.domainId}/${m.mixinId}\` (${m.mixinType}, role: ${m.reason})`,
      );
    }
    lines.push("");
  }

  if (sim.trees.length > 0) {
    lines.push(`## ⚠️ Деревья (${sim.trees.length})`);
    lines.push("");
    for (const t of sim.trees) {
      lines.push(`- \`${t.domainId}/${t.treeId}\``);
    }
    lines.push("");
  }

  if (sim.transitiveLinkages.length > 0) {
    lines.push(`## ⚠️ Транзитивные связи (${sim.transitiveLinkages.length})`);
    lines.push("");
    for (const t of sim.transitiveLinkages) {
      lines.push(`- \`${t.domainId}/${t.tlId}\``);
    }
    lines.push("");
  }

  lines.push("## План миграции");
  lines.push("");
  sim.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push("");

  return lines.join("\n");
}
