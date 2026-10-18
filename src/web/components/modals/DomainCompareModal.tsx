import React, { useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { useNavigation } from '../../hooks/useNavigation';
import { MIcon } from '../common/MIcon';
import { DomainCombobox } from '../common/DomainCombobox';
import { compareDomains } from '../../lib/model/domain-compare';

export function DomainCompareModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const { goto } = useNavigation();

    const open = store.domainCompareOpen;

    const [domainA, setDomainA] = useState('');
    const [domainB, setDomainB] = useState('');

    const prefillA = useGraphStore((s) => s.domainComparePrefillA);
    const setPrefillA = useGraphStore((s) => s.setDomainComparePrefillA);

    useEffect(() => {
        if (!open) return;
        if (prefillA) {
            setDomainA(prefillA);
            setPrefillA(null);
        }
    }, [open, prefillA, setPrefillA]);

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const result = useMemo(() => {
        if (!index || !domainA || !domainB || domainA === domainB) return null;
        return compareDomains(index, domainA, domainB);
    }, [index, domainA, domainB]);

    const openEntity = (fqid: string) => {
        store.setDomainCompareOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setDomainCompareOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">🔀 Сравнение доменов</div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setDomainCompareOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}

                {index && (
                    <div className="help-modal__body help-modal__body--flush">
                        {/* Выбор доменов */}
                        <div className="compare-selectors">
                            <div className="compare-selector">
                                <div className="compare-selector__label">Домен A</div>
                                <DomainCombobox
                                    value={domainA}
                                    onChange={setDomainA}
                                    domains={allDomains}
                                    placeholder="Выберите домен A..."
                                />
                            </div>
                            <div className="compare-selector__swap">
                                <MIcon name="compare_arrows" />
                            </div>
                            <div className="compare-selector">
                                <div className="compare-selector__label">Домен B</div>
                                <DomainCombobox
                                    value={domainB}
                                    onChange={setDomainB}
                                    domains={allDomains}
                                    placeholder="Выберите домен B..."
                                />
                            </div>
                        </div>

                        {!domainA || !domainB ? (
                            <div className="compare-empty">Выберите два домена</div>
                        ) : domainA === domainB ? (
                            <div className="compare-empty">Домены должны быть разными</div>
                        ) : result ? (
                            <>
                                {/* Сводка */}
                                <div className="compare-summary">
                                    <div className="compare-side compare-side--a">
                                        <div className="compare-side__id">{result.domainA.domainId}</div>
                                        <div className="compare-side__name">{result.domainA.domainName}</div>
                                        <div className="compare-side__metrics">
                                            <span>{result.domainA.entityCount} сущностей</span>
                                            <span>{result.domainA.attributeCount} атрибутов</span>
                                            {result.domainA.sonarScore != null && (
                                                <span>Sonar: {result.domainA.sonarScore}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="compare-side compare-side--b">
                                        <div className="compare-side__id">{result.domainB.domainId}</div>
                                        <div className="compare-side__name">{result.domainB.domainName}</div>
                                        <div className="compare-side__metrics">
                                            <span>{result.domainB.entityCount} сущностей</span>
                                            <span>{result.domainB.attributeCount} атрибутов</span>
                                            {result.domainB.sonarScore != null && (
                                                <span>Sonar: {result.domainB.sonarScore}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Только в A */}
                                {result.entities.onlyInA.length > 0 && (
                                    <div className="compare-section compare-section--a">
                                        <div className="compare-section__title">
                                            Только в A ({result.entities.onlyInA.length})
                                        </div>
                                        {result.entities.onlyInA.map((e) => (
                                            <button
                                                key={e.fqid}
                                                className="compare-item compare-item--link"
                                                onClick={() => openEntity(e.fqid)}
                                            >
                                                <code>{e.entityId}</code>
                                                <span>{e.name}</span>
                                                <span className="compare-item__meta">{e.attributes.length} атр.</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Только в B */}
                                {result.entities.onlyInB.length > 0 && (
                                    <div className="compare-section compare-section--b">
                                        <div className="compare-section__title">
                                            Только в B ({result.entities.onlyInB.length})
                                        </div>
                                        {result.entities.onlyInB.map((e) => (
                                            <button
                                                key={e.fqid}
                                                className="compare-item compare-item--link"
                                                onClick={() => openEntity(e.fqid)}
                                            >
                                                <code>{e.entityId}</code>
                                                <span>{e.name}</span>
                                                <span className="compare-item__meta">{e.attributes.length} атр.</span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Общие сущности с различиями */}
                                {result.entities.shared.filter(
                                    (s) =>
                                        s.attrsOnlyInA.length > 0 ||
                                        s.attrsOnlyInB.length > 0 ||
                                        s.attrsDifferentType.length > 0 ||
                                        s.inheritsChanged ||
                                        s.nameChanged
                                ).length > 0 && (
                                        <div className="compare-section compare-section--shared">
                                            <div className="compare-section__title">
                                                Общие сущности с различиями (
                                                {result.entities.shared.filter(
                                                    (s) =>
                                                        s.attrsOnlyInA.length > 0 ||
                                                        s.attrsOnlyInB.length > 0 ||
                                                        s.attrsDifferentType.length > 0 ||
                                                        s.inheritsChanged ||
                                                        s.nameChanged
                                                ).length}
                                                )
                                            </div>
                                            {result.entities.shared
                                                .filter(
                                                    (s) =>
                                                        s.attrsOnlyInA.length > 0 ||
                                                        s.attrsOnlyInB.length > 0 ||
                                                        s.attrsDifferentType.length > 0 ||
                                                        s.inheritsChanged ||
                                                        s.nameChanged
                                                )
                                                .map((s) => (
                                                    <div key={s.entityA.entityId} className="compare-shared-item">
                                                        <div className="compare-shared-item__head">
                                                            <code>{s.entityA.entityId}</code>
                                                            {s.nameChanged && (
                                                                <span className="compare-change-badge">name изменилось</span>
                                                            )}
                                                            {s.inheritsChanged && (
                                                                <span className="compare-change-badge">
                                                                    inherits: {s.entityA.inherits || '—'} → {s.entityB.inherits || '—'}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {s.attrsOnlyInA.length > 0 && (
                                                            <div className="compare-attrs">
                                                                <span className="compare-attrs__label">Только в A:</span>
                                                                {s.attrsOnlyInA.map((aid) => (
                                                                    <code key={aid} className="compare-attr compare-attr--a">{aid}</code>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {s.attrsOnlyInB.length > 0 && (
                                                            <div className="compare-attrs">
                                                                <span className="compare-attrs__label">Только в B:</span>
                                                                {s.attrsOnlyInB.map((aid) => (
                                                                    <code key={aid} className="compare-attr compare-attr--b">{aid}</code>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {s.attrsDifferentType.length > 0 && (
                                                            <div className="compare-attrs">
                                                                <span className="compare-attrs__label">Разные типы:</span>
                                                                {s.attrsDifferentType.map((d) => (
                                                                    <span key={d.id} className="compare-difftype">
                                                                        <code>{d.id}</code>
                                                                        <span className="compare-difftype__a">{d.typeA}</span>
                                                                        <span className="compare-difftype__arrow">→</span>
                                                                        <span className="compare-difftype__b">{d.typeB}</span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    )}

                                {/* Если всё одинаково */}
                                {result.entities.onlyInA.length === 0 &&
                                    result.entities.onlyInB.length === 0 &&
                                    result.entities.shared.every(
                                        (s) =>
                                            s.attrsOnlyInA.length === 0 &&
                                            s.attrsOnlyInB.length === 0 &&
                                            s.attrsDifferentType.length === 0 &&
                                            !s.inheritsChanged &&
                                            !s.nameChanged
                                    ) && (
                                        <div className="compare-empty">
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                                            Домены идентичны по структуре сущностей и атрибутов
                                        </div>
                                    )}
                            </>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}