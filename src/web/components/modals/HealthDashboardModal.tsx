import React, { useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useOutdatedDomains } from "../../hooks/useOutdatedDomains";
import { MIcon } from "../common/MIcon";
import { readRemoteInfo } from "../../state/initial";
import { relativeTimeShort } from "../../lib/format";
import { openFileInEditor } from "../../lib/open-file";
import type { ModelIndex } from "../../../shared/model-types";
import type { RFNode } from "../../lib/types";
import type { OutdatedDomain } from "../../../core/remote/outdated-check";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpCard,
    HelpZones,
    HelpZone,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { computeRecommendations, Recommendation } from "../../lib/model/recommendations";

// ============ Grade ============

type Grade = "A" | "B" | "C" | "D" | "E";

function computeGrade(score: number): Grade {
    if (score >= 90) return "A";
    if (score >= 75) return "B";
    if (score >= 60) return "C";
    if (score >= 40) return "D";
    return "E";
}

// ============ Row shape ============

interface SonarBreakdownItem {
    category: string;
    label: string;
    score: number;
    issueCount: number;
}

interface TopProblemEntity {
    entityFqid: string;
    entityId: string;
    issueCount: number;
}

interface DomainHealthRow {
    domainId: string;
    name: string;
    version: string;
    author: string;
    tags: string[];

    // размер
    entityCount: number;
    attributeCount: number;
    linkageCount: number;
    dataTypeCount: number;
    mixinCount: number;
    viewsCount: number;
    actionsCount: number;
    dataRulesCount: number;

    // качество
    lintScore: number | null;
    lintGrade: string | null;
    lintIssueCount: number;
    lintErrorCount: number;
    lintWarningCount: number;
    piiHitCount: number;
    piiCriticalCount: number;

    // структурные проблемы
    cyclesCount: number;
    brokenRefsCount: number;
    orphanEntitiesCount: number;
    attributesWithoutViewsCount: number;
    mixinConflictsCount: number;

    // martin
    martinZone: "pain" | "uselessness" | "main-sequence" | "unclassified" | null;
    martinDistance: number | null;
    martinInstability: number | null;
    martinAbstractness: number | null;
    martinCa: number | null;
    martinCe: number | null;

    // интегральные
    healthScore: number;
    healthGrade: Grade;
    problemCount: number;

    // файл
    fileSize: number | null;
    updatedAt: string | null;
    updatedAtSource: "graphql" | "fs" | null;
    filePath: string | null;

    // outdated
    isOutdated: boolean;
    outdatedInfo: OutdatedDomain | null;

    // детали для раскрытия
    sonarBreakdown: SonarBreakdownItem[];
    piiBySeverity: { critical: number; high: number; medium: number; low: number };
    topProblemEntities: TopProblemEntity[];
}

// ============ Sorting ============

type SortKey =
    | "name"
    | "entities"
    | "attributes"
    | "linkages"
    | "views"
    | "actions"
    | "dataTypes"
    | "mixins"
    | "health"
    | "lintScore"
    | "lintIssues"
    | "pii"
    | "piiCritical"
    | "problems"
    | "fileSize"
    | "updatedAt";

function getSortValue(
    r: DomainHealthRow,
    key: SortKey,
): number | string | null {
    switch (key) {
        case "name":
            return (r.name || r.domainId).toLowerCase();
        case "entities":
            return r.entityCount;
        case "attributes":
            return r.attributeCount;
        case "linkages":
            return r.linkageCount;
        case "views":
            return r.viewsCount;
        case "actions":
            return r.actionsCount;
        case "dataTypes":
            return r.dataTypeCount;
        case "mixins":
            return r.mixinCount;
        case "health":
            return r.healthScore;
        case "lintScore":
            return r.lintScore;
        case "lintIssues":
            return r.lintIssueCount;
        case "pii":
            return r.piiHitCount;
        case "piiCritical":
            return r.piiCriticalCount;
        case "problems":
            return r.problemCount;
        case "fileSize":
            return r.fileSize;
        case "updatedAt":
            return r.updatedAt ? new Date(r.updatedAt).getTime() : null;
        default:
            return null;
    }
}

function formatBytes(bytes: number | null): string {
    if (bytes == null) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024)
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// ============ Health scoring (per-domain) ============
// Простая, объяснимая формула: 100 минус штрафы за конкретные проблемы.
// Совпадает с логикой ProjectHealthSection, но per-domain.

function computeHealthScore(
    r: Pick<
        DomainHealthRow,
        | "lintErrorCount"
        | "lintWarningCount"
        | "piiCriticalCount"
        | "cyclesCount"
        | "brokenRefsCount"
        | "martinZone"
    >,
): number {
    let score = 100;
    score -= Math.min(r.lintErrorCount * 5, 30);
    score -= Math.min(r.lintWarningCount * 1, 20);
    score -= Math.min(r.piiCriticalCount * 3, 20);
    score -= Math.min(r.cyclesCount * 15, 20);
    score -= Math.min(r.brokenRefsCount * 5, 15);
    if (r.martinZone === "pain") score -= 10;
    if (r.martinZone === "uselessness") score -= 10;
    return Math.max(0, Math.min(100, Math.round(score)));
}

function countProblems(
    r: Pick<
        DomainHealthRow,
        | "lintErrorCount"
        | "lintWarningCount"
        | "piiCriticalCount"
        | "cyclesCount"
        | "brokenRefsCount"
        | "martinZone"
        | "orphanEntitiesCount"
        | "attributesWithoutViewsCount"
    >,
): number {
    let n = 0;
    if (r.lintErrorCount > 0) n++;
    if (r.lintWarningCount > 0) n++;
    if (r.piiCriticalCount > 0) n++;
    if (r.cyclesCount > 0) n++;
    if (r.brokenRefsCount > 0) n++;
    if (r.martinZone === "pain") n++;
    if (r.orphanEntitiesCount > 0) n++;
    if (r.attributesWithoutViewsCount > 5) n++;
    return n;
}

// ============ Aggregation ============

