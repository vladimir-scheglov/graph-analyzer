import React, { useCallback, useMemo, useState } from "react";
import { MIcon } from "../../common/MIcon";
import type {
    DomainListFilters,
    EnrichedDomain,
    DomainStatus,
    HealthLevel,
} from "./types";
import { HEALTH_LABELS } from "./types";

interface FilterGroupProps {
    id: string;
    title: string;
    icon: string;
    activeCount: number;
    collapsed: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function FilterGroup({
    title,
    icon,
    activeCount,
    collapsed,
    onToggle,
    children,
}: FilterGroupProps) {
    return (
        <div className="entity-catalog-group entity-catalog-group--collapsible">
            <button
                type="button"
                className="entity-catalog-group__header"
                onClick={onToggle}
                aria-expanded={!collapsed}
            >
                <span className="material-symbols-outlined mi-sm entity-catalog-group__chevron">
                    chevron_right
                </span>
                <span className="material-symbols-outlined mi-sm">{icon}</span>
                <span className="entity-catalog-group__title-text">{title}</span>
                {activeCount > 0 && (
                    <span className="entity-catalog-group__active-badge">
                        {activeCount}
                    </span>
                )}
            </button>
            {!collapsed && (
                <div className="entity-catalog-group__body">{children}</div>
            )}
        </div>
    );
}

interface FilterChipProps {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
    icon?: string;
}

function FilterChip({ label, count, active, onClick, icon }: FilterChipProps) {
    return (
        <button
            type="button"
            className={"entity-catalog-chip" + (active ? " active" : "")}
            onClick={onClick}
        >
            {icon && <MIcon name={icon} size="sm" />}
            <span className="entity-catalog-chip__label">{label}</span>
            <span className="entity-catalog-chip__count">{count}</span>
        </button>
    );
}

export interface DomainFiltersPanelProps {
    domains: EnrichedDomain[];
    filters: DomainListFilters;
    onChange: (f: DomainListFilters) => void;
    onReset: () => void;
}

export function DomainFiltersPanel({
    domains,
    filters,
    onChange,
    onReset,
}: DomainFiltersPanelProps) {
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
        () => new Set(["authors", "tags"]),
    );

