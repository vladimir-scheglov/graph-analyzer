import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { DetailCard } from '../../ui/DetailCard';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { addPattern, updatePatternField, deletePattern } from './counterColorPatterns-handlers';

export const CounterColorPatternsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const items = schema.counterColorPatterns.map((p) => ({
        key: `counterColorPattern:${p.id}`,
        label: p.id,
        hint: `red ${p.red} · yellow ${p.yellow}`,
    }));

    const selected = selectionKey?.startsWith('counterColorPattern:')
        ? schema.counterColorPatterns.find((p) => p.id === selectionKey.slice('counterColorPattern:'.length))
        : null;

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => {
                    const id = `counterColorPattern${schema.counterColorPatterns.length + 1}`;
                    commit((doc) => addPattern(doc, { id }));
                    select(`counterColorPattern:${id}`);
                }}
                onDelete={(k) => setPendingDelete(k.slice('counterColorPattern:'.length))}
                title="Цветовые схемы счётчиков"
                createLabel="Создать схему"
                emptyText="Нет цветовых схем"
            />

            <DetailCard
                title={selected ? `Схема ${selected.id}` : ''}
                empty={!selected}
                emptyText="Выберите схему слева"
                children={selected ? (
                    <div>
                        <div className="dc-field">
                            <label className="dc-field__label">ID</label>
                            <input className="dc-input" value={selected.id} disabled />
                        </div>
                        <div className="dc-field-row">
                            <div className="dc-field">
                                <label className="dc-field__label">Yellow (порог)</label>
                                <input
                                    className="dc-input"
                                    value={selected.yellow}
                                    onChange={(e) =>
                                        commit((doc) => updatePatternField(doc, selected.id, 'yellow', e.target.value))
                                    }
                                    placeholder="40% или 2d"
                                />
                            </div>
                            <div className="dc-field">
                                <label className="dc-field__label">Red (порог)</label>
                                <input
                                    className="dc-input"
                                    value={selected.red}
                                    onChange={(e) =>
                                        commit((doc) => updatePatternField(doc, selected.id, 'red', e.target.value))
                                    }
                                    placeholder="60% или 1w2d3h5m"
                                />
                            </div>
                        </div>
                        <div className="dc-field__hint">
                            Оба значения — в одном формате: либо проценты (0–100%), либо
                            временные единицы (d/h/m/s). Red должен быть больше Yellow.
                        </div>
                    </div>
                ) : null}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить схему «${pendingDelete}»?`}
                description={<p>Виджеты-счётчики, ссылающиеся на неё, станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deletePattern(doc, pendingDelete));
                    if (selectionKey === `counterColorPattern:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};