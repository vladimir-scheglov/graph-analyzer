import React from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

export interface ProblemsSectionProps {
    isolatedCount: number;
    cyclesCount: number;
    problemDomains: Array<{ node: any; count: number }>;
    brokenRefsDomains: Array<{ node: any; count: number }>;
    totalProblems: number;
}

export function ProblemsSection(props: ProblemsSectionProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();

    return (
        <Section id="problems" title="Проблемы" icon="warning" badge={props.totalProblems}>
            {props.problemDomains.length > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title">
                        <MIcon name="cancel" size="sm" /> Невалидные ({props.problemDomains.length})
                    </div>
                    {props.problemDomains.map((item) => (
                        <button
                            key={item.node.id}
                            className="rank-item"
                            onClick={() => goto(item.node.data.domainId)}
                        >
                            <span className="rank-item__label">{item.node.data.domainId}</span>
                            <span className="rank-item__value" style={{ color: 'var(--danger)' }}>
                                {item.count}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {props.brokenRefsDomains.length > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title">
                        <MIcon name="link_off" size="sm" /> Битые FQID ({props.brokenRefsDomains.length})
                    </div>
                    {props.brokenRefsDomains.map((item) => (
                        <button
                            key={item.node.id}
                            className="rank-item"
                            onClick={() => goto(item.node.data.domainId)}
                        >
                            <span className="rank-item__label">{item.node.data.domainId}</span>
                            <span className="rank-item__value" style={{ color: 'var(--warning)' }}>
                                {item.count}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {props.isolatedCount > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title">
                        <MIcon name="radio_button_unchecked" size="sm" /> Изолированные ({props.isolatedCount})
                    </div>
                    <button
                        className="problems-group__action"
                        onClick={() => store.setIsolatedOnly(true)}
                    >
                        Показать
                    </button>
                </div>
            )}

            {props.cyclesCount > 0 && (
                <div className="problems-group">
                    <div className="problems-group__title">
                        <MIcon name="cycle" size="sm" /> Циклы ({props.cyclesCount})
                    </div>
                    <button
                        className="problems-group__action"
                        onClick={() => document.dispatchEvent(new CustomEvent('dg:find-cycles'))}
                    >
                        Подсветить
                    </button>
                </div>
            )}
        </Section>
    );
}