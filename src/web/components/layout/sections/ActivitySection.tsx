import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { Section } from '../Section';
import { ActivityChart } from '../ActivityChart';

export function ActivitySection() {
    const nodes = useGraphStore((s) => s.nodes);
    const period = useGraphStore((s) => s.activityPeriod);
    const setPeriod = useGraphStore((s) => s.setActivityPeriod);

    return (
        <Section id="activity" title="Активность" icon="trending_up">
            <div className="activity-periods">
                {[7, 30, 90].map((d) => (
                    <button
                        key={d}
                        className={'period-btn' + (period === d ? ' period-btn--active' : '')}
                        onClick={() => setPeriod(d)}
                    >
                        {d}д
                    </button>
                ))}
            </div>
            <ActivityChart nodes={nodes} days={period} />
        </Section>
    );
}