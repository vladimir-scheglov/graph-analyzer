import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { DataTypeDetail } from './DataTypeDetail';
import { AddDataTypeModal } from './AddDataTypeModal';
import { deleteDataType } from './dataType-handlers';

export const DataTypesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [filterKind, setFilterKind] = useState<'all' | 'Enum' | 'Workflow' | 'Table'>('all');

    const counts = useMemo(() => {
        const c = { all: schema.dataTypes.length, Enum: 0, Workflow: 0, Table: 0 };
        for (const dt of schema.dataTypes) c[dt.kind]++;
        return c;
    }, [schema.dataTypes]);

    const items = useMemo(() => {
        return schema.dataTypes
            .filter((d) => filterKind === 'all' || d.kind === filterKind)
            .map((d) => {
                const count = d.kind === 'Enum'
                    ? (d.values?.length ?? 0)
                    : d.kind === 'Workflow'
                        ? (d.statuses?.length ?? 0)
                        : (d.attributes?.length ?? 0);
                return {
                    key: `dataType:${d.id}`,
                    label: d.name || d.id,
                    hint: `${d.id} · ${count} ${unitFor(d.kind, count)}`,
                    badge: <span className="dc-badge dc-badge--muted">{d.kind.toLowerCase()}</span>,
                };
            });
    }, [schema.dataTypes, filterKind]);

    const filterSlot = (
        <select
            className="dc-input dc-input--compact"
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as any)}
            style={{ width: '100%' }}
        >
            <option value="all">Все ({counts.all})</option>
            <option value="Enum">Перечисления ({counts.Enum})</option>
            <option value="Workflow">Workflow ({counts.Workflow})</option>
            <option value="Table">Таблицы ({counts.Table})</option>
        </select>
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(k) => setPendingDelete(k.slice('dataType:'.length))}
                title={`Расширенные атрибуты (${schema.dataTypes.length})`}
                createLabel="Создать тип"
                emptyText={
                    filterKind === 'all'
                        ? 'Нет пользовательских типов'
                        : `Нет типов вида ${filterKind}`
                }
                filterSlot={filterSlot}
            />

            <DataTypeDetail />

            <AddDataTypeModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить тип «${pendingDelete}»?`}
                description={<p>Атрибуты сущностей, ссылающиеся на этот тип, станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteDataType(doc, pendingDelete));
                    if (selectionKey === `dataType:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};

function unitFor(kind: string, n: number): string {
    if (kind === 'Enum') return n === 1 ? 'значение' : n < 5 ? 'значения' : 'значений';
    if (kind === 'Workflow') return n === 1 ? 'статус' : n < 5 ? 'статуса' : 'статусов';
    return n === 1 ? 'колонка' : n < 5 ? 'колонки' : 'колонок';
}