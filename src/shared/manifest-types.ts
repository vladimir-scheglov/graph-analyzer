// src/shared/manifest-types.ts

export interface ManifestBlockView {
  blockId: string;
  title: string;
  hash: string;
  generatedAt?: string;
  parentViewId?: string;
  status: "actual" | "modified" | "orphaned";
}

export interface ManifestEntityView {
  entityId: string;
  profile: string;
  generatedAt: string;
  blocks: ManifestBlockView[];
  stats: {
    total: number;
    actual: number;
    modified: number;
    orphaned: number;
  };
}

export interface ManifestDomainView {
  domainId: string;
  entities: ManifestEntityView[];
  stats: {
    entities: number;
    blocks: number;
    actual: number;
    modified: number;
    orphaned: number;
  };
}
