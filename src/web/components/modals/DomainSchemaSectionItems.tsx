import React, { useMemo } from "react";
import { MIcon } from "../common/MIcon";
import { useGraphStore } from "../../state/useGraphStore";
import type {
    SectionKey,
    ModelIndex,
} from "../../../shared/model-types";
import type { LintIssue } from "../../../shared/lint-types";
import {
    findAncestorChain,
    maxSeverity,
    pluralAttrs,
} from "./DomainSchemaHelpers";
import { openFileAndCloseModal, openFileInEditor } from "../../lib/open-file";

// ============ IssueBadge ============

function IssueBadge({ issues }: { issues: LintIssue[] }) {
    if (issues.length === 0) return null;
    const sev = maxSeverity(issues) || "info";
    const icon =
        sev === "error" ? "error" : sev === "warning" ? "warning" : "info";
    const preview = issues
        .slice(0, 3)
        .map((i) => `• ${i.rule}: ${i.message}`)
        .join("\n");
    const more =
        issues.length > 3 ? `\n...и ещё ${issues.length - 3}` : "";

    return (
        <button
            className={`domain-schema-issue-badge domain-schema-issue-badge--${sev}`}
            title={`${issues.length} ${issues.length === 1 ? "проблема" : "проблем"}\n${preview}${more}`}
            onClick={(e) => {
                e.stopPropagation();
                const st = useGraphStore.getState();
                st.setDomainSchemaOpen(false);
                st.setLintOpen(true);
            }}
        >
            <MIcon name={icon} size="sm" />
            {issues.length}
        </button>
    );
}

// ============ UsageBadges ============

function UsageBadges({
    usedInViews,
    usedInRules,
}: {
    usedInViews: number;
    usedInRules: number;
}) {
    if (usedInViews === 0 && usedInRules === 0) {
        return (
            <span
                className="domain-schema-usage domain-schema-usage--unused"
                title="Не используется ни в views, ни в dataRules"
            >
                <MIcon name="visibility_off" size="sm" />
            </span>
        );
    }
    return (
        <span className="domain-schema-usage">
            {usedInViews > 0 && (
                <span
                    className="domain-schema-usage__item"
                    title={`Используется в ${usedInViews} виджет${usedInViews === 1 ? "е" : "ах"}`}
                >
                    <MIcon name="visibility" size="sm" />
                    {usedInViews}
                </span>
            )}
            {usedInRules > 0 && (
                <span
                    className="domain-schema-usage__item"
                    title={`Упоминается в ${usedInRules} правил${usedInRules === 1 ? "е" : "ах"} данных`}
                >
                    <MIcon name="rule" size="sm" />
                    {usedInRules}
                </span>
            )}
        </span>
    );
}

// ============ InheritanceChain ============

