import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useGraphStore, ListSort } from "../../state/useGraphStore";
import { MIcon } from "../common/MIcon";
import { plural } from "../../lib/format";
import { DomainListRow } from "./DomainListRow";

const SORT_OPTIONS: Array<{ value: ListSort; label: string }> = [
    { value: "default", label: "По умолчанию" },
    { value: "name", label: "По имени" },
    { value: "version", label: "По версии" },
    { value: "updated", label: "По обновлению" },
    { value: "entities", label: "По сущностям" },
];

function sortNodes(nodes: any[], sort: ListSort): any[] {
    if (sort === "default") return nodes;
    const copy = [...nodes];
    copy.sort((a, b) => {
        const da = a.data;
        const db = b.data;
        if (sort === "name") {
            const an = (da.name || da.domainId || "").toLowerCase();
            const bn = (db.name || db.domainId || "").toLowerCase();
            return an.localeCompare(bn);
        }
        if (sort === "version") {
            const av = da.version || "";
            const bv = db.version || "";
            return bv.localeCompare(av);
        }
        if (sort === "updated") {
            const at = da.updatedAt ? new Date(da.updatedAt).getTime() : 0;
            const bt = db.updatedAt ? new Date(db.updatedAt).getTime() : 0;
            return bt - at;
        }
        if (sort === "entities") {
            return (db.entitiesCount || 0) - (da.entitiesCount || 0);
        }
        return 0;
    });
    return copy;
}

