import type { ModelIndex } from "../../../shared/model-types";
import type {
  RFNode,
  RFEdge,
  LearningPathDomain,
  LearningPathStage,
} from "../types";

// ============ Типы ============

export interface LearningPathDomainMetrics {
  entityCount: number;
  attributeCount: number;
  linkageCount: number;
  lintIssueCount: number;
  lintErrorCount: number;
  piiHitCount: number;
  piiCriticalCount: number;
  viewCount: number;
  estimatedMinutes: number;
}

export type LearningPathDifficulty = "small" | "medium" | "large";

export interface EnrichedLearningPathDomain extends LearningPathDomain {
  metrics: LearningPathDomainMetrics;
  tags: string[];
  namespace: string;
  difficulty: LearningPathDifficulty;
}

export interface EnrichedLearningPathStage extends Omit<
  LearningPathStage,
  "domains"
> {
  domains: EnrichedLearningPathDomain[];
  totalEntities: number;
  totalAttributes: number;
  totalLintIssues: number;
  totalPiiCritical: number;
  totalMinutes: number;
  depth: number;
}

export interface LearningPathRecommendation {
  kind: "lint" | "pii" | "size" | "hotspot";
  message: string;
  domainId: string;
}

export interface EnrichedLearningPath {
  entryPoints: EnrichedLearningPathDomain[];
  stages: EnrichedLearningPathStage[];
  unresolved: EnrichedLearningPathDomain[];
  totalStages: number;
  totalDomains: number;
  criticalPath: number;
  totalMinutes: number;
  foundationsCount: number;
  meta: {
    generatedAt: string;
    scope: "all" | "visible" | "bookmarked";
  };
  recommendations: LearningPathRecommendation[];
}

export interface ComputeLearningPathOptions {
  index?: ModelIndex | null;
  scope?: "all" | "visible" | "bookmarked";
}

// ============ Утилиты ============

function getNamespace(domainId: string): string {
  return domainId.split(".").slice(0, 2).join(".");
}

function difficultyOf(minutes: number): LearningPathDifficulty {
  if (minutes < 15) return "small";
  if (minutes < 60) return "medium";
  return "large";
}

function emptyMetrics(): LearningPathDomainMetrics {
  return {
    entityCount: 0,
    attributeCount: 0,
    linkageCount: 0,
    lintIssueCount: 0,
    lintErrorCount: 0,
    piiHitCount: 0,
    piiCriticalCount: 0,
    viewCount: 0,
    estimatedMinutes: 1,
  };
}

function computeMetrics(
  domainId: string,
  index: ModelIndex | null,
): LearningPathDomainMetrics {
  if (!index) return emptyMetrics();

  const entities = index.entities.filter((e) => e.domainId === domainId);
  let attributeCount = 0;
  for (const e of entities) {
    attributeCount += e.attributes.length;
    for (const a of e.attributes) {
      if (a.nestedAttributes) attributeCount += a.nestedAttributes.length;
    }
  }

  const linkageCount = index.entityLinkages.filter(
    (l) => l.domainId === domainId,
  ).length;

  const domainIssues = index.lint.lintReport.issues.filter(
    (i) => i.domainId === domainId,
  );
  const lintErrorCount = domainIssues.filter(
    (i) => i.severity === "error",
  ).length;

  const domainLower = domainId.toLowerCase() + "/";
  const piiHits = index.pii.hits.filter((h) =>
    h.entityFqid.toLowerCase().startsWith(domainLower),
  );
  const piiCriticalCount = piiHits.filter(
    (h) => h.severity === "critical",
  ).length;

  const viewCount =
    index.schemasByDomain?.[domainId]?.sections?.views?.count ?? 0;

  // Эвристика: 2 мин на сущность + 0.2 мин на атрибут + 1 мин на linkage + 0.5 на view
  const estimatedMinutes = Math.max(
    1,
    Math.round(
      entities.length * 2 + attributeCount / 5 + linkageCount + viewCount / 2,
    ),
  );

  return {
    entityCount: entities.length,
    attributeCount,
    linkageCount,
    lintIssueCount: domainIssues.length,
    lintErrorCount,
    piiHitCount: piiHits.length,
    piiCriticalCount,
    viewCount,
    estimatedMinutes,
  };
}

// ============ Главная функция ============

