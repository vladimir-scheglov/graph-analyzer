import React, { useCallback, useMemo, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import {
    buildEntityMatrix,
    shortLabel,
    MatrixCellKind,
    MatrixCellDetail,
} from "../../lib/model/entity-matrix";
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

const MATRIX_LIMIT = 60;

type Direction = "out" | "in";
type SortBy = "id" | "outgoing" | "incoming" | "total";

interface SelectedCell {
    rowFqid: string;
    colFqid: string;
    cell: { kind: MatrixCellKind; count: number; details: MatrixCellDetail[] };
}

export function EntityMatrixModal() {
    const { index, loading, error } = useModelIndex();
    const [showHelp, setShowHelp] = useState(false);

    const [domainFilter, setDomainFilter] = useState<string>("");
    const [direction, setDirection] = useState<Direction>("out");
    const [sortBy, setSortBy] = useState<SortBy>("total");
    const [hoveredRow, setHoveredRow] = useState<number | null>(null);
    const [hoveredCol, setHoveredCol] = useState<number | null>(null);
    const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    const open = useGraphStore((s) => s.entityMatrixOpen);

    useHelpEscape(open, showHelp, setShowHelp);

    const allDomains = useMemo(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const matrix = useMemo(() => {
        if (!index) return null;
        const domains = domainFilter
            ? new Set([domainFilter.toLowerCase()])
            : undefined;
        return buildEntityMatrix(index, { domains, limit: MATRIX_LIMIT });
    }, [index, domainFilter]);

    // ── Сортировка строк/столбцов ──
    const orderedFqids = useMemo(() => {
        if (!matrix) return [];
        const list = matrix.rows.map((r) => r.entity.fqid);
        if (sortBy === "id") {
            return list.slice().sort((a, b) =>
                shortLabel(a).localeCompare(shortLabel(b)),
            );
        }
        const map = new Map(matrix.rows.map((r) => [r.entity.fqid, r]));
        return list.slice().sort((a, b) => {
            const ra = map.get(a)!;
            const rb = map.get(b)!;
            const va =
                sortBy === "outgoing"
                    ? ra.totalOutgoingAll
                    : sortBy === "incoming"
                        ? ra.totalIncomingAll
                        : ra.totalOutgoingAll + ra.totalIncomingAll;
            const vb =
                sortBy === "outgoing"
                    ? rb.totalOutgoingAll
                    : sortBy === "incoming"
                        ? rb.totalIncomingAll
                        : rb.totalOutgoingAll + rb.totalIncomingAll;
            if (va !== vb) return vb - va;
            return a.localeCompare(b);
        });
    }, [matrix, sortBy]);

    const rowByFqid = useMemo(() => {
        if (!matrix) return new Map();
        return new Map(matrix.rows.map((r) => [r.entity.fqid, r]));
    }, [matrix]);

    // ── Поиск ──
    const searchMatch = useMemo(() => {
        if (!searchQuery.trim() || !matrix) return null;
        const q = searchQuery.trim().toLowerCase();
        for (const row of matrix.rows) {
            if (row.entity.fqid.toLowerCase().includes(q)) {
                return row.entity.fqid;
            }
        }
        return null;
    }, [searchQuery, matrix]);

    const searchNotInMatrix = useMemo(() => {
        if (!searchQuery.trim() || !matrix) return null;
        if (searchMatch) return null;
        const q = searchQuery.trim().toLowerCase();
        for (const e of index?.entities || []) {
            if (e.fqid.toLowerCase().includes(q)) return e.fqid;
        }
        return null;
    }, [searchQuery, matrix, index, searchMatch]);

    const scrollToEntity = useCallback((fqid: string) => {
        const el = document.querySelector(
            `.entity-matrix-row-head[data-fqid="${CSS.escape(fqid)}"]`,
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, []);

    const openEntity = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityMatrixOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    // ── Экспорт CSV ──
    const handleExportCSV = () => {
        if (!matrix) return;
        const header = [
            "row_id",
            ...orderedFqids.map((f) => shortLabel(f)),
            "total_out",
            "total_in",
        ];
        const lines = [header.join(",")];
        for (const rowFqid of orderedFqids) {
            const row = rowByFqid.get(rowFqid)!;
            const cells = direction === "out" ? row.cellsOut : row.cellsIn;
            const cellsArr = orderedFqids.map((colFqid) => {
                const cell = cells.get(colFqid);
                return cell ? String(cell.count) : "";
            });
            lines.push(
                [
                    shortLabel(rowFqid),
                    ...cellsArr,
                    row.totalOutgoingAll,
                    row.totalIncomingAll,
                ].join(","),
            );
        }
        const blob = new Blob(["\uFEFF" + lines.join("\n")], {
            type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeDomain = (domainFilter || "all-domains").replace(
            /[^a-z0-9.-]/gi,
            "_",
        );
        a.download = `matrix-${safeDomain}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCopyMarkdown = async () => {
        if (!matrix) return;
        try {
            const lines: string[] = [];
            lines.push(`# Матрица связей${domainFilter ? ` (${domainFilter})` : ""}`);
            lines.push("");
            lines.push(
                `_Сущностей: ${matrix.stats.totalEntities}, связей в матрице: ${matrix.stats.totalLinksInMatrix}_`,
            );
            lines.push("");
            const header = ["", ...orderedFqids.map((f) => shortLabel(f))];
            lines.push("| " + header.join(" | ") + " |");
            lines.push("|" + header.map(() => "---").join("|") + "|");
            for (const rowFqid of orderedFqids) {
                const row = rowByFqid.get(rowFqid)!;
                const cells = direction === "out" ? row.cellsOut : row.cellsIn;
                const cellsArr = orderedFqids.map((colFqid) => {
                    const cell = cells.get(colFqid);
                    return cell ? String(cell.count) : "";
                });
                lines.push(
                    "| **" + shortLabel(rowFqid) + "** | " + cellsArr.join(" | ") + " |",
                );
            }
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore.getState().showSnackbar("Матрица скопирована в буфер");
        } catch (e: any) {
            await alertDialog("Не удалось скопировать", { detail: e.message });
        }
    };

    const handleCellClick = useCallback(
        (rowFqid: string, colFqid: string, cell: any) => {
            setSelectedCell({ rowFqid, colFqid, cell });
        },
        [],
    );

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() =>
                useGraphStore.getState().setEntityMatrixOpen(false)
            }
        >
            <div
                className="help-modal entity-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="calculate" size="sm" />
                        <span className="icon-label">Матрица связей сущностей</span>
                        {matrix && (
                            <span className="help-modal__badge">
                                {matrix.stats.totalEntities} × {matrix.stats.totalEntities}
                            </span>
                        )}
                        {matrix && matrix.stats.truncated > 0 && (
                            <span
                                className="help-modal__badge"
                                title={`В домене ${matrix.stats.totalAvailableEntities} сущностей, показаны топ-${MATRIX_LIMIT} по связям`}
                            >
                                +{matrix.stats.truncated} скрыто
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
                            onClick={() => useGraphStore.getState().setEntityMatrixOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: "var(--danger)" }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && matrix && (
                    <div className="entity-matrix-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Что это">
                                <HelpText>
                                    Квадратная матрица «сущность × сущность». Ячейка
                                    [row, col] = связи, идущие от row к col. Плотные блоки —
                                    кластеры сущностей, которые активно общаются между собой.
                                </HelpText>
                                <HelpText>
                                    Хорошо видно «диагональное» поведение: A связана с B,
                                    B с C, но не A с C — кластеры выделяются структурно. На
                                    графе это заметить сложнее.
                                </HelpText>
                            </HelpSection>

                            <HelpSection title="Направление">
                                <HelpList>
                                    <li>
                                        <strong>Исходящие</strong> — ячейка [A, B] = связь от
                                        A к B. Reference-атрибут, inherits,
                                        linkage (направленная с side1 на A).
                                    </li>
                                    <li>
                                        <strong>Входящие</strong> — матрица транспонируется:
                                        ячейка [A, B] = «кто-то B ссылается на A». Полезно,
                                        чтобы увидеть, кто использует сущность.
                                    </li>
                                    <li>
                                        Переключение направления не меняет отбор сущностей —
                                        это одна и та же матрица, транспонированная.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Цвета и типы связей">
                                <HelpList>
                                    <li>
                                        <strong style={{ color: "#a78bfa" }}>Фиолетовый</strong> —
                                        наследование (inherits). Ячейка [A, B] = A наследует
                                        B.
                                    </li>
                                    <li>
                                        <strong style={{ color: "#6366f1" }}>Синий</strong> —
                                        Reference-атрибут. Ячейка [A, B] = у A есть атрибут
                                        типа Reference/Array&lt;Reference&gt; на B.
                                    </li>
                                    <li>
                                        <strong style={{ color: "#10b981" }}>Зелёный</strong> —
                                        linkage. Направленная: [A, B] = A стоит на side1
                                        связи, B на side2.
                                    </li>
                                    <li>
                                        <strong>Смешанная</strong> (несколько цветов) — если
                                        между A и B есть связи разных типов, ячейка
                                        окрашивается по старшинству: reference → inheritance
                                        → linkage.
                                    </li>
                                    <li>
                                        <strong>Число</strong> в ячейке — количество связей
                                        (не типов). Клик — детали: список всех связей между
                                        A и B.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Столбцы итогов">
                                <HelpList>
                                    <li>
                                        <strong>Out</strong> — сколько исходящих связей у
                                        сущности всего (включая те, что ведут к сущностям
                                        вне матрицы).
                                    </li>
                                    <li>
                                        <strong>In</strong> — сколько входящих связей (кто
                                        ссылается на эту сущность).
                                    </li>
                                    <li>
                                        <strong>Tot</strong> — сумма Out + In.
                                    </li>
                                    <li>
                                        Если у сущности большие Out/In, но мало ячеек в
                                        матрице — её связи ведут к сущностям, которые не
                                        попали в топ-{MATRIX_LIMIT}. Расширьте фильтр или
                                        откройте сущность в каталоге.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Отбор сущностей">
                                <HelpText>
                                    В матрицу попадают топ-{MATRIX_LIMIT} сущностей по сумме
                                    входящих и исходящих связей. Это защита от тормозов на
                                    больших доменах: матрица 200×200 бесполезна и не
                                    влезает в экран.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        «+N скрыто» в шапке — сколько сущностей не влезло.
                                    </li>
                                    <li>
                                        Фильтр по домену сужает выборку — для конкретного
                                        домена 20 сущностей все они попадут в матрицу.
                                    </li>
                                    <li>
                                        Сортировка по Out/In/Tot влияет на порядок строк и
                                        столбцов — «самые связанные» оказываются в левом
                                        верхнем углу.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Быстрые действия">
                                <HelpList>
                                    <li>
                                        <strong>Клик по заголовку</strong> — открыть сущность
                                        в каталоге.
                                    </li>
                                    <li>
                                        <strong>Клик по ячейке</strong> — детальная панель со
                                        списком всех связей между двумя сущностями (какой
                                        атрибут, какая linkage, с каким типом).
                                    </li>
                                    <li>
                                        <strong>Наведение</strong> — подсветка всей строки и
                                        столбца, tooltip с кратким списком.
                                    </li>
                                    <li>
                                        <strong>CSV / Markdown</strong> — экспорт матрицы в
                                        текущем направлении и сортировке.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Что не показано">
                                <HelpList>
                                    <li>
                                        <strong>Self-связи</strong> (Task → Task) не
                                        отображаются в матрице — они видны на графе и в
                                        Impact Analysis.
                                    </li>
                                    <li>
                                        <strong>Вложенные Reference в Table-атрибутах</strong>{" "}
                                        учитываются только как атрибут верхнего уровня.
                                    </li>
                                    <li>
                                        <strong>projection</strong> и{" "}
                                        <strong>externals.entities</strong> не считаются
                                        связями — это неявные зависимости рантайма.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        {/* ============ Toolbar ============ */}
                        <div className="entity-matrix-toolbar">
                            <div className="entity-matrix-toolbar__filters">
                                <label className="entity-matrix-filter">
                                    <span>Домен:</span>
                                    <select
                                        value={domainFilter}
                                        onChange={(e) => {
                                            setDomainFilter(e.target.value);
                                            setSelectedCell(null);
                                        }}
                                    >
                                        <option value="">— все —</option>
                                        {allDomains.map(([d, count]) => (
                                            <option key={d} value={d}>
                                                {d} ({count})
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="entity-matrix-direction">
                                    <button
                                        className={
                                            "entity-matrix-dir-btn" +
                                            (direction === "out" ? " active" : "")
                                        }
                                        onClick={() => setDirection("out")}
                                        title="Показать исходящие связи (A → B)"
                                    >
                                        <MIcon name="arrow_forward" size="sm" />
                                        Исходящие
                                    </button>
                                    <button
                                        className={
                                            "entity-matrix-dir-btn" +
                                            (direction === "in" ? " active" : "")
                                        }
                                        onClick={() => setDirection("in")}
                                        title="Показать входящие связи (B → A)"
                                    >
                                        <MIcon name="arrow_back" size="sm" />
                                        Входящие
                                    </button>
                                </div>

                                <label className="entity-matrix-filter">
                                    <span>Сортировка:</span>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                                    >
                                        <option value="total">По сумме связей</option>
                                        <option value="outgoing">По исходящим</option>
                                        <option value="incoming">По входящим</option>
                                        <option value="id">По имени</option>
                                    </select>
                                </label>

                                <div className="entity-matrix-search">
                                    <MIcon name="search" size="sm" />
                                    <input
                                        type="text"
                                        placeholder="Найти сущность..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchQuery && (
                                        <button
                                            className="entity-matrix-search__clear"
                                            onClick={() => setSearchQuery("")}
                                        >
                                            ✕
                                        </button>
                                    )}
                                    {searchMatch && (
                                        <button
                                            className="entity-matrix-search__jump"
                                            onClick={() => scrollToEntity(searchMatch)}
                                            title="Перейти к сущности"
                                        >
                                            ↴
                                        </button>
                                    )}
                                </div>

                                <button
                                    className="btn"
                                    onClick={handleExportCSV}
                                    title="Скачать матрицу в CSV"
                                >
                                    <MIcon name="download" size="sm" />
                                    CSV
                                </button>
                                <button
                                    className="btn"
                                    onClick={handleCopyMarkdown}
                                    title="Скопировать в Markdown"
                                >
                                    <MIcon name="content_copy" size="sm" />
                                    MD
                                </button>
                            </div>
                        </div>

                        {/* ============ Search hints ============ */}
                        {searchNotInMatrix && (
                            <div className="entity-matrix-search-hint">
                                <MIcon name="info" size="sm" />
                                <span>
                                    Сущность{" "}
                                    <code>{shortLabel(searchNotInMatrix)}</code> не попала
                                    в матрицу (топ-{MATRIX_LIMIT} по связям).{" "}
                                    <button
                                        className="entity-matrix-search-hint__btn"
                                        onClick={() => openEntity(searchNotInMatrix)}
                                    >
                                        Открыть в каталоге
                                    </button>
                                </span>
                            </div>
                        )}

                        {/* ============ Легенда ============ */}
                        <div className="entity-matrix-toolbar__legend">
                            <span className="entity-matrix-legend-item">
                                <span className="entity-matrix-legend-cell entity-matrix-legend-cell--reference" />
                                Reference ({matrix.stats.byKind.reference})
                            </span>
                            <span className="entity-matrix-legend-item">
                                <span className="entity-matrix-legend-cell entity-matrix-legend-cell--inheritance" />
                                Наследование ({matrix.stats.byKind.inheritance})
                            </span>
                            <span className="entity-matrix-legend-item">
                                <span className="entity-matrix-legend-cell entity-matrix-legend-cell--linkage" />
                                Linkage ({matrix.stats.byKind.linkage})
                            </span>
                            <span className="entity-matrix-toolbar__total">
                                {matrix.stats.totalLinksInMatrix} связей в матрице
                                {matrix.stats.totalLinksOutOfScope > 0 && (
                                    <>
                                        {" · "}
                                        <span
                                            title="Связи ведут к сущностям вне топ-N (скрыты)"
                                            style={{ color: "var(--text-500)" }}
                                        >
                                            {matrix.stats.totalLinksOutOfScope} вне матрицы
                                        </span>
                                    </>
                                )}
                            </span>
                        </div>

                        {/* ============ Матрица ============ */}
                        {orderedFqids.length === 0 ? (
                            <div className="entity-matrix-empty">
                                Нет данных для отображения
                            </div>
                        ) : (
                            <div className="entity-matrix-scroll">
                                <table className="entity-matrix-table">
                                    <thead>
                                        <tr>
                                            <th className="entity-matrix-corner">
                                                <span className="entity-matrix-corner__arrow">↘</span>
                                            </th>
                                            {orderedFqids.map((fqid, idx) => {
                                                const e = rowByFqid.get(fqid)!.entity;
                                                const isHovered = hoveredCol === idx;
                                                const isSearchMatch = searchMatch === fqid;
                                                return (
                                                    <th
                                                        key={fqid}
                                                        className={
                                                            "entity-matrix-col-head" +
                                                            (isHovered ? " highlighted" : "") +
                                                            (isSearchMatch ? " search-match" : "")
                                                        }
                                                        onMouseEnter={() => setHoveredCol(idx)}
                                                        onMouseLeave={() => setHoveredCol(null)}
                                                        onClick={() => openEntity(fqid)}
                                                        title={`${e.fqid}\nКлик — открыть в каталоге`}
                                                    >
                                                        <span className="entity-matrix-col-head__text">
                                                            {shortLabel(fqid)}
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                            <th className="entity-matrix-totals-head" title="Исходящие всего">
                                                Out
                                            </th>
                                            <th className="entity-matrix-totals-head" title="Входящие всего">
                                                In
                                            </th>
                                            <th className="entity-matrix-totals-head" title="Сумма">
                                                Tot
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderedFqids.map((rowFqid, rowIdx) => {
                                            const row = rowByFqid.get(rowFqid)!;
                                            const isRowHovered = hoveredRow === rowIdx;
                                            const isSearchMatch = searchMatch === rowFqid;
                                            const cells =
                                                direction === "out" ? row.cellsOut : row.cellsIn;

                                            return (
                                                <tr
                                                    key={rowFqid}
                                                    className={
                                                        (isRowHovered ? "highlighted" : "") +
                                                        (isSearchMatch ? " search-match" : "")
                                                    }
                                                >
                                                    <th
                                                        className="entity-matrix-row-head"
                                                        data-fqid={rowFqid}
                                                        onMouseEnter={() => setHoveredRow(rowIdx)}
                                                        onMouseLeave={() => setHoveredRow(null)}
                                                        onClick={() => openEntity(rowFqid)}
                                                        title={`${row.entity.fqid}\nКлик — открыть в каталоге`}
                                                    >
                                                        <span className="entity-matrix-row-head__text">
                                                            {shortLabel(rowFqid)}
                                                        </span>
                                                    </th>

                                                    {orderedFqids.map((colFqid, colIdx) => {
                                                        const cell = cells.get(colFqid);
                                                        const isHoveredRow = hoveredRow === rowIdx;
                                                        const isHoveredCol = hoveredCol === colIdx;
                                                        const isSelf = rowFqid === colFqid;

                                                        if (!cell) {
                                                            return (
                                                                <td
                                                                    key={colFqid}
                                                                    className={
                                                                        "entity-matrix-cell entity-matrix-cell--empty" +
                                                                        (isSelf ? " entity-matrix-cell--self" : "") +
                                                                        (isHoveredRow || isHoveredCol
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

                                                        const kindClass =
                                                            "entity-matrix-cell--" + cell.kind;
                                                        const isMixed =
                                                            new Set(cell.details.map((d) => d.kind)).size >
                                                            1;
                                                        const tooltip =
                                                            shortLabel(rowFqid) +
                                                            " → " +
                                                            shortLabel(colFqid) +
                                                            "\n" +
                                                            cell.details
                                                                .slice(0, 8)
                                                                .map(
                                                                    (d) =>
                                                                        `· ${d.kind}: ${d.label}${d.linkageType ? ` (${d.linkageType})` : ""}`,
                                                                )
                                                                .join("\n") +
                                                            (cell.details.length > 8
                                                                ? `\n…и ещё ${cell.details.length - 8}`
                                                                : "") +
                                                            "\n\nКлик — детали";

                                                        return (
                                                            <td
                                                                key={colFqid}
                                                                className={
                                                                    "entity-matrix-cell " +
                                                                    kindClass +
                                                                    (isMixed
                                                                        ? " entity-matrix-cell--mixed"
                                                                        : "") +
                                                                    (isHoveredRow || isHoveredCol
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
                                                                onClick={() =>
                                                                    handleCellClick(rowFqid, colFqid, cell)
                                                                }
                                                                title={tooltip}
                                                            >
                                                                <span className="entity-matrix-cell__count">
                                                                    {cell.count}
                                                                </span>
                                                            </td>
                                                        );
                                                    })}

                                                    <td
                                                        className={
                                                            "entity-matrix-total-cell" +
                                                            (isRowHovered ? " highlighted" : "")
                                                        }
                                                        title={
                                                            row.totalOutgoingAll >
                                                                row.totalOutgoingInMatrix
                                                                ? `${row.totalOutgoingInMatrix} в матрице, ${row.totalOutgoingAll - row.totalOutgoingInMatrix} вне`
                                                                : undefined
                                                        }
                                                    >
                                                        {row.totalOutgoingAll}
                                                    </td>
                                                    <td
                                                        className={
                                                            "entity-matrix-total-cell" +
                                                            (isRowHovered ? " highlighted" : "")
                                                        }
                                                        title={
                                                            row.totalIncomingAll >
                                                                row.totalIncomingInMatrix
                                                                ? `${row.totalIncomingInMatrix} в матрице, ${row.totalIncomingAll - row.totalIncomingInMatrix} вне`
                                                                : undefined
                                                        }
                                                    >
                                                        {row.totalIncomingAll}
                                                    </td>
                                                    <td
                                                        className={
                                                            "entity-matrix-total-cell entity-matrix-total-cell--sum" +
                                                            (isRowHovered ? " highlighted" : "")
                                                        }
                                                    >
                                                        {row.totalOutgoingAll + row.totalIncomingAll}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* ============ Детали клика ============ */}
                        {selectedCell && (
                            <div className="entity-matrix-detail-panel">
                                <div className="entity-matrix-detail-panel__head">
                                    <button
                                        className="entity-matrix-detail-panel__entity"
                                        onClick={() => openEntity(selectedCell.rowFqid)}
                                    >
                                        {shortLabel(selectedCell.rowFqid)}
                                    </button>
                                    <MIcon name="arrow_forward" size="sm" />
                                    <button
                                        className="entity-matrix-detail-panel__entity"
                                        onClick={() => openEntity(selectedCell.colFqid)}
                                    >
                                        {shortLabel(selectedCell.colFqid)}
                                    </button>
                                    <span className="entity-matrix-detail-panel__count">
                                        {selectedCell.cell.count}{" "}
                                        {selectedCell.cell.count === 1 ? "связь" : "связей"}
                                    </span>
                                    <button
                                        className="entity-matrix-detail-panel__close"
                                        onClick={() => setSelectedCell(null)}
                                        title="Закрыть"
                                    >
                                        ✕
                                    </button>
                                </div>
                                <div className="entity-matrix-detail-panel__body">
                                    {selectedCell.cell.details.map((d, i) => (
                                        <div
                                            key={`${d.kind}:${d.via}:${i}`}
                                            className="entity-matrix-detail-row"
                                        >
                                            <span
                                                className={
                                                    "entity-matrix-detail-kind entity-matrix-detail-kind--" +
                                                    d.kind
                                                }
                                            >
                                                {d.kind === "reference"
                                                    ? "reference"
                                                    : d.kind === "inheritance"
                                                        ? "inherits"
                                                        : "linkage"}
                                            </span>
                                            <code>{d.label}</code>
                                            {d.linkageType && (
                                                <span className="entity-matrix-detail-meta">
                                                    {d.linkageType}
                                                    {d.undirected && " ↔"}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}