import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useMarked } from "../../hooks/useMarked";
import { MIcon } from "../common/MIcon";
import {
    CHEATSHEET,
    SECTION_GROUPS,
    getRecipesForSection,
    type CheatsheetSection,
    type CheatsheetRecipe,
} from "../../lib/cheatsheet";

type SelectedItem =
    | { kind: "section"; id: string }
    | { kind: "recipe"; id: string }
    | null;

// ============ Утилиты ============

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\u0400-\u04FF\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

interface Heading {
    level: 2 | 3;
    text: string;
    id: string;
}

function extractHeadings(md: string): Heading[] {
    const out: Heading[] = [];
    const re = /^(#{2,3})\s+(.+?)\s*#*\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
        const level = m[1].length as 2 | 3;
        const text = m[2].trim();
        const id = "h-" + slugify(text);
        if (id.length > 2) out.push({ level, text, id });
    }
    return out;
}

function findSnippet(md: string, query: string, radius = 40): string | null {
    const q = query.trim();
    if (!q) return null;
    const lower = md.toLowerCase();
    const idx = lower.indexOf(q.toLowerCase());
    if (idx < 0) return null;

    const start = Math.max(0, idx - radius);
    const end = Math.min(md.length, idx + q.length + radius);
    let s = md.slice(start, end);

    if (start > 0) s = "…" + s.trimStart();
    if (end < md.length) s = s.trimEnd() + "…";

    // Минимальная очистка markdown — только чтобы не мешало читать
    s = s
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .replace(/^#+\s+/gm, "")
        .replace(/^[-*]\s+/gm, "")
        .replace(/\s+/g, " ")
        .trim();

    return s;
}

/**
 * Подсветка query в тексте — работает по text-nodes, не трогает
 * `pre`, `code`, `mark`, `script`, `style`, чтобы не ломать разметку.
 */
function applyHighlight(root: HTMLElement, query: string): void {
    if (!query) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
        if (!(node instanceof Text)) continue;
        const el = node.parentElement;
        if (!el) continue;
        if (el.closest("pre, code, mark, script, style")) continue;
        nodes.push(node);
    }

    const q = query.toLowerCase();
    for (const n of nodes) {
        const text = n.nodeValue || "";
        if (!text) continue;
        const lower = text.toLowerCase();
        let idx = lower.indexOf(q);
        if (idx < 0) continue;

        const frag = document.createDocumentFragment();
        let pos = 0;
        while (idx !== -1) {
            if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
            const mark = document.createElement("mark");
            mark.className = "search-hl";
            mark.textContent = text.slice(idx, idx + query.length);
            frag.appendChild(mark);
            pos = idx + query.length;
            idx = lower.indexOf(q, pos);
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
        n.parentNode?.replaceChild(frag, n);
    }
}

// ============ Компонент ============

export function CheatsheetModal() {
    const open = useGraphStore((s) => s.cheatsheetOpen);
    const setOpen = useGraphStore((s) => s.setCheatsheetOpen);
    const initialSection = useGraphStore((s) => s.cheatsheetInitialSection);
    const setInitialSection = useGraphStore((s) => s.setCheatsheetInitialSection);

    const [selected, setSelected] = useState<SelectedItem>(null);
    const [query, setQuery] = useState("");
    const [highlightQuery, setHighlightQuery] = useState<string | null>(null);

    const { parse, ready } = useMarked();
    const contentRef = useRef<HTMLDivElement>(null);

    // ── Инициализация ──
    useEffect(() => {
        if (!open) return;
        if (initialSection) {
            setSelected({ kind: "section", id: initialSection });
            setInitialSection(null);
        } else if (!selected) {
            setSelected({ kind: "section", id: CHEATSHEET.sections[0].id });
        }
    }, [open, initialSection, setInitialSection, selected]);

    // ── Сброс при закрытии ──
    useEffect(() => {
        if (!open) {
            setQuery("");
            setHighlightQuery(null);
        }
    }, [open]);

    // ── Текущий элемент ──
    const currentSection: CheatsheetSection | null =
        selected?.kind === "section"
            ? CHEATSHEET.sections.find((s) => s.id === selected.id) || null
            : null;

    const currentRecipe: CheatsheetRecipe | null =
        selected?.kind === "recipe"
            ? CHEATSHEET.recipes.find((r) => r.id === selected.id) || null
            : null;

    const markdown = currentSection?.md || currentRecipe?.md || "";

    const html = useMemo(() => {
        if (!ready || !parse || !markdown) return "";
        return parse(markdown);
    }, [ready, parse, markdown]);

    const headings = useMemo(() => extractHeadings(markdown), [markdown]);

    // ── Пост-обработка DOM: id заголовков, кнопки копирования, подсветка ──
    useEffect(() => {
        const el = contentRef.current;
        if (!el || !html) return;

        // 1. id заголовкам
        const h2h3 = el.querySelectorAll("h2, h3");
        h2h3.forEach((h) => {
            const text = (h.textContent || "").trim();
            const id = "h-" + slugify(text);
            if (id && id !== "h-") h.id = id;
        });

        // 2. Кнопки на pre: «Копировать» + «В редактор»
        const pres = el.querySelectorAll("pre");
        pres.forEach((pre) => {
            if (pre.querySelector(".cheatsheet-code-actions")) return;

            const code = pre.querySelector("code")?.textContent || "";

            const actions = document.createElement("div");
            actions.className = "cheatsheet-code-actions";

            // ── Копировать ──
            const btnCopy = document.createElement("button");
            btnCopy.type = "button";
            btnCopy.className = "cheatsheet-copy-btn";
            btnCopy.textContent = "📋 Копировать";
            btnCopy.onclick = () => {
                navigator.clipboard.writeText(code).then(() => {
                    btnCopy.textContent = "✓ Скопировано";
                    setTimeout(() => (btnCopy.textContent = "📋 Копировать"), 1500);
                });
            };
            actions.appendChild(btnCopy);

            // ── В редактор ──
            const btnOpen = document.createElement("button");
            btnOpen.type = "button";
            btnOpen.className = "cheatsheet-open-btn";
            btnOpen.textContent = "→ В редактор";
            btnOpen.title = "Скопировать YAML и открыть редактор";
            btnOpen.onclick = () => {
                const st = useGraphStore.getState();
                navigator.clipboard
                    .writeText(code)
                    .then(() => {
                        // Если редактор закрыт — открыть на первом доступном файле
                        if (!st.yamlViewerOpen) {
                            const node = st.nodes.find(
                                (n: any) => n.data && n.data.filePath,
                            );
                            if (node?.data.filePath) {
                                st.setYamlViewerFilePath(node.data.filePath);
                                st.setYamlViewerFqid(null);
                                st.setYamlViewerDomainId(node.data.domainId);
                                st.setYamlViewerOpen(true);
                            }
                        }
                        st.showSnackbar(
                            "YAML скопирован. Вставьте в редактор (Ctrl+V) в нужное место.",
                        );
                    })
                    .catch(() => {
                        st.showSnackbar("Не удалось скопировать YAML");
                    });
            };
            actions.appendChild(btnOpen);

            (pre as HTMLElement).style.position = "relative";
            pre.appendChild(actions);
        });

        // 3. Подсветка найденного
        if (highlightQuery) {
            applyHighlight(el, highlightQuery);
        }
    }, [html, highlightQuery]);

    // ── Навигация по TOC ──
    const jumpToAnchor = useCallback((id: string) => {
        const el = contentRef.current?.querySelector(
            "#" + CSS.escape(id),
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    // ── Скролл наверх при смене выбранного ──
    useEffect(() => {
        const scrollable = contentRef.current?.closest(
            ".cheatsheet-content",
        ) as HTMLElement | null;
        if (scrollable) scrollable.scrollTop = 0;
    }, [selected?.kind, selected?.id]);

    // ── Esc ──
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
            }
        };
        document.addEventListener("keydown", onEsc, true);
        return () => document.removeEventListener("keydown", onEsc, true);
    }, [open, setOpen]);

    // ── Поиск ──
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) {
            return {
                groups: SECTION_GROUPS,
                recipes: CHEATSHEET.recipes,
                isSearching: false,
            };
        }

        const groups = SECTION_GROUPS.map((g) => ({
            id: g.id,
            label: g.label,
            sections: g.sections.filter(
                (s) =>
                    s.label.toLowerCase().includes(q) ||
                    s.md.toLowerCase().includes(q),
            ),
        })).filter((g) => g.sections.length > 0);

        const recipes = CHEATSHEET.recipes.filter(
            (r) =>
                r.title.toLowerCase().includes(q) ||
                r.description.toLowerCase().includes(q) ||
                r.md.toLowerCase().includes(q),
        );

        return { groups, recipes, isSearching: true };
    }, [query]);

    if (!open) return null;

    const recipesForSection = currentSection
        ? getRecipesForSection(currentSection.id)
        : [];

    const openItem = (item: SelectedItem) => {
        setSelected(item);
        setHighlightQuery(query.trim() || null);
    };

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 500 }}
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal cheatsheet-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ── Header ── */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="menu_book" size="sm" />
                        <span className="icon-label">Шпаргалка по схеме домена</span>
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => setOpen(false)}
                    >
                        ✕
                    </button>
                </div>

                <div className="cheatsheet-body">
                    {/* ── Sidebar ── */}
                    <div className="cheatsheet-sidebar">
                        <div className="cheatsheet-search">
                            <MIcon name="search" size="sm" />
                            <input
                                type="text"
                                placeholder="Поиск по секциям и рецептам…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                spellCheck={false}
                            />
                            {query && (
                                <button
                                    className="cheatsheet-search__clear"
                                    onClick={() => setQuery("")}
                                    title="Очистить"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {filtered.groups.map((g) => (
                            <div key={g.id} className="cheatsheet-group">
                                <div className="cheatsheet-group__title">
                                    {g.label}
                                </div>
                                {g.sections.map((s) => {
                                    const snippet = query
                                        ? findSnippet(s.md, query)
                                        : null;
                                    return (
                                        <button
                                            key={s.id}
                                            className={
                                                "cheatsheet-nav-item" +
                                                (selected?.kind === "section" &&
                                                    selected.id === s.id
                                                    ? " cheatsheet-nav-item--active"
                                                    : "")
                                            }
                                            onClick={() =>
                                                openItem({
                                                    kind: "section",
                                                    id: s.id,
                                                })
                                            }
                                        >
                                            <MIcon name={s.icon} size="sm" />
                                            <div>
                                                <span>{s.label}</span>
                                                {snippet && (
                                                    <span title={snippet}>{snippet}</span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}

                        {filtered.recipes.length > 0 && (
                            <div className="cheatsheet-group">
                                <div className="cheatsheet-group__title">
                                    Рецепты
                                </div>
                                {filtered.recipes.map((r) => {
                                    const snippet = query
                                        ? findSnippet(r.md, query)
                                        : null;
                                    return (
                                        <button
                                            key={r.id}
                                            className={
                                                "cheatsheet-nav-item cheatsheet-nav-item--recipe" +
                                                (selected?.kind === "recipe" &&
                                                    selected.id === r.id
                                                    ? " cheatsheet-nav-item--active"
                                                    : "")
                                            }
                                            onClick={() =>
                                                openItem({
                                                    kind: "recipe",
                                                    id: r.id,
                                                })
                                            }
                                            title={r.description}
                                        >
                                            <MIcon
                                                name="auto_awesome"
                                                size="sm"
                                            />
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "flex-start",
                                                    minWidth: 0,
                                                    flex: 1,
                                                }}
                                            >
                                                <span>{r.title}</span>
                                                {snippet && (
                                                    <span
                                                        style={{
                                                            fontSize: 10,
                                                            color: "var(--text-500)",
                                                            marginTop: 2,
                                                            maxWidth: "100%",
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                        title={snippet}
                                                    >
                                                        {snippet}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {filtered.groups.length === 0 &&
                            filtered.recipes.length === 0 && (
                                <div className="cheatsheet-empty">
                                    Ничего не найдено
                                </div>
                            )}
                    </div>

                    {/* ── Content ── */}
                    <div className="cheatsheet-content">
                        {markdown && html ? (
                            <>
                                {headings.length >= 3 && (
                                    <details className="cheatsheet-toc" open={false}>
                                        <summary className="cheatsheet-toc__summary">
                                            <span>Содержание</span>
                                            <span className="cheatsheet-toc__count">
                                                {headings.length}
                                            </span>
                                        </summary>
                                        <ul className="cheatsheet-toc__list">
                                            {headings.map((h) => (
                                                <li
                                                    key={h.id}
                                                    className={
                                                        "cheatsheet-toc__item" +
                                                        (h.level === 3 ? " cheatsheet-toc__item--h3" : "")
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        className="cheatsheet-toc__link"
                                                        onClick={() => {
                                                            jumpToAnchor(h.id);
                                                            // Сворачиваем после клика — не мешает читать
                                                            const d = document.activeElement?.closest(
                                                                "details.cheatsheet-toc",
                                                            ) as HTMLDetailsElement | null;
                                                            if (d) d.open = false;
                                                        }}
                                                        title={h.text}
                                                    >
                                                        {h.text}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                                <div
                                    key={`${selected?.id}-${highlightQuery || ""}`}
                                    className="cheatsheet-md"
                                    ref={contentRef}
                                    dangerouslySetInnerHTML={{ __html: html }}
                                />

                                {currentSection &&
                                    recipesForSection.length > 0 && (
                                        <div className="cheatsheet-related">
                                            <div className="cheatsheet-related__title">
                                                Связанные рецепты
                                            </div>
                                            {recipesForSection.map((r) => (
                                                <button
                                                    key={r.id}
                                                    className="cheatsheet-related__item"
                                                    onClick={() =>
                                                        openItem({
                                                            kind: "recipe",
                                                            id: r.id,
                                                        })
                                                    }
                                                >
                                                    <MIcon
                                                        name="auto_awesome"
                                                        size="sm"
                                                    />
                                                    <div>
                                                        <div className="cheatsheet-related__title-text">
                                                            {r.title}
                                                        </div>
                                                        <div className="cheatsheet-related__desc">
                                                            {r.description}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                {currentSection?.docsRef && (
                                    <div className="cheatsheet-docsref">
                                        📖 {currentSection.docsRef}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="cheatsheet-empty">
                                {!ready
                                    ? "Загрузка markdown…"
                                    : "Выберите секцию слева"}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}