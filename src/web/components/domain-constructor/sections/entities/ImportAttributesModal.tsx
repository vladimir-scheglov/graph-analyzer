import { useMemo, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { addAttributesBatch, validateDataId } from "./entity-handlers";
import { ALL_DATA_TYPES, parseAttributesText, uniqueId, type DraftAttribute } from "./entity-utils";

interface Props {
    open: boolean;
    entityId: string;
    existingIds: Set<string>;
    onClose: () => void;
}

const FORMAT_LABELS: Record<string, string> = {
    json: "JSON",
    table: "Таблица (TSV / ;)",
    lines: "Список названий",
    empty: "—",
};

export const ImportAttributesModal: FC<Props> = ({ open, entityId, existingIds, onClose }) => {
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);
    const [text, setText] = useState("");
    const [rows, setRows] = useState<DraftAttribute[] | null>(null);

    const parsed = useMemo(() => parseAttributesText(text, existingIds), [text, existingIds]);
    const effectiveRows = rows ?? parsed.rows;

    const idErrors = useMemo(() => {
        const seen = new Set<string>();
        const errors = new Map<number, string>();
        effectiveRows.forEach((r, i) => {
            const err = validateDataId(r.id);
            if (err) errors.set(i, err);
            else if (existingIds.has(r.id)) errors.set(i, "Уже есть в сущности");
            else if (seen.has(r.id)) errors.set(i, "Дубликат в списке");
            seen.add(r.id);
        });
        return errors;
    }, [effectiveRows, existingIds]);

    if (!open) return null;

    const updateRow = (i: number, patch: Partial<DraftAttribute>) => {
        setRows(effectiveRows.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
    };

    const fixIds = () => {
        const used = new Set(existingIds);
        setRows(
            effectiveRows.map((r) => {
                const id = uniqueId(r.id, used);
                used.add(id);
                return { ...r, id };
            }),
        );
    };

    const handleImport = () => {
        if (idErrors.size > 0 || effectiveRows.length === 0) return;
        commit((doc) =>
            addAttributesBatch(
                doc,
                "entity",
                entityId,
                effectiveRows.map((r) => ({
                    id: r.id,
                    dataType: r.dataType,
                    name: r.name,
                    required: r.required,
                    readonly: r.readonly,
                })),
            ),
        );
        select(`entity:${entityId}/attribute:${effectiveRows[0].id}`);
        setText("");
        setRows(null);
        onClose();
    };

    const close = () => {
        setText("");
        setRows(null);
        onClose();
    };

    return (
        <div className="dc-modal-backdrop ent" onClick={close}>
            <div className="ent-modal ent-modal--wide ent-scroll" onClick={(e) => e.stopPropagation()}>
                <h3 className="ent-modal__title">Вставить атрибуты из буфера</h3>
                <div className="ent-hint" style={{ marginBottom: 10 }}>
                    Вставьте таблицу из Excel / Confluence / ТЗ (<code>Название; Тип; Обязательное</code>),
                    JSON-массив объектов или просто список названий полей — по одному на строку.
                    Русские типы распознаются: «строка», «дата», «число», «да/нет», «справочник»…
                </div>

                <textarea
                    className="ent-textarea"
                    style={{ minHeight: 120, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}
                    placeholder={"Название\tТип\tОбязательное\nIP-адрес\tip\tда\nДата обнаружения\tдата\nКритичность\tперечисление\tда"}
                    value={text}
                    autoFocus
                    onChange={(e) => {
                        setText(e.target.value);
                        setRows(null);
                    }}
                />

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <span className="ent-format-tag">Формат: {FORMAT_LABELS[parsed.format]}</span>
                    {parsed.error && <span className="ent-error">{parsed.error}</span>}
                    <div style={{ flex: 1 }} />
                    {effectiveRows.length > 0 && (
                        <span className="ent-toolbar__meta">Распознано полей: {effectiveRows.length}</span>
                    )}
                    {idErrors.size > 0 && (
                        <button className="ent-btn ent-btn--sm" onClick={fixIds}>
                            Исправить ID автоматически
                        </button>
                    )}
                </div>

                {effectiveRows.length > 0 && (
                    <div className="ent-import-preview ent-scroll">
                        <table className="ent-table">
                            <thead>
                                <tr>
                                    <th>Название</th>
                                    <th style={{ width: 160 }}>ID</th>
                                    <th style={{ width: 140 }}>Тип</th>
                                    <th style={{ width: 60 }}>REQ</th>
                                    <th style={{ width: 50 }}>RO</th>
                                    <th style={{ width: 36 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {effectiveRows.map((r, i) => (
                                    <tr key={i} style={{ cursor: "default" }}>
                                        <td>
                                            <input className="ent-inline" value={r.name} onChange={(e) => updateRow(i, { name: e.target.value })} />
                                        </td>
                                        <td>
                                            <input
                                                className={"ent-inline ent-inline--mono" + (idErrors.has(i) ? " ent-inline--error" : "")}
                                                value={r.id}
                                                title={idErrors.get(i)}
                                                onChange={(e) => updateRow(i, { id: e.target.value })}
                                            />
                                        </td>
                                        <td>
                                            <select className="ent-select" style={{ padding: "3px 6px", fontSize: 11.5 }} value={r.dataType} onChange={(e) => updateRow(i, { dataType: e.target.value })}>
                                                {ALL_DATA_TYPES.map((t) => (
                                                    <option key={t} value={t}>{t}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                            <input type="checkbox" className="ent-check" checked={r.required} onChange={(e) => updateRow(i, { required: e.target.checked })} />
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                            <input type="checkbox" className="ent-check" checked={r.readonly} onChange={(e) => updateRow(i, { readonly: e.target.checked })} />
                                        </td>
                                        <td>
                                            <button className="ent-iconbtn ent-iconbtn--danger" onClick={() => setRows(effectiveRows.filter((_, ri) => ri !== i))}>
                                                ×
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {idErrors.size > 0 && (
                    <div className="ent-banner">
                        Проблемы с ID: {idErrors.size}. Исправьте вручную или нажмите «Исправить ID автоматически».
                    </div>
                )}

                <div className="ent-modal__actions">
                    <button className="ent-btn" onClick={close}>Отмена</button>
                    <button
                        className="ent-btn ent-btn--primary"
                        disabled={effectiveRows.length === 0 || idErrors.size > 0}
                        onClick={handleImport}
                    >
                        Добавить {effectiveRows.length > 0 ? `${effectiveRows.length} атрибутов` : ""}
                    </button>
                </div>
            </div>
        </div>
    );
};