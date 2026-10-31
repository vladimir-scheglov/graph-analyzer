import { useId, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MIcon } from "./MIcon";
import { createPortal } from "react-dom";

export interface HintInfo {
    icon: string;
    title: string;
    description: string;
    example: string;
    hint?: string;
    color: string;
}

export const HINTS: Record<string, HintInfo> = {
    "#": {
        icon: "filter_alt",
        title: "Фильтр по секции",
        description:
            "Ограничивает поиск одной секцией YAML. С пустым запросом — покажет список всех секций.",
        example: "#entities audit",
        hint: "Работает и с пустым значением после #",
        color: "#818cf8",
    },
    ":": {
        icon: "tag",
        title: "Переход к строке",
        description:
            "Прыжок к строке по номеру. Можно указать и колонку — вторая цифра после второго двоеточия.",
        example: ":42  ·  :42:5",
        hint: "Как в VSCode: :строка[:колонка]",
        color: "#22d3ee",
    },
    ">": {
        icon: "search",
        title: "Поиск по содержимому",
        description:
            "Полнотекстовый поиск по файлу. Для регулярного выражения оберните запрос в /…/ и укажите флаги.",
        example: ">id:  ·  >/lists_\\w+/i",
        hint: "Режим regex: >/pattern/flags",
        color: "#f59e0b",
    },
    "@": {
        icon: "data_object",
        title: "Поиск атрибута",
        description:
            "Кросс-сущностный поиск атрибутов по всему домену. Ищет по id и name, включая вложенные атрибуты таблиц.",
        example: "@score  ·  @auditScore",
        hint: "Прыжок к строке атрибута внутри сущности",
        color: "#a78bfa",
    },
    "!": {
        icon: "bug_report",
        title: "Проблемы линтера",
        description:
            "Переход к проблеме. Ищет по правилу, сообщению, сущности, атрибуту, severity и propertyPath.",
        example: "!error  ·  !naming  ·  !audit",
        hint: "Совместимо с фильтрами severity",
        color: "#ef4444",
    },
    "~": {
        icon: "near_me",
        title: "Соседние элементы",
        description:
            "Пять элементов выше и пять ниже курсора. С фильтром — только совпадающие по id, name или описанию.",
        example: "~  ·  ~audit",
        hint: "Удобно, когда курсор где-то в середине",
        color: "#10b981",
    },
    "?": {
        icon: "help",
        title: "Справка",
        description:
            "Показывает все команды и примеры синтаксиса прямо в списке. Клик на примере подставит его в поле.",
        example: "?",
        hint: "Не закрывает поповер",
        color: "var(--text-400)",
    },

    // ── 🎯 в тулбаре над редактором ──
    quickjump: {
        icon: "my_location",
        title: "Быстрый переход",
        description:
            "Открыть окно быстрого перехода: поиск по id, #секции, :строке, >содержимому, " +
            "@атрибуту, !проблеме, ~соседям, FQID. Shift+Tab — то же, F2 — с подставленным словом под курсором.",
        example: "Shift+Tab · F2",
        hint: "Полная документация — по кнопке ? в шапке окна",
        color: "#22d3ee",
    },

    // ── Уровни сворачивания (1–5) ──
    fold: {
        icon: "unfold_less",
        title: "Свернуть до уровня",
        description:
            "Свернуть все блоки в файле до указанного уровня вложенности. " +
            "Повторный клик по уже активному уровню — развернуть всё.",
        example: "1 → 2 → 3 → 4 → 5",
        hint: "Цифра на кнопке = целевой уровень",
        color: "var(--text-400)",
    },

    // ── «Развернуть всё» ──
    "fold-unfold": {
        icon: "unfold_more",
        title: "Развернуть всё",
        description: "Снять все свёрнутые регионы в файле.",
        example: "",
        color: "var(--text-400)",
    },

    // ── Dropdown с дополнительными свёртками ──
    "fold-more": {
        icon: "more_horiz",
        title: "Дополнительные действия свёртки",
        description:
            "Свернуть/развернуть всё, свернуть сиблингов курсора, " +
            "свернуть все блоки по имени контейнера, скрыть/показать оглавление секций.",
        example: "attributes · widgets · groups · views",
        color: "var(--text-400)",
    },

    // ── Бейдж «Проблемы» на вкладке ──
    "tab-issues": {
        icon: "warning",
        title: "Проблемы в файле",
        description:
            "Счётчик проблем линтера, RQL-проверок и ошибок синтаксиса YAML в текущем файле. " +
            "Показаны только включённые в фильтре severity.",
        example: "⏱ — «правило требует сохранения»",
        hint: "Нажмите на вкладку, чтобы открыть список",
        color: "var(--warning)",
    },

    // ── Бейдж «Ссылки» на вкладке ──
    "tab-refs": {
        icon: "link",
        title: "Внешние FQID-ссылки",
        description:
            "Ссылки из текущего файла на другие домены. Плюс — сценарии и playbooks, которые здесь запускаются.",
        example: "views[i].widgets[i].joinId",
        color: "var(--accent-hover)",
    },

    // ── Бейдж «Используется» на вкладке ──
    "tab-backlinks": {
        icon: "call_received",
        title: "Обратные ссылки",
        description:
            "Кто ссылается на элемент под курсором: наследники, Reference-атрибуты, view, " +
            "dataRules, mixins, actions, linkages, uiRules, trees, transitiveLinkages.",
        example: "поставьте курсор на элемент",
        color: "var(--accent-hover)",
    },

    // ── Бейдж «Сервер» на вкладке ──
    "tab-server": {
        icon: "cloud",
        title: "Серверная валидация",
        description:
            "Отправить текущий (несохранённый) YAML на проверку на сервер. Ошибки приходят с сервера " +
            "и подсвечиваются в редакторе поверх локального линтера.",
        example: "только при --server",
        color: "var(--accent-hover)",
    },
};

