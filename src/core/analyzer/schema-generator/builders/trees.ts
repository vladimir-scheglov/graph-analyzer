import type { EntityGenerationContext } from "../detect";
import type { GeneratedBlock, TreeChain } from "../types";
import type { ModelIndex } from "../../../../shared/model-types";

export interface TreeResult {
  blocks: GeneratedBlock[];
  skipped: Array<{
    blockId: string;
    section: "trees";
    id: string;
    reason: string;
  }>;
  treeId: string | null;
  hierarchy: { entity: string; children?: any[] } | null;
  /** Полные case-correct FQID всех сущностей в дереве (root + children). */
  usedEntities: Set<string>;
}

/** case-correct FQID из индекса; fallback — как есть. */
function caseFqid(
  raw: string,
  index: ModelIndex,
  currentDomainId: string,
): string {
  if (!raw) return raw;
  const normalized = raw.includes("/")
    ? raw.toLowerCase()
    : `${currentDomainId}/${raw}`.toLowerCase();
  const entity = index.entitiesByFqid[normalized];
  if (entity) return `${entity.domainId}/${entity.entityId}`;
  // entity нет в индексе — вернём как пришло (линтер сам поругается)
  return raw.includes("/") ? raw : `${currentDomainId}/${raw}`;
}

function buildHierarchyFromChain(chain: TreeChain): any[] {
  if (chain.length === 0) return [];
  const [head, ...tail] = chain;
  const node: any = { linkage: head.linkageId, entity: head.childEntityId };
  if (head.side === 2) node.side = 2;
  const nested = buildHierarchyFromChain(tail);
  if (nested.length > 0) node.children = nested;
  return [node];
}

/**
 * Авто-режим (без цепочки): все side-1 1_n связи как siblings.
 * Используется только в batch, где пользователь не строил цепочку.
 */
function buildAutoChildren(
  ctx: EntityGenerationContext,
  index: ModelIndex,
): any[] {
  return ctx.linkages
    .filter((lk) => {
      if (lk.side !== 1) return false;
      // ctx.linkages не содержит domainId/type — берём из индекса
      const linkage = index.entityLinkages.find(
        (l) => l.domainId === lk.domainId && l.id === lk.linkageId,
      );
      return linkage?.type === "1_n";
    })
    .map((lk) => ({
      linkage: lk.linkageId,
      entity: caseFqid(lk.peerFqid, index, ctx.domainId),
    }));
}

export function collectTreeEntities(
  hierarchy: { entity: string; children?: any[] },
  index: ModelIndex,
  currentDomainId: string,
): Set<string> {
  const acc = new Set<string>();
  const walk = (node: any): void => {
    const raw = String(node?.entity || "");
    if (!raw) return;
    acc.add(caseFqid(raw, index, currentDomainId));
    for (const c of node?.children || []) walk(c);
  };
  walk(hierarchy);
  return acc;
}

export function buildTree(
  ctx: EntityGenerationContext,
  index: ModelIndex,
  options: {
    treeType: "ordinary" | "orderable" | "multiparent";
    treeChain?: TreeChain;
    treeUseExistingId?: string;
    skipExisting: boolean;
  },
): TreeResult {
  const E = ctx.entity.entityId;
  const rootFqid = `${ctx.domainId}/${E}`; // case-correct, из схемы
  const defaultTreeId = `${E}Tree`;

  // ── Режим "использовать существующее" ──
  if (options.treeUseExistingId) {
    const record = ctx.existing.treeRecords.get(options.treeUseExistingId);
    const hierarchy = (record?.hierarchy as any) ?? null;
    const usedEntities = hierarchy
      ? collectTreeEntities(hierarchy, index, ctx.domainId)
      : new Set<string>([rootFqid]);
    return {
      blocks: [],
      skipped: [
        {
          blockId: `tree:${options.treeUseExistingId}`,
          section: "trees",
          id: options.treeUseExistingId,
          reason: "use-existing",
        },
      ],
      treeId: options.treeUseExistingId,
      hierarchy,
      usedEntities,
    };
  }

  // ── Режим "цепочка" / "авто" ──
  const children =
    options.treeChain && options.treeChain.length > 0
      ? buildHierarchyFromChain(options.treeChain)
      : buildAutoChildren(ctx, index);

  if (children.length === 0) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `tree:${defaultTreeId}`,
          section: "trees",
          id: defaultTreeId,
          reason: "no-tree-chain",
        },
      ],
      treeId: null,
      hierarchy: null,
      usedEntities: new Set(),
    };
  }

  const hierarchy = { entity: E, children };

  if (options.skipExisting && ctx.existing.trees.has(defaultTreeId)) {
    return {
      blocks: [],
      skipped: [
        {
          blockId: `tree:${defaultTreeId}`,
          section: "trees",
          id: defaultTreeId,
          reason: "already-exists",
        },
      ],
      treeId: defaultTreeId,
      hierarchy,
      usedEntities: collectTreeEntities(hierarchy, index, ctx.domainId),
    };
  }

  return {
    blocks: [
      {
        blockId: `tree:${defaultTreeId}`,
        section: "trees",
        groupPath: ["trees"],
        payload: {
          id: defaultTreeId,
          type: options.treeType,
          hierarchy,
        },
        dependsOn: [],
        dependents: [],
        title: `Дерево ${defaultTreeId} (${countChainDepth(options.treeChain)} ур.)`,
      },
    ],
    skipped: [],
    treeId: defaultTreeId,
    hierarchy,
    usedEntities: collectTreeEntities(hierarchy, index, ctx.domainId),
  };
}

function countChainDepth(chain: TreeChain | undefined): number {
  return chain?.length ?? 1;
}
