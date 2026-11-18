import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { SearchableList } from '../../ui/SearchableList';
import { DetailCard } from '../../ui/DetailCard';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import {
    addUiPreset, updateUiPresetTop, deleteUiPreset,
    addPresetProp, removePresetProp, updatePresetProp,
    validateUiPresetId,
} from './uiPresets-handlers';

export const UiPresetsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);

    const [pendingDelete, setPendingDelete] = useState<string | null>(null);

    const presets = ((schema as any).uiPresets ?? []) as any[];

    const selectedId = selectionKey?.startsWith('uiPreset:')
        ? selectionKey.slice('uiPreset:'.length)
        : null;
    const selected = selectedId ? presets.find((p) => p.id === selectedId) : null;

    const items = presets.map((p) => ({
        key: `uiPreset:${p.id}`,
        label: p.name || p.id,
        hint: p.id,
        badge: (
            <span className="dc-badge dc-badge--muted">
                {Object.keys(p.props ?? {}).length} props
            </span>
        ),
    }));

    return (
        <div className="dc-section">
            <SearchableList
                items={items}
                selectedKey={selectionKey}
                onSelect={select}
                onCreate={() => {
                    const base = `preset${presets.length + 1}`;
                    let id = base;
                    let n = 1;
                    while (presets.some((p) => p.id === id)) { id = `${base}_${n++}`; }
                    commit((doc) => addUiPreset(doc, { id }));
                    select(`uiPreset:${id}`);
                }}
                onDelete={(k) => setPendingDelete(k.slice('uiPreset:'.length))}
                title="Пресеты UI"
                createLabel="Создать пресет"
                emptyText="Нет пресетов"
            />

            <DetailCard
                title={selected ? `Пресет ${selected.id}` : ''}
                empty={!selected}
                emptyText="Выберите пресет слева"
                children={selected ? (
                    <UiPresetForm preset={selected} />
                ) : null}
            />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить пресет «${pendingDelete}»?`}
                description={<p>Правила, ссылающиеся на него в effect: variant, станут битыми.</p>}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteUiPreset(doc, pendingDelete));
                    if (selectionKey === `uiPreset:${pendingDelete}`) select(null);
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};

const UiPresetForm: FC<{ preset: any }> = ({ preset }) => {
    const commit = useEditorStore((s) => s.commit);
    const props = (preset.props ?? {}) as Record<string, unknown>;
    const entries = Object.entries(props);

    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={preset.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={preset.name ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateUiPresetTop(doc, preset.id, 'name', e.target.value || undefined))
                        }
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={preset.description ?? ''}
                    onChange={(e) =>
                        commit((doc) => updateUiPresetTop(doc, preset.id, 'description', e.target.value || undefined))
                    }
                />
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                CSS-свойства ({entries.length})
            </h4>

            {entries.map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 6, marginBottom: 6 }}>
                    <input
                        className="dc-input dc-input--compact"
                        value={k}
                        onChange={(e) =>
                            commit((doc) =>
                                updatePresetProp(doc, preset.id, k, e.target.value, String(v ?? '')),
                            )
                        }
                        placeholder="color / font-weight"
                    />
                    <input
                        className="dc-input dc-input--compact"
                        value={String(v ?? '')}
                        onChange={(e) =>
                            commit((doc) =>
                                updatePresetProp(doc, preset.id, k, k, e.target.value),
                            )
                        }
                        placeholder="#ef4444 / bold"
                    />
                    <button
                        className="dc-btn dc-btn--danger dc-btn--icon"
                        onClick={() => commit((doc) => removePresetProp(doc, preset.id, k))}
                    >×</button>
                </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 6, marginTop: 12 }}>
                <input
                    className="dc-input dc-input--compact"
                    placeholder="свойство"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                    className="dc-input dc-input--compact"
                    placeholder="значение"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                />
                <button
                    className="dc-btn dc-btn--dashed"
                    disabled={!newKey.trim()}
                    onClick={() => {
                        commit((doc) => addPresetProp(doc, preset.id, newKey.trim(), newValue));
                        setNewKey('');
                        setNewValue('');
                    }}
                >+ добавить</button>
            </div>

            <div className="dc-field__hint" style={{ marginTop: 8 }}>
                Примеры: <code>color: #ef4444</code>, <code>background-color: #fee2e2</code>,
                <code>font-weight: bold</code>, <code>collapsed: true</code>.
            </div>
        </div>
    );
};