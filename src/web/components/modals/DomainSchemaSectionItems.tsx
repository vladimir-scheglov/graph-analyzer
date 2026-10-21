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
                useGraphStore.getState().setLintOpen(true);
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
            </div>
        </div>
    );
}

// ============ DataTypeDetailCard ============

function DataTypeDetailCard({
    dataTypeId,
    domainId,
    index,
}: {
    dataTypeId: string;
    domainId: string;
    index: ModelIndex;
}) {
    const dt = index.dataTypes.find(
        (d) => d.id === dataTypeId && d.domainId === domainId,
    );
    if (!dt) return null;

    return (
        <div className="domain-schema-detail-card">
            {dt.description && (
                <div className="domain-schema-detail-card__desc">
                    {dt.description}
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
        </div>
    );
}

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
    onOpenEntity: (id: string) => void;
    onlyProblematic: boolean;
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
    onOpenEntity,
    onlyProblematic,
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
                                    (isExpanded ? " expanded" : "")
                                }
                                onClick={() => onToggleItem(entityKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={isExpanded ? "expand_more" : "chevron_right"}
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">{e.id}</code>
                                <span className="domain-schema-item__name">{e.name}</span>
                                <span className="domain-schema-item__meta">
                                    {e.attributesCount} {pluralAttrs(e.attributesCount)}
                                    {e.inherits && ` · ↳ ${e.inherits.split("/").pop()}`}
                                </span>
                                <IssueBadge issues={issues} />
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
                    const dtKey = `dataType:${d.id}`;
                    const isExpanded = expandedItems.has(dtKey);
                    return (
                        <React.Fragment key={d.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "")
                                }
                                onClick={() => onToggleItem(dtKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={isExpanded ? "expand_more" : "chevron_right"}
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">{d.id}</code>
                                <span className="domain-schema-item__name">{d.name}</span>
                                <span className="domain-schema-item__meta">
                                    <span className="domain-schema-item__badge">{d.kind}</span>
                                    {d.valuesCount != null && ` · ${d.valuesCount} значений`}
                                    {d.statusesCount != null && ` · ${d.statusesCount} статусов`}
                                    {d.attributesCount != null &&
                                        ` · ${d.attributesCount} колонок`}
                                </span>
                            </div>
                            {isExpanded && (
                                <DataTypeDetailCard
                                    dataTypeId={d.id}
                                    domainId={domainId}
                                    index={index}
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
                    const scenarioKey = `scenario:${s.id}`;
                    const isExpanded = expandedItems.has(scenarioKey);
                    return (
                        <React.Fragment key={s.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "")
                                }
                                onClick={() => onToggleItem(scenarioKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={isExpanded ? "expand_more" : "chevron_right"}
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">{s.id}</code>
                                <span className="domain-schema-item__meta">
                                    <span className="domain-schema-item__badge">playbook</span>
                                    {" · "}
                                    {s.actionsCount}{" "}
                                    {s.actionsCount === 1 ? "экшен" : "экшенов"}
                                    {s.domainsCount > 1 && (
                                        <span
                                            className="domain-schema-item__badge"
                                            style={{
                                                marginLeft: 8,
                                                background: "rgba(99,102,241,0.15)",
                                                color: "var(--accent-hover)",
                                            }}
                                            title={`Используется в ${s.domainsCount} доменах`}
                                        >
                                            +{s.domainsCount - 1} домен
                                            {s.domainsCount - 1 === 1 ? "" : "ов"}
                                        </span>
                                    )}
                                </span>
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
                    const ruleKey = `uiRule:${r.id}`;
                    const isExpanded = expandedItems.has(ruleKey);
                    return (
                        <React.Fragment key={r.id}>
                            <div
                                className={
                                    "domain-schema-item domain-schema-item--expandable" +
                                    (isExpanded ? " expanded" : "")
                                }
                                onClick={() => onToggleItem(ruleKey)}
                            >
                                <span className="domain-schema-item__caret">
                                    <MIcon
                                        name={isExpanded ? "expand_more" : "chevron_right"}
                                        size="sm"
                                    />
                                </span>
                                <code className="domain-schema-item__id">{r.id}</code>
                                <span className="domain-schema-item__name">{r.name}</span>
                                <span className="domain-schema-item__meta">
                                    {r.effect && (
                                        <span className="domain-schema-item__badge">{r.effect}</span>
                                    )}
                                    {r.target && (
                                        <span className="domain-schema-item__badge">{r.target}</span>
                                    )}
                                    {r.view && (
                                        <span style={{ opacity: 0.7 }}>→ {r.view}</span>
                                    )}
                                </span>
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
                                                <div key={i} className="domain-schema-attr-row">
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
                                                <div key={i} className="domain-schema-attr-row">
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
                                                <div key={i} className="domain-schema-attr-row">
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
    
    // ==== Остальные секции — без изменений ====
    if (sectionKey === "linkages") {
        return (
            <div className="domain-schema-list">
                {items.map((l) => (
                    <div key={l.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{l.id}</code>
                        <span className="domain-schema-item__name">{l.name}</span>
                        <span className="domain-schema-item__meta">
                            {l.side1.split("/").pop()} {l.undirected ? "↔" : "→"}{" "}
                            {l.side2.split("/").pop()}
                            {" · "}
                            <span className="domain-schema-item__badge">{l.type}</span>
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "sequences") {
        return (
            <div className="domain-schema-list">
                {items.map((s) => (
                    <div key={s.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{s.id}</code>
                        <span className="domain-schema-item__meta">
                            начинается с {s.startFrom}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "actions") {
        return (
            <div className="domain-schema-list">
                {items.map((a) => (
                    <div key={a.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{a.id}</code>
                        <span className="domain-schema-item__name">{a.name}</span>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{a.type}</span>
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "views") {
        return (
            <div className="domain-schema-list">
                {items.map((v) => (
                    <div key={v.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{v.id}</code>
                        <span className="domain-schema-item__name">{v.label || ""}</span>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{v.type}</span>
                            {v.entity && ` · ${v.entity.split("/").pop()}`}
                            {v.isMixin && " · mixin"}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "menus") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => (
                    <div key={m.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{m.route}</code>
                        <span className="domain-schema-item__name">{m.label}</span>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{m.type}</span>
                            {m.view && ` → ${m.view}`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "mixins") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => (
                    <div key={m.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{m.id}</code>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{m.type}</span>
                            {" → "}
                            {m.entity}
                            {" · "}
                            {m.viewsCount} view
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "dataRules") {
        return (
            <div className="domain-schema-list">
                {items.map((r) => (
                    <div key={r.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{r.id}</code>
                        <span className="domain-schema-item__name">{r.name}</span>
                        <span className="domain-schema-item__meta">
                            {r.effect && (
                                <span className="domain-schema-item__badge">{r.effect}</span>
                            )}
                            {r.entity && ` · ${r.entity.split("/").pop()}`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === "medias") {
        return (
            <div className="domain-schema-list">
                {items.map((m) => (
                    <div key={m.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{m.id}</code>
                        <span className="domain-schema-item__meta">
                            {m.type}
                            {m.iconName && ` · ${m.iconName}`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // ==== Разрешения ====
    if (sectionKey === "permissions") {
        return (
            <div className="domain-schema-list">
                {items.map((p: any) => (
                    <div key={p.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{p.id}</code>
                        {p.name && p.name !== p.id && (
                            <span className="domain-schema-item__name">{p.name}</span>
                        )}
                        {p.description && (
                            <span className="domain-schema-item__meta">{p.description}</span>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    // ==== Правила доступа ====
    if (sectionKey === "accessRules") {
        return (
            <div className="domain-schema-list">
                {items.map((r: any) => (
                    <div key={r.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{r.id}</code>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{r.target}</span>
                            {r.entity && ` · ${String(r.entity).split("/").pop()}`}
                            {r.linkage && ` · ${String(r.linkage).split("/").pop()}`}
                            {r.actionId && ` · ${r.actionId}`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // ==== Локализации ====
    if (sectionKey === "localizations") {
        return (
            <div className="domain-schema-list">
                {items.map((loc: any) => (
                    <div key={loc.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{loc.id}</code>
                        <span className="domain-schema-item__meta">
                            {loc.keysCount}{" "}
                            {loc.keysCount === 1 ? "ключ" : loc.keysCount < 5 ? "ключа" : "ключей"}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // Fallback для новых секций (trees, transitiveLinkages, uiRules, uiPresets, counterColorPattern)
    return (
        <div className="domain-schema-list">
            {items.map((item: any) => (
                <div key={item.id} className="domain-schema-item">
                    <code className="domain-schema-item__id">{item.id}</code>
                    {item.name && item.name !== item.id && (
                        <span className="domain-schema-item__name">{item.name}</span>
                    )}
                    <span className="domain-schema-item__meta">
                        {item.type && (
                            <span className="domain-schema-item__badge">{item.type}</span>
                        )}
                        {item.target && (
                            <span className="domain-schema-item__badge">{item.target}</span>
                        )}
                        {item.effect && (
                            <span className="domain-schema-item__badge">{item.effect}</span>
                        )}
                        {item.rootEntity && ` · корень: ${item.rootEntity}`}
                        {item.joinsCount != null && ` · ${item.joinsCount} связей`}
                        {item.red && ` · red: ${item.red}`}
                        {item.yellow && ` · yellow: ${item.yellow}`}
                    </span>
                </div>
            ))}
        </div>
    );
}