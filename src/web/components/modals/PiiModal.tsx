import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import {
    generatePiiMarkdown,
    downloadPiiMarkdown,
} from "../../lib/markdown/pii-markdown";
import { openFileInEditor } from "../../lib/open-file";
import { alertDialog, confirmDialog } from "../../lib/dialogs";
import type {
    PiiCategory,
    PiiHit,
    PiiSeverity,
} from "../../../shared/pii-types";

// ============ Константы ============

const SEVERITY_LABELS: Record<PiiSeverity, string> = {
    critical: "Спецкатегории",
    high: "Высокая чувствительность",
    medium: "Требуют внимания",
    low: "Косвенно",
};

const SEVERITY_SHORT: Record<PiiSeverity, string> = {
    critical: "спец.",
    high: "выс.",
    medium: "сред.",
    low: "косв.",
};

const SEVERITY_ORDER: PiiSeverity[] = ["critical", "high", "medium", "low"];

const SEVERITY_COLOR: Record<PiiSeverity, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#f59e0b",
    low: "#94a3b8",
};

const SEVERITY_RISK: Record<PiiSeverity, number> = {
    critical: 4,
    high: 2,
    medium: 1,
    low: 0.5,
};

const CATEGORY_LABELS: Record<PiiCategory, string> = {
    identity: "Идентичность",
    contact: "Контакты",
    document: "Документы",
    financial: "Финансовые",
    biometric: "Биометрия",
    special: "Спецкатегории",
    location: "Локация",
    technical: "Технические",
    custom: "Прочие",
};

const CATEGORY_ICONS: Record<PiiCategory, string> = {
    identity: "person",
    contact: "contact_mail",
    document: "badge",
    financial: "credit_card",
    biometric: "fingerprint",
    special: "psychology",
    location: "place",
    technical: "memory",
    custom: "more_horiz",
};

const IGNORED_KEY = "dg-pii-ignored";

type GroupMode = "severity" | "category" | "domain" | "entity" | "flat";
type SeverityFilter = PiiSeverity | "all";
type CategoryFilter = PiiCategory | "all";

// ============ Risk score ============

function computeRisk(
    bySeverity: Record<PiiSeverity, number>,
): { score: number; grade: "A" | "B" | "C" | "D" | "E" } {
    const raw =
        bySeverity.critical * SEVERITY_RISK.critical +
        bySeverity.high * SEVERITY_RISK.high +
        bySeverity.medium * SEVERITY_RISK.medium +
        bySeverity.low * SEVERITY_RISK.low;

    if (raw === 0) return { score: 0, grade: "A" };
    // 1 critical → ~18, 5 → ~46, 20 → ~72, 100 → ~98
    const score = Math.min(98, Math.round(30 * Math.log10(raw + 1)));
    const grade: "A" | "B" | "C" | "D" | "E" =
        score <= 20
            ? "A"
            : score <= 40
                ? "B"
                : score <= 60
                    ? "C"
                    : score <= 80
                        ? "D"
                        : "E";
    return { score, grade };
}

// ============ Storage ============

