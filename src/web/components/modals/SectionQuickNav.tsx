import React, { useEffect, useMemo, useRef, useState } from "react";
import { MIcon } from "../common/MIcon";
import type { LineMap, SectionBlock } from "../../lib/yaml/line-map";

export interface SectionQuickNavProps {
    lineMap: LineMap;
    /** Первая видимая строка Monaco — по ней считаем активную секцию. */
    topLine: number;
    /** Флаг «пользователь только что скроллил» — панель раскрывается. */
    autoOpenSignal: number;
    onJump: (line: number) => void;
}

const ICON_BY_SECTION: Record<string, string> = {
    entities: "category",
    linkages: "link",
    dataTypes: "data_object",
    sequences: "linear_scale",
    counterColorPattern: "timelapse",
    trees: "account_tree",
    transitiveLinkages: "conversion_path",
    mixins: "merge",
    dataRules: "rule",
    exchangeSettings: "swap_horiz",
    actions: "bolt",
    medias: "image",
    views: "visibility",
    widgets: "widgets",
    menus: "menu",
    permissions: "key",
    accessRules: "lock",
    localizations: "translate",
    uiRules: "rule_folder",
    uiPresets: "palette",
};

const AUTO_CLOSE_MS = 2000;

export function SectionQuickNav({
    lineMap,
    topLine,
    autoOpenSignal,
    onJump,
}: SectionQuickNavProps) {
    const [expanded, setExpanded] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Активная секция = последняя, чья строка объявления ≤ topLine
    const activeKey = useMemo<string | null>(() => {
        let active: SectionBlock | null = null;
        for (const s of lineMap.sections) {
            if (s.line <= topLine) active = s;
            else break;
        }
        return active?.key ?? null;
    }, [lineMap.sections, topLine]);

    const cancelClose = () => {
        if (closeTimer.current) {
            clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };
    const scheduleClose = (ms = AUTO_CLOSE_MS) => {
        cancelClose();
        closeTimer.current = setTimeout(() => setExpanded(false), ms);
    };

    // Каждый новый скролл: раскрываем + перезапускаем таймер авто-скрытия
    useEffect(() => {
        if (!autoOpenSignal) return;
        setExpanded(true);
        scheduleClose();
        return cancelClose;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpenSignal]);

    // Размонтирование — сброс таймера
    useEffect(() => cancelClose, []);

    if (lineMap.sections.length === 0) return null;

    return (
        <div
            className={
                "section-quicknav" +
                (expanded ? " section-quicknav--expanded" : "")
            }
            onMouseEnter={() => {
                cancelClose();
                setExpanded(true);
            }}
            onMouseLeave={() => scheduleClose(400)}
        >
            <button
                type="button"
                className="section-quicknav__toggle"
                onClick={() => {
                    cancelClose();
                    setExpanded((v) => !v);
                    if (expanded) scheduleClose(0);
                }}
                title={expanded ? "Скрыть оглавление" : "Оглавление секций"}
                aria-expanded={expanded}
            >
                <MIcon name="toc" size="sm" />
            </button>

            {expanded && (
                <div className="section-quicknav__panel">
                    <div className="section-quicknav__title">Секции схемы</div>
                    <div className="section-quicknav__list">
                        {lineMap.sections.map((s) => {
                            const icon = ICON_BY_SECTION[s.key] || "arrow_right";
                            const isActive = s.key === activeKey;
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    className={
                                        "section-quicknav__item" +
                                        (isActive
                                            ? " section-quicknav__item--active"
                                            : "")
                                    }
                                    onClick={() => {
                                        onJump(s.line);
                                        scheduleClose(600);
                                    }}
                                    title={`${s.label} — строка ${s.line}`}
                                >
                                    <MIcon name={icon} size="sm" />
                                    <span className="section-quicknav__label">
                                        {s.label}
                                    </span>
                                    <span className="section-quicknav__count">
                                        {s.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}