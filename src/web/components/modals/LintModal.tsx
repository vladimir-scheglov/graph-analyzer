import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import type {
    LintIssue,
    LintSeverity,
    LintRuleCategory
} from '../../../shared/lint-types';
import { ModalHelp, HelpSection, HelpText, HelpList, HelpButton } from '../common/ModalHelp';

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

export function LintModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();

    const [filterCategory, setFilterCategory] = useState<LintRuleCategory | ''>('');
    const [filterDomain, setFilterDomain] = useState('');
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
    const [showHelp, setShowHelp] = useState(false);

    const open = store.lintOpen;

    const report = index?.lint.lintReport ?? null;

    const allDomains = useMemo(() => {
        if (!report) return [] as string[];
        const set = new Set<string>();
        report.issues.forEach((i) => set.add(i.domainId));
        return Array.from(set).sort();
    }, [report]);

    const filteredIssues = useMemo(() => {
        if (!report) return [] as LintIssue[];
        return report.issues.filter((i) => {
            if (filterCategory && i.category !== filterCategory) return false;
            if (filterDomain && i.domainId !== filterDomain) return false;
            return true;
        });
    }, [report, filterCategory, filterDomain]);

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
        store.setLintOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 500 }}
            onMouseDown={() => store.setLintOpen(false)}
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
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Что проверяется?" />
                        <button
                            className="help-modal__close"
                            onClick={() => store.setLintOpen(false)}
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
                        <div className="lint-filters">
                            <label className="entity-matrix-filter">
                                <span>Категория:</span>
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value as LintRuleCategory | '')}
                                >
                                    <option value="">— все —</option>
                                    {(Object.keys(CATEGORY_LABELS) as LintRuleCategory[]).map((k) => (
                                        <option key={k} value={k}>
                                            {CATEGORY_LABELS[k]} ({report.stats.byCategory[k]})
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
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {/* ============ Список правил ============ */}
                        <div className="lint-rules">
                            {grouped.length === 0 ? (
                                <div className="lint-empty">
                                    <div className="lint-empty__icon">✅</div>
                                    <div className="lint-empty__title">
                                        Ничего не найдено по фильтрам
                                    </div>
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
                                                <span className="lint-rule__count">{g.issues.length}</span>
                                            </button>

                                            {isOpen && (
                                                <div className="lint-rule__body">
                                                    {g.issues.slice(0, 100).map((issue, i) => (
                                                        <div key={i} className="lint-issue">
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
                                                                        onClick={() => openEntity(issue.entityFqid!)}
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