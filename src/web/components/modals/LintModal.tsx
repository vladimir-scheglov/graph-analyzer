import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import type {
    LintIssue,
    LintSeverity,
    LintRuleCategory
} from '../../../shared/lint-types';
import { ModalHelp, HelpSection, HelpText, HelpList, HelpButton } from '../common/ModalHelp';
import { openFileInEditor } from '../../lib/open-file';
import { useLintBaselines } from '../../hooks/useLintBaselines';
import { baselineKey, compareWithBaseline } from '../../../core/analyzer/lint-baseline';
import { alertDialog, confirmDialog } from '../../lib/dialogs';

const CATEGORY_LABELS: Record<LintRuleCategory, string> = {
    reference: 'Ссылочная целостность',
    semantic: 'Семантика',
    naming: 'Именование',
    validation: 'Валидация',
    required: 'Обязательные поля',
    recommended: 'Рекомендации',
    uirules: 'UI Rules',
};

const SEVERITY_LABELS: Record<LintSeverity, string> = {
    error: 'Ошибки',
    warning: 'Предупреждения',
    info: 'Рекомендации'
};

const SEVERITY_ORDER: LintSeverity[] = ['error', 'warning', 'info'];
const CATEGORY_TO_CHEATSHEET: Record<LintRuleCategory, string> = {
    reference: "linkages",
    semantic: "dataTypes",
    naming: "reserved-names",
    validation: "entities",
    required: "validation-errors",
    recommended: "validation-errors",
    uirules: "uiRules",
};

