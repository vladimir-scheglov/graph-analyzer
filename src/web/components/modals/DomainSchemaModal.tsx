import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { useNavigation } from '../../hooks/useNavigation';
import { MIcon } from '../common/MIcon';
import { openFileInEditor } from '../../lib/open-file';
import type { DomainSchemaSummary } from '../../../shared/model-types';
import { generateDomainMarkdown, downloadDomainMarkdown } from '../../lib/markdown/domain-markdown';

type SectionKey = keyof DomainSchemaSummary['sections'];

const SECTION_LABELS: Record<SectionKey, { label: string; icon: string }> = {
    entities: { label: 'Сущности', icon: 'category' },
    linkages: { label: 'Связи', icon: 'link' },
    dataTypes: { label: 'Типы данных', icon: 'data_object' },
    sequences: { label: 'Последовательности', icon: 'linear_scale' },
    actions: { label: 'Действия', icon: 'bolt' },
    views: { label: 'Представления', icon: 'visibility' },
    menus: { label: 'Меню', icon: 'menu' },
    mixins: { label: 'Миксины', icon: 'merge' },
    dataRules: { label: 'Правила данных', icon: 'rule' },
    medias: { label: 'Иконки', icon: 'image' }
};

export function DomainSchemaModal() {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const { index, loading, error } = useModelIndex();

    const open = store.domainSchemaOpen;
    const domainId = store.domainSchemaDomainId;

    const [expanded, setExpanded] = useState<Set<SectionKey>>(
        new Set(['entities', 'linkages'])
    );

    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const toggle = (key: SectionKey) => {
        setExpanded((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key);
            else s.add(key);
            return s;
        });
    };

    const openEntity = (entityId: string) => {
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        store.setDomainSchemaOpen(false);
        store.setEntityCatalogInitialFqid(fqid);
        store.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setDomainSchemaOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span className="icon-label">Схема домена</span>
                        {schema && (
                            <span className="help-modal__badge">{schema.metadata.id}</span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setDomainSchemaOpen(false)}
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

                {!loading && !error && !schema && (
                    <div className="help-modal__body">
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-500)' }}>
                            Схема для этого домена не найдена в индексе
                        </div>
                    </div>
                )}

                {schema && (
                    <div className="domain-schema-body">
                        {/* ============ Метаданные ============ */}
                        <div className="domain-schema-header">
                            <div className="domain-schema-header__title">
                                {schema.metadata.name}
                                {schema.metadata.version && (
                                    <span className="domain-schema-header__version">
                                        v{schema.metadata.version}
                                    </span>
                                )}
                            </div>
                            {schema.metadata.description && (
                                <div className="domain-schema-header__desc">
                                    {schema.metadata.description}
                                </div>
                            )}
                            <div className="domain-schema-header__meta">
                                {schema.metadata.author && (
                                    <span>
                                        <MIcon name="person" size="sm" />
                                        {schema.metadata.author}
                                    </span>
                                )}
                                {schema.metadata.status && (
                                    <span>
                                        <MIcon name="flag" size="sm" />
                                        {schema.metadata.status}
                                    </span>
                                )}
                                {schema.metadata.date && (
                                    <span>
                                        <MIcon name="calendar_today" size="sm" />
                                        {schema.metadata.date}
                                    </span>
                                )}
                                {schema.metadata.tags.length > 0 && (
                                    <span className="domain-schema-header__tags">
                                        {schema.metadata.tags.map((t) => (
                                            <span key={t} className="tag">{t}</span>
                                        ))}
                                    </span>
                                )}
                            </div>
                            <div className="domain-schema-header__actions">
                                <button className="btn" onClick={() => goto(schema.domainId)}>
                                    <MIcon name="my_location" size="sm"/> К домену на графе
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => {
                                        store.setDomainSchemaOpen(false);
                                        // File path ищем через entity — но проще через node
                                        const node = store.nodes.find(
                                            (n) => n.data.domainId === schema.domainId
                                        );
                                        if (node?.data.filePath) {
                                            openFileInEditor(node.data.filePath, null);
                                        }
                                    }}
                                >
                                    <MIcon name="description" size="sm" /> Открыть файл
                                </button>
                                <button
                                    className="btn btn--primary"
                                    onClick={() => {
                                        const md = generateDomainMarkdown(schema, index!);
                                        downloadDomainMarkdown(schema.domainId, md);
                                    }}
                                    title="Скачать структуру схемы как Markdown-файл"
                                >
                                    <MIcon name="description" size="sm" /> Экспорт в Markdown
                                </button>
                            </div>
                        </div>

                        {/* ============ Секции ============ */}
                        <div className="domain-schema-sections">
                            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => {
                                const section = schema.sections[key];
                                const isOpen = expanded.has(key);
                                const meta = SECTION_LABELS[key];

                                return (
                                    <div
                                        key={key}
                                        className={'domain-schema-section' + (isOpen ? ' open' : '')}
                                    >
                                        <button
                                            className="domain-schema-section__head"
                                            onClick={() => toggle(key)}
                                        >
                                            <MIcon name={isOpen ? 'expand_more' : 'chevron_right'} size="sm" />
                                            <MIcon name={meta.icon} size="sm" />
                                            <span className="domain-schema-section__title">
                                                {meta.label}
                                            </span>
                                            <span className={'domain-schema-section__count' + (section.count === 0 ? ' zero' : '')}>
                                                {section.count}
                                            </span>
                                        </button>

                                        {isOpen && section.count > 0 && (
                                            <div className="domain-schema-section__body">
                                                <SectionItems
                                                    sectionKey={key}
                                                    items={section.items}
                                                    onOpenEntity={openEntity}
                                                />
                                            </div>
                                        )}

                                        {isOpen && section.count === 0 && (
                                            <div className="domain-schema-section__body domain-schema-section__body--empty">
                                                Пусто
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ============ Флаги ============ */}
                        {(schema.flags.hasExchangeSettings || schema.flags.hasCounterColorPattern) && (
                            <div className="domain-schema-flags">
                                {schema.flags.hasExchangeSettings && (
                                    <span className="domain-schema-flag">
                                        <MIcon name="swap_horiz" size="sm" /> Настроен обмен данными
                                    </span>
                                )}
                                {schema.flags.hasCounterColorPattern && (
                                    <span className="domain-schema-flag">
                                        <MIcon name="palette" size="sm" /> Есть цветовые схемы счётчиков
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Разные типы секций ============

function SectionItems({
    sectionKey,
    items,
    onOpenEntity
}: {
    sectionKey: SectionKey;
    items: any[];
    onOpenEntity: (id: string) => void;
}) {
    if (sectionKey === 'entities') {
        return (
            <div className="domain-schema-list">
                {items.map((e) => (
                    <button
                        key={e.id}
                        className="domain-schema-item domain-schema-item--link"
                        onClick={() => onOpenEntity(e.id)}
                    >
                        <code className="domain-schema-item__id">{e.id}</code>
                        <span className="domain-schema-item__name">{e.name}</span>
                        <span className="domain-schema-item__meta">
                            {e.attributesCount} атр.
                            {e.inherits && ` · ↳ ${e.inherits.split('/').pop()}`}
                        </span>
                    </button>
                ))}
            </div>
        );
    }

    if (sectionKey === 'linkages') {
        return (
            <div className="domain-schema-list">
                {items.map((l) => (
                    <div key={l.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{l.id}</code>
                        <span className="domain-schema-item__name">{l.name}</span>
                        <span className="domain-schema-item__meta">
                            {l.side1.split('/').pop()} {l.undirected ? '↔' : '→'} {l.side2.split('/').pop()}
                            {' · '}
                            <span className="domain-schema-item__badge">{l.type}</span>
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'dataTypes') {
        return (
            <div className="domain-schema-list">
                {items.map((d) => (
                    <div key={d.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{d.id}</code>
                        <span className="domain-schema-item__name">{d.name}</span>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{d.kind}</span>
                            {d.valuesCount != null && ` · ${d.valuesCount} значений`}
                            {d.statusesCount != null && ` · ${d.statusesCount} статусов`}
                            {d.attributesCount != null && ` · ${d.attributesCount} колонок`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'sequences') {
        return (
            <div className="domain-schema-list">
                {items.map((s) => (
                    <div key={s.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{s.id}</code>
                        <span className="domain-schema-item__meta">начинается с {s.startFrom}</span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'actions') {
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

    if (sectionKey === 'views') {
        return (
            <div className="domain-schema-list">
                {items.map((v) => (
                    <div key={v.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{v.id}</code>
                        <span className="domain-schema-item__name">{v.label || ''}</span>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{v.type}</span>
                            {v.entity && ` · ${v.entity.split('/').pop()}`}
                            {v.isMixin && ' · mixin'}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'menus') {
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

    if (sectionKey === 'mixins') {
        return (
            <div className="domain-schema-list">
                {items.map((m) => (
                    <div key={m.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{m.id}</code>
                        <span className="domain-schema-item__meta">
                            <span className="domain-schema-item__badge">{m.type}</span>
                            {' → '}
                            {m.entity}
                            {' · '}
                            {m.viewsCount} view
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'dataRules') {
        return (
            <div className="domain-schema-list">
                {items.map((r) => (
                    <div key={r.id} className="domain-schema-item">
                        <code className="domain-schema-item__id">{r.id}</code>
                        <span className="domain-schema-item__name">{r.name}</span>
                        <span className="domain-schema-item__meta">
                            {r.effect && <span className="domain-schema-item__badge">{r.effect}</span>}
                            {r.entity && ` · ${r.entity.split('/').pop()}`}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    if (sectionKey === 'medias') {
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

    return null;
}