import { useMemo, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { EntitySelect } from "../../ui/EntitySelect";
import { SequenceSelect } from "../../ui/SequenceSelect";
import { ConstraintsEditor } from "./ConstraintsEditor";
import {
    addPrefixRule,
    changeAttributeType,
    deleteAttribute,
    duplicateAttribute,
    movePrefixRule,
    removePrefixRule,
    setSegment,
    updateAttributePath,
    updatePrefixRuleField,
    validateDataId,
} from "./entity-handlers";
import { ALL_DATA_TYPES, ARRAY_ITEM_TYPES } from "./entity-utils";
import type { AttributeSchema } from "../../types";
import { FormSection, InlineText, Switch, TypeBadge } from "./ui";

interface Props {
    ownerType: "entity" | "linkage";
    ownerId: string;
    attribute: AttributeSchema;
    mode: "edit" | "inherited";
    inheritedFrom?: string;
    hideReadonly?: boolean;
}

export const AttributeForm: FC<Props> = ({
    ownerType, ownerId, attribute, mode, inheritedFrom, hideReadonly,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);
    const schema = useEditorStore((s) => s.schema);
    const isPublished = useEditorStore((s) => s.isPublished);
    const isInherited = mode === "inherited";
    const disabled = isInherited;

    const setField = (path: readonly (string | number)[], value: unknown) => {
        if (isInherited) return;
        commit((doc) => updateAttributePath(doc, ownerType, ownerId, attribute.id, path, value));
    };

    const onOverride = () => {
        if (!isInherited || ownerType !== "entity") return;
        commit((doc) => {
            const entities = doc.get(["entities"]) as any[];
            const eIdx = (entities ?? []).findIndex((e) => e?.id === ownerId);
            if (eIdx < 0) return;
            const attrs = (doc.get(["entities", eIdx, "attributes"]) as any[]) ?? [];
            const copy = JSON.parse(JSON.stringify(attribute));
            delete copy.path;
            doc.set(["entities", eIdx, "attributes", attrs.length], copy);
        });
        select(`entity:${ownerId}/attribute:${attribute.id}`);
    };

    const noReadonly =
        hideReadonly || attribute.dataType === "Counter" || attribute.dataType === "Identifier";

    return (
        <div className="ent-detail">
            <div className="ent-detail__head">
                <TypeBadge type={attribute.dataType} />
                <span className="ent-detail__id">{attribute.id}</span>
                <span className="ent-detail__name">{attribute.name}</span>
                {isInherited && (
                    <>
                        <span className="ent-pill">🔒 от {inheritedFrom?.split("/").pop()}</span>
                        {ownerType === "entity" && (
                            <button className="ent-btn ent-btn--primary ent-btn--sm" onClick={onOverride}>
                                ↙ Переопределить
                            </button>
                        )}
                    </>
                )}
                {!isInherited && (
                    <>
                        <button
                            className="ent-btn ent-btn--sm"
                            onClick={() => {
                                let newId: string | null = null;
                                commit((doc) => {
                                    newId = duplicateAttribute(doc, ownerType, ownerId, attribute.id);
                                });
                                if (newId) select(`${ownerType}:${ownerId}/attribute:${newId}`);
                            }}
                        >
                            ⧉
                        </button>
                        <button
                            className="ent-btn ent-btn--danger ent-btn--sm"
                            onClick={() => commit((doc) => deleteAttribute(doc, ownerType, ownerId, attribute.id))}
                        >
                            ×
                        </button>
                    </>
                )}
            </div>

            <div className="ent-detail__body">
                <FormSection title="Основное">
                    <div className="ent-grid">
                        <div className="ent-field">
                            <label className="ent-label">Название</label>
                            <InlineText value={attribute.name ?? ""} disabled={disabled} onCommit={(v) => setField(["name"], v)} placeholder="Отображаемое имя" />
                        </div>
                        <div className="ent-field">
                            <label className="ent-label">Тип данных</label>
                            <select
                                className="ent-select"
                                value={attribute.dataType}
                                disabled={disabled}
                                onChange={(e) =>
                                    commit((doc) => changeAttributeType(doc, ownerType, ownerId, attribute.id, e.target.value))
                                }
                            >
                                {!ALL_DATA_TYPES.includes(attribute.dataType) && (
                                    <option value={attribute.dataType}>{attribute.dataType} (пользовательский)</option>
                                )}
                                {ALL_DATA_TYPES.map((t) => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                        <div className="ent-field ent-field--full">
                            <label className="ent-label">Описание</label>
                            <InlineText value={attribute.description ?? ""} disabled={disabled} onCommit={(v) => setField(["description"], v)} placeholder="Видно только в схеме" />
                        </div>
                        {!noReadonly && (
                            <div className="ent-field ent-field--full">
                                <Switch
                                    checked={!!attribute.readonly}
                                    disabled={disabled}
                                    onChange={(v) => setField(["readonly"], v ? true : undefined)}
                                    label="Только для чтения — значение задаётся при создании и не обновляется"
                                />
                            </div>
                        )}
                    </div>
                </FormSection>

                {attribute.dataType === "Reference" && (
                    <FormSection title="Связанная сущность">
                        <EntitySelect
                            value={attribute.entity ?? null}
                            onChange={(fqid) => setField(["entity"], fqid ?? undefined)}
                            disabled={disabled}
                            placeholder="— выберите сущность —"
                        />
                    </FormSection>
                )}

                {attribute.dataType === "Array" && (
                    <FormSection title="Элемент массива">
                        <div className="ent-grid">
                            <div className="ent-field">
                                <label className="ent-label">Тип элемента</label>
                                <select
                                    className="ent-select"
                                    value={attribute.item?.dataType ?? "String"}
                                    disabled={disabled}
                                    onChange={(e) => setField(["item", "dataType"], e.target.value)}
                                >
                                    {ARRAY_ITEM_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            {attribute.item?.dataType === "Reference" && (
                                <div className="ent-field">
                                    <label className="ent-label">Сущность элемента</label>
                                    <EntitySelect
                                        value={attribute.item?.entity ?? null}
                                        onChange={(fqid) => setField(["item", "entity"], fqid ?? undefined)}
                                        disabled={disabled}
                                    />
                                </div>
                            )}
                        </div>
                        <ConstraintsEditor
                            ownerType={ownerType}
                            ownerId={ownerId}
                            attributeId={attribute.id}
                            dataType={(attribute.item?.dataType ?? "String") as any}
                            constraints={attribute.item?.constraints ?? []}
                            target="item"
                            disabled={disabled}
                            title="Ограничения элемента"
                        />
                    </FormSection>
                )}

                {attribute.dataType === "Text" && (
                    <FormSection title="Разметка">
                        <Switch
                            checked={!!attribute.comments}
                            disabled={disabled}
                            onChange={(v) => setField(["comments"], v ? true : undefined)}
                            label="Разрешить комментарии к тексту"
                        />
                    </FormSection>
                )}

                {attribute.dataType === "Calculation" && (
                    <FormSection title="Расчёт">
                        <div className="ent-grid">
                            <div className="ent-field">
                                <label className="ent-label">schemaId</label>
                                <InlineText value={attribute.calculation?.schemaId ?? ""} disabled={disabled} onCommit={(v) => setField(["calculation", "schemaId"], v)} />
                            </div>
                            <div className="ent-field">
                                <label className="ent-label">id расчёта</label>
                                <InlineText value={attribute.calculation?.id ?? ""} disabled={disabled} onCommit={(v) => setField(["calculation", "id"], v)} />
                            </div>
                        </div>
                    </FormSection>
                )}

                {attribute.dataType === "Identifier" && (
                    <IdentifierEditor
                        ownerType={ownerType}
                        ownerId={ownerId}
                        attribute={attribute}
                        disabled={disabled}
                        setField={setField}
                    />
                )}

                <ConstraintsEditor
                    ownerType={ownerType}
                    ownerId={ownerId}
                    attributeId={attribute.id}
                    dataType={attribute.dataType}
                    constraints={attribute.constraints ?? []}
                    target="attribute"
                    disabled={disabled}
                />
            </div>
        </div>
    );
};

// ============ Identifier ============
const LITERALS = ["{@prefix}", "{@YYYY}", "{@MM}", "{@DD}", "{@inc}"];

const IdentifierEditor: FC<{
    ownerType: "entity" | "linkage";
    ownerId: string;
    attribute: AttributeSchema;
    disabled: boolean;
    setField: (path: readonly (string | number)[], value: unknown) => void;
}> = ({ ownerType, ownerId, attribute, disabled, setField }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const isSequenced = !!attribute.sequence;
    const template = attribute.template ?? "";
    const segments = attribute.segment ?? [];
    const [dragRule, setDragRule] = useState<number | null>(null);

    const presentLiterals = LITERALS.filter((l) => template.includes(l) && l !== "{@inc}");

    const ownerAttrs = useMemo(() => {
        if (ownerType === "entity") {
            return schema.entities.find((e) => e.id === ownerId)?.attributes ?? [];
        }
        return schema.linkages.find((l) => l.id === ownerId)?.attributes ?? [];
    }, [schema, ownerType, ownerId]);

    const sourceAttrs = (entityRef: string): Array<{ id: string; name?: string; dataType?: string }> => {
        if (!entityRef) return [];
        const localId = entityRef.split("/").pop() ?? entityRef;
        const local = schema.entities.find((e) => e.id.toLowerCase() === localId.toLowerCase());
        if (local) return local.attributes;
        const fromModel = modelIndex.entitiesByFqid[entityRef.toLowerCase()] as any;
        return fromModel?.attributes ?? [];
    };

    const appendLiteral = (lit: string) => {
        if (template.includes(lit)) return;
        const next = template ? `${template}-${lit}` : lit;
        setField(["template"], next);
    };

    const toggleSegment = (lit: string, on: boolean) => {
        const normalized = lit.replace(/[{}@]/g, "");
        const order = ["prefix", "YYYY", "YY", "MM", "DD"];
        const next = on
            ? [...segments, normalized].sort((a, b) => order.indexOf(a) - order.indexOf(b))
            : segments.filter((s) => s !== normalized);
        commit((doc) => setSegment(doc, ownerType, ownerId, attribute.id, next));
    };

    const rules = attribute.prefixRules ?? [];

    return (
        <FormSection title="Идентификатор">
            <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
                <label className="ent-switch">
                    <input
                        type="radio"
                        name={`idmode-${attribute.id}`}
                        checked={isSequenced}
                        disabled={disabled}
                        onChange={() => {
                            setField(["template"], undefined);
                            setField(["segment"], undefined);
                            setField(["defaultPrefix"], undefined);
                            setField(["prefixRules"], undefined);
                            setField(["incrementTemplate"], undefined);
                        }}
                    />
                    <span className="ent-switch__label">Несегментированный</span>
                </label>
                <label className="ent-switch">
                    <input
                        type="radio"
                        name={`idmode-${attribute.id}`}
                        checked={!isSequenced}
                        disabled={disabled}
                        onChange={() => setField(["sequence"], undefined)}
                    />
                    <span className="ent-switch__label">Сегментированный</span>
                </label>
            </div>

            {isSequenced ? (
                <div className="ent-field">
                    <label className="ent-label">Последовательность</label>
                    <SequenceSelect
                        value={attribute.sequence ?? null}
                        onChange={(id) => setField(["sequence"], id ?? undefined)}
                        disabled={disabled}
                    />
                </div>
            ) : (
                <>
                    <div className="ent-field">
                        <label className="ent-label">Шаблон</label>
                        <InlineText
                            mono
                            value={template}
                            disabled={disabled}
                            onCommit={(v) => setField(["template"], v)}
                            placeholder="{@prefix}-{@YY}-{@MM}-{@DD}-{@inc}"
                        />
                        <div className="ent-chips" style={{ marginTop: 8 }}>
                            {LITERALS.map((lit) => (
                                <button
                                    key={lit}
                                    className={"ent-chip ent-chip--click" + (template.includes(lit) ? " ent-chip--accent" : "")}
                                    disabled={disabled}
                                    onClick={() => appendLiteral(lit)}
                                    style={{ border: "1px solid var(--ent-border)", cursor: disabled ? "not-allowed" : "pointer" }}
                                >
                                    {lit}
                                </button>
                            ))}
                        </div>
                        <div className="ent-hint" style={{ marginTop: 6 }}>
                            @inc обязателен. Разделители: - _ / \
                        </div>
                    </div>

                    <div className="ent-grid" style={{ marginTop: 12 }}>
                        {template.includes("{@prefix}") && (
                            <div className="ent-field">
                                <label className="ent-label">Префикс по умолчанию</label>
                                <InlineText value={attribute.defaultPrefix ?? ""} disabled={disabled} onCommit={(v) => setField(["defaultPrefix"], v)} placeholder="INC" />
                            </div>
                        )}
                        <div className="ent-field">
                            <label className="ent-label">Цифр в инкременте (2–10 нулей)</label>
                            <InlineText
                                mono
                                value={attribute.incrementTemplate ?? ""}
                                disabled={disabled}
                                validate={(v) => (v && !/^0{2,10}$/.test(v) ? "От 2 до 10 нулей" : null)}
                                onCommit={(v) => setField(["incrementTemplate"], v)}
                                placeholder="0000"
                            />
                        </div>
                    </div>

                    {presentLiterals.length > 0 && (
                        <div className="ent-field" style={{ marginTop: 12 }}>
                            <label className="ent-label">Сегменты (не сбрасывают инкремент при изменении)</label>
                            <div className="ent-chips" style={{ marginTop: 6 }}>
                                {presentLiterals.map((lit) => {
                                    const normalized = lit.replace(/[{}@]/g, "");
                                    const on = segments.includes(normalized);
                                    return (
                                        <button
                                            key={lit}
                                            className={"ent-chip ent-chip--click" + (on ? " ent-chip--accent" : "")}
                                            disabled={disabled}
                                            onClick={() => toggleSegment(lit, !on)}
                                            style={{ border: "1px solid var(--ent-border)", cursor: disabled ? "not-allowed" : "pointer" }}
                                        >
                                            {on ? "✓ " : ""}{lit}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {template.includes("{@prefix}") && (
                        <div style={{ marginTop: 14 }}>
                            <div className="ent-formsec__head">
                                <h4 className="ent-formsec__title" style={{ fontSize: 12 }}>Правила подстановки префикса</h4>
                                {!disabled && (
                                    <button
                                        className="ent-btn ent-btn--sm"
                                        onClick={() => commit((doc) => addPrefixRule(doc, ownerType, ownerId, attribute.id))}
                                    >
                                        + Правило
                                    </button>
                                )}
                            </div>
                            {rules.length === 0 && (
                                <div className="ent-hint">Если ни одно правило не сработает, используется префикс по умолчанию.</div>
                            )}
                            {rules.map((r, i) => {
                                const srcAttrs = sourceAttrs(r.source.entity);
                                return (
                                    <div
                                        key={i}
                                        className="ent-constraint"
                                        onDragOver={(e) => dragRule !== null && e.preventDefault()}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragRule !== null && dragRule !== i) {
                                                commit((doc) => movePrefixRule(doc, ownerType, ownerId, attribute.id, dragRule, i));
                                            }
                                            setDragRule(null);
                                        }}
                                    >
                                        <div className="ent-constraint__head">
                                            <span
                                                className="ent-drag"
                                                draggable={!disabled}
                                                onDragStart={() => setDragRule(i)}
                                                onDragEnd={() => setDragRule(null)}
                                            >
                                                ⋮⋮
                                            </span>
                                            <span className="ent-constraint__kind">{r.id}</span>
                                            <div style={{ flex: 1 }} />
                                            {!disabled && (
                                                <button
                                                    className="ent-iconbtn ent-iconbtn--danger"
                                                    onClick={() => commit((doc) => removePrefixRule(doc, ownerType, ownerId, attribute.id, i))}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                        <div className="ent-grid">
                                            <div className="ent-field">
                                                <label className="ent-label">Атрибут текущей сущности</label>
                                                <select
                                                    className="ent-select"
                                                    value={r.attribute}
                                                    disabled={disabled}
                                                    onChange={(e) =>
                                                        commit((doc) => updatePrefixRuleField(doc, ownerType, ownerId, attribute.id, i, ["attribute"], e.target.value))
                                                    }
                                                >
                                                    <option value="">—</option>
                                                    {ownerAttrs.map((a) => (
                                                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="ent-field">
                                                <label className="ent-label">Сущность-справочник</label>
                                                <EntitySelect
                                                    value={r.source.entity || null}
                                                    onChange={(fqid) =>
                                                        commit((doc) => updatePrefixRuleField(doc, ownerType, ownerId, attribute.id, i, ["source", "entity"], fqid ?? ""))
                                                    }
                                                    disabled={disabled}
                                                />
                                            </div>
                                            <div className="ent-field">
                                                <label className="ent-label">key (атрибут сравнения)</label>
                                                <select
                                                    className="ent-select"
                                                    value={r.source.key}
                                                    disabled={disabled}
                                                    onChange={(e) =>
                                                        commit((doc) => updatePrefixRuleField(doc, ownerType, ownerId, attribute.id, i, ["source", "key"], e.target.value))
                                                    }
                                                >
                                                    <option value="">—</option>
                                                    {srcAttrs.map((a) => (
                                                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="ent-field">
                                                <label className="ent-label">value (атрибут-префикс)</label>
                                                <select
                                                    className="ent-select"
                                                    value={r.source.value}
                                                    disabled={disabled}
                                                    onChange={(e) =>
                                                        commit((doc) => updatePrefixRuleField(doc, ownerType, ownerId, attribute.id, i, ["source", "value"], e.target.value))
                                                    }
                                                >
                                                    <option value="">—</option>
                                                    {srcAttrs.map((a) => (
                                                        <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </FormSection>
    );
};