export interface HintProps {
    /** Ключ в HINTS. Если задан — рендерит `<kbd>{char}</kbd>` как анкор (если нет children). */
    char?: string;
    /** Готовый HintInfo. Приоритетнее char. */
    info?: HintInfo;
    /** Что рендерить как анкор. Если пусто — `<kbd>{char}</kbd>`. */
    children?: React.ReactNode;
    /** Опциональный className для обёртки. */
    className?: string;
    style?: React.CSSProperties;
}

// Глобальный менеджер тултипов
let activeHintId: string | null = null;
const hintListeners = new Set<(id: string | null) => void>();

function setActiveHint(id: string | null) {
    if (activeHintId !== id) {
        activeHintId = id;
        hintListeners.forEach((l) => l(id));
    }
}

function useActiveHint() {
    const [active, setActive] = useState(activeHintId);
    useEffect(() => {
        hintListeners.add(setActive);
        return () => {
            hintListeners.delete(setActive);
        };
    }, []);
    return active;
}

export function Hint({ char, info, children, className }: HintProps) {
    const hintId = useId();
    const activeId = useActiveHint();
    const [isHovered, setIsHovered] = useState(false);
    const ref = useRef<HTMLSpanElement>(null);
    const data = info ?? (char ? HINTS[char] : null);
    const timeoutRef = useRef<number>();

    if (!data) {
        return <>{children ?? (char ? <kbd>{char}</kbd> : null)}</>;
    }

    const handleEnter = () => {
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        setIsHovered(true);
        setActiveHint(hintId);
    };

    const handleLeave = () => {
        setIsHovered(false);
        // Задержка 100мс нужна только чтобы мышка успела соскочить
        timeoutRef.current = window.setTimeout(() => {
            if (activeHintId === hintId) {
                setActiveHint(null);
            }
        }, 100);
    };

    const show = isHovered && activeId === hintId;

    return (
        <span
            ref={ref}
            className={"hint-anchor" + (className ? " " + className : "")}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
        >
            {children ?? <kbd>{char}</kbd>}
            {show && <HintTooltip info={data} anchor={ref.current} />}
        </span>
    );
}