    const toggleGroup = useCallback((id: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // ── Facet counts ──
    const facets = useMemo(() => {
        const authorsMap = new Map<string, { label: string; count: number }>();
        const tagsMap = new Map<string, { label: string; count: number }>();
        const statusCounts: Record<DomainStatus, number> = {
            enabled: 0,
            disabled: 0,
        };
        const healthCounts: Record<HealthLevel, number> = {
            good: 0,
            mid: 0,
            bad: 0,
            unknown: 0,
        };
        let piiDomains = 0;
        let lintErrDomains = 0;
        let draftDomains = 0;
        let invalidDomains = 0;
        let favDomains = 0;

        for (const d of domains) {
            if (d.author) {
                const k = d.author.toLowerCase();
                const cur = authorsMap.get(k);
                if (cur) cur.count++;
                else authorsMap.set(k, { label: d.author, count: 1 });
            }
            for (const t of d.tags) {
                const k = t.toLowerCase();
                const cur = tagsMap.get(k);
                if (cur) cur.count++;
                else tagsMap.set(k, { label: t, count: 1 });
            }
            statusCounts[d.statusNormalized]++;
            healthCounts[d.healthLevel]++;
            if (d.piiCritical > 0) piiDomains++;
            if (d.lintErrors > 0) lintErrDomains++;
            if (d.hasDraft) draftDomains++;
            if (d.isInvalid) invalidDomains++;
            if (d.isFavorite) favDomains++;
        }

        return {
            authors: Array.from(authorsMap.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .map(([k, v]) => ({ value: k, ...v })),
            tags: Array.from(tagsMap.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .map(([k, v]) => ({ value: k, ...v })),
            statusCounts,
            healthCounts,
            piiDomains,
            lintErrDomains,
            draftDomains,
            invalidDomains,
            favDomains,
        };
    }, [domains]);

    const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
        const next = new Set(set);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        return next;
    };

    return (
        <div className="domain-filters-panel">
            <div className="domain-filters-panel__head">
                <div className="domain-filters-panel__title">
                    <MIcon name="tune" size="sm" />
                    Фильтры
                </div>
                <button
                    className="domain-filters-panel__reset"
                    onClick={onReset}
                    title="Сбросить все фильтры"
                >
                    <MIcon name="filter_alt_off" size="sm" />
                    Сбросить
                </button>
            </div>

            <div className="domain-filters-panel__body">
                {/* ── Флаги ── */}
                <FilterGroup
                    id="flags"
                    title="Быстрые фильтры"
                    icon="bolt"
                    activeCount={
                        [filters.onlyPii, filters.onlyLintErrors, filters.onlyDrafts, filters.onlyInvalid, filters.onlyFavorites].filter(Boolean).length
                    }
                    collapsed={collapsedGroups.has("flags")}
                    onToggle={() => toggleGroup("flags")}
                >
                    <div className="entity-catalog-chips">
                        {filters.onlyPii || facets.piiDomains > 0 ? (
                            <FilterChip
                                label="PII critical"
                                icon="shield_lock"
                                count={facets.piiDomains}
                                active={filters.onlyPii}
                                onClick={() =>
                                    onChange({ ...filters, onlyPii: !filters.onlyPii })
                                }
                            />
                        ) : null}
                        {filters.onlyLintErrors || facets.lintErrDomains > 0 ? (
                            <FilterChip
                                label="Lint errors"
                                icon="error"
                                count={facets.lintErrDomains}
                                active={filters.onlyLintErrors}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        onlyLintErrors: !filters.onlyLintErrors,
                                    })
                                }
                            />
                        ) : null}
                        {filters.onlyDrafts || facets.draftDomains > 0 ? (
                            <FilterChip
                                label="С черновиком"
                                icon="edit_note"
                                count={facets.draftDomains}
                                active={filters.onlyDrafts}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        onlyDrafts: !filters.onlyDrafts,
                                    })
                                }
                            />
                        ) : null}
                        {filters.onlyInvalid || facets.invalidDomains > 0 ? (
                            <FilterChip
                                label="Невалидные"
                                icon="cancel"
                                count={facets.invalidDomains}
                                active={filters.onlyInvalid}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        onlyInvalid: !filters.onlyInvalid,
                                    })
                                }
                            />
                        ) : null}
                        {filters.onlyFavorites || facets.favDomains > 0 ? (
                            <FilterChip
                                label="Избранные"
                                icon="star"
                                count={facets.favDomains}
                                active={filters.onlyFavorites}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        onlyFavorites: !filters.onlyFavorites,
                                    })
                                }
                            />
                        ) : null}
                    </div>
                </FilterGroup>

                {/* ── Статус ── */}
                <FilterGroup
                    id="status"
                    title="Статус"
                    icon="toggle_on"
                    activeCount={filters.statuses.size}
                    collapsed={collapsedGroups.has("status")}
                    onToggle={() => toggleGroup("status")}
                >
                    <div className="entity-catalog-chips">
                        {(["enabled", "disabled"] as DomainStatus[]).map((s) => (
                            <FilterChip
                                key={s}
                                label={s === "enabled" ? "Включён" : "Выключен"}
                                icon={s === "enabled" ? "play_circle" : "pause_circle"}
                                count={facets.statusCounts[s]}
                                active={filters.statuses.has(s)}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        statuses: toggle(filters.statuses, s),
                                    })
                                }
                            />
                        ))}
                    </div>
                </FilterGroup>

                {/* ── Health ── */}
                <FilterGroup
                    id="health"
                    title="Health"
                    icon="favorite"
                    activeCount={filters.healthLevels.size}
                    collapsed={collapsedGroups.has("health")}
                    onToggle={() => toggleGroup("health")}
                >
                    <div className="entity-catalog-chips">
                        {(
                            ["good", "mid", "bad", "unknown"] as HealthLevel[]
                        ).map((h) => (
                            <FilterChip
                                key={h}
                                label={HEALTH_LABELS[h]}
                                icon={
                                    h === "good"
                                        ? "sentiment_satisfied"
                                        : h === "mid"
                                            ? "sentiment_neutral"
                                            : h === "bad"
                                                ? "sentiment_dissatisfied"
                                                : "help"
                                }
                                count={facets.healthCounts[h]}
                                active={filters.healthLevels.has(h)}
                                onClick={() =>
                                    onChange({
                                        ...filters,
                                        healthLevels: toggle(filters.healthLevels, h),
                                    })
                                }
                            />
                        ))}
                    </div>
                </FilterGroup>

                {/* ── Авторы ── */}
                {facets.authors.length > 1 && (
                    <FilterGroup
                        id="authors"
                        title="Авторы"
                        icon="person"
                        activeCount={filters.authors.size}
                        collapsed={collapsedGroups.has("authors")}
                        onToggle={() => toggleGroup("authors")}
                    >
                        <div className="entity-catalog-chips entity-catalog-chips--scrollable">
                            {facets.authors.map((a) => (
                                <FilterChip
                                    key={a.value}
                                    label={a.label}
                                    count={a.count}
                                    active={filters.authors.has(a.value)}
                                    onClick={() =>
                                        onChange({
                                            ...filters,
                                            authors: toggle(filters.authors, a.value),
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </FilterGroup>
                )}

                {/* ── Теги ── */}
                {facets.tags.length > 0 && (
                    <FilterGroup
                        id="tags"
                        title="Теги"
                        icon="label"
                        activeCount={filters.tags.size}
                        collapsed={collapsedGroups.has("tags")}
                        onToggle={() => toggleGroup("tags")}
                    >
                        <div className="entity-catalog-chips entity-catalog-chips--scrollable">
                            {facets.tags.map((t) => (
                                <FilterChip
                                    key={t.value}
                                    label={t.label}
                                    count={t.count}
                                    active={filters.tags.has(t.value)}
                                    onClick={() =>
                                        onChange({
                                            ...filters,
                                            tags: toggle(filters.tags, t.value),
                                        })
                                    }
                                />
                            ))}
                        </div>
                    </FilterGroup>
                )}
            </div>
        </div>
    );
}