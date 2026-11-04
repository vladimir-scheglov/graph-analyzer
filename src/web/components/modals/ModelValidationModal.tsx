import React, { useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import {
    summarizeValidation,
    ValidationIssue,
    IssueSeverity,
    IssueCategory,
    IssueAction,
} from "../../lib/model/validation";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { openFileInEditor } from "../../lib/open-file";
import type { LintReport } from "../../../shared/lint-types";
import { alertDialog } from "../../lib/dialogs";

// ============ Константы ============

const SEVERITY_LABELS: Record<IssueSeverity, string> = {
    error: "Ошибки",
    warning: "Предупреждения",
    info: "Информация",
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
    references: "Ссылочная целостность",
    structure: "Структура модели",
    content: "Содержимое",
    orphans: "Сироты",
    domains: "Домены",
};

const CATEGORY_ICONS: Record<IssueCategory, string> = {
    references: "link_off",
    structure: "account_tree",
    content: "article",
    orphans: "call_missed_outgoing",
    domains: "folder_off",
};

const CATEGORY_ORDER: IssueCategory[] = [
    "references",
    "structure",
    "content",
    "orphans",
    "domains",
];

type GroupMode = "category" | "severity";

type SeverityFilter = IssueSeverity | "all";

// ============ KPI card ============

function KpiCard({
    label,
    value,
    severity,
    icon,
    onClick,
}: {
    label: string;
    value: number | string;
    severity: "err" | "warn" | "info" | "ok" | "neutral";
    icon: string;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            className={"mv-kpi mv-kpi--" + severity + (onClick ? " mv-kpi--clickable" : "")}
            onClick={onClick}
            disabled={!onClick}
        >
            <MIcon name={icon} size="sm" />
            <div className="mv-kpi__value">{value}</div>
            <div className="mv-kpi__label">{label}</div>
        </button>
    );
}

// ============ Issue card ============

function IssueCard({
    issue,
    isExpanded,
    onToggle,
    onGoToFqid,
    onGoToDomain,
    onAction,
}: {
    issue: ValidationIssue;
    isExpanded: boolean;
    onToggle: () => void;
    onGoToFqid: (fqid: string) => void;
    onGoToDomain: (domainId: string) => void;
    onAction: (action: IssueAction) => void;
}) {
    const severityClass = "mv-issue--" + issue.severity;

    // Парсим samples на кликабельные / не-кликабельные
    const parsedSamples = useMemo(
        () =>
            issue.samples.map((s) => {
                const isFqid = /^[a-z0-9][\w.-]*\.[a-z0-9][\w.-]*\//i.test(s.trim());
                const isDomain = /^[a-z0-9][\w.-]*\.[a-z0-9][\w.-]*$/i.test(
                    s.trim(),
                );
                return { raw: s, isFqid, isDomain };
            }),
        [issue.samples],
    );

    return (
        <div className={"mv-issue " + severityClass}>
            <button
                type="button"
                className="mv-issue__head"
                onClick={onToggle}
            >
                <MIcon name={isExpanded ? "expand_more" : "chevron_right"} size="sm" />
                <span className="mv-issue__title">{issue.title}</span>
                <span className={"mv-issue__impact mv-issue__impact--" + Math.min(Math.floor(issue.impact / 3), 3)}>
                    {issue.impact >= 7 ? "высокий" : issue.impact >= 4 ? "средний" : "низкий"}
                </span>
                <span className="mv-issue__count">{issue.count}</span>
            </button>

            <div className="mv-issue__description">{issue.description}</div>

            {isExpanded && (
                <div className="mv-issue__body">
                    <div className="mv-issue__hint">
                        <MIcon name="lightbulb" size="sm" />
                        <span>{issue.hint}</span>
                    </div>

                    {issue.samples.length > 0 && (
                        <div className="mv-issue__samples-block">
                            <div className="mv-issue__samples-title">
                                Примеры ({issue.samples.length}
                                {issue.count > issue.samples.length &&
                                    ` из ${issue.count}`}
                                )
                            </div>
                            <div className="mv-issue__samples">
                                {parsedSamples.map((s, i) => {
                                    if (s.isFqid) {
                                        return (
                                            <button
                                                key={i}
                                                type="button"
                                                className="mv-issue__sample mv-issue__sample--link"
                                                onClick={() => onGoToFqid(s.raw)}
                                                title={`Открыть ${s.raw} в каталоге`}
                                            >
                                                <MIcon name="data_object" size="sm" />
                                                <span>{s.raw}</span>
                                            </button>
                                        );
                                    }
                                    if (s.isDomain) {
                                        return (
                                            <button
                                                key={i}
                                                type="button"
                                                className="mv-issue__sample mv-issue__sample--link"
                                                onClick={() => onGoToDomain(s.raw)}
                                                title={`Открыть схему ${s.raw}`}
                                            >
                                                <MIcon name="folder" size="sm" />
                                                <span>{s.raw}</span>
                                            </button>
                                        );
                                    }
                                    return (
                                        <div key={i} className="mv-issue__sample">
                                            {s.raw}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {issue.actions.length > 0 && (
                        <div className="mv-issue__actions">
                            {issue.actions.map((a) => (
                                <button
                                    key={a.kind}
                                    type="button"
                                    className="btn btn--small"
                                    onClick={() => onAction(a)}
                                >
                                    <MIcon name={a.icon} size="sm" />
                                    {a.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============ Lint summary (collapsible) ============

function LintSummaryBlock({
    lintReport,
    onOpenLint,
}: {
    lintReport: LintReport;
    onOpenLint: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const stats = lintReport.stats;
    const topRules = stats.byRule.slice(0, 10);

    return (
        <div className="mv-lint">
            <button
                type="button"
                className="mv-lint__head"
                onClick={() => setExpanded(!expanded)}
            >
                <MIcon name={expanded ? "expand_more" : "chevron_right"} size="sm" />
                <MIcon name="science" size="sm" />
                <span className="mv-lint__title">Правила схем (линтер)</span>
                <span className="mv-lint__total">{stats.total}</span>
                <span className="mv-lint__counters">
                    {stats.bySeverity.error > 0 && (
                        <span className="mv-lint__counter mv-lint__counter--error">
                            {stats.bySeverity.error} err
                        </span>
                    )}
                    {stats.bySeverity.warning > 0 && (
                        <span className="mv-lint__counter mv-lint__counter--warning">
                            {stats.bySeverity.warning} warn
                        </span>
                    )}
                </span>
            </button>

            {expanded && (
                <div className="mv-lint__body">
                    {stats.total === 0 ? (
                        <div className="mv-lint__empty">
                            <MIcon name="check_circle" size="sm" />
                            Схемы соответствуют правилам линтера
                        </div>
                    ) : (
                        <>
                            {topRules.length > 0 && (
                                <div className="mv-lint__rules">
                                    {topRules.map((r) => (
                                        <button
                                            key={r.ruleId}
                                            type="button"
                                            className={"mv-lint__rule mv-lint__rule--" + r.severity}
                                            onClick={onOpenLint}
                                            title={`${r.ruleId}\nНажмите, чтобы открыть линтер`}
                                        >
                                            <span className="mv-lint__rule-dot" />
                                            <span className="mv-lint__rule-name">{r.rule}</span>
                                            <span className="mv-lint__rule-count">{r.count}</span>
                                        </button>
                                    ))}
                                    {stats.byRule.length > topRules.length && (
                                        <div className="mv-lint__more">
                                            …и ещё {stats.byRule.length - topRules.length} правил
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="mv-lint__actions">
                                <button className="btn btn--small" onClick={onOpenLint}>
                                    Открыть линтер →
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ============ Main ============

export function ModelValidationModal() {
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);
    const open = useGraphStore((s) => s.modelValidationOpen);

    useHelpEscape(open, showHelp, setShowHelp);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
    const [categoryFilter, setCategoryFilter] = useState<IssueCategory | "all">(
        "all",
    );
    const [query, setQuery] = useState("");
    const [groupMode, setGroupMode] = useState<GroupMode>("category");

    const summary = useMemo(
        () => (index ? summarizeValidation(index.stats, index.orphans, index) : null),
        [index],
    );

    const toggle = (title: string) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            if (s.has(title)) s.delete(title);
            else s.add(title);
            return s;
        });
    };

    const openEntity = useCallback((fqid: string) => {
        // FQID может содержать "→ ref" или " (тип)" в конце — извлечём первую часть
        const clean = fqid.split(/\s+/)[0].split("#")[0];
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setEntityCatalogInitialFqid(clean.toLowerCase());
        st.setEntityCatalogOpen(true);
    }, []);

    const openDomainSchema = useCallback((domainId: string) => {
        const clean = domainId.split(/\s+/)[0];
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setDomainSchemaDomainId(clean.toLowerCase());
        st.setDomainSchemaOpen(true);
    }, []);

    const openLint = useCallback(() => {
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setLintOpen(true);
    }, []);

    const openCatalog = useCallback(() => {
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setEntityCatalogInitialFqid(null);
        st.setEntityCatalogOpen(true);
    }, []);

    const openHealth = useCallback(() => {
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setHealthDashboardOpen(true);
    }, []);

    const openPii = useCallback(() => {
        const st = useGraphStore.getState();
        st.setModelValidationOpen(false);
        st.setPiiOpen(true);
    }, []);

    const handleAction = useCallback(
        (a: IssueAction) => {
            switch (a.kind) {
                case "lint":
                    openLint();
                    break;
                case "catalog":
                    openCatalog();
                    break;
                case "health":
                    openHealth();
                    break;
                case "pii":
                    openPii();
                    break;
                case "schema":
                    // schema без конкретного домена — открываем первую affectedDomains
                    // если она есть, иначе просто линтер
                    openLint();
                    break;
            }
        },
        [openLint, openCatalog, openHealth, openPii],
    );

    // ── Фильтрация issues ──
    const filteredIssues = useMemo(() => {
        if (!summary) return [];
        let issues = summary.issues;

        if (severityFilter !== "all") {
            issues = issues.filter((i) => i.severity === severityFilter);
        }
        if (categoryFilter !== "all") {
            issues = issues.filter((i) => i.category === categoryFilter);
        }

        const q = query.trim().toLowerCase();
        if (q) {
            issues = issues.filter(
                (i) =>
                    i.title.toLowerCase().includes(q) ||
                    i.description.toLowerCase().includes(q) ||
                    i.hint.toLowerCase().includes(q),
            );
        }

        // Сортировка по impact убыванию, потом по count
        return issues.slice().sort((a, b) => {
            if (b.impact !== a.impact) return b.impact - a.impact;
            return b.count - a.count;
        });
    }, [summary, severityFilter, categoryFilter, query]);

    // ── Группировка ──
    const grouped = useMemo(() => {
        if (groupMode === "severity") {
            const bySeverity: Record<IssueSeverity, ValidationIssue[]> = {
                error: [],
                warning: [],
                info: [],
            };
            filteredIssues.forEach((i) => bySeverity[i.severity].push(i));
            return (["error", "warning", "info"] as IssueSeverity[])
                .filter((s) => bySeverity[s].length > 0)
                .map((s) => ({
                    key: s,
                    label: SEVERITY_LABELS[s],
                    icon:
                        s === "error"
                            ? "error"
                            : s === "warning"
                                ? "warning"
                                : "info",
                    severity: s as IssueSeverity | null,
                    issues: bySeverity[s],
                }));
        }

        // по категории
        const byCat: Record<IssueCategory, ValidationIssue[]> = {
            references: [],
            structure: [],
            content: [],
            orphans: [],
            domains: [],
        };
        filteredIssues.forEach((i) => byCat[i.category].push(i));
        return CATEGORY_ORDER.filter((c) => byCat[c].length > 0).map((c) => ({
            key: c,
            label: CATEGORY_LABELS[c],
            icon: CATEGORY_ICONS[c],
            severity: null as IssueSeverity | null,
            issues: byCat[c],
        }));
    }, [filteredIssues, groupMode]);

    // ── Quick filters с count ──
    const severityCounts = summary?.counts || { error: 0, warning: 0, info: 0 };

    // ── Экспорт ──
    const handleExportMD = async () => {
        if (!summary || !index) return;
        const lines: string[] = [];
        lines.push("# Валидация модели");
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");
        lines.push("## Сводка");
        lines.push("");
        lines.push("| Метрика | Значение |");
        lines.push("| --- | ---: |");
        lines.push(`| Здоровье модели | ${summary.health} / 100 (${summary.grade}) |`);
        lines.push(`| Всего проблем | ${summary.totalIssues} |`);
        lines.push(`| Ошибки | ${severityCounts.error} |`);
        lines.push(`| Предупреждения | ${severityCounts.warning} |`);
        lines.push(`| Информация | ${severityCounts.info} |`);
        lines.push("");

        const sorted = summary.issues
            .slice()
            .sort((a, b) => b.impact - a.impact);

        sorted.forEach((issue) => {
            const icon =
                issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
            lines.push(`## ${icon} ${issue.title} — ${issue.count}`);
            lines.push("");
            lines.push(
                `**Категория:** ${CATEGORY_LABELS[issue.category]} · **Impact:** ${issue.impact}/10`,
            );
            lines.push("");
            lines.push(issue.description);
            lines.push("");
            lines.push(`**Как исправить:** ${issue.hint}`);
            lines.push("");
            if (issue.samples.length > 0) {
                lines.push("**Примеры:**");
                lines.push("");
                issue.samples.slice(0, 10).forEach((s) => lines.push(`- \`${s}\``));
                if (issue.count > 10) {
                    lines.push(`- _…и ещё ${issue.count - 10}_`);
                }
                lines.push("");
            }
        });

        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore
                .getState()
                .showSnackbar("Отчёт валидации скопирован в буфер");
        } catch (e: any) {
            await alertDialog("Не удалось скопировать", { detail: e.message });
        }
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() =>
                useGraphStore.getState().setModelValidationOpen(false)
            }
        >
            <div
                className="help-modal model-validation-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="science" size="sm" />
                        <span className="icon-label">Валидация модели</span>
                        {summary && summary.totalIssues > 0 && (
                            <span className="help-modal__badge">{summary.totalIssues}</span>
                        )}
                        {summary && (
                            <span
                                className={
                                    "help-modal__badge mv-grade-badge mv-grade-badge--" +
                                    summary.grade.toLowerCase()
                                }
                            >
                                {summary.grade}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__icon-btn"
                            onClick={handleExportMD}
                            disabled={!summary || summary.totalIssues === 0}
                            title="Скопировать отчёт в Markdown"
                        >
                            <MIcon name="content_copy" />
                        </button>
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Что это?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() =>
                                useGraphStore.getState().setModelValidationOpen(false)
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

                {index && summary && (
                    <div className="mv-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Автоматический обход всей модели: поиск циклов, битых ссылок,
                                    дублей, сирот, конфликтов миксинов. Отличается от линтера:
                                    валидация ищет <strong>структурные</strong> ошибки,
                                    линтер — <strong>стилевые и семантические</strong> правила.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Здоровье модели">
                                <HelpText>
                                    Интегральная оценка 0–100 по формуле:
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <code>100 − min(errors × 8, 60) − min(warnings × 2, 25) − min(info × 0.3, 10)</code>
                                    </li>
                                    <li>
                                        <strong>A</strong> — 90+. Модель чистая, косметические
                                        замечания.
                                    </li>
                                    <li>
                                        <strong>B</strong> — 75–89. Хорошо, есть что подчистить.
                                    </li>
                                    <li>
                                        <strong>C</strong> — 60–74. Требует внимания.
                                    </li>
                                    <li>
                                        <strong>D</strong> — 40–59. Проблем много, чинить надо.
                                    </li>
                                    <li>
                                        <strong>E</strong> — &lt; 40. Критично.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Уровни проблем">
                                <HelpList>
                                    <li>
                                        <strong>Ошибки</strong> — модель сломана: циклы
                                        наследования, ссылки на несуществующие сущности,
                                        дубликаты entityId. Блокируют публикацию.
                                    </li>
                                    <li>
                                        <strong>Предупреждения</strong> — модель работает, но
                                        есть потенциальные проблемы: сироты, атрибуты без views,
                                        конфликты миксинов.
                                    </li>
                                    <li>
                                        <strong>Информация</strong> — не проблема, а факт: пустые
                                        домены (норма для миксинов), сущности без собственных
                                        атрибутов, осиротевшие элементы.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Категории">
                                <HelpList>
                                    <li>
                                        <strong>Ссылочная целостность</strong> — битые FQID-ссылки.
                                        Самая критичная категория: они ломают резолв сущностей.
                                    </li>
                                    <li>
                                        <strong>Структура модели</strong> — циклы в наследовании,
                                        дубликаты id между доменами. Ломают логику.
                                    </li>
                                    <li>
                                        <strong>Содержимое</strong> — атрибуты без views, конфликты
                                        миксинов, сущности без атрибутов. Косметика, но мешает
                                        читать модель.
                                    </li>
                                    <li>
                                        <strong>Сироты</strong> — элементы, которые нигде не
                                        вызываются. Кандидаты на удаление.
                                    </li>
                                    <li>
                                        <strong>Домены</strong> — пустые домены без сущностей.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Приоритет (impact)">
                                <HelpText>
                                    У каждой проблемы — числовой приоритет 1..10. От него
                                    зависит порядок в списке (сначала высокий).
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Высокий (7–10)</strong> — ошибки: циклы, битые
                                        ссылки, дубликаты. Чините первыми.
                                    </li>
                                    <li>
                                        <strong>Средний (4–6)</strong> — предупреждения: миксины,
                                        атрибуты без views, сироты-сущности.
                                    </li>
                                    <li>
                                        <strong>Низкий (1–3)</strong> — информационные: осиротевшие
                                        элементы, пустые домены.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Samples — кликабельные">
                                <HelpList>
                                    <li>
                                        <strong>FQID</strong> (например, <code>domain.tld/Entity</code>) —
                                        клик открывает сущность в каталоге с impact-анализом.
                                    </li>
                                    <li>
                                        <strong>FQDN домена</strong> (например, <code>domain.tld</code>) —
                                        клик открывает схему домена.
                                    </li>
                                    <li>
                                        <strong>Текстовые</strong> — просто текст, без действия.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Фильтры и поиск">
                                <HelpList>
                                    <li>
                                        <strong>Severity</strong> — Ошибки / Предупреждения /
                                        Информация / Все. Показывает только выбранный уровень.
                                    </li>
                                    <li>
                                        <strong>Категория</strong> — Ссылки / Структура /
                                        Содержимое / Сироты / Домены.
                                    </li>
                                    <li>
                                        <strong>Поиск</strong> — по названию, описанию и
                                        рекомендации проблемы.
                                    </li>
                                    <li>
                                        <strong>Группировка</strong> — по категории (по умолчанию)
                                        или по severity.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Связанные инструменты">
                                <HelpList>
                                    <li>
                                        <strong>Линтер схем</strong> — стилевые и семантические
                                        правила. Валидация и линтер — <em>разные</em> системы,
                                        дополняют друг друга.
                                    </li>
                                    <li>
                                        <strong>Health Dashboard</strong> — сводка по доменам:
                                        Sonar, PII, Martin, размеры. Для верхнеуровневой картины.
                                    </li>
                                    <li>
                                        <strong>PII-атрибуты</strong> — GDPR / 152-ФЗ.
                                    </li>
                                    <li>
                                        <strong>Каталог сущностей</strong> — все сущности модели,
                                        поиск по фильтрам.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Проверка — статическая. Некоторые проблемы видны только
                                        на сервере (например, constraint-конфликты с БД).
                                    </li>
                                    <li>
                                        «Осиротевшие» — эвристика. Сущность может быть технической
                                        (наполняется автоматизацией), но помечена как сирота.
                                    </li>
                                    <li>
                                        Impact и health — эвристические формулы. Не истина, а
                                        указание на приоритет.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {!showHelp && (
                            <>
                                {/* ── KPI ── */}
                                <div className="mv-kpi-grid">
                                    <button
                                        type="button"
                                        className={
                                            "mv-health-card mv-health-card--" +
                                            summary.grade.toLowerCase()
                                        }
                                        title="Интегральная оценка здоровья модели"
                                    >
                                        <div className="mv-health-card__value">{summary.health}</div>
                                        <div className="mv-health-card__grade">
                                            {summary.grade}
                                        </div>
                                        <div className="mv-health-card__label">
                                            Здоровье модели
                                        </div>
                                    </button>

                                    <KpiCard
                                        label="Ошибки"
                                        value={severityCounts.error}
                                        severity="err"
                                        icon="error"
                                        onClick={() =>
                                            setSeverityFilter(
                                                severityFilter === "error" ? "all" : "error",
                                            )
                                        }
                                    />
                                    <KpiCard
                                        label="Предупреждения"
                                        value={severityCounts.warning}
                                        severity="warn"
                                        icon="warning"
                                        onClick={() =>
                                            setSeverityFilter(
                                                severityFilter === "warning" ? "all" : "warning",
                                            )
                                        }
                                    />
                                    <KpiCard
                                        label="Информация"
                                        value={severityCounts.info}
                                        severity="info"
                                        icon="info"
                                        onClick={() =>
                                            setSeverityFilter(
                                                severityFilter === "info" ? "all" : "info",
                                            )
                                        }
                                    />
                                    <KpiCard
                                        label="Всего проблем"
                                        value={summary.totalIssues}
                                        severity="neutral"
                                        icon="bug_report"
                                        onClick={() => {
                                            setSeverityFilter("all");
                                            setCategoryFilter("all");
                                        }}
                                    />
                                </div>

                                {/* ── Toolbar ── */}
                                <div className="mv-toolbar">
                                    <div className="mv-toolbar__quick">
                                        <button
                                            type="button"
                                            className={
                                                "mv-quick-btn" +
                                                (severityFilter === "all" && categoryFilter === "all"
                                                    ? " active"
                                                    : "")
                                            }
                                            onClick={() => {
                                                setSeverityFilter("all");
                                                setCategoryFilter("all");
                                            }}
                                        >
                                            Все ({summary.totalIssues})
                                        </button>
                                        {severityCounts.error > 0 && (
                                            <button
                                                type="button"
                                                className={
                                                    "mv-quick-btn mv-quick-btn--err" +
                                                    (severityFilter === "error" ? " active" : "")
                                                }
                                                onClick={() =>
                                                    setSeverityFilter(
                                                        severityFilter === "error" ? "all" : "error",
                                                    )
                                                }
                                            >
                                                <MIcon name="error" size="sm" />
                                                Ошибки ({severityCounts.error})
                                            </button>
                                        )}
                                        {severityCounts.warning > 0 && (
                                            <button
                                                type="button"
                                                className={
                                                    "mv-quick-btn mv-quick-btn--warn" +
                                                    (severityFilter === "warning" ? " active" : "")
                                                }
                                                onClick={() =>
                                                    setSeverityFilter(
                                                        severityFilter === "warning" ? "all" : "warning",
                                                    )
                                                }
                                            >
                                                <MIcon name="warning" size="sm" />
                                                Предупр. ({severityCounts.warning})
                                            </button>
                                        )}
                                        {severityCounts.info > 0 && (
                                            <button
                                                type="button"
                                                className={
                                                    "mv-quick-btn mv-quick-btn--info" +
                                                    (severityFilter === "info" ? " active" : "")
                                                }
                                                onClick={() =>
                                                    setSeverityFilter(
                                                        severityFilter === "info" ? "all" : "info",
                                                    )
                                                }
                                            >
                                                <MIcon name="info" size="sm" />
                                                Инфо ({severityCounts.info})
                                            </button>
                                        )}
                                    </div>

                                    <div className="mv-toolbar__right">
                                        <div className="mv-search">
                                            <MIcon name="search" size="sm" />
                                            <input
                                                type="text"
                                                placeholder="Поиск по проблемам…"
                                                value={query}
                                                onChange={(e) => setQuery(e.target.value)}
                                                spellCheck={false}
                                            />
                                            {query && (
                                                <button
                                                    className="mv-search__clear"
                                                    onClick={() => setQuery("")}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>

                                        <select
                                            className="mv-select"
                                            value={groupMode}
                                            onChange={(e) =>
                                                setGroupMode(e.target.value as GroupMode)
                                            }
                                            title="Группировка"
                                        >
                                            <option value="category">По категории</option>
                                            <option value="severity">По severity</option>
                                        </select>
                                    </div>
                                </div>

                                {/* ── Category chips ── */}
                                {groupMode === "category" && (
                                    <div className="mv-categories">
                                        {CATEGORY_ORDER.map((cat) => {
                                            const count = summary.categoryCounts[cat];
                                            if (count === 0) return null;
                                            const active = categoryFilter === cat;
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    className={
                                                        "mv-category-chip" + (active ? " active" : "")
                                                    }
                                                    onClick={() =>
                                                        setCategoryFilter(active ? "all" : cat)
                                                    }
                                                >
                                                    <MIcon name={CATEGORY_ICONS[cat]} size="sm" />
                                                    {CATEGORY_LABELS[cat]}
                                                    <span className="mv-category-chip__count">{count}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* ── List ── */}
                                <div className="mv-content">
                                    {filteredIssues.length === 0 ? (
                                        <div className="mv-empty">
                                            {summary.totalIssues === 0 ? (
                                                <>
                                                    <MIcon
                                                        name="check_circle"
                                                        size="xl"
                                                        style={{ color: "var(--success)" }}
                                                    />
                                                    <div className="mv-empty__title">
                                                        Модель чистая
                                                    </div>
                                                    <div className="mv-empty__hint">
                                                        Структурных проблем не обнаружено. Стилевые
                                                        правила — в линтере схем.
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <MIcon name="filter_alt_off" size="xl" />
                                                    <div className="mv-empty__title">
                                                        Ничего не найдено по фильтрам
                                                    </div>
                                                    <button
                                                        className="btn"
                                                        onClick={() => {
                                                            setSeverityFilter("all");
                                                            setCategoryFilter("all");
                                                            setQuery("");
                                                        }}
                                                        style={{ marginTop: 8 }}
                                                    >
                                                        Сбросить фильтры
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        grouped.map((group) => (
                                            <div key={group.key} className="mv-group">
                                                <div className="mv-group__head">
                                                    <MIcon name={group.icon} size="sm" />
                                                    <span className="mv-group__title">{group.label}</span>
                                                    <span className="mv-group__count">
                                                        {group.issues.reduce((s, i) => s + i.count, 0)}
                                                    </span>
                                                </div>
                                                <div className="mv-group__body">
                                                    {group.issues.map((issue) => (
                                                        <IssueCard
                                                            key={issue.title}
                                                            issue={issue}
                                                            isExpanded={expanded.has(issue.title)}
                                                            onToggle={() => toggle(issue.title)}
                                                            onGoToFqid={openEntity}
                                                            onGoToDomain={openDomainSchema}
                                                            onAction={handleAction}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* ── Lint summary (свёрнутый, внизу) ── */}
                                <LintSummaryBlock
                                    lintReport={index.lint.lintReport}
                                    onOpenLint={openLint}
                                />
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}