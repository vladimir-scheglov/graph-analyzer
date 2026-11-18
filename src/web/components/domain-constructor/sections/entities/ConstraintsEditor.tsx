import { type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import {
    addConstraint,
    removeConstraint,
    updateConstraintField,
} from "./entity-handlers";
import { getAvailableConstraints } from "../../model/compat-tables";
import type { AttributeDataType, Constraint } from "../../types";
import { InlineText } from "./ui";

interface Props {
    ownerType: "entity" | "linkage";
    ownerId: string;
    attributeId: string;
    dataType: AttributeDataType;
    constraints: Constraint[];
    target?: "attribute" | "item";
    disabled?: boolean;
    title?: string;
}

const KIND_LABELS: Record<string, string> = {
    required: "Обязательное",
    range: "Диапазон",
    length: "Длина",
    regexp: "Regexp",
    size: "Размер файла",
    mime_types: "MIME-типы",
    unique: "Уникальное значение",
};

const KIND_HINTS: Record<string, string> = {
    required: "Значение не может быть пустым",
    range: "Границы числового значения",
    length: "Количество символов / элементов",
    regexp: "Шаблон регулярного выражения",
    size: "Например: 1kB, 4MB",
    mime_types: "Через запятую: application/pdf, image/png",
    unique: "Значения уникальны среди объектов",
};

export const ConstraintsEditor: FC<Props> = ({
    ownerType, ownerId, attributeId, dataType, constraints,
    target = "attribute", disabled = false, title = "Ограничения",
}) => {
    const commit = useEditorStore((s) => s.commit);
    const available = getAvailableConstraints(dataType);
    const used = new Set(constraints.map((c) => c.kind));
    const addable = available.filter((k) => !used.has(k));

    const update = (index: number, field: string, value: unknown) =>
        commit((doc) =>
            updateConstraintField(doc, ownerType, ownerId, attributeId, index, field, value, target),
        );

    return (
        <div style={{ marginTop: 14 }}>
            <div className="ent-formsec__head">
                <h4 className="ent-formsec__title" style={{ fontSize: 12 }}>
                    {title} {constraints.length > 0 && <span className="ent-pill ent-pill--accent">{constraints.length}</span>}
                </h4>
            </div>

            {!disabled && addable.length > 0 && (
                <div className="ent-chips" style={{ marginBottom: 4 }}>
                    {addable.map((k) => (
                        <button
                            key={k}
                            className="ent-chip ent-chip--click"
                            style={{ border: "1px dashed var(--ent-border-strong)", cursor: "pointer", background: "transparent" }}
                            title={KIND_HINTS[k]}
                            onClick={() =>
                                commit((doc) => addConstraint(doc, ownerType, ownerId, attributeId, k, target))
                            }
                        >
                            + {KIND_LABELS[k] ?? k}
                        </button>
                    ))}
                </div>
            )}

            {constraints.length === 0 && (
                <div className="ent-hint">Нет ограничений. Добавьте чипами выше.</div>
            )}

            {constraints.map((c, idx) => {
                const isAvailable = available.includes(c.kind as any);
                const isSize = c.kind === "size";
                const hasMinMax = c.kind === "range" || c.kind === "length" || isSize;
                let regexpValid = true;
                if (c.kind === "regexp" && c.regexp) {
                    try {
                        new RegExp(c.regexp);
                    } catch {
                        regexpValid = false;
                    }
                }
                return (
                    <div key={idx} className={"ent-constraint" + (!isAvailable ? " ent-constraint--invalid" : "")}>
                        <div className="ent-constraint__head">
                            <span className="ent-constraint__kind">{KIND_LABELS[c.kind] ?? c.kind}</span>
                            {!isAvailable && (
                                <span className="ent-pill ent-pill--warn">несовместимо с {dataType}</span>
                            )}
                            <span className="ent-hint">{KIND_HINTS[c.kind]}</span>
                            <div style={{ flex: 1 }} />
                            {!disabled && (
                                <button
                                    className="ent-iconbtn ent-iconbtn--danger"
                                    onClick={() =>
                                        commit((doc) => removeConstraint(doc, ownerType, ownerId, attributeId, idx, target))
                                    }
                                >
                                    ×
                                </button>
                            )}
                        </div>

                        {hasMinMax && (
                            <div className="ent-constraint__grid">
                                <div className="ent-field">
                                    <label className="ent-label">min</label>
                                    <InlineText
                                        value={String(c.min ?? "")}
                                        disabled={disabled}
                                        validate={(v) => {
                                            if (!v) return null;
                                            if (isSize) return null;
                                            return isNaN(Number(v)) ? "Число" : null;
                                        }}
                                        onCommit={(v) => update(idx, "min", v === "" ? undefined : isSize ? v : Number(v))}
                                        placeholder={isSize ? "1kB" : "0"}
                                    />
                                </div>
                                <div className="ent-field">
                                    <label className="ent-label">max</label>
                                    <InlineText
                                        value={String(c.max ?? "")}
                                        disabled={disabled}
                                        validate={(v) => {
                                            if (!v) return null;
                                            if (isSize) return null;
                                            return isNaN(Number(v)) ? "Число" : null;
                                        }}
                                        onCommit={(v) => update(idx, "max", v === "" ? undefined : isSize ? v : Number(v))}
                                        placeholder={isSize ? "4MB" : "∞"}
                                    />
                                </div>
                            </div>
                        )}

                        {c.kind === "regexp" && (
                            <div className="ent-field">
                                <label className="ent-label">
                                    Регулярное выражение {!regexpValid && <span style={{ color: "var(--ent-danger)" }}>— невалидное</span>}
                                </label>
                                <InlineText
                                    mono
                                    value={c.regexp ?? ""}
                                    disabled={disabled}
                                    onCommit={(v) => update(idx, "regexp", v)}
                                    placeholder="^[A-Za-z0-9]+$"
                                />
                            </div>
                        )}

                        {c.kind === "mime_types" && (
                            <div className="ent-field">
                                <label className="ent-label">MIME-типы (через запятую)</label>
                                <InlineText
                                    value={(c.mimeTypes ?? []).join(", ")}
                                    disabled={disabled}
                                    onCommit={(v) =>
                                        update(idx, "mimeTypes", v.split(",").map((s) => s.trim()).filter(Boolean))
                                    }
                                    placeholder="application/pdf, image/png"
                                />
                            </div>
                        )}

                        <div className="ent-field" style={{ marginTop: 8 }}>
                            <label className="ent-label">Сообщение об ошибке</label>
                            <InlineText
                                value={c.message ?? ""}
                                disabled={disabled}
                                onCommit={(v) => update(idx, "message", v)}
                                placeholder="Текст ошибки для пользователя"
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};