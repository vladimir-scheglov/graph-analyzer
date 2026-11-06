import type { EntityRecord } from "../../../../shared/model-types";
import type { RFNode } from "../../../lib/types";

export type HealthLevel = "good" | "mid" | "bad" | "unknown";
export type DomainStatus = "enabled" | "disabled";

export interface EnrichedDomain {
  node: RFNode;
  domainId: string;
  name: string;
  version: string;
  author: string;
  description: string;
  tags: string[];
  status: string | null;
  statusNormalized: DomainStatus;
  hasDraft: boolean;
  updatedAt: string | null;
  entitiesCount: number;
  filePath: string | null;
  folderPath: string[];
  isFavorite: boolean;
  entityMatches?: EntityRecord[];

  health: number | null;
  healthLevel: HealthLevel;

  pii: number;
  piiCritical: number;
  lint: number;
  lintErrors: number;
  views: number;
  attrs: number;

  isInvalid: boolean;
}

export interface DomainListFilters {
  query: string;
  authors: Set<string>;
  tags: Set<string>;
  statuses: Set<DomainStatus>;
  healthLevels: Set<HealthLevel>;
  onlyPii: boolean;
  onlyLintErrors: boolean;
  onlyDrafts: boolean;
  onlyInvalid: boolean;
  onlyFavorites: boolean;
}

export const EMPTY_DOMAIN_FILTERS: DomainListFilters = {
  query: "",
  authors: new Set(),
  tags: new Set(),
  statuses: new Set(),
  healthLevels: new Set(),
  onlyPii: false,
  onlyLintErrors: false,
  onlyDrafts: false,
  onlyInvalid: false,
  onlyFavorites: false,
};

export type DomainGrouping = "flat" | "namespace" | "folder";

export type DomainSortKey =
  | "default"
  | "name"
  | "version"
  | "updated"
  | "entities"
  | "health"
  | "views"
  | "attributes";

export type DomainSortDir = "asc" | "desc";

export type DomainViewMode = "cards" | "table";
export type DomainDensity = "comfortable" | "compact";

export const SORT_LABELS: Record<DomainSortKey, string> = {
  default: "По умолчанию",
  name: "По имени",
  version: "По версии",
  updated: "По обновлению",
  entities: "По сущностям",
  health: "По health",
  views: "По views",
  attributes: "По атрибутам",
};

export const GROUPING_LABELS: Record<DomainGrouping, string> = {
  flat: "Плоский список",
  namespace: "По неймспейсам",
  folder: "По каталогам",
};

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  good: "Хорошее (80+)",
  mid: "Среднее (50–79)",
  bad: "Плохое (< 50)",
  unknown: "Нет данных",
};

export function hasActiveFilters(f: DomainListFilters): boolean {
  return (
    !!f.query.trim() ||
    f.authors.size > 0 ||
    f.tags.size > 0 ||
    f.statuses.size > 0 ||
    f.healthLevels.size > 0 ||
    f.onlyPii ||
    f.onlyLintErrors ||
    f.onlyDrafts ||
    f.onlyInvalid ||
    f.onlyFavorites
  );
}

export function countActiveFilters(f: DomainListFilters): number {
  let n = 0;
  if (f.query.trim()) n++;
  n += f.authors.size;
  n += f.tags.size;
  n += f.statuses.size;
  n += f.healthLevels.size;
  if (f.onlyPii) n++;
  if (f.onlyLintErrors) n++;
  if (f.onlyDrafts) n++;
  if (f.onlyInvalid) n++;
  if (f.onlyFavorites) n++;
  return n;
}

// ============ Persistence ============

const FILTERS_KEY = "dg-domain-filters-v2";
const VIEW_KEY = "dg-domain-view-v2";

interface PersistedFilters {
  authors: string[];
  tags: string[];
  statuses: DomainStatus[];
  healthLevels: HealthLevel[];
  onlyPii: boolean;
  onlyLintErrors: boolean;
  onlyDrafts: boolean;
  onlyInvalid: boolean;
  onlyFavorites: boolean;
}

export function loadFilters(): DomainListFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_DOMAIN_FILTERS;
    const p: PersistedFilters = JSON.parse(raw);
    return {
      query: "", // query живёт в сторе (listSearchQuery)
      authors: new Set(Array.isArray(p.authors) ? p.authors : []),
      tags: new Set(Array.isArray(p.tags) ? p.tags : []),
      statuses: new Set(
        (Array.isArray(p.statuses) ? p.statuses : []).filter(
          (s) => s === "enabled" || s === "disabled",
        ),
      ),
      healthLevels: new Set(
        (Array.isArray(p.healthLevels) ? p.healthLevels : []).filter(
          (h) => h === "good" || h === "mid" || h === "bad" || h === "unknown",
        ),
      ),
      onlyPii: !!p.onlyPii,
      onlyLintErrors: !!p.onlyLintErrors,
      onlyDrafts: !!p.onlyDrafts,
      onlyInvalid: !!p.onlyInvalid,
      onlyFavorites: !!p.onlyFavorites,
    };
  } catch {
    return EMPTY_DOMAIN_FILTERS;
  }
}

export function saveFilters(f: DomainListFilters): void {
  try {
    const p: PersistedFilters = {
      authors: Array.from(f.authors),
      tags: Array.from(f.tags),
      statuses: Array.from(f.statuses),
      healthLevels: Array.from(f.healthLevels),
      onlyPii: f.onlyPii,
      onlyLintErrors: f.onlyLintErrors,
      onlyDrafts: f.onlyDrafts,
      onlyInvalid: f.onlyInvalid,
      onlyFavorites: f.onlyFavorites,
    };
    localStorage.setItem(FILTERS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export interface ViewPrefs {
  viewMode: DomainViewMode;
  grouping: DomainGrouping;
  sortKey: DomainSortKey;
  sortDir: DomainSortDir;
  density: DomainDensity;
  filtersOpen: boolean;
}

const DEFAULT_VIEW: ViewPrefs = {
  viewMode: "cards",
  grouping: "flat",
  sortKey: "default",
  sortDir: "asc",
  density: "comfortable",
  filtersOpen: false,
};

export function loadViewPrefs(): ViewPrefs {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return DEFAULT_VIEW;
    return { ...DEFAULT_VIEW, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveViewPrefs(p: ViewPrefs): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
