import React, { useMemo } from 'react';
import { MIcon } from '../common/MIcon';
import { computeImpact } from '../../lib/model/impact-analysis';
import type { ModelIndex } from '../../../shared/model-types';
import { useGraphStore } from '../../state/useGraphStore';
import { openFileInEditor } from "../../lib/open-file";

export interface ImpactAnalysisPanelProps {
    fqid: string;
    index: ModelIndex;
    onBack: () => void;
    onGotoDomain: (domainId: string) => void;
    onSelectEntity: (fqid: string) => void;
}

export function ImpactAnalysisPanel(props: ImpactAnalysisPanelProps) {
    const entityFavorites = useGraphStore((s) => s.entityFavorites);
    const isFav = entityFavorites.has(props.fqid);
    const toggleFav = useGraphStore((s) => s.toggleEntityFavorite);
    const impact = useMemo(() => computeImpact(props.fqid, props.index), [props.fqid, props.index]);

    if (!impact) {
        return (
            <div className="impact-panel">
                <button className="entity-graph-back" onClick={props.onBack}>← Назад к списку</button>
                <div className="entity-catalog-empty" style={{ marginTop: 60 }}>
                    Сущность не найдена в индексе
                </div>
            </div>
        );
    }

    const { entity } = impact;
    const refsTotal =
        impact.children.length +
        impact.referencedByAttributes.length +
        impact.mixins.length;

    return (
        <div className="impact-panel">
            <button className="entity-graph-back" onClick={props.onBack}>
                ← Назад к списку
            </button>

            <div className="impact-header">
                <div className="impact-header__fqid-row">
                    <div className="impact-header__fqid">
                        {entity.domainId}/{entity.entityId}
                    </div>
                    <button
                        className="impact-header__copy"
                        onClick={() => {
                            const fullFqid = `${entity.domainId}/${entity.entityId}`;
                            navigator.clipboard.writeText(fullFqid);
                            useGraphStore.getState().showSnackbar("FQID скопирован");
                        }}
                        title="Копировать FQID"
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                </div>
                <div className="impact-header__name">{entity.name}</div>
                {entity.description && (
                    <div className="impact-header__desc">{entity.description}</div>
                )}
                <div className="impact-header__badges">
                    <button
                        className="btn btn--primary"
                        onClick={() => props.onGotoDomain(entity.domainId)}
                    >
                        <MIcon name="menu_book" size="sm" />
                        Схема домена
                    </button>
                    <button
                        className="btn"
                        onClick={() => {
                            const nodes = useGraphStore.getState().nodes;
                            const node = nodes.find(
                                (n) =>
                                    (n.data.domainId || "").toLowerCase() ===
                                    entity.domainId.toLowerCase(),
                            );
                            if (node?.data.filePath) {
                                openFileInEditor(
                                    node.data.filePath,
                                    entity.fqid,
                                    entity.domainId,
                                );
                            } else {
                                useGraphStore
                                    .getState()
                                    .showSnackbar("Файл схемы не найден");
                            }
                        }}
                        title="Открыть YAML-файл с переходом к сущности"
                    >
                        <MIcon name="description" size="sm" />
                        Открыть файл
                    </button>
                    <span className="impact-stat">Ссылок: {refsTotal}</span>
                    <span className="impact-stat">
                        Атрибутов: {entity.attributes.length}
                    </span>
                </div>
            </div>

            <div className="impact-body">
                {/* === Наследование === */}
                <section className="impact-section">
                    <h3 className="impact-section__title">
                        <MIcon name="account_tree" size="sm" />
                        Наследование
                    </h3>

                    {impact.ancestors.length > 0 && (
                        <div className="impact-row">
                            <span className="impact-row__label">Родители ({impact.ancestors.length}):</span>
                            <div className="impact-row__links">
                                {impact.ancestors.map((a) => (
                                    <button
                                        key={a.fqid}
                                        className="impact-link"
                                        onClick={() => props.onSelectEntity(a.fqid)}
                                    >
                                        {a.entityId}
                                        <span className="impact-link__domain">{a.domainId}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {impact.children.length > 0 ? (
                        <div className="impact-row">
                            <span className="impact-row__label">Наследники ({impact.children.length}):</span>
                            <div className="impact-row__links">
                                {impact.children.map((c) => (
                                    <button
                                        key={c.fqid}
                                        className="impact-link"
                                        onClick={() => props.onSelectEntity(c.fqid)}
                                    >
                                        {c.entityId}
                                        <span className="impact-link__domain">{c.domainId}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="impact-row impact-row--empty">Наследников нет</div>
                    )}

                    {!entity.inherits && impact.ancestors.length === 0 && (
                        <div className="impact-row impact-row--empty">Не наследует от других сущностей</div>
                    )}
                </section>

                {/* === FQID-ссылки (кто ссылается на нас) === */}
                <section className="impact-section">
                    <h3 className="impact-section__title">
                        <MIcon name="call_received" size="sm" />
                        На неё ссылаются ({impact.referencedByAttributes.length})
                    </h3>
                    {impact.referencedByAttributes.length === 0 ? (
                        <div className="impact-row impact-row--empty">
                            Ни одна сущность не ссылается через атрибут типа Reference
                        </div>
                    ) : (
                        <div className="impact-refs">
                            {impact.referencedByAttributes.map(({ entity: refEntity, attributeId, attributeName }) => (
                                <div key={`${refEntity.fqid}#${attributeId}`} className="impact-ref">
                                    <button
                                        className="impact-link"
                                        onClick={() => props.onSelectEntity(refEntity.fqid)}
                                    >
                                        {refEntity.entityId}
                                        <span className="impact-link__domain">{refEntity.domainId}</span>
                                    </button>
                                    <span className="impact-ref__arrow">→</span>
                                    <code className="impact-ref__attr">{attributeName}</code>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* === FQID-ссылки (на кого ссылаемся) === */}
                <section className="impact-section">
                    <h3 className="impact-section__title">
                        <MIcon name="call_made" size="sm" />
                        Ссылается на других ({impact.referencesToOthers.length})
                    </h3>
                    {impact.referencesToOthers.length === 0 ? (
                        <div className="impact-row impact-row--empty">Нет исходящих FQID-ссылок</div>
                    ) : (
                        <div className="impact-refs">
                            {impact.referencesToOthers.map(({ entity: refEntity, attributeId, attributeName }) => (
                                <div key={`${refEntity.fqid}#${attributeId}`} className="impact-ref">
                                    <code className="impact-ref__attr">{attributeName}</code>
                                    <span className="impact-ref__arrow">→</span>
                                    <button
                                        className="impact-link"
                                        onClick={() => props.onSelectEntity(refEntity.fqid)}
                                    >
                                        {refEntity.entityId}
                                        <span className="impact-link__domain">{refEntity.domainId}</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* === Миксины === */}
                {impact.mixins.length > 0 && (
                    <section className="impact-section">
                        <h3 className="impact-section__title">
                            <MIcon name="merge" size="sm" />
                            Расширяется миксинами ({impact.mixins.length})
                        </h3>
                        <div className="impact-mixins">
                            {impact.mixins.map((m) => (
                                <div key={`${m.domainId}#${m.id}`} className="impact-mixin">
                                    <div className="impact-mixin__head">
                                        <span className="impact-mixin__domain">{m.domainId}</span>
                                        <span className="impact-mixin__id">{m.id}</span>
                                    </div>
                                    {m.targetPanel && (
                                        <div className="impact-mixin__target">
                                            → панель <code>{m.targetPanel}</code>
                                        </div>
                                    )}
                                    {m.addedTabs.length > 0 && (
                                        <div className="impact-mixin__adds">
                                            + вкладки: {m.addedTabs.map((t) => <code key={t}>{t}</code>)}
                                        </div>
                                    )}
                                    {m.addedComponents.length > 0 && (
                                        <div className="impact-mixin__adds">
                                            + компоненты: {m.addedComponents.length}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* === Атрибуты === */}
                <section className="impact-section">
                    <h3 className="impact-section__title">
                        <MIcon name="list" size="sm" />
                        Атрибуты ({entity.attributes.length})
                    </h3>
                    {entity.attributes.length === 0 ? (
                        <div className="impact-row impact-row--empty">Собственных атрибутов нет</div>
                    ) : (
                        <div className="impact-attrs">
                            {entity.attributes.map((a) => (
                                <div key={a.id} className="impact-attr">
                                    <code className="impact-attr__id">{a.id}</code>
                                    <span className="impact-attr__name">{a.name}</span>
                                    <span className="impact-attr__type">{a.dataType}</span>
                                    {a.referenceEntity && (
                                        <button
                                            className="impact-attr__ref"
                                            onClick={() => props.onSelectEntity(a.referenceEntity!)}
                                        >
                                            → {a.referenceEntity.split('/')[1]}
                                        </button>
                                    )}
                                    {a.constraints.length > 0 && (
                                        <span className="impact-attr__constraints">
                                            {a.constraints.map((c) => (
                                                <span key={c} className="impact-attr__constraint">{c}</span>
                                            ))}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}