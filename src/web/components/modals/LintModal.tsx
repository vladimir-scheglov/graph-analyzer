import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import type {
    LintIssue,
    LintSeverity,
    LintRuleCategory,
} from "../../../shared/lint-types";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { openFileInEditor } from "../../lib/open-file";
import { useLintBaselines } from "../../hooks/useLintBaselines";
import {
    baselineKey,
    compareWithBaseline,
} from "../../../core/analyzer/lint-baseline";
import { alertDialog, confirmDialog } from "../../lib/dialogs";
import { Popover } from "../common/Popover";
import { isAutoFixable } from "../../lib/monaco/quickfix-rules";

// ============ Константы ============

const CATEGORY_LABELS: Record<LintRuleCategory, string> = {
    reference: "Ссылочная целостность",
    semantic: "Семантика",
    naming: "Именование",
    validation: "Валидация",
    required: "Обязательные поля",
    recommended: "Рекомендации",
    uirules: "UI Rules",
};

const SEVERITY_ORDER: LintSeverity[] = ["error", "warning", "info"];

const SEVERITY_COLOR: Record<LintSeverity, string> = {
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
};

const SEVERITY_RANK: Record<LintSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
};

const CATEGORY_TO_CHEATSHEET: Record<LintRuleCategory, string> = {
    reference: "linkages",
    semantic: "dataTypes",
    naming: "reserved-names",
    validation: "entities",
    required: "validation-errors",
    recommended: "validation-errors",
    uirules: "uiRules",
};

const ISSUES_PER_GROUP_LIMIT = 100;

type SortBy = "severity" | "count" | "name";
type GroupBy = "rule" | "entity" | "category";

interface IssueGroup {
    key: string;
    title: string;
    subtitle?: string;
    severity: LintSeverity;
    category: LintRuleCategory;
    issues: LintIssue[];
}

interface DomainBaselineInfo {
    total: number;
    baselineTotal: number;
    newCount: number;
    fixedCount: number;
}

// ============ Компонент ============

