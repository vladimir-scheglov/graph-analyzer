import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';

export function NamespacesSection({ items }: { items: Array<[string, number]> }) {
    const viewMode = useGraphStore((s) => s.viewMode);
    const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
    const setListSearchQuery = useGraphStore((s) => s.setListSearchQuery);
    const listQuery = useGraphStore((s) => s.listSearchQuery);

    if (items.length === 0) return null;

    const max = items[0][1];

    return (
        <Section id="namespaces" title="Неймспейсы" icon="category">
            <div className="bar-list">
                {items.map((entry) => {
                    const [ns, count] = entry;
                    const isActive =
                        viewMode === "list"
                            ? listQuery === ns
                            : false;
                    return (
                        <button
                            key={ns}
                            className={"bar-item" + (isActive ? " bar-item--active" : "")}
                            onClick={() => {
                                if (viewMode === "list") {
                                    setListSearchQuery(isActive ? "" : ns);
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
                                    style={{ width: (count / max) * 100 + '%' }}
                                />
                            </span>
                        </button>
                    );
                })}
            </div>
        </Section>
    );
}