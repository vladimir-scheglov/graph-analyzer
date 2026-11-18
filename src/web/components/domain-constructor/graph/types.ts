export type GraphLayer = "linkages" | "inheritance" | "mixins" | "transitive";

export interface EntityNodeData {
  /** FQID (lowercase). */
  fqid: string;
  /** Локальный ID. */
  entityId: string;
  name: string;
  /** Иконка (если graphView.iconColor задан — цветная рамка). */
  color?: string;
  /** Тип: own (в YAML схемы) / external (только в ModelIndex). */
  kind: "own" | "external";
  /** Кол-во атрибутов (для размера). */
  attributeCount: number;
  /** Собственные / унаследованные. */
  inherits?: string | null;
}

export interface LinkageEdgeData {
  kind: "linkage";
  id: string;
  name?: string;
  /** Тип связи: 1_1, 1_n, n_n. */
  type: string;
  undirected?: boolean;
  /** Глаголы с обеих сторон (для label). */
  nameFrom?: { side1?: string; side2?: string };
  /** Цвет линии (из view.iconColor). */
  color?: string;
  /** 'own' — в YAML, 'external' — только в ModelIndex. */
  source: "own" | "external";
}

export interface InheritanceEdgeData {
  kind: "inheritance";
  /** parent → child. */
  parentFqid: string;
  childFqid: string;
  /** Внутри одного домена или меж-доменное. */
  crossDomain: boolean;
}

export interface MixinEdgeData {
  kind: "mixin";
  /** source → target. */
  sourceFqid: string;
  targetFqid: string;
  mixinType: "linkage" | "view";
}

export interface TransitiveEdgeData {
  kind: "transitive";
  /** Корень цепочки. */
  fromFqid: string;
  /** Конец цепочки. */
  toFqid: string;
  transitiveId: string;
  /** Глубина цепочки. */
  depth: number;
}

export type GraphNodeData = EntityNodeData;
export type GraphEdgeData =
  | LinkageEdgeData
  | InheritanceEdgeData
  | MixinEdgeData
  | TransitiveEdgeData;

export interface GraphFilterOptions {
  layers: Set<GraphLayer>;
  /** Поиск по name/id сущности. */
  search: string;
  /** Только эти типы связей (для слоя linkages). */
  linkageTypes: Set<string>;
}
