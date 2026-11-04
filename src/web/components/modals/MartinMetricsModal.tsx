import React, { useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import type { MartinMetrics } from "../../../shared/martin-types";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpCard,
    HelpZones,
    HelpZone,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { alertDialog } from "../../lib/dialogs";

// ============ Константы ============

type ZoneKey = "pain" | "uselessness" | "main-sequence" | "unclassified";

const ZONE_LABEL: Record<ZoneKey, string> = {
    "main-sequence": "Норма",
    pain: "Зона боли",
    uselessness: "Бесполезные",
    unclassified: "Не классифицировано",
};

const ZONE_SHORT: Record<ZoneKey, string> = {
    "main-sequence": "норма",
    pain: "боль",
    uselessness: "бесполез.",
    unclassified: "—",
};

const ZONE_COLOR: Record<ZoneKey, string> = {
    "main-sequence": "#10b981",
    pain: "#ef4444",
    uselessness: "#f59e0b",
    unclassified: "#64748b",
};

const ZONE_DESCRIPTION: Record<ZoneKey, string> = {
    "main-sequence":
        "Баланс соблюдён: стабильные абстрактны, нестабильные конкретны. Идеальное состояние.",
    pain:
        "Стабильный и конкретный. От него зависят многие, но у него нет абстракций, чтобы меняться безопасно. Любая правка бьёт по потребителям.",
    uselessness:
        "Абстрактный и нестабильный. Много сущностей-родителей, но никто от него не зависит. Мёртвый код или недоделанный модуль.",
    unclassified:
        "Не попадает ни в одну из трёх зон. Обычно — изолированный домен без зависимостей или без наследования.",
};

const ZONE_RECOMMENDATION: Record<ZoneKey, string> = {
    "main-sequence": "Ничего делать не нужно — это идеал.",
    pain:
        "1) Вынести общие атрибуты в родительские сущности (увеличить A). 2) Уменьшить входящие зависимости — инкапсулировать API. 3) Разделить домен, если он держит слишком много сценариев.",
    uselessness:
        "1) Удалить неиспользуемые абстрактные сущности. 2) Подключить домен к другим — сделать его полезным. 3) Объединить с целевым доменом, если он «недоделанный».",
    unclassified:
        "Проверьте: домен изолирован? Нет наследников? Нет зависимостей? Если да — это норма для утилитарных доменов. Если нет — проверьте корректность inherits и Reference.",
};

type SortBy = "distance" | "instability" | "abstractness" | "ca" | "ce" | "name";
type ViewTab = "table" | "scatter";
type GroupMode = "flat" | "zone";

// ============ Icons & badges ============

function zoneIcon(zone: ZoneKey): string {
    if (zone === "pain") return "favorite";
    if (zone === "uselessness") return "auto_awesome";
    if (zone === "main-sequence") return "check_circle";
    return "help";
}

// ============ Scatter plot ============

interface ScatterProps {
    metrics: MartinMetrics[];
    selectedId: string | null;
    onSelect: (domainId: string) => void;
    onFilterZone: (zone: ZoneKey) => void;
}

const SVG = 420;
const PAD = 40;
const PLOT = SVG - PAD * 2;

function ScatterPlot({
    metrics,
    selectedId,
    onSelect,
    onFilterZone,
}: ScatterProps) {
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [hoveredZone, setHoveredZone] = useState<ZoneKey | null>(null);

    // Счётчики по зонам — для бейджей
    const zoneCounts = useMemo(() => {
        const c: Record<ZoneKey, number> = {
            pain: 0,
            uselessness: 0,
            "main-sequence": 0,
            unclassified: 0,
        };
        metrics.forEach((m) => {
            const z = m.zone as ZoneKey;
            if (z in c) c[z]++;
        });
        return c;
    }, [metrics]);

    const getPoint = (m: MartinMetrics) => ({
        x: PAD + m.instability * PLOT,
        y: SVG - PAD - m.abstractness * PLOT,
    });

    // ── Общий рендер зоны ──
    const renderZone = (
        zone: ZoneKey,
        x: number,
        y: number,
        w: number,
        h: number,
        badgeCorner: "tl" | "tr" | "bl" | "br",
    ) => {
        const count = zoneCounts[zone];
        if (count === 0) return null;

        const color = ZONE_COLOR[zone];
        const isHovered = hoveredZone === zone;

        // Размер бейджа
        const label = `${count} · ${ZONE_SHORT[zone]}`;
        const badgeW = label.length * 6 + 16;
        const badgeH = 18;

        // Позиция бейджа — в свободном углу зоны
        let bx = x + 6;
        let by = y + 6;
        if (badgeCorner === "tr") {
            bx = x + w - badgeW - 6;
            by = y + 6;
        } else if (badgeCorner === "bl") {
            bx = x + 6;
            by = y + h - badgeH - 6;
        } else if (badgeCorner === "br") {
            bx = x + w - badgeW - 6;
            by = y + h - badgeH - 6;
        }

        return (
            <g
                onMouseEnter={() => setHoveredZone(zone)}
                onMouseLeave={() => setHoveredZone(null)}
                onClick={() => onFilterZone(zone)}
                style={{ cursor: "pointer" }}
            >
                <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={color}
                    fillOpacity={isHovered ? 0.16 : 0.07}
                    style={{ transition: "fill-opacity 0.15s" }}
                />
                <g pointerEvents="none">
                    <rect
                        x={bx}
                        y={by}
                        width={badgeW}
                        height={badgeH}
                        rx={badgeH / 2}
                        fill={color}
                        fillOpacity={isHovered ? 0.95 : 0.72}
                        style={{ transition: "fill-opacity 0.15s" }}
                    />
                    <text
                        x={bx + badgeW / 2}
                        y={by + badgeH / 2 + 3.5}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="JetBrains Mono, monospace"
                    >
                        {label}
                    </text>
                </g>
            </g>
        );
    };

    return (
        <div className="martin-scatter-container">
            <div className="martin-scatter__title">
                <MIcon name="info" size="sm" />
                Наведите на точку — детали. Клик по зоне — фильтр в таблицу
            </div>
            <svg viewBox={`0 0 ${SVG} ${SVG}`} className="martin-scatter__svg">
                {/* ── Оси ── */}
                <line
                    x1={PAD}
                    y1={SVG - PAD}
                    x2={SVG - PAD}
                    y2={SVG - PAD}
                    stroke="var(--border)"
                />
                <line
                    x1={PAD}
                    y1={SVG - PAD}
                    x2={PAD}
                    y2={PAD}
                    stroke="var(--border)"
                />

                {/* ── Диагональ A + I = 1 ── */}
                <line
                    x1={PAD}
                    y1={PAD}
                    x2={SVG - PAD}
                    y2={SVG - PAD}
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                    opacity="0.5"
                />

                {/* ── Зоны (кликабельные) ── */}
                {/* Pain: левый нижний угол */}
                {renderZone(
                    "pain",
                    PAD,
                    SVG - PAD - 0.3 * PLOT,
                    0.3 * PLOT,
                    0.3 * PLOT,
                    "tr",
                )}
                {/* Uselessness: правый верхний угол */}
                {renderZone(
                    "uselessness",
                    PAD + 0.7 * PLOT,
                    PAD,
                    0.3 * PLOT,
                    0.3 * PLOT,
                    "bl",
                )}

                {/* ── Подписи осей ── */}
                <text
                    x={SVG / 2}
                    y={SVG - 8}
                    textAnchor="middle"
                    fill="var(--text-500)"
                    fontSize="11"
                >
                    Instability →
                </text>
                <text
                    x={14}
                    y={SVG / 2}
                    textAnchor="middle"
                    fill="var(--text-500)"
                    fontSize="11"
                    transform={`rotate(-90 14 ${SVG / 2})`}
                >
                    Abstractness →
                </text>

                {/* Значения осей */}
                <text x={PAD} y={SVG - PAD + 16} textAnchor="middle" fill="var(--text-500)" fontSize="9">
                    0
                </text>
                <text x={SVG - PAD} y={SVG - PAD + 16} textAnchor="middle" fill="var(--text-500)" fontSize="9">
                    1
                </text>
                <text x={PAD - 8} y={SVG - PAD} textAnchor="end" fill="var(--text-500)" fontSize="9">
                    0
                </text>
                <text x={PAD - 8} y={PAD + 4} textAnchor="end" fill="var(--text-500)" fontSize="9">
                    1
                </text>

                {/* ── Точки ── */}
                {metrics.map((m) => {
                    const { x, y } = getPoint(m);
                    const zone = m.zone as ZoneKey;
                    const color = ZONE_COLOR[zone];
                    const isHovered = hoveredId === m.domainId;
                    const isSelected = selectedId === m.domainId;
                    const isDimmed = hoveredZone !== null && hoveredZone !== zone;
                    const isShowLabel = isHovered || isSelected;

                    const dotR = isSelected ? 6 : isHovered ? 5 : 4;
                    const opacity = isDimmed ? 0.25 : m.distance > 0.5 ? 1 : 0.85;

                    // Подпись только для hover/selected — с флипом к краю
                    const labelText = m.domainId;
                    const labelW = labelText.length * 6.5 + 12;
                    const labelH = 18;
                    let lx = x + 8;
                    if (lx + labelW > SVG - 4) lx = x - 8 - labelW;
                    const ly = Math.max(4, y - labelH - 4);

                    return (
                        <g key={m.domainId}>
                            {/* halo при hover/selected */}
                            {(isHovered || isSelected) && (
                                <circle cx={x} cy={y} r={dotR + 4} fill={color} opacity={0.2} />
                            )}

                            <circle
                                cx={x}
                                cy={y}
                                r={dotR}
                                fill={color}
                                stroke={isSelected ? "#fff" : "transparent"}
                                strokeWidth={isSelected ? 2 : 0}
                                opacity={opacity}
                                style={{
                                    cursor: "pointer",
                                    transition: "r 0.1s, opacity 0.15s",
                                }}
                                onMouseEnter={() => setHoveredId(m.domainId)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelect(m.domainId);
                                }}
                            >
                                <title>
                                    {m.domainId}
                                    {"\n"}
                                    I={m.instability.toFixed(2)} A={m.abstractness.toFixed(2)} D=
                                    {m.distance.toFixed(2)}
                                    {"\n"}
                                    Ca={m.ca} Ce={m.ce}
                                    {"\n"}
                                    {ZONE_LABEL[zone]}
                                </title>
                            </circle>

                            {/* Подпись только при hover/selected */}
                            {isShowLabel && (
                                <g pointerEvents="none" style={{ userSelect: "none" }}>
                                    <rect
                                        x={lx}
                                        y={ly}
                                        width={labelW}
                                        height={labelH}
                                        rx={4}
                                        fill="var(--bg-900, #0a0e1a)"
                                        opacity={0.95}
                                    />
                                    <text
                                        x={lx + 6}
                                        y={ly + 13}
                                        fill="var(--text-100, #e2e8f0)"
                                        fontSize="10"
                                        fontFamily="JetBrains Mono, monospace"
                                    >
                                        {labelText}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>

            <div className="martin-scatter__legend">
                {(
                    ["pain", "uselessness", "main-sequence", "unclassified"] as ZoneKey[]
                ).map((z) => (
                    <button
                        key={z}
                        type="button"
                        className={
                            "martin-scatter__legend-item" +
                            (hoveredZone === z ? " martin-scatter__legend-item--active" : "")
                        }
                        onMouseEnter={() => setHoveredZone(z)}
                        onMouseLeave={() => setHoveredZone(null)}
                        onClick={() => onFilterZone(z)}
                        title={`${ZONE_DESCRIPTION[z]}\n\nКлик — фильтр по зоне`}
                    >
                        <span
                            className="martin-scatter__legend-dot"
                            style={{ background: ZONE_COLOR[z] }}
                        />
                        {ZONE_LABEL[z]}
                        {zoneCounts[z] > 0 && (
                            <span className="martin-scatter__legend-count">
                                {zoneCounts[z]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ============ Detail drawer ============

interface DetailProps {
    metric: MartinMetrics;
    onClose: () => void;
    onOpenSchema: (domainId: string) => void;
    onGoToDomain: (domainId: string) => void;
}

function MartinDetail({
    metric: m,
    onClose,
    onOpenSchema,
    onGoToDomain,
}: DetailProps) {
    const zone = m.zone as ZoneKey;
    const zoneColor = ZONE_COLOR[zone];

    return (
        <div className="martin-detail">
            <div className="martin-detail__head">
                <MIcon name={zoneIcon(zone)} size="sm" style={{ color: zoneColor }} />
                <code className="martin-detail__id">{m.domainId}</code>
                <span
                    className="martin-detail__zone-badge"
                    style={{ background: zoneColor + "22", color: zoneColor }}
                >
                    {ZONE_LABEL[zone]}
                </span>
                <button
                    className="martin-detail__close"
                    onClick={onClose}
                    title="Закрыть"
                >
                    ✕
                </button>
            </div>

            {m.domainName && m.domainName !== m.domainId && (
                <div className="martin-detail__name">{m.domainName}</div>
            )}

            <div className="martin-detail__metrics">
                <div className="martin-detail__metric">
                    <div className="martin-detail__metric-label">Instability</div>
                    <div className="martin-detail__metric-value">
                        {m.instability.toFixed(2)}
                    </div>
                    <div className="martin-detail__metric-hint">
                        {m.ca + m.ce === 0
                            ? "нет связей"
                            : `${m.ce} / (${m.ca} + ${m.ce})`}
                    </div>
                </div>
                <div className="martin-detail__metric">
                    <div className="martin-detail__metric-label">Abstractness</div>
                    <div className="martin-detail__metric-value">
                        {m.abstractness.toFixed(2)}
                    </div>
                    <div className="martin-detail__metric-hint">
                        {m.entitiesAbstract} / {m.entitiesTotal} сущностей абстрактны
                    </div>
                </div>
                <div className="martin-detail__metric">
                    <div className="martin-detail__metric-label">Distance</div>
                    <div
                        className="martin-detail__metric-value"
                        style={{ color: zoneColor }}
                    >
                        {m.distance.toFixed(2)}
                    </div>
                    <div className="martin-detail__metric-hint">|A + I − 1|</div>
                </div>
            </div>

            <div className="martin-detail__description">
                <div className="martin-detail__description-title">Что это значит</div>
                <div>{ZONE_DESCRIPTION[zone]}</div>
            </div>

            <div className="martin-detail__recommendation">
                <div className="martin-detail__recommendation-title">
                    <MIcon name="lightbulb" size="sm" />
                    Что делать
                </div>
                <div>{ZONE_RECOMMENDATION[zone]}</div>
            </div>

            {m.afferentDomains.length > 0 && (
                <div className="martin-detail__section">
                    <div className="martin-detail__section-title">
                        Afferent (Ca={m.ca}) — кто зависит от него
                    </div>
                    <div className="martin-detail__chips">
                        {m.afferentDomains.map((d) => (
                            <button
                                key={d}
                                className="martin-detail__chip"
                                onClick={() => onGoToDomain(d)}
                                title={`Открыть ${d}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {m.efferentDomains.length > 0 && (
                <div className="martin-detail__section">
                    <div className="martin-detail__section-title">
                        Efferent (Ce={m.ce}) — от кого зависит
                    </div>
                    <div className="martin-detail__chips">
                        {m.efferentDomains.map((d) => (
                            <button
                                key={d}
                                className="martin-detail__chip martin-detail__chip--efferent"
                                onClick={() => onGoToDomain(d)}
                                title={`Открыть ${d}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="martin-detail__actions">
                <button
                    className="btn btn--primary"
                    onClick={() => onOpenSchema(m.domainId)}
                >
                    <MIcon name="menu_book" size="sm" />
                    Схема домена
                </button>
                <button
                    className="btn"
                    onClick={() => onGoToDomain(m.domainId)}
                >
                    <MIcon name="my_location" size="sm" />
                    На графе
                </button>
            </div>
        </div>
    );
}

// ============ Main ============

export function MartinMetricsModal() {
    const { index, loading, error } = useModelIndex();
    const open = useGraphStore((s) => s.martinOpen);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    const [sortBy, setSortBy] = useState<SortBy>("distance");
    const [filterZone, setFilterZone] = useState<ZoneKey | "">("");
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<ViewTab>("table");
    const [groupMode, setGroupMode] = useState<GroupMode>("flat");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const report = index?.martin ?? null;

    const zoneCounts = useMemo(() => {
        const c: Record<ZoneKey, number> = {
            pain: 0,
            uselessness: 0,
            "main-sequence": 0,
            unclassified: 0,
        };
        report?.metrics.forEach((m) => {
            const z = m.zone as ZoneKey;
            if (z in c) c[z]++;
        });
        return c;
    }, [report]);

    const sorted = useMemo(() => {
        if (!report) return [];
        let arr = [...report.metrics];
        if (filterZone) arr = arr.filter((m) => m.zone === filterZone);
        const q = query.trim().toLowerCase();
        if (q) {
            arr = arr.filter(
                (m) =>
                    m.domainId.toLowerCase().includes(q) ||
                    m.domainName.toLowerCase().includes(q),
            );
        }
        arr.sort((a, b) => {
            if (sortBy === "distance") return b.distance - a.distance;
            if (sortBy === "instability") return b.instability - a.instability;
            if (sortBy === "abstractness") return b.abstractness - a.abstractness;
            if (sortBy === "ca") return b.ca - a.ca;
            if (sortBy === "ce") return b.ce - a.ce;
            if (sortBy === "name")
                return a.domainId.localeCompare(b.domainId);
            return 0;
        });
        return arr;
    }, [report, sortBy, filterZone, query]);

    const groupedByZone = useMemo(() => {
        if (groupMode !== "zone") return null;
        const groups: Record<ZoneKey, MartinMetrics[]> = {
            pain: [],
            uselessness: [],
            "main-sequence": [],
            unclassified: [],
        };
        sorted.forEach((m) => {
            const z = m.zone as ZoneKey;
            if (z in groups) groups[z].push(m);
        });
        // Порядок: pain → uselessness → main-sequence → unclassified
        const order: ZoneKey[] = [
            "pain",
            "uselessness",
            "main-sequence",
            "unclassified",
        ];
        return order
            .filter((z) => groups[z].length > 0)
            .map((z) => ({
                zone: z,
                label: ZONE_LABEL[z],
                color: ZONE_COLOR[z],
                metrics: groups[z],
            }));
    }, [sorted, groupMode]);

    const selected = useMemo(() => {
        if (!selectedId || !report) return null;
        return report.metrics.find((m) => m.domainId === selectedId) || null;
    }, [selectedId, report]);

    const handleSelectDomain = useCallback((domainId: string) => {
        setSelectedId(domainId);
    }, []);

    const openSchema = useCallback((domainId: string) => {
        const st = useGraphStore.getState();
        st.setMartinOpen(false);
        st.setDomainSchemaDomainId(domainId);
        st.setDomainSchemaOpen(true);
    }, []);

    const gotoDomain = useCallback((domainId: string) => {
        const st = useGraphStore.getState();
        st.setMartinOpen(false);
        st.setViewMode("graph");
        setTimeout(() => {
            // goto находится в useNavigation, используем store
            const nav = st.nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() === domainId.toLowerCase(),
            );
            if (nav) {
                st.setSelectedNodeId(nav.id);
                st.setFocusNode(nav.id);
                st.pushNav(domainId);
            }
        }, 200);
    }, []);

    // ── Экспорт ──
    const exportMarkdown = async () => {
        if (!report) return;
        const lines: string[] = [];
        lines.push("# Архитектурные метрики (Martin)");
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");
        lines.push("## Сводка");
        lines.push("");
        lines.push("| Метрика | Значение |");
        lines.push("| --- | ---: |");
        lines.push(`| Доменов | ${report.stats.totalDomains} |`);
        lines.push(`| I средняя | ${report.averages.instability.toFixed(2)} |`);
        lines.push(`| A средняя | ${report.averages.abstractness.toFixed(2)} |`);
        lines.push(`| D средняя | ${report.averages.distance.toFixed(2)} |`);
        lines.push(`| Зона боли | ${zoneCounts.pain} |`);
        lines.push(`| Бесполезные абстракции | ${zoneCounts.uselessness} |`);
        lines.push(`| На главной последовательности | ${zoneCounts["main-sequence"]} |`);
        lines.push(`| Не классифицировано | ${zoneCounts.unclassified} |`);
        lines.push("");

        const sortedAll = [...report.metrics].sort(
            (a, b) => b.distance - a.distance,
        );

        (["pain", "uselessness", "main-sequence", "unclassified"] as ZoneKey[]).forEach(
            (zone) => {
                const items = sortedAll.filter((m) => m.zone === zone);
                if (items.length === 0) return;
                const icon =
                    zone === "pain" ? "🔴" : zone === "uselessness" ? "🟠" : "✅";
                lines.push(`## ${icon} ${ZONE_LABEL[zone]} (${items.length})`);
                lines.push("");
                if (zone === "pain" || zone === "uselessness") {
                    lines.push(`> ${ZONE_DESCRIPTION[zone]}`);
                    lines.push("");
                    lines.push(`**Что делать:** ${ZONE_RECOMMENDATION[zone]}`);
                    lines.push("");
                }
                lines.push("| Домен | I | A | D | Ca | Ce |");
                lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
                items.forEach((m) => {
                    lines.push(
                        `| \`${m.domainId}\` | ${m.instability.toFixed(2)} | ${m.abstractness.toFixed(2)} | ${m.distance.toFixed(2)} | ${m.ca} | ${m.ce} |`,
                    );
                });
                lines.push("");
            },
        );

        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore
                .getState()
                .showSnackbar("Отчёт скопирован в буфер");
        } catch (e: any) {
            await alertDialog("Не удалось скопировать", { detail: e.message });
        }
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setMartinOpen(false)}
        >
            <div
                className="help-modal martin-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="scatter_plot" size="sm" />
                        <span className="icon-label">Архитектурные метрики (Мартин)</span>
                        {report && (
                            <span className="help-modal__badge">
                                {report.stats.totalDomains} доменов
                            </span>
                        )}
                        {report && zoneCounts.pain > 0 && (
                            <span className="help-modal__badge help-modal__badge--warn">
                                ⚠ {zoneCounts.pain} в зоне боли
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__icon-btn"
                            onClick={exportMarkdown}
                            disabled={!report}
                            title="Скопировать отчёт в Markdown"
                        >
                            <MIcon name="content_copy" />
                        </button>
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setMartinOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса…</div>
                    </div>
                )}

                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && report && (
                    <div className="martin-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Метрики Роберта Мартина из книги «Чистая архитектура». Измеряют{" "}
                                    <strong>связность</strong> и <strong>абстракцию</strong> доменов.
                                    Идеал: <em>стабильные домены абстрактны, нестабильные —
                                        конкретны</em>. Метрики показывают, где этот баланс нарушен.
                                </HelpText>
                            </HelpSection>

                            <div className="modal-help__grid">
                                <HelpCard letter="Ca" title="Afferent coupling" formula="сколько доменов зависят от этого">
                                    Высокий Ca = <strong>на него многие смотрят</strong>. Менять
                                    рискованно — затронешь чужие сценарии.
                                </HelpCard>

                                <HelpCard letter="Ce" title="Efferent coupling" formula="от скольких доменов зависит этот">
                                    Высокий Ce = <strong>он сам зависит от многих</strong>. Изменения
                                    в соседях ломают его.
                                </HelpCard>

                                <HelpCard letter="I" title="Instability" formula="I = Ce / (Ca + Ce)">
                                    <strong>0</strong> — стабильный, менять нельзя без последствий.{" "}
                                    <strong>1</strong> — нестабильный, можно менять свободно.
                                </HelpCard>

                                <HelpCard letter="A" title="Abstractness" formula="A = сущности-родители / все сущности">
                                    Сущность «абстрактная», если от неё кто-то наследует.{" "}
                                    <strong>0</strong> — всё конкретное. <strong>1</strong> — всё
                                    абстрактное.
                                </HelpCard>

                                <HelpCard
                                    letter="D"
                                    title="Distance from the Main Sequence"
                                    formula="D = |A + I − 1|"
                                    wide
                                >
                                    Насколько домен ушёл от идеальной линии <code>A + I = 1</code>.{" "}
                                    <strong>0</strong> — идеал. <strong>1</strong> — максимально
                                    далёк.
                                </HelpCard>
                            </div>

                            <HelpSection title="Что такое зоны">
                                <HelpZones>
                                    <HelpZone color="green" title="✅ Главная последовательность">
                                        D &lt; 0.3. Баланс соблюдён. Стабильные домены — абстрактные,
                                        нестабильные — конкретные. Всё правильно.
                                    </HelpZone>
                                    <HelpZone color="red" title="🔴 Зона боли">
                                        A &lt; 0.3 и I &lt; 0.3. Стабильный и конкретный: от него
                                        зависят многие, но нет абстракций, чтобы меняться безопасно.
                                        Любая правка бьёт по потребителям.
                                    </HelpZone>
                                    <HelpZone color="orange" title="🟠 Бесполезные абстракции">
                                        A &gt; 0.7 и I &gt; 0.7. Абстрактный и нестабильный: много
                                        сущностей-родителей, но никто их не использует. Мёртвый код
                                        или недоделанный модуль.
                                    </HelpZone>
                                    <HelpZone color="green" title="⚪ Не классифицировано">
                                        Не попадает ни в одну из трёх зон. Обычно — изолированный
                                        домен без зависимостей (I=0, A=0, D=1). Проверьте: это
                                        утилитарный домен или забытая фича?
                                    </HelpZone>
                                </HelpZones>
                            </HelpSection>

                            <HelpSection title="Что делать в каждой зоне">
                                <HelpText>
                                    <strong>Зона боли</strong> — топ-приоритет. Это домены, где
                                    любое изменение больно.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Вынести абстракции</strong> — общие атрибуты
                                        в родительские сущности, чтобы менять только «верх» стека.
                                    </li>
                                    <li>
                                        <strong>Уменьшить входящие</strong> — инкапсулировать API,
                                        убрать лишние зависимости.
                                    </li>
                                    <li>
                                        <strong>Разделить домен</strong> — если он держит слишком
                                        много сценариев.
                                    </li>
                                </HelpList>
                                <HelpText>
                                    <strong>Бесполезные абстракции</strong> — на удаление или
                                    подключение к делу.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Удалить</strong> неиспользуемые сущности-родители.
                                    </li>
                                    <li>
                                        <strong>Подключить</strong> домен к другим — сделать его
                                        полезным.
                                    </li>
                                    <li>
                                        <strong>Объединить</strong> с целевым доменом, если это
                                        «недоделанный модуль».
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Как пользоваться">
                                <HelpList>
                                    <li>
                                        <strong>KPI сверху</strong> — общая картина: сколько в каждой
                                        зоне. Клик по карточке — фильтр.
                                    </li>
                                    <li>
                                        <strong>Вкладка «Таблица»</strong> — плоский список,
                                        сортировка по любому столбцу, поиск.
                                    </li>
                                    <li>
                                        <strong>Вкладка «Диаграмма»</strong> — scatter plot I×A.
                                        Подписи для проблемных точек. Клик — детали.
                                    </li>
                                    <li>
                                        <strong>Клик по домену</strong> — детали: Ca/Ce breakdown,
                                        «что делать», кнопки перехода.
                                    </li>
                                    <li>
                                        <strong>Группировка</strong> — плоско (топ по D) или по
                                        зонам (сначала боль, потом бесполезные, и т.д.).
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Практические примеры">
                                <HelpList>
                                    <li>
                                        <strong>«Зона боли» = 0.</strong> Отлично. Дальше следите,
                                        чтобы не появлялись новые.
                                    </li>
                                    <li>
                                        <strong>«Зона боли» = 5+.</strong> Архитектура «застряла» —
                                        слишком много стабильных конкретных модулей. Скорее всего,
                                        нужен рефакторинг.
                                    </li>
                                    <li>
                                        <strong>«Бесполезные» = много.</strong> Возможно, есть
                                        заброшенные фичи. Проверьте через Health Dashboard — может,
                                        их вообще никто не использует.
                                    </li>
                                    <li>
                                        <strong>«Не классифицировано» = много.</strong> Обычно
                                        бывает в утилитарных доменах (mixin-библиотеки, словари).
                                        Норма, если домены действительно изолированы.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Abstractness считается приближённо: сущность абстрактна,
                                        если от неё кто-то наследует. Настоящая abstractness в UML
                                        считается иначе.
                                    </li>
                                    <li>
                                        Linkages не учитываются в Ca/Ce. Для иерархии зависимостей
                                        используется inherits + Reference.
                                    </li>
                                    <li>
                                        «Расстояние» — эвристика. D=0 недостижим, стремитесь к тому,
                                        чтобы «зона боли» была пустой.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {!showHelp && (
                            <>
                                {/* ── KPI ── */}
                                <div className="martin-kpi">
                                    <div className="martin-kpi-averages">
                                        <div className="martin-kpi-average">
                                            <div className="martin-kpi-average__label">I ср.</div>
                                            <div className="martin-kpi-average__value">
                                                {report.averages.instability.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="martin-kpi-average">
                                            <div className="martin-kpi-average__label">A ср.</div>
                                            <div className="martin-kpi-average__value">
                                                {report.averages.abstractness.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="martin-kpi-average">
                                            <div className="martin-kpi-average__label">D ср.</div>
                                            <div className="martin-kpi-average__value">
                                                {report.averages.distance.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="martin-kpi-zones">
                                        {(
                                            [
                                                "pain",
                                                "uselessness",
                                                "main-sequence",
                                                "unclassified",
                                            ] as ZoneKey[]
                                        ).map((z) => {
                                            const isActive = filterZone === z;
                                            const count = zoneCounts[z];
                                            return (
                                                <button
                                                    key={z}
                                                    type="button"
                                                    className={
                                                        "martin-zone-card martin-zone-card--" +
                                                        z.replace("-", "") +
                                                        (isActive ? " active" : "")
                                                    }
                                                    onClick={() => setFilterZone(isActive ? "" : z)}
                                                    title={ZONE_DESCRIPTION[z]}
                                                >
                                                    <div className="martin-zone-card__icon">
                                                        <MIcon name={zoneIcon(z)} size="sm" />
                                                    </div>
                                                    <div className="martin-zone-card__body">
                                                        <div className="martin-zone-card__count">{count}</div>
                                                        <div className="martin-zone-card__label">
                                                            {ZONE_LABEL[z]}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── Toolbar ── */}
                                <div className="martin-toolbar">
                                    <div className="martin-tabs">
                                        <button
                                            className={
                                                "martin-tab" + (tab === "table" ? " active" : "")
                                            }
                                            onClick={() => setTab("table")}
                                        >
                                            <MIcon name="table_rows" size="sm" />
                                            Таблица
                                        </button>
                                        <button
                                            className={
                                                "martin-tab" + (tab === "scatter" ? " active" : "")
                                            }
                                            onClick={() => setTab("scatter")}
                                        >
                                            <MIcon name="scatter_plot" size="sm" />
                                            Диаграмма
                                        </button>
                                    </div>

                                    {tab === "table" && (
                                        <>
                                            <div className="martin-toolbar__group">
                                                <span className="martin-toolbar__label">Группировка:</span>
                                                <select
                                                    value={groupMode}
                                                    onChange={(e) =>
                                                        setGroupMode(e.target.value as GroupMode)
                                                    }
                                                    className="martin-select"
                                                >
                                                    <option value="flat">Плоско</option>
                                                    <option value="zone">По зоне</option>
                                                </select>
                                            </div>

                                            <div className="martin-toolbar__group">
                                                <span className="martin-toolbar__label">Сортировка:</span>
                                                <select
                                                    value={sortBy}
                                                    onChange={(e) =>
                                                        setSortBy(e.target.value as SortBy)
                                                    }
                                                    className="martin-select"
                                                >
                                                    <option value="distance">Distance ↓</option>
                                                    <option value="instability">Instability ↓</option>
                                                    <option value="abstractness">Abstractness ↓</option>
                                                    <option value="ca">Ca ↓</option>
                                                    <option value="ce">Ce ↓</option>
                                                    <option value="name">По имени</option>
                                                </select>
                                            </div>
                                        </>
                                    )}

                                    <div className="martin-search">
                                        <MIcon name="search" size="sm" />
                                        <input
                                            type="text"
                                            placeholder="Найти домен…"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            spellCheck={false}
                                        />
                                        {query && (
                                            <button
                                                className="martin-search__clear"
                                                onClick={() => setQuery("")}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    {filterZone && (
                                        <button
                                            type="button"
                                            className="martin-filter-active"
                                            onClick={() => setFilterZone("")}
                                            title="Снять фильтр по зоне"
                                        >
                                            <MIcon name="filter_alt" size="sm" />
                                            {ZONE_LABEL[filterZone]}
                                            <span>✕</span>
                                        </button>
                                    )}
                                </div>

                                {/* ── Content ── */}
                                <div className="martin-content">
                                    {tab === "scatter" && (
                                        <ScatterPlot
                                            metrics={sorted}
                                            selectedId={selectedId}
                                            onSelect={handleSelectDomain}
                                            onFilterZone={(zone) => {
                                                setFilterZone(zone);
                                                // Автопереход в таблицу — там видно имена
                                                setTab("table");
                                            }}
                                        />
                                    )}

                                    {tab === "table" && (
                                        <div className="martin-table-wrap">
                                            {groupedByZone ? (
                                                groupedByZone.map((group) => (
                                                    <div key={group.zone} className="martin-group">
                                                        <div
                                                            className="martin-group__head"
                                                            style={{ borderLeftColor: group.color }}
                                                        >
                                                            <MIcon name={zoneIcon(group.zone)} size="sm" />
                                                            <span className="martin-group__title">
                                                                {group.label}
                                                            </span>
                                                            <span className="martin-group__count">
                                                                {group.metrics.length}
                                                            </span>
                                                        </div>
                                                        <table className="martin-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Домен</th>
                                                                    <th title="Ca: сколько доменов зависят">
                                                                        Ca
                                                                    </th>
                                                                    <th title="Ce: от скольких зависит">Ce</th>
                                                                    <th title="Instability = Ce/(Ca+Ce)">I</th>
                                                                    <th title="Abstractness">A</th>
                                                                    <th title="Distance from main sequence">D</th>
                                                                    <th>Сущностей</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.metrics.map((m) => (
                                                                    <MartinTableRow
                                                                        key={m.domainId}
                                                                        metric={m}
                                                                        isSelected={selectedId === m.domainId}
                                                                        onClick={() =>
                                                                            handleSelectDomain(m.domainId)
                                                                        }
                                                                    />
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ))
                                            ) : sorted.length === 0 ? (
                                                <div className="martin-empty">
                                                    {report.metrics.length === 0
                                                        ? "Нет метрик"
                                                        : "Ничего не найдено по фильтрам"}
                                                </div>
                                            ) : (
                                                <table className="martin-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Домен</th>
                                                            <th title="Ca: сколько доменов зависят">Ca</th>
                                                            <th title="Ce: от скольких зависит">Ce</th>
                                                            <th title="Instability = Ce/(Ca+Ce)">I</th>
                                                            <th title="Abstractness">A</th>
                                                            <th title="Distance from main sequence">D</th>
                                                            <th>Сущностей</th>
                                                            <th>Зона</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sorted.map((m) => (
                                                            <MartinTableRow
                                                                key={m.domainId}
                                                                metric={m}
                                                                isSelected={selectedId === m.domainId}
                                                                onClick={() => handleSelectDomain(m.domainId)}
                                                                showZone
                                                            />
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── Detail drawer ── */}
                                {selected && (
                                    <MartinDetail
                                        metric={selected}
                                        onClose={() => setSelectedId(null)}
                                        onOpenSchema={openSchema}
                                        onGoToDomain={gotoDomain}
                                    />
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ Row ============

const MartinTableRow = React.memo(function MartinTableRow({
    metric: m,
    isSelected,
    onClick,
    showZone,
}: {
    metric: MartinMetrics;
    isSelected: boolean;
    onClick: () => void;
    showZone?: boolean;
}) {
    const zone = m.zone as ZoneKey;
    const color = ZONE_COLOR[zone];

    return (
        <tr
            className={
                "martin-row martin-row--" + zone + (isSelected ? " selected" : "")
            }
            onClick={onClick}
            title={`Клик — детали ${m.domainId}`}
        >
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
            <td className="martin-row__num martin-row__num--d">
                <span style={{ color }}>{m.distance.toFixed(2)}</span>
            </td>
            <td className="martin-row__num">
                {m.entitiesAbstract}/{m.entitiesTotal}
            </td>
            {showZone && (
                <td>
                    <span
                        className="martin-zone-tag"
                        style={{ background: color + "22", color }}
                    >
                        {ZONE_SHORT[zone]}
                    </span>
                </td>
            )}
        </tr>
    );
});