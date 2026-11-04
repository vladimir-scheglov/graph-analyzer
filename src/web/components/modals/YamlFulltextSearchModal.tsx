import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useYamlFulltextSearch } from "../../hooks/useYamlFulltextSearch";
import { MIcon } from "../common/MIcon";
import { HighlightedText } from "../common/HighlightedText";
import type { YamlSearchHit } from "../../../server/routes/yaml-search";
import { openFileInEditor } from "../../lib/open-file";
import { useModelIndex } from "../../hooks/useModelIndex";
import { DomainCombobox } from "../common/DomainCombobox";

const DEBOUNCE_MS = 350;

interface GroupedResult {
    domainId: string | null;
    filePath: string;
    hits: YamlSearchHit[];
}

export function YamlFulltextSearchModal() {
    const open = useGraphStore((s) => s.yamlFulltextSearchOpen);
    const setOpen = useGraphStore((s) => s.setYamlFulltextSearchOpen);
    const nodes = useGraphStore((s) => s.nodes);

    const [query, setQuery] = useState("");
    const [regex, setRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [includeComments, setIncludeComments] = useState(true);
    const [domainFilter, setDomainFilter] = useState("");
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const inputRef = useRef<HTMLInputElement>(null);

    const { hits, loading, error, total, truncated, elapsedMs, search } = useYamlFulltextSearch();

    const { index } = useModelIndex();

    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        index.domains.forEach((d) => {
            if (!map.has(d.id)) map.set(d.id, 0);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setExpandedGroups(new Set());
            return;
        }
        const t = setTimeout(() => inputRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
            }
        };
        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open, setOpen]);

    // Debounce
    useEffect(() => {
        if (!open) return;
        if (!query.trim() || query.trim().length < 2) return;
        const t = setTimeout(() => {
            void search(query, { regex, caseSensitive, includeComments, domain: domainFilter });
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [query, regex, caseSensitive, includeComments, domainFilter, open, search]);

    const grouped = useMemo<GroupedResult[]>(() => {
        const map = new Map<string, GroupedResult>();
        for (const h of hits) {
            const key = h.filePath;
            if (!map.has(key)) map.set(key, { domainId: h.domainId, filePath: h.filePath, hits: [] });
            map.get(key)!.hits.push(h);
        }
        return Array.from(map.values()).sort((a, b) => {
            if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
            return (a.domainId || "").localeCompare(b.domainId || "");
        });
    }, [hits]);

    // Автораскрытие всех групп при новых hits
    useEffect(() => {
        if (grouped.length === 0) return;
        setExpandedGroups(new Set(grouped.map((g) => g.filePath)));
    }, [hits]);

    const openHit = useCallback((h: YamlSearchHit) => {
        const st = useGraphStore.getState();
        st.setYamlViewerPendingGoto({ kind: "line", line: h.line, column: h.column });
        st.setYamlViewerFilePath(h.filePath);
        st.setYamlViewerFqid(null);
        st.setYamlViewerDomainId(h.domainId);
        st.setYamlViewerOpen(true);
        setOpen(false);
    }, [setOpen]);

    const toggleGroup = (fp: string) => {
        setExpandedGroups((prev) => {
            const s = new Set(prev);
            if (s.has(fp)) s.delete(fp); else s.add(fp);
            return s;
        });
    };

    const copyAll = async () => {
        const text = grouped
            .map((g) => {
                const head = `## ${g.domainId || "(no domain)"} — ${g.filePath}`;
                const body = g.hits.map((h) => `  ${h.line}:${h.column}  ${h.lineText.trim()}`).join("\n");
                return `${head}\n${body}`;
            })
            .join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(`Скопировано: ${hits.length} строк`);
        } catch { /* ignore */ }
    };

    if (!open) return null;

    return (
        <div className="help-overlay help-overlay--fullscreen" style={{ zIndex: 500 }} onMouseDown={() => setOpen(false)}>
            <div className="help-modal yaml-fulltext-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="search" size="sm" />
                        <span className="icon-label">Полнотекстовый поиск по YAML</span>
                        {hits.length > 0 && <span className="help-modal__badge">{total}</span>}
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                </div>

                <div className="yaml-fulltext-search">
                    <div className="yaml-fulltext-search__input">
                        <MIcon name="search" size="sm" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Поиск по содержимому всех схем (description, RQL, комментарии…)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {query && (
                            <button className="yaml-fulltext-search__clear" onClick={() => setQuery("")}>✕</button>
                        )}
                    </div>

                    <div className="yaml-fulltext-search__toggles">
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (regex ? " active" : "")}
                            onClick={() => setRegex(!regex)}
                            title="Регулярное выражение"
                        >.*</button>
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (caseSensitive ? " active" : "")}
                            onClick={() => setCaseSensitive(!caseSensitive)}
                            title="Учитывать регистр"
                        >Aa</button>
                        <button
                            type="button"
                            className={"yaml-search-toggle" + (includeComments ? " active" : "")}
                            onClick={() => setIncludeComments(!includeComments)}
                            title="Искать в комментариях"
                        >#</button>
                        <div className="yaml-fulltext-search__domain">
                            <DomainCombobox
                                value={domainFilter}
                                onChange={(v) => setDomainFilter(v)}
                                domains={allDomains}
                                placeholder="Все домены"
                                allowEmpty
                                emptyLabel="Все домены"
                            />
                        </div>
                        {hits.length > 0 && (
                            <button className="btn" onClick={copyAll} title="Копировать все результаты">
                                <MIcon name="content_copy" size="sm" /> Все ({hits.length})
                            </button>
                        )}
                    </div>

                    {loading && <div className="yaml-fulltext-search__status">Поиск…</div>}
                    {error && <div className="yaml-fulltext-search__status yaml-fulltext-search__status--err">{error}</div>}
                    {!loading && !error && query.trim().length >= 2 && hits.length === 0 && (
                        <div className="yaml-fulltext-search__status">Ничего не найдено</div>
                    )}
                    {truncated && (
                        <div className="yaml-fulltext-search__status yaml-fulltext-search__status--warn">
                            Показаны первые {hits.length} из {total}. Уточните запрос.
                        </div>
                    )}
                    {!loading && hits.length > 0 && (
                        <div className="yaml-fulltext-search__stats">
                            {total} совпадений за {elapsedMs} мс в {grouped.length} файлах
                        </div>
                    )}

                    <div className="yaml-fulltext-search__results">
                        {grouped.map((g) => {
                            const isOpen = expandedGroups.has(g.filePath);
                            return (
                                <div key={g.filePath} className={"yaml-fulltext-group" + (isOpen ? " open" : "")}>
                                    <button className="yaml-fulltext-group__head" onClick={() => toggleGroup(g.filePath)}>
                                        <span className="yaml-fulltext-group__chevron">{isOpen ? "▾" : "▸"}</span>
                                        <MIcon name="description" size="sm" />
                                        <code className="yaml-fulltext-group__domain">{g.domainId || "(?)"}</code>
                                        <span className="yaml-fulltext-group__count">{g.hits.length}</span>
                                    </button>
                                    {isOpen && (
                                        <div className="yaml-fulltext-group__body">
                                            {g.hits.map((h, i) => (
                                                <button
                                                    key={`${h.line}:${h.column}:${i}`}
                                                    type="button"
                                                    className="yaml-fulltext-hit"
                                                    onClick={() => openHit(h)}
                                                    title={`${h.filePath}:${h.line}:${h.column}`}
                                                >
                                                    <span className="yaml-fulltext-hit__line">:{h.line}</span>
                                                    <span className="yaml-fulltext-hit__context">
                                                        <span className="yaml-fulltext-hit__plain">{h.contextBefore}</span>
                                                        <span className={"yaml-fulltext-hit__match" + (h.inComment ? " in-comment" : "")}>
                                                            {h.lineText.slice(h.column - 1, h.column - 1 + h.length)}
                                                        </span>
                                                        <span className="yaml-fulltext-hit__plain">{h.contextAfter}</span>
                                                    </span>
                                                    {h.inComment && <span className="yaml-fulltext-hit__comment-badge">#</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}