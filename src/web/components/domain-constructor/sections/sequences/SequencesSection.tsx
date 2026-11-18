import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { DetailCard } from '../../ui/DetailCard';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { addSequence, updateSequenceField, deleteSequence } from './sequences-handlers';
import { validateDataId } from '../entities/entity-handlers';

export const SequencesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = schema.sequences.map((s) => ({
        key: `sequence:${s.id}`,
        label: s.id,
        hint: `startFrom: ${s.startFrom}`,
    }));

    const selected = selectionKey?.startsWith('sequence:')
        ? schema.sequences.find((s) => s.id === selectionKey.slice('sequence:'.length))
        : null;

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => {
                    const id = `Sequence${schema.sequences.length + 1}`;
                    commit((doc) => addSequence(doc, { id, startFrom: 1 }));
                    select(`sequence:${id}`);
                }}
                onDelete={(k) => setPendingDelete(k.slice('sequence:'.length))}
                title="Последовательности"
                createLabel="Создать последовательность"
                emptyText="Нет последовательностей"
            />

            <DetailCard
                title={selected ? `Последовательность ${selected.id}` : ''}
                empty={!selected}
                emptyText="Выберите последовательность слева"
                children={selected ? (
                    <div>
                        <div className="dc-field">
                            <label className="dc-field__label">ID</label>
                            <input className="dc-input" value={selected.id} disabled />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Начальное значение</label>
                            <input
                                className="dc-input"
                                type="number"
                                value={selected.startFrom}
                                onChange={(e) =>
                                    commit((doc) => updateSequenceField(doc, selected.id, 'startFrom', Number(e.target.value)))
                                }
                            />
                            <div className="dc-field__hint">
                                После создания первого объекта изменение не влияет на нумерацию.
                            </div>
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Описание</label>
                            <textarea
                                className="dc-input dc-input--textarea"
                                value={selected.description ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateSequenceField(doc, selected.id, 'description', e.target.value))
                                }
                            />
                        </div>
                    </div>
                ) : null}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить последовательность «${pendingDelete}»?`}
                description={<p>Атрибуты-идентификаторы, ссылающиеся на неё, станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteSequence(doc, pendingDelete));
                    if (selectionKey === `sequence:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};