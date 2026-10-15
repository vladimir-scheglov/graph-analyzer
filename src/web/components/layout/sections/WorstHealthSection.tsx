import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useNavigation } from '../../../hooks/useNavigation';
import { Section } from '../Section';
import type { WorstHealthItem } from '../../../hooks/useSidebarStats';

export function WorstHealthSection({ items }: { items: WorstHealthItem[] }) {
    const { goto } = useNavigation();
    const compact = useGraphStore((s) => s.sidebarCompact);
    if (items.length === 0) return null;

    return (
        <Section id="worst" title="Стена позора" icon="trending_down">
            <div className="rank-list">
                {items.slice(0, compact ? 5 : 20).map((item, i) => {
                    const hc = item.health >= 80 ? 'good' : item.health >= 50 ? 'mid' : 'bad';
                    return (
                        <button
                            key={item.node.id}
                            className="rank-item"
                            onClick={() => goto(item.node.data.domainId)}
                        >
                            <span className="rank-item__num">{i + 1}</span>
                            <span className="rank-item__label">{item.node.data.domainId}</span>
                            <span
                                className={'rf-node__health rf-node__health--' + hc}
                                style={{ fontSize: 10, padding: '1px 6px' }}
                            >
                                {item.health}
                            </span>
                        </button>
                    );
                })}
            </div>
        </Section>
    );
}