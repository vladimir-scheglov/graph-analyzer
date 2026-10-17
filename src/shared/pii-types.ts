export type PiiSeverity = "critical" | "high" | "medium" | "low";

export type PiiCategory =
  | "identity" // ФИО, имя
  | "contact" // email, phone, адрес
  | "document" // паспорт, ИНН, СНИЛС
  | "financial" // карты, счета
  | "biometric" // отпечатки, лицо
  | "special" // религия, здоровье, политика
  | "location" // геолокация, город
  | "technical" // IP, deviceId, cookies
  | "custom"; // пользователь добавил вручную

export interface PiiHit {
  /** Полный ключ: `domain.tld/entityid#attrid` (lowercase). */
  key: string;
  entityFqid: string;
  attributeId: string;
  attributeName: string;
  dataType: string;

  category: PiiCategory;
  severity: PiiSeverity;
  /** Что сработало — имя атрибута, тип, контекст сущности. */
  reasons: string[];
  /** Нормативная база — GDPR, 152-ФЗ, PCI DSS. */
  regulation?: string;
  /** Заметка для БА. */
  note: string;
}

export interface PiiReport {
  hits: PiiHit[];
  stats: {
    total: number;
    bySeverity: Record<PiiSeverity, number>;
    byCategory: Record<PiiCategory, number>;
    /** Сколько сущностей затронуто. */
    affectedEntities: number;
    /** Сколько доменов затронуто. */
    affectedDomains: number;
  };
  /** Список доменов с PII — для быстрого обзора. */
  byDomain: Array<{
    domainId: string;
    domainName: string;
    entityCount: number;
    hitCount: number;
    criticalCount: number;
  }>;
}
