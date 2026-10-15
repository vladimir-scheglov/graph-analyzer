import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { MIcon } from '../common/MIcon';
import { LINKAGE_COLOR, FQID_COLOR } from '../../lib/graph-transforms';

export interface FilterMenuProps {
    counts: { domain: number; missing: number; broken: number; linkage: number; fqid: number };
}

export function FilterMenu({ counts }: FilterMenuProps) {
    const filters = useGraphStore((s) => s.filters);
    const setFilters = useGraphStore((s) => s.setFilters);
    const namespaceFilter = useGraphStore((s) => s.namespaceFilter);
    const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
    const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
    const setBookmarksOnly = useGraphStore((s) => s.setBookmarksOnly);
    const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
    const setOnlyInvalid = useGraphStore((s) => s.setOnlyInvalid);
    const isolatedOnly = useGraphStore((s) => s.isolatedOnly);
    const setIsolatedOnly = useGraphStore((s) => s.setIsolatedOnly);
    const tooltipsEnabled = useGraphStore((s) => s.tooltipsEnabled);
    const setTooltipsEnabled = useGraphStore((s) => s.setTooltipsEnabled);
    const sidePanelEnabled = useGraphStore((s) => s.sidePanelEnabled);
    const setSidePanelEnabled = useGraphStore((s) => s.setSidePanelEnabled);

    const setAll = (val: boolean) =>
        setFilters((f) => ({ ...f, domain: val, missing: val, broken: val, linkage: val, fqid: val }));

    const resetAll = () => {
        setAll(true);
        setNamespaceFilter('');
        setBookmarksOnly(false);
        setOnlyInvalid(false);
        setIsolatedOnly(false);
    };

    const nodeRows = [
        { key: 'domain' as const, label: 'Domain', color: 'var(--success)' },
        { key: 'missing' as const, label: 'Missing', color: 'var(--warning)' },
        { key: 'broken' as const, label: 'Broken', color: 'var(--danger)' }
    ];
    const edgeRows = [
        { key: 'linkage' as const, label: 'Linkage', color: LINKAGE_COLOR },
        { key: 'fqid' as const, label: 'FQID', color: FQID_COLOR }
    ];

    return (
        <div className="menu">
            <div className="menu__header">
                <span>Фильтры</span>
                <button className="menu__action" onClick={resetAll}>
                    Сбросить
                </button>
            </div>

            <div className="menu__section">
                <div className="menu__label">Тип узлов</div>
                {nodeRows.map((it) => (
                    <label key={it.key} className="menu__checkbox">
                        <input
                            type="checkbox"
                            checked={!!filters[it.key]}
                            onChange={() => setFilters((f) => ({ ...f, [it.key]: !f[it.key] }))}
                        />
                        <span className="menu__check" />
                        <span className="menu__dot" style={{ background: it.color }} />
                        <span className="menu__text">{it.label}</span>
                        <span className="menu__count">{counts[it.key]}</span>
                    </label>
                ))}
            </div>

            <div className="menu__section">
                <div className="menu__label">Тип связей</div>
                {edgeRows.map((it) => (
                    <label key={it.key} className="menu__checkbox">
                        <input
                            type="checkbox"
                            checked={!!filters[it.key]}
                            onChange={() => setFilters((f) => ({ ...f, [it.key]: !f[it.key] }))}
                        />
                        <span className="menu__check" />
                        <span className="menu__dot" style={{ background: it.color }} />
                        <span className="menu__text">{it.label}</span>
                        <span className="menu__count">{counts[it.key]}</span>
                    </label>
                ))}
            </div>

            <div className="menu__section">
                <div className="menu__label">Namespace</div>
                <input
                    className="menu__input"
                    type="text"
                    placeholder="sgrc.risk.*, !test.*"
                    value={namespaceFilter}
                    onChange={(e) => setNamespaceFilter(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            document.dispatchEvent(new CustomEvent('close-all-popovers'));
                        }
                    }}
                />
                <div className="menu__hint">
                    Несколько масок через , ; или пробел. <b>!</b> — исключить. <b>*</b> — любой символ.
                </div>
            </div>

            <div className="menu__divider" />

            <div className="menu__section">
                <div className="menu__label">Дополнительно</div>

                <label className="menu__checkbox">
                    <input type="checkbox" checked={bookmarksOnly} onChange={() => setBookmarksOnly(!bookmarksOnly)} />
                    <span className="menu__check" />
                    <span className="menu__text">Только избранные (★)</span>
                </label>

                <label className="menu__checkbox">
                    <input type="checkbox" checked={onlyInvalid} onChange={() => setOnlyInvalid(!onlyInvalid)} />
                    <span className="menu__check" />
                    <span className="menu__text">Только невалидные (❌)</span>
                </label>

                <label className="menu__checkbox">
                    <input type="checkbox" checked={isolatedOnly} onChange={() => setIsolatedOnly((v) => !v)} />
                    <span className="menu__check" />
                    <span className="menu__text">Только изолированные (◯)</span>
                </label>

                <div className="menu__divider" />

                <label className="menu__checkbox">
                    <input
                        type="checkbox"
                        checked={!sidePanelEnabled}
                        onChange={() => setSidePanelEnabled((v) => !v)}
                    />
                    <span className="menu__check" />
                    <span className="menu__text">Не показывать правую панель (D)</span>
                </label>

                <label className="menu__checkbox">
                    <input
                        type="checkbox"
                        checked={!tooltipsEnabled}
                        onChange={() => setTooltipsEnabled((v) => !v)}
                    />
                    <span className="menu__check" />
                    <span className="menu__text">Скрывать тултипы</span>
                </label>
            </div>
        </div>
    );
}