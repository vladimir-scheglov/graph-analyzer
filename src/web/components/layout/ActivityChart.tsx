import React, { useMemo } from 'react';
import { buildActivityBuckets } from '../../lib/activity';

export interface ActivityChartProps {
    nodes: any[];
    days: number;
}

export function ActivityChart({ nodes, days }: ActivityChartProps) {
    const buckets = useMemo(() => buildActivityBuckets(nodes, days), [nodes, days]);
    const max = useMemo(() => {
        const m = Math.max(...buckets.map((b) => b.count));
        return m === 0 ? 1 : m;
    }, [buckets]);

    return (
        <div className="activity-chart">
            <div className="activity-chart__bars">
                {buckets.map((b, i) => {
                    const height = (b.count / max) * 100;
                    const isToday = i === buckets.length - 1;
                    return (
                        <div
                            key={i}
                            className={'activity-chart__bar' + (isToday ? ' activity-chart__bar--today' : '')}
                            style={{ height: Math.max(height, b.count > 0 ? 8 : 0) + '%' }}
                            title={b.date.toLocaleDateString('ru-RU') + ': ' + b.count + ' обновлений'}
                        />
                    );
                })}
            </div>
            <div className="activity-chart__legend">
                <span>{days} дней назад</span>
                <span style={{ color: 'var(--text-200)' }}>сегодня</span>
                <span>макс: {max}</span>
            </div>
        </div>
    );
}