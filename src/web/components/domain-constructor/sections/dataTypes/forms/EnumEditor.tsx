import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import type { DataTypeSchema } from '../../../types';
import {
    addEnumValue, removeEnumValue, updateEnumValueField, moveEnumValue,
    setEnumColor, updateDataTypeField, bulkAddEnumValues,
    generateCopyId, duplicateDataType, exportDataTypeAsJson,
} from '../dataType-handlers';
import { toast } from '../../../ui/toast';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { ColorPicker } from '../shared/ColorPicker';
import { BulkPasteDialog } from '../shared/BulkPasteDialog';
import { PreviewPanel } from '../shared/PreviewPanel';

type Tab = 'values' | 'settings' | 'preview';

export const EnumEditor: FC<{ dataType: DataTypeSchema }> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const select = useEditorStore((s) => s.select);
    const doc = useEditorStore((s) => s.doc);

    const [tab, setTab] = useState<Tab>('values');
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [dragIndex, setDragIndex] = useState<number | null>(null);

    const values = dataType.values ?? [];
    const view = ((dataType as any).view as Array<{ value: string; color?: string }>) ?? [];
    const colorByValue = new Map(view.map((v) => [v.value, v.color]));

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return values.map((v, i) => ({ v, i }));
        return values
            .map((v, i) => ({ v, i }))
            .filter(({ v }) =>
                v.id.toLowerCase().includes(q) ||
                (v.name ?? '').toLowerCase().includes(q),
            );
    }, [values, search]);

    return (
        <div className="dc-dt-editor">
            {/* ============ Верхняя панель ============ */}
            <div className="dc-dt-topbar">
                <div className="dc-dt-tabs" role="tablist">
                    {[
                        { key: 'values', label: `Значения (${values.length})` },
                        { key: 'settings', label: 'Настройки' },
                        { key: 'preview', label: 'Превью' },
                    ].map((t) => (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={tab === t.key}
                            className={'dc-dt-tab' + (tab === t.key ? ' dc-dt-tab--active' : '')}
                            onClick={() => setTab(t.key as Tab)}
                        >{t.label}</button>
                    ))}
                </div>
                <div className="dc-dt-topbar__actions">
                    <button
                        className="dc-btn dc-btn--sm"
                        onClick={() => {
                            const newId = generateCopyId(doc, dataType.id);
                            commit((d) => duplicateDataType(d, dataType.id, newId));
                            select(`dataType:${newId}`);
                            toast.success(`Создана копия «${newId}»`);
                        }}
                        title="Создать копию типа"
                    >Дублировать</button>
                    <button
                        className="dc-btn dc-btn--sm"
                        onClick={async () => {
                            const json = exportDataTypeAsJson(doc, dataType.id);
                            try {
                                await navigator.clipboard.writeText(json);
                                toast.success('JSON скопирован');
                            } catch { toast.error('Не удалось скопировать'); }
                        }}
                    >Экспорт</button>
                </div>
            </div>

            {/* ============ Контент таба ============ */}
            {tab === 'values' && (
                <div className="dc-dt-section">
                    <div className="dc-dt-toolbar">
                        <input
                            className="dc-input dc-input--search"
                            placeholder="Поиск по ID или названию…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => setBulkOpen(true)}
                        >Вставить пачкой</button>
                        <button
                            className="dc-btn dc-btn--primary"
                            onClick={() => commit((d) => addEnumValue(d, dataType.id))}
                        >+ Значение</button>
                    </div>

                    {values.length === 0 ? (
                        <div className="dc-dt-empty">
                            <p>Значений пока нет</p>
                            <button
                                className="dc-btn dc-btn--primary"
                                onClick={() => commit((d) => addEnumValue(d, dataType.id))}
                            >+ Создать первое значение</button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="dc-muted dc-constraints__empty">
                            Ничего не найдено
                        </div>
                    ) : (
                        <div className="dc-dt-values">
                            {filtered.map(({ v, i: realIndex }) => {
                                const color = colorByValue.get(v.id);
                                return (
                                    <div
                                        key={v.id}
                                        className={'dc-dt-value-row' + (dragIndex === realIndex ? ' dc-dt-value-row--dragging' : '')}
                                        draggable={!isPublished && !search}
                                        onDragStart={() => setDragIndex(realIndex)}
                                        onDragEnd={() => setDragIndex(null)}
                                        onDragOver={(e) => { if (dragIndex !== null) e.preventDefault(); }}
                                        onDrop={(e) => {
                                            e.preventDefault();
                                            if (dragIndex === null || dragIndex === realIndex) return;
                                            commit((d) => moveEnumValue(d, dataType.id, dragIndex, realIndex));
                                            setDragIndex(null);
                                        }}
                                    >
                                        <span className="dc-dt-value-row__handle" title="Перетащить">⋮⋮</span>
                                        <ColorPicker
                                            value={color}
                                            onChange={(c) => commit((d) => setEnumColor(d, dataType.id, v.id, c))}
                                        />
                                        <div className="dc-dt-value-row__main">
                                            <div className="dc-dt-field">
                                                <label className="dc-dt-field__label">ID</label>
                                                <input
                                                    className="dc-input dc-input--compact dc-input--mono"
                                                    value={v.id}
                                                    onChange={(e) =>
                                                        commit((d) => {
                                                            const newId = e.target.value;
                                                            updateEnumValueField(d, dataType.id, realIndex, 'id', newId);
                                                            if (color) setEnumColor(d, dataType.id, newId, color);
                                                        })
                                                    }
                                                    disabled={isPublished}
                                                />
                                            </div>
                                            <div className="dc-dt-field">
                                                <label className="dc-dt-field__label">Название</label>
                                                <input
                                                    className="dc-input dc-input--compact"
                                                    value={v.name ?? ''}
                                                    onChange={(e) =>
                                                        commit((d) =>
                                                            updateEnumValueField(d, dataType.id, realIndex, 'name', e.target.value),
                                                        )
                                                    }
                                                    placeholder="Отображаемое имя"
                                                />
                                            </div>
                                        </div>
                                        <label className="dc-dt-checkbox-label" title="Скрыть из выбора">
                                            <input
                                                type="checkbox"
                                                className="dc-checkbox"
                                                checked={!!v.hidden}
                                                onChange={(e) =>
                                                    commit((d) =>
                                                        updateEnumValueField(d, dataType.id, realIndex, 'hidden', e.target.checked),
                                                    )
                                                }
                                            /> скрыт
                                        </label>
                                        <button
                                            className="dc-btn dc-btn--danger dc-btn--icon"
                                            onClick={() => setPendingDelete(realIndex)}
                                            disabled={isPublished}
                                            title="Удалить"
                                        >×</button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'settings' && (
                <div className="dc-dt-section">
                    <div className="dc-field">
                        <label className="dc-field__label">Название типа</label>
                        <input
                            className="dc-input"
                            value={dataType.name ?? ''}
                            onChange={(e) =>
                                commit((d) => updateDataTypeField(d, dataType.id, 'name', e.target.value))
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <textarea
                            className="dc-input dc-input--textarea"
                            value={dataType.description ?? ''}
                            onChange={(e) =>
                                commit((d) => updateDataTypeField(d, dataType.id, 'description', e.target.value))
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">ID</label>
                        <input className="dc-input dc-input--mono" value={dataType.id} disabled />
                        <div className="dc-field__hint">
                            Использование: в атрибуте сущности укажите <code>dataType: {dataType.id}</code>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'preview' && (
                <div className="dc-dt-section">
                    <PreviewPanel dataType={dataType} enumView={view} />
                </div>
            )}

            <BulkPasteDialog
                open={bulkOpen}
                title="Вставить значения пачкой"
                hint="Каждая строка: ID | Название | #HEX, или просто Название (ID сгенерируется)"
                placeholder={`low | Низкий | #6BA3FF\nmedium | Средний | #FADD5C\nhigh | Высокий | #F5790C`}
                onClose={() => setBulkOpen(false)}
                onSubmit={(lines) => {
                    const items = lines.map((line) => {
                        const [a, b, c] = line.split('|').map((s) => s.trim());
                        if (b !== undefined) {
                            return {
                                id: a, name: b,
                                color: c && /^#[0-9A-Fa-f]{3,8}$/.test(c) ? c : undefined,
                            };
                        }
                        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(a)) return { id: a, name: a };
                        return { name: a };
                    });
                    commit((d) => bulkAddEnumValues(d, dataType.id, items));
                    toast.success(`Добавлено значений: ${items.length}`);
                }}
            />

            <ConfirmDialog
                open={pendingDelete !== null}
                title="Удалить значение?"
                description={
                    <p>
                        Значение удалится из перечисления.
                        {isPublished && <><br /><strong>После публикации удаление запрещено.</strong></>}
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (pendingDelete === null) return;
                    commit((d) => removeEnumValue(d, dataType.id, pendingDelete));
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};