function loadIgnored(): Set<string> {
    try {
        const raw = localStorage.getItem(IGNORED_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}

function saveIgnored(s: Set<string>): void {
    try {
        localStorage.setItem(IGNORED_KEY, JSON.stringify(Array.from(s)));
    } catch {
        /* ignore */
    }
}

// ============ Регуляции ============

function parseRegulations(hits: PiiHit[]): Array<{ label: string; count: number }> {
    const map = new Map<string, number>();
    for (const h of hits) {
        if (!h.regulation) continue;
        const parts = h.regulation.split(/\s*\/\s*/);
        for (const p of parts) {
            const t = p.trim();
            if (!t) continue;
            map.set(t, (map.get(t) || 0) + 1);
        }
    }
    return Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
}

// ============ Hit card ============

interface HitCardProps {
    hit: PiiHit;
    isExpanded: boolean;
    isIgnored: boolean;
    siblingHits: PiiHit[]; // другие PII в этой сущности
    onToggle: () => void;
    onIgnore: () => void;
    onUnignore: () => void;
    onOpenEntity: () => void;
    onOpenYaml: () => void;
    onOpenDomainSchema: (domainId: string) => void;
}

function HitCard({
    hit,
    isExpanded,
    isIgnored,
    siblingHits,
    onToggle,
    onIgnore,
    onUnignore,
    onOpenEntity,
    onOpenYaml,
    onOpenDomainSchema,
}: HitCardProps) {
    const [domainId, entityId] = hit.entityFqid.split("/");
    const color = SEVERITY_COLOR[hit.severity];

    return (
        <div
            className={
                "pii-hit pii-hit--" + hit.severity + (isIgnored ? " pii-hit--ignored" : "")
            }
        >
            <div className="pii-hit__head" onClick={onToggle}>
                <MIcon name={isExpanded ? "expand_more" : "chevron_right"} size="sm" />
                <code className="pii-hit__id">
                    {entityId}.{hit.attributeId}
                </code>
                <span className="pii-hit__name">{hit.attributeName}</span>
                <span className="pii-hit__type">{hit.dataType}</span>
                <span
                    className="pii-hit__category-chip"
                    style={{ background: color + "22", color }}
                >
                    <MIcon name={CATEGORY_ICONS[hit.category]} size="sm" />
                    {CATEGORY_LABELS[hit.category]}
                </span>
                {isIgnored && (
                    <span className="pii-hit__ignored-badge" title="Помечен как «не PII»">
                        игнор
                    </span>
                )}
                {siblingHits.length > 1 && (
                    <span
                        className="pii-hit__composition-badge"
                        title={`В сущности ${siblingHits.length} PII-атрибута — риск композиции`}
                    >
                        <MIcon name="warning" size="sm" />
                        {siblingHits.length}
                    </span>
                )}
            </div>

            {isExpanded && (
                <div className="pii-hit__details">
                    <div className="pii-hit__detail-row">
                        <span className="pii-hit__detail-label">Домен</span>
                        <button
                            className="pii-hit__detail-link"
                            onClick={(e) => {
                                e.stopPropagation();
                                onOpenDomainSchema(domainId);
                            }}
                        >
                            <MIcon name="folder" size="sm" />
                            {domainId}
                        </button>
                    </div>

                    <div className="pii-hit__detail-row">
                        <span className="pii-hit__detail-label">Полный ключ</span>
                        <code className="pii-hit__detail-code">{hit.key}</code>
                    </div>

                    <div className="pii-hit__detail-row">
                        <span className="pii-hit__detail-label">Сработало</span>
                        <span className="pii-hit__detail-value">
                            {hit.reasons.map((r, i) => (
                                <span key={i} className="pii-hit__reason-chip">
                                    {r}
                                </span>
                            ))}
                        </span>
                    </div>

                    {hit.regulation && (
                        <div className="pii-hit__detail-row">
                            <span className="pii-hit__detail-label">Регуляция</span>
                            <span className="pii-hit__detail-value">
                                <span className="pii-hit__reg-chip">{hit.regulation}</span>
                            </span>
                        </div>
                    )}

                    <div className="pii-hit__note">{hit.note}</div>

                    {siblingHits.length > 1 && (
                        <div className="pii-hit__composition">
                            <div className="pii-hit__composition-title">
                                <MIcon name="hub" size="sm" />
                                Композиция: {siblingHits.length} PII в сущности
                                <span className="pii-hit__composition-hint">
                                    Комбинация PII-атрибутов даёт больше риска, чем каждый
                                    по отдельности
                                </span>
                            </div>
                            <div className="pii-hit__composition-list">
                                {siblingHits
                                    .filter((h) => h.key !== hit.key)
                                    .slice(0, 10)
                                    .map((h) => (
                                        <code
                                            key={h.key}
                                            className={
                                                "pii-hit__composition-attr pii-hit__composition-attr--" +
                                                h.severity
                                            }
                                            title={`${CATEGORY_LABELS[h.category]} · ${SEVERITY_LABELS[h.severity]}`}
                                        >
                                            {h.attributeId}
                                        </code>
                                    ))}
                                {siblingHits.length > 11 && (
                                    <span className="pii-hit__composition-more">
                                        +{siblingHits.length - 11}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="pii-hit__actions">
                        <button className="btn btn--primary" onClick={onOpenEntity}>
                            <MIcon name="menu_book" size="sm" />
                            Открыть сущность
                        </button>
                        <button className="btn" onClick={onOpenYaml}>
                            <MIcon name="description" size="sm" />
                            YAML
                        </button>
                        {!isIgnored ? (
                            <button
                                className="btn btn--danger"
                                onClick={onIgnore}
                                title="Пометить как «не PII»"
                            >
                                <MIcon name="block" size="sm" />
                                Не PII
                            </button>
                        ) : (
                            <button
                                className="btn"
                                onClick={onUnignore}
                                title="Вернуть в список"
                            >
                                <MIcon name="undo" size="sm" />
                                Вернуть
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ Main ============

export function PiiModal() {
    const { index, loading, error } = useModelIndex();
    const open = useGraphStore((s) => s.piiOpen);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    const [ignored, setIgnored] = useState<Set<string>>(loadIgnored);
    const [filterSeverity, setFilterSeverity] = useState<SeverityFilter>("all");
    const [filterCategory, setFilterCategory] = useState<CategoryFilter>("all");
    const [filterDomain, setFilterDomain] = useState<string>("");
    const [query, setQuery] = useState("");
    const [groupMode, setGroupMode] = useState<GroupMode>("severity");
    const [showIgnored, setShowIgnored] = useState(false);
    const [expandedHits, setExpandedHits] = useState<Set<string>>(new Set());

    const nodes = useGraphStore((s) => s.nodes);

    const piiInitialDomain = useGraphStore((s) => s.piiInitialDomain);
    const piiInitialSeverity = useGraphStore((s) => s.piiInitialSeverity);
    const setPiiInitialDomain = useGraphStore((s) => s.setPiiInitialDomain);
    const setPiiInitialSeverity = useGraphStore((s) => s.setPiiInitialSeverity);

    useEffect(() => {
        if (!open) return;
        if (piiInitialDomain !== null) {
            setFilterDomain(piiInitialDomain.toLowerCase());
            setPiiInitialDomain(null);
        }
        if (piiInitialSeverity !== null) {
            setFilterSeverity(piiInitialSeverity);
            setPiiInitialSeverity(null);
        }
    }, [
        open,
        piiInitialDomain,
        piiInitialSeverity,
        setPiiInitialDomain,
        setPiiInitialSeverity,
    ]);

    const report = index?.pii ?? null;

    // ── Все hits, включая ignored ──
    const allHits = useMemo(() => report?.hits || [], [report]);

    // ── Активные hits (без ignored, если showIgnored=false) ──
    const activeHits = useMemo(() => {
        return allHits.filter((h) => showIgnored || !ignored.has(h.key));
    }, [allHits, ignored, showIgnored]);

    // ── Видимые hits (с учётом всех фильтров) ──
    const visibleHits = useMemo(() => {
        let hits = activeHits;
        if (filterSeverity !== "all") {
            hits = hits.filter((h) => h.severity === filterSeverity);
        }
        if (filterCategory !== "all") {
            hits = hits.filter((h) => h.category === filterCategory);
        }
        if (filterDomain) {
            hits = hits.filter(
                (h) => h.entityFqid.split("/")[0].toLowerCase() === filterDomain,
            );
        }
        const q = query.trim().toLowerCase();
        if (q) {
            hits = hits.filter(
                (h) =>
                    h.attributeId.toLowerCase().includes(q) ||
                    h.attributeName.toLowerCase().includes(q) ||
                    h.entityFqid.toLowerCase().includes(q) ||
                    h.reasons.some((r) => r.toLowerCase().includes(q)) ||
                    (h.note && h.note.toLowerCase().includes(q)),
            );
        }
        return hits;
    }, [activeHits, filterSeverity, filterCategory, filterDomain, query]);

    // ── KPI по активным hits (без фильтров, чтобы показать «сколько всего») ──
    const stats = useMemo(() => {
        const bySeverity: Record<PiiSeverity, number> = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };
        const byCategory: Record<PiiCategory, number> = {
            identity: 0,
            contact: 0,
            document: 0,
            financial: 0,
            biometric: 0,
            special: 0,
            location: 0,
            technical: 0,
            custom: 0,
        };
        const domains = new Set<string>();
        const entities = new Set<string>();

        for (const h of activeHits) {
            bySeverity[h.severity]++;
            byCategory[h.category]++;
            domains.add(h.entityFqid.split("/")[0]);
            entities.add(h.entityFqid);
        }

        return {
            total: activeHits.length,
            bySeverity,
            byCategory,
            domainsCount: domains.size,
            entitiesCount: entities.size,
            risk: computeRisk(bySeverity),
        };
    }, [activeHits]);

    const regulations = useMemo(() => parseRegulations(activeHits), [activeHits]);

    // ── Композиция по сущностям ──
    const byEntity = useMemo(() => {
        const m = new Map<string, PiiHit[]>();
        for (const h of activeHits) {
            if (!m.has(h.entityFqid)) m.set(h.entityFqid, []);
            m.get(h.entityFqid)!.push(h);
        }
        return m;
    }, [activeHits]);

    // ── Список доменов для фильтра ──
    const allDomains = useMemo(() => {
        const map = new Map<string, number>();
        allHits.forEach((h) => {
            const d = h.entityFqid.split("/")[0];
            map.set(d, (map.get(d) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [allHits]);

    // ── Группировка ──
    const grouped = useMemo(() => {
        if (groupMode === "flat") {
            return [
                {
                    key: "all",
                    label: `Все совпадения (${visibleHits.length})`,
                    icon: "list",
                    color: "var(--text-500)",
                    hits: visibleHits,
                    bulkIgnore: null as null | (() => Promise<void>),
                },
            ];
        }

        if (groupMode === "severity") {
            return SEVERITY_ORDER.filter((s) =>
                visibleHits.some((h) => h.severity === s),
            ).map((s) => ({
                key: s,
                label: SEVERITY_LABELS[s],
                icon:
                    s === "critical"
                        ? "dangerous"
                        : s === "high"
                            ? "warning"
                            : s === "medium"
                                ? "info"
                                : "help",
                color: SEVERITY_COLOR[s],
                hits: visibleHits.filter((h) => h.severity === s),
                bulkIgnore: null,
            }));
        }

        if (groupMode === "category") {
            const cats = Array.from(
                new Set(visibleHits.map((h) => h.category)),
            ) as PiiCategory[];
            return cats
                .sort((a, b) => stats.byCategory[b] - stats.byCategory[a])
                .map((c) => ({
                    key: c,
                    label: CATEGORY_LABELS[c],
                    icon: CATEGORY_ICONS[c],
                    color: "var(--accent-hover)",
                    hits: visibleHits.filter((h) => h.category === c),
                    bulkIgnore: (async () => {
                        const toIgnore = visibleHits.filter(
                            (h) => h.category === c && !ignored.has(h.key),
                        );
                        if (toIgnore.length === 0) return;
                        const ok = await confirmDialog(
                            `Пометить ${toIgnore.length} атрибутов как «не PII»?`,
                            {
                                detail:
                                    `Все атрибуты категории «${CATEGORY_LABELS[c]}» в текущих ` +
                                    `фильтрах будут скрыты. Решение сохраняется в браузере.`,
                                confirmLabel: "Пометить",
                            },
                        );
                        if (!ok) return;
                        const next = new Set(ignored);
                        toIgnore.forEach((h) => next.add(h.key));
                        setIgnored(next);
                        saveIgnored(next);
                    }) as (() => Promise<void>) | null,
                }));
        }

        if (groupMode === "domain") {
            const byDomain = new Map<string, PiiHit[]>();
            visibleHits.forEach((h) => {
                const d = h.entityFqid.split("/")[0];
                if (!byDomain.has(d)) byDomain.set(d, []);
                byDomain.get(d)!.push(h);
            });
            return Array.from(byDomain.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .map(([d, hits]) => ({
                    key: d,
                    label: d,
                    icon: "folder",
                    color: "var(--accent-hover)",
                    hits,
                    bulkIgnore: (async () => {
                        const toIgnore = hits.filter((h) => !ignored.has(h.key));
                        if (toIgnore.length === 0) return;
                        const ok = await confirmDialog(
                            `Пометить ${toIgnore.length} атрибутов в ${d} как «не PII»?`,
                            {
                                detail: `Все PII-атрибуты домена будут скрыты.`,
                                confirmLabel: "Пометить",
                            },
                        );
                        if (!ok) return;
                        const next = new Set(ignored);
                        toIgnore.forEach((h) => next.add(h.key));
                        setIgnored(next);
                        saveIgnored(next);
                    }) as (() => Promise<void>) | null,
                }));
        }

        // groupMode === "entity"
        const byEnt = new Map<string, PiiHit[]>();
        visibleHits.forEach((h) => {
            if (!byEnt.has(h.entityFqid)) byEnt.set(h.entityFqid, []);
            byEnt.get(h.entityFqid)!.push(h);
        });
        return Array.from(byEnt.entries())
            .sort((a, b) => {
                const ca = a[1].filter((h) => h.severity === "critical").length;
                const cb = b[1].filter((h) => h.severity === "critical").length;
                if (ca !== cb) return cb - ca;
                return b[1].length - a[1].length;
            })
            .map(([fqid, hits]) => ({
                key: fqid,
                label: fqid,
                icon: "data_object",
                color: "var(--accent-hover)",
                hits,
                bulkIgnore: null,
            }));
    }, [groupMode, visibleHits, stats.byCategory, ignored]);

    // ── Toggle хит ──
    const toggleHit = useCallback((key: string) => {
        setExpandedHits((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const ignoreHit = useCallback((key: string) => {
        setIgnored((prev) => {
            const next = new Set(prev);
            next.add(key);
            saveIgnored(next);
            return next;
        });
    }, []);

    const unignoreHit = useCallback((key: string) => {
        setIgnored((prev) => {
            const next = new Set(prev);
            next.delete(key);
            saveIgnored(next);
            return next;
        });
    }, []);

    const openEntity = useCallback((fqid: string) => {
        const st = useGraphStore.getState();
        st.setPiiOpen(false);
        st.setEntityCatalogInitialFqid(fqid.toLowerCase());
        st.setEntityCatalogOpen(true);
    }, []);

    const openDomainSchema = useCallback((domainId: string) => {
        const st = useGraphStore.getState();
        st.setPiiOpen(false);
        st.setDomainSchemaDomainId(domainId.toLowerCase());
        st.setDomainSchemaOpen(true);
    }, []);

    const openYaml = useCallback(
        async (fqid: string) => {
            const domainId = fqid.split("/")[0];
            const node = nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() === domainId.toLowerCase(),
            );
            if (node?.data.filePath) {
                const ok = await openFileInEditor(node.data.filePath, fqid, domainId);
                if (ok) useGraphStore.getState().setPiiOpen(false);
            } else {
                useGraphStore.getState().showSnackbar("Файл схемы не найден");
            }
        },
        [nodes],
    );

    // ── Экспорт ──
    const exportCSV = () => {
        if (!report) return;
        const header = [
            "key",
            "domain",
            "entity",
            "attribute",
            "attribute_name",
            "data_type",
            "category",
            "severity",
            "reasons",
            "regulation",
            "note",
            "composition_count",
        ];
        const lines = [header.join(",")];
        for (const h of visibleHits) {
            const [d, e] = h.entityFqid.split("/");
            const comp = (byEntity.get(h.entityFqid) || []).length;
            const cell = (v: any): string => {
                const s = String(v ?? "");
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            lines.push(
                [
                    cell(h.key),
                    cell(d),
                    cell(e),
                    cell(h.attributeId),
                    cell(h.attributeName),
                    cell(h.dataType),
                    cell(h.category),
                    cell(h.severity),
                    cell(h.reasons.join("; ")),
                    cell(h.regulation || ""),
                    cell(h.note),
                    String(comp),
                ].join(","),
            );
        }
        const blob = new Blob(["\uFEFF" + lines.join("\n")], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pii-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportJSON = () => {
        if (!report) return;
        const data = {
            generatedAt: new Date().toISOString(),
            stats: {
                total: stats.total,
                bySeverity: stats.bySeverity,
                byCategory: stats.byCategory,
                affectedDomains: stats.domainsCount,
                affectedEntities: stats.entitiesCount,
                riskScore: stats.risk.score,
                riskGrade: stats.risk.grade,
                regulations,
            },
            hits: visibleHits.map((h) => ({
                ...h,
                compositionCount: (byEntity.get(h.entityFqid) || []).length,
            })),
            ignoredKeys: Array.from(ignored),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pii-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportMDReport = () => {
        if (!report || !index) return;
        const md = generatePiiMarkdown(report, index, { ignoredKeys: ignored });
        downloadPiiMarkdown(md);
    };

    const clearAllIgnored = async () => {
        if (ignored.size === 0) return;
        const ok = await confirmDialog(
            `Вернуть ${ignored.size} игнорированных атрибутов?`,
            { confirmLabel: "Вернуть" },
        );
        if (!ok) return;
        setIgnored(new Set());
        saveIgnored(new Set());
    };

    const resetFilters = () => {
        setFilterSeverity("all");
        setFilterCategory("all");
        setFilterDomain("");
        setQuery("");
    };

    if (!open) return null;

    const hasFilters =
        filterSeverity !== "all" ||
        filterCategory !== "all" ||
        !!filterDomain ||
        !!query;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setPiiOpen(false)}
        >
            <div
                className="help-modal pii-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="shield_lock" size="sm" />
                        <span className="icon-label">PII-атрибуты</span>
                        {report && (
                            <span className="help-modal__badge">
                                {stats.total} из {allHits.length}
                            </span>
                        )}
                        {stats.risk.grade && (
                            <span
                                className={
                                    "help-modal__badge pii-grade pii-grade--" +
                                    stats.risk.grade.toLowerCase()
                                }
                                title={`Risk score ${stats.risk.score}/100`}
                            >
                                {stats.risk.grade} · {stats.risk.score}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__icon-btn"
                            onClick={exportCSV}
                            disabled={visibleHits.length === 0}
                            title="Скачать CSV"
                        >
                            <MIcon name="table_view" />
                        </button>
                        <button
                            className="help-modal__icon-btn"
                            onClick={exportJSON}
                            disabled={visibleHits.length === 0}
                            title="Скачать JSON"
                        >
                            <MIcon name="data_object" />
                        </button>
                        <button
                            className="help-modal__icon-btn"
                            onClick={exportMDReport}
                            disabled={!report || report.hits.length === 0}
                            title="Экспорт отчёта для DPO (Markdown)"
                        >
                            <MIcon name="download" />
                        </button>
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Что это?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setPiiOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса…</div>
                    </div>
                )}

                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && report && (
                    <div className="pii-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что такое PII">
                                <HelpText>
                                    <strong>PII (Personally Identifiable Information)</strong> —
                                    персональные данные: любые сведения, которые прямо или косвенно
                                    позволяют идентифицировать человека. В РФ регулируется 152-ФЗ, в
                                    ЕС — GDPR. Спецкатегории (здоровье, религия, биометрия) требуют
                                    особой защиты и отдельного согласия субъекта.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Risk score и grade">
                                <HelpText>
                                    Интегральная оценка риска на основе severity и количества
                                    совпадений. Штраф считается как:
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <code>
                                            risk = 30 × log10(critical × 4 + high × 2 + medium × 1 + low × 0.5 + 1)
                                        </code>
                                    </li>
                                    <li>
                                        <strong>A</strong> — 0–20. Минимальный риск: PII мало или
                                        только косвенные.
                                    </li>
                                    <li>
                                        <strong>B</strong> — 21–40. Есть PII, но без спецкатегорий.
                                    </li>
                                    <li>
                                        <strong>C</strong> — 41–60. Заметное количество PII.
                                    </li>
                                    <li>
                                        <strong>D</strong> — 61–80. Много PII или есть спецкатегории.
                                    </li>
                                    <li>
                                        <strong>E</strong> — 81+. Критично, требует немедленных мер.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Уровни серьёзности">
                                <HelpList>
                                    <li>
                                        <strong>Спецкатегории</strong> — критично. GDPR Art. 9 /
                                        152-ФЗ спецкатегория: здоровье, религия, биометрия,
                                        политические взгляды, сексуальная ориентация, этничность.
                                    </li>
                                    <li>
                                        <strong>Высокая чувствительность</strong> — ФИО, email,
                                        телефон, паспорт, ИНН, СНИЛС. Требует защиты и политики
                                        retention.
                                    </li>
                                    <li>
                                        <strong>Требуют внимания</strong> — IP, deviceId, cookie,
                                        геолокация. PII в контексте персональных сущностей.
                                    </li>
                                    <li>
                                        <strong>Косвенно</strong> — внутренние id, квази-идентификаторы.
                                        PII в комбинации с другими данными.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Категории">
                                <HelpList>
                                    <li>
                                        <strong>Идентичность</strong> — ФИО, дата рождения.
                                    </li>
                                    <li>
                                        <strong>Контакты</strong> — email, телефон, адрес.
                                    </li>
                                    <li>
                                        <strong>Документы</strong> — паспорт, ИНН, СНИЛС, SSN,
                                        водительские права.
                                    </li>
                                    <li>
                                        <strong>Финансовые</strong> — карты, счета, IBAN, CVV.
                                    </li>
                                    <li>
                                        <strong>Биометрия</strong> — отпечатки, лицо, голос.
                                    </li>
                                    <li>
                                        <strong>Спецкатегории</strong> — здоровье, религия, политика,
                                        этничность, сексуальная ориентация.
                                    </li>
                                    <li>
                                        <strong>Локация</strong> — геолокация, город, регион.
                                    </li>
                                    <li>
                                        <strong>Технические</strong> — IP, deviceId, cookie,
                                        внутренние id.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Регуляции">
                                <HelpText>
                                    По каждому совпадению показывается нормативная база —
                                    под какой статьёй GDPR / 152-ФЗ / PCI DSS оно подпадает.
                                    В верхней части экрана — общая сводка по регуляциям.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>GDPR Art. 9</strong> — спецкатегории, требуют
                                        явного согласия.
                                    </li>
                                    <li>
                                        <strong>GDPR Art. 4</strong> — общее определение
                                        персональных данных.
                                    </li>
                                    <li>
                                        <strong>152-ФЗ</strong> — российское законодательство о
                                        персональных данных.
                                    </li>
                                    <li>
                                        <strong>PCI DSS</strong> — карточные данные (PAN, CVV).
                                        Запрещено хранить в открытом виде.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Композиция — важнее, чем кажется">
                                <HelpText>
                                    Комбинация PII-атрибутов в одной сущности даёт больше риска,
                                    чем каждый по отдельности. Даже «безобидный» набор
                                    (имя + дата рождения + адрес) позволяет деанонимизировать
                                    человека. Поэтому в карточке сущности показывается badge с
                                    количеством PII-атрибутов у неё.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        Клик по hit → раскрытие, в котором видны все
                                        PII-атрибуты той же сущности.
                                    </li>
                                    <li>
                                        Группировка «По сущности» — сортирует по количеству
                                        спецкатегорий и общему числу PII.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Игнорирование (false positive)">
                                <HelpText>
                                    Эвристика по именам не идеальна. Например, <code>name</code> в
                                    сущности <code>Product</code> — не PII, а в{" "}
                                    <code>Employee</code> — да. Нажмите <strong>«Не PII»</strong>{" "}
                                    в раскрытой карточке, чтобы исключить атрибут из списка.
                                    Решение сохраняется в браузере.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        «Показать игнорированные» в тулбаре — вернуть их в список
                                        (для проверки или возврата).
                                    </li>
                                    <li>
                                        «Вернуть все игнорированные» в подвале списка — сбросить
                                        все решения.
                                    </li>
                                    <li>
                                        Группировка «По категории» / «По домену» даёт кнопку
                                        «игнорировать всю группу» — удобно, когда весь
                                        <code>Product</code> домен — false positive.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Фильтры и группировка">
                                <HelpList>
                                    <li>
                                        <strong>Severity</strong> — 4 severity-карточки в KPI,
                                        кликабельные.
                                    </li>
                                    <li>
                                        <strong>Категория</strong> — chips над списком.
                                    </li>
                                    <li>
                                        <strong>Домен</strong> — из byDomain или выпадающего
                                        списка.
                                    </li>
                                    <li>
                                        <strong>Поиск</strong> — по attributeId, имени, домену,
                                        reason, note.
                                    </li>
                                    <li>
                                        <strong>Группировка</strong> — severity / категория /
                                        домен / сущность / плоский.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Экспорт">
                                <HelpList>
                                    <li>
                                        <strong>CSV</strong> — для BI / Excel. Фильтры
                                        применяются. Колонка composition_count.
                                    </li>
                                    <li>
                                        <strong>JSON</strong> — машинно-читаемо. Полные данные
                                        hit + stats + regulations.
                                    </li>
                                    <li>
                                        <strong>MD</strong> — формальный отчёт для DPO. Группировка
                                        по severity, сводка, рекомендации, разбивка по доменам и
                                        категориям.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Детектор — эвристический. Срабатывает по именам атрибутов
                                        и контексту сущности. <strong>Не является юридическим
                                            заключением</strong> — требуется валидация DPO.
                                    </li>
                                    <li>
                                        Не детектирует PII в значениях (только в именах
                                        атрибутов). Например, в <code>description</code> может
                                        быть телефон, но это не будет найдено.
                                    </li>
                                    <li>
                                        Игнорирование хранится в localStorage — сбрасывается при
                                        очистке браузера. Не синхронизируется между устройствами.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {!showHelp && (
                            <>
                                {/* ── KPI ── */}
                                <div className="pii-kpi">
                                    <div
                                        className={
                                            "pii-risk-card pii-risk-card--" +
                                            stats.risk.grade.toLowerCase()
                                        }
                                        title={`Risk score ${stats.risk.score}/100`}
                                    >
                                        <div className="pii-risk-card__score">{stats.risk.score}</div>
                                        <div className="pii-risk-card__grade">
                                            {stats.risk.grade}
                                        </div>
                                        <div className="pii-risk-card__label">PII Risk</div>
                                        <div className="pii-risk-card__sub">
                                            {stats.entitiesCount} сущностей · {stats.domainsCount} доменов
                                        </div>
                                    </div>

                                    {SEVERITY_ORDER.map((s) => {
                                        const isActive = filterSeverity === s;
                                        const count = stats.bySeverity[s];
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                className={
                                                    "pii-kpi-card pii-kpi-card--" +
                                                    s +
                                                    (isActive ? " active" : "")
                                                }
                                                onClick={() =>
                                                    setFilterSeverity(isActive ? "all" : s)
                                                }
                                                disabled={count === 0}
                                            >
                                                <div className="pii-kpi-card__value">{count}</div>
                                                <div className="pii-kpi-card__label">
                                                    {SEVERITY_LABELS[s]}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* ── Regulations ── */}
                                {regulations.length > 0 && (
                                    <div className="pii-regulations">
                                        <span className="pii-regulations__title">
                                            <MIcon name="gavel" size="sm" />
                                            Регуляции
                                        </span>
                                        {regulations.map((r) => (
                                            <span key={r.label} className="pii-regulation-chip">
                                                {r.label}
                                                <span className="pii-regulation-chip__count">
                                                    {r.count}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* ── Toolbar ── */}
                                <div className="pii-toolbar">
                                    <div className="pii-toolbar__quick">
                                        {(
                                            Object.keys(CATEGORY_LABELS) as PiiCategory[]
                                        ).map((c) => {
                                            const count = stats.byCategory[c];
                                            if (count === 0) return null;
                                            const active = filterCategory === c;
                                            return (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    className={
                                                        "pii-category-chip" + (active ? " active" : "")
                                                    }
                                                    onClick={() =>
                                                        setFilterCategory(active ? "all" : c)
                                                    }
                                                >
                                                    <MIcon name={CATEGORY_ICONS[c]} size="sm" />
                                                    {CATEGORY_LABELS[c]}
                                                    <span className="pii-category-chip__count">
                                                        {count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="pii-toolbar__right">
                                        <div className="pii-search">
                                            <MIcon name="search" size="sm" />
                                            <input
                                                type="text"
                                                placeholder="Поиск по атрибуту, домену, note…"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                spellCheck={false}
                                            />
                                            {query && (
                                                <button
                                                    className="pii-search__clear"
                                                    onClick={() => setQuery("")}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        {allDomains.length > 1 && (
                                            <select
                                                className="pii-select"
                                                value={filterDomain}
                                                onChange={(e) => setFilterDomain(e.target.value)}
                                            >
                                                <option value="">Все домены ({allDomains.length})</option>
                                                {allDomains.map(([d, c]) => (
                                                    <option key={d} value={d.toLowerCase()}>
                                                        {d} ({c})
                                                    </option>
                                                ))}
                                            </select>
                                        )}

                                        <select
                                            className="pii-select"
                                            value={groupMode}
                                            onChange={(e) =>
                                                setGroupMode(e.target.value as GroupMode)
                                            }
                                        >
                                            <option value="severity">По severity</option>
                                            <option value="category">По категории</option>
                                            <option value="domain">По домену</option>
                                            <option value="entity">По сущности</option>
                                            <option value="flat">Плоский список</option>
                                        </select>

                                        {hasFilters && (
                                            <button
                                                className="pii-toolbar__reset"
                                                onClick={resetFilters}
                                                title="Сбросить фильтры"
                                            >
                                                <MIcon name="filter_alt_off" size="sm" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ── Ignored toggle ── */}
                                {ignored.size > 0 && (
                                    <div className="pii-ignored-bar">
                                        <label className="pii-ignored-toggle">
                                            <input
                                                type="checkbox"
                                                checked={showIgnored}
                                                onChange={() => setShowIgnored(!showIgnored)}
                                            />
                                            Показать игнорированные ({ignored.size})
                                        </label>
                                        <button
                                            className="pii-ignored-clear"
                                            onClick={clearAllIgnored}
                                        >
                                            Вернуть все
                                        </button>
                                    </div>
                                )}

                                {/* ── Content ── */}
                                <div className="pii-content">
                                    {visibleHits.length === 0 ? (
                                        <div className="pii-empty">
                                            {allHits.length === 0 ? (
                                                <>
                                                    <MIcon
                                                        name="verified_user"
                                                        size="xl"
                                                        style={{ color: "var(--success)" }}
                                                    />
                                                    <div className="pii-empty__title">
                                                        PII-атрибутов не обнаружено
                                                    </div>
                                                    <div className="pii-empty__hint">
                                                        Эвристика не нашла подозрительных имён. Если вы
                                                        уверены, что PII есть — проверьте вручную или
                                                        расширьте список правил.
                                                    </div>
                                                </>
                                            ) : hasFilters ? (
                                                <>
                                                    <MIcon name="filter_alt_off" size="xl" />
                                                    <div className="pii-empty__title">
                                                        Ничего не найдено по фильтрам
                                                    </div>
                                                    <button
                                                        className="btn"
                                                        onClick={resetFilters}
                                                        style={{ marginTop: 8 }}
                                                    >
                                                        Сбросить фильтры
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <MIcon name="visibility_off" size="xl" />
                                                    <div className="pii-empty__title">
                                                        Все PII помечены как «не PII»
                                                    </div>
                                                    <button
                                                        className="btn"
                                                        onClick={clearAllIgnored}
                                                        style={{ marginTop: 8 }}
                                                    >
                                                        Вернуть игнорированные
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        grouped.map((group) => (
                                            <div key={group.key} className="pii-group">
                                                <div
                                                    className="pii-group__head"
                                                    style={{ borderLeftColor: group.color }}
                                                >
                                                    <MIcon name={group.icon} size="sm" />
                                                    <span className="pii-group__title">{group.label}</span>
                                                    <span className="pii-group__count">
                                                        {group.hits.length}
                                                    </span>
                                                    {group.bulkIgnore && (
                                                        <button
                                                            className="pii-group__bulk"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                group.bulkIgnore!();
                                                            }}
                                                            title={`Пометить все в группе как «не PII»`}
                                                        >
                                                            <MIcon name="block" size="sm" />
                                                            Игнорировать группу
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="pii-group__body">
                                                    {group.hits.map((h) => (
                                                        <HitCard
                                                            key={h.key}
                                                            hit={h}
                                                            isExpanded={expandedHits.has(h.key)}
                                                            isIgnored={ignored.has(h.key)}
                                                            siblingHits={byEntity.get(h.entityFqid) || [h]}
                                                            onToggle={() => toggleHit(h.key)}
                                                            onIgnore={() => ignoreHit(h.key)}
                                                            onUnignore={() => unignoreHit(h.key)}
                                                            onOpenEntity={() => openEntity(h.entityFqid)}
                                                            onOpenYaml={() => openYaml(h.entityFqid)}
                                                            onOpenDomainSchema={openDomainSchema}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}