import React, { useState } from 'react';
import { MIcon } from '../common/MIcon';

const COLLAPSE_KEY = 'dg-graph-legend-collapsed';

function readCollapsed(): boolean {
    try {
        return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
        return false;
    }
}

export function GraphLegend() {
    const [collapsed, setCollapsed] = useState(readCollapsed);

    const toggle = (v: boolean) => {
        setCollapsed(v);
        try {
            localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
        } catch {
            /* ignore */
        }
    };

    if (collapsed) {
        return (
            <button
                type="button"
                className="graph-legend-toggle"
                onClick={() => toggle(false)}
                title="Показать легенду"
            >
                <MIcon name="legend_toggle" size="sm" />
                <span>Легенда</span>
            </button>
        );
    }

    return (
        <div className="graph-legend">
            <div className="graph-legend__head">
                <span className="graph-legend__title">Легенда</span>
                <button
                    type="button"
                    className="graph-legend__collapse"
                    onClick={() => toggle(true)}
                    title="Скрыть (запоминается)"
                >
                    <MIcon name="close" size="sm" />
                </button>
            </div>

            <div className="graph-legend__section">
                <div className="graph-legend__section-title">Узлы</div>
                <div className="graph-legend__row">
                    <span className="graph-legend__dot" style={{ background: 'var(--success)' }} />
                    <span>Домен</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__dot" style={{ background: 'var(--warning)' }} />
                    <span>Отсутствующий</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__dot" style={{ background: 'var(--danger)' }} />
                    <span>Битый</span>
                </div>
            </div>

            <div className="graph-legend__section">
                <div className="graph-legend__section-title">Связи</div>
                <div className="graph-legend__row">
                    <span className="graph-legend__line" style={{ background: '#6366a1' }} />
                    <span>Linkage</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__line" style={{ background: '#4b7c6c' }} />
                    <span>FQID-ссылка</span>
                </div>
            </div>

            <div className="graph-legend__section">
                <div className="graph-legend__section-title">Бейджи</div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--count">25</span>
                    <span>Сущностей</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--health-good">87</span>
                    <span>Health score</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--health-mid">65</span>
                    <span>Требует внимания</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--health-bad">32</span>
                    <span>Плохое состояние</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--warn">⚠3</span>
                    <span>Проблемы валидации</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__badge graph-legend__badge--topo">L2</span>
                    <span>Уровень установки</span>
                </div>
            </div>

            <div className="graph-legend__section">
                <div className="graph-legend__section-title">Мета</div>
                <div className="graph-legend__row">
                    <span className="graph-legend__meta-chip">v2.0</span>
                    <span>Версия</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__meta-chip graph-legend__meta-chip--draft">✎</span>
                    <span>Черновик</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__meta-chip graph-legend__meta-chip--off">OFF</span>
                    <span>Выключен</span>
                </div>
                <div className="graph-legend__row">
                    <span className="graph-legend__meta-chip">🕒 3d</span>
                    <span>Давность правки</span>
                </div>
            </div>
        </div>
    );
}