export function LintModal() {
    const { index, loading, error } = useModelIndex();

    const [filterCategory, setFilterCategory] = useState<LintRuleCategory | "">("");
    const [filterDomain, setFilterDomain] = useState("");
    const [filterSeverity, setFilterSeverity] = useState<Set<LintSeverity>>(
        new Set(SEVERITY_ORDER),
    );
    const [query, setQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortBy>("severity");
    const [groupBy, setGroupBy] = useState<GroupBy>("rule");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [showHelp, setShowHelp] = useState(false);
    const [onlyNew, setOnlyNew] = useState(false);
    const [groupLimit, setGroupLimit] = useState(ISSUES_PER_GROUP_LIMIT);

    const {
        baselines,
        takeBaseline,
        takeBaselinesBatch,
        clearBaseline,
    } = useLintBaselines();

    const open = useGraphStore((s) => s.lintOpen);
    const nodes = useGraphStore((s) => s.nodes);

    const report = index?.lint.lintReport ?? null;

    // ============ Производные данные ============

    const allDomains = useMemo(() => {
        if (!report) return [] as string[];
        const set = new Set<string>();
        report.issues.forEach((i) => set.add(i.domainId));
        return Array.from(set).sort();
    }, [report]);

    const newIssueKeysByDomain = useMemo(() => {
        const result = new Map<string, Set<string>>();
        if (!report) return result;
        for (const [domainId, baseline] of Object.entries(baselines)) {
            const domainIssues = report.issues.filter(
                (i) => i.domainId === domainId,
            );
            const cmp = compareWithBaseline(domainIssues, baseline);
            result.set(domainId, new Set(cmp.newIssues.map(baselineKey)));
        }
        return result;
    }, [baselines, report]);

    const domainBaselineInfo = useMemo(() => {
        const map = new Map<string, DomainBaselineInfo>();
        if (!report) return map;
        for (const domainId of allDomains) {
            const domainIssues = report.issues.filter(
                (i) => i.domainId === domainId,
            );
            const baseline = baselines[domainId];
            if (!baseline) {
                map.set(domainId, {
                    total: domainIssues.length,
                    baselineTotal: 0,
                    newCount: 0,
                    fixedCount: 0,
                });
            } else {
                const cmp = compareWithBaseline(domainIssues, baseline);
                map.set(domainId, {
                    total: domainIssues.length,
                    baselineTotal: cmp.totalBaseline,
                    newCount: cmp.newIssues.length,
                    fixedCount: cmp.fixedIssues.length,
                });
            }
        }
        return map;
    }, [report, allDomains, baselines]);

    const isIssueNew = useCallback(
        (issue: LintIssue): boolean | null => {
            const keys = newIssueKeysByDomain.get(issue.domainId);
            if (!keys) return null;
            return keys.has(baselineKey(issue));
        },
        [newIssueKeysByDomain],
    );

    const filteredIssues = useMemo(() => {
        if (!report) return [] as LintIssue[];
        const q = query.trim().toLowerCase();
        return report.issues.filter((i) => {
            if (filterCategory && i.category !== filterCategory) return false;
            if (filterDomain && i.domainId !== filterDomain) return false;
            if (!filterSeverity.has(i.severity)) return false;
            if (onlyNew && isIssueNew(i) !== true) return false;
            if (q) {
                const hay = [
                    i.ruleId,
                    i.rule,
                    i.message,
                    i.hint || "",
                    i.entityFqid || "",
                    i.attributeId || "",
                    i.domainId,
                    (i as any).line != null ? String((i as any).line) : "",
                ]
                    .join(" ")
                    .toLowerCase();
                if (hay.indexOf(q) === -1) return false;
            }
            return true;
        });
    }, [
        report,
        filterCategory,
        filterDomain,
        filterSeverity,
        onlyNew,
        query,
        isIssueNew,
    ]);

    const autoFixableCount = useMemo(
        () => filteredIssues.filter((i) => isAutoFixable(i.ruleId, i.message)).length,
        [filteredIssues],
    );

    const handleFixAll = useCallback(async () => {
        const targetDomain =
            filterDomain ||
            filteredIssues[0]?.domainId ||
            null;

        if (!targetDomain) {
            useGraphStore.getState().showSnackbar("Нет домена для автоисправления");
            return;
        }

        const node = nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() === targetDomain.toLowerCase(),
        );

        if (!node?.data.filePath) {
            useGraphStore.getState().showSnackbar("Файл схемы не найден");
            return;
        }

        // 1. Закрываем LintModal ДО открытия YamlViewer
        useGraphStore.getState().setLintOpen(false);

        // 2. Открываем YamlViewer (dirty-check — если пользователь отменил, восстанавливаем)
        const ok = await openFileInEditor(
            node.data.filePath,
            null,
            targetDomain,
        );
        if (!ok) {
            useGraphStore.getState().setLintOpen(true);
            return;
        }

        // 3. Даём YamlViewer смонтировать Monaco и дождаться маркеров.
        //    Обработчик события ниже сам разблокирует файл и применит правки.
        setTimeout(() => {
            document.dispatchEvent(
                new CustomEvent("dg:lint-fix-all", {
                    detail: { domainId: targetDomain },
                }),
            );
        }, 600);
    }, [filterDomain, filteredIssues, nodes]);

    const grouped = useMemo((): IssueGroup[] => {
        if (!filteredIssues.length) return [];
        const map = new Map<string, IssueGroup>();

        for (const i of filteredIssues) {
            let key: string;
            let title: string;
            let subtitle: string | undefined;

            if (groupBy === "rule") {
                key = `rule:${i.ruleId}`;
                title = i.rule;
            } else if (groupBy === "entity") {
                const entityId = i.entityFqid
                    ? i.entityFqid.split("/")[1]
                    : null;
                key = `entity:${i.entityFqid || i.domainId}`;
                title = entityId || `(домен) ${i.domainId}`;
                subtitle = i.entityFqid
                    ? i.entityFqid.split("/")[0]
                    : i.domainId;
            } else {
                key = `cat:${i.category}`;
                title = CATEGORY_LABELS[i.category];
            }

            let g = map.get(key);
            if (!g) {
                g = {
                    key,
                    title,
                    subtitle,
                    severity: i.severity,
                    category: i.category,
                    issues: [],
                };
                map.set(key, g);
            }
            if (i.severity === "error") g.severity = "error";
            else if (i.severity === "warning" && g.severity !== "error") {
                g.severity = "warning";
            }
            g.issues.push(i);
        }

        // Внутри каждой группы сортируем issues по severity
        for (const g of map.values()) {
            g.issues.sort(
                (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
            );
            if (groupBy === "entity") {
                const ruleSet = new Set(g.issues.map((i) => i.ruleId));
                const m10 = ruleSet.size % 10;
                const m100 = ruleSet.size % 100;
                const word =
                    m10 === 1 && m100 !== 11
                        ? "правило"
                        : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)
                            ? "правила"
                            : "правил";
                const base = `${ruleSet.size} ${word}`;
                g.subtitle = g.subtitle ? `${g.subtitle} · ${base}` : base;
            }
        }

        const arr = Array.from(map.values());
        if (sortBy === "severity") {
            arr.sort((a, b) => {
                const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
                if (s !== 0) return s;
                return b.issues.length - a.issues.length;
            });
        } else if (sortBy === "count") {
            arr.sort((a, b) => b.issues.length - a.issues.length);
        } else {
            arr.sort((a, b) => a.title.localeCompare(b.title));
        }
        return arr;
    }, [filteredIssues, groupBy, sortBy]);

    const sevCounts = report?.stats.bySeverity || {
        error: 0,
        warning: 0,
        info: 0,
    };

    const filteredSevCounts = useMemo(() => {
        const c: Record<LintSeverity, number> = {
            error: 0,
            warning: 0,
            info: 0,
        };
        filteredIssues.forEach((i) => {
            c[i.severity]++;
        });
        return c;
    }, [filteredIssues]);

    const hasFilter =
        !!filterCategory ||
        !!filterDomain ||
        !!query.trim() ||
        onlyNew ||
        filterSeverity.size < SEVERITY_ORDER.length;

    // ============ Эффекты ============

    // Авто-разворот групп при загрузке / смене группировки / поиске
    useEffect(() => {
        if (!grouped.length) {
            setExpandedGroups(new Set());
            return;
        }
        if (query.trim()) {
            // При поиске — раскрываем все, если немного, иначе первые 5
            if (filteredIssues.length <= 300) {
                setExpandedGroups(new Set(grouped.map((g) => g.key)));
            } else {
                setExpandedGroups(
                    new Set(grouped.slice(0, 5).map((g) => g.key)),
                );
            }
            return;
        }
        // Обычный режим: всё раскрыть, если немного, иначе первые 3
        if (grouped.length <= 15 && filteredIssues.length <= 300) {
            setExpandedGroups(new Set(grouped.map((g) => g.key)));
        } else {
            setExpandedGroups(new Set(grouped.slice(0, 3).map((g) => g.key)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupBy, !!report, query.trim()]);

    useEffect(() => {
        if (!open) return;
        useGraphStore.getState().setTooltip(null);
        (window as any).__tooltipHovered = false;
    }, [open]);

    // ============ Handlers ============

    const toggleSeverity = useCallback((sev: LintSeverity) => {
        setFilterSeverity((prev) => {
            const next = new Set(prev);
            if (next.has(sev)) next.delete(sev);
            else next.add(sev);
            return next;
        });
    }, []);

    const toggleGroup = useCallback((key: string) => {
        setExpandedGroups((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key);
            else s.add(key);
            return s;
        });
    }, []);

    const expandAll = useCallback(() => {
        setExpandedGroups(new Set(grouped.map((g) => g.key)));
    }, [grouped]);

    const collapseAll = useCallback(() => {
        setExpandedGroups(new Set());
    }, []);

    const resetFilters = useCallback(() => {
        setFilterCategory("");
        setFilterDomain("");
        setFilterSeverity(new Set(SEVERITY_ORDER));
        setQuery("");
        setOnlyNew(false);
    }, []);

    const openEntity = useCallback((fqid: string) => {
        useGraphStore.getState().setLintOpen(false);
        useGraphStore.getState().setEntityCatalogInitialFqid(fqid);
        useGraphStore.getState().setEntityCatalogOpen(true);
    }, []);

    const openCheatsheet = useCallback((sectionId: string) => {
        useGraphStore.getState().setLintOpen(false);
        useGraphStore.getState().setCheatsheetInitialSection(sectionId);
        useGraphStore.getState().setCheatsheetOpen(true);
    }, []);

    const openIssueInEditor = useCallback(
        (issue: LintIssue) => {
            const domainId = issue.domainId;
            const node = nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() ===
                    domainId.toLowerCase(),
            );
            const filePath = node?.data.filePath;
            if (!filePath) {
                if (issue.entityFqid) {
                    openEntity(issue.entityFqid);
                } else {
                    useGraphStore
                        .getState()
                        .showSnackbar(
                            "Файл схемы недоступен — откройте домен вручную",
                        );
                }
                return;
            }
            const ok = openFileInEditor(
                filePath,
                issue.entityFqid ?? null,
                domainId,
            );
            if (!ok) return;
            useGraphStore.getState().setLintOpen(false);
            useGraphStore.getState().setYamlViewerPendingIssue(issue);
        },
        [nodes, openEntity],
    );

    const handleTakeBaseline = async (domainId: string) => {
        const domainIssues =
            report?.issues.filter((i) => i.domainId === domainId) || [];
        const existing = baselines[domainId];
        const detail = existing
            ? `Было: ${existing.issues.length} проблем (принято ${new Date(existing.takenAt).toLocaleString("ru-RU")})\n` +
            `Сейчас: ${domainIssues.length} проблем\n\n` +
            `Все текущие проблемы будут считаться «принятыми».`
            : `Сейчас: ${domainIssues.length} проблем.\n\n` +
            `После этого «новыми» будут считаться только те, что появятся в будущем.`;
        const ok = await confirmDialog(
            existing
                ? `Обновить baseline для ${domainId}?`
                : `Принять baseline для ${domainId}?`,
            { detail, confirmLabel: existing ? "Обновить" : "Принять" },
        );
        if (!ok) return;
        try {
            await takeBaseline(domainId);
        } catch (e: any) {
            await alertDialog("Не удалось принять baseline", {
                detail: e.message,
                variant: "danger",
            });
        }
    };

    const handleTakeBaselineAll = async () => {
        if (!report) return;
        const domainsWithIssues = Array.from(
            new Set(report.issues.map((i) => i.domainId)),
        );
        if (domainsWithIssues.length === 0) return;
        const ok = await confirmDialog(
            `Принять текущее состояние ${domainsWithIssues.length} доменов как baseline?`,
            {
                detail:
                    `Всего проблем: ${report.issues.length}\n` +
                    `Будет создан/обновлён baseline для каждого домена.\n\n` +
                    `После этого «новыми» будут считаться только те, что появятся в будущем.`,
                confirmLabel: "Принять",
            },
        );
        if (!ok) return;
        try {
            await takeBaselinesBatch(domainsWithIssues);
        } catch (e: any) {
            await alertDialog("Ошибка: " + e.message);
        }
    };

    const handleClearBaseline = async (domainId: string) => {
        const ok = await confirmDialog(`Удалить baseline для ${domainId}?`, {
            detail:
                "После этого все проблемы этого домена будут считаться «новыми».",
            danger: true,
            confirmLabel: "Удалить",
        });
        if (!ok) return;
        try {
            await clearBaseline(domainId);
        } catch (e: any) {
            await alertDialog("Ошибка", {
                detail: e.message,
                variant: "danger",
            });
        }
    };

    // ============ Экспорт ============

    const buildJSON = useCallback(() => {
        if (!report) return "";
        return JSON.stringify(
            {
                generatedAt: report.generatedAt,
                filter: {
                    category: filterCategory || null,
                    domain: filterDomain || null,
                    severity: Array.from(filterSeverity),
                    query: query.trim() || null,
                    onlyNew,
                },
                stats: {
                    total: report.stats.total,
                    filtered: filteredIssues.length,
                    bySeverity: filteredSevCounts,
                },
                issues: filteredIssues.map((i) => ({
                    ruleId: i.ruleId,
                    rule: i.rule,
                    severity: i.severity,
                    category: i.category,
                    domainId: i.domainId,
                    entityFqid: i.entityFqid || null,
                    attributeId: i.attributeId || null,
                    propertyPath: i.propertyPath || null,
                    message: i.message,
                    hint: i.hint || null,
                })),
            },
            null,
            2,
        );
    }, [
        report,
        filteredIssues,
        filteredSevCounts,
        filterCategory,
        filterDomain,
        filterSeverity,
        query,
        onlyNew,
    ]);

    const buildCSV = useCallback(() => {
        const header = [
            "ruleId",
            "severity",
            "category",
            "domainId",
            "entityFqid",
            "attributeId",
            "message",
            "hint",
        ];
        const lines = [header.join(",")];
        const esc = (v: any): string => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        for (const i of filteredIssues) {
            lines.push(
                [
                    esc(i.ruleId),
                    esc(i.severity),
                    esc(i.category),
                    esc(i.domainId),
                    esc(i.entityFqid || ""),
                    esc(i.attributeId || ""),
                    esc(i.message),
                    esc(i.hint || ""),
                ].join(","),
            );
        }
        return "\uFEFF" + lines.join("\n");
    }, [filteredIssues]);

    const buildMD = useCallback(() => {
        if (!report) return "";
        const lines: string[] = [];
        lines.push("# Отчёт линтера схем");
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");
        const fp: string[] = [];
        if (filterCategory)
            fp.push(`категория: ${CATEGORY_LABELS[filterCategory]}`);
        if (filterDomain) fp.push(`домен: \`${filterDomain}\``);
        if (filterSeverity.size < 3) {
            fp.push(`severity: ${Array.from(filterSeverity).join(", ")}`);
        }
        if (query.trim()) fp.push(`поиск: «${query.trim()}»`);
        if (onlyNew) fp.push("только новые");
        if (fp.length) {
            lines.push(`**Фильтр:** ${fp.join(" · ")}`);
            lines.push("");
        }
        lines.push(
            `Всего проблем: **${filteredIssues.length}** из ${report.stats.total}`,
        );
        lines.push("");
        lines.push("## Сводка");
        lines.push("");
        lines.push("| Severity | Количество |");
        lines.push("| --- | ---: |");
        lines.push(`| 🔴 Ошибки | ${filteredSevCounts.error} |`);
        lines.push(`| 🟠 Предупреждения | ${filteredSevCounts.warning} |`);
        lines.push(`| 🔵 Рекомендации | ${filteredSevCounts.info} |`);
        lines.push("");
        for (const g of grouped) {
            lines.push(`## ${g.title} (${g.issues.length})`);
            lines.push("");
            for (const i of g.issues) {
                const icon =
                    i.severity === "error"
                        ? "🔴"
                        : i.severity === "warning"
                            ? "🟠"
                            : "🔵";
                const ref = i.entityFqid
                    ? `\`${i.entityFqid}${i.attributeId ? "." + i.attributeId : ""}\``
                    : `\`${i.domainId}\``;
                lines.push(`- ${icon} ${ref} — ${i.message}`);
                if (i.hint) lines.push(`  - 💡 ${i.hint}`);
            }
            lines.push("");
        }
        return lines.join("\n");
    }, [
        report,
        filteredIssues,
        filteredSevCounts,
        grouped,
        filterCategory,
        filterDomain,
        filterSeverity,
        query,
        onlyNew,
    ]);

    const downloadFile = useCallback(
        (content: string, mime: string, ext: string) => {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `lint-report-${stamp}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
            useGraphStore.getState().showSnackbar(`Отчёт скачан (.${ext})`);
        },
        [],
    );

    const copyToClipboard = useCallback(
        async (text: string, label: string) => {
            try {
                await navigator.clipboard.writeText(text);
                useGraphStore.getState().showSnackbar(`${label} скопирован`);
            } catch {
                await alertDialog("Не удалось скопировать", {
                    variant: "warning",
                });
            }
        },
        [],
    );

    // ============ Render ============

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 500 }}
            onMouseDown={() => useGraphStore.getState().setLintOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="science" size="sm" />
                        <span className="icon-label">Линтер схем</span>
                        {report && (
                            <span className="help-modal__badge">
                                {filteredIssues.length}
                                {hasFilter && ` / ${report.stats.total}`}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__help-btn"
                            onClick={() => openCheatsheet("validation-errors")}
                            title="Открыть шпаргалку по ошибкам валидации"
                        >
                            <MIcon name="menu_book" />
                            <span>Шпаргалка</span>
                        </button>
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Что проверяется?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() =>
                                useGraphStore.getState().setLintOpen(false)
                            }
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">
                            Загрузка индекса...
                        </div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>
                            Ошибка: {error}
                        </div>
                    </div>
                )}

                {index && report && (
                    <div className="help-modal__body help-modal__body--flush">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Линтер проверяет схемы доменов на
                                    соответствие соглашениям: правила
                                    именования, обязательные поля, ссылочную
                                    целостность, типы данных и семантику. Всё,
                                    что нарушает норму, попадает в отчёт.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Категории правил">
                                <HelpList>
                                    <li>
                                        <strong>Ссылочная целостность</strong> —
                                        все ли ссылки ведут на существующие
                                        сущности и типы.
                                    </li>
                                    <li>
                                        <strong>Семантика</strong> — нет ли
                                        дублей, циклов, сущностей-пустышек.
                                    </li>
                                    <li>
                                        <strong>Именование</strong> — camelCase
                                        для сущностей и атрибутов, длина id в
                                        пределах нормы.
                                    </li>
                                    <li>
                                        <strong>Валидация</strong> — email без
                                        regexp, IP как String, дата как String
                                        — ловим несоответствия типов.
                                    </li>
                                    <li>
                                        <strong>Обязательные поля</strong> —
                                        есть ли <code>name</code> у сущности.
                                    </li>
                                    <li>
                                        <strong>Рекомендации</strong> — есть ли{" "}
                                        <code>description</code>,{" "}
                                        <code>label</code>.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Уровни">
                                <HelpText>
                                    <strong>Ошибки</strong> — точно надо
                                    править. <strong>Предупреждения</strong> —
                                    так писать не рекомендуется.{" "}
                                    <strong>Рекомендации</strong> — можно
                                    улучшить, но не критично.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Sonar-оценка">
                                <HelpText>
                                    Это взвешенная сводка: 100 — идеал, 0 —
                                    очень много проблем. Вес категории
                                    отражает важность: ссылочная целостность
                                    влияет на оценку в 5 раз сильнее, чем
                                    рекомендации.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Поиск, фильтры, группировка">
                                <HelpList>
                                    <li>
                                        <strong>Поиск</strong> — по правилу,
                                        сообщению, подсказке, сущности,
                                        атрибуту, домену.
                                    </li>
                                    <li>
                                        <strong>Severity</strong> — клик по
                                        карточке «Ошибки / Предупреждения /
                                        Рекомендации» скрывает/показывает этот
                                        уровень.
                                    </li>
                                    <li>
                                        <strong>Сортировка</strong> — по
                                        severity, количеству или алфавиту.
                                    </li>
                                    <li>
                                        <strong>Группировка</strong> — по
                                        правилу (по умолчанию), сущности
                                        (полезно для «что не так с Entity X»)
                                        или категории.
                                    </li>
                                    <li>
                                        <strong>Только новые</strong> — фильтр
                                        по baseline. Сначала примите baseline.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Baseline">
                                <HelpText>
                                    Baseline — «снимок» текущих проблем.
                                    После его принятия «новыми» считаются
                                    только те, что появились позже. Удобно
                                    для приёма работ: видно, что было
                                    исправлено (✓) и что добавилось (🔥).
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Принять baseline</strong> —
                                        для выбранного домена или для всех
                                        сразу.
                                    </li>
                                    <li>
                                        <strong>Обновить baseline</strong> —
                                        перезаписать текущим состоянием.
                                    </li>
                                    <li>
                                        <strong>Удалить baseline</strong> —
                                        все проблемы станут «новыми».
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Экспорт">
                                <HelpList>
                                    <li>
                                        <strong>JSON</strong> — для CI, скриптов,
                                        импорта в трекер.
                                    </li>
                                    <li>
                                        <strong>CSV</strong> — для Excel /
                                        Google Sheets.
                                    </li>
                                    <li>
                                        <strong>Markdown</strong> — для отчёта
                                        в PR / задачи.
                                    </li>
                                    <li>
                                        Экспортируются только отфильтрованные
                                        проблемы — что видите, то и получите.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {/* ============ СВОДКА (кликабельная) ============ */}
                        <div className="lint-summary">
                            {SEVERITY_ORDER.map((sev) => {
                                const active = filterSeverity.has(sev);
                                const color = SEVERITY_COLOR[sev];
                                return (
                                    <div
                                        key={sev}
                                        className={
                                            "lint-summary__stat lint-summary__stat--" +
                                            sev
                                        }
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => toggleSeverity(sev)}
                                        onKeyDown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                toggleSeverity(sev);
                                            }
                                        }}
                                        style={{
                                            cursor: "pointer",
                                            opacity: active ? 1 : 0.4,
                                            transition: "opacity 0.15s",
                                            userSelect: "none",
                                            borderLeft: active
                                                ? `3px solid ${color}`
                                                : "3px solid transparent",
                                        }}
                                        title={
                                            active
                                                ? `Скрыть ${sev}`
                                                : `Показать ${sev}`
                                        }
                                    >
                                        <div className="lint-summary__value">
                                            {sevCounts[sev]}
                                        </div>
                                        <div className="lint-summary__label">
                                            {sev === "error"
                                                ? "Ошибок"
                                                : sev === "warning"
                                                    ? "Предупреждений"
                                                    : "Рекомендаций"}
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="lint-summary__stat lint-summary__stat--score">
                                <div className="lint-summary__value">
                                    {index.lint.sonar.overall.score}
                                </div>
                                <div className="lint-summary__label">
                                    Sonar {index.lint.sonar.overall.grade}
                                </div>
                            </div>
                        </div>

                        {/* ============ ФИЛЬТРЫ ============ */}
                        <div
                            className="lint-filters"
                            style={{ flexWrap: "wrap", rowGap: 8 }}
                        >
                            {/* Поиск */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 8px",
                                    background: "var(--bg-750)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 6,
                                    minWidth: 260,
                                }}
                            >
                                <MIcon
                                    name="search"
                                    size="sm"
                                    style={{ color: "var(--text-500)" }}
                                />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) =>
                                        setQuery(e.target.value)
                                    }
                                    placeholder="Поиск по правилу, сообщению, сущности, атрибуту..."
                                    spellCheck={false}
                                    style={{
                                        flex: 1,
                                        background: "transparent",
                                        border: "none",
                                        outline: "none",
                                        color: "var(--text-200)",
                                        fontSize: 12,
                                    }}
                                />
                                {query && (
                                    <button
                                        type="button"
                                        onClick={() => setQuery("")}
                                        style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--text-500)",
                                            cursor: "pointer",
                                            padding: 0,
                                            fontSize: 12,
                                        }}
                                        title="Очистить"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <label className="entity-matrix-filter">
                                <span>Категория:</span>
                                <select
                                    value={filterCategory}
                                    onChange={(e) =>
                                        setFilterCategory(
                                            e.target.value as
                                            | LintRuleCategory
                                            | "",
                                        )
                                    }
                                >
                                    <option value="">— все —</option>
                                    {(
                                        Object.keys(
                                            CATEGORY_LABELS,
                                        ) as LintRuleCategory[]
                                    ).map((k) => (
                                        <option key={k} value={k}>
                                            {CATEGORY_LABELS[k]} (
                                            {report?.stats.byCategory[k] ?? 0})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="entity-matrix-filter">
                                <span>Домен:</span>
                                <select
                                    value={filterDomain}
                                    onChange={(e) =>
                                        setFilterDomain(e.target.value)
                                    }
                                    style={{ maxWidth: 280 }}
                                >
                                    <option value="">
                                        — все ({allDomains.length}) —
                                    </option>
                                    {allDomains.map((d) => {
                                        const info =
                                            domainBaselineInfo.get(d);
                                        const parts: string[] = [
                                            `${info?.total ?? 0} пробл.`,
                                        ];
                                        if (info && info.newCount > 0)
                                            parts.push(`${info.newCount} нов.`);
                                        if (info && info.fixedCount > 0)
                                            parts.push(
                                                `${info.fixedCount} испр.`,
                                            );
                                        const marks = baselines[d] ? " 📌" : "";
                                        return (
                                            <option key={d} value={d}>
                                                {d}
                                                {marks} ({parts.join(", ")})
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <label className="entity-matrix-filter">
                                <span>Сортировка:</span>
                                <select
                                    value={sortBy}
                                    onChange={(e) =>
                                        setSortBy(e.target.value as SortBy)
                                    }
                                >
                                    <option value="severity">
                                        По severity
                                    </option>
                                    <option value="count">По количеству</option>
                                    <option value="name">По имени</option>
                                </select>
                            </label>

                            <label className="entity-matrix-filter">
                                <span>Группировка:</span>
                                <select
                                    value={groupBy}
                                    onChange={(e) =>
                                        setGroupBy(e.target.value as GroupBy)
                                    }
                                >
                                    <option value="rule">По правилу</option>
                                    <option value="entity">По сущности</option>
                                    <option value="category">
                                        По категории
                                    </option>
                                </select>
                            </label>

                            {/* Baseline controls */}
                            <div className="lint-baseline-controls">
                                <label
                                    className={
                                        "entity-graph-toggle lint-baseline-toggle" +
                                        (onlyNew ? " active" : "")
                                    }
                                    title={
                                        Object.keys(baselines).length === 0
                                            ? "Сначала примите baseline хотя бы для одного домена"
                                            : "Показать только проблемы, появившиеся после baseline"
                                    }
                                >
                                    <input
                                        type="checkbox"
                                        checked={onlyNew}
                                        onChange={() =>
                                            setOnlyNew(!onlyNew)
                                        }
                                        disabled={
                                            Object.keys(baselines).length === 0
                                        }
                                    />
                                    <MIcon name="new_releases" size="sm" />
                                    Только новые
                                </label>

                                {filterDomain ? (
                                    <>
                                        <button
                                            className="btn"
                                            onClick={() =>
                                                handleTakeBaseline(filterDomain)
                                            }
                                            title={
                                                baselines[filterDomain]
                                                    ? `Обновить baseline для ${filterDomain}`
                                                    : `Принять текущее состояние ${filterDomain} как baseline`
                                            }
                                        >
                                            <MIcon
                                                name="push_pin"
                                                size="sm"
                                            />
                                            {baselines[filterDomain]
                                                ? "Обновить baseline"
                                                : "Принять baseline"}
                                        </button>
                                        {baselines[filterDomain] && (
                                            <button
                                                className="btn btn--danger"
                                                onClick={() =>
                                                    handleClearBaseline(
                                                        filterDomain,
                                                    )
                                                }
                                                title={`Удалить baseline для ${filterDomain}`}
                                            >
                                                <MIcon name="close" size="sm" />
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    Object.keys(baselines).length === 0 &&
                                    report.stats.total > 0 && (
                                        <button
                                            className="btn"
                                            onClick={handleTakeBaselineAll}
                                            title="Принять текущее состояние всех доменов с проблемами как baseline"
                                        >
                                            <MIcon
                                                name="push_pin"
                                                size="sm"
                                            />
                                            Принять для всех
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Baseline info banner */}
                        {filterDomain &&
                            baselines[filterDomain] &&
                            (() => {
                                const info =
                                    domainBaselineInfo.get(filterDomain);
                                if (!info) return null;
                                return (
                                    <div className="lint-baseline-info">
                                        <MIcon name="push_pin" size="sm" />
                                        <span>
                                            Baseline для{" "}
                                            <code>{filterDomain}</code> принят{" "}
                                            {new Date(
                                                baselines[filterDomain].takenAt,
                                            ).toLocaleString("ru-RU")}
                                        </span>
                                        <span className="lint-baseline-info__stats">
                                            было {info.baselineTotal} · сейчас{" "}
                                            {info.total}
                                            {info.newCount > 0 && (
                                                <span className="lint-baseline-info__new">
                                                    {" "}
                                                    · 🔥 {info.newCount} новых
                                                </span>
                                            )}
                                            {info.fixedCount > 0 && (
                                                <span className="lint-baseline-info__fixed">
                                                    {" "}
                                                    · ✓ {info.fixedCount}{" "}
                                                    исправлено
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                );
                            })()}

                        {/* ============ TOOLBAR ============ */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 16px",
                                borderTop: "1px solid var(--border)",
                                borderBottom: "1px solid var(--border)",
                                background: "var(--bg-800)",
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                className="btn"
                                onClick={handleFixAll}
                                disabled={autoFixableCount === 0}
                                title={
                                    autoFixableCount === 0
                                        ? "Для текущих проблем автофиксов нет — правьте вручную"
                                        : `Применить ${autoFixableCount} ${autoFixableCount === 1 ? "автофикс" : "автофикса"} (остальные — вручную)`
                                }
                            >
                                <MIcon name="auto_fix_high" size="sm" />
                                Исправить все ({autoFixableCount})
                                {autoFixableCount < filteredIssues.length && (
                                    <span style={{ opacity: 0.55, marginLeft: 4, fontSize: 11 }}>
                                        / {filteredIssues.length}
                                    </span>
                                )}
                            </button>

                            <button
                                className="btn"
                                onClick={expandAll}
                                disabled={grouped.length === 0}
                                title="Развернуть все группы"
                            >
                                <MIcon name="unfold_more" size="sm" />
                                Развернуть
                            </button>
                            <button
                                className="btn"
                                onClick={collapseAll}
                                disabled={expandedGroups.size === 0}
                                title="Свернуть все группы"
                            >
                                <MIcon name="unfold_less" size="sm" />
                                Свернуть
                            </button>

                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginLeft: 8,
                                    fontSize: 12,
                                    color: "var(--text-400)",
                                }}
                            >
                                Показано:{" "}
                                <strong style={{ color: "var(--text-200)" }}>
                                    {filteredIssues.length}
                                </strong>
                                {hasFilter && (
                                    <>из {report.stats.total}</>
                                )}
                                {hasFilter && (
                                    <button
                                        onClick={resetFilters}
                                        style={{
                                            background: "transparent",
                                            border: "none",
                                            color: "var(--accent-hover)",
                                            cursor: "pointer",
                                            textDecoration: "underline",
                                            fontSize: 12,
                                            padding: 0,
                                            marginLeft: 4,
                                        }}
                                    >
                                        сбросить фильтры
                                    </button>
                                )}
                            </span>

                            <div style={{ flex: 1 }} />

                            <Popover
                                width={240}
                                align="right"
                                trigger={(isPopOpen) => (
                                    <button
                                        className={
                                            "btn" +
                                            (isPopOpen ? " btn--active" : "")
                                        }
                                    >
                                        <MIcon name="download" size="sm" />
                                        Экспорт
                                    </button>
                                )}
                            >
                                {(close) => (
                                    <div className="menu">
                                        <button
                                            className="menu__item"
                                            onClick={() => {
                                                downloadFile(
                                                    buildJSON(),
                                                    "application/json",
                                                    "json",
                                                );
                                                close();
                                            }}
                                        >
                                            <span className="menu__icon">
                                                <MIcon
                                                    name="data_object"
                                                    size="sm"
                                                />
                                            </span>
                                            <span className="menu__text">
                                                JSON ({filteredIssues.length})
                                            </span>
                                        </button>
                                        <button
                                            className="menu__item"
                                            onClick={() => {
                                                downloadFile(
                                                    buildCSV(),
                                                    "text/csv;charset=utf-8",
                                                    "csv",
                                                );
                                                close();
                                            }}
                                        >
                                            <span className="menu__icon">
                                                <MIcon
                                                    name="table_view"
                                                    size="sm"
                                                />
                                            </span>
                                            <span className="menu__text">
                                                CSV ({filteredIssues.length})
                                            </span>
                                        </button>
                                        <button
                                            className="menu__item"
                                            onClick={() => {
                                                downloadFile(
                                                    buildMD(),
                                                    "text/markdown;charset=utf-8",
                                                    "md",
                                                );
                                                close();
                                            }}
                                        >
                                            <span className="menu__icon">
                                                <MIcon
                                                    name="description"
                                                    size="sm"
                                                />
                                            </span>
                                            <span className="menu__text">
                                                Markdown (
                                                {filteredIssues.length})
                                            </span>
                                        </button>
                                        <div className="menu__divider" />
                                        <button
                                            className="menu__item"
                                            onClick={() => {
                                                copyToClipboard(
                                                    buildMD(),
                                                    "Markdown-отчёт",
                                                );
                                                close();
                                            }}
                                        >
                                            <span className="menu__icon">
                                                <MIcon
                                                    name="content_copy"
                                                    size="sm"
                                                />
                                            </span>
                                            <span className="menu__text">
                                                Копировать Markdown
                                            </span>
                                        </button>
                                        <button
                                            className="menu__item"
                                            onClick={() => {
                                                copyToClipboard(
                                                    buildJSON(),
                                                    "JSON-отчёт",
                                                );
                                                close();
                                            }}
                                        >
                                            <span className="menu__icon">
                                                <MIcon
                                                    name="content_copy"
                                                    size="sm"
                                                />
                                            </span>
                                            <span className="menu__text">
                                                Копировать JSON
                                            </span>
                                        </button>
                                    </div>
                                )}
                            </Popover>
                        </div>

                        {/* ============ СПИСОК ============ */}
                        <div className="lint-rules">
                            {grouped.length === 0 ? (
                                <div className="lint-empty">
                                    {report.stats.total === 0 ? (
                                        <>
                                            <div className="lint-empty__icon">
                                                ✅
                                            </div>
                                            <div className="lint-empty__title">
                                                Проблем не найдено
                                            </div>
                                            <div className="lint-empty__hint">
                                                Схемы соответствуют всем
                                                правилам линтера
                                            </div>
                                        </>
                                    ) : onlyNew &&
                                        Object.keys(baselines).length === 0 ? (
                                        <>
                                            <div className="lint-empty__icon">
                                                📌
                                            </div>
                                            <div className="lint-empty__title">
                                                Baseline не задан
                                            </div>
                                            <div className="lint-empty__hint">
                                                Примите baseline хотя бы для
                                                одного домена, чтобы «новые»
                                                начали считаться. Кнопка
                                                «Принять для всех» в фильтрах
                                                выше.
                                            </div>
                                            <button
                                                className="btn"
                                                onClick={handleTakeBaselineAll}
                                                style={{ marginTop: 12 }}
                                            >
                                                Принять для всех
                                            </button>
                                        </>
                                    ) : onlyNew ? (
                                        <>
                                            <div className="lint-empty__icon">
                                                ✓
                                            </div>
                                            <div className="lint-empty__title">
                                                Новых проблем нет
                                            </div>
                                            <div className="lint-empty__hint">
                                                Все проблемы уже в baseline. С
                                                момента принятия baseline
                                                ничего не появилось.
                                            </div>
                                            <button
                                                className="btn"
                                                onClick={() => setOnlyNew(false)}
                                                style={{ marginTop: 12 }}
                                            >
                                                Показать все проблемы
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="lint-empty__icon">
                                                🔍
                                            </div>
                                            <div className="lint-empty__title">
                                                Ничего не найдено по текущим
                                                фильтрам
                                            </div>
                                            <button
                                                className="btn"
                                                onClick={resetFilters}
                                                style={{ marginTop: 12 }}
                                            >
                                                Сбросить фильтры
                                            </button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                grouped.map((g) => {
                                    const isOpen = expandedGroups.has(g.key);
                                    const displayed = g.issues.slice(
                                        0,
                                        groupLimit,
                                    );
                                    const hasMore =
                                        g.issues.length > groupLimit;
                                    const visibleSevCount =
                                        g.issues.filter(
                                            (i) =>
                                                i.severity === g.severity,
                                        ).length;
                                    return (
                                        <div
                                            key={g.key}
                                            className={
                                                "lint-rule lint-rule--" +
                                                g.severity
                                            }
                                        >
                                            <button
                                                className="lint-rule__head"
                                                onClick={() =>
                                                    toggleGroup(g.key)
                                                }
                                            >
                                                <MIcon
                                                    name={
                                                        isOpen
                                                            ? "expand_more"
                                                            : "chevron_right"
                                                    }
                                                    size="sm"
                                                />
                                                <span
                                                    style={{
                                                        display:
                                                            "inline-block",
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        background:
                                                            SEVERITY_COLOR[
                                                            g.severity
                                                            ],
                                                        flexShrink: 0,
                                                    }}
                                                    title={
                                                        g.severity === "error"
                                                            ? "Ошибка"
                                                            : g.severity ===
                                                                "warning"
                                                                ? "Предупреждение"
                                                                : "Рекомендация"
                                                    }
                                                />
                                                <span className="lint-rule__title">
                                                    {g.title}
                                                </span>
                                                {g.subtitle && (
                                                    <span
                                                        className="lint-rule__subtitle"
                                                        style={{
                                                            fontSize: 11,
                                                            color: "var(--text-500)",
                                                            marginLeft: 4,
                                                        }}
                                                    >
                                                        {g.subtitle}
                                                    </span>
                                                )}
                                                {groupBy === "rule" && (
                                                    <span className="lint-rule__category">
                                                        {
                                                            CATEGORY_LABELS[
                                                            g.category
                                                            ]
                                                        }
                                                    </span>
                                                )}
                                                {groupBy === "rule" && (
                                                    <span
                                                        role="button"
                                                        tabIndex={0}
                                                        className="lint-rule__cheatsheet-link"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openCheatsheet(
                                                                CATEGORY_TO_CHEATSHEET[
                                                                g.category
                                                                ] ||
                                                                "validation-errors",
                                                            );
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                "Enter" ||
                                                                e.key === " "
                                                            ) {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                openCheatsheet(
                                                                    CATEGORY_TO_CHEATSHEET[
                                                                    g
                                                                        .category
                                                                    ] ||
                                                                    "validation-errors",
                                                                );
                                                            }
                                                        }}
                                                        title="Открыть шпаргалку по этой категории"
                                                        style={{
                                                            display:
                                                                "inline-flex",
                                                            alignItems:
                                                                "center",
                                                            padding: "2px 4px",
                                                            borderRadius: 4,
                                                            cursor: "pointer",
                                                            color: "var(--text-500)",
                                                        }}
                                                    >
                                                        <MIcon
                                                            name="menu_book"
                                                            size="sm"
                                                        />
                                                    </span>
                                                )}
                                                {visibleSevCount <
                                                    g.issues.length &&
                                                    visibleSevCount > 0 && (
                                                        <span
                                                            className="lint-rule__category"
                                                            title={`Из ${g.issues.length} проблем ${visibleSevCount} — ${g.severity}`}
                                                        >
                                                            {
                                                                visibleSevCount
                                                            }
                                                            /
                                                            {g.issues.length}
                                                        </span>
                                                    )}
                                                <span className="lint-rule__count">
                                                    {g.issues.length}
                                                </span>
                                            </button>

                                            {isOpen && (
                                                <div className="lint-rule__body">
                                                    {displayed.map(
                                                        (issue, i) => (
                                                            <IssueRow
                                                                key={i}
                                                                issue={issue}
                                                                isNew={
                                                                    isIssueNew(
                                                                        issue,
                                                                    ) === true
                                                                }
                                                                onClick={() =>
                                                                    openIssueInEditor(
                                                                        issue,
                                                                    )
                                                                }
                                                                onEntityClick={
                                                                    issue.entityFqid
                                                                        ? () =>
                                                                            openEntity(
                                                                                issue.entityFqid!,
                                                                            )
                                                                        : undefined
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                    {hasMore && (
                                                        <div
                                                            style={{
                                                                padding:
                                                                    "8px 16px",
                                                                textAlign:
                                                                    "center",
                                                            }}
                                                        >
                                                            <button
                                                                className="btn"
                                                                onClick={() =>
                                                                    setGroupLimit(
                                                                        (n) =>
                                                                            n +
                                                                            ISSUES_PER_GROUP_LIMIT,
                                                                    )
                                                                }
                                                            >
                                                                Показать ещё{" "}
                                                                {
                                                                    ISSUES_PER_GROUP_LIMIT
                                                                }{" "}
                                                                (осталось{" "}
                                                                {g.issues
                                                                    .length -
                                                                    groupLimit}
                                                                )
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ IssueRow ============

interface IssueRowProps {
    issue: LintIssue;
    isNew: boolean;
    onClick: () => void;
    onEntityClick?: () => void;
}

function IssueRow({ issue, isNew, onClick, onEntityClick }: IssueRowProps) {
    const entityId = issue.entityFqid ? issue.entityFqid.split("/")[1] : null;
    const line =
        typeof (issue as any).line === "number" ? (issue as any).line : null;

    return (
        <div
            className={
                "lint-issue lint-issue--clickable" +
                (isNew ? " lint-issue--new" : "")
            }
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            title="Открыть в редакторе на этой строке"
        >
            {isNew && (
                <span
                    className="lint-issue__new-badge"
                    title="Появилась после принятия baseline"
                >
                    🔥 new
                </span>
            )}
            <div className="lint-issue__message">{issue.message}</div>
            {issue.hint && (
                <div className="lint-issue__hint">
                    <MIcon name="lightbulb" size="sm" />
                    {issue.hint}
                </div>
            )}
            <div className="lint-issue__context">
                {issue.entityFqid && (
                    <button
                        className="lint-issue__link"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEntityClick?.();
                        }}
                        title="Открыть сущность в каталоге"
                    >
                        <MIcon name="data_object" size="sm" />
                        {entityId}
                        {issue.attributeId && `.${issue.attributeId}`}
                    </button>
                )}
                {!issue.entityFqid && issue.domainId && (
                    <code className="lint-issue__link-static">
                        {issue.domainId}
                    </code>
                )}
                {issue.propertyPath && (
                    <span
                        className="lint-issue__path"
                        title="Путь в YAML"
                        style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10,
                            color: "var(--text-500)",
                        }}
                    >
                        {issue.propertyPath}
                    </span>
                )}
                {line != null && (
                    <span
                        className="lint-issue__line"
                        title="Строка в файле"
                        style={{
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: 10,
                            color: "var(--text-500)",
                        }}
                    >
                        :{line}
                    </span>
                )}
                <span className="lint-issue__editor-hint">
                    <MIcon name="open_in_new" size="sm" />
                    В редакторе
                </span>
            </div>
        </div>
    );
}