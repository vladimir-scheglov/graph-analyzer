import React, { useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import {
    buildAttributeMatrix,
    AttributeMatrixColumn,
    AttributeMatrixCell,
    categoryOf,
    shortLabel,
} from "../../lib/model/attribute-matrix";
import { DomainCombobox } from "../common/DomainCombobox";
import { MIcon } from "../common";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { alertDialog } from "../../lib/dialogs";

// ============ Константы ============

const CATEGORY_COLORS: Record<string, string> = {
    string: "#94a3b8",
    numeric: "#6366f1",
    boolean: "#10b981",
    date: "#f59e0b",
    reference: "#a78bfa",
    array: "#eab308",
    uuid: "#06b6d4",
    custom: "#ec4899",
    other: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
    string: "String / Text / URL / MAC",
    numeric: "Integer / Decimal / Float / Counter",
    boolean: "Bool",
    date: "Date / Time / Timestamp",
    reference: "Reference",
    array: "Array / Table",
    uuid: "Uuid / Identifier",
    custom: "Кастомный тип (Enum / Workflow / Table)",
    other: "Прочее",
};

type QuickFilter =
    | "inconsistent"
    | "readonly-mixed"
    | "required-mixed"
    | "unused-in-views"
    | "nested";

const QUICK_FILTERS: Array<{
    id: QuickFilter;
    label: string;
    icon: string;
    test: (c: AttributeMatrixColumn) => boolean;
}> = [
        {
            id: "inconsistent",
            label: "С разными типами",
            icon: "warning",
            test: (c) => !c.consistentType,
        },
        {
            id: "readonly-mixed",
            label: "Разный readonly",
            icon: "lock",
            test: (c) => c.readonlyCount > 0 && c.readonlyCount < c.count,
        },
        {
            id: "required-mixed",
            label: "Разный required",
            icon: "star",
            test: (c) => {
                const req = c.constraintDistribution.find((x) => x.kind === "required");
                return !!req && req.count > 0 && req.count < c.count;
            },
        },
        {
            id: "unused-in-views",
            label: "Не используется в views",
            icon: "visibility_off",
            test: (c) => c.usedInViewsCount === 0,
        },
        {
            id: "nested",
            label: "Вложенные",
            icon: "account_tree",
            test: (c) => c.hasNested,
        },
    ];

type SortBy =
    | "count-desc"
    | "name-asc"
    | "type-asc"
    | "inconsistent-first";

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
    { value: "count-desc", label: "По популярности" },
    { value: "inconsistent-first", label: "Сначала проблемные" },
    { value: "name-asc", label: "По имени" },
    { value: "type-asc", label: "По типу" },
];

function sortColumns(
    cols: AttributeMatrixColumn[],
    sortBy: SortBy,
): AttributeMatrixColumn[] {
    const arr = [...cols];
    switch (sortBy) {
        case "count-desc":
            return arr.sort((a, b) => b.count - a.count);
        case "name-asc":
            return arr.sort((a, b) => a.label.localeCompare(b.label));
        case "type-asc":
            return arr.sort((a, b) => {
                const ta = a.dominantType || "";
                const tb = b.dominantType || "";
                if (ta !== tb) return ta.localeCompare(tb);
                return b.count - a.count;
            });
        case "inconsistent-first":
            return arr.sort((a, b) => {
                if (a.consistentType === b.consistentType) return b.count - a.count;
                return a.consistentType ? 1 : -1;
            });
    }
}

type SelectedDetail =
    | { kind: "column"; columnKey: string }
    | { kind: "cell"; entityFqid: string; columnKey: string }
    | null;

// ============ Компонент ============

