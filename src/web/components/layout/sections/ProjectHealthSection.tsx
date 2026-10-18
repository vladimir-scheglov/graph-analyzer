import React, { useMemo } from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useModelIndex } from '../../../hooks/useModelIndex';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';

type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
type Severity = 'ok' | 'warn' | 'bad';

function computeGrade(score: number): Grade {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'E';
}

interface HealthRow {
    id: string;
    icon: string;
    label: string;
    value: string;
    severity: Severity;
    onClick: () => void;
    title: string;
}

export function ProjectHealthSection() {
    const { index, loading, error } = useModelIndex();

    // Точечные actions store — не подписываемся на весь store
    const openLint = useMemo(
        () => () => useGraphStore.getState().setLintOpen(true),
        []
    );
    const openMartin = useMemo(
        () => () => useGraphStore.getState().setMartinOpen(true),
        []
    );
    const openPii = useMemo(
        () => () => useGraphStore.getState().setPiiOpen(true),
        []
    );
    const openValidation = useMemo(
        () => () => useGraphStore.getState().setModelValidationOpen(true),
        []
    );

    const data = useMemo(() => {
        if (!index) return null;

        const sonarScore = index.lint.sonar.overall.score;
        const sonarGrade = index.lint.sonar.overall.grade;
        const painCount = index.martin.stats.painZone.length;
        const piiCritical = index.pii.stats.bySeverity.critical;
        const cyclesCount = index.stats.circularInheritance.length;
        const brokenRefs = index.stats.unknownReferences.length;

        // Частные оценки (каждая 0..100)
        const martinPart = Math.max(0, 100 - painCount * 3);
        const piiPart = Math.max(0, 100 - piiCritical * 2);
        const structuralPart = Math.max(
            0,
            100 - cyclesCount * 10 - brokenRefs * 2
        );

        // Итоговая — взвешенная
        const overall = Math.round(
            sonarScore * 0.35 +
            martinPart * 0.2 +
            piiPart * 0.2 +
            structuralPart * 0.25
        );
        const overallGrade = computeGrade(overall);

        const sonarSeverity: Severity =
            sonarScore >= 80 ? 'ok' : sonarScore >= 60 ? 'warn' : 'bad';
        const painSeverity: Severity =
            painCount === 0 ? 'ok' : painCount <= 5 ? 'warn' : 'bad';
        const piiSeverity: Severity =
            piiCritical === 0 ? 'ok' : piiCritical <= 10 ? 'warn' : 'bad';
        const cyclesSeverity: Severity =
            cyclesCount === 0 ? 'ok' : cyclesCount <= 2 ? 'warn' : 'bad';
        const refsSeverity: Severity =
            brokenRefs === 0 ? 'ok' : brokenRefs <= 5 ? 'warn' : 'bad';

        return {
            sonarScore,
            sonarGrade,
            painCount,
            piiCritical,
            cyclesCount,
            brokenRefs,
            overall,
            overallGrade,
            sonarSeverity,
            painSeverity,
            piiSeverity,
            cyclesSeverity,
            refsSeverity,
        };
    }, [index]);

    if (loading || error || !data) return null;

    const rows: HealthRow[] = [
        {
            id: 'sonar',
            icon: 'science',
            label: 'Sonar',
            value: `${data.sonarScore} / 100`,
            severity: data.sonarSeverity,
            onClick: openLint,
            title: 'Оценка по линтеру схем (Sonar-оценка)',
        },
        {
            id: 'martin-pain',
            icon: 'favorite',
            label: 'Зона боли',
            value: data.painCount === 0 ? '—' : `${data.painCount} доменов`,
            severity: data.painSeverity,
            onClick: openMartin,
            title:
                'Домены в «зоне боли» по метрикам Мартина — стабильные и конкретные',
        },
        {
            id: 'pii-critical',
            icon: 'shield_lock',
            label: 'PII critical',
            value:
                data.piiCritical === 0
                    ? '—'
                    : `${data.piiCritical} полей`,
            severity: data.piiSeverity,
            onClick: openPii,
            title: 'Атрибуты со спецкатегориями PII (GDPR Art. 9 / 152-ФЗ)',
        },
        {
            id: 'cycles',
            icon: 'cycle',
            label: 'Циклы',
            value: data.cyclesCount === 0 ? '—' : String(data.cyclesCount),
            severity: data.cyclesSeverity,
            onClick: openValidation,
            title: 'Циклы в наследовании сущностей',
        },
        {
            id: 'broken-refs',
            icon: 'link_off',
            label: 'Битые ссылки',
            value: data.brokenRefs === 0 ? '—' : String(data.brokenRefs),
            severity: data.refsSeverity,
            onClick: openValidation,
            title: 'Ссылки на несуществующие сущности',
        },
    ];

    const gradeClass = data.overallGrade.toLowerCase();

    return (
        <Section
            id="project-health"
            title="Здоровье модели"
            icon="monitor_heart"
        >
            <div className="project-health">
                <div
                    className="project-health__overall"
                    title="Sonar×35% + Martin×20% + PII×20% + Структурные×25%"
                >
                    <div className="project-health__overall-head">
                        <div
                            className={`project-health__score project-health__score--${gradeClass}`}
                        >
                            {data.overall}
                        </div>
                        <div className="project-health__grade">
                            <span
                                className={`project-health__grade-badge project-health__grade-badge--${gradeClass}`}
                            >
                                {data.overallGrade}
                            </span>
                            <span className="project-health__grade-label">
                                из 100
                            </span>
                        </div>
                    </div>
                    <div className="project-health__bar">
                        <div
                            className={`project-health__bar-fill project-health__bar-fill--${gradeClass}`}
                            style={{ width: `${data.overall}%` }}
                        />
                    </div>
                </div>

                <div className="project-health__rows">
                    {rows.map((row) => (
                        <button
                            key={row.id}
                            className={`project-health__row project-health__row--${row.severity}`}
                            onClick={row.onClick}
                            title={row.title}
                        >
                            <MIcon name={row.icon} size="sm" />
                            <span className="project-health__row-label">
                                {row.label}
                            </span>
                            <span className="project-health__row-value">
                                {row.value}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </Section>
    );
}