function HintTooltip({ info, anchor }: { info: HintInfo; anchor: HTMLElement | null }) {
    const [coords, setCoords] = useState<{ left: number; top: number; maxHeight?: number } | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    const calculate = useCallback(() => {
        if (!anchor || !ref.current) return;
        const el = ref.current;
        const a = anchor.getBoundingClientRect();
        if (a.width === 0 && a.height === 0) return;

        const WIDTH = 340;
        const MARGIN = 8;
        const GAP = 8;

        let left = a.left + a.width / 2 - WIDTH / 2;
        if (left < MARGIN) left = MARGIN;
        if (left + WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - WIDTH - MARGIN;

        // Временно убираем ограничения для точного замера
        el.style.maxHeight = "none";
        el.style.overflowY = "visible";
        const tipHeight = el.getBoundingClientRect().height;

        const above = a.top - MARGIN;
        const below = window.innerHeight - a.bottom - MARGIN;

        let top = 0;
        let maxHeight: number | undefined;

        if (above >= tipHeight) {
            top = a.top - tipHeight - GAP;
        } else if (below >= tipHeight) {
            top = a.bottom + GAP;
        } else if (above >= below) {
            top = MARGIN;
            maxHeight = above - GAP;
        } else {
            top = a.bottom + GAP;
            maxHeight = below - GAP;
        }

        setCoords(prev => {
            if (prev && prev.left === left && prev.top === top && prev.maxHeight === maxHeight) {
                return prev;
            }
            return { left, top, maxHeight };
        });
    }, [anchor]);

    useLayoutEffect(() => {
        calculate();
    }, [calculate]);

    useEffect(() => {
        if (!anchor) return;
        let rafId: number;
        let isAnimating = true;

        const onEnd = () => {
            isAnimating = false;
            calculate();
        };

        const ancestors: HTMLElement[] = [];
        let p = anchor.parentElement;
        while (p && p !== document.body) {
            ancestors.push(p);
            p = p.parentElement;
        }
        ancestors.forEach(a => {
            a.addEventListener("transitionend", onEnd);
            a.addEventListener("animationend", onEnd);
        });

        const tick = () => {
            if (isAnimating) {
                calculate();
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(rafId);
            ancestors.forEach(a => {
                a.removeEventListener("transitionend", onEnd);
                a.removeEventListener("animationend", onEnd);
            });
        };
    }, [anchor, calculate]);

    if (!anchor) return null;

    return createPortal(
        <div
            ref={ref}
            className="yaml-quickjump-hint-tooltip"
            style={{
                position: "fixed",
                // Если координат еще нет, прячем далеко за экран, чтобы измерить высоту
                left: coords ? coords.left : -9999,
                top: coords ? coords.top : -9999,
                width: 340,
                zIndex: 9999,
                maxHeight: coords?.maxHeight,
                overflowY: coords?.maxHeight ? "auto" : undefined,
                visibility: coords ? "visible" : "hidden",
                animation: "none",
                transition: "none",
                transform: "none",
                pointerEvents: "none",
            }}
        >
            <div className="yaml-quickjump-hint-tooltip__head">
                <MIcon name={info.icon} size="sm" style={{ color: info.color }} />
                <span className="yaml-quickjump-hint-tooltip__title">{info.title}</span>
            </div>
            <div className="yaml-quickjump-hint-tooltip__desc">{info.description}</div>
            <div className="yaml-quickjump-hint-tooltip__example">
                <span className="yaml-quickjump-hint-tooltip__example-label">Пример</span>
                <code>{info.example}</code>
            </div>
            {info.hint && (
                <div className="yaml-quickjump-hint-tooltip__hint">
                    <MIcon name="lightbulb" size="sm" />
                    <span>{info.hint}</span>
                </div>
            )}
        </div>,
        document.body
    );
}