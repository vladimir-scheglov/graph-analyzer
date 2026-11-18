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

    const items = useMemo(
        () =>
            schema.dataTypes.map((d) => ({
                key: `dataType:${d.id}`,
                label: d.name || d.id,
                hint: `${d.id} — ${labelForKind(d.kind)}`,
                badge:
                    d.kind === 'Enum'
                        ? <span className="dc-badge">{d.values?.length ?? 0} значений</span>
                        : d.kind === 'Workflow'
                            ? <span className="dc-badge">{d.statuses?.length ?? 0} статусов</span>
                            : <span className="dc-badge">{d.attributes?.length ?? 0} колонок</span>,
            })),
        [schema.dataTypes],
    );

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => setAddOpen(true)}
                onDelete={(key) => setPendingDelete(key.slice('dataType:'.length))}
                title="Расширенные атрибуты"
                createLabel="Создать тип"
                emptyText="Нет пользовательских типов"
            />

            <DataTypeDetail />

            <AddDataTypeModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить тип «${pendingDelete}»?`}
                description={
                    <p>
                        Все атрибуты сущностей, ссылающиеся на этот тип, станут битыми.
                        Удаление невозможно, если тип используется — но клиентская
                        проверка не всегда ловит такие случаи, финальная — на бэкенде.
                    </p>
                }
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

function labelForKind(kind: string): string {
    switch (kind) {
        case 'Enum': return 'перечисление';
        case 'Workflow': return 'workflow';
        case 'Table': return 'таблица';
        default: return kind;
    }
}