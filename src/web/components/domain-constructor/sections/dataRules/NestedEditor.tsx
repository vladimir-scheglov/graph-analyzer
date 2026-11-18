import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { DataRuleSchema } from '../../types';
import {
    setNestedType, addNestedAttribute, removeNestedAttribute,
    addNestedItem, removeNestedItem, updateNestedItem,
} from './dataRules-handlers';

interface Props {
    rule: DataRuleSchema;
}

/**
 * nested — для target: entityAttribute (атрибут Table или Array).
 *
 * type: table → attributes[]
 * type: array → items[] (0-based index или '*')
 */
export const NestedEditor: FC<Props> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    // Определить тип автоматически по атрибуту
    const entityObj = rule.entity ? schema.entities.find((e) => e.id === rule.entity) : null;
    const attr = entityObj?.attributes?.find((a) => a.id === rule.attribute);
    const autoType = attr?.dataType === 'Array' ? 'array' : 'table';

    const nested = (rule as any).nested as { type?: 'table' | 'array' } | undefined;
    const [type, setTypeLocal] = useState<'table' | 'array'>(nested?.type ?? autoType);

    useEffect(() => {
        if (!nested) {
            commit((doc) => setNestedType(doc, rule.id, autoType));
            setTypeLocal(autoType);
        }
    }, [nested, autoType, rule.id, commit]);

    // Для table: атрибуты внутри таблицы (из dataTypes)
    const tableColumns: Array<{ id: string }> = [];
    if (autoType === 'table' && attr?.dataType && attr.dataType !== 'Table') {
        const dt = schema.dataTypes.find((d) => d.id === attr.dataType);
        (dt?.attributes ?? []).forEach((a: any) => tableColumns.push({ id: a.id }));
    } else if (attr?.dataType === 'Table') {
        // Пользовательский тип Table — колонки тоже из dataTypes
        // (но атрибут с dataType='Table' сам не имеет attributes в entity.attributes[])
    }

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Вложенные объекты (nested)
            </h4>

            <div className="dc-field">
                <label className="dc-field__label">Тип (определён по атрибуту)</label>
                <select
                    className="dc-input"
                    value={type}
                    onChange={(e) => {
                        const t = e.target.value as 'table' | 'array';
                        setTypeLocal(t);
                        commit((doc) => setNestedType(doc, rule.id, t));
                    }}
                >
                    <option value="table">table (столбцы таблицы)</option>
                    <option value="array">array (элементы массива)</option>
                </select>
            </div>

            {type === 'table' && (
                <NestedTableEditor rule={rule} tableColumns={tableColumns} />
            )}
            {type === 'array' && (
                <NestedArrayEditor rule={rule} />
            )}
        </div>
    );
};

const NestedTableEditor: FC<{ rule: DataRuleSchema; tableColumns: Array<{ id: string }> }> = ({
    rule, tableColumns,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const attrs = ((rule as any).nested?.attributes ?? []) as any[];

    return (
        <div style={{ marginTop: 8 }}>
            <div className="dc-constraints__header">
                <span className="dc-muted">Столбцы таблицы</span>
                <select
                    className="dc-input dc-input--inline"
                    value=""
                    onChange={(e) => {
                        if (!e.target.value) return;
                        commit((doc) => addNestedAttribute(doc, rule.id, e.target.value));
                    }}
                >
                    <option value="">+ столбец</option>
                    {tableColumns.map((c) => (
                        <option key={c.id} value={c.id}>{c.id}</option>
                    ))}
                </select>
            </div>

            {attrs.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет столбцов</div>
            )}

            {attrs.map((a: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind"><code>{a.attribute}</code></span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeNestedAttribute(doc, rule.id, i))}
                        >×</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

const NestedArrayEditor: FC<{ rule: DataRuleSchema }> = ({ rule }) => {
    const commit = useEditorStore((s) => s.commit);
    const items = ((rule as any).nested?.items ?? []) as any[];

    return (
        <div style={{ marginTop: 8 }}>
            <div className="dc-constraints__header">
                <span className="dc-muted">Элементы массива (0-based или '*')</span>
                <div className="dc-toolbar__group">
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addNestedItem(doc, rule.id, '*'))}
                    >+ все (*)</button>
                    <button
                        className="dc-btn dc-btn--dashed"
                        onClick={() => commit((doc) => addNestedItem(doc, rule.id, 0))}
                    >+ конкретный</button>
                </div>
            </div>

            {items.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет элементов</div>
            )}

            {items.map((it: any, i: number) => (
                <div key={i} className="dc-constraint">
                    <div className="dc-constraint__header">
                        <span className="dc-constraint__kind">#{i + 1}</span>
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => commit((doc) => removeNestedItem(doc, rule.id, i))}
                        >×</button>
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">item</label>
                        <input
                            className="dc-input dc-input--compact"
                            value={String(it.item ?? '')}
                            onChange={(e) => {
                                const v = e.target.value.trim();
                                const num = v === '*' ? '*' : Number(v);
                                if (v === '*' || !isNaN(num as any)) {
                                    commit((doc) => updateNestedItem(doc, rule.id, i, num as any));
                                }
                            }}
                            placeholder="0 / 1 / *"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};