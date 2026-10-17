import React from 'react';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';

export interface DomainSonarPanelProps {
    domainId: string;
}

export function DomainSonarPanel({ domainId }: DomainSonarPanelProps) {
    const { index } = useModelIndex();
    if (!index) return null;

    const sonar = index.lint.sonar.byDomain[domainId];
    if (!sonar) return null;

    const gradeClass = 'sonar-grade--' + sonar.grade.toLowerCase();

    return (
        <div className="details__field domain-sonar">
            <div className="details__field-label">Sonar-оценка</div>

            <div className="domain-sonar__head">
                <div className={'domain-sonar__grade ' + gradeClass}>
                    {sonar.grade}
                </div>
                <div className="domain-sonar__score">{sonar.score}/100</div>
            </div>

            <div className="domain-sonar__bar">
                <div
                    className={'domain-sonar__fill ' + gradeClass}
                    style={{ width: sonar.score + '%' }}
                />
            </div>

            <div className="domain-sonar__breakdown">
                {sonar.breakdown
                    .filter((b) => b.issueCount > 0)
                    .sort((a, b) => a.score - b.score)
                    .map((b) => (
                        <div key={b.category} className="domain-sonar__row">
                            <span className="domain-sonar__row-label">{b.label}</span>
                            <span
                                className={
                                    'domain-sonar__row-score' +
                                    (b.score < 60 ? ' bad' : b.score < 80 ? ' mid' : ' good')
                                }
                            >
                                {b.score}
                            </span>
                            <span className="domain-sonar__row-count">
                                {b.issueCount} проблем
                            </span>
                        </div>
                    ))}
            </div>
        </div>
    );
}