export function AttributeMatrixModal() {
    const { index, loading, error } = useModelIndex();
    const open = useGraphStore((s) => s.attributeMatrixOpen);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    const [domainFilter, setDomainFilter] = useState("");
    const [minOccurrences, setMinOccurrences] = useState(2);
    const [sortBy, setSortBy] = useState<SortBy>("count-desc");
    const [searchQuery, setSearchQuery] = useState("");
    const [quickFilters, setQuickFilters] = useState<Set<QuickFilter>>(
        new Set(),
    );
    const [filterByColumn, setFilterByColumn] = useState<string | null>(null);
    const [selectedDetail, setSelectedDetail] = useState<SelectedDetail>(null);
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [hoveredCol, setHoveredCol] = useState<number | null>(null);

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const matrix = useMemo(() => {
        if (!index) return null;
        return buildAttributeMatrix(index, {
            domains: domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined,
            minOccurrences,
            maxColumns: 40,
            maxRows: 100,
        });
    }, [index, domainFilter, minOccurrences]);

    // ── Фильтры ──
    const visibleColumns = useMemo(() => {
        if (!matrix) return [] as AttributeMatrixColumn[];
        let cols = matrix.columns;
        if (quickFilters.size > 0) {
            const tests = Array.from(quickFilters).map(
                (id) => QUICK_FILTERS.find((f) => f.id === id)!.test,
            );
            cols = cols.filter((c) => tests.every((t) => t(c)));
        }
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            const columnMatch = cols.filter(
                (c) =>
                    c.label.toLowerCase().includes(q) || c.key.includes(q),
            );
            if (columnMatch.length > 0) {
                cols = columnMatch;
            }
            // Если ни одна колонка не совпала — не сужаем (поиск идёт по строкам)
        }
        cols = sortColumns(cols, sortBy);
        return cols;
    }, [matrix, quickFilters, searchQuery, sortBy]);

    const visibleColumnKeys = useMemo(
        () => new Set(visibleColumns.map((c) => c.key)),
        [visibleColumns],
    );

    // ── Поиск: сущность ──
    const searchEntityMatch = useMemo(() => {
        if (!matrix || !searchQuery.trim()) return null;
        const q = searchQuery.trim().toLowerCase();
        for (const row of matrix.rows) {
            if (
                row.entityId.toLowerCase().includes(q) ||
                row.entityFqid.toLowerCase().includes(q)
            ) {
                return row.entityFqid;
            }
        }
        return null;
    }, [matrix, searchQuery]);

    const visibleRows = useMemo(() => {
        if (!matrix) return [];
        let rows = matrix.rows;

        if (filterByColumn) {
            rows = rows.filter((r) => r.present.has(filterByColumn));
        }

        // Если поиск точно совпал с entity — оставляем только её
        if (searchEntityMatch) {
            rows = rows.filter((r) => r.entityFqid === searchEntityMatch);
        }

        return rows;
    }, [matrix, filterByColumn, searchEntityMatch]);

    // ── Поиск: сущность не в матрице ──
    const searchNotInMatrix = useMemo(() => {
        if (!searchQuery.trim() || !matrix || !index) return null;
        if (searchEntityMatch) return null;
        const q = searchQuery.trim().toLowerCase();
        for (const e of index.entities) {
            if (
                e.entityId.toLowerCase().includes(q) ||
                e.fqid.toLowerCase().includes(q)
            ) {
                return e.fqid;
            }
        }
        return null;
    }, [searchQuery, matrix, index, searchEntityMatch]);

    const openEntity = useCallback((fqid: string) => {
        const st = useGraphStore.getState();
        st.setAttributeMatrixOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    }, []);

    const toggleQuickFilter = useCallback((id: QuickFilter) => {
        setQuickFilters((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleCellClick = useCallback(
        (entityFqid: string, columnKey: string) => {
            setSelectedDetail({ kind: "cell", entityFqid, columnKey });
        },
        [],
    );

    const handleColumnClick = useCallback((columnKey: string) => {
        setSelectedDetail({ kind: "column", columnKey });
    }, []);

    const resetAll = useCallback(() => {
        setSearchQuery("");
        setQuickFilters(new Set());
        setFilterByColumn(null);
        setSelectedDetail(null);
    }, []);

    // ── Экспорт ──
    const handleExportCSV = () => {
        if (!matrix) return;
        const header = [
            "entity_fqid",
            "entity_id",
            "domain",
            "attributes_count",
            ...visibleColumns.map((c) => c.label),
        ];
        const lines = [header.join(",")];
        for (const row of visibleRows) {
            const cellArr = visibleColumns.map((c) => {
                const cell = row.cells.get(c.key);
                if (!cell) return "";
                const parts = [cell.dataType];
                if (cell.constraints.length > 0) {
                    parts.push(cell.constraints.join("|"));
                }
                if (cell.readonly) parts.push("readonly");
                return parts.join(";");
            });
            lines.push(
                [
                    row.entityFqid,
                    row.entityId,
                    row.domainId,
                    row.attributesCount,
                    ...cellArr.map((s) => {
                        if (!s) return "";
                        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                    }),
                ].join(","),
            );
        }
        const blob = new Blob(["\uFEFF" + lines.join("\n")], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `attribute-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyMarkdown = async () => {
        if (!matrix) return;
        try {
            const lines: string[] = [];
            lines.push(`# Матрица атрибутов`);
            lines.push("");
            lines.push(
                `_Колонок: ${visibleColumns.length}, сущностей: ${visibleRows.length}_`,
            );
            lines.push("");
            const header = ["", ...visibleColumns.map((c) => c.label)];
            lines.push("| " + header.join(" | ") + " |");
            lines.push("|" + header.map(() => "---").join("|") + "|");
            for (const row of visibleRows) {
                const cells = visibleColumns.map((c) => {
                    const cell = row.cells.get(c.key);
                    return cell ? cell.dataType : "";
                });
                lines.push(
                    "| **" + row.entityId + "** | " + cells.join(" | ") + " |",
                );
            }
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore.getState().showSnackbar("Матрица скопирована в буфер");
        } catch (e: any) {
            await alertDialog("Не удалось скопировать", { detail: e.message });
        }
    };

    if (!open) return null;

    // ── Данные для detail panel ──
    const detailColumn: AttributeMatrixColumn | null = (() => {
        if (!selectedDetail || !matrix) return null;
        return matrix.columns.find((c) => c.key === selectedDetail.columnKey) || null;
    })();

    const detailCell: AttributeMatrixCell | null = (() => {
        if (!selectedDetail || selectedDetail.kind !== "cell" || !matrix) return null;
        const row = matrix.rows.find(
            (r) => r.entityFqid === selectedDetail.entityFqid,
        );
        return row?.cells.get(selectedDetail.columnKey) || null;
    })();

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() =>
                useGraphStore.getState().setAttributeMatrixOpen(false)
            }
        >
            <div
                className="help-modal attribute-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="grid_view" size="sm" />
                        <span className="icon-label">Матрица атрибутов</span>
                        {matrix && (
                            <span className="help-modal__badge">
                                {visibleRows.length} × {visibleColumns.length}
                            </span>
                        )}
                        {matrix && matrix.stats.inconsistentTypes.length > 0 && (
                            <span
                                className="help-modal__badge help-modal__badge--warn"
                                title="Атрибуты с разными dataType у разных сущностей"
                            >
                                ⚠ {matrix.stats.inconsistentTypes.length}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() =>
                                useGraphStore.getState().setAttributeMatrixOpen(false)
                            }
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

                {index && matrix && (
                    <div className="attribute-matrix-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Матрица «сущность × имя атрибута». Строки — сущности,
                                    столбцы — уникальные имена атрибутов (по{" "}
                                    <code>name</code>, если задано, иначе по <code>id</code>;
                                    сравнение регистронезависимое). Точка в ячейке — у
                                    сущности есть атрибут с таким именем.
                                </HelpText>
                                <HelpText>
                                    Главный сигнал — <strong>неконсистентность</strong>: атрибут
                                    с одинаковым именем встречается у разных сущностей с
                                    разными <code>dataType</code>. Это и есть источник багов
                                    совместимости.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Цвета ячеек">
                                <HelpList>
                                    {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
                                        <li key={cat}>
                                            <span
                                                className="attribute-matrix-color-dot"
                                                style={{ background: color }}
                                            />{" "}
                                            <strong>{CATEGORY_LABELS[cat] || cat}</strong>
                                        </li>
                                    ))}
                                </HelpList>
                                <HelpText>
                                    Цвет — категория <code>dataType</code>. <strong>Одинаковый
                                        цвет</strong> в столбце = консистентный тип.{" "}
                                    <strong>Разные цвета</strong> в одном столбце = проблема,
                                    видна сразу, без наведения.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Столбцы">
                                <HelpList>
                                    <li>
                                        <strong>Заголовок</strong> — имя атрибута + доминирующий
                                        тип (маленьким шрифтом) + счётчик{" "}
                                        <code>N/M</code> (у скольких сущностей из M есть атрибут).
                                    </li>
                                    <li>
                                        <strong>⚠ на заголовке</strong> — атрибут встречается с
                                        разными <code>dataType</code>. Главный сигнал матрицы.
                                    </li>
                                    <li>
                                        <strong>Клик по заголовку</strong> — детали: распределение
                                        типов, constraints, readonly, домены, использование в
                                        views. Кнопка «Только с этим атрибутом» — фильтр строк.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Строки">
                                <HelpList>
                                    <li>
                                        <strong>Имя сущности</strong> + домен + количество
                                        атрибутов. Клик — открыть в каталоге.
                                    </li>
                                    <li>
                                        Строки отсортированы по количеству атрибутов — «богатые»
                                        сущности сверху, у них больше шансов иметь общие атрибуты.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ячейки">
                                <HelpList>
                                    <li>
                                        <strong>Цвет</strong> — категория <code>dataType</code>{" "}
                                        (см. легенду выше).
                                    </li>
                                    <li>
                                        <strong>Точка</strong> — атрибут присутствует. Наведение
                                        показывает точный тип, constraints и readonly.
                                    </li>
                                    <li>
                                        <strong>Маркер ⚠</strong> — тип в этой сущности отличается
                                        от доминирующего в столбце.
                                    </li>
                                    <li>
                                        <strong>Клик</strong> — детали: конкретный{" "}
                                        <code>dataType</code>, constraints, readonly, используется
                                        ли в views, вложенный ли.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Quick filters">
                                <HelpText>
                                    Chips под поиском фильтруют столбцы. Работают по AND.
                                    Скрыты, если нет совпадений — не засоряют интерфейс.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>С разными типами</strong> — главный фильтр
                                        матрицы. Показывает только столбцы с неконсистентным{" "}
                                        <code>dataType</code>.
                                    </li>
                                    <li>
                                        <strong>Разный readonly</strong> — атрибут где-то
                                        read-only, где-то writable.
                                    </li>
                                    <li>
                                        <strong>Разный required</strong> — где-то обязательный,
                                        где-то нет.
                                    </li>
                                    <li>
                                        <strong>Не используется в views</strong> — «мёртвые»
                                        атрибуты: ни в одном виджете не отображаются.
                                    </li>
                                    <li>
                                        <strong>Вложенные</strong> — колонки таблиц (Table), они
                                        помечены отдельно.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Минимум упоминаний">
                                <HelpText>
                                    Числовое поле. Скрывает столбцы, встречающиеся меньше, чем
                                    у указанного числа сущностей.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>2 (по умолчанию)</strong> — синглтоны (одиночные
                                        атрибуты) скрыты. Иначе таблица забивается сотнями
                                        уникальных колонок.
                                    </li>
                                    <li>
                                        <strong>1</strong> — показать всё, включая опечатки.{" "}
                                        <code>emial</code> vs <code>email</code> — обе колонки
                                        будут видны, легко заметить проблему.
                                    </li>
                                    <li>
                                        <strong>5–10</strong> — только «паттерны модели»:
                                        <code>name</code>, <code>description</code>,{" "}
                                        <code>createdAt</code>.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Сортировка">
                                <HelpList>
                                    <li>
                                        <strong>По популярности</strong> — самые частые атрибуты
                                        слева.
                                    </li>
                                    <li>
                                        <strong>Сначала проблемные</strong> — неконсистентные
                                        типы вперёд.
                                    </li>
                                    <li>
                                        <strong>По имени</strong> — алфавитный порядок.
                                    </li>
                                    <li>
                                        <strong>По типу</strong> — сгруппировать по{" "}
                                        <code>dataType</code>.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Экспорт и копирование">
                                <HelpList>
                                    <li>
                                        <strong>CSV</strong> — матрица с типами, constraints и
                                        readonly. Фильтры применяются.
                                    </li>
                                    <li>
                                        <strong>MD</strong> — Markdown-таблица с типами в ячейках.
                                        Для отчётов и PR-описаний.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Колонки ограничены 40, строки — 100. Защита от тормозов
                                        на больших доменах.
                                    </li>
                                    <li>
                                        Вложенные атрибуты Table включаются в матрицу, но{" "}
                                        <code>usedInViews</code> для них почти всегда 0 —
                                        виджеты обычно ссылаются на верхнеуровневый Table, а не
                                        на колонки внутри.
                                    </li>
                                    <li>
                                        Сравнение по имени, не по семантике. Два разных{" "}
                                        <code>name</code> (в разных доменах) могут означать
                                        совершенно разное — это не проверяется.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {/* ============ Toolbar ============ */}
                        <div className="attribute-matrix-toolbar">
                            <div className="attribute-matrix-toolbar__filters">
                                <DomainCombobox
                                    value={domainFilter}
                                    onChange={setDomainFilter}
                                    domains={allDomains}
                                    placeholder="Все домены"
                                />

                                <label className="entity-matrix-filter">
                                    <span>Минимум:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={minOccurrences}
                                        onChange={(e) =>
                                            setMinOccurrences(
                                                Math.max(1, parseInt(e.target.value, 10) || 1),
                                            )
                                        }
                                        style={{ width: 60 }}
                                    />
                                </label>

                                <label className="entity-matrix-filter">
                                    <span>Сортировка:</span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                                    >
                                        {SORT_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="attribute-matrix-search">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        type="text"
                                        placeholder="Атрибут или сущность…"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        spellCheck={false}
                                    />
                                    {searchQuery && (
                                        <button
                                            className="attribute-matrix-search__clear"
                                            onClick={() => setSearchQuery("")}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <button
                                    className="btn"
                                    onClick={handleExportCSV}
                                    disabled={visibleColumns.length === 0}
                                    title="Скачать в CSV"
                                >
                                    <MIcon name="download" size="sm" />
                                    CSV
                                </button>
                                <button
                                    className="btn"
                                    onClick={handleCopyMarkdown}
                                    disabled={visibleColumns.length === 0}
                                    title="Копировать в Markdown"
                                >
                                    <MIcon name="content_copy" size="sm" />
                                    MD
                                </button>
                                {(searchQuery ||
                                    quickFilters.size > 0 ||
                                    filterByColumn) && (
                                        <button
                                            className="btn"
                                            onClick={resetAll}
                                            title="Сбросить все фильтры"
                                        >
                                            <MIcon name="filter_alt_off" size="sm" />
                                        </button>
                                    )}
                            </div>

                            <div className="attribute-matrix-quick-filters">
                                {QUICK_FILTERS.map((f) => {
                                    const active = quickFilters.has(f.id);
                                    const count = matrix.columns.filter(f.test).length;
                                    if (!active && count === 0) return null;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            className={
                                                "health-quick-filter" +
                                                (active ? " health-quick-filter--active" : "")
                                            }
                                            onClick={() => toggleQuickFilter(f.id)}
                                            title={`Показать только: ${f.label.toLowerCase()}`}
                                        >
                                            <MIcon name={f.icon} size="sm" />
                                            {f.label}
                                            <span className="health-quick-filter__count">
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                                {filterByColumn && (
                                    <button
                                        type="button"
                                        className="health-quick-filter health-quick-filter--active"
                                        onClick={() => setFilterByColumn(null)}
                                        title="Убрать фильтр по атрибуту"
                                    >
                                        <MIcon name="filter_alt" size="sm" />
                                        Только с «{filterByColumn}»
                                        <span className="health-quick-filter__count">✕</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ============ Search hints ============ */}
                        {searchNotInMatrix && (
                            <div className="attribute-matrix-search-hint">
                                <MIcon name="info" size="sm" />
                                <span>
                                    Сущность{" "}
                                    <code>{shortLabel(searchNotInMatrix)}</code> не попала
                                    в матрицу (топ-100 по количеству атрибутов).{" "}
                                    <button
                                        className="attribute-matrix-search-hint__btn"
                                        onClick={() => openEntity(searchNotInMatrix)}
                                    >
                                        Открыть в каталоге
                                    </button>
                                </span>
                            </div>
                        )}

                        {/* ============ Legend ============ */}
                        <div className="attribute-matrix-legend">
                            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => {
                                const count = visibleColumns.filter(
                                    (c) => categoryOf(c.dominantType || "") === cat,
                                ).length;
                                if (count === 0) return null;
                                return (
                                    <span
                                        key={cat}
                                        className="attribute-matrix-legend-item"
                                        title={CATEGORY_LABELS[cat]}
                                    >
                                        <span
                                            className="attribute-matrix-legend-dot"
                                            style={{ background: color }}
                                        />
                                        {cat}
                                        <span className="attribute-matrix-legend-count">
                                            {count}
                                        </span>
                                    </span>
                                );
                            })}
                            <span className="attribute-matrix-legend-spacer" />
                            {matrix.stats.requiredEverywhere > 0 && (
                                <span
                                    className="attribute-matrix-legend-item"
                                    title="Атрибуты, обязательные во всех сущностях"
                                >
                                    <MIcon name="star" size="sm" />
                                    Required везде
                                    <span className="attribute-matrix-legend-count">
                                        {matrix.stats.requiredEverywhere}
                                    </span>
                                </span>
                            )}
                            {matrix.stats.unusedInViews > 0 && (
                                <span
                                    className="attribute-matrix-legend-item attribute-matrix-legend-item--warn"
                                    title="Не используются ни в одном view"
                                >
                                    <MIcon name="visibility_off" size="sm" />
                                    Мёртвые
                                    <span className="attribute-matrix-legend-count">
                                        {matrix.stats.unusedInViews}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* ============ Матрица ============ */}
                        {visibleColumns.length === 0 ? (
                            <div className="attribute-matrix-empty">
                                {matrix.columns.length === 0
                                    ? "Нет атрибутов, удовлетворяющих фильтрам"
                                    : "Ни одна колонка не проходит фильтр"}
                                {matrix.stats.singletons.length > 0 && (
                                    <div className="attribute-matrix-empty-hint">
                                        Одиночных атрибутов (встречаются 1 раз):{" "}
                                        <strong>{matrix.stats.singletons.length}</strong>. Снизьте
                                        «Минимум» до 1, чтобы увидеть их.
                                    </div>
                                )}
                            </div>
                        ) : visibleRows.length === 0 ? (
                            <div className="attribute-matrix-empty">
                                {searchEntityMatch
                                    ? `Сущность ${shortLabel(searchEntityMatch)} не имеет ни одного из видимых атрибутов`
                                    : "Нет сущностей, удовлетворяющих фильтру"}
                            </div>
                        ) : (
                            <div className="attribute-matrix-scroll">
                                <table className="attribute-matrix-table">
                                    <thead>
                                        <tr>
                                            <th className="attribute-matrix-corner">
                                                <span className="attribute-matrix-corner__arrow">↘</span>
                                            </th>
                                            {visibleColumns.map((col, idx) => {
                                                const isHovered = hoveredCol === idx;
                                                const isSelected =
                                                    selectedDetail?.kind === "column" &&
                                                    selectedDetail.columnKey === col.key;
                                                const cat = categoryOf(col.dominantType || "");
                                                return (
                                                    <th
                                                        key={col.key}
                                                        className={
                                                            "attribute-matrix-col-head" +
                                                            (!col.consistentType ? " inconsistent" : "") +
                                                            (isHovered ? " highlighted" : "") +
                                                            (isSelected ? " selected" : "")
                                                        }
                                                        onMouseEnter={() => setHoveredCol(idx)}
                                                        onMouseLeave={() => setHoveredCol(null)}
                                                        onClick={() => handleColumnClick(col.key)}
                                                        title={
                                                            `${col.label} — у ${col.count} сущностей\n` +
                                                            `Доминирующий тип: ${col.dominantType || "—"}\n` +
                                                            (col.typeDistribution.length > 1
                                                                ? "Типы: " +
                                                                col.typeDistribution
                                                                    .map((t) => `${t.dataType} (${t.count})`)
                                                                    .join(", ")
                                                                : "")
                                                        }
                                                    >
                                                        <span className="attribute-matrix-col-head__text">
                                                            {col.label}
                                                        </span>
                                                        <span
                                                            className="attribute-matrix-col-head__type"
                                                            style={{ color: CATEGORY_COLORS[cat] }}
                                                        >
                                                            {col.dominantType || "—"}
                                                        </span>
                                                        <span className="attribute-matrix-col-head__count">
                                                            {col.count}
                                                        </span>
                                                        {!col.consistentType && (
                                                            <span
                                                                className="attribute-matrix-col-head__warn"
                                                                title={`${col.typeDistribution.length} разных типов`}
                                                            >
                                                                ⚠
                                                            </span>
                                                        )}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleRows.map((row, rowIdx) => {
                                            const isRowHovered = hoveredRow === rowIdx;
                                            return (
                                                <tr
                                                    key={row.entityFqid}
                                                    className={isRowHovered ? "highlighted" : ""}
                                                >
                                                    <th
                                                        className="attribute-matrix-row-head"
                                                        data-fqid={row.entityFqid}
                                                        onMouseEnter={() => setHoveredRow(rowIdx)}
                                                        onMouseLeave={() => setHoveredRow(null)}
                                                        onClick={() => openEntity(row.entityFqid)}
                                                        title={`${row.entityFqid}\nКлик — открыть в каталоге`}
                                                    >
                                                        <span className="attribute-matrix-row-head__id">
                                                            {row.entityId}
                                                        </span>
                                                        <span className="attribute-matrix-row-head__domain">
                                                            {row.domainId}
                                                        </span>
                                                        <span className="attribute-matrix-row-head__count">
                                                            {row.attributesCount} атр.
                                                        </span>
                                                    </th>
                                                    {visibleColumns.map((col, colIdx) => {
                                                        const cell = row.cells.get(col.key);
                                                        const isHoveredR = hoveredRow === rowIdx;
                                                        const isHoveredC = hoveredCol === colIdx;
                                                        const isSelected =
                                                            selectedDetail?.kind === "cell" &&
                                                            selectedDetail.entityFqid === row.entityFqid &&
                                                            selectedDetail.columnKey === col.key;

                                                        if (!cell) {
                                                            return (
                                                                <td
                                                                    key={col.key}
                                                                    className={
                                                                        "attribute-matrix-cell" +
                                                                        (isHoveredR || isHoveredC
                                                                            ? " in-row-col"
                                                                            : "")
                                                                    }
                                                                    onMouseEnter={() => {
                                                                        setHoveredRow(rowIdx);
                                                                        setHoveredCol(colIdx);
                                                                    }}
                                                                    onMouseLeave={() => {
                                                                        setHoveredRow(null);
                                                                        setHoveredCol(null);
                                                                    }}
                                                                />
                                                            );
                                                        }

                                                        const cat = categoryOf(cell.dataType);
                                                        const color = CATEGORY_COLORS[cat];
                                                        const isDiffFromDominant =
                                                            cell.dataType !== col.dominantType;

                                                        const parts: string[] = [cell.dataType];
                                                        if (cell.constraints.length > 0) {
                                                            parts.push(cell.constraints.join(", "));
                                                        }
                                                        if (cell.readonly) parts.push("readonly");
                                                        if (cell.isNested) parts.push("nested (Table)");
                                                        if (cell.usedInViews === 0) {
                                                            parts.push("не используется в views");
                                                        }
                                                        const tooltip =
                                                            `${row.entityId}.${cell.attributeId}\n` +
                                                            parts.join(" · ") +
                                                            (isDiffFromDominant
                                                                ? `\n\n⚠ тип отличается от доминирующего (${col.dominantType})`
                                                                : "");

                                                        return (
                                                            <td
                                                                key={col.key}
                                                                className={
                                                                    "attribute-matrix-cell attribute-matrix-cell--present" +
                                                                    (isHoveredR || isHoveredC
                                                                        ? " in-row-col"
                                                                        : "") +
                                                                    (isSelected ? " selected" : "") +
                                                                    (isDiffFromDominant
                                                                        ? " attribute-matrix-cell--mismatch"
                                                                        : "")
                                                                }
                                                                style={{
                                                                    background: color + "25",
                                                                    borderColor: color + "40",
                                                                }}
                                                                onMouseEnter={() => {
                                                                    setHoveredRow(rowIdx);
                                                                    setHoveredCol(colIdx);
                                                                }}
                                                                onMouseLeave={() => {
                                                                    setHoveredRow(null);
                                                                    setHoveredCol(null);
                                                                }}
                                                                onClick={() =>
                                                                    handleCellClick(row.entityFqid, col.key)
                                                                }
                                                                title={tooltip}
                                                            >
                                                                <span
                                                                    className="attribute-matrix-cell__dot"
                                                                    style={{ background: color }}
                                                                />
                                                                {cell.readonly && (
                                                                    <span
                                                                        className="attribute-matrix-cell__badge attribute-matrix-cell__badge--ro"
                                                                        title="readonly"
                                                                    >
                                                                        🔒
                                                                    </span>
                                                                )}
                                                                {cell.constraints.includes("required") && (
                                                                    <span
                                                                        className="attribute-matrix-cell__badge attribute-matrix-cell__badge--req"
                                                                        title="required"
                                                                    >
                                                                        ★
                                                                    </span>
                                                                )}
                                                                {isDiffFromDominant && (
                                                                    <span
                                                                        className="attribute-matrix-cell__mismatch"
                                                                        aria-hidden
                                                                    >
                                                                        !
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ============ Detail panel ============ */}
                        {selectedDetail && detailColumn && (
                            <div className="attribute-matrix-detail-panel">
                                <div className="attribute-matrix-detail-panel__head">
                                    <MIcon
                                        name={
                                            selectedDetail.kind === "column"
                                                ? "view_column"
                                                : "edit_note"
                                        }
                                        size="sm"
                                    />
                                    <code className="attribute-matrix-detail-panel__name">
                                        {detailColumn.label}
                                    </code>
                                    <span className="attribute-matrix-detail-panel__badge">
                                        {detailColumn.count}{" "}
                                        {detailColumn.count === 1 ? "сущность" : "сущностей"}
                                    </span>
                                    {detailColumn.hasNested && (
                                        <span className="attribute-matrix-detail-panel__badge">
                                            вложенный
                                        </span>
                                    )}
                                    <button
                                        className="btn"
                                        style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => {
                                            setFilterByColumn(detailColumn.key);
                                            setSelectedDetail(null);
                                        }}
                                        title="Показать только сущности с этим атрибутом"
                                    >
                                        <MIcon name="filter_alt" size="sm" />
                                        Только с этим атрибутом
                                    </button>
                                    <button
                                        className="attribute-matrix-detail-panel__close"
                                        onClick={() => setSelectedDetail(null)}
                                        title="Закрыть"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="attribute-matrix-detail-panel__body">
                                    {selectedDetail.kind === "cell" && detailCell ? (
                                        <>
                                            <div className="attribute-matrix-detail-panel__section-title">
                                                В сущности{" "}
                                                <button
                                                    className="attribute-matrix-detail-panel__entity-link"
                                                    onClick={() =>
                                                        openEntity(selectedDetail.entityFqid)
                                                    }
                                                >
                                                    {shortLabel(selectedDetail.entityFqid)}
                                                </button>
                                            </div>
                                            <div className="attribute-matrix-detail-grid">
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        dataType
                                                    </span>
                                                    <code>{detailCell.dataType}</code>
                                                    {detailCell.dataTypeKind === "custom" && (
                                                        <span className="attribute-matrix-detail-meta">
                                                            кастомный
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        constraints
                                                    </span>
                                                    {detailCell.constraints.length > 0 ? (
                                                        <code>{detailCell.constraints.join(", ")}</code>
                                                    ) : (
                                                        <span className="attribute-matrix-detail-meta">
                                                            нет
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        readonly
                                                    </span>
                                                    <span
                                                        className={
                                                            detailCell.readonly
                                                                ? "attribute-matrix-detail-badge attribute-matrix-detail-badge--warn"
                                                                : "attribute-matrix-detail-meta"
                                                        }
                                                    >
                                                        {detailCell.readonly ? "да" : "нет"}
                                                    </span>
                                                </div>
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        используется в views
                                                    </span>
                                                    <span
                                                        className={
                                                            detailCell.usedInViews === 0
                                                                ? "attribute-matrix-detail-badge attribute-matrix-detail-badge--warn"
                                                                : "attribute-matrix-detail-meta"
                                                        }
                                                    >
                                                        {detailCell.usedInViews}
                                                    </span>
                                                </div>
                                                {detailCell.isNested && (
                                                    <div className="attribute-matrix-detail-row">
                                                        <span className="attribute-matrix-detail-label">
                                                            вложенный
                                                        </span>
                                                        <span className="attribute-matrix-detail-badge">
                                                            внутри Table
                                                        </span>
                                                    </div>
                                                )}
                                                {detailCell.dataType !== detailColumn.dominantType && (
                                                    <div className="attribute-matrix-detail-row attribute-matrix-detail-row--warn">
                                                        <span className="attribute-matrix-detail-label">
                                                            ⚠ тип отличается
                                                        </span>
                                                        <span className="attribute-matrix-detail-meta">
                                                            доминирующий: {detailColumn.dominantType}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="attribute-matrix-detail-panel__section-title">
                                                Распределение по сущностям
                                            </div>
                                            <div className="attribute-matrix-detail-grid">
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        dataTypes
                                                    </span>
                                                    <span>
                                                        {detailColumn.typeDistribution.map((t) => (
                                                            <code
                                                                key={t.dataType}
                                                                className="attribute-matrix-detail-chip"
                                                                style={{
                                                                    borderColor:
                                                                        CATEGORY_COLORS[categoryOf(t.dataType)],
                                                                    color:
                                                                        CATEGORY_COLORS[categoryOf(t.dataType)],
                                                                }}
                                                            >
                                                                {t.dataType} × {t.count}
                                                            </code>
                                                        ))}
                                                    </span>
                                                </div>
                                                {detailColumn.constraintDistribution.length > 0 && (
                                                    <div className="attribute-matrix-detail-row">
                                                        <span className="attribute-matrix-detail-label">
                                                            constraints
                                                        </span>
                                                        <span>
                                                            {detailColumn.constraintDistribution.map((c) => (
                                                                <code
                                                                    key={c.kind}
                                                                    className="attribute-matrix-detail-chip"
                                                                >
                                                                    {c.kind} × {c.count}
                                                                </code>
                                                            ))}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        readonly
                                                    </span>
                                                    <span className="attribute-matrix-detail-meta">
                                                        {detailColumn.readonlyCount} / {detailColumn.count}
                                                    </span>
                                                </div>
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        используется в views
                                                    </span>
                                                    <span className="attribute-matrix-detail-meta">
                                                        {detailColumn.usedInViewsCount} /{" "}
                                                        {detailColumn.count}
                                                    </span>
                                                </div>
                                                <div className="attribute-matrix-detail-row">
                                                    <span className="attribute-matrix-detail-label">
                                                        домены
                                                    </span>
                                                    <span>
                                                        {detailColumn.domains.map((d) => (
                                                            <code
                                                                key={d}
                                                                className="attribute-matrix-detail-chip"
                                                            >
                                                                {d}
                                                            </code>
                                                        ))}
                                                    </span>
                                                </div>
                                            </div>
                                            {detailColumn.examples.length > 0 && (
                                                <>
                                                    <div className="attribute-matrix-detail-panel__section-title">
                                                        Примеры
                                                    </div>
                                                    <div className="attribute-matrix-detail-examples">
                                                        {detailColumn.examples.map((ex) => (
                                                            <button
                                                                key={ex.entityFqid + ex.attributeId}
                                                                className="attribute-matrix-detail-example"
                                                                onClick={() => openEntity(ex.entityFqid)}
                                                                title={ex.entityFqid}
                                                            >
                                                                <code>
                                                                    {shortLabel(ex.entityFqid)}.
                                                                    {ex.attributeId}
                                                                </code>
                                                                <span
                                                                    style={{
                                                                        color:
                                                                            CATEGORY_COLORS[
                                                                            categoryOf(ex.dataType)
                                                                            ],
                                                                    }}
                                                                >
                                                                    {ex.dataType}
                                                                </span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}