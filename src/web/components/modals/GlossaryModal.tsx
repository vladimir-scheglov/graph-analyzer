import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import {
    buildEntityGlossary,
    buildAttributeGlossary,
    buildDataTypeGlossary,
    filterGlossarySections,
    GlossaryEntry,
    GlossarySection
} from '../../lib/model/glossary';

type GlossaryTab = 'entity' | 'attribute' | 'dataType';

export function GlossaryModal() {
    const { index, loading, error } = useModelIndex();

    const [tab, setTab] = useState<GlossaryTab>('entity');
    const [query, setQuery] = useState('');

    const open = useGraphStore((s) => s.glossaryOpen);

    const sections = useMemo<GlossarySection[]>(() => {
        if (!index) return [];
        if (tab === 'entity') return buildEntityGlossary(index);
        if (tab === 'attribute') return buildAttributeGlossary(index);
        return buildDataTypeGlossary(index);
    }, [index, tab]);

    const filtered = useMemo(
        () => filterGlossarySections(sections, query),
        [sections, query]
    );

    const totalCount = useMemo(
        () => sections.reduce((s, sec) => s + sec.entries.length, 0),
        [sections]
    );

    const filteredCount = useMemo(
        () => filtered.reduce((s, sec) => s + sec.entries.length, 0),
        [filtered]
    );

    const openEntity = (fqid: string) => {
        const store = useGraphStore.getState();
        store.setGlossaryOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    const openDomainSchema = (domainId: string) => {
        const store = useGraphStore.getState();
        store.setGlossaryOpen(false);
        store.setDomainSchemaDomainId(domainId);
        store.setDomainSchemaOpen(true);
    };

    const openDataTypeInSchema = (domainId: string, dataTypeId: string) => {
        const store = useGraphStore.getState();
        store.setGlossaryOpen(false);
        store.setDomainSchemaDomainId(domainId);
        store.setDomainSchemaPrefillQuery(dataTypeId);
        store.setDomainSchemaPrefillExpandItem(`dataType:${dataTypeId}`);
        store.setDomainSchemaOpen(true);
    };

    const scrollToLetter = (letter: string) => {
        const el = document.getElementById('glossary-section-' + letter);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const availableLetters = filtered.map((s) => s.letter);

    const indexLetters = useMemo(() => {
        const latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const cyrillic = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
        const set = new Set(availableLetters);
        return [
            ...latin.split("").filter((l) => set.has(l)),
            ...cyrillic.split("").filter((l) => set.has(l)),
        ];
    }, [availableLetters]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setGlossaryOpen(false)}
        >
            <div
                className="help-modal glossary-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📚 Глоссарий
                        {index && (
                            <span className="help-modal__badge">
                                {filteredCount} / {totalCount}
                            </span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => useGraphStore.getState().setGlossaryOpen(false)}
                    >
                        ✕
                    </button>
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

                {index && (
                    <div className="glossary-body">
                        {/* ============ ЛЕВАЯ ПАНЕЛЬ: ВКЛАДКИ + УКАЗАТЕЛЬ ============ */}
                        <div className="glossary-sidebar">
                            <div className="glossary-tabs">
                                <button
                                    className={'glossary-tab' + (tab === 'entity' ? ' active' : '')}
                                    onClick={() => { setTab('entity'); setQuery(''); }}
                                >
                                    Сущности
                                </button>
                                <button
                                    className={'glossary-tab' + (tab === 'attribute' ? ' active' : '')}
                                    onClick={() => { setTab('attribute'); setQuery(''); }}
                                >
                                    Атрибуты
                                </button>
                                <button
                                    className={'glossary-tab' + (tab === 'dataType' ? ' active' : '')}
                                    onClick={() => { setTab('dataType'); setQuery(''); }}
                                >
                                    Типы данных
                                </button>
                            </div>

                            <div className="glossary-index">
                                <div className="glossary-index__title">Указатель</div>
                                <div className="glossary-index__letters">
                                    {indexLetters.map((L) => (
                                        <button
                                            key={L}
                                            className="glossary-letter"
                                            onClick={() => scrollToLetter(L)}
                                        >
                                            {L}
                                        </button>
                                    ))}
                                    {availableLetters.includes("#") && (
                                        <button
                                            className="glossary-letter"
                                            onClick={() => scrollToLetter("#")}
                                        >
                                            #
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ============ ПРАВАЯ ПАНЕЛЬ: СПИСОК ============ */}
                        <div className="glossary-content">
                            <div className="glossary-search-wrap">
                                <span className="entity-search-icon">🔍</span>
                                <input
                                    className="entity-search-input"
                                    type="text"
                                    placeholder={
                                        tab === 'entity' ? 'Поиск сущности...' :
                                            tab === 'attribute' ? 'Поиск атрибута...' :
                                                'Поиск типа данных...'
                                    }
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    autoFocus
                                />
                                {query && (
                                    <button
                                        className="entity-search-clear"
                                        onClick={() => setQuery('')}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            <div className="glossary-list">
                                {filtered.length === 0 ? (
                                    <div className="glossary-empty">
                                        {query ? `Ничего не найдено по запросу «${query}»` : 'Нет данных'}
                                    </div>
                                ) : (
                                    filtered.map((section) => (
                                        <div
                                            key={section.letter}
                                            id={'glossary-section-' + section.letter}
                                            className="glossary-section"
                                        >
                                            <div className="glossary-section__letter">{section.letter}</div>
                                            {section.entries.map((entry) => (
                                                <GlossaryEntryCard
                                                    key={
                                                        entry.kind === 'entity' ? entry.fqid :
                                                            entry.kind === 'attribute' ? entry.key :
                                                                entry.key
                                                    }
                                                    entry={entry}
                                                    query={query}
                                                    onOpenEntity={openEntity}
                                                    onOpenDomainSchema={openDomainSchema} 
                                                    onOpenDataTypeInSchema={openDataTypeInSchema}
                                                />
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Карточка записи ============

function GlossaryEntryCard({
    entry,
    query,
    onOpenEntity,
    onOpenDomainSchema,
    onOpenDataTypeInSchema,
}: {
    entry: GlossaryEntry;
    query: string;
    onOpenEntity: (fqid: string) => void;
    onOpenDomainSchema: (domainId: string) => void;
    onOpenDataTypeInSchema: (domainId: string, dataTypeId: string) => void;
}) {
    const highlight = (text: string): React.ReactNode => {
        if (!query) return text;
        const q = query.toLowerCase();
        const idx = text.toLowerCase().indexOf(q);
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="search-hl">{text.slice(idx, idx + q.length)}</mark>
                {text.slice(idx + q.length)}
            </>
        );
    };

    if (entry.kind === 'entity') {
        const e = entry.entity;
        return (
            <div className="glossary-entry">
                <div className="glossary-entry__head">
                    <button
                        className="glossary-entry__name"
                        onClick={() => onOpenEntity(e.fqid)}
                        title={e.fqid}
                    >
                        {highlight(e.name || e.entityId)}
                    </button>
                    <span className="glossary-entry__id">{e.entityId}</span>
                </div>
                <div className="glossary-entry__meta">
                    <button
                        className="glossary-entry__domain"
                        onClick={() => onOpenEntity(e.fqid)}
                    >
                        {e.domainId}
                    </button>
                    <span className="glossary-entry__tags">
                        {e.attributes.length} атрибутов
                    </span>
                    {e.inherits && (
                        <span className="glossary-entry__inherits">
                            ↳ {e.inherits.split('/')[1]}
                        </span>
                    )}
                </div>
                {e.description && (
                    <div className="glossary-entry__desc">{highlight(e.description)}</div>
                )}
            </div>
        );
    }

    if (entry.kind === 'attribute') {
        const a = entry.attribute;
        const e = entry.entity;
        return (
            <div className="glossary-entry">
                <div className="glossary-entry__head">
                    <button
                        className="glossary-entry__name"
                        onClick={() => onOpenEntity(e.fqid)}
                        title={`${e.fqid}#${a.id}`}
                    >
                        {highlight(a.name || a.id)}
                    </button>
                    <code className="glossary-entry__attr-id">{a.id}</code>
                    <span className="glossary-entry__type">{a.dataType}</span>
                </div>
                <div className="glossary-entry__meta">
                    <span className="glossary-entry__context">
                        в <strong>{e.entityId}</strong>
                    </span>
                    <button
                        className="glossary-entry__domain"
                        onClick={() => onOpenEntity(e.fqid)}
                    >
                        {e.domainId}
                    </button>
                    {a.referenceEntity && (
                        <span className="glossary-entry__ref">
                            → {a.referenceEntity.split('/')[1]}
                        </span>
                    )}
                </div>
                {a.description && (
                    <div className="glossary-entry__desc">{highlight(a.description)}</div>
                )}
            </div>
        );
    }

    // dataType
    const d = entry.dataType;
    return (
        <div className="glossary-entry">
            <div className="glossary-entry__head">
                <button
                    className="glossary-entry__name"
                    onClick={() => onOpenDataTypeInSchema(d.domainId, d.id)}
                    title={`Открыть ${d.domainId} → ${d.id} в схеме домена`}
                >
                    {highlight(d.name || d.id)}
                </button>
                <code className="glossary-entry__attr-id">{d.id}</code>
                <span className="glossary-entry__type">{d.kind}</span>
            </div>
            <div className="glossary-entry__meta">
                <button
                    className="glossary-entry__domain"
                    onClick={() => onOpenDomainSchema(d.domainId)}
                    title={`Открыть схему домена ${d.domainId}`}
                >
                    {d.domainId}
                </button>
                {d.valuesCount != null && (
                    <span className="glossary-entry__tags">{d.valuesCount} значений</span>
                )}
            </div>
            {d.description && (
                <div className="glossary-entry__desc">{highlight(d.description)}</div>
            )}
        </div>
    );
}