export function LintModal() {
    const { index, loading, error } = useModelIndex();

    const [filterCategory, setFilterCategory] = useState<LintRuleCategory | ''>('');
    const [filterDomain, setFilterDomain] = useState('');
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
    const [showHelp, setShowHelp] = useState(false);
    const [onlyNew, setOnlyNew] = useState(false);
    const {
        baselines,
        takeBaseline,
        takeBaselinesBatch,
        clearBaseline,
    } = useLintBaselines();

    const open = useGraphStore(s => s.lintOpen);
    const nodes = useGraphStore(s => s.nodes);

    const report = index?.lint.lintReport ?? null;

    const allDomains = useMemo(() => {
        if (!report) return [] as string[];
        const set = new Set<string>();
        report.issues.forEach((i) => set.add(i.domainId));
        return Array.from(set).sort();
    }, [report]);

    // Для каждого домена с baseline — set ключей issue, которые новые.
    // Домены без baseline в map отсутствуют.
    const newIssueKeysByDomain = useMemo(() => {
        const result = new Map<string, Set<string>>();
        if (!report) return result;
        for (const [domainId, baseline] of Object.entries(baselines)) {
            const domainIssues = report.issues.filter((i) => i.domainId === domainId);
            const cmp = compareWithBaseline(domainIssues, baseline);
            result.set(domainId, new Set(cmp.newIssues.map(baselineKey)));
        }
        return result;
    }, [baselines, report]);

    const handleTakeBaseline = async (domainId: string) => {
        const domainIssues = report?.issues.filter((i) => i.domainId === domainId) || [];
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

        if (
            !(await confirmDialog(
                `Принять текущее состояние ${domainsWithIssues.length} доменов как baseline?\n\n` +
                `Всего проблем: ${report.issues.length}\n` +
                `Будет создан/обновлён baseline для каждого домена из списка.\n\n` +
                `После этого «новыми» будут считаться только те, что появятся в будущем.`,
            ))
        )
            return;

        try {
            await takeBaselinesBatch(domainsWithIssues);
        } catch (e: any) {
            await alertDialog("Ошибка: " + e.message);
        }
    };

    const handleClearBaseline = async (domainId: string) => {
        const ok = await confirmDialog(
            `Удалить baseline для ${domainId}?`,
            {
                detail: "После этого все проблемы этого домена будут считаться «новыми».",
                danger: true,
                confirmLabel: "Удалить",
            },
        );
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

    /**
     * Возвращает true/false для доменов с baseline; null — для доменов
     * без baseline (статус «новизны» неизвестен).
     */
    const isIssueNew = useCallback(
        (issue: LintIssue): boolean | null => {
            const keys = newIssueKeysByDomain.get(issue.domainId);
            if (!keys) return null;
            return keys.has(baselineKey(issue));
        },
        [newIssueKeysByDomain],
    );

    useEffect(() => {
        if (!open) return;
        useGraphStore.getState().setTooltip(null);
        (window as any).__tooltipHovered = false;
    }, [open]);

    const filteredIssues = useMemo(() => {
        if (!report) return [] as LintIssue[];
        return report.issues.filter((i) => {
            if (filterCategory && i.category !== filterCategory) return false;
            if (filterDomain && i.domainId !== filterDomain) return false;
            if (onlyNew) {
                const isNew = isIssueNew(i);
                if (isNew !== true) return false;
            }
            return true;
        });
    }, [report, filterCategory, filterDomain, onlyNew, isIssueNew]);

    // Счётчик «новых» с учётом текущих фильтров, но без учёта onlyNew —
    // чтобы показывать «при включении onlyNew будет показано N».
    const newIssueCount = useMemo(() => {
        if (!report) return 0;
        let count = 0;
        for (const issue of report.issues) {
            if (filterCategory && issue.category !== filterCategory) continue;
            if (filterDomain && issue.domainId !== filterDomain) continue;
            if (isIssueNew(issue) === true) count++;
        }
        return count;
    }, [report, filterCategory, filterDomain, isIssueNew]);

    const unbaselinedDomainCount = useMemo(() => {
        if (!report) return 0;
        const domains = new Set(report.issues.map((i) => i.domainId));
        let count = 0;
        for (const d of domains) if (!baselines[d]) count++;
        return count;
    }, [report, baselines]);

    // Группировка по правилу
    const grouped = useMemo(() => {
        const map = new Map<
            string,
            { ruleId: string; rule: string; severity: LintSeverity; category: LintRuleCategory; issues: LintIssue[] }
        >();
        filteredIssues.forEach((i) => {
            if (!map.has(i.ruleId)) {
                map.set(i.ruleId, {
                    ruleId: i.ruleId,
                    rule: i.rule,
                    severity: i.severity,
                    category: i.category,
                    issues: []
                });
            }
            map.get(i.ruleId)!.issues.push(i);
        });
        return Array.from(map.values()).sort((a, b) => {
            const sOrder = { error: 0, warning: 1, info: 2 };
            if (sOrder[a.severity] !== sOrder[b.severity]) return sOrder[a.severity] - sOrder[b.severity];
            return b.issues.length - a.issues.length;
        });
    }, [filteredIssues]);

    const toggleRule = (ruleId: string) => {
        setExpandedRules((prev) => {
            const s = new Set(prev);
            if (s.has(ruleId)) s.delete(ruleId);
            else s.add(ruleId);
            return s;
        });
    };

    const openEntity = (fqid: string) => {
        useGraphStore.getState().setLintOpen(false);
        useGraphStore.getState().setEntityCatalogInitialFqid(fqid);
        useGraphStore.getState().setEntityCatalogOpen(true);
    };

    /**
     * Открыть YAML-редактор с позиционированием на строке проблемы.
     * Если файл схемы недоступен — fallback на каталог сущностей.
     */
    const openIssueInEditor = (issue: LintIssue) => {
        // filePath ищем по domainId среди узлов графа
        const domainId = issue.domainId;
        const node = nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() ===
                domainId.toLowerCase(),
        );
        const filePath = node?.data.filePath;

        if (!filePath) {
            // Fallback: файла нет (missing/broken/remote без cache) —
            // открываем каталог, если есть сущность
            if (issue.entityFqid) {
                openEntity(issue.entityFqid);
            } else {
                useGraphStore.getState().showSnackbar(
                    "Файл схемы недоступен — откройте домен вручную",
                );
            }
            return;
        }

        // Сначала пробуем открыть файл — если редактор уже открыт
        // на другом файле с несохранёнными правками, пользователь может
        // отменить переключение. Тогда линтер не закрываем и pendingIssue
        // не ставим — иначе он «повиснет» без файла.
        const ok = openFileInEditor(
            filePath,
            issue.entityFqid ?? null,
            domainId,
        );
        if (!ok) return;

        useGraphStore.getState().setLintOpen(false);
        useGraphStore.getState().setYamlViewerPendingIssue(issue);
    };

    const openCheatsheet = (sectionId: string) => {
        useGraphStore.getState().setLintOpen(false);
        useGraphStore.getState().setCheatsheetInitialSection(sectionId);
        useGraphStore.getState().setCheatsheetOpen(true);
    };

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
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="science" size="sm" />
                        <span className="icon-label">Линтер схем</span>
                        {report && (<span className="help-modal__badge">{filteredIssues.length}</span>)}
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
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Что проверяется?" />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setLintOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && report && (
                    <div className="help-modal__body help-modal__body--flush">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Линтер проверяет схемы доменов на соответствие соглашениям:
                                    правила именования, обязательные поля, ссылочную целостность,
                                    типы данных и семантику. Всё, что нарушает норму, попадает в отчёт.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Категории правил">
                                <HelpList>
                                    <li><strong>Ссылочная целостность</strong> — все ли ссылки ведут на существующие сущности и типы.</li>
                                    <li><strong>Семантика</strong> — нет ли дублей, циклов, сущностей-пустышек.</li>
                                    <li><strong>Именование</strong> — camelCase для сущностей и атрибутов, длина id в пределах нормы.</li>
                                    <li><strong>Валидация</strong> — email без regexp, IP как String, дата как String — ловим несоответствия типов.</li>
                                    <li><strong>Обязательные поля</strong> — есть ли <code>name</code> у сущности.</li>
                                    <li><strong>Рекомендации</strong> — есть ли <code>description</code>, <code>label</code> — не блокируют, но улучшают читаемость.</li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Уровни">
                                <HelpText>
                                    <strong>Ошибки</strong> — точно надо править. <strong>Предупреждения</strong> — так
                                    писать не рекомендуется. <strong>Рекомендации</strong> — можно улучшить, но не критично.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Sonar-оценка">
                                <HelpText>
                                    Это взвешенная сводка: 100 — идеал, 0 — очень много проблем.
                                    Вес категории отражает важность: ссылочная целостность влияет
                                    на оценку в 5 раз сильнее, чем рекомендации.
                                </HelpText>
                            </HelpSection>
                        </ModalHelp>
                        {/* ============ Сводка ============ */}
                        <div className="lint-summary">
                            <div className="lint-summary__stat lint-summary__stat--error">
                                <div className="lint-summary__value">{report.stats.bySeverity.error}</div>
                                <div className="lint-summary__label">Ошибок</div>
                            </div>
                            <div className="lint-summary__stat lint-summary__stat--warning">
                                <div className="lint-summary__value">{report.stats.bySeverity.warning}</div>
                                <div className="lint-summary__label">Предупреждений</div>
                            </div>
                            <div className="lint-summary__stat lint-summary__stat--info">
                                <div className="lint-summary__value">{report.stats.bySeverity.info}</div>
                                <div className="lint-summary__label">Рекомендаций</div>
                            </div>
                            <div className="lint-summary__stat lint-summary__stat--score">
                                <div className="lint-summary__value">
                                    {index.lint.sonar.overall.score}
                                </div>
                                <div className="lint-summary__label">
                                    Sonar {index.lint.sonar.overall.grade}
                                </div>
                            </div>
                        </div>

                        {/* ============ Фильтры ============ */}
                        <div className="lint-filters" style={{ flexWrap: "wrap", rowGap: 8 }}>
                            <label className="entity-matrix-filter">
                                <span>Категория:</span>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value as LintRuleCategory | '')}
                                >
                                    <option value="">— все —</option>
                                    {(Object.keys(CATEGORY_LABELS) as LintRuleCategory[]).map((k) => (
                                        <option key={k} value={k}>
                                            {CATEGORY_LABELS[k]} ({report?.stats.byCategory[k] ?? 0})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="entity-matrix-filter">
                                <span>Домен:</span>
                                <select
                                    value={filterDomain}
                                    onChange={(e) => setFilterDomain(e.target.value)}
                                >
                                    <option value="">— все —</option>
                                    {allDomains.map((d) => (
                                        <option key={d} value={d}>
                                            {d}{baselines[d] ? " 📌" : ""}
                                        </option>
                                    ))}
                                </select>
                            </label>

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
                                        onChange={() => setOnlyNew(!onlyNew)}
                                        disabled={Object.keys(baselines).length === 0}
                                    />
                                    <MIcon name="new_releases" size="sm" />
                                    Только новые
                                    {newIssueCount > 0 && (
                                        <span className="lint-baseline-toggle__count">{newIssueCount}</span>
                                    )}
                                </label>

                                {filterDomain ? (
                                    <>
                                        <button
                                            className="btn"
                                            onClick={() => handleTakeBaseline(filterDomain)}
                                            title={
                                                baselines[filterDomain]
                                                    ? `Обновить baseline для ${filterDomain}`
                                                    : `Принять текущее состояние ${filterDomain} как baseline`
                                            }
                                        >
                                            <MIcon name="push_pin" size="sm" />
                                            {baselines[filterDomain] ? "Обновить baseline" : "Принять baseline"}
                                        </button>
                                        {baselines[filterDomain] && (
                                            <button
                                                className="btn btn--danger"
                                                onClick={() => handleClearBaseline(filterDomain)}
                                                title={`Удалить baseline для ${filterDomain}`}
                                            >
                                                <MIcon name="close" size="sm" />
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    unbaselinedDomainCount > 0 && (
                                        <button
                                            className="btn"
                                            onClick={handleTakeBaselineAll}
                                            title="Принять текущее состояние всех доменов с проблемами как baseline"
                                        >
                                            <MIcon name="push_pin" size="sm" />
                                            Принять для всех ({unbaselinedDomainCount})
                                        </button>
                                    )
                                )}
                            </div>
                        </div>

                        {filterDomain && baselines[filterDomain] && report && (() => {
                            const domainIssues = report.issues.filter((i) => i.domainId === filterDomain);
                            const cmp = compareWithBaseline(domainIssues, baselines[filterDomain]);
                            return (
                                <div className="lint-baseline-info">
                                    <MIcon name="push_pin" size="sm" />
                                    <span>
                                        Baseline для <code>{filterDomain}</code> принят{" "}
                                        {new Date(baselines[filterDomain].takenAt).toLocaleString("ru-RU")}
                                    </span>
                                    <span className="lint-baseline-info__stats">
                                        было {cmp.totalBaseline} · сейчас {cmp.totalCurrent}
                                        {cmp.newIssues.length > 0 && (
                                            <span className="lint-baseline-info__new">
                                                {" "}· 🔥 {cmp.newIssues.length} новых
                                            </span>
                                        )}
                                        {cmp.fixedIssues.length > 0 && (
                                            <span className="lint-baseline-info__fixed">
                                                {" "}· ✓ {cmp.fixedIssues.length} исправлено
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })()}

                        {/* ============ Список правил ============ */}
                        <div className="lint-rules">
                            {grouped.length === 0 ? (
                                <div className="lint-empty">
                                    <div className="lint-empty__icon">
                                        {onlyNew && Object.keys(baselines).length > 0 ? "✅" : "✅"}
                                    </div>
                                    <div className="lint-empty__title">
                                        {onlyNew
                                            ? Object.keys(baselines).length === 0
                                                ? "Сначала примите baseline хотя бы для одного домена"
                                                : "Новых проблем нет — только baseline"
                                            : "Ничего не найдено по фильтрам"}
                                    </div>
                                    {onlyNew && unbaselinedDomainCount > 0 && (
                                        <div className="lint-empty__hint">
                                            {unbaselinedDomainCount}{" "}
                                            {unbaselinedDomainCount === 1 ? "домен" : "доменов"} без baseline — их
                                            проблемы скрыты. Нажмите «Принять для всех» или выберите домен и нажмите «Принять baseline».
                                        </div>
                                    )}
                                </div>
                            ) : (
                                grouped.map((g) => {
                                    const isOpen = expandedRules.has(g.ruleId);
                                    return (
                                        <div
                                            key={g.ruleId}
                                            className={'lint-rule lint-rule--' + g.severity}
                                        >
                                            <button
                                                className="lint-rule__head"
                                                onClick={() => toggleRule(g.ruleId)}
                                            >
                                                <MIcon name={isOpen ? 'expand_more' : 'chevron_right'} size="sm" />
                                                <span className="lint-rule__title">{g.rule}</span>
                                                <span className="lint-rule__category">
                                                    {CATEGORY_LABELS[g.category]}
                                                </span>
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    className="lint-rule__cheatsheet-link"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openCheatsheet(
                                                            CATEGORY_TO_CHEATSHEET[g.category] || "validation-errors",
                                                        );
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            openCheatsheet(
                                                                CATEGORY_TO_CHEATSHEET[g.category] || "validation-errors",
                                                            );
                                                        }
                                                    }}
                                                    title="Открыть шпаргалку по этой категории"
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        padding: "2px 4px",
                                                        borderRadius: 4,
                                                        cursor: "pointer",
                                                        color: "var(--text-500)",
                                                    }}
                                                >
                                                    <MIcon name="menu_book" size="sm" />
                                                </span>
                                                <span className="lint-rule__count">{g.issues.length}</span>
                                            </button>

                                            {isOpen && (
                                                <div className="lint-rule__body">
                                                    {g.issues.slice(0, 100).map((issue, i) => (
                                                        <div
                                                            key={i}
                                                            className={
                                                                "lint-issue lint-issue--clickable" +
                                                                (isIssueNew(issue) === true ? " lint-issue--new" : "")
                                                            }
                                                            onClick={() => openIssueInEditor(issue)}
                                                            role="button"
                                                            tabIndex={0}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    openIssueInEditor(issue);
                                                                }
                                                            }}
                                                            title="Открыть в редакторе на этой строке"
                                                        >
                                                            {(() => {
                                                                const isNew = isIssueNew(issue);
                                                                if (isNew !== true) return null;
                                                                return (
                                                                    <span className="lint-issue__new-badge" title="Проблема появилась после baseline">
                                                                        🔥 new
                                                                    </span>
                                                                );
                                                            })()}

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
                                                                            openEntity(issue.entityFqid!);
                                                                        }}
                                                                        title="Открыть сущность в каталоге"
                                                                    >
                                                                        {issue.entityFqid}
                                                                        {issue.attributeId && `.${issue.attributeId}`}
                                                                    </button>
                                                                )}
                                                                {!issue.entityFqid && issue.domainId && (
                                                                    <code className="lint-issue__link-static">
                                                                        {issue.domainId}
                                                                    </code>
                                                                )}
                                                                <span className="lint-issue__editor-hint">
                                                                    <MIcon name="open_in_new" size="sm" />
                                                                    В редакторе
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {g.issues.length > 100 && (
                                                        <div className="lint-issue__more">
                                                            ...и ещё {g.issues.length - 100}
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