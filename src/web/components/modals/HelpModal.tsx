// src/web/components/modals/HelpModal.tsx
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useMarked } from "../../hooks/useMarked";
import { MIcon } from "../common/MIcon";

export interface HelpModalProps {
    open: boolean;
    onClose: () => void;
}

interface TocItem {
    level: 1 | 2 | 3;
    text: string;
    id: string;
}

/** Отступ от верхнего края скролл-контейнера до заголовка (px). */
const HEADING_OFFSET = 16;

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u0400-\u04FF\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

function stripInline(text: string): string {
    return text
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/`/g, "")
        .trim();
}

export function HelpModal({ open, onClose }: HelpModalProps) {
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toc, setToc] = useState<TocItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [tocCollapsed, setTocCollapsed] = useState(false);

    const { parse, ready } = useMarked();
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ============ Загрузка ============
    useEffect(() => {
        if (!open || content) return;
        setLoading(true);
        setError(null);
        fetch("/user-guide")
            .then((r) => {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.text();
            })
            .then((md) => setContent(md))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [open, content]);

    // ============ Esc ============
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onEsc, true);
        return () => document.removeEventListener("keydown", onEsc, true);
    }, [open, onClose]);

    const html = useMemo(() => {
        if (!ready || !parse || !content) return "";
        return parse(content);
    }, [ready, parse, content]);

    // ============ ID заголовков + сбор TOC ============
    useLayoutEffect(() => {
        if (!html || !contentRef.current) return;
        const root = contentRef.current;
        const headings = root.querySelectorAll<HTMLElement>("h1, h2, h3, h4");
        const items: TocItem[] = [];
        const seen = new Map<string, number>();

        headings.forEach((h) => {
            const levelNum = parseInt(h.tagName.slice(1), 10);
            if (levelNum < 1 || levelNum > 3) return;
            const text = stripInline(h.textContent || "");
            if (!text) return;

            let id = h.id;
            if (!id) {
                const base = slugify(text) || "section";
                const count = seen.get(base) || 0;
                seen.set(base, count + 1);
                id = count > 0 ? `${base}-${count}` : base;
                h.id = id;
            }
            items.push({ level: levelNum as 1 | 2 | 3, text, id });
        });

        setToc(items);
    }, [html]);

    // ============ Скролл к заголовку ============
    const jumpTo = useCallback((id: string) => {
        const scrollEl = scrollRef.current;
        const container = contentRef.current;
        if (!scrollEl || !container) return;

        const el = container.querySelector<HTMLElement>(
            `#${CSS.escape(id)}`,
        );
        if (!el) return;

        const scrollRect = scrollEl.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offsetInContainer =
            elRect.top - scrollRect.top + scrollEl.scrollTop;
        const target = Math.max(0, offsetInContainer - HEADING_OFFSET);

        scrollEl.scrollTo({ top: target, behavior: "smooth" });

        // Сразу подсветим — smooth-scroll идёт, а глаз пользователя уже смотрит
        setActiveId(id);
    }, []);

    // ============ Активный раздел при скролле ============
    useEffect(() => {
        if (!open || toc.length === 0) return;
        const scrollEl = scrollRef.current;
        const container = contentRef.current;
        if (!scrollEl || !container) return;

        let raf: number | null = null;
        const compute = () => {
            raf = null;
            const scrollRect = scrollEl.getBoundingClientRect();
            // Линия «активности» — 20% высоты контейнера от верхнего края.
            // Так пользователь при прокрутке видит активным тот раздел,
            // который уже прошёл шапку, а не тот, что «почти у верхнего края».
            const thresholdY =
                scrollRect.top + Math.min(120, scrollRect.height * 0.2);

            let active: string | null = null;
            for (const item of toc) {
                const el = container.querySelector<HTMLElement>(
                    `#${CSS.escape(item.id)}`,
                );
                if (!el) continue;
                if (el.getBoundingClientRect().top <= thresholdY) {
                    active = item.id;
                } else {
                    break;
                }
            }
            setActiveId((prev) => (prev === active ? prev : active));
        };

        const onScroll = () => {
            if (raf != null) return;
            raf = requestAnimationFrame(compute);
        };

        scrollEl.addEventListener("scroll", onScroll, { passive: true });
        // Начальный расчёт
        compute();

        return () => {
            scrollEl.removeEventListener("scroll", onScroll);
            if (raf != null) cancelAnimationFrame(raf);
        };
    }, [open, toc]);

    // ============ Перехват кликов по #anchor-ссылкам в markdown ============
    // Например, «Словарь» в содержании — это <a href="#3-словарь">.
    // Браузерный default уехал бы не туда. Перехватываем и скроллим сами.
    useEffect(() => {
        if (!open) return;
        const root = contentRef.current;
        if (!root) return;

        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            const a = target.closest("a") as HTMLAnchorElement | null;
            if (!a) return;
            const href = a.getAttribute("href");
            if (!href || !href.startsWith("#")) return;
            const id = decodeURIComponent(href.slice(1));
            if (!id) return;

            // Проверим, что это наш якорь внутри контента
            const el = root.querySelector<HTMLElement>(
                `#${CSS.escape(id)}`,
            );
            if (!el) return;

            e.preventDefault();
            jumpTo(id);
        };

        root.addEventListener("click", onClick);
        return () => root.removeEventListener("click", onClick);
    }, [open, jumpTo, html]);

    const filteredToc = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return toc;
        return toc.filter((t) => t.text.toLowerCase().includes(q));
    }, [toc, query]);

    if (!open) return null;

    return (
        <div className="help-overlay" onMouseDown={onClose}>
            <div
                className="help-modal help-modal--toc"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span>Руководство пользователя</span>
                        {toc.length > 0 && (
                            <span className="help-modal__badge">{toc.length}</span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <button
                            className="help-modal__icon-btn"
                            onClick={() => setTocCollapsed((v) => !v)}
                            title={
                                tocCollapsed ? "Показать оглавление" : "Скрыть оглавление"
                            }
                        >
                            <MIcon name="toc" size="sm" />
                        </button>
                        <button className="help-modal__close" onClick={onClose}>
                            ✕
                        </button>
                    </div>
                </div>

                {loading && !html ? (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка...</div>
                    </div>
                ) : error ? (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                ) : (
                    <div className="help-modal__split">
                        {!tocCollapsed && toc.length > 0 && (
                            <aside className="help-modal__toc">
                                <div className="help-modal__toc-search">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        type="text"
                                        placeholder="Поиск по разделам..."
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {query && (
                                        <button
                                            type="button"
                                            className="help-modal__toc-clear"
                                            onClick={() => setQuery("")}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="help-modal__toc-list">
                                    {filteredToc.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            className={
                                                "help-modal__toc-item" +
                                                ` help-modal__toc-item--h${item.level}` +
                                                (activeId === item.id
                                                    ? " help-modal__toc-item--active"
                                                    : "")
                                            }
                                            onClick={() => jumpTo(item.id)}
                                            title={item.text}
                                        >
                                            {item.text}
                                        </button>
                                    ))}
                                    {filteredToc.length === 0 && query && (
                                        <div className="help-modal__toc-empty">
                                            Ничего не найдено
                                        </div>
                                    )}
                                </div>
                            </aside>
                        )}

                        <div className="help-modal__body" ref={scrollRef}>
                            <div
                                className="help-content"
                                ref={contentRef}
                                dangerouslySetInnerHTML={{ __html: html }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}