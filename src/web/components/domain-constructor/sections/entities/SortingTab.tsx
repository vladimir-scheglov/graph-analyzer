import { useMemo, useRef, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import type { EntitySchema } from "../../types";
import {
    addSortingBy,
    addSortingRule,
    deleteSortingRule,
    moveSortingBy,
    moveSortingRule,
    removeSortingBy,
    updateSortingByField,
    updateSortingRuleField,
    validateDataId,
} from "./entity-handlers";
import { useInheritedAttributes } from "./use-inherited-attributes";
import { EmptyState, InlineText, Switch } from "./ui";

export const SortingTab: FC<{ entity: EntitySchema }> = ({ entity }) => {
    const commit = useEditorStore((s) => s.commit);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const inherited = useInheritedAttributes(entity, modelIndex);
    const rules = entity.sorting ?? [];

    const [dragBy, setDragBy] = useState<{ rule: number; index: number } | null>(null);
    const [overBy, setOverBy] = useState<{ rule: number; index: number } | null>(null);

    const attrOptions = useMemo(() => {
        const own = entity.attributes.map((a) => ({ id: a.id, label: a.name || a.id }));
        const inh = inherited.map((x) => ({ id: x.attr.id, label: `${x.attr.name || x.attr.id} (унасл.)` }));
        return [...own, ...inh];
    }, [entity.attributes, inherited]);

    const ruleIds = new Set(rules.map((r) => r.id));

    return (
        <div>
            <div className="ent-toolbar">
                <span className="ent-toolbar__meta">
                    Правила определяют наборы атрибутов для сортировки списка объектов. Без правил система сортирует по времени создания.
                </span>
                <div className="ent-toolbar__spacer" />
                <button
                    className="ent-btn ent-btn--primary"
                    onClick={() => commit((doc) => addSortingRule(doc, entity.id) ?? void 0)}
                >
                    + Правило сортировки
                </button>
            </div>

            {rules.length === 0 && (
                <EmptyState
                    icon="⇅"
                    title="Правил сортировки нет"
                    hint="Создайте правило: например, «По названию» (name ↑) или «Сначала новые» (createdAt ↓). Индексацию включайте только для больших объёмов данных."
                    action={
                        <button className="ent-btn ent-btn--primary" onClick={() => commit((doc) => addSortingRule(doc, entity.id) ?? void 0)}>
                            + Создать правило
                        </button>
                    }
                />
            )}

            {rules.map((rule, ri) => {
                const usedAttrs = new Set(rule.by.map((b) => b.attribute));
                const addable = attrOptions.filter((a) => !usedAttrs.has(a.id));
                return (
                    <div key={rule.id + ri} className="ent-sortrule">
                        <div className="ent-sortrule__head">
                            <span className="ent-sortrule__id">
                                <InlineText
                                    mono
                                    value={rule.id}
                                    validate={(v) => {
                                        const err = validateDataId(v);
                                        if (err) return err;
                                        if (v !== rule.id && ruleIds.has(v)) return "ID уже используется";
                                        return null;
                                    }}
                                    onCommit={(v) => commit((doc) => updateSortingRuleField(doc, entity.id, ri, "id", v))}
                                />
                            </span>
                            <div style={{ flex: 1, minWidth: 140 }}>
                                <InlineText
                                    value={rule.name ?? ""}
                                    placeholder="Название правила (напр. «По названию»)"
                                    onCommit={(v) => commit((doc) => updateSortingRuleField(doc, entity.id, ri, "name", v))}
                                />
                            </div>
                            <Switch
                                small
                                checked={!!rule.createIndex}
                                onChange={(v) => commit((doc) => updateSortingRuleField(doc, entity.id, ri, "createIndex", v ? true : undefined))}
                                label="Создать индекс"
                            />
                            <button
                                className="ent-iconbtn"
                                disabled={ri === 0}
                                title="Выше"
                                onClick={() => commit((doc) => moveSortingRule(doc, entity.id, ri, ri - 1))}
                            >
                                ↑
                            </button>
                            <button
                                className="ent-iconbtn"
                                disabled={ri === rules.length - 1}
                                title="Ниже"
                                onClick={() => commit((doc) => moveSortingRule(doc, entity.id, ri, ri + 1))}
                            >
                                ↓
                            </button>
                            <button
                                className="ent-iconbtn ent-iconbtn--danger"
                                title="Удалить правило"
                                onClick={() => commit((doc) => deleteSortingRule(doc, entity.id, ri))}
                            >
                                ×
                            </button>
                        </div>

                        {rule.by.length === 0 && (
                            <div className="ent-banner">Добавьте хотя бы один атрибут — правило с пустым списком невалидно.</div>
                        )}

                        {rule.by.map((b, bi) => (
                            <div
                                key={bi}
                                className={
                                    "ent-byrow" +
                                    (overBy?.rule === ri && overBy?.index === bi ? " ent-byrow--dragover" : "")
                                }
                                onDragOver={(e) => {
                                    if (dragBy?.rule !== ri) return;
                                    e.preventDefault();
                                    setOverBy({ rule: ri, index: bi });
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragBy?.rule === ri && dragBy.index !== bi) {
                                        commit((doc) => moveSortingBy(doc, entity.id, ri, dragBy.index, bi));
                                    }
                                    setDragBy(null);
                                    setOverBy(null);
                                }}
                            >
                                <span
                                    className="ent-drag"
                                    draggable
                                    onDragStart={() => setDragBy({ rule: ri, index: bi })}
                                    onDragEnd={() => {
                                        setDragBy(null);
                                        setOverBy(null);
                                    }}
                                >
                                    ⋮⋮
                                </span>
                                <span className="ent-byrow__num">{bi + 1}</span>
                                <select
                                    className="ent-select"
                                    style={{ flex: 1 }}
                                    value={b.attribute}
                                    onChange={(e) => commit((doc) => updateSortingByField(doc, entity.id, ri, bi, "attribute", e.target.value))}
                                >
                                    <option value="">— атрибут —</option>
                                    {attrOptions.map((a) => (
                                        <option key={a.id} value={a.id} disabled={usedAttrs.has(a.id) && a.id !== b.attribute}>
                                            {a.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    className="ent-dirbtn"
                                    title="Направление сортировки"
                                    onClick={() =>
                                        commit((doc) =>
                                            updateSortingByField(doc, entity.id, ri, bi, "direction", b.direction === "asc" ? "desc" : "asc"),
                                        )
                                    }
                                >
                                    {b.direction === "asc" ? "↑ по возрастанию" : "↓ по убыванию"}
                                </button>
                                <button
                                    className="ent-iconbtn ent-iconbtn--danger"
                                    onClick={() => commit((doc) => removeSortingBy(doc, entity.id, ri, bi))}
                                >
                                    ×
                                </button>
                            </div>
                        ))}

                        {addable.length > 0 && (
                            <select
                                className="ent-select ent-select--inline"
                                style={{ marginTop: 8 }}
                                value=""
                                onChange={(e) => {
                                    if (!e.target.value) return;
                                    commit((doc) => addSortingBy(doc, entity.id, ri, e.target.value));
                                }}
                            >
                                <option value="">+ добавить атрибут в правило…</option>
                                {addable.map((a) => (
                                    <option key={a.id} value={a.id}>{a.label}</option>
                                ))}
                            </select>
                        )}
                    </div>
                );
            })}
        </div>
    );
};