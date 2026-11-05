import React, { useState } from 'react';
import { useNavigation } from '../../../hooks/useNavigation';
import { Section, SectionTabs } from '../Section';
import type {
    ConnectedItem,
    WorstHealthItem,
} from '../../../hooks/useSidebarStats';

type Tab = 'connected' | 'health';

export interface RatingsSectionProps {
    topConnected: ConnectedItem[];
    worstHealth: WorstHealthItem[];
    compact: boolean;
}

export function RatingsSection({
    topConnected,
    worstHealth,
    compact,
}: RatingsSectionProps) {
    const { goto } = useNavigation();
    const [tab, setTab] = useState<Tab>('connected');

    if (topConnected.length === 0 && worstHealth.length === 0) return null;

    const limit = compact ? 5 : 10;

    return (
        <Section
            id="ratings"
            title="Рейтинги"
            icon="bar_chart"
            right={
                <SectionTabs<Tab>
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'connected', label: 'Связи', icon: 'link' },
                        { value: 'health', label: 'Health', icon: 'favorite' },
                    ]}
                />
            }
        >
            {tab === 'connected' && (
                <div className="rank-list">
                    {topConnected.length === 0 && (
                        <div className="rank-empty">Нет связей</div>
                    )}
                    {topConnected.slice(0, limit).map((item, i) => (
                        <button
                            key={item.node.id}
                            className="rank-item"
                            onClick={() => goto(item.node.data.domainId)}
                        >
                            <span className="rank-item__num">{i + 1}</span>
                            <span className="rank-item__label">
                                {item.node.data.domainId}
                            </span>
                            <span className="rank-item__value">
                                {item.degree}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {tab === 'health' && (
                <div className="rank-list">
                    {worstHealth.length === 0 && (
                        <div className="rank-empty">Нет данных</div>
                    )}
                    {worstHealth.slice(0, limit).map((item, i) => {
                        const hc =
                            item.health >= 80
                                ? 'good'
                                : item.health >= 50
                                    ? 'mid'
                                    : 'bad';
                        return (
                            <button
                                key={item.node.id}
                                className="rank-item"
                                onClick={() => goto(item.node.data.domainId)}
                            >
                                <span className="rank-item__num">{i + 1}</span>
                                <span className="rank-item__label">
                                    {item.node.data.domainId}
                                </span>
                                <span
                                    className={
                                        'rf-node__health rf-node__health--' + hc
                                    }
                                    style={{ fontSize: 10, padding: '1px 6px' }}
                                >
                                    {item.health}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </Section>
    );
}