function exportCSV(rows: any[]): void {
    const header = ["id", "name", "version", "author", "tags", "entities", "updatedAt"];
    const lines = [header.join(",")];
    for (const n of rows) {
        const d = n.data;
        const cell = (v: any): string => {
            if (v == null) return "";
            const s = String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        lines.push(
            [
                cell(d.domainId),
                cell(d.name),
                cell(d.version),
                cell(d.author),
                cell((d.tags || []).join("; ")),
                cell(d.entitiesCount),
                cell(d.updatedAt),
            ].join(","),
        );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domains-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportMarkdown(rows: any[]): void {
    const lines: string[] = [];
    lines.push("# Домены");
    lines.push("");
    lines.push(`_Сгенерировано ${new Date().toLocaleString("ru-RU")}_`);
    lines.push("");
    lines.push("| ID | Название | Версия | Автор | Сущностей | Обновлён |");
    lines.push("| --- | --- | --- | --- | ---: | --- |");
    for (const n of rows) {
        const d = n.data;
        lines.push(
            `| \`${d.domainId}\` | ${d.name || ""} | ${d.version || "—"} | ${d.author || "—"} | ${d.entitiesCount ?? "—"} | ${d.updatedAt ? new Date(d.updatedAt).toLocaleDateString("ru-RU") : "—"} |`,
        );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `domains-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

export function DomainList() {
    const nodes = useGraphStore((s) => s.nodes);
    const query = useGraphStore((s) => s.listSearchQuery);
    const setQuery = useGraphStore((s) => s.setListSearchQuery);
    const grouping = useGraphStore((s) => s.listGrouping);
    const setGrouping = useGraphStore((s) => s.setListGrouping);
    const sort = useGraphStore((s) => s.listSort);
    const setSort = useGraphStore((s) => s.setListSort);
    const bookmarks = useGraphStore((s) => s.bookmarks);
    const bookmarksOnly = useGraphStore((s) => s.bookmarksOnly);
    const setBookmarksOnly = useGraphStore((s) => s.setBookmarksOnly);
    const panelNodeId = useGraphStore((s) => s.panelNodeId);
    const onlyInvalid = useGraphStore((s) => s.onlyInvalid);
    const setOnlyInvalid = useGraphStore((s) => s.setOnlyInvalid);
    const validationResults = useGraphStore((s) => s.validationResults);

    const domainNodes = useMemo(
        () => nodes.filter((n) => n.data.nodeType === "domain"),
        [nodes],
    );
    const problematicNodes = useMemo(
        () => nodes.filter((n) => n.data.nodeType !== "domain"),
        [nodes],
    );

    const filtered = useMemo(() => {
        let result = domainNodes;

        if (bookmarksOnly) {
            result = result.filter((n) => bookmarks.has(n.id));
        }
        if (onlyInvalid && validationResults) {
            result = result.filter((n) => {
                const v = validationResults.get(n.data.domainId);
                return v && v.status === "invalid";
            });
        }
        if (query.trim()) {
            const q = query.toLowerCase();
            result = result.filter((n) => {
                const d = n.data;
                const hay = [
                    d.domainId,
                    d.name,
                    d.description,
                    d.author,
                    ...(d.tags || []),
                ]
                    .map(String)
                    .map((s) => s.toLowerCase())
                    .join(" ");
                return hay.includes(q);
            });
        }
        return sortNodes(result, sort);
    }, [domainNodes, query, onlyInvalid, validationResults, sort, bookmarksOnly, bookmarks]);

    const favorites = useMemo(
        () => filtered.filter((n) => bookmarks.has(n.id)),
        [filtered, bookmarks],
    );
    const others = useMemo(
        () => filtered.filter((n) => !bookmarks.has(n.id)),
        [filtered, bookmarks],
    );

    const groups = useMemo(() => {
        if (grouping === "flat") {
            return [{ key: "all", label: "Все домены", nodes: others }];
        }
        const map = new Map<string, typeof others>();
        for (const n of others) {
            const key =
                grouping === "namespace"
                    ? n.data.domainId.split(".").slice(0, 2).join(".") ||
                    n.data.domainId
                    : n.data.folderPath?.join("/") || "(корень)";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(n);
        }
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, ns]) => ({ key, label: key, nodes: ns }));
    }, [others, grouping]);

    // Плоский список для keyboard navigation
    const flatRows = useMemo(() => {
        const rows: Array<{ node: any; isFav: boolean }> = [];
        favorites.forEach((n) => rows.push({ node: n, isFav: true }));
        groups.forEach((g) => {
            g.nodes.forEach((n) => rows.push({ node: n, isFav: false }));
        });
        return rows;
    }, [favorites, groups]);

    const [focusedIdx, setFocusedIdx] = React.useState<number>(-1);
    const bodyRef = useRef<HTMLDivElement>(null);

    const onSelect = useCallback((nodeId: string, domainId: string) => {
        const st = useGraphStore.getState();
        st.setSelectedNodeId(nodeId);
        st.setSelectedEdgeId(null);
        st.setPanelNodeId(nodeId);
        st.setPanelTab("details");
        st.setPanelOpen(true);
        st.pushNav(domainId);
    }, []);

    // Автоскролл к выбранной строке из панели
    useEffect(() => {
        if (!panelNodeId) return;
        const t = setTimeout(() => {
            const el = document.querySelector(
                `.domain-list-row[data-node-id="${panelNodeId}"]`,
            ) as HTMLElement | null;
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
        return () => clearTimeout(t);
    }, [panelNodeId]);

    // Сброс фокуса при изменении фильтров
    useEffect(() => {
        setFocusedIdx(-1);
    }, [query, grouping, sort, bookmarksOnly, onlyInvalid]);

    // Keyboard navigation
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            setFocusedIdx((i) => Math.min(i + 1, flatRows.length - 1));
        } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            setFocusedIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && focusedIdx >= 0) {
            const row = flatRows[focusedIdx];
            if (row) onSelect(row.node.id, row.node.data.domainId);
        } else if (e.key === " " && focusedIdx >= 0) {
            e.preventDefault();
            const row = flatRows[focusedIdx];
            if (row) {
                useGraphStore.getState().toggleBookmark(row.node.id);
            }
        }
    };

    useEffect(() => {
        if (focusedIdx < 0) return;
        const row = flatRows[focusedIdx];
        if (!row) return;
        const el = document.querySelector(
            `.domain-list-row[data-node-id="${row.node.id}"]`,
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [focusedIdx, flatRows]);

    const hasAnyFilter =
        !!query.trim() || bookmarksOnly || onlyInvalid;

    const clearAllFilters = () => {
        setQuery("");
        setBookmarksOnly(false);
        setOnlyInvalid(false);
    };

    return (
        <div className="domain-list" onKeyDown={onKeyDown} tabIndex={0}>
            <div className="domain-list__header">
                <div className="domain-list__search">
                    <MIcon name="search" size="sm" />
                    <input
                        type="text"
                        placeholder="Поиск по id, имени, описанию, тегам, автору..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            className="domain-list__search-clear"
                            onClick={() => setQuery("")}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <div className="domain-list__grouping">
                    <button
                        className={grouping === "flat" ? "active" : ""}
                        onClick={() => setGrouping("flat")}
                        title="Плоский список"
                    >
                        Плоский
                    </button>
                    <button
                        className={grouping === "namespace" ? "active" : ""}
                        onClick={() => setGrouping("namespace")}
                        title="По неймспейсам"
                    >
                        Неймспейсы
                    </button>
                    <button
                        className={grouping === "folder" ? "active" : ""}
                        onClick={() => setGrouping("folder")}
                        title="По каталогам"
                    >
                        Каталоги
                    </button>
                </div>

                <div className="domain-list__grouping domain-list__grouping--sort">
                    <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as ListSort)}
                        title="Сортировка"
                    >
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    className={
                        "domain-list__toolbar-btn" +
                        (bookmarksOnly ? " active" : "")
                    }
                    onClick={() => setBookmarksOnly(!bookmarksOnly)}
                    title="Только избранные"
                >
                    <MIcon name={bookmarksOnly ? "star" : "star_border"} size="sm" fill={bookmarksOnly} />
                </button>

                {hasAnyFilter && (
                    <button
                        className="domain-list__toolbar-btn domain-list__toolbar-btn--clear"
                        onClick={clearAllFilters}
                        title="Сбросить фильтры"
                    >
                        <MIcon name="filter_alt_off" size="sm" />
                    </button>
                )}

                <button
                    className="domain-list__toolbar-btn"
                    onClick={() => exportCSV(filtered)}
                    title="Экспорт списка в CSV"
                >
                    <MIcon name="download" size="sm" />
                </button>

                <div className="domain-list__stats">
                    {filtered.length} {plural(filtered.length, "домен", "доменов")}
                </div>
            </div>

            {hasAnyFilter && (
                <div className="domain-list__chips">
                    {query && (
                        <div className="domain-list__chip">
                            <MIcon name="search" size="sm" />
                            <span>{query}</span>
                            <button onClick={() => setQuery("")} title="Снять">
                                ✕
                            </button>
                        </div>
                    )}
                    {bookmarksOnly && (
                        <div className="domain-list__chip domain-list__chip--fav">
                            <MIcon name="star" size="sm" fill />
                            <span>Только избранные</span>
                            <button onClick={() => setBookmarksOnly(false)} title="Снять">
                                ✕
                            </button>
                        </div>
                    )}
                    {onlyInvalid && (
                        <div className="domain-list__chip domain-list__chip--warn">
                            <MIcon name="cancel" size="sm" />
                            <span>Только невалидные</span>
                            <button onClick={() => setOnlyInvalid(false)} title="Снять">
                                ✕
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="domain-list__body" ref={bodyRef}>
                {favorites.length > 0 && !bookmarksOnly && (
                    <div className="domain-list__section domain-list__section--fav">
                        <div className="domain-list__section-title">
                            <MIcon name="star" size="sm" fill />
                            Избранное ({favorites.length})
                        </div>
                        {favorites.map((n) => (
                            <DomainListRow
                                key={n.id}
                                node={n}
                                isSelected={panelNodeId === n.id}
                                isFavorite={true}
                                isFocused={
                                    focusedIdx >= 0 &&
                                    flatRows[focusedIdx]?.node.id === n.id
                                }
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                )}

                {bookmarksOnly && favorites.length === 0 && (
                    <div className="domain-list__empty">
                        <MIcon name="star_border" size="lg" />
                        <div>Нет избранных доменов{query ? " по запросу" : ""}</div>
                    </div>
                )}

                {!bookmarksOnly &&
                    groups.map((g) => (
                        <div key={g.key} className="domain-list__section">
                            {grouping !== "flat" && (
                                <div className="domain-list__section-title">
                                    <code className="domain-list__section-key">{g.label}</code>
                                    <span className="domain-list__section-count">{g.nodes.length}</span>
                                </div>
                            )}
                            {g.nodes.map((n) => (
                                <DomainListRow
                                    key={n.id}
                                    node={n}
                                    isSelected={panelNodeId === n.id}
                                    isFavorite={false}
                                    isFocused={
                                        focusedIdx >= 0 &&
                                        flatRows[focusedIdx]?.node.id === n.id
                                    }
                                    onSelect={onSelect}
                                />
                            ))}
                        </div>
                    ))}

                {problematicNodes.length > 0 && (
                    <div className="domain-list__section domain-list__section--problematic">
                        <div className="domain-list__section-title">
                            <MIcon name="warning" size="sm" />
                            Проблемные ({problematicNodes.length})
                        </div>
                        {problematicNodes.map((n) => (
                            <DomainListRow
                                key={n.id}
                                node={n}
                                isSelected={panelNodeId === n.id}
                                isFavorite={false}
                                isFocused={false}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                )}

                {filtered.length === 0 && !query.trim() && !hasAnyFilter && (
                    <div className="domain-list__empty">
                        <MIcon name="folder_off" size="lg" />
                        <div>Нет доменов</div>
                    </div>
                )}
                {filtered.length === 0 && hasAnyFilter && (
                    <div className="domain-list__empty">
                        <MIcon name="search_off" size="lg" />
                        <div>Ничего не найдено по текущим фильтрам</div>
                    </div>
                )}
            </div>
        </div>
    );
}