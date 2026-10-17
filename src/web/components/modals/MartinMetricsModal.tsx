import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { MIcon } from '../common/MIcon';
import type { MartinMetrics } from '../../../shared/martin-types';
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpCard,
    HelpZones,
    HelpZone,
    HelpButton
} from '../common/ModalHelp';

type SortBy = 'distance' | 'instability' | 'abstractness' | 'ca' | 'ce';

export function MartinMetricsModal() {
    const store = useGraphStore();
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);

    const open = store.martinOpen;
    const [sortBy, setSortBy] = useState<SortBy>('distance');
    const [filterZone, setFilterZone] = useState<'' | 'pain' | 'uselessness' | 'main-sequence'>('');

    const report = index?.martin ?? null;

    const sorted = useMemo(() => {
        if (!report) return [];
        let arr = [...report.metrics];
        if (filterZone) arr = arr.filter((m) => m.zone === filterZone);
        arr.sort((a, b) => {
            if (sortBy === 'distance') return b.distance - a.distance;
            if (sortBy === 'instability') return b.instability - a.instability;
            if (sortBy === 'abstractness') return b.abstractness - a.abstractness;
            if (sortBy === 'ca') return b.ca - a.ca;
            if (sortBy === 'ce') return b.ce - a.ce;
            return 0;
        });
        return arr;
    }, [report, sortBy, filterZone]);

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => store.setMartinOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📐 Архитектурные метрики (Мартин)
                        {report && (
                            <span className="help-modal__badge">
                                {report.stats.totalDomains} доменов
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как это читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => store.setMartinOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && report && (
                    <div className="help-modal__body help-modal__body--flush">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это такое">
                                <HelpText>
                                    Это метрики Роберта Мартина из книги «Чистая архитектура». Они измеряют{' '}
                                    <strong>связность</strong> и <strong>абстракцию</strong> доменов.
                                    Простой идеал: <em>стабильные домены должны быть абстрактными,
                                        нестабильные — конкретными.</em> Метрики показывают, где этот баланс нарушен.
                                </HelpText>
                            </HelpSection>

                            <div className="modal-help__grid">
                                <HelpCard letter="Ca" title="Afferent coupling" formula="сколько доменов зависят от этого">
                                    Высокий Ca = <strong>на него многие смотрят</strong>. Менять рискованно —
                                    затронешь чужие сценарии.
                                </HelpCard>

                                <HelpCard letter="Ce" title="Efferent coupling" formula="от скольких доменов зависит этот">
                                    Высокий Ce = <strong>он сам зависит от многих</strong>. Изменения в соседях
                                    ломают его.
                                </HelpCard>

                                <HelpCard letter="I" title="Instability" formula="I = Ce / (Ca + Ce)">
                                    <strong>0</strong> — очень стабильный, менять нельзя без последствий.{' '}
                                    <strong>1</strong> — нестабильный, можно менять свободно.
                                </HelpCard>

                                <HelpCard letter="A" title="Abstractness" formula="A = сущности-родители / все сущности">
                                    Сущность «абстрактная», если от неё кто-то наследует.{' '}
                                    <strong>0</strong> — всё конкретное. <strong>1</strong> — всё абстрактное.
                                </HelpCard>

                                <HelpCard
                                    letter="D"
                                    title="Distance from the Main Sequence"
                                    formula="D = |A + I − 1|"
                                    wide
                                >
                                    Насколько домен ушёл от идеальной линии <code>A + I = 1</code>.{' '}
                                    <strong>0</strong> — идеал. <strong>1</strong> — максимально далёк.
                                </HelpCard>
                            </div>

                            <HelpSection title="Что такое зоны">
                                <HelpZones>
                                    <HelpZone color="green" title="✅ Главная последовательность">
                                        D &lt; 0.3. Домен на идеальной линии. Стабильные домены — абстрактные,
                                        нестабильные — конкретные. Всё правильно.
                                    </HelpZone>
                                    <HelpZone color="red" title="🔴 Зона боли">
                                        A &lt; 0.3 и I &lt; 0.3. Домен <strong>стабильный и конкретный</strong>:
                                        от него зависят многие, но у него нет абстракций, чтобы меняться безопасно.
                                        Любое изменение затрагивает всех потребителей.
                                    </HelpZone>
                                    <HelpZone color="orange" title="🟠 Бесполезные абстракции">
                                        A &gt; 0.7 и I &gt; 0.7. Домен <strong>абстрактный и нестабильный</strong>:
                                        много сущностей-родителей, но никто их не использует. Скорее всего —
                                        мёртвый код или недоделанный модуль.
                                    </HelpZone>
                                </HelpZones>
                            </HelpSection>

                            <HelpSection title="Как этим пользоваться">
                                <HelpList>
                                    <li>
                                        <strong>Зона боли — топ приоритет.</strong> Это домены, где любое изменение
                                        больно. Если их много — архитектура «застряла».
                                    </li>
                                    <li>
                                        <strong>Бесполезные абстракции — на удаление.</strong> Или подключить к делу,
                                        или выкинуть — они только путают.
                                    </li>
                                    <li>
                                        <strong>Не гоняйтесь за D = 0 у всех.</strong> Идеал недостижим, стремитесь
                                        чтобы «зона боли» была пустой.
                                    </li>
                                    <li>
                                        <strong>Сравните с Sonar:</strong> домен может иметь отличный Sonar (написан
                                        по правилам) и при этом быть в зоне боли (архитектурно проблемный). Это
                                        разные измерения.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>
                        {/* Сводка */}
                        <div className="martin-summary">
                            <div className="martin-summary__stats">
                                <div className="martin-stat">
                                    <span className="martin-stat__value">{report.averages.instability.toFixed(2)}</span>
                                    <span className="martin-stat__label">I средняя</span>
                                </div>
                                <div className="martin-stat">
                                    <span className="martin-stat__value">{report.averages.abstractness.toFixed(2)}</span>
                                    <span className="martin-stat__label">A средняя</span>
                                </div>
                                <div className="martin-stat">
                                    <span className="martin-stat__value">{report.averages.distance.toFixed(2)}</span>
                                    <span className="martin-stat__label">D средняя</span>
                                </div>
                            </div>

                            <div className="martin-zones">
                                <button
                                    className={'martin-zone martin-zone--main' + (filterZone === 'main-sequence' ? ' active' : '')}
                                    onClick={() => setFilterZone(filterZone === 'main-sequence' ? '' : 'main-sequence')}
                                >
                                    <span className="martin-zone__count">{report.stats.mainSequence.length}</span>
                                    <span className="martin-zone__label">На главной последовательности</span>
                                </button>
                                <button
                                    className={'martin-zone martin-zone--pain' + (filterZone === 'pain' ? ' active' : '')}
                                    onClick={() => setFilterZone(filterZone === 'pain' ? '' : 'pain')}
                                >
                                    <span className="martin-zone__count">{report.stats.painZone.length}</span>
                                    <span className="martin-zone__label">Зона боли (стабильные конкретные)</span>
                                </button>
                                <button
                                    className={'martin-zone martin-zone--useless' + (filterZone === 'uselessness' ? ' active' : '')}
                                    onClick={() => setFilterZone(filterZone === 'uselessness' ? '' : 'uselessness')}
                                >
                                    <span className="martin-zone__count">{report.stats.uselessnessZone.length}</span>
                                    <span className="martin-zone__label">Бесполезные абстракции</span>
                                </button>
                            </div>
                        </div>

                        {/* Scatter-plot */}
                        <div className="martin-scatter">
                            <div className="martin-scatter__title">Диаграмма «I × A»</div>
                            <svg viewBox="0 0 400 400" className="martin-scatter__svg">
                                {/* Оси */}
                                <line x1="40" y1="360" x2="380" y2="360" stroke="var(--border)" />
                                <line x1="40" y1="360" x2="40" y2="20" stroke="var(--border)" />
                                {/* Подписи */}
                                <text x="210" y="392" textAnchor="middle" fill="var(--text-500)" fontSize="11">
                                    Instability →
                                </text>
                                <text x="12" y="190" textAnchor="middle" fill="var(--text-500)" fontSize="11"
                                    transform="rotate(-90 12 190)">
                                    Abstractness →
                                </text>
                                {/* Метки осей */}
                                <text x="40" y="378" textAnchor="middle" fill="var(--text-500)" fontSize="9">0</text>
                                <text x="380" y="378" textAnchor="middle" fill="var(--text-500)" fontSize="9">1</text>
                                <text x="22" y="360" textAnchor="end" fill="var(--text-500)" fontSize="9">0</text>
                                <text x="22" y="24" textAnchor="end" fill="var(--text-500)" fontSize="9">1</text>

                                {/* Главная последовательность — диагональ A + I = 1 */}
                                <line
                                    x1="40" y1="20"
                                    x2="380" y2="360"
                                    stroke="var(--accent)"
                                    strokeWidth="1.5"
                                    strokeDasharray="5 5"
                                    opacity="0.5"
                                />

                                {/* Зона боли (левый нижний угол) */}
                                <rect x="40" y="240" width="120" height="120" fill="rgba(239,68,68,0.08)" />
                                <text x="100" y="300" textAnchor="middle" fill="var(--danger)" fontSize="10" opacity="0.6">
                                    Зона боли
                                </text>

                                {/* Зона бесполезности (правый верхний угол) */}
                                <rect x="260" y="20" width="120" height="120" fill="rgba(245,158,11,0.08)" />
                                <text x="320" y="80" textAnchor="middle" fill="var(--warning)" fontSize="10" opacity="0.6">
                                    Uselessness
                                </text>

                                {/* Точки */}
                                {report.metrics.map((m) => {
                                    const x = 40 + m.instability * 340;
                                    const y = 360 - m.abstractness * 340;
                                    const color =
                                        m.zone === 'pain' ? '#ef4444' :
                                            m.zone === 'uselessness' ? '#f59e0b' :
                                                m.zone === 'main-sequence' ? '#10b981' :
                                                    '#64748b';
                                    return (
                                        <circle
                                            key={m.domainId}
                                            cx={x}
                                            cy={y}
                                            r={5}
                                            fill={color}
                                            stroke="#fff"
                                            strokeWidth="1"
                                            opacity={m.distance > 0.5 ? 0.9 : 0.6}
                                        >
                                            <title>
                                                {m.domainId}{'\n'}
                                                I={m.instability.toFixed(2)} A={m.abstractness.toFixed(2)} D={m.distance.toFixed(2)}{'\n'}
                                                Ca={m.ca} Ce={m.ce}
                                            </title>
                                        </circle>
                                    );
                                })}
                            </svg>
                        </div>

                        {/* Таблица */}
                        <div className="martin-table-wrap">
                            <div className="martin-sort">
                                <span>Сортировка:</span>
                                {[
                                    { key: 'distance' as const, label: 'Distance' },
                                    { key: 'instability' as const, label: 'Instability' },
                                    { key: 'abstractness' as const, label: 'Abstractness' },
                                    { key: 'ca' as const, label: 'Ca' },
                                    { key: 'ce' as const, label: 'Ce' }
                                ].map((opt) => (
                                    <button
                                        key={opt.key}
                                        className={'martin-sort-btn' + (sortBy === opt.key ? ' active' : '')}
                                        onClick={() => setSortBy(opt.key)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <table className="martin-table">
                                <thead>
                                    <tr>
                                        <th>Домен</th>
                                        <th title="Afferent coupling — сколько зависят от него">Ca</th>
                                        <th title="Efferent coupling — от скольких зависит">Ce</th>
                                        <th title="Instability = Ce / (Ca + Ce)">I</th>
                                        <th title="Abstractness — доля абстрактных сущностей">A</th>
                                        <th title="Distance = |A + I - 1|">D</th>
                                        <th>Сущностей</th>
                                        <th>Зона</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.slice(0, 100).map((m) => (
                                        <tr key={m.domainId} className={'martin-row martin-row--' + m.zone}>
                                            <td>
                                                <div className="martin-row__domain">{m.domainId}</div>
                                                {m.domainName !== m.domainId && (
                                                    <div className="martin-row__name">{m.domainName}</div>
                                                )}
                                            </td>
                                            <td className="martin-row__num">{m.ca}</td>
                                            <td className="martin-row__num">{m.ce}</td>
                                            <td className="martin-row__num">{m.instability.toFixed(2)}</td>
                                            <td className="martin-row__num">{m.abstractness.toFixed(2)}</td>
                                            <td className={'martin-row__num martin-row__num--d'}>
                                                {m.distance.toFixed(2)}
                                            </td>
                                            <td className="martin-row__num">
                                                {m.entitiesAbstract}/{m.entitiesTotal}
                                            </td>
                                            <td>
                                                <span className={'martin-zone-tag martin-zone-tag--' + m.zone}>
                                                    {m.zone === 'pain' ? 'боль' :
                                                        m.zone === 'uselessness' ? 'бесполезность' :
                                                            m.zone === 'main-sequence' ? 'норма' : '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}