function InheritanceChain({
    fqid,
    index,
    onOpenEntity,
}: {
    fqid: string;
    index: ModelIndex;
    onOpenEntity: (id: string) => void;
}) {
    const ancestors = useMemo(() => findAncestorChain(fqid, index), [fqid, index]);
    const children = useMemo(() => {
        const fqids = index.entityChildrenByFqid[fqid] || [];
        return fqids
            .map((f) => index.entitiesByFqid[f])
            .filter((x): x is NonNullable<typeof x> => !!x);
    }, [fqid, index]);

    if (ancestors.length === 0 && children.length === 0) return null;

    return (
        <div className="domain-schema-inheritance">
            {ancestors.length > 0 && (
                <div className="domain-schema-inheritance__row">
                    <span className="domain-schema-inheritance__label">Родители:</span>
                    {ancestors.map((a) => (
                        <React.Fragment key={a.fqid}>
                            <button
                                className="domain-schema-inheritance__node"
                                onClick={() => onOpenEntity(a.entityId)}
                                title={`${a.fqid}\n${a.attributes.length} ${pluralAttrs(a.attributes.length)}`}
                            >
                                {a.entityId}
                                <span className="domain-schema-inheritance__domain">
                                    {a.domainId}
                                </span>
                            </button>
                            <span className="domain-schema-inheritance__arrow">→</span>
                        </React.Fragment>
                    ))}
                    <span className="domain-schema-inheritance__self">текущая</span>
                </div>
            )}
            {children.length > 0 && (
                <div className="domain-schema-inheritance__row">
                    <span className="domain-schema-inheritance__label">Наследники:</span>
                    {children.map((c) => (
                        <button
                            key={c.fqid}
                            className="domain-schema-inheritance__node"
                            onClick={() => onOpenEntity(c.entityId)}
                            title={`${c.fqid}\n${c.attributes.length} ${pluralAttrs(c.attributes.length)}`}
                        >
                            {c.entityId}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============ EntityDetailCard ============

function EntityDetailCard({
    entityId,
    domainId,
    index,
    issuesByAttribute,
    onOpenEntity,
}: {
    entityId: string;
    domainId: string;
    index: ModelIndex;
    issuesByAttribute: Map<string, LintIssue[]>;
    onOpenEntity: (id: string) => void;
}) {
    const fqid = `${domainId}/${entityId}`.toLowerCase();
    const entity = index.entitiesByFqid[fqid];
    if (!entity) return null;

    return (
        <div className="domain-schema-detail-card">
            {entity.description && (
                <div className="domain-schema-detail-card__desc">
                    {entity.description}
                </div>
            )}
            {entity.label && (
                <div className="domain-schema-detail-card__meta">
                    <strong>label:</strong> <code>{entity.label}</code>
                </div>
            )}

            <InheritanceChain
                fqid={fqid}
                index={index}
                onOpenEntity={onOpenEntity}
            />

            {entity.attributes.length > 0 ? (
                <div className="domain-schema-attrs">
                    <div className="domain-schema-attrs__title">
                        Атрибуты ({entity.attributes.length})
                    </div>
                    {entity.attributes.map((a) => {
                        const attrIssues =
                            issuesByAttribute.get(`${fqid}#${a.id}`) || [];
                        return (
                            <div key={a.id} className="domain-schema-attr-row">
                                <code className="domain-schema-attr-row__id">{a.id}</code>
                                <span className="domain-schema-attr-row__name">{a.name}</span>
                                <span className="domain-schema-attr-row__type">
                                    {a.dataType}
                                </span>
                                {a.referenceEntity && (
                                    <span
                                        className="domain-schema-attr-row__ref"
                                        title={a.referenceEntity}
                                    >
                                        → {a.referenceEntity.split("/")[1]}
                                    </span>
                                )}
                                {a.constraints.length > 0 && (
                                    <span className="domain-schema-attr-row__constraints">
                                        {a.constraints.map((c) => (
                                            <span
                                                key={c}
                                                className="domain-schema-attr-row__constraint"
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </span>
                                )}
                                <UsageBadges
                                    usedInViews={a.usedInViews}
                                    usedInRules={a.usedInRules}
                                />
                                <IssueBadge issues={attrIssues} />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="domain-schema-detail-card__empty">
                    Нет собственных атрибутов
                </div>
            )}

            <div className="domain-schema-detail-card__actions">
                <button
                    className="btn btn--primary"
                    onClick={() => onOpenEntity(entityId)}
                >
                    🎯 Открыть в каталоге
                </button>

                {/* в блоке <div className="domain-schema-item__actions"> или рядом */}
                <button
                    className="domain-schema-item__open"
                    onClick={(ev) => {
                        ev.stopPropagation();
                        const st = useGraphStore.getState();
                        st.setGenerateSchemaDomainId(domainId);
                        st.setGenerateSchemaEntityId(entityId);
                        st.setGenerateSchemaOpen(true);
                    }}
                    title="Сгенерировать типовой блок (actions + views + menu)"
                >
                    <MIcon name="auto_fix_high" size="sm" />
                </button>
            </div>
        </div>
    );
}

// ============ DataTypeDetailCard ============

export function DataTypeDetailCard({
    dataTypeId,
    domainId,
    index,
    refAttrs = [],
}: {
    dataTypeId: string;
    domainId: string;
    index: ModelIndex;
    refAttrs?: Array<{ entity: string; attribute: string }>;
}) {
    const dt = index.dataTypes.find(
        (d) => d.id === dataTypeId && d.domainId === domainId,
    );
    const setWorkflowGraphTarget = useGraphStore((s) => s.setWorkflowGraphTarget);

    if (!dt) return null;

    return (
        <div className="domain-schema-detail-card">
            {dt.description && (
                <div className="domain-schema-detail-card__desc">{dt.description}</div>
            )}

            {/* NEW: кнопка «Граф переходов» для Workflow */}
            {dt.kind === "Workflow" && (
                <div className="domain-schema-detail-card__actions" style={{ marginTop: 0, marginBottom: 8 }}>
                    <button
                        className="btn btn--primary"
                        onClick={() => {
                            const st = useGraphStore.getState();
                            st.setDomainSchemaOpen(false);
                            st.setWorkflowGraphTarget({
                                domainId,
                                dataTypeId: dt.id,
                            });
                        }}
                        title="Открыть граф переходов между статусами"
                    >
                        <MIcon name="conversion_path" size="sm" />
                        Граф переходов
                    </button>
                </div>
            )}

            {dt.kind === "Enum" && dt.values && dt.values.length > 0 && (
                <div className="domain-schema-datatype-values">
                    <div className="domain-schema-datatype-values__title">
                        Значения ({dt.values.length})
                    </div>
                    <div className="domain-schema-datatype-values__chips">
                        {dt.values.map((v) => (
                            <code key={v} className="domain-schema-datatype-chip">
                                {v}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {dt.kind === "Workflow" && dt.statuses && dt.statuses.length > 0 && (
                <div className="domain-schema-datatype-values">
                    <div className="domain-schema-datatype-values__title">
                        Статусы ({dt.statuses.length})
                    </div>
                    <div className="domain-schema-datatype-values__chips">
                        {dt.statuses.map((s) => (
                            <code
                                key={s}
                                className="domain-schema-datatype-chip domain-schema-datatype-chip--workflow"
                            >
                                {s}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {dt.kind === "Table" && dt.columns && dt.columns.length > 0 && (
                <div className="domain-schema-datatype-values">
                    <div className="domain-schema-datatype-values__title">
                        Колонки ({dt.columns.length})
                    </div>
                    <div className="domain-schema-datatype-values__chips">
                        {dt.columns.map((c) => (
                            <code
                                key={c}
                                className="domain-schema-datatype-chip domain-schema-datatype-chip--table"
                            >
                                {c}
                            </code>
                        ))}
                    </div>
                </div>
            )}

            {refAttrs.length > 0 && (
                <div className="domain-schema-detail-card__refs">
                    <div className="domain-schema-attrs__title">
                        Используется в атрибутах ({refAttrs.length})
                    </div>
                    <div className="domain-schema-refs-grid">
                        {refAttrs.map((r) => (
                            <button
                                key={`${r.entity}#${r.attribute}`}
                                className="domain-schema-ref-chip"
                                onClick={() => {
                                    const st = useGraphStore.getState();
                                    st.setDomainSchemaOpen(false);
                                    st.setEntityCatalogInitialFqid(
                                        `${domainId}/${r.entity}`.toLowerCase(),
                                    );
                                    st.setEntityCatalogOpen(true);
                                }}
                                title={`${r.entity}.${r.attribute}`}
                            >
                                <code>
                                    {r.entity}.{r.attribute}
                                </code>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============ SectionItems ============

// ============ SectionItems ============

export interface SectionItemsProps {
    sectionKey: SectionKey;
    items: any[];
    index: ModelIndex;
    domainId: string;
    expandedItems: Set<string>;
    onToggleItem: (key: string) => void;
    issuesByEntity: Map<string, LintIssue[]>;
    issuesByAttribute: Map<string, LintIssue[]>;
    /** NEW: issues по itemId этой секции. */
    itemIssues: Map<string, LintIssue[]>;
    onOpenEntity: (id: string) => void;
    onlyProblematic: boolean;
    /** NEW: путь к файлу — для кнопки «открыть в YAML». */
    filePath: string | null;
}

export function SectionItems({
    sectionKey,
    items,
    index,
    domainId,
    expandedItems,
    onToggleItem,
    issuesByEntity,
    issuesByAttribute,
    itemIssues,
    onOpenEntity,
    onlyProblematic,
    filePath,
}: SectionItemsProps) {
    // ==== Сущности (расширенные) ====
    if (sectionKey === "entities") {
        return (
            <div className="domain-schema-list">
                {items.map((e) => {
                    const fqid = `${domainId}/${e.id}`.toLowerCase();
                    const issues = issuesByEntity.get(fqid) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    const entityKey = `entity:${e.id}`;
                    const isExpanded = expandedItems.has(entityKey);

                    return (
                        <React.Fragment key={e.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "") +
                                    (issues.length > 0
                                        ? " domain-schema-item--has-issues"
                                        : "")
                                }
                                onClick={() => onToggleItem(entityKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={
                                            isExpanded
                                                ? "expand_more"
                                                : "chevron_right"
                                        }
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">
                                    {e.id}
                                </code>
                                <span className="domain-schema-item__name">
                                    {e.name}
                                </span>
                                <span className="domain-schema-item__meta">
                                    {e.attributesCount}{" "}
                                    {pluralAttrs(e.attributesCount)}
                                    {e.inherits &&
                                        ` · ↳ ${e.inherits.split("/").pop()}`}
                                </span>
                                <IssueBadge issues={issues} />
                                <ItemQuickActions
                                    itemId={e.id}
                                    domainId={domainId}
                                    filePath={filePath}
                                />
                                <button
                                    className="domain-schema-item__open"
                                    onClick={(ev) => {
                                        ev.stopPropagation();
                                        onOpenEntity(e.id);
                                    }}
                                    title="Открыть в каталоге"
                                >
                                    <MIcon name="open_in_new" size="sm" />
                                </button>
                            </div>
                            {isExpanded && (
                                <EntityDetailCard
                                    entityId={e.id}
                                    domainId={domainId}
                                    index={index}
                                    issuesByAttribute={issuesByAttribute}
                                    onOpenEntity={onOpenEntity}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    }

    // ==== Типы данных (расширенные) ====
    if (sectionKey === "dataTypes") {
        return (
            <div className="domain-schema-list">
                {items.map((d) => {
                    const issues = itemIssues.get(d.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    const refAttrs = index.entities
                        .filter((e) => e.domainId === domainId)
                        .flatMap((e) =>
                            e.attributes
                                .filter((a) => a.dataType === d.id)
                                .map((a) => ({
                                    entity: e.entityId,
                                    attribute: a.id,
                                })),
                        );

                    const dtKey = `dataType:${d.id}`;
                    const isExpanded = expandedItems.has(dtKey);
                    return (
                        <React.Fragment key={d.id}>
                            <div
                                id={`ds-item-${dtKey}`}
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "") +
                                    (issues.length > 0
                                        ? " domain-schema-item--has-issues"
                                        : "")
                                }
                                onClick={() => onToggleItem(dtKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={
                                            isExpanded
                                                ? "expand_more"
                                                : "chevron_right"
                                        }
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">
                                    {d.id}
                                </code>
                                <span className="domain-schema-item__name">
                                    {d.name}
                                </span>
                                <span className="domain-schema-item__badge">
                                    {d.kind}
                                </span>
                                <span className="domain-schema-item__meta">
                                    {d.valuesCount != null &&
                                        `${d.valuesCount} значений`}
                                    {d.statusesCount != null &&
                                        `${d.statusesCount} статусов`}
                                    {d.attributesCount != null &&
                                        `${d.attributesCount} колонок`}
                                    {refAttrs.length > 0 && (
                                        <>
                                            {" · "}
                                            <span
                                                style={{
                                                    color: "var(--accent-hover)",
                                                }}
                                                title={`Используется в ${refAttrs.length} атрибутах`}
                                            >
                                                {refAttrs.length}{" "}
                                                {refAttrs.length === 1
                                                    ? "атрибут"
                                                    : "атрибутов"}{" "}
                                                →
                                            </span>
                                        </>
                                    )}
                                </span>
                                <IssueBadge issues={issues} />
                                <ItemQuickActions
                                    itemId={d.id}
                                    domainId={domainId}
                                    filePath={filePath}
                                />
                            </div>
                            {isExpanded && (
                                <DataTypeDetailCard
                                    dataTypeId={d.id}
                                    domainId={domainId}
                                    index={index}
                                    refAttrs={refAttrs}
                                />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    }

    // ==== Сценарии (расширенные) ====
    if (sectionKey === "scenarios") {
        return (
            <div className="domain-schema-list">
                {items.map((s: any) => {
                    const issues = itemIssues.get(s.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    const scenarioKey = `scenario:${s.id}`;
                    const isExpanded = expandedItems.has(scenarioKey);
                    return (
                        <React.Fragment key={s.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "") +
                                    (issues.length > 0
                                        ? " domain-schema-item--has-issues"
                                        : "")
                                }
                                onClick={() => onToggleItem(scenarioKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={
                                            isExpanded
                                                ? "expand_more"
                                                : "chevron_right"
                                        }
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">
                                    {s.id}
                                </code>
                                <span className="domain-schema-item__meta">
                                    <span className="domain-schema-item__badge">
                                        playbook
                                    </span>
                                    {" · "}
                                    {s.actionsCount}{" "}
                                    {s.actionsCount === 1 ? "экшен" : "экшенов"}
                                    {(() => {
                                        const rec =
                                            index.scenariosById?.[s.id];
                                        const globalCount =
                                            rec?.domains.length ?? 1;
                                        if (globalCount <= 1) return null;
                                        const extra = globalCount - 1;
                                        return (
                                            <span
                                                className="domain-schema-item__badge"
                                                style={{
                                                    marginLeft: 8,
                                                    background:
                                                        "rgba(99,102,241,0.15)",
                                                    color: "var(--accent-hover)",
                                                }}
                                                title={`Используется в ${globalCount} доменах`}
                                            >
                                                +{extra} домен
                                                {extra === 1 ? "" : "ов"}
                                            </span>
                                        );
                                    })()}
                                </span>
                                <IssueBadge issues={issues} />
                                <ItemQuickActions
                                    itemId={s.id}
                                    domainId={domainId}
                                    filePath={filePath}
                                />
                            </div>
                            {isExpanded && (
                                <div className="domain-schema-detail-card">
                                    <div className="domain-schema-attrs">
                                        <div className="domain-schema-attrs__title">
                                            Запускается экшенами ({s.actions.length})
                                        </div>
                                        {s.actions.map((a: any, idx: number) => (
                                            <div
                                                key={`${a.domainId}/${a.actionId}/${idx}`}
                                                className="domain-schema-attr-row"
                                            >
                                                <code className="domain-schema-attr-row__id">
                                                    {a.actionId}
                                                </code>
                                                <span className="domain-schema-attr-row__name">
                                                    {a.actionName}
                                                </span>
                                                {a.workerTag && (
                                                    <span className="domain-schema-attr-row__type">
                                                        worker: {a.workerTag}
                                                    </span>
                                                )}
                                                {a.domainId !== domainId && (
                                                    <span className="domain-schema-attr-row__ref">
                                                        → {a.domainId}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    }

    // ==== UI Rules ====
    if (sectionKey === "uiRules") {
        return (
            <div className="domain-schema-list">
                {items.map((r: any) => {
                    const issues = itemIssues.get(r.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    const ruleKey = `uiRule:${r.id}`;
                    const isExpanded = expandedItems.has(ruleKey);
                    return (
                        <React.Fragment key={r.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "") +
                                    (issues.length > 0
                                        ? " domain-schema-item--has-issues"
                                        : "")
                                }
                                onClick={() => onToggleItem(ruleKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={
                                            isExpanded
                                                ? "expand_more"
                                                : "chevron_right"
                                        }
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">
                                    {r.id}
                                </code>
                                <span className="domain-schema-item__name">
                                    {r.name}
                                </span>
                                <span className="domain-schema-item__meta">
                                    {r.effect && (
                                        <span className="domain-schema-item__badge">
                                            {r.effect}
                                        </span>
                                    )}
                                    {r.target && (
                                        <span className="domain-schema-item__badge">
                                            {r.target}
                                        </span>
                                    )}
                                    {r.view && (
                                        <span style={{ opacity: 0.7 }}>
                                            → {r.view}
                                        </span>
                                    )}
                                </span>
                                <IssueBadge issues={issues} />
                                <ItemQuickActions
                                    itemId={r.id}
                                    domainId={domainId}
                                    filePath={filePath}
                                />
                            </div>
                            {isExpanded && (
                                <div className="domain-schema-detail-card">
                                    {r.description && (
                                        <div className="domain-schema-detail-card__desc">
                                            {r.description}
                                        </div>
                                    )}
                                    {r.condition && (
                                        <div className="domain-schema-detail-card__meta">
                                            <strong>condition:</strong>{" "}
                                            <code>{r.condition.slice(0, 200)}</code>
                                        </div>
                                    )}
                                    {r.widgets && r.widgets.length > 0 && (
                                        <div className="domain-schema-attrs">
                                            <div className="domain-schema-attrs__title">
                                                Виджеты ({r.widgets.length})
                                            </div>
                                            {r.widgets.map((w: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="domain-schema-attr-row"
                                                >
                                                    <MIcon name="widgets" size="sm" />
                                                    <code className="domain-schema-attr-row__id">
                                                        {w.widget}
                                                    </code>
                                                    {w.nested && (
                                                        <span className="domain-schema-attr-row__type">
                                                            nested: {w.nested.type}
                                                        </span>
                                                    )}
                                                    {w.presets && w.presets.length > 0 && (
                                                        <span className="domain-schema-attr-row__type">
                                                            presets: {w.presets.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {r.groups && r.groups.length > 0 && (
                                        <div className="domain-schema-attrs">
                                            <div className="domain-schema-attrs__title">
                                                Группы ({r.groups.length})
                                            </div>
                                            {r.groups.map((g: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="domain-schema-attr-row"
                                                >
                                                    <MIcon name="view_module" size="sm" />
                                                    <code className="domain-schema-attr-row__id">
                                                        {g.group}
                                                    </code>
                                                    {g.presets && g.presets.length > 0 && (
                                                        <span className="domain-schema-attr-row__type">
                                                            presets: {g.presets.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {r.columns && r.columns.length > 0 && (
                                        <div className="domain-schema-attrs">
                                            <div className="domain-schema-attrs__title">
                                                Колонки ({r.columns.length})
                                            </div>
                                            {r.columns.map((c: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className="domain-schema-attr-row"
                                                >
                                                    <MIcon name="view_column" size="sm" />
                                                    <code className="domain-schema-attr-row__id">
                                                        {c.column}
                                                    </code>
                                                    {c.presets && c.presets.length > 0 && (
                                                        <span className="domain-schema-attr-row__type">
                                                            presets: {c.presets.join(", ")}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {r.presets && r.presets.length > 0 && (
                                        <div className="domain-schema-detail-card__meta">
                                            <strong>Пресеты правила:</strong>{" "}
                                            {r.presets.join(", ")}
                                        </div>
                                    )}
                                    {r.message && (
                                        <div className="domain-schema-detail-card__meta">
                                            <strong>message:</strong> {r.message}
                                        </div>
                                    )}
                                    {r.help && (
                                        <div className="domain-schema-detail-card__meta">
                                            <strong>help:</strong> {r.help}
                                        </div>
                                    )}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        );
    }

    // ==== Связи (linkages) ====
    if (sectionKey === "linkages") {
        return (
            <div className="domain-schema-list">
                {items.map((l) => {
                    const issues = itemIssues.get(l.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    return (
                        <div
                            key={l.id}
                            className={
                                "domain-schema-item domain-schema-item--linkage" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {l.id}
                            </code>
                            <span className="domain-schema-item__name">
                                {l.name}
                            </span>
                            <span className="domain-schema-item__meta domain-schema-item__meta--linkage">
                                <code>{l.side1.split("/").pop()}</code>
                                <span
                                    style={{
                                        margin: "0 4px",
                                        color: "var(--text-500)",
                                    }}
                                >
                                    {l.undirected ? "↔" : "→"}
                                </span>
                                <code>{l.side2.split("/").pop()}</code>
                                <span
                                    className="domain-schema-item__badge"
                                    style={{ marginLeft: 6 }}
                                >
                                    {l.type}
                                </span>
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={l.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Последовательности ====
    if (sectionKey === "sequences") {
        return (
            <div className="domain-schema-list">
                {items.map((s) => {
                    const issues = itemIssues.get(s.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={s.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {s.id}
                            </code>
                            <span className="domain-schema-item__meta">
                                начинается с {s.startFrom}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={s.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Действия ====
    if (sectionKey === "actions") {
        return (
            <div className="domain-schema-list">
                {items.map((a) => {
                    const issues = itemIssues.get(a.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={a.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {a.id}
                            </code>
                            <span className="domain-schema-item__name">
                                {a.name}
                            </span>
                            <span className="domain-schema-item__meta">
                                <span className="domain-schema-item__badge">
                                    {a.type}
                                </span>
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={a.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Views ====
    if (sectionKey === "views") {
        const TYPE_COLORS: Record<string, string> = {
            entity: "#6366f1",
            list: "#10b981",
            tree: "#8b5cf6",
            tabs_list: "#06b6d4",
            panel: "#a78bfa",
            modal: "#f59e0b",
            page: "#ec4899",
            dashboard: "#f97316",
            dashboard_tree: "#eab308",
        };

        return (
            <div className="domain-schema-list">
                {items.map((v) => {
                    const issues = itemIssues.get(v.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;

                    const color = TYPE_COLORS[v.type] || "var(--text-500)";
                    return (
                        <div
                            key={v.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {v.id}
                            </code>
                            <span className="domain-schema-item__name">
                                {v.label || ""}
                            </span>
                            <span
                                className="domain-schema-item__badge domain-schema-item__badge--color"
                                style={{
                                    background: color + "22",
                                    color,
                                    borderColor: color + "55",
                                }}
                            >
                                {v.type}
                            </span>
                            {v.entity && (
                                <span className="domain-schema-item__meta">
                                    · {v.entity.split("/").pop()}
                                </span>
                            )}
                            {v.isMixin && (
                                <span
                                    className="domain-schema-item__badge"
                                    style={{
                                        background: "rgba(236,72,153,0.15)",
                                        color: "#ec4899",
                                    }}
                                >
                                    mixin
                                </span>
                            )}
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={v.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Меню ====
    if (sectionKey === "menus") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => {
                    const issues = itemIssues.get(m.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={m.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {m.route}
                            </code>
                            <span className="domain-schema-item__name">
                                {m.label}
                            </span>
                            <span className="domain-schema-item__meta">
                                <span className="domain-schema-item__badge">
                                    {m.type}
                                </span>
                                {m.view && ` → ${m.view}`}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={m.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Миксины ====
    if (sectionKey === "mixins") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => {
                    const issues = itemIssues.get(m.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={m.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {m.id}
                            </code>
                            <span className="domain-schema-item__meta">
                                <span className="domain-schema-item__badge">
                                    {m.type}
                                </span>
                                {" → "}
                                {m.entity}
                                {" · "}
                                {m.viewsCount} view
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={m.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Правила данных ====
    if (sectionKey === "dataRules") {
        return (
            <div className="domain-schema-list">
                {items.map((r) => {
                    const issues = itemIssues.get(r.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={r.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {r.id}
                            </code>
                            <span className="domain-schema-item__name">
                                {r.name}
                            </span>
                            <span className="domain-schema-item__meta">
                                {r.effect && (
                                    <span className="domain-schema-item__badge">
                                        {r.effect}
                                    </span>
                                )}
                                {r.entity &&
                                    ` · ${r.entity.split("/").pop()}`}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={r.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Иконки ====
    if (sectionKey === "medias") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => {
                    const issues = itemIssues.get(m.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={m.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {m.id}
                            </code>
                            <span className="domain-schema-item__meta">
                                {m.type}
                                {m.iconName && (
                                    <>
                                        {" · "}
                                        <span
                                            className="domain-schema-icon-preview"
                                            title={`IconName: ${m.iconName}`}
                                        >
                                            <MIcon name="image" size="sm" />
                                        </span>
                                        <code
                                            style={{
                                                fontSize: 11,
                                                color: "var(--text-400)",
                                            }}
                                        >
                                            {m.iconName}
                                        </code>
                                    </>
                                )}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={m.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Разрешения ====
    if (sectionKey === "permissions") {
        return (
            <div className="domain-schema-list">
                {items.map((p: any) => {
                    const issues = itemIssues.get(p.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={p.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {p.id}
                            </code>
                            {p.name && p.name !== p.id && (
                                <span className="domain-schema-item__name">
                                    {p.name}
                                </span>
                            )}
                            {p.description && (
                                <span className="domain-schema-item__meta">
                                    {p.description}
                                </span>
                            )}
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={p.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Правила доступа ====
    if (sectionKey === "accessRules") {
        return (
            <div className="domain-schema-list">
                {items.map((r: any) => {
                    const issues = itemIssues.get(r.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={r.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {r.id}
                            </code>
                            <span className="domain-schema-item__meta">
                                <span className="domain-schema-item__badge">
                                    {r.target}
                                </span>
                                {r.entity &&
                                    ` · ${String(r.entity).split("/").pop()}`}
                                {r.linkage &&
                                    ` · ${String(r.linkage).split("/").pop()}`}
                                {r.actionId && ` · ${r.actionId}`}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={r.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Локализации ====
    if (sectionKey === "localizations") {
        return (
            <div className="domain-schema-list">
                {items.map((loc: any) => {
                    const issues = itemIssues.get(loc.id) || [];
                    if (onlyProblematic && issues.length === 0) return null;
                    return (
                        <div
                            key={loc.id}
                            className={
                                "domain-schema-item" +
                                (issues.length > 0
                                    ? " domain-schema-item--has-issues"
                                    : "")
                            }
                        >
                            <code className="domain-schema-item__id">
                                {loc.id}
                            </code>
                            <span className="domain-schema-item__meta">
                                {loc.keysCount}{" "}
                                {loc.keysCount === 1
                                    ? "ключ"
                                    : loc.keysCount < 5
                                        ? "ключа"
                                        : "ключей"}
                            </span>
                            <IssueBadge issues={issues} />
                            <ItemQuickActions
                                itemId={loc.id}
                                domainId={domainId}
                                filePath={filePath}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    // ==== Fallback для остальных секций ====
    return (
        <div className="domain-schema-list">
            {items.map((item: any) => {
                const issues = itemIssues.get(item.id) || [];
                if (onlyProblematic && issues.length === 0) return null;
                return (
                    <div
                        key={item.id}
                        className={
                            "domain-schema-item" +
                            (issues.length > 0
                                ? " domain-schema-item--has-issues"
                                : "")
                        }
                    >
                        <code className="domain-schema-item__id">
                            {item.id}
                        </code>
                        {item.name && item.name !== item.id && (
                            <span className="domain-schema-item__name">
                                {item.name}
                            </span>
                        )}
                        <span className="domain-schema-item__meta">
                            {item.type && (
                                <span className="domain-schema-item__badge">
                                    {item.type}
                                </span>
                            )}
                            {item.target && (
                                <span className="domain-schema-item__badge">
                                    {item.target}
                                </span>
                            )}
                            {item.effect && (
                                <span className="domain-schema-item__badge">
                                    {item.effect}
                                </span>
                            )}
                            {item.rootEntity &&
                                ` · корень: ${item.rootEntity}`}
                            {item.joinsCount != null &&
                                ` · ${item.joinsCount} связей`}
                            {item.red && ` · red: ${item.red}`}
                            {item.yellow && ` · yellow: ${item.yellow}`}
                        </span>
                        <IssueBadge issues={issues} />
                        <ItemQuickActions
                            itemId={item.id}
                            domainId={domainId}
                            filePath={filePath}
                        />
                    </div>
                );
            })}
        </div>
    );
}

function ItemQuickActions({
    itemId,
    domainId,
    filePath,
}: {
    itemId: string;
    domainId: string;
    filePath: string | null;
}) {
    return (
        <div
            className="domain-schema-item__quick-actions"
            onClick={(e) => e.stopPropagation()}
        >
            <button
                type="button"
                title="Копировать id"
                onClick={() => {
                    navigator.clipboard
                        .writeText(itemId)
                        .then(() =>
                            useGraphStore
                                .getState()
                                .showSnackbar(`Скопировано: ${itemId}`),
                        )
                        .catch(() => { });
                }}
            >
                <MIcon name="content_copy" size="sm" />
            </button>
            <button
                type="button"
                title={filePath ? "Открыть файл в редакторе" : "Файл недоступен"}
                disabled={!filePath}
                onClick={async () => {
                    if (!filePath) return;
                    await openFileAndCloseModal("domainSchema", filePath, null, domainId);
                }}
            >
                <MIcon name="open_in_new" size="sm" />
            </button>
        </div>
    );
}