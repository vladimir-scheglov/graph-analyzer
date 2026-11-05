import React, { useState } from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section, SectionTabs } from '../Section';

type Tab = 'namespaces' | 'tags';

export interface CloudsSectionProps {
    namespaces: Array<[string, number]>;
    tagCloud: Array<[string, number]>;
}

export function CloudsSection({ namespaces, tagCloud }: CloudsSectionProps) {
    const viewMode = useGraphStore((s) => s.viewMode);
    const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
    const setListSearchQuery = useGraphStore((s) => s.setListSearchQuery);
    const listQuery = useGraphStore((s) => s.listSearchQuery);
    const tagFilters = useGraphStore((s) => s.tagFilters);

    const [tab, setTab] = useState<Tab>(
        namespaces.length > 0 ? 'namespaces' : 'tags',
    );

    if (namespaces.length === 0 && tagCloud.length === 0) return null;

    const nsMax = namespaces.length > 0 ? namespaces[0][1] : 1;

    return (
        <Section
            id="clouds"
            title="Облака"
            icon="cloud"
            right={
                <SectionTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    options={[
                        {
                            value: 'namespaces',
                            label: 'NS',
                            icon: 'category',
                        },
                        { value: 'tags', label: 'Теги', icon: 'label' },
                    ]}
                />
            }
        >
            {tab === 'namespaces' && (
                <div className="bar-list">
                    {namespaces.length === 0 && (
                        <div className="rank-empty">Нет неймспейсов</div>
                    )}
                    {namespaces.map((entry) => {
                        const [ns, count] = entry;
                        const isActive =
                            viewMode === 'list'
                                ? listQuery === ns
                                : false;
                        return (
                            <button
                                key={ns}
                                className={
                                    'bar-item' +
                                    (isActive ? ' bar-item--active' : '')
                                }
                                onClick={() => {
                                    if (viewMode === 'list') {
                                        setListSearchQuery(isActive ? '' : ns);
                                    } else {
                                        setNamespaceFilter(ns);
                                    }
                                }}
                            >
                                <span className="bar-item__label">{ns}</span>
                                <span className="bar-item__value">{count}</span>
                                <span className="bar-item__track">
                                    <span
                                        className="bar-item__fill"
                                        style={{ width: (count / nsMax) * 100 + '%' }}
                                    />
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            {tab === 'tags' && (
                <div className="tag-cloud">
                    {tagCloud.length === 0 && (
                        <div className="rank-empty">Нет тегов</div>
                    )}
                    {tagCloud.map((entry) => {
                        const [tag, count] = entry;
                        const active =
                            viewMode === 'list'
                                ? listQuery === tag
                                : tagFilters.has(tag);
                        return (
                            <button
                                key={tag}
                                className={'tag' + (active ? ' tag--active' : '')}
                                onClick={() => {
                                    const st = useGraphStore.getState();
                                    if (viewMode === 'list') {
                                        st.setListSearchQuery(active ? '' : tag);
                                    } else {
                                        st.toggleTagFilter(tag);
                                    }
                                }}
                            >
                                {tag}
                                <span className="tag__count">{count}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </Section>
    );
}