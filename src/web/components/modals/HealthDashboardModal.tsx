import React, { useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { useOutdatedDomains } from "../../hooks/useOutdatedDomains";
import { MIcon } from "../common/MIcon";
import { readRemoteInfo } from "../../state/initial";
import { relativeTimeShort } from "../../lib/format";
import type {
    ModelIndex,
} from "../../../shared/model-types";
import type { RFNode } from "../../lib/types";
import type { OutdatedDomain } from "../../../core/remote/outdated-check";

// ============ Row shape ============

interface DomainHealthRow {
    domainId: string;
    name: string;
    version: string;
    author: string;
    tags: string[];
    entityCount: number;
    attributeCount: number;
    linkageCount: number;
    dataTypeCount: number;
    mixinCount: number;
    lintScore: number | null;
    lintGrade: string | null;
    lintIssueCount: number;
    lintErrorCount: number;
    lintWarningCount: number;
    piiHitCount: number;
    piiCriticalCount: number;
    fileSize: number | null;
    updatedAt: string | null;
    updatedAtSource: "graphql" | "fs" | null;
    filePath: string | null;
    isOutdated: boolean;
    outdatedInfo: OutdatedDomain | null;
}

type SortKey =
    | "name"
    | "entities"
    | "attributes"
    | "linkages"
    | "dataTypes"
    | "mixins"
    | "lintScore"
    | "lintIssues"
    | "pii"
    | "piiCritical"
    | "fileSize"
    | "updatedAt";

function getSortValue(r: DomainHealthRow, key: SortKey): number | string | null {
    switch (key) {
        case "name":
            return (r.name || r.domainId).toLowerCase();
        case "entities":
            return r.entityCount;
        case "attributes":
            return r.attributeCount;
        case "linkages":
            return r.linkageCount;
        case "dataTypes":
            return r.dataTypeCount;
        case "mixins":
            return r.mixinCount;
        case "lintScore":
            return r.lintScore;
        case "lintIssues":
            return r.lintIssueCount;
        case "pii":
            return r.piiHitCount;
        case "piiCritical":
            return r.piiCriticalCount;
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

// ============ Aggregation ============

function buildDomainHealthRows(
    index: ModelIndex,
    nodes: RFNode[],
): DomainHealthRow[] {
    // Pre-aggregate O(N)
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

    const lintIssuesByDomain = new Map<
        string,
        { total: number; error: number; warning: number }
    >();
    for (const issue of index.lint.lintReport.issues) {
        let entry = lintIssuesByDomain.get(issue.domainId);
        if (!entry) {
            entry = { total: 0, error: 0, warning: 0 };
            lintIssuesByDomain.set(issue.domainId, entry);
        }
        entry.total++;
        if (issue.severity === "error") entry.error++;
        else if (issue.severity === "warning") entry.warning++;
    }

    const piiByDomain = new Map<string, { total: number; critical: number }>();
    for (const hit of index.pii.hits) {
        const domainId = hit.entityFqid.split("/")[0];
        let entry = piiByDomain.get(domainId);
        if (!entry) {
            entry = { total: 0, critical: 0 };
            piiByDomain.set(domainId, entry);
        }
        entry.total++;
        if (hit.severity === "critical") entry.critical++;
    }

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
        const pii = piiByDomain.get(domainIdLower) || { total: 0, critical: 0 };

        return {
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
            lintScore: sonar?.score ?? null,
            lintGrade: sonar?.grade ?? null,
            lintIssueCount: lint.total,
            lintErrorCount: lint.error,
            lintWarningCount: lint.warning,
            piiHitCount: pii.total,
            piiCriticalCount: pii.critical,
            fileSize:
                typeof node?.data?.fileSize === "number"
                    ? node.data.fileSize
                    : null,
            updatedAt: node?.data?.updatedAt || null,
            updatedAtSource: (node?.data?.updatedAtSource as any) || null,
            filePath: node?.data?.filePath || null,
            isOutdated: false,
            outdatedInfo: null,
        };
    });
}

// ============ CSV export ============

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
        "dataTypes",
        "mixins",
        "lintScore",
        "lintGrade",
        "lintIssues",
        "lintErrors",
        "lintWarnings",
        "pii",
        "piiCritical",
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
                r.dataTypeCount,
                r.mixinCount,
                r.lintScore ?? "",
                r.lintGrade ?? "",
                r.lintIssueCount,
                r.lintErrorCount,
                r.lintWarningCount,
                r.piiHitCount,
                r.piiCriticalCount,
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

// ============ Component ============

export function HealthDashboardModal() {
    const store = useGraphStore();
    const open = store.healthDashboardOpen;
    const nodes = useGraphStore((s) => s.nodes);
    const { index, loading, error } = useModelIndex();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);

    const {
        outdated,
        checking,
        error: checkError,
        lastCheckedAt,
        available,
        check,
    } = useOutdatedDomains(remoteInfo);

    const [sortBy, setSortBy] = useState<SortKey>("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [onlyOutdated, setOnlyOutdated] = useState(false);
    const [query, setQuery] = useState("");

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(key);
            setSortDir("asc");
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
    }, [rows, sortBy, sortDir, onlyOutdated, query]);

    const stats = useMemo(() => {
        const total = rows.length;
        const withEntities = rows.filter((r) => r.entityCount > 0).length;
        const totalEntities = rows.reduce((s, r) => s + r.entityCount, 0);
        const totalIssues = rows.reduce((s, r) => s + r.lintIssueCount, 0);
        const totalPii = rows.reduce((s, r) => s + r.piiHitCount, 0);
        const criticalPii = rows.reduce((s, r) => s + r.piiCriticalCount, 0);
        const badGrade = rows.filter(
            (r) => r.lintGrade === "D" || r.lintGrade === "E",
        ).length;
        return {
            total,
            withEntities,
            totalEntities,
            totalIssues,
            totalPii,
            criticalPii,
            badGrade,
        };
    }, [rows]);

    const openSchema = (domainId: string) => {
        store.setDomainSchemaDomainId(domainId);
        store.setDomainSchemaOpen(true);
    };

    const openInLint = (domainId: string) => {
        store.setLintOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setHealthDashboardOpen(false)}
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
                                {stats.total} доменов · {stats.totalEntities} сущностей
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        {available && (
                            <button
                                className={
                                    "btn" + (checking ? " btn--active" : "")
                                }
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
                            onClick={() => store.setHealthDashboardOpen(false)}
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
                                    {outdated.size === 1 ? "домен" : "доменов"} обновлено на
                                    сервере — запустите <code>--refresh</code>, чтобы получить
                                    актуальные данные.
                                </span>
                                <button
                                    type="button"
                                    className={
                                        "health-banner__action" +
                                        (onlyOutdated ? " health-banner__action--active" : "")
                                    }
                                    onClick={() => setOnlyOutdated((v) => !v)}
                                    title={
                                        onlyOutdated
                                            ? "Сбросить фильтр «только устаревшие»"
                                            : "Показать только домены, обновлённые на сервере"
                                    }
                                >
                                    <MIcon
                                        name={onlyOutdated ? "filter_alt_off" : "filter_alt"}
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
                                        Кэш получен {cacheAgeDays === 1 ? "день" : `${cacheAgeDays} дн`}{" "}
                                        назад
                                        {cacheAgeDays >= 7 && " — вероятно, устарел"}
                                        .
                                    </span>
                                </div>
                            )}

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
                            {available && (
                                <label
                                    className={
                                        "health-toolbar__toggle" +
                                        (onlyOutdated ? " active" : "")
                                    }
                                >
                                    <input
                                        type="checkbox"
                                        checked={onlyOutdated}
                                        onChange={() => setOnlyOutdated(!onlyOutdated)}
                                    />
                                    <MIcon name="update" size="sm" />
                                    Только устаревшие
                                    {outdated.size > 0 && (
                                        <span className="health-toolbar__badge">
                                            {outdated.size}
                                        </span>
                                    )}
                                </label>
                            )}
                            <div className="health-toolbar__stats">
                                <span>
                                    Показано <strong>{sortedRows.length}</strong> /{" "}
                                    {stats.total}
                                </span>
                                {stats.totalIssues > 0 && (
                                    <span className="health-toolbar__stat">
                                        <MIcon name="warning" size="sm" />
                                        {stats.totalIssues} lint
                                    </span>
                                )}
                                {stats.criticalPii > 0 && (
                                    <button
                                        type="button"
                                        className="health-toolbar__stat health-toolbar__stat--err health-toolbar__stat--clickable"
                                        onClick={() => {
                                            store.setPiiInitialSeverity("critical");
                                            store.setPiiInitialDomain(null);
                                            store.setPiiOpen(true);
                                        }}
                                        title={`Показать все ${stats.criticalPii} критичных PII-атрибутов во всех доменах — с переходом к сущностям`}
                                    >
                                        <MIcon name="shield_lock" size="sm" />
                                        {stats.criticalPii} PII critical
                                        <MIcon
                                            name="arrow_forward"
                                            size="sm"
                                            className="health-toolbar__stat-arrow"
                                        />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ============ Table ============ */}
                        <div className="health-table-wrap">
                            <table className="health-table">
                                <thead>
                                    <tr>
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
                                            onClick={() => handleSort("entities")}
                                            className={
                                                "health-table__num" +
                                                (sortBy === "entities" ? " active" : "")
                                            }
                                            title="Количество сущностей"
                                        >
                                            Entities
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
                                            title="Суммарное количество атрибутов"
                                        >
                                            Attrs
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
                                            Links
                                            {sortBy === "linkages" && (
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
                                            Mixins
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
                                            Issues
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
                                            title="PII-атрибуты: critical / всего"
                                        >
                                            PII
                                            {sortBy === "piiCritical" && (
                                                <span className="health-sort">
                                                    {sortDir === "asc" ? "↑" : "↓"}
                                                </span>
                                            )}
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
                                            className={sortBy === "updatedAt" ? "active" : ""}
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
                                        <HealthRow key={r.domainId} row={r} onOpenSchema={openSchema} onOpenLint={openInLint} />
                                    ))}
                                </tbody>
                            </table>

                            {sortedRows.length === 0 && (
                                <div className="health-empty">
                                    {onlyOutdated && outdated.size === 0
                                        ? "Нет устаревших доменов"
                                        : query
                                            ? `Ничего не найдено по запросу «${query}»`
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
    onOpenSchema,
    onOpenLint,
}: {
    row: DomainHealthRow;
    onOpenSchema: (id: string) => void;
    onOpenLint: (id: string) => void;
}) {
    const gradeClass = row.lintGrade
        ? "sonar-grade--" + row.lintGrade.toLowerCase()
        : "";

    const rowClass = [
        "health-row",
        row.isOutdated ? "health-row--outdated" : "",
        row.lintGrade === "D" || row.lintGrade === "E"
            ? "health-row--bad"
            : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <tr className={rowClass}>
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
                            <span className="health-row__tag">+{row.tags.length - 3}</span>
                        )}
                    </div>
                )}
            </td>
            <td className="health-table__num">{row.entityCount}</td>
            <td className="health-table__num">{row.attributeCount}</td>
            <td className="health-table__num">{row.linkageCount}</td>
            <td className="health-table__num">{row.dataTypeCount}</td>
            <td className="health-table__num">
                {row.mixinCount > 0 ? row.mixinCount : "—"}
            </td>
            <td className="health-table__num">
                {row.lintScore != null ? (
                    <span className={"health-lint-score " + gradeClass}>
                        {row.lintScore}
                        <span className="health-lint-score__grade">{row.lintGrade}</span>
                    </span>
                ) : (
                    "—"
                )}
            </td>
            <td className="health-table__num">
                {row.lintIssueCount > 0 ? (
                    <button
                        className="health-lint-link"
                        onClick={() => onOpenLint(row.domainId)}
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
                            (row.piiCriticalCount > 0 ? " health-pii--critical" : "")
                        }
                        onClick={(e) => {
                            e.stopPropagation();
                            useGraphStore.getState().setPiiInitialDomain(row.domainId);
                            useGraphStore.getState().setPiiInitialSeverity(null);
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
            <td className="health-table__num health-row__size">
                {formatBytes(row.fileSize)}
            </td>
            <td className="health-row__updated">
                {row.updatedAt ? (
                    <span title={new Date(row.updatedAt).toLocaleString("ru-RU")}>
                        {relativeTimeShort(row.updatedAt)}
                        {row.updatedAtSource === "fs" && (
                            <span className="health-row__source" title="mtime файла (сервер не сообщил updatedAt)">
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
    );
});