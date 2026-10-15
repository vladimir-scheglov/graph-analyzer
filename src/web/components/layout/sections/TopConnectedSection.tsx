import React from 'react';
import { useNavigation } from '../../../hooks/useNavigation';
import { Section } from '../Section';
import type { ConnectedItem } from '../../../hooks/useSidebarStats';

export function TopConnectedSection({ items }: { items: ConnectedItem[] }) {
    const { goto } = useNavigation();
    if (items.length === 0) return null;

    return (
        <Section id="top" title="Топ по связям" icon="bar_chart">
            <div className="rank-list">
                {items.map((item, i) => (
                    <button
                        key={item.node.id}
                        className="rank-item"
                        onClick={() => goto(item.node.data.domainId)}
                    >
                        <span className="rank-item__num">{i + 1}</span>
                        <span className="rank-item__label">{item.node.data.domainId}</span>
                        <span className="rank-item__value">{item.degree}</span>
                    </button>
                ))}
            </div>
        </Section>
    );
}