import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';

export function NamespacesSection({ items }: { items: Array<[string, number]> }) {
    const setNamespaceFilter = useGraphStore((s) => s.setNamespaceFilter);
    if (items.length === 0) return null;

    const max = items[0][1];

    return (
        <Section id="namespaces" title="Неймспейсы" icon="category">
            <div className="bar-list">
                {items.map((entry) => {
                    const [ns, count] = entry;
                    return (
                        <button
                            key={ns}
                            className="bar-item"
                            onClick={() => setNamespaceFilter(ns)}
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