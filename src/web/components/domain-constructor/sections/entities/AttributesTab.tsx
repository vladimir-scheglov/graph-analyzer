import { useMemo, useRef, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import type { EntitySchema } from "../../types";
import {
    addAttribute,
    changeAttributeType,
    deleteAttribute,
    deleteAttributesBatch,
    duplicateAttribute,
    moveAttribute,
    renameAttribute,
    toggleRequired,
    updateAttributePath,
    validateDataId,
} from "./entity-handlers";
import { ALL_DATA_TYPES, attrRequired, suggestId, typeGroup } from "./entity-utils";
import { useInheritedAttributes } from "./use-inherited-attributes";
import { AttributeForm } from "./AttributeForm";
import { ImportAttributesModal } from "./ImportAttributesModal";
import { EmptyState, InlineText, TypeBadge } from "./ui";

export const AttributesTab: FC<{ entity: EntitySchema }> = ({ entity }) => {
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const isPublished = useEditorStore((s) => s.isPublished);
    const inherited = useInheritedAttributes(entity, modelIndex);

    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [importOpen, setImportOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
    const [flashId, setFlashId] = useState<string | null>(null);

    // quick-add
    const [qaName, setQaName] = useState("");
    const [qaType, setQaType] = useState("String");
    const qaRef = useRef<HTMLInputElement>(null);

    // drag
    const dragIndex = useRef<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);

    const selectedAttrId = selectionKey?.startsWith(`entity:${entity.id}/attribute:`)
        ? selectionKey.slice(`entity:${entity.id}/attribute:`.length)
        : null;

    const existingIds = useMemo(() => new Set(entity.attributes.map((a) => a.id)), [entity.attributes]);
    const usedTypes = useMemo(
        () => [...new Set(entity.attributes.map((a) => a.dataType))].sort(),
        [entity.attributes],
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return entity.attributes
            .map((attr, index) => ({ attr, index }))
            .filter(({ attr }) => {
                if (typeFilter && attr.dataType !== typeFilter) return false;
                if (!q) return true;
                return (
                    attr.id.toLowerCase().includes(q) ||
                    (attr.name ?? "").toLowerCase().includes(q) ||
                    attr.dataType.toLowerCase().includes(q)
                );
            });
    }, [entity.attributes, query, typeFilter]);

    const ownAttr = selectedAttrId ? entity.attributes.find((a) => a.id === selectedAttrId) ?? null : null;
    const inheritedAttr = selectedAttrId ? inherited.find((x) => x.attr.id === selectedAttrId) ?? null : null;

    const qaSuggestedId = qaName.trim() ? suggestId(qaName, "camel", existingIds) : "";

    const quickAdd = () => {
        const name = qaName.trim();
        if (!name || !qaSuggestedId) return;
        const id = qaSuggestedId;
        commit((doc) => addAttribute(doc, "entity", entity.id, { id, dataType: qaType, name }));
        setQaName("");
        setFlashId(id);
        window.setTimeout(() => setFlashId(null), 900);
        qaRef.current?.focus();
    };

    const toggleCheck = (id: string) => {
        setChecked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const allVisibleChecked = visible.length > 0 && visible.every(({ attr }) => checked.has(attr.id));

    const handleDrop = (to: number) => {
        const from = dragIndex.current;
        dragIndex.current = null;
        setDragOver(null);
        setDragging(null);
        if (from === null || from === to) return;
        commit((doc) => moveAttribute(doc, "entity", entity.id, from, to));
    };

    const requestDelete = (ids: string[]) => setPendingDelete(ids);

    const confirmDelete = () => {
        if (!pendingDelete) return;
        const ids = pendingDelete;
        commit((doc) => deleteAttributesBatch(doc, "entity", entity.id, ids));
        setChecked((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
        });
        if (selectedAttrId && ids.includes(selectedAttrId)) select(`entity:${entity.id}`);
        setPendingDelete(null);
    };

    const duplicateSelected = () => {
        const ids = [...checked];
        commit((doc) => ids.forEach((id) => duplicateAttribute(doc, "entity", entity.id, id)));
        setChecked(new Set());
    };

    return (
        <div>
            {/* ============ Toolbar / Bulk bar ============ */}
            {checked.size > 0 ? (
                <div className="ent-bulkbar">
                    <span className="ent-bulkbar__count">{checked.size} выбрано</span>
                    <button className="ent-btn ent-btn--sm" onClick={duplicateSelected}>⧉ Дублировать</button>
                    <button className="ent-btn ent-btn--danger ent-btn--sm" onClick={() => requestDelete([...checked])}>
                        × Удалить
                    </button>
                    <div className="ent-toolbar__spacer" />
                    <button className="ent-btn ent-btn--ghost ent-btn--sm" onClick={() => setChecked(new Set())}>
                        Снять выделение
                    </button>
                </div>
            ) : (
                <div className="ent-toolbar">
                    <div className="ent-search-wrap" style={{ width: 220 }}>
                        <input
                            className="ent-input ent-input--search"
                            placeholder="Поиск атрибута…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <select className="ent-select ent-select--inline" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="">Все типы</option>
                        {usedTypes.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <span className="ent-toolbar__meta">
                        {visible.length} из {entity.attributes.length}
                    </span>
                    <div className="ent-toolbar__spacer" />
                    <button className="ent-btn" onClick={() => setImportOpen(true)} title="Вставить таблицу из ТЗ, Excel, JSON или список названий">
                        ⇪ Вставить из буфера
                    </button>
                </div>
            )}

            {/* ============ Таблица ============ */}
            {entity.attributes.length === 0 && inherited.length === 0 ? (
                <EmptyState
                    icon="▦"
                    title="Атрибутов пока нет"
                    hint="Добавьте первый атрибут через строку быстрого добавления ниже или вставьте целый список полей из ТЗ — конструктор сам придумает ID и подберёт типы."
                    action={
                        <button className="ent-btn ent-btn--primary" onClick={() => setImportOpen(true)}>
                            ⇪ Вставить список полей
                        </button>
                    }
                />
            ) : null}

            <div className="ent-table-wrap ent-scroll">
                <table className="ent-table">
                    <thead>
                        <tr>
                            <th style={{ width: 30 }}>
                                <input
                                    type="checkbox"
                                    className="ent-check"
                                    checked={allVisibleChecked}
                                    onChange={() =>
                                        setChecked(allVisibleChecked ? new Set() : new Set(visible.map((v) => v.attr.id)))
                                    }
                                />
                            </th>
                            <th style={{ width: 26 }} />
                            <th>Название</th>
                            <th style={{ width: 170 }}>ID</th>
                            <th style={{ width: 150 }}>Тип</th>
                            <th style={{ width: 90 }}>Флаги</th>
                            <th style={{ width: 64 }}>Огр.</th>
                            <th style={{ width: 70 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map(({ attr, index }) => {
                            const isReq = attrRequired(attr);
                            const isSelected = attr.id === selectedAttrId;
                            const noReadonly = attr.dataType === "Counter" || attr.dataType === "Identifier";
                            return (
                                <tr
                                    key={attr.id}
                                    className={
                                        (isSelected ? "ent-row--selected " : "") +
                                        (checked.has(attr.id) ? "ent-row--checked " : "") +
                                        (dragOver === index ? "ent-row--dragover " : "") +
                                        (dragging === index ? "ent-row--dragging " : "") +
                                        (flashId === attr.id ? "ent-row--flash" : "")
                                    }
                                    onClick={() => select(`entity:${entity.id}/attribute:${attr.id}`)}
                                    onDragOver={(e) => {
                                        if (dragIndex.current === null) return;
                                        e.preventDefault();
                                        setDragOver(index);
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        handleDrop(index);
                                    }}
                                >
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="ent-check"
                                            checked={checked.has(attr.id)}
                                            onChange={() => toggleCheck(attr.id)}
                                        />
                                    </td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <span
                                            className="ent-drag"
                                            draggable
                                            title="Перетащить для изменения порядка"
                                            onDragStart={(e) => {
                                                dragIndex.current = index;
                                                setDragging(index);
                                                e.dataTransfer.effectAllowed = "move";
                                            }}
                                            onDragEnd={() => {
                                                dragIndex.current = null;
                                                setDragging(null);
                                                setDragOver(null);
                                            }}
                                        >
                                            ⋮⋮
                                        </span>
                                    </td>
                                    <td>
                                        <InlineText
                                            value={attr.name ?? ""}
                                            placeholder="—"
                                            onCommit={(v) =>
                                                commit((doc) => updateAttributePath(doc, "entity", entity.id, attr.id, ["name"], v))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <InlineText
                                            mono
                                            value={attr.id}
                                            validate={(v) => {
                                                const err = validateDataId(v);
                                                if (err) return err;
                                                if (v !== attr.id && existingIds.has(v)) return "ID уже используется";
                                                return null;
                                            }}
                                            onCommit={(v) =>
                                                commit((doc) => renameAttribute(doc, "entity", entity.id, attr.id, v))
                                            }
                                        />
                                    </td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <select
                                            className="ent-select"
                                            style={{ padding: "3px 6px", fontSize: 11.5 }}
                                            value={attr.dataType}
                                            onChange={(e) =>
                                                commit((doc) => changeAttributeType(doc, "entity", entity.id, attr.id, e.target.value))
                                            }
                                        >
                                            {!ALL_DATA_TYPES.includes(attr.dataType) && (
                                                <option value={attr.dataType}>{attr.dataType}</option>
                                            )}
                                            {ALL_DATA_TYPES.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            <button
                                                className={"ent-flagchip" + (isReq ? " ent-flagchip--on-req" : "")}
                                                title={isReq ? "Обязательное — снять" : "Сделать обязательным"}
                                                onClick={() => commit((doc) => toggleRequired(doc, "entity", entity.id, attr.id))}
                                            >
                                                REQ
                                            </button>
                                            <button
                                                className={"ent-flagchip" + (attr.readonly ? " ent-flagchip--on-ro" : "")}
                                                disabled={noReadonly}
                                                title={noReadonly ? "Неприменимо для этого типа" : attr.readonly ? "Только чтение — снять" : "Только для чтения"}
                                                onClick={() =>
                                                    commit((doc) =>
                                                        updateAttributePath(doc, "entity", entity.id, attr.id, ["readonly"], attr.readonly ? undefined : true),
                                                    )
                                                }
                                            >
                                                RO
                                            </button>
                                        </div>
                                    </td>
                                    <td>
                                        {(attr.constraints?.length ?? 0) > 0 ? (
                                            <span className="ent-pill ent-pill--accent">{attr.constraints!.length}</span>
                                        ) : (
                                            <span className="ent-hint">—</span>
                                        )}
                                    </td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <div className="ent-row-actions">
                                            <button
                                                className="ent-iconbtn"
                                                title="Дублировать"
                                                onClick={() => {
                                                    let newId: string | null = null;
                                                    commit((doc) => {
                                                        newId = duplicateAttribute(doc, "entity", entity.id, attr.id);
                                                    });
                                                    if (newId) {
                                                        setFlashId(newId);
                                                        window.setTimeout(() => setFlashId(null), 900);
                                                    }
                                                }}
                                            >
                                                ⧉
                                            </button>
                                            <button
                                                className="ent-iconbtn ent-iconbtn--danger"
                                                title="Удалить"
                                                onClick={() => requestDelete([attr.id])}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {/* ============ Quick-add строка ============ */}
                        <tr className="ent-quickadd">
                            <td />
                            <td style={{ color: "var(--ent-faint)" }}>+</td>
                            <td>
                                <input
                                    ref={qaRef}
                                    className="ent-inline"
                                    placeholder="Название нового атрибута… (Enter — добавить)"
                                    value={qaName}
                                    onChange={(e) => setQaName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") quickAdd();
                                        e.stopPropagation();
                                    }}
                                />
                            </td>
                            <td>
                                <span className="ent-quickadd__ghost">{qaSuggestedId || "auto-id"}</span>
                            </td>
                            <td>
                                <select
                                    className="ent-select"
                                    style={{ padding: "3px 6px", fontSize: 11.5 }}
                                    value={qaType}
                                    onChange={(e) => setQaType(e.target.value)}
                                >
                                    {ALL_DATA_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </td>
                            <td colSpan={3}>
                                <button
                                    className="ent-quickadd__plus"
                                    disabled={!qaName.trim()}
                                    onClick={quickAdd}
                                    title="Добавить атрибут"
                                >
                                    +
                                </button>
                            </td>
                        </tr>

                        {/* ============ Унаследованные ============ */}
                        {inherited.length > 0 && (
                            <>
                                <tr className="ent-grouprow">
                                    <td colSpan={8}>Унаследовано ({inherited.length}) — только чтение</td>
                                </tr>
                                {inherited
                                    .filter(({ attr }) => {
                                        const q = query.trim().toLowerCase();
                                        if (typeFilter && attr.dataType !== typeFilter) return false;
                                        if (!q) return true;
                                        return attr.id.toLowerCase().includes(q) || (attr.name ?? "").toLowerCase().includes(q);
                                    })
                                    .map(({ attr, from }) => (
                                        <tr
                                            key={attr.id}
                                            className={
                                                "ent-row--inherited " + (attr.id === selectedAttrId ? "ent-row--selected" : "")
                                            }
                                            onClick={() => select(`entity:${entity.id}/attribute:${attr.id}`)}
                                        >
                                            <td />
                                            <td style={{ color: "var(--ent-faint)" }}>🔒</td>
                                            <td style={{ padding: "6px 10px" }}>{attr.name || <span className="ent-hint">—</span>}</td>
                                            <td><span className="ent-inline ent-inline--mono" style={{ display: "inline-block" }}>{attr.id}</span></td>
                                            <td><TypeBadge type={attr.dataType} /></td>
                                            <td>
                                                <div style={{ display: "flex", gap: 4 }}>
                                                    {attrRequired(attr) && <span className="ent-flagchip ent-flagchip--on-req">REQ</span>}
                                                    {attr.readonly && <span className="ent-flagchip ent-flagchip--on-ro">RO</span>}
                                                </div>
                                            </td>
                                            <td>
                                                {(attr.constraints?.length ?? 0) > 0 && (
                                                    <span className="ent-pill">{attr.constraints!.length}</span>
                                                )}
                                            </td>
                                            <td><span className="ent-hint" title={`От: ${from}`}>{from.split("/").pop()}</span></td>
                                        </tr>
                                    ))}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ============ Detail панель ============ */}
            {ownAttr && (
                <AttributeForm
                    ownerType="entity"
                    ownerId={entity.id}
                    attribute={ownAttr}
                    mode="edit"
                />
            )}
            {inheritedAttr && (
                <AttributeForm
                    ownerType="entity"
                    ownerId={entity.id}
                    attribute={inheritedAttr.attr}
                    mode="inherited"
                    inheritedFrom={inheritedAttr.from}
                />
            )}

            <ImportAttributesModal
                open={importOpen}
                entityId={entity.id}
                existingIds={existingIds}
                onClose={() => setImportOpen(false)}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={
                    pendingDelete && pendingDelete.length > 1
                        ? `Удалить ${pendingDelete.length} атрибутов?`
                        : `Удалить атрибут «${pendingDelete?.[0]}»?`
                }
                description={
                    <p>
                        Ссылки на атрибуты в виджетах, правилах и фильтрах станут битыми.
                        Отменить можно через ↶ (Ctrl+Z).
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={confirmDelete}
            />
        </div>
    );
};