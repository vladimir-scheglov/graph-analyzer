import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import { summarizeValidation, ValidationIssue, IssueSeverity } from '../../lib/model/validation';
import type { ModelStats } from '../../../shared/model-types';
import { ModalHelp, HelpSection, HelpText, HelpList, HelpButton } from '../common/ModalHelp';

export function ModelValidationModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const open = store.modelValidationOpen;

    const summary = useMemo(
        () => (index ? summarizeValidation(index.stats, index.orphans) : null),
        [index]
    );

    const toggle = (title: string) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            if (s.has(title)) s.delete(title);
            else s.add(title);
            return s;
        });
    };

    const openEntity = (fqid: string) => {
        store.setModelValidationOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    const errors = summary?.issues.filter((i) => i.severity === 'error') ?? [];
    const warnings = summary?.issues.filter((i) => i.severity === 'warning') ?? [];
    const infos = summary?.issues.filter((i) => i.severity === 'info') ?? [];

    return (
        <div
            className="help-overlay"
            onMouseDown={() => store.setModelValidationOpen(false)}
        >
            <div
                className="help-modal model-validation-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="science" size="sm" />
                        <span className="icon-label">Валидация модели</span>
                        {summary && summary.totalIssues > 0 && (<span className="help-modal__badge">{summary.totalIssues}</span>)}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton open={showHelp} onToggle={() => setShowHelp(!showHelp)} label="Что это?" />
                        <button
                            className="help-modal__close"
                            onClick={() => store.setModelValidationOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="help-modal__body">
                    {loading && (
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    )}
                    {error && (
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    )}

                    {index && summary && (
                        <>
                            <ModalHelp visible={showHelp}>
                                <HelpSection title="Что это">
                                    <HelpText>
                                        Валидация — это автоматический обход всей модели и поиск проблем:
                                        циклов, битых ссылок, дублей, сирот, конфликтов миксинов.
                                        Отличается от линтера: валидация ищет <em>структурные</em> ошибки,
                                        линтер — <em>стилевые</em>.
                                    </HelpText>
                                </HelpSection>

                                <HelpSection title="Уровни проблем">
                                    <HelpList>
                                        <li><strong>Ошибки</strong> — модель сломана: циклы наследования, ссылки на несуществующие сущности, дубликаты entityId.</li>
                                        <li><strong>Предупреждения</strong> — модель работает, но есть потенциальные проблемы: сироты, атрибуты без views, конфликты миксинов.</li>
                                        <li><strong>Информация</strong> — не проблема, а факт: пустые домены (это норма для миксинов), сущности без собственных атрибутов.</li>
                                    </HelpList>
                                </HelpSection>

                                <HelpSection title="Примеры">
                                    <HelpText>
                                        <strong>Цикл:</strong> A наследует B, B наследует A — сломается логика наследования.{' '}
                                        <strong>Битая ссылка:</strong> атрибут <code>Reference</code> указывает на сущность,
                                        которой нет в индексе. <strong>Осиротевший view:</strong> объявлен, но
                                        не вызывается ни из меню, ни из действия.
                                    </HelpText>
                                </HelpSection>
                            </ModalHelp>
                            {/* ============ Шапка со счётчиками ============ */}
                            <div className="model-validation-summary">
                                <div className="model-validation-stat model-validation-stat--error">
                                    <div className="model-validation-stat__value">{summary.counts.error}</div>
                                    <div className="model-validation-stat__label">Ошибок</div>
                                </div>
                                <div className="model-validation-stat model-validation-stat--warning">
                                    <div className="model-validation-stat__value">{summary.counts.warning}</div>
                                    <div className="model-validation-stat__label">Предупреждений</div>
                                </div>
                                <div className="model-validation-stat model-validation-stat--info">
                                    <div className="model-validation-stat__value">{summary.counts.info}</div>
                                    <div className="model-validation-stat__label">Замечаний</div>
                                </div>
                            </div>

                            {summary.totalIssues === 0 && (
                                <div className="model-validation-empty">
                                    <div className="model-validation-empty__icon">✅</div>
                                    <div className="model-validation-empty__title">
                                        Модель прошла все проверки
                                    </div>
                                    <div className="model-validation-empty__hint">
                                        Циклов, битых ссылок, сирот и дубликатов не обнаружено.
                                    </div>
                                </div>
                            )}

                            {errors.length > 0 && (
                                <IssueSection
                                    severity="error"
                                    label="Ошибки"
                                    issues={errors}
                                    expanded={expanded}
                                    onToggle={toggle}
                                    onOpenEntity={openEntity}
                                />
                            )}
                            {warnings.length > 0 && (
                                <IssueSection
                                    severity="warning"
                                    label="Предупреждения"
                                    issues={warnings}
                                    expanded={expanded}
                                    onToggle={toggle}
                                    onOpenEntity={openEntity}
                                />
                            )}
                            {infos.length > 0 && (
                                <IssueSection
                                    severity="info"
                                    label="Информация"
                                    issues={infos}
                                    expanded={expanded}
                                    onToggle={toggle}
                                    onOpenEntity={openEntity}
                                />
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function IssueSection({
    severity,
    label,
    issues,
    expanded,
    onToggle,
    onOpenEntity
}: {
    severity: IssueSeverity;
    label: string;
    issues: ValidationIssue[];
    expanded: Set<string>;
    onToggle: (title: string) => void;
    onOpenEntity: (fqid: string) => void;
}) {
    return (
        <div className={'model-validation-group model-validation-group--' + severity}>
            <div className="model-validation-group__title">{label}</div>
            {issues.map((issue) => {
                const isOpen = expanded.has(issue.title);
                return (
                    <div key={issue.title} className="model-validation-issue">
                        <button
                            className="model-validation-issue__head"
                            onClick={() => onToggle(issue.title)}
                        >
                            <MIcon
                                name={isOpen ? 'expand_more' : 'chevron_right'}
                                size="sm"
                            />
                            <span className="model-validation-issue__title">{issue.title}</span>
                            <span className="model-validation-issue__count">{issue.count}</span>
                        </button>

                        <div className="model-validation-issue__desc">{issue.description}</div>
                        <div className="model-validation-issue__hint">
                            <MIcon name="lightbulb" size="sm" />
                            <span>{issue.hint}</span>
                        </div>

                        {isOpen && issue.samples.length > 0 && (
                            <div className="model-validation-issue__samples">
                                {issue.samples.map((s, i) => {
                                    // Если строка похожа на FQID — сделаем кликабельной
                                    const isFqid = /^[a-z0-9.-]+\/[a-z0-9_-]+$/i.test(s);
                                    if (isFqid) {
                                        return (
                                            <button
                                                key={i}
                                                className="model-validation-sample model-validation-sample--link"
                                                onClick={() => onOpenEntity(s.toLowerCase())}
                                            >
                                                {s}
                                            </button>
                                        );
                                    }
                                    return (
                                        <div key={i} className="model-validation-sample">
                                            {s}
                                        </div>
                                    );
                                })}
                                {issue.count > issue.samples.length && (
                                    <div className="model-validation-sample model-validation-sample--more">
                                        ...и ещё {issue.count - issue.samples.length}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}