export function computeLearningPath(
  nodes: RFNode[],
  edges: RFEdge[],
  options: ComputeLearningPathOptions = {},
): EnrichedLearningPath {
  const index = options.index || null;
  const scope = options.scope || "all";

  const nodeById = new Map<string, RFNode>();
  nodes.forEach((n) => nodeById.set(n.id, n));

  const domainNodes = nodes.filter((n) => n.data.nodeType === "domain");

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  domainNodes.forEach((n) => {
    fanIn.set(n.id, 0);
    fanOut.set(n.id, 0);
  });

  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source)! + 1);
    if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target)! + 1);
  });

  const entryPoints = domainNodes.filter((n) => {
    const fi = fanIn.get(n.id) || 0;
    const fo = fanOut.get(n.id) || 0;
    return fi === 0 && fo > 0;
  });

  const deps = new Map<string, Set<string>>();
  domainNodes.forEach((n) => deps.set(n.id, new Set()));
  edges.forEach((e) => {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return;
    const src = nodeById.get(e.source)!;
    const tgt = nodeById.get(e.target)!;
    if (src.data.nodeType !== "domain" || tgt.data.nodeType !== "domain")
      return;
    if (src.id === tgt.id) return;
    deps.get(src.id)!.add(tgt.id);
  });

  const remaining = new Set(domainNodes.map((n) => n.id));
  const stages: string[][] = [];

  while (remaining.size > 0) {
    const stage: string[] = [];
    remaining.forEach((id) => {
      let ready = true;
      deps.get(id)!.forEach((dep) => {
        if (remaining.has(dep)) ready = false;
      });
      if (ready) stage.push(id);
    });
    if (stage.length === 0) break;
    stage.forEach((id) => remaining.delete(id));
    stage.sort((a, b) => (fanIn.get(b) || 0) - (fanIn.get(a) || 0));
    stages.push(stage);
  }

  const unresolved = Array.from(remaining);

  const enrich = (id: string): EnrichedLearningPathDomain | null => {
    const n = nodeById.get(id);
    if (!n) return null;
    const domainId = n.data.domainId;
    const metrics = computeMetrics(domainId, index);
    const tags = n.data.tags || [];
    return {
      id,
      domainId,
      label: n.data.label,
      description: n.data.description,
      tags,
      fanIn: fanIn.get(id) || 0,
      fanOut: fanOut.get(id) || 0,
      entitiesCount: n.data.entitiesCount,
      fqidRefsCount: (n.data.fqidRefs || []).length,
      metrics,
      namespace: getNamespace(domainId),
      difficulty: difficultyOf(metrics.estimatedMinutes),
    };
  };

  const enrichedStages: EnrichedLearningPathStage[] = stages.map(
    (stage, idx) => {
      const enrichedDomains = stage
        .map(enrich)
        .filter((x): x is EnrichedLearningPathDomain => x !== null);
      return {
        index: idx,
        domains: enrichedDomains,
        totalEntities: enrichedDomains.reduce(
          (s, d) => s + d.metrics.entityCount,
          0,
        ),
        totalAttributes: enrichedDomains.reduce(
          (s, d) => s + d.metrics.attributeCount,
          0,
        ),
        totalLintIssues: enrichedDomains.reduce(
          (s, d) => s + d.metrics.lintIssueCount,
          0,
        ),
        totalPiiCritical: enrichedDomains.reduce(
          (s, d) => s + d.metrics.piiCriticalCount,
          0,
        ),
        totalMinutes: enrichedDomains.reduce(
          (s, d) => s + d.metrics.estimatedMinutes,
          0,
        ),
        depth: idx + 1,
      };
    },
  );

  const totalMinutes = enrichedStages.reduce((s, st) => s + st.totalMinutes, 0);

  const entryEnriched = entryPoints
    .map((n) => enrich(n.id))
    .filter((x): x is EnrichedLearningPathDomain => x !== null);

  const unresolvedEnriched = unresolved
    .map((id) => enrich(id))
    .filter((x): x is EnrichedLearningPathDomain => x !== null);

  // Recommendations
  const recommendations: LearningPathRecommendation[] = [];
  enrichedStages.forEach((st) => {
    st.domains.forEach((d) => {
      if (d.metrics.lintErrorCount > 0) {
        recommendations.push({
          kind: "lint",
          domainId: d.domainId,
          message: `${d.domainId}: ${d.metrics.lintErrorCount} lint errors — исправить до изучения`,
        });
      }
      if (d.metrics.piiCriticalCount > 0) {
        recommendations.push({
          kind: "pii",
          domainId: d.domainId,
          message: `${d.domainId}: ${d.metrics.piiCriticalCount} PII critical — обратить внимание на защиту`,
        });
      }
      if (d.difficulty === "large") {
        recommendations.push({
          kind: "size",
          domainId: d.domainId,
          message: `${d.domainId}: ~${d.metrics.estimatedMinutes} мин чтения — разбить на 2–3 сессии`,
        });
      }
      if (d.fanIn >= 5 && d.fanOut >= 3) {
        recommendations.push({
          kind: "hotspot",
          domainId: d.domainId,
          message: `${d.domainId}: ${d.fanIn} зависят + ${d.fanOut} зависит — критичный узел`,
        });
      }
    });
  });

  return {
    entryPoints: entryEnriched,
    stages: enrichedStages,
    unresolved: unresolvedEnriched,
    totalStages: stages.length,
    totalDomains: domainNodes.length,
    criticalPath: enrichedStages.length,
    totalMinutes,
    foundationsCount: entryEnriched.length,
    meta: {
      generatedAt: new Date().toISOString(),
      scope,
    },
    recommendations: recommendations.slice(0, 20),
  };
}
