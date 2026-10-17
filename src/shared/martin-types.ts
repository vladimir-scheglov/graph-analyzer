export interface MartinMetrics {
  domainId: string;
  domainName: string;

  /** Afferent — сколько доменов зависят от этого. */
  ca: number;
  /** Efferent — от скольких зависит этот. */
  ce: number;
  /** Instability = Ce / (Ca + Ce). 0..1 */
  instability: number;

  /** Abstractness = abstract entities / total entities. 0..1 */
  abstractness: number;

  /** Distance = |A + I - 1|. 0..1 */
  distance: number;

  /** Итоговая категория для UI. */
  zone: "main-sequence" | "pain" | "uselessness" | "unclassified";

  /** Разбивка по зависимостям. */
  afferentDomains: string[];
  efferentDomains: string[];

  entitiesTotal: number;
  entitiesAbstract: number;
}

export interface MartinReport {
  metrics: MartinMetrics[];
  stats: {
    totalDomains: number;
    painZone: MartinMetrics[];
    uselessnessZone: MartinMetrics[];
    mainSequence: MartinMetrics[];
  };
  averages: {
    instability: number;
    abstractness: number;
    distance: number;
  };
}