function buildDomainHealthRows(
    index: ModelIndex,
    nodes: RFNode[],
): DomainHealthRow[] {
    // ── entities + attributes ──
    const entitiesByDomain = new Map<string, number>();
    const attrsByDomain = new Map<string, number>();
    for (const e of index.entities) {
        entitiesByDomain.set(
            e.domainId,
            (entitiesByDomain.get(e.domainId) || 0) + 1,
        );
        attrsByDomain.set(
            e.domainId,
            (attrsByDomain.get(e.domainId) || 0) + e.attributes.length,
        );
    }

    // ── linkages / dataTypes / mixins ──
    const linkagesByDomain = new Map<string, number>();
    for (const l of index.entityLinkages) {
        linkagesByDomain.set(
            l.domainId,
            (linkagesByDomain.get(l.domainId) || 0) + 1,
        );
    }

    const dataTypesByDomain = new Map<string, number>();
    for (const dt of index.dataTypes) {
        dataTypesByDomain.set(
            dt.domainId,
            (dataTypesByDomain.get(dt.domainId) || 0) + 1,
        );
    }

    const mixinsByTargetDomain = new Map<string, number>();
    for (const e of index.entities) {
        const mixins = index.mixinsByEntityFqid[e.fqid] || [];
        if (mixins.length === 0) continue;
        const unique = new Set(mixins.map((m) => m.domainId + "#" + m.id));
        mixinsByTargetDomain.set(
            e.domainId,
            (mixinsByTargetDomain.get(e.domainId) || 0) + unique.size,
        );
    }

    // ── lint ──
    const lintIssuesByDomain = new Map<
        string,
        { total: number; error: number; warning: number }
    >();
    const lintIssuesByEntity = new Map<string, number>();
    for (const issue of index.lint.lintReport.issues) {
        let entry = lintIssuesByDomain.get(issue.domainId);
        if (!entry) {
            entry = { total: 0, error: 0, warning: 0 };
            lintIssuesByDomain.set(issue.domainId, entry);
        }
        entry.total++;
        if (issue.severity === "error") entry.error++;
        else if (issue.severity === "warning") entry.warning++;
        if (issue.entityFqid) {
            lintIssuesByEntity.set(
                issue.entityFqid,
                (lintIssuesByEntity.get(issue.entityFqid) || 0) + 1,
            );
        }
    }

    // ── PII (общее + по severity) ──
    const piiByDomain = new Map<
        string,
        {
            total: number;
            critical: number;
            high: number;
            medium: number;
            low: number;
        }
    >();
    for (const hit of index.pii.hits) {
        const domainId = hit.entityFqid.split("/")[0].toLowerCase();
        let entry = piiByDomain.get(domainId);
        if (!entry) {
            entry = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
            piiByDomain.set(domainId, entry);
        }
        entry.total++;
        entry[hit.severity]++;
    }

    // ── Martin ──
    const martinByDomain = new Map<
        string,
        {
            zone: DomainHealthRow["martinZone"];
            distance: number;
            instability: number;
            abstractness: number;
            ca: number;
            ce: number;
        }
    >();
    for (const m of index.martin.metrics) {
        martinByDomain.set(m.domainId, {
            zone: m.zone,
            distance: m.distance,
            instability: m.instability,
            abstractness: m.abstractness,
            ca: m.ca,
            ce: m.ce,
        });
    }

    // ── структурные проблемы ──
    const cyclesByDomain = new Map<string, number>();
    for (const fqid of index.stats.circularInheritance) {
        const d = fqid.split("/")[0];
        cyclesByDomain.set(d, (cyclesByDomain.get(d) || 0) + 1);
    }
    const brokenRefsByDomain = new Map<string, number>();
    for (const ref of index.stats.unknownReferences) {
        const d = ref.from.split("/")[0];
        brokenRefsByDomain.set(d, (brokenRefsByDomain.get(d) || 0) + 1);
    }
    const orphansByDomain = new Map<string, number>();
    for (const fqid of index.stats.orphanEntities) {
        const d = fqid.split("/")[0];
        orphansByDomain.set(d, (orphansByDomain.get(d) || 0) + 1);
    }
    const attrsNoViewsByDomain = new Map<string, number>();
    for (const a of index.stats.attributesWithoutViews) {
        const d = a.entityFqid.split("/")[0];
        attrsNoViewsByDomain.set(d, (attrsNoViewsByDomain.get(d) || 0) + 1);
    }
    const mixinConflictsByDomain = new Map<string, number>();
    for (const c of index.stats.mixinConflicts) {
        const d = c.targetFqid.split("/")[0];
        mixinConflictsByDomain.set(
            d,
            (mixinConflictsByDomain.get(d) || 0) + 1,
        );
    }

    // ── nodes (filePath, updatedAt, fileSize) ──
    const nodeByDomain = new Map<string, RFNode>();
    for (const n of nodes) {
        if (n.data?.domainId) {
            nodeByDomain.set(n.data.domainId.toLowerCase(), n);
        }
    }

    return index.domains.map<DomainHealthRow>((d) => {
        const domainIdLower = d.id.toLowerCase();
        const node = nodeByDomain.get(domainIdLower);
        const sonar = index.lint.sonar.byDomain[d.id];
        const lint = lintIssuesByDomain.get(d.id) || {
            total: 0,
            error: 0,
            warning: 0,
        };
        const pii = piiByDomain.get(domainIdLower) || {
            total: 0,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };
        const martin = martinByDomain.get(d.id) || null;
        const schema = index.schemasByDomain[d.id];

        // top-5 проблемных сущностей этого домена
        const domainPrefix = d.id.toLowerCase() + "/";
        const topProblemEntities: TopProblemEntity[] = [];
        lintIssuesByEntity.forEach((count, fqid) => {
            if (!fqid.toLowerCase().startsWith(domainPrefix)) return;
            topProblemEntities.push({
                entityFqid: fqid,
                entityId: fqid.split("/")[1] || fqid,
                issueCount: count,
            });
        });
        topProblemEntities.sort((a, b) => b.issueCount - a.issueCount);

        const draft: Omit<
            DomainHealthRow,
            "healthScore" | "healthGrade" | "problemCount"
        > = {
            domainId: d.id,
            name: d.name,
            version: d.version,
            author: d.author,
            tags: d.tags,
            entityCount: entitiesByDomain.get(d.id) || 0,
            attributeCount: attrsByDomain.get(d.id) || 0,
            linkageCount: linkagesByDomain.get(d.id) || 0,
            dataTypeCount: dataTypesByDomain.get(d.id) || 0,
            mixinCount: mixinsByTargetDomain.get(d.id) || 0,
            viewsCount: schema?.sections.views.count ?? 0,
            actionsCount: schema?.sections.actions.count ?? 0,
            dataRulesCount: schema?.sections.dataRules.count ?? 0,
            lintScore: sonar?.score ?? null,
            lintGrade: sonar?.grade ?? null,
            lintIssueCount: lint.total,
            lintErrorCount: lint.error,
            lintWarningCount: lint.warning,
            piiHitCount: pii.total,
            piiCriticalCount: pii.critical,
            cyclesCount: cyclesByDomain.get(d.id) || 0,
            brokenRefsCount: brokenRefsByDomain.get(d.id) || 0,
            orphanEntitiesCount: orphansByDomain.get(d.id) || 0,
            attributesWithoutViewsCount: attrsNoViewsByDomain.get(d.id) || 0,
            mixinConflictsCount: mixinConflictsByDomain.get(d.id) || 0,
            martinZone: martin?.zone ?? null,
            martinDistance: martin?.distance ?? null,
            martinInstability: martin?.instability ?? null,
            martinAbstractness: martin?.abstractness ?? null,
            martinCa: martin?.ca ?? null,
            martinCe: martin?.ce ?? null,
            fileSize:
                typeof node?.data?.fileSize === "number"
                    ? node.data.fileSize
                    : null,
            updatedAt: node?.data?.updatedAt || null,
            updatedAtSource: (node?.data?.updatedAtSource as any) || null,
            filePath: node?.data?.filePath || null,
            isOutdated: false,
            outdatedInfo: null,
            sonarBreakdown: (sonar?.breakdown || []).map((b) => ({
                category: b.category,
                label: b.label,
                score: b.score,
                issueCount: b.issueCount,
            })),
            piiBySeverity: {
                critical: pii.critical,
                high: pii.high,
                medium: pii.medium,
                low: pii.low,
            },
            topProblemEntities: topProblemEntities.slice(0, 5),
        };

        const healthScore = computeHealthScore(draft);
        return {
            ...draft,
            healthScore,
            healthGrade: computeGrade(healthScore),
            problemCount: countProblems(draft),
        };
    });
}

// ============ CSV ============

