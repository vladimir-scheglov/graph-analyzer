import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { useMonacoLoader } from "../../hooks/useMonacoLoader";
import { MIcon } from "../common/MIcon";
import { computePublishDiff, PublishDiff } from "../../lib/model/publish-diff";
import { alertDialog, confirmDialog } from "../../lib/dialogs";

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

type DiffTab = "text" | "structure";

interface VersionMeta {
    id: string;
    expertiseId: string;
    version: string;
    sourceCode: string;
    updatedAt: string | null;
    updatedBy: string | null;
}

export interface SchemaHistoryModalProps {
    filePath: string | null;
    currentContent: string;
    mode: "local" | "hybrid" | "remote";
    onClose: () => void;
    onApply: (newContent: string) => void;
}

export function SchemaHistoryModal({
    filePath,
    currentContent,
    mode,
    onClose,
    onApply,
}: SchemaHistoryModalProps) {
    // ============ Данные ============
    const [versions, setVersions] = useState<VersionMeta[] | null>(null);
    const [totalCount, setTotalCount] = useState(0);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    // ============ Состояние загрузки ============
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    // ============ Пейджинг ============
    const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
    const [offset, setOffset] = useState(0);

    // ============ UI ============
    const [diffTab, setDiffTab] = useState<DiffTab>("text");

    // ============ Сброс пагинации при смене файла (state during render) ============
    // Модалка обычно не переоткрывается при смене файла (родитель держит
    // её открытой), но на всякий случай сбрасываем — иначе offset может
    // «выстрелить» за пределы новой истории.
    const [prevFilePath, setPrevFilePath] = useState(filePath);
    if (prevFilePath !== filePath) {
        setPrevFilePath(filePath);
        setVersions(null);
        setSelectedId(null);
        setOffset(0);
        setError(null);
        setTotalCount(0);
        setLoading(true);
    }

    // ============ Загрузка ============
    useEffect(() => {
        if (mode !== "remote" || !filePath) {
            setError(
                "История версий доступна только в удалённом режиме (--server, без локального каталога)",
            );
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
            path: filePath,
            limit: String(limit),
            offset: String(offset),
        });

        fetch("/api/expertise-versions?" + params.toString())
            .then(async (r) => {
                const data = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
                return data;
            })
            .then((data) => {
                if (cancelled) return;
                const list: VersionMeta[] = Array.isArray(data.versions)
                    ? data.versions
                    : [];
                const serverTotal =
                    typeof data.totalCount === "number" ? data.totalCount : list.length;

                // Защита: offset вне диапазона (например, версии удалили на сервере)
                if (list.length === 0 && offset > 0 && serverTotal > 0) {
                    const lastOffset = Math.max(
                        0,
                        Math.floor((serverTotal - 1) / limit) * limit,
                    );
                    if (lastOffset !== offset) {
                        setTotalCount(serverTotal);
                        setOffset(lastOffset);
                        return; // ждём refetch
                    }
                }

                setVersions(list);
                setTotalCount(serverTotal);
                setSelectedId((prev) => {
                    if (prev && list.some((v) => v.id === prev)) return prev;
                    return list[0]?.id ?? null;
                });
            })
            .catch((e: any) => {
                if (!cancelled) setError(e?.message || String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [filePath, mode, limit, offset, reloadKey]);

    // ============ Хэндлеры пейджинга ============
    const handleLimitChange = useCallback(
        (newLimit: number) => {
            if (newLimit === limit) return;
            setLimit(newLimit);
            setOffset(0);
        },
        [limit],
    );

    const handlePrevPage = useCallback(() => {
        setOffset((o) => Math.max(0, o - limit));
    }, [limit]);

    const handleNextPage = useCallback(() => {
        setOffset((o) => o + limit);
    }, [limit]);

    const handleRetry = useCallback(() => {
        setReloadKey((k) => k + 1);
    }, []);

    // ============ Производные ============
    const selected = useMemo(
        () => versions?.find((v) => v.id === selectedId) || null,
        [versions, selectedId],
    );

    const showFullLoading = loading && versions === null;
    const showFullError = !loading && !!error;
    const showBody = versions !== null && !showFullError;

    const pageStart = totalCount > 0 ? offset + 1 : 0;
    const pageEnd = Math.min(offset + limit, totalCount);
    const canPrev = offset > 0 && !loading;
    const canNext = offset + limit < totalCount && !loading;

    // ============ Структурный diff ============
    const structuralDiff: PublishDiff | null = useMemo(() => {
        if (!selected || !selected.sourceCode) return null;
        try {
            return computePublishDiff(currentContent, selected.sourceCode);
        } catch {
            return null;
        }
    }, [selected, currentContent]);

    // ============ Text diff ============
    const { ready: monacoReady } = useMonacoLoader();
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const diffEditorRef = useRef<any>(null);

    useEffect(() => {
        if (diffTab !== "text") return;
        if (!monacoReady || !diffContainerRef.current) return;
        if (!selected || !selected.sourceCode) return;
        const w = window as any;
        const m = w.monaco;
        if (!m) return;

        const originalModel = m.editor.createModel(selected.sourceCode, "yaml");
        const modifiedModel = m.editor.createModel(currentContent, "yaml");
        const theme =
            document.documentElement.getAttribute("data-theme") === "light"
                ? "dg-light"
                : "dg-dark";

        const editor = m.editor.createDiffEditor(diffContainerRef.current, {
            readOnly: true,
            automaticLayout: true,
            renderSideBySide: true,
            originalEditable: false,
            ignoreTrimWhitespace: false,
            theme,
        });
        editor.setModel({ original: originalModel, modified: modifiedModel });
        diffEditorRef.current = editor;

        return () => {
            try { editor.dispose(); } catch { /* ignore */ }
            try { originalModel.dispose(); } catch { /* ignore */ }
            try { modifiedModel.dispose(); } catch { /* ignore */ }
            diffEditorRef.current = null;
        };
    }, [monacoReady, selected, currentContent, diffTab]);

    // ============ Применить ============
    const handleApply = useCallback(async () => {
        if (!selected) return;
        if (!selected.sourceCode) {
            await alertDialog("Содержимое версии недоступно", {
                variant: "warning",
                title: "Замена невозможна",
                detail:
                    "Сервер вернул пустой sourceCode для этой версии.\n\n" +
                    "Возможные причины:\n" +
                    "  • у вашей учётной записи нет прав на просмотр исторических версий;\n" +
                    "  • сервер не отдаёт sourceCode в запросе expertiseVersions.\n\n" +
                    "В этом случае просмотр метаданных доступен, но замена содержимого — нет.",
            });
            return;
        }

        const ok = await confirmDialog(
            `Заменить текущее содержимое версией ${selected.version}?`,
            {
                detail:
                    "Несохранённые правки в редакторе будут потеряны.\n\n" +
                    "Действие можно отменить через Ctrl+Z в редакторе.",
                danger: true,
                confirmLabel: "Заменить",
                cancelLabel: "Остаться",
            },
        );
        if (!ok) return;

        onApply(selected.sourceCode);
        onClose();
    }, [selected, onApply, onClose]);

    // ============ Esc ============
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopImmediatePropagation();
                onClose();
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [onClose]);

    return createPortal(
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 600 }}
            onMouseDown={onClose}
        >
            <div
                className="help-modal schema-history-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="history" size="sm" />
                        <span className="icon-label">История версий схемы</span>
                        {filePath && (
                            <span className="help-modal__badge">
                                {filePath.split(/[\\/]/).pop()}
                            </span>
                        )}
                        {versions !== null && totalCount > 0 && (
                            <span className="help-modal__badge">
                                {totalCount} {totalCount === 1 ? "версия" : "версий"}
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                {/* ============ FULL LOADING (первый запрос) ============ */}
                {showFullLoading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка истории версий…</div>
                    </div>
                )}

                {/* ============ FULL ERROR ============ */}
                {showFullError && (
                    <div className="help-modal__body">
                        <div className="schema-history-empty">
                            <MIcon
                                name="error"
                                size="xl"
                                style={{ color: "var(--danger)" }}
                            />
                            <div className="schema-history-empty__title">
                                Не удалось загрузить историю
                            </div>
                            <div className="schema-history-empty__hint">{error}</div>
                            {mode === "remote" && filePath && (
                                <button
                                    className="btn"
                                    style={{ marginTop: 16 }}
                                    onClick={handleRetry}
                                >
                                    Повторить
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ============ EMPTY ============ */}
                {showBody && versions!.length === 0 && (
                    <div className="help-modal__body">
                        <div className="schema-history-empty">
                            <MIcon name="history_toggle_off" size="xl" />
                            <div className="schema-history-empty__title">
                                Опубликованных версий пока нет
                            </div>
                            <div className="schema-history-empty__hint">
                                История появится после первой публикации схемы на сервере.
                            </div>
                        </div>
                    </div>
                )}

                {/* ============ BODY ============ */}
                {showBody && versions!.length > 0 && (
                    <div className="schema-history-body">
                        {/* ============ Sidebar ============ */}
                        <div className="schema-history-sidebar">
                            <div className="schema-history-sidebar__title">
                                <span>Версии</span>
                                {loading && (
                                    <span className="schema-history-sidebar__spinner">
                                        <MIcon name="hourglass_top" size="sm" />
                                    </span>
                                )}
                            </div>

                            <div
                                className={
                                    "schema-history-list" +
                                    (loading ? " schema-history-list--loading" : "")
                                }
                            >
                                {versions!.map((v) => (
                                    <button
                                        key={v.id}
                                        className={
                                            "schema-history-item" +
                                            (v.id === selectedId ? " schema-history-item--active" : "")
                                        }
                                        onClick={() => setSelectedId(v.id)}
                                        disabled={loading}
                                        title={v.id}
                                    >
                                        <div className="schema-history-item__version">
                                            v{v.version}
                                        </div>
                                        <div className="schema-history-item__meta">
                                            {v.updatedAt
                                                ? new Date(v.updatedAt).toLocaleString("ru-RU", {
                                                    day: "2-digit",
                                                    month: "2-digit",
                                                    year: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })
                                                : "—"}
                                        </div>
                                        {v.updatedBy && v.updatedBy !== "—" && (
                                            <div className="schema-history-item__author">
                                                {v.updatedBy}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* ============ Пейджинг ============ */}
                            <div className="schema-history-pagination">
                                <div className="schema-history-pagination__size">
                                    <span>Показывать:</span>
                                    <select
                                        value={limit}
                                        onChange={(e) =>
                                            handleLimitChange(parseInt(e.target.value, 10))
                                        }
                                        disabled={loading}
                                        title="Сколько версий загружать за один запрос"
                                    >
                                        {PAGE_SIZE_OPTIONS.map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="schema-history-pagination__nav">
                                    <button
                                        type="button"
                                        className="schema-history-pagination__btn"
                                        onClick={handlePrevPage}
                                        disabled={!canPrev}
                                        title="Предыдущая страница"
                                    >
                                        <MIcon name="chevron_left" size="sm" />
                                    </button>
                                    <span className="schema-history-pagination__range">
                                        {pageStart}–{pageEnd} из {totalCount}
                                    </span>
                                    <button
                                        type="button"
                                        className="schema-history-pagination__btn"
                                        onClick={handleNextPage}
                                        disabled={!canNext}
                                        title="Следующая страница"
                                    >
                                        <MIcon name="chevron_right" size="sm" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ============ Content ============ */}
                        <div className="schema-history-content">
                            {selected && (
                                <>
                                    <div className="schema-history-toolbar">
                                        <div className="schema-history-toolbar__info">
                                            <strong>v{selected.version}</strong>
                                            {selected.updatedAt && (
                                                <span>
                                                    {new Date(selected.updatedAt).toLocaleString("ru-RU")}
                                                </span>
                                            )}
                                            {selected.updatedBy && selected.updatedBy !== "—" && (
                                                <span>· {selected.updatedBy}</span>
                                            )}
                                        </div>
                                        <div className="schema-history-tabs">
                                            <button
                                                className={
                                                    "schema-history-tab" +
                                                    (diffTab === "text" ? " active" : "")
                                                }
                                                onClick={() => setDiffTab("text")}
                                            >
                                                Текстовый diff
                                            </button>
                                            <button
                                                className={
                                                    "schema-history-tab" +
                                                    (diffTab === "structure" ? " active" : "")
                                                }
                                                onClick={() => setDiffTab("structure")}
                                            >
                                                Структурный diff
                                            </button>
                                        </div>
                                    </div>

                                    {!selected.sourceCode && (
                                        <div className="schema-history-warning">
                                            <MIcon name="warning" size="sm" />
                                            <div>
                                                Содержимое версии недоступно (пустой sourceCode).
                                                Возможно, у вашей учётной записи нет прав на просмотр
                                                исторических версий. Замена содержимого заблокирована.
                                            </div>
                                        </div>
                                    )}

                                    {selected.sourceCode && diffTab === "text" && (
                                        <div
                                            className="schema-history-diff"
                                            ref={diffContainerRef}
                                        />
                                    )}

                                    {selected.sourceCode && diffTab === "structure" && (
                                        <div className="schema-history-structure">
                                            {!structuralDiff ? (
                                                <div className="schema-history-empty">
                                                    Не удалось вычислить структурный diff (YAML не
                                                    парсится)
                                                </div>
                                            ) : structuralDiff.addedEntities.length === 0 &&
                                                structuralDiff.removedEntities.length === 0 &&
                                                structuralDiff.changedEntities.length === 0 ? (
                                                <div className="schema-history-empty">
                                                    <MIcon name="check_circle" size="xl" />
                                                    <div className="schema-history-empty__title">
                                                        Структурно совпадает
                                                    </div>
                                                    <div className="schema-history-empty__hint">
                                                        Текущая схема структурно не отличается от версии{" "}
                                                        {selected.version}. Различия могут быть только в
                                                        комментариях, форматировании или метаданных.
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    {structuralDiff.addedEntities.length > 0 && (
                                                        <div className="schema-history-group schema-history-group--added">
                                                            <div className="schema-history-group__title">
                                                                🟢 Появится в текущем после замены на v
                                                                {selected.version} (
                                                                {structuralDiff.addedEntities.length})
                                                            </div>
                                                            {structuralDiff.addedEntities.map((e) => (
                                                                <div key={e.id} className="schema-history-row">
                                                                    <code>{e.id}</code>
                                                                    {e.name !== e.id && <span>{e.name}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {structuralDiff.removedEntities.length > 0 && (
                                                        <div className="schema-history-group schema-history-group--removed">
                                                            <div className="schema-history-group__title">
                                                                🔴 Исчезнет из текущего после замены на v
                                                                {selected.version} (
                                                                {structuralDiff.removedEntities.length})
                                                            </div>
                                                            {structuralDiff.removedEntities.map((e) => (
                                                                <div key={e.id} className="schema-history-row">
                                                                    <code>{e.id}</code>
                                                                    {e.name !== e.id && <span>{e.name}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {structuralDiff.changedEntities.length > 0 && (
                                                        <div className="schema-history-group schema-history-group--changed">
                                                            <div className="schema-history-group__title">
                                                                🟡 Изменено (
                                                                {structuralDiff.changedEntities.length})
                                                            </div>
                                                            {structuralDiff.changedEntities.map((e) => (
                                                                <div
                                                                    key={e.id}
                                                                    className="schema-history-row schema-history-row--changed"
                                                                >
                                                                    <div>
                                                                        <code>{e.id}</code>
                                                                        {e.name !== e.id && (
                                                                            <span> · {e.name}</span>
                                                                        )}
                                                                    </div>
                                                                    {e.attributes.map((a) => (
                                                                        <div
                                                                            key={a.id}
                                                                            className="schema-history-attr"
                                                                        >
                                                                            {a.kind === "added" && (
                                                                                <span
                                                                                    style={{ color: "var(--success)" }}
                                                                                >
                                                                                    + {a.id} ({a.typeB})
                                                                                </span>
                                                                            )}
                                                                            {a.kind === "removed" && (
                                                                                <span
                                                                                    style={{ color: "var(--danger)" }}
                                                                                >
                                                                                    − {a.id} ({a.typeA})
                                                                                </span>
                                                                            )}
                                                                            {a.kind === "changed" && (
                                                                                <span
                                                                                    style={{ color: "var(--warning)" }}
                                                                                >
                                                                                    ~ {a.id}: {a.typeA} → {a.typeB}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div className="help-modal__footer schema-history-footer">
                    <div className="schema-history-footer__hint">
                        Замена содержимого — локальная. Не забудьте сохранить или
                        опубликовать, чтобы применить.
                    </div>
                    <div className="schema-history-footer__actions">
                        <button className="btn" onClick={onClose}>
                            Закрыть
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={handleApply}
                            disabled={!selected || !selected.sourceCode || loading}
                            title={
                                !selected
                                    ? "Выберите версию"
                                    : !selected.sourceCode
                                        ? "Содержимое версии недоступно — замена невозможна"
                                        : loading
                                            ? "Дождитесь окончания загрузки"
                                            : `Заменить текущее содержимое версией ${selected.version}`
                            }
                        >
                            <MIcon name="restore" size="sm" />
                            Заменить текущее содержимое
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}