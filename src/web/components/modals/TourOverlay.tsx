import React, { useEffect, useMemo } from 'react';
import { useGraphStore } from '../../state/useGraphStore';

export function TourOverlay() {
    const store = useGraphStore();
    const tour = store.tour;

    const allItems = useMemo(() => {
        if (!tour) return [];
        const items: any[] = [];
        tour.stages.forEach((stage: any) => {
            stage.domains.forEach((d: any) => {
                items.push({
                    domainId: d.domainId,
                    nodeId: d.id,
                    stageNumber: stage.index + 1,
                    domainData: d
                });
            });
        });
        return items;
    }, [tour]);

    // Камера на текущий узел
    useEffect(() => {
        if (!tour) return;
        const current = allItems[tour.index];
        if (!current || !store.rfInstance) return;

        const node = store.nodes.find((n) => n.id === current.nodeId);
        if (!node) return;

        const NODE_WIDTH = 300;
        const NODE_HEIGHT = 88;
        const NODE_COMPACT = 42;
        const w = store.compact ? NODE_COMPACT : NODE_WIDTH;
        const h = store.compact ? NODE_COMPACT : NODE_HEIGHT;
        const cx = node.position.x + w / 2;
        const cy = node.position.y + h / 2;
        store.rfInstance.setCenter(cx, cy, { zoom: 1.5, duration: 700 });
        store.setSelectedNodeId(current.nodeId);
    }, [tour, tour?.index, allItems, store]);

    // Autoplay
    useEffect(() => {
        if (!tour || !tour.playing) return;
        if (tour.index >= allItems.length - 1) {
            store.setTour((prev) => (prev ? { ...prev, playing: false } : null));
            return;
        }
        const t = setTimeout(() => {
            store.setTour((prev) =>
                prev ? { ...prev, index: prev.index + 1, playing: false } : null
            );
        }, 2500);
        return () => clearTimeout(t);
    }, [tour, tour?.playing, tour?.index, allItems.length, store]);

    if (!tour) return null;
    const current = allItems[tour.index];
    if (!current) return null;

    const d = current.domainData;
    const pct = Math.round(((tour.index + 1) / allItems.length) * 100);

    const next = () =>
        store.setTour((prev) =>
            prev && prev.index < allItems.length - 1
                ? { ...prev, index: prev.index + 1, playing: false }
                : prev
        );
    const prev = () =>
        store.setTour((p) => (p && p.index > 0 ? { ...p, index: p.index - 1, playing: false } : p));
    const togglePlay = () =>
        store.setTour((p) => (p ? { ...p, playing: !p.playing } : null));
    const stop = () => store.setTour(null);

    return (
        <div className="tour-overlay">
            <div className="tour-overlay__card">
                <div className="tour-overlay__header">
                    <span className="tour-overlay__stage-badge">Этап {current.stageNumber}</span>
                    <span className="tour-overlay__counter">
                        {tour.index + 1} / {allItems.length}
                    </span>
                    <button className="tour-overlay__close" onClick={stop} title="Завершить">
                        ✕
                    </button>
                </div>

                <div className="tour-overlay__title">{current.domainId}</div>
                {d.label && d.label !== current.domainId && (
                    <div className="tour-overlay__subtitle">{d.label}</div>
                )}
                {d.description && <div className="tour-overlay__desc">{d.description}</div>}

                <div className="tour-overlay__stats">
                    {d.fanIn > 0 && <span className="tour-stat">↑ {d.fanIn} входящих</span>}
                    {d.fanOut > 0 && <span className="tour-stat">↓ {d.fanOut} исходящих</span>}
                    {d.entitiesCount != null && (
                        <span className="tour-stat">{d.entitiesCount} entities</span>
                    )}
                </div>

                {d.tags && d.tags.length > 0 && (
                    <div className="tour-overlay__tags">
                        {d.tags.slice(0, 6).map((t: string, i: number) => (
                            <span key={i} className="tag" style={{ fontSize: 10 }}>
                                {t}
                            </span>
                        ))}
                    </div>
                )}

                <div className="tour-overlay__progress">
                    <div className="tour-overlay__progress-bar">
                        <div className="tour-overlay__progress-fill" style={{ width: pct + '%' }} />
                    </div>
                </div>

                <div className="tour-overlay__controls">
                    <button
                        className="tour-btn"
                        onClick={prev}
                        disabled={tour.index === 0}
                        title="Назад"
                    >
                        ◀
                    </button>
                    <button
                        className="tour-btn tour-btn--primary"
                        onClick={togglePlay}
                        title={tour.playing ? 'Пауза' : 'Играть'}
                    >
                        {tour.playing ? '❚❚' : '▶'}
                    </button>
                    <button
                        className="tour-btn"
                        onClick={next}
                        disabled={tour.index >= allItems.length - 1}
                        title="Дальше"
                    >
                        ▶
                    </button>
                </div>
            </div>
        </div>
    );
}