function exportCSV(rows: DomainHealthRow[]): void {
    const header = [
        "domain",
        "name",
        "version",
        "author",
        "tags",
        "entities",
        "attributes",
        "linkages",
        "views",
        "actions",
        "dataTypes",
        "dataRules",
        "mixins",
        "healthScore",
        "healthGrade",
        "problemCount",
        "lintScore",
        "lintGrade",
        "lintIssues",
        "lintErrors",
        "lintWarnings",
        "pii",
        "piiCritical",
        "cycles",
        "brokenRefs",
        "orphanEntities",
        "attributesWithoutViews",
        "martinZone",
        "martinDistance",
        "fileSize",
        "updatedAt",
        "isOutdated",
    ];
    const lines: string[] = [header.join(",")];
    for (const r of rows) {
        const cell = (v: any): string => {
            if (v == null) return "";
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        lines.push(
            [
                cell(r.domainId),
                cell(r.name),
                cell(r.version),
                cell(r.author),
                cell(r.tags.join("; ")),
                r.entityCount,
                r.attributeCount,
                r.linkageCount,
                r.viewsCount,
                r.actionsCount,
                r.dataTypeCount,
                r.dataRulesCount,
                r.mixinCount,
                r.healthScore,
                r.healthGrade,
                r.problemCount,
                r.lintScore ?? "",
                r.lintGrade ?? "",
                r.lintIssueCount,
                r.lintErrorCount,
                r.lintWarningCount,
                r.piiHitCount,
                r.piiCriticalCount,
                r.cyclesCount,
                r.brokenRefsCount,
                r.orphanEntitiesCount,
                r.attributesWithoutViewsCount,
                r.martinZone ?? "",
                r.martinDistance != null ? r.martinDistance.toFixed(2) : "",
                r.fileSize ?? "",
                cell(r.updatedAt),
                r.isOutdated ? "yes" : "",
            ].join(","),
        );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domains-health-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ============ Quick filters ============

type QuickFilter =
    | "problems"
    | "lint-errors"
    | "pii-critical"
    | "pain-zone"
    | "cycles"
    | "broken-refs";

const QUICK_FILTERS: Array<{
    id: QuickFilter;
    label: string;
    icon: string;
    test: (r: DomainHealthRow) => boolean;
}> = [
        {
            id: "problems",
            label: "С проблемами",
            icon: "warning",
            test: (r) => r.problemCount > 0,
        },
        {
            id: "lint-errors",
            label: "Lint errors",
            icon: "error",
            test: (r) => r.lintErrorCount > 0,
        },
        {
            id: "pii-critical",
            label: "PII critical",
            icon: "shield_lock",
            test: (r) => r.piiCriticalCount > 0,
        },
        {
            id: "pain-zone",
            label: "Зона боли",
            icon: "favorite",
            test: (r) => r.martinZone === "pain",
        },
        {
            id: "cycles",
            label: "Циклы",
            icon: "cycle",
            test: (r) => r.cyclesCount > 0,
        },
        {
            id: "broken-refs",
            label: "Битые ссылки",
            icon: "link_off",
            test: (r) => r.brokenRefsCount > 0,
        },
    ];

// ============ KPI Card ============

function KpiCard({
    label,
    value,
    sub,
    severity,
    icon,
    title,
}: {
    label: string;
    value: number | string;
    sub?: string;
    severity: "ok" | "warn" | "err" | "neutral";
    icon?: string;
    title?: string;
}) {
    return (
        <div className={"health-kpi-card health-kpi-card--" + severity} title={title}>
            {icon && <MIcon name={icon} size="sm" />}
            <div className="health-kpi-card__value">{value}</div>
            <div className="health-kpi-card__label">{label}</div>
            {sub && <div className="health-kpi-card__sub">{sub}</div>}
        </div>
    );
}

// ============ Main component ============

export function HealthDashboardModal() {
    const open = useGraphStore((s) => s.healthDashboardOpen);
    const nodes = useGraphStore((s) => s.nodes);
    const { index, loading, error } = useModelIndex();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const [showHelp, setShowHelp] = useState(false);

    useHelpEscape(open, showHelp, setShowHelp);

    const {
        outdated,
        checking,
        error: checkError,
        lastCheckedAt,
        available,
        check,
    } = useOutdatedDomains(remoteInfo);

    const [sortBy, setSortBy] = useState<SortKey>("health");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [onlyOutdated, setOnlyOutdated] = useState(false);
    const [query, setQuery] = useState("");
    const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(
        new Set(),
    );
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(key);
            setSortDir(key === "name" ? "asc" : "desc");
        }
    };

    const cacheAgeDays = useMemo<number | null>(() => {
        const fetchedAt = remoteInfo?.fetchedAt;
        if (!fetchedAt) return null;
        const age = Date.now() - new Date(fetchedAt).getTime();
        return Math.floor(age / (24 * 60 * 60 * 1000));
    }, [remoteInfo?.fetchedAt]);

    const rows = useMemo<DomainHealthRow[]>(() => {
        if (!index) return [];
        const base = buildDomainHealthRows(index, nodes);
        return base.map((r) => {
            const info = outdated.get(r.domainId.toLowerCase()) || null;
            return { ...r, isOutdated: !!info, outdatedInfo: info };
        });
    }, [index, nodes, outdated]);

    // ── KPI ──
    const kpi = useMemo(() => {
        const total = rows.length;
        const withProblems = rows.filter((r) => r.problemCount > 0).length;
        const totalEntities = rows.reduce((s, r) => s + r.entityCount, 0);
        const totalLintErrors = rows.reduce((s, r) => s + r.lintErrorCount, 0);
        const totalPiiCritical = rows.reduce(
            (s, r) => s + r.piiCriticalCount,
            0,
        );
        const painZone = rows.filter((r) => r.martinZone === "pain").length;
        const withCycles = rows.filter((r) => r.cyclesCount > 0).length;
        const avgHealth =
            total > 0
                ? rows.reduce((s, r) => s + r.healthScore, 0) / total
                : 0;
        return {
            total,
            withProblems,
            totalEntities,
            totalLintErrors,
            totalPiiCritical,
            painZone,
            withCycles,
            avgHealth: Math.round(avgHealth),
            avgGrade: computeGrade(avgHealth),
        };
    }, [rows]);

    const toggleQuickFilter = useCallback((id: QuickFilter) => {
        setQuickFilters((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleExpanded = useCallback((domainId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(domainId)) next.delete(domainId);
            else next.add(domainId);
            return next;
        });
    }, []);

    const sortedRows = useMemo(() => {
        let filtered = rows;
        if (onlyOutdated) filtered = filtered.filter((r) => r.isOutdated);
        const q = query.trim().toLowerCase();
        if (q) {
            filtered = filtered.filter(
                (r) =>
                    r.domainId.toLowerCase().includes(q) ||
                    r.name.toLowerCase().includes(q) ||
                    r.author.toLowerCase().includes(q) ||
                    r.tags.some((t) => t.toLowerCase().includes(q)),
            );
        }
        if (quickFilters.size > 0) {
            const tests = Array.from(quickFilters).map(
                (id) => QUICK_FILTERS.find((f) => f.id === id)!.test,
            );
            filtered = filtered.filter((r) => tests.every((t) => t(r)));
        }
        return filtered.slice().sort((a, b) => {
            const av = getSortValue(a, sortBy);
            const bv = getSortValue(b, sortBy);
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (av < bv) return sortDir === "asc" ? -1 : 1;
            if (av > bv) return sortDir === "asc" ? 1 : -1;
            return 0;
        });
    }, [rows, sortBy, sortDir, onlyOutdated, query, quickFilters]);

    const openSchema = (domainId: string) => {
        const st = useGraphStore.getState();
        st.setDomainSchemaDomainId(domainId);
        st.setDomainSchemaOpen(true);
    };

    const openLint = () => {
        useGraphStore.getState().setLintOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setHealthDashboardOpen(false)}
        >
            <div
                className="help-modal health-dashboard-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="dashboard" size="sm" />
                        <span className="icon-label">Health Dashboard</span>
                        {index && (
                            <span className="help-modal__badge">
                                {kpi.total} доменов · {kpi.totalEntities} сущностей
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как читать?"
                        />
                        {available && (
                            <button
                                className={"btn" + (checking ? " btn--active" : "")}
                                onClick={() => check(true)}
                                disabled={checking}
                                title={
                                    lastCheckedAt
                                        ? `Проверено ${new Date(lastCheckedAt).toLocaleString("ru-RU")}`
                                        : "Запросить у сервера актуальные updatedAt доменов"
                                }
                            >
                                <MIcon
                                    name={checking ? "hourglass_top" : "refresh"}
                                    size="sm"
                                />
                                {checking ? "Проверка…" : "Проверить обновления"}
                            </button>
                        )}
                        <button
                            className="btn"
                            onClick={() => exportCSV(sortedRows)}
                            disabled={sortedRows.length === 0}
                            title="Скачать CSV с текущей сортировкой и фильтрами"
                        >
                            <MIcon name="download" size="sm" />
                            CSV
                        </button>
                        <button
                            className="help-modal__close"
                            onClick={() =>
                                useGraphStore.getState().setHealthDashboardOpen(false)
                            }
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

                {index && (
                    <div className="help-modal__body help-modal__body--flush">
                        {/* ============ Banners ============ */}
                        {outdated.size > 0 && (
                            <div className="health-banner health-banner--warn">
                                <MIcon name="update" size="sm" />
                                <span>
                                    <strong>{outdated.size}</strong>{" "}
                                    {outdated.size === 1 ? "домен" : "доменов"}{" "}
                                    обновлено на сервере — запустите{" "}
                                    <code>--refresh</code>, чтобы получить
                                    актуальные данные.
                                </span>
                                <button
                                    type="button"
                                    className={
                                        "health-banner__action" +
                                        (onlyOutdated
                                            ? " health-banner__action--active"
                                            : "")
                                    }
                                    onClick={() => setOnlyOutdated((v) => !v)}
                                    title={
                                        onlyOutdated
                                            ? "Сбросить фильтр «только устаревшие»"
                                            : "Показать только домены, обновлённые на сервере"
                                    }
                                >
                                    <MIcon
                                        name={
                                            onlyOutdated
                                                ? "filter_alt_off"
                                                : "filter_alt"
                                        }
                                        size="sm"
                                    />
                                    {onlyOutdated ? "Показать все" : "Показать только их"}
                                </button>
                            </div>
                        )}

                        {checkError && (
                            <div className="health-banner health-banner--error">
                                <MIcon name="error" size="sm" />
                                <span>Проверка обновлений: {checkError}</span>
                            </div>
                        )}

                        {available &&
                            cacheAgeDays != null &&
                            cacheAgeDays >= 1 &&
                            outdated.size === 0 && (
                                <div
                                    className={
                                        "health-banner " +
                                        (cacheAgeDays >= 7
                                            ? "health-banner--error"
                                            : "health-banner--warn")
                                    }
                                >
                                    <MIcon name="schedule" size="sm" />
                                    <span>
                                        Кэш получен{" "}
                                        {cacheAgeDays === 1
                                            ? "день"
                                            : `${cacheAgeDays} дн`}{" "}
                                        назад
                                        {cacheAgeDays >= 7 && " — вероятно, устарел"}.
                                    </span>
                                </div>
                            )}

                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Сводная таблица по всем доменам модели: размер, качество схемы,
                                    PII-риски, архитектурные метрики. Помогает быстро найти
                                    проблемные домены и приоритизировать, что чинить первым.
                                </HelpText>
                                <HelpText>
                                    Каждая метрика — <strong>сигнал</strong>, а не приговор. Разные
                                    проекты имеют разный baseline: если у вас 200 доменов и 3 в
                                    зоне боли — это норма; если 20 доменов и 3 в зоне боли —
                                    проблема системная.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Health score — как считается">
                                <HelpText>
                                    Интегральная оценка домена от 0 до 100. Формула простая и
                                    объяснимая: стартуем с 100 и вычитаем штрафы за конкретные
                                    проблемы. Каждый штраф имеет потолок, чтобы одна проблема
                                    не «съедала» всю оценку.
                                </HelpText>
                                <HelpCard title="Формула" formula="score = 100 − Σ штрафов" wide>
                                    <HelpList>
                                        <li>
                                            <code>− min(lintErrors × 5, 30)</code> — ошибки линтера,
                                            до −30
                                        </li>
                                        <li>
                                            <code>− min(lintWarnings × 1, 20)</code> —
                                            предупреждения, до −20
                                        </li>
                                        <li>
                                            <code>− min(piiCritical × 3, 20)</code> — PII
                                            спецкатегории, до −20
                                        </li>
                                        <li>
                                            <code>− min(cycles × 15, 20)</code> — циклы
                                            наследования, до −20
                                        </li>
                                        <li>
                                            <code>− min(brokenRefs × 5, 15)</code> — битые FQID-ссылки,
                                            до −15
                                        </li>
                                        <li>
                                            <code>− 10</code> если домен в зоне боли (
                                            <em>pain</em>), <code>− 10</code> если в зоне
                                            бесполезности (<em>uselessness</em>)
                                        </li>
                                    </HelpList>
                                    <HelpText>
                                        Оценка округляется до целого и зажимается в{" "}
                                        <code>[0, 100]</code>. Один домен с 6 lint-ошибками и без
                                        циклов получит <code>100 − 30 = 70</code>. Домен с 2 циклами
                                        и 5 PII critical получит{" "}
                                        <code>100 − 20 − 15 = 65</code>.
                                    </HelpText>
                                </HelpCard>
                                <HelpText>
                                    <strong>Sonar ≠ Health.</strong> Sonar — это оценка{" "}
                                    <em>только по линтеру</em>. Health учитывает ещё PII, циклы,
                                    битые ссылки и Martin. Домен с идеальным Sonar может иметь
                                    низкий Health из-за PII или циклов.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Уровни A–E">
                                <HelpZones>
                                    <HelpZone color="green" title="A — 90+">
                                        Отлично. Ни одной проблемы или только мелкие предупреждения.
                                    </HelpZone>
                                    <HelpZone color="green" title="B — 75–89">
                                        Хорошо. Единичные предупреждения, критичных проблем нет.
                                    </HelpZone>
                                    <HelpZone color="orange" title="C — 60–74">
                                        Удовлетворительно. Требует внимания: есть warnings или 1–2
                                        серьёзных пункта.
                                    </HelpZone>
                                    <HelpZone color="red" title="D — 40–59">
                                        Плохо. Ошибки или несколько структурных проблем.
                                    </HelpZone>
                                    <HelpZone color="red" title="E — 0–39">
                                        Критично. Много ошибок, PII critical, циклы или
                                        одновременно несколько проблем.
                                    </HelpZone>
                                </HelpZones>
                            </HelpSection>

                            <HelpSection title="Карточки KPI сверху">
                                <HelpList>
                                    <li>
                                        <strong>Доменов</strong> — всего в модели. Подпись «N с
                                        проблемами» — сколько имеют хоть одну из 8 проблемных
                                        метрик.
                                    </li>
                                    <li>
                                        <strong>Средний Health</strong> — арифметическое среднее
                                        healthScore по всем доменам. Grade — тот же, что у
                                        отдельного домена. Общий «здоровый ли проект».
                                    </li>
                                    <li>
                                        <strong>Lint errors</strong> — сумма lint-ошибок по всем
                                        доменам. Ноль — идеал; больше 20 — что-то системно не так
                                        в модели или правилах.
                                    </li>
                                    <li>
                                        <strong>PII critical</strong> — сумма PII-атрибутов
                                        спецкатегорий (GDPR Art. 9 / 152-ФЗ спецкатегория).
                                        Регуляторный риск, даже если схема «чистая».
                                    </li>
                                    <li>
                                        <strong>В зоне боли</strong> — сколько доменов Мартин
                                        относит к pain zone. Подпись «N с циклами» — сколько
                                        доменов имеют циклы в наследовании.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Колонки таблицы">
                                <HelpList>
                                    <li>
                                        <strong>Domain</strong> — FQDN домена, имя, версия, теги.
                                        Клик — открыть схему. Бейдж <code>new</code> — домен
                                        обновлён на сервере, кэш устарел (см. «Проверить
                                        обновления»).
                                    </li>
                                    <li>
                                        <strong>Health</strong> — score + grade. Основной столбец
                                        для сортировки «что чинить первым».
                                    </li>
                                    <li>
                                        <strong>Prob</strong> — сколько из 8 проблемных метрик
                                        ненулевые: lint errors, lint warnings, PII critical,
                                        циклы, битые ссылки, зона боли, сироты, атрибуты без
                                        views. 0 — идеально, 3+ — «швейцарский сыр».
                                    </li>
                                    <li>
                                        <strong>Ent / Attr / Lnk / Vw / Act / Types / Mix</strong> —
                                        размер домена. Слишком много атрибутов на сущность (30+) —
                                        сигнал к декомпозиции; слишком мало views при большом
                                        числе сущностей — UI не успевает за моделью.
                                    </li>
                                    <li>
                                        <strong>Lint</strong> — Sonar-оценка и grade (A–E). Не
                                        путать с колонкой Health — здесь только линтер.
                                    </li>
                                    <li>
                                        <strong>Iss</strong> — количество lint-проблем. Подпись{" "}
                                        <code>· Ne</code> — сколько из них errors. Клик —
                                        открыть линтер.
                                    </li>
                                    <li>
                                        <strong>PII</strong> — <code>critical / всего</code>. Клик —
                                        открыть список PII с фильтром по этому домену.
                                    </li>
                                    <li>
                                        <strong>Martin</strong> — зона по метрикам Мартина:
                                        «боль» / «бесп.» (бесполезные абстракции) / «норма».
                                    </li>
                                    <li>
                                        <strong>Size / Updated</strong> — размер файла и время
                                        последнего обновления. Подпись <code>fs</code> — время
                                        взято с файловой системы (сервер не сообщил updatedAt).
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Раскрытие строки — детальная карточка">
                                <HelpText>
                                    Клик по <code>▸</code> в первой колонке раскрывает блок под
                                    строкой:
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Кнопки действий</strong> — Схема домена / Открыть
                                        YAML / Линтер / PII.
                                    </li>
                                    <li>
                                        <strong>Sonar breakdown</strong> — по каждой категории
                                        линтера: сколько проблем и оценка 0–100. Показывает, где
                                        именно «болит» (naming / required / reference /
                                        semantic / validation).
                                    </li>
                                    <li>
                                        <strong>PII по серьёзности</strong> — разбивка на 4 уровня:
                                        спецкатегории / высокая / средняя / косвенная. Для оценки
                                        регуляторного риска.
                                    </li>
                                    <li>
                                        <strong>Метрики Мартина</strong> — Ca (сколько доменов
                                        зависят от этого), Ce (от скольких зависит), I
                                        (instability), A (abstractness), D (distance от
                                        идеальной линии).
                                    </li>
                                    <li>
                                        <strong>Структурные проблемы</strong> — циклы, битые
                                        ссылки, сироты, атрибуты без views, конфликты миксинов.
                                        То, что не всегда ловит линтер.
                                    </li>
                                    <li>
                                        <strong>Топ-5 проблемных сущностей</strong> — конкретные
                                        entityId с числом проблем. Клик — открыть каталог на этой
                                        сущности.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Quick filters">
                                <HelpText>
                                    Chips под полем поиска фильтруют таблицу по типу проблемы.
                                    Работают по <strong>AND</strong> — можно нажать несколько,
                                    чтобы найти «в зоне боли И с PII critical». Chips без
                                    совпадений скрыты, чтобы не засорять интерфейс.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>С проблемами</strong> — Prob &gt; 0.
                                    </li>
                                    <li>
                                        <strong>Lint errors</strong> — есть хоть одна lint-ошибка.
                                    </li>
                                    <li>
                                        <strong>PII critical</strong> — есть PII спецкатегорий.
                                    </li>
                                    <li>
                                        <strong>Зона боли</strong> — Martin zone = pain.
                                    </li>
                                    <li>
                                        <strong>Циклы / Битые ссылки</strong> — структурные
                                        проблемы.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Зона боли и бесполезные абстракции">
                                <HelpText>
                                    Метрики Мартина измеряют <strong>связность</strong> и{" "}
                                    <strong>абстракцию</strong> домена. Идеал — стабильные домены
                                    абстрактны, нестабильные конкретны. Метрики показывают, где
                                    этот баланс нарушен.
                                </HelpText>
                                <HelpZones>
                                    <HelpZone color="green" title="✅ Главная последовательность">
                                        D &lt; 0.3. Баланс соблюдён — стабильное абстрактно,
                                        нестабильное конкретно.
                                    </HelpZone>
                                    <HelpZone color="red" title="🔴 Зона боли">
                                        A &lt; 0.3 и I &lt; 0.3. Стабильный и конкретный: от него
                                        зависят многие, но у него нет абстракций, чтобы меняться
                                        безопасно. Любая правка бьёт по потребителям.
                                    </HelpZone>
                                    <HelpZone color="orange" title="🟠 Бесполезные абстракции">
                                        A &gt; 0.7 и I &gt; 0.7. Абстрактный и нестабильный: много
                                        сущностей-родителей, но никто их не использует. Мёртвый
                                        код или недоделанный модуль.
                                    </HelpZone>
                                </HelpZones>
                            </HelpSection>

                            <HelpSection title="Проверить обновления и бейдж new">
                                <HelpText>
                                    Кнопка <strong>«Проверить обновления»</strong> идёт на сервер
                                    за актуальными метаданными доменов (updatedAt, version) и
                                    сравнивает с тем, что в кэше. Не тянет sourceCode — быстрая
                                    даже на сотнях доменов.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        Домены, у которых серверный updatedAt новее кэша или
                                        отличается version, получают бейдж <code>new</code>.
                                    </li>
                                    <li>
                                        Кнопка <strong>«Показать только их»</strong> в баннере
                                        фильтрует таблицу до устаревших.
                                    </li>
                                    <li>
                                        Чтобы обновить сами схемы — запустите <code>--refresh</code>{" "}
                                        на CLI или «Обновить кеш» в правом верхнем углу главного
                                        окна.
                                    </li>
                                    <li>
                                        Домены без бейджа — совпадают с сервером, ничего делать не
                                        нужно.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Что чинить первым — алгоритм">
                                <HelpText>
                                    Если вы открыли dashboard «с чистого листа», вот порядок
                                    приоритизации:
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>1. Lint errors и Циклы</strong> — фильтры
                                        «Lint errors» и «Циклы». Это структурные проблемы: циклы
                                        ломают наследование, ошибки — не дадут опубликовать схему.
                                    </li>
                                    <li>
                                        <strong>2. Битые ссылки</strong> — фильтр «Битые
                                        ссылки». Ссылки на несуществующие сущности → линтер
                                        ругается, но схема может опубликоваться. Чинить до
                                        публикации.
                                    </li>
                                    <li>
                                        <strong>3. PII critical</strong> — фильтр «PII critical».
                                        Регуляторный риск: GDPR Art. 9 / 152-ФЗ спецкатегория
                                        требуют отдельного согласия и защиты.
                                    </li>
                                    <li>
                                        <strong>4. Зона боли</strong> — фильтр «Зона боли».
                                        Архитектурный долг. Не срочно, но чем дольше тянете — тем
                                        дороже менять.
                                    </li>
                                    <li>
                                        <strong>5. Warnings, сироты, атрибуты без views</strong> —
                                        «Prob &gt; 0». Гигиена: не критично, но со временем
                                        накапливается и мешает читать схему.
                                    </li>
                                </HelpList>
                                <HelpText>
                                    Правило большого пальца: <strong>сначала всё, что красное</strong>{" "}
                                    (errors + PII critical), потом — что жёлтое (warnings +
                                    зона боли), потом — гигиена. Домены с grade{" "}
                                    <code>D</code> и <code>E</code> — в первую очередь.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Экспорт CSV">
                                <HelpText>
                                    Кнопка <strong>CSV</strong> в шапке выгружает таблицу с
                                    текущей сортировкой и фильтрами. Формат — для Excel / Google
                                    Sheets / BI.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        Колонки повторяют таблицу + расширенные:{" "}
                                        <code>dataRules</code>, <code>healthScore</code>,{" "}
                                        <code>healthGrade</code>, <code>problemCount</code>,{" "}
                                        <code>cycles</code>, <code>brokenRefs</code>,{" "}
                                        <code>orphanEntities</code>,{" "}
                                        <code>attributesWithoutViews</code>,{" "}
                                        <code>martinZone</code>, <code>martinDistance</code>.
                                    </li>
                                    <li>
                                        Фильтры и сортировка применяются до экспорта — что видите,
                                        то и скачаете.
                                    </li>
                                    <li>
                                        Кодировка UTF-8 BOM — открывается в Excel без пляшущих
                                        кракозябр.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Health score — эвристика. Он показывает паттерны, а не
                                        истину. Домен с низким score может быть в порядке, если
                                        это, например, «мусорный» домен или экспериментальный.
                                    </li>
                                    <li>
                                        Метрики Мартина считаются приближённо: сложность
                                        наследования = количество сущностей с наследниками.
                                        Настоящая abstractness в UML считается иначе.
                                    </li>
                                    <li>
                                        PII — эвристический детектор по именам атрибутов. Не
                                        является юридическим заключением. Требует валидации DPO.
                                    </li>
                                    <li>
                                        «Проверить обновления» сравнивает только метаданные
                                        (updatedAt, version). Если на сервере изменили sourceCode
                                        без повышения version — детект не сработает.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {/* ============ KPI ============ */}
                        <div className="health-kpi">
                            <KpiCard
                                icon="folder"
                                label="Доменов"
                                value={kpi.total}
                                sub={
                                    kpi.withProblems > 0
                                        ? `${kpi.withProblems} с проблемами`
                                        : "все в норме"
                                }
                                severity={
                                    kpi.withProblems > 0 ? "warn" : "ok"
                                }
                            />
                            <KpiCard
                                icon="monitor_heart"
                                label="Средний Health"
                                value={`${kpi.avgHealth} / ${kpi.avgGrade}`}
                                severity={
                                    kpi.avgGrade === "A" || kpi.avgGrade === "B"
                                        ? "ok"
                                        : kpi.avgGrade === "E"
                                            ? "err"
                                            : "warn"
                                }
                                title={
                                    "Среднее арифметическое Health score по всем доменам.\n" +
                                    "Формула Health: 100 − min(lintErrors×5, 30) − min(lintWarnings×1, 20) − min(piiCritical×3, 20) − min(cycles×15, 20) − min(brokenRefs×5, 15)\n\n" +
                                    "Подробнее — в справке «Как читать?»."
                                }
                            />
                            <KpiCard
                                icon="error"
                                label="Lint errors"
                                value={kpi.totalLintErrors}
                                severity={
                                    kpi.totalLintErrors > 0 ? "err" : "ok"
                                }
                            />
                            <KpiCard
                                icon="shield_lock"
                                label="PII critical"
                                value={kpi.totalPiiCritical}
                                severity={
                                    kpi.totalPiiCritical > 0 ? "err" : "ok"
                                }
                            />
                            <KpiCard
                                icon="favorite"
                                label="В зоне боли"
                                value={kpi.painZone}
                                sub={
                                    kpi.withCycles > 0
                                        ? `${kpi.withCycles} с циклами`
                                        : undefined
                                }
                                severity={kpi.painZone > 0 ? "warn" : "ok"}
                            />
                        </div>

                        {/* ============ Toolbar ============ */}
                        <div className="health-toolbar">
                            <div className="health-toolbar__search">
                                <MIcon name="search" size="sm" />
                                <input
                                    type="text"
                                    placeholder="Поиск по домену, имени, автору, тегам…"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    spellCheck={false}
                                />
                                {query && (
                                    <button
                                        className="health-toolbar__clear"
                                        onClick={() => setQuery("")}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <div className="health-quick-filters">
                                {QUICK_FILTERS.map((f) => {
                                    const active = quickFilters.has(f.id);
                                    const count = rows.filter(f.test).length;
                                    if (!active && count === 0) return null;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            className={
                                                "health-quick-filter" +
                                                (active
                                                    ? " health-quick-filter--active"
                                                    : "")
                                            }
                                            onClick={() => toggleQuickFilter(f.id)}
                                            title={`Показать только домены: ${f.label.toLowerCase()}`}
                                        >
                                            <MIcon name={f.icon} size="sm" />
                                            {f.label}
                                            <span className="health-quick-filter__count">
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="health-toolbar__stats">
                                <span>
                                    Показано <strong>{sortedRows.length}</strong> /{" "}
                                    {kpi.total}
                                </span>
                            </div>
                        </div>

                        <AutoRecommendationsCard index={index} />

                        {/* ============ Table ============ */}
                        <div className="health-table-wrap">
                            <table className="health-table">
                                <thead>
                                    <tr>
                                        <th className="health-table__expand-col"></th>
                                        <th
                                            onClick={() => handleSort("name")}
                                            className={sortBy === "name" ? "active" : ""}
                                        >
                                            Домен
                                            {sortBy === "name" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("health")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "health" ? " active" : "")
                                            }
                                            title="Интегральная оценка домена"
                                        >
                                            Health
                                            {sortBy === "health" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("problems")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "problems" ? " active" : "")
                                            }
                                            title={
                                                "Количество проблемных метрик (0–8):\n" +
                                                "· lint errors\n" +
                                                "· lint warnings\n" +
                                                "· PII critical\n" +
                                                "· циклы наследования\n" +
                                                "· битые FQID-ссылки\n" +
                                                "· зона боли (Martin)\n" +
                                                "· сироты\n" +
                                                "· >5 атрибутов без views\n\n" +
                                                "0 — идеально, 8 — всё плохо"
                                            }
                                        >
                                            Prob
                                            {sortBy === "problems" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("entities")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "entities" ? " active" : "")
                                            }
                                        >
                                            Ent
                                            {sortBy === "entities" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("attributes")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "attributes" ? " active" : "")
                                            }
                                        >
                                            Attr
                                            {sortBy === "attributes" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("linkages")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "linkages" ? " active" : "")
                                            }
                                        >
                                            Lnk
                                            {sortBy === "linkages" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("views")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "views" ? " active" : "")
                                            }
                                            title="Количество views"
                                        >
                                            Vw
                                            {sortBy === "views" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("actions")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "actions" ? " active" : "")
                                            }
                                            title="Количество actions"
                                        >
                                            Act
                                            {sortBy === "actions" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("dataTypes")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "dataTypes" ? " active" : "")
                                            }
                                        >
                                            Types
                                            {sortBy === "dataTypes" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("mixins")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "mixins" ? " active" : "")
                                            }
                                            title="Миксины, расширяющие сущности этого домена"
                                        >
                                            Mix
                                            {sortBy === "mixins" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("lintScore")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "lintScore" ? " active" : "")
                                            }
                                            title="Sonar-оценка домена"
                                        >
                                            Lint
                                            {sortBy === "lintScore" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("lintIssues")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "lintIssues" ? " active" : "")
                                            }
                                            title="Количество lint-проблем"
                                        >
                                            Iss
                                            {sortBy === "lintIssues" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("piiCritical")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "piiCritical" ? " active" : "")
                                            }
                                            title="PII: critical / всего"
                                        >
                                            PII
                                            {sortBy === "piiCritical" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            className="health-table__num"
                                            title="Martin zone"
                                        >
                                            Martin
                                        </th>
                                        <th
                                            onClick={() => handleSort("fileSize")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "fileSize" ? " active" : "")
                                            }
                                        >
                                            Size
                                            {sortBy === "fileSize" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th
                                            onClick={() => handleSort("updatedAt")}
                                            className={
                                                sortBy === "updatedAt" ? "active" : ""
                                            }
                                        >
                                            Updated
                                            {sortBy === "updatedAt" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
                                        </th>
                                        <th className="health-table__actions-col"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.map((r) => (
                                        <HealthRow
                                            key={r.domainId}
                                            row={r}
                                            isExpanded={expanded.has(r.domainId)}
                                            onToggle={toggleExpanded}
                                            onOpenSchema={openSchema}
                                            onOpenLint={openLint}
                                        />
                                    ))}
                                </tbody>
                            </table>

                            {sortedRows.length === 0 && (
                                <div className="health-empty">
                                    {onlyOutdated && outdated.size === 0
                                        ? "Нет устаревших доменов"
                                        : query
                                            ? `Ничего не найдено по запросу «${query}»`
                                            : quickFilters.size > 0
                                                ? "Нет доменов по выбранным фильтрам"
                                                : "Нет доменов"}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Row ============

const HealthRow = React.memo(function HealthRow({
    row,
    isExpanded,
    onToggle,
    onOpenSchema,
    onOpenLint,
}: {
    row: DomainHealthRow;
    isExpanded: boolean;
    onToggle: (id: string) => void;
    onOpenSchema: (id: string) => void;
    onOpenLint: () => void;
}) {
    const gradeClass = row.lintGrade
        ? "sonar-grade--" + row.lintGrade.toLowerCase()
        : "";

    const rowClass = [
        "health-row",
        row.isOutdated ? "health-row--outdated" : "",
        row.healthGrade === "D" || row.healthGrade === "E"
            ? "health-row--bad"
            : "",
        isExpanded ? "health-row--expanded" : "",
    ]
        .filter(Boolean)
        .join(" ");

    const healthGradeClass = "health-grade--" + row.healthGrade.toLowerCase();

    return (
        <>
            <tr className={rowClass}>
                <td className="health-row__expand-cell">
                    <button
                        type="button"
                        className="health-row__expand-btn"
                        onClick={() => onToggle(row.domainId)}
                        title={isExpanded ? "Свернуть" : "Развернуть детали"}
                    >
                        <MIcon
                            name={isExpanded ? "expand_more" : "chevron_right"}
                            size="sm"
                        />
                    </button>
                </td>
                <td className="health-row__domain">
                    <div className="health-row__domain-head">
                        <button
                            className="health-row__domain-id"
                            onClick={() => onOpenSchema(row.domainId)}
                            title="Открыть схему домена"
                        >
                            {row.domainId}
                        </button>
                        {row.isOutdated && (
                            <span
                                className="health-row__outdated-badge"
                                title={
                                    row.outdatedInfo
                                        ? `Сервер: ${row.outdatedInfo.serverUpdatedAt || "—"}\nКэш: ${row.outdatedInfo.cachedUpdatedAt || "—"}` +
                                        (row.outdatedInfo.serverVersion
                                            ? `\nv${row.outdatedInfo.cachedVersion || "?"} → v${row.outdatedInfo.serverVersion}`
                                            : "")
                                        : "Обновлён на сервере"
                                }
                            >
                                <MIcon name="update" size="sm" />
                                new
                            </span>
                        )}
                    </div>
                    {row.name && row.name !== row.domainId && (
                        <div className="health-row__domain-name">{row.name}</div>
                    )}
                    {row.version && (
                        <span className="health-row__version">v{row.version}</span>
                    )}
                    {row.tags.length > 0 && (
                        <div className="health-row__tags">
                            {row.tags.slice(0, 3).map((t) => (
                                <span key={t} className="health-row__tag">
                                    {t}
                                </span>
                            ))}
                            {row.tags.length > 3 && (
                                <span className="health-row__tag">
                                    +{row.tags.length - 3}
                                </span>
                            )}
                        </div>
                    )}
                </td>
                <td className="health-table__num">
                    <span className={"health-grade-badge " + healthGradeClass}>
                        {row.healthScore}
                        <span className="health-grade-badge__grade">
                            {row.healthGrade}
                        </span>
                    </span>
                </td>
                <td className="health-table__num">
                    {row.problemCount > 0 ? (
                        <span className="health-problem-count">
                            {row.problemCount}
                        </span>
                    ) : (
                        <span className="health-lint-ok">✓</span>
                    )}
                </td>
                <td className="health-table__num">{row.entityCount}</td>
                <td className="health-table__num">{row.attributeCount}</td>
                <td className="health-table__num">{row.linkageCount}</td>
                <td className="health-table__num">{row.viewsCount}</td>
                <td className="health-table__num">{row.actionsCount}</td>
                <td className="health-table__num">{row.dataTypeCount}</td>
                <td className="health-table__num">
                    {row.mixinCount > 0 ? row.mixinCount : "—"}
                </td>
                <td className="health-table__num">
                    {row.lintScore != null ? (
                        <span className={"health-lint-score " + gradeClass}>
                            {row.lintScore}
                            <span className="health-lint-score__grade">
                                {row.lintGrade}
                            </span>
                        </span>
                    ) : (
                        "—"
                    )}
                </td>
                <td className="health-table__num">
                    {row.lintIssueCount > 0 ? (
                        <button
                            className="health-lint-link"
                            onClick={() => onOpenLint()}
                            title={
                                `${row.lintErrorCount} errors / ${row.lintWarningCount} warnings\n` +
                                "Открыть линтер схем"
                            }
                        >
                            {row.lintIssueCount}
                            {row.lintErrorCount > 0 && (
                                <span className="health-lint-link__err">
                                    · {row.lintErrorCount}e
                                </span>
                            )}
                        </button>
                    ) : (
                        <span className="health-lint-ok">✓</span>
                    )}
                </td>
                <td className="health-table__num">
                    {row.piiHitCount > 0 ? (
                        <button
                            type="button"
                            className={
                                "health-pii health-pii--clickable" +
                                (row.piiCriticalCount > 0
                                    ? " health-pii--critical"
                                    : "")
                            }
                            onClick={(e) => {
                                e.stopPropagation();
                                useGraphStore
                                    .getState()
                                    .setPiiInitialDomain(row.domainId);
                                useGraphStore
                                    .getState()
                                    .setPiiInitialSeverity(null);
                                useGraphStore.getState().setPiiOpen(true);
                            }}
                            title={
                                `PII-атрибуты в домене ${row.domainId}\n` +
                                `critical: ${row.piiCriticalCount}\n` +
                                `всего: ${row.piiHitCount}\n\n` +
                                "Нажмите, чтобы открыть список с переходом к сущностям"
                            }
                        >
                            {row.piiCriticalCount > 0 && (
                                <strong>{row.piiCriticalCount}</strong>
                            )}
                            {row.piiCriticalCount > 0 && " / "}
                            {row.piiHitCount}
                        </button>
                    ) : (
                        <span className="health-pii">—</span>
                    )}
                </td>
                <td className="health-table__num">
                    {row.martinZone ? (
                        <span
                            className={
                                "health-martin-zone health-martin-zone--" +
                                row.martinZone
                            }
                            title={
                                row.martinDistance != null
                                    ? `Distance: ${row.martinDistance.toFixed(2)}`
                                    : undefined
                            }
                        >
                            {row.martinZone === "pain"
                                ? "боль"
                                : row.martinZone === "uselessness"
                                    ? "бесп."
                                    : row.martinZone === "main-sequence"
                                        ? "норма"
                                        : "—"}
                        </span>
                    ) : (
                        "—"
                    )}
                </td>
                <td className="health-table__num health-row__size">
                    {formatBytes(row.fileSize)}
                </td>
                <td className="health-row__updated">
                    {row.updatedAt ? (
                        <span title={new Date(row.updatedAt).toLocaleString("ru-RU")}>
                            {relativeTimeShort(row.updatedAt)}
                            {row.updatedAtSource === "fs" && (
                                <span
                                    className="health-row__source"
                                    title="mtime файла (сервер не сообщил updatedAt)"
                                >
                                    fs
                                </span>
                            )}
                        </span>
                    ) : (
                        "—"
                    )}
                </td>
                <td>
                    <button
                        className="health-row__schema-btn"
                        onClick={() => onOpenSchema(row.domainId)}
                        title="Схема домена"
                    >
                        <MIcon name="menu_book" size="sm" />
                    </button>
                </td>
            </tr>
            {isExpanded && (
                <tr className="health-row-details">
                    <td colSpan={17}>
                        <HealthRowDetails row={row} onOpenSchema={onOpenSchema} onOpenLint={onOpenLint} />
                    </td>
                </tr>
            )}
        </>
    );
});

// ============ Row details ============

function HealthRowDetails({
    row,
    onOpenSchema,
    onOpenLint,
}: {
    row: DomainHealthRow;
    onOpenSchema: (id: string) => void;
    onOpenLint: () => void;
}) {
    const hasStructuralIssues =
        row.cyclesCount > 0 ||
        row.brokenRefsCount > 0 ||
        row.orphanEntitiesCount > 0 ||
        row.attributesWithoutViewsCount > 0 ||
        row.mixinConflictsCount > 0;

    const hasSonar = row.sonarBreakdown.length > 0;
    const hasPii = row.piiHitCount > 0;
    const hasMartin = row.martinZone != null;

    return (
        <div className="health-details">
            <div className="health-details__actions">
                <button
                    className="btn btn--primary"
                    onClick={() => onOpenSchema(row.domainId)}
                >
                    <MIcon name="menu_book" size="sm" />
                    Схема домена
                </button>
                {row.filePath && (
                    <button
                        className="btn"
                        onClick={() => {
                            const st = useGraphStore.getState();
                            st.setHealthDashboardOpen(false);
                            openFileInEditor(row.filePath!, null, row.domainId);
                        }}
                        title="Открыть YAML-файл домена в редакторе"
                    >
                        <MIcon name="description" size="sm" />
                        Открыть YAML
                    </button>
                )}
                {row.lintIssueCount > 0 && (
                    <button
                        className="btn"
                        onClick={() => {
                            const st = useGraphStore.getState();
                            st.setHealthDashboardOpen(false);
                            onOpenLint();
                        }}
                        title="Открыть общий линтер схем"
                    >
                        <MIcon name="rule" size="sm" />
                        Линтер
                    </button>
                )}
                {row.piiHitCount > 0 && (
                    <button
                        className="btn"
                        onClick={() => {
                            const st = useGraphStore.getState();
                            st.setHealthDashboardOpen(false);
                            st.setPiiInitialDomain(row.domainId);
                            st.setPiiInitialSeverity(null);
                            st.setPiiOpen(true);
                        }}
                    >
                        <MIcon name="shield_lock" size="sm" />
                        PII
                    </button>
                )}
            </div>

            <div className="health-details__grid">
                {/* ============ Sonar breakdown ============ */}
                {hasSonar && (
                    <div className="health-details__card">
                        <div className="health-details__card-title">
                            <MIcon name="science" size="sm" />
                            Sonar breakdown
                        </div>
                        <div className="health-details__rows">
                            {row.sonarBreakdown
                                .filter((b) => b.issueCount > 0)
                                .sort((a, b) => a.score - b.score)
                                .map((b) => (
                                    <div
                                        key={b.category}
                                        className="health-details__row"
                                    >
                                        <span className="health-details__row-label">
                                            {b.label}
                                        </span>
                                        <span
                                            className={
                                                "health-details__row-score" +
                                                (b.score < 60
                                                    ? " bad"
                                                    : b.score < 80
                                                        ? " mid"
                                                        : " good")
                                            }
                                        >
                                            {b.score}
                                        </span>
                                        <span className="health-details__row-count">
                                            {b.issueCount} проблем
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* ============ PII по severity ============ */}
                {hasPii && (
                    <div className="health-details__card">
                        <div className="health-details__card-title">
                            <MIcon name="shield_lock" size="sm" />
                            PII по серьёзности
                        </div>
                        <div className="health-details__rows">
                            <div className="health-details__row">
                                <span className="health-details__row-label health-details__row-label--err">
                                    Спецкатегории
                                </span>
                                <span className="health-details__row-count">
                                    {row.piiBySeverity.critical}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label health-details__row-label--warn">
                                    Высокая чувствительность
                                </span>
                                <span className="health-details__row-count">
                                    {row.piiBySeverity.high}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label health-details__row-label--mid">
                                    Требуют внимания
                                </span>
                                <span className="health-details__row-count">
                                    {row.piiBySeverity.medium}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Косвенные
                                </span>
                                <span className="health-details__row-count">
                                    {row.piiBySeverity.low}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ Martin ============ */}
                {hasMartin && (
                    <div className="health-details__card">
                        <div className="health-details__card-title">
                            <MIcon name="scatter_plot" size="sm" />
                            Метрики Мартина
                        </div>
                        <div className="health-details__rows">
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Ca (afferent)
                                </span>
                                <span className="health-details__row-count">
                                    {row.martinCa ?? "—"}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Ce (efferent)
                                </span>
                                <span className="health-details__row-count">
                                    {row.martinCe ?? "—"}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Instability
                                </span>
                                <span className="health-details__row-count">
                                    {row.martinInstability != null
                                        ? row.martinInstability.toFixed(2)
                                        : "—"}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Abstractness
                                </span>
                                <span className="health-details__row-count">
                                    {row.martinAbstractness != null
                                        ? row.martinAbstractness.toFixed(2)
                                        : "—"}
                                </span>
                            </div>
                            <div className="health-details__row">
                                <span className="health-details__row-label">
                                    Distance
                                </span>
                                <span className="health-details__row-count">
                                    {row.martinDistance != null
                                        ? row.martinDistance.toFixed(2)
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ Структурные проблемы ============ */}
                {hasStructuralIssues && (
                    <div className="health-details__card">
                        <div className="health-details__card-title">
                            <MIcon name="warning" size="sm" />
                            Структурные проблемы
                        </div>
                        <div className="health-details__rows">
                            {row.cyclesCount > 0 && (
                                <div className="health-details__row">
                                    <span className="health-details__row-label health-details__row-label--err">
                                        Циклы наследования
                                    </span>
                                    <span className="health-details__row-count">
                                        {row.cyclesCount}
                                    </span>
                                </div>
                            )}
                            {row.brokenRefsCount > 0 && (
                                <div className="health-details__row">
                                    <span className="health-details__row-label health-details__row-label--err">
                                        Битые ссылки
                                    </span>
                                    <span className="health-details__row-count">
                                        {row.brokenRefsCount}
                                    </span>
                                </div>
                            )}
                            {row.orphanEntitiesCount > 0 && (
                                <div className="health-details__row">
                                    <span className="health-details__row-label health-details__row-label--warn">
                                        Сущности-сироты
                                    </span>
                                    <span className="health-details__row-count">
                                        {row.orphanEntitiesCount}
                                    </span>
                                </div>
                            )}
                            {row.attributesWithoutViewsCount > 0 && (
                                <div className="health-details__row">
                                    <span className="health-details__row-label health-details__row-label--warn">
                                        Атрибуты без views
                                    </span>
                                    <span className="health-details__row-count">
                                        {row.attributesWithoutViewsCount}
                                    </span>
                                </div>
                            )}
                            {row.mixinConflictsCount > 0 && (
                                <div className="health-details__row">
                                    <span className="health-details__row-label health-details__row-label--warn">
                                        Конфликты миксинов
                                    </span>
                                    <span className="health-details__row-count">
                                        {row.mixinConflictsCount}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ============ Топ проблемных сущностей ============ */}
                {row.topProblemEntities.length > 0 && (
                    <div className="health-details__card health-details__card--wide">
                        <div className="health-details__card-title">
                            <MIcon name="bug_report" size="sm" />
                            Топ-{row.topProblemEntities.length} сущностей по проблемам
                        </div>
                        <div className="health-details__entities">
                            {row.topProblemEntities.map((e) => (
                                <button
                                    key={e.entityFqid}
                                    type="button"
                                    className="health-details__entity-chip"
                                    onClick={() => {
                                        const st = useGraphStore.getState();
                                        st.setHealthDashboardOpen(false);
                                        st.setEntityCatalogInitialFqid(e.entityFqid);
                                        st.setEntityCatalogOpen(true);
                                    }}
                                    title={`${e.entityFqid} — ${e.issueCount} проблем`}
                                >
                                    <code>{e.entityId}</code>
                                    <span className="health-details__entity-count">
                                        {e.issueCount}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function AutoRecommendationsCard({ index }: { index: ModelIndex }) {
    const recs = useMemo(() => computeRecommendations(index), [index]);
    if (recs.length === 0) return null;

    const open = (r: Recommendation) => {
        const st = useGraphStore.getState();
        if (r.action?.kind === "open-lint") st.setLintOpen(true);
        else if (r.action?.kind === "open-pii") st.setPiiOpen(true);
        else if (r.targets[0]) {
            st.setEntityCatalogInitialFqid(r.targets[0]);
            st.setEntityCatalogOpen(true);
        }
    };

    // Группировка по severity: 🔴 error → 🟡 warning → 🟢 info
    const severityOrder: Array<"error" | "warning" | "info"> = [
        "error",
        "warning",
        "info",
    ];
    const grouped = new Map<string, Recommendation[]>();
    for (const r of recs) {
        const sev = String(r.severity || "info");
        if (!grouped.has(sev)) grouped.set(sev, []);
        grouped.get(sev)!.push(r);
    }

    const severityMeta: Record<
        string,
        { label: string; icon: string; cls: string }
    > = {
        error: { label: "Критично", icon: "error", cls: "error" },
        warning: { label: "Важно", icon: "warning", cls: "warning" },
        info: { label: "Рекомендации", icon: "info", cls: "info" },
    };

    return (
        <div className="auto-recommendations">
            <div className="auto-recommendations__title">
                <MIcon name="lightbulb" size="sm" />
                Что улучшить в первую очередь
            </div>
            {severityOrder.map((sev) => {
                const items = grouped.get(sev);
                if (!items || items.length === 0) return null;
                const meta = severityMeta[sev] || {
                    label: sev,
                    icon: "info",
                    cls: "info",
                };
                return (
                    <div key={sev} className="auto-recommendations__group">
                        <div className={`auto-recommendations__group-title auto-recommendations__group__sev--${meta.cls}`}>
                            <MIcon name={meta.icon} size="sm" />
                            <span style={{margin: '0 4px'}}>{meta.label}</span>
                            <span className="auto-recommendations__group-count">
                                ({items.length})
                            </span>
                        </div>
                        {items.slice(0, 4).map((r) => (
                            <button
                                key={r.id}
                                className={
                                    "auto-recommendations__item auto-recommendations__item--" +
                                    r.severity
                                }
                                onClick={() => open(r)}
                            >
                                <div className="auto-recommendations__head">
                                    <strong>{r.title}</strong>
                                    <span className="auto-recommendations__impact">
                                        impact {r.impact}
                                    </span>
                                </div>
                                <div className="auto-recommendations__desc">
                                    {r.description}
                                </div>
                            </button>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}