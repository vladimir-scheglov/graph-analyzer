import { useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import type { DataTypeSchema } from '../../../types';
import {
    addStatus, removeStatus, updateStatusField, setInitialStatus,
    toggleTransition, setWorkflowColor, updateDataTypeField,
    bulkAddStatuses, copyWorkflowMatrix, generateCopyId, duplicateDataType,
    exportDataTypeAsJson,
} from '../dataType-handlers';
import { toast } from '../../../ui/toast';
import { ConfirmDialog } from '../../../ui/ConfirmDialog';
import { ColorPicker } from '../shared/ColorPicker';
import { BulkPasteDialog } from '../shared/BulkPasteDialog';
import { PreviewPanel } from '../shared/PreviewPanel';

type Tab = 'statuses' | 'transitions' | 'settings' | 'preview';

export const WorkflowEditor: FC<{ dataType: DataTypeSchema }> = ({ dataType }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const select = useEditorStore((s) => s.select);
    const schema = useEditorStore((s) => s.schema);
    const doc = useEditorStore((s) => s.doc);

    const [tab, setTab] = useState<Tab>('statuses');
    const [pendingDelete, setPendingDelete] = useState<number | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [transitionsMode, setTransitionsMode] = useState<'matrix' | 'list'>('matrix');
    const [copyOpen, setCopyOpen] = useState(false);

    const statuses = dataType.statuses ?? [];
    const transitions = dataType.transitions ?? [];
    const view = ((dataType as any).view as Array<{ status: string; color?: string }>) ?? [];
    const colorByStatus = new Map(view.map((v) => [v.status, v.color]));
    const transitionSet = new Set(transitions.map((t) => `${t.from}->${t.to}`));

    const otherWorkflows = schema.dataTypes.filter(
        (d) => d.kind === 'Workflow' && d.id !== dataType.id,
    );

    const setField = (field: string, value: unknown) =>
        commit((d) => updateDataTypeField(d, dataType.id, field, value));

    return (
        <div className="dc-dt-editor">
            <div className="dc-dt-topbar">
                <div className="dc-dt-tabs" role="tablist">
                    {[
                        { key: 'statuses', label: `Статусы (${statuses.length})` },
                        { key: 'transitions', label: `Переходы (${transitions.length})` },
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
                    <button className="dc-btn dc-btn--sm" onClick={() => {
                        const newId = generateCopyId(doc, dataType.id);
                        commit((d) => duplicateDataType(d, dataType.id, newId));
                        select(`dataType:${newId}`);
                        toast.success(`Создана копия «${newId}»`);
                    }}>Дублировать</button>
                    <button className="dc-btn dc-btn--sm" onClick={async () => {
                        const json = exportDataTypeAsJson(doc, dataType.id);
                        try { await navigator.clipboard.writeText(json); toast.success('JSON скопирован'); }
                        catch { toast.error('Не удалось скопировать'); }
                    }}>Экспорт</button>
                </div>
            </div>

            {tab === 'statuses' && (
                <div className="dc-dt-section">
                    <div className="dc-dt-toolbar">
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => setBulkOpen(true)}
                        >Вставить пачкой</button>
                        <button
                            className="dc-btn dc-btn--primary"
                            onClick={() => commit((d) => addStatus(d, dataType.id))}
                        >+ Статус</button>
                    </div>

                    {statuses.length === 0 ? (
                        <div className="dc-dt-empty">
                            <p>Статусов пока нет</p>
                            <button
                                className="dc-btn dc-btn--primary"
                                onClick={() => commit((d) => addStatus(d, dataType.id))}
                            >+ Создать первый статус</button>
                        </div>
                    ) : (
                        <div className="dc-dt-statuses">
                            {statuses.map((s, i) => {
                                const color = colorByStatus.get(s.id);
                                const isInitial = dataType.initial === s.id;
                                return (
                                    <div key={s.id} className="dc-dt-status-card">
                                        <div className="dc-dt-status-card__head">
                                            <ColorPicker
                                                value={color}
                                                onChange={(c) => commit((d) => setWorkflowColor(d, dataType.id, s.id, c))}
                                            />
                                            <button
                                                type="button"
                                                className={'dc-dt-star' + (isInitial ? ' dc-dt-star--active' : '')}
                                                onClick={() => commit((d) => setInitialStatus(d, dataType.id, s.id))}
                                                title={isInitial ? 'Начальный статус' : 'Сделать начальным'}
                                            >★</button>
                                            <span className="dc-dt-status-card__index">#{i + 1}</span>
                                            <div className="dc-dt-topbar__spacer" />
                                            <button
                                                className="dc-btn dc-btn--danger dc-btn--icon"
                                                onClick={() => setPendingDelete(i)}
                                                disabled={isPublished}
                                                title="Удалить статус"
                                            >×</button>
                                        </div>
                                        <div className="dc-dt-status-card__body">
                                            <div className="dc-dt-field">
                                                <label className="dc-dt-field__label">ID</label>
                                                <input
                                                    className="dc-input dc-input--compact dc-input--mono"
                                                    value={s.id}
                                                    onChange={(e) =>
                                                        commit((d) => {
                                                            const newId = e.target.value;
                                                            updateStatusField(d, dataType.id, i, 'id', newId);
                                                            if (color) setWorkflowColor(d, dataType.id, newId, color);
                                                        })
                                                    }
                                                    disabled={isPublished}
                                                />
                                            </div>
                                            <div className="dc-dt-field">
                                                <label className="dc-dt-field__label">Название</label>
                                                <input
                                                    className="dc-input dc-input--compact"
                                                    value={s.name ?? ''}
                                                    onChange={(e) =>
                                                        commit((d) =>
                                                            updateStatusField(d, dataType.id, i, 'name', e.target.value),
                                                        )
                                                    }
                                                />
                                            </div>
                                            <label className="dc-dt-checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    className="dc-checkbox"
                                                    checked={!!s.hidden}
                                                    onChange={(e) =>
                                                        commit((d) =>
                                                            updateStatusField(d, dataType.id, i, 'hidden', e.target.checked),
                                                        )
                                                    }
                                                /> скрыт
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'transitions' && (
                <div className="dc-dt-section">
                    <div className="dc-dt-toolbar">
                        <div className="dc-dt-matrix-toggle">
                            <button
                                type="button"
                                className={'dc-dt-toggle-btn' + (transitionsMode === 'matrix' ? ' dc-dt-toggle-btn--active' : '')}
                                onClick={() => setTransitionsMode('matrix')}
                            >Матрица</button>
                            <button
                                type="button"
                                className={'dc-dt-toggle-btn' + (transitionsMode === 'list' ? ' dc-dt-toggle-btn--active' : '')}
                                onClick={() => setTransitionsMode('list')}
                            >Список</button>
                        </div>
                        <div className="dc-dt-topbar__spacer" />
                        {otherWorkflows.length > 0 && (
                            <button
                                className="dc-btn dc-btn--sm"
                                onClick={() => setCopyOpen(true)}
                            >Скопировать из…</button>
                        )}
                    </div>

                    {statuses.length < 2 ? (
                        <div className="dc-muted dc-constraints__empty">
                            Для переходов нужно ≥ 2 статуса
                        </div>
                    ) : transitionsMode === 'matrix' ? (
                        <div className="dc-dt-matrix-wrap">
                            <table className="dc-dt-matrix">
                                <thead>
                                    <tr>
                                        <th></th>
                                        {statuses.map((s) => (
                                            <th key={s.id} title={s.name || s.id}>{s.id}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {statuses.map((from) => (
                                        <tr key={from.id}>
                                            <th title={from.name || from.id}>{from.id}</th>
                                            {statuses.map((to) => {
                                                const isSelf = from.id === to.id;
                                                const checked = isSelf || transitionSet.has(`${from.id}->${to.id}`);
                                                return (
                                                    <td key={to.id} className="dc-dt-matrix__cell">
                                                        <input
                                                            type="checkbox"
                                                            className="dc-checkbox"
                                                            checked={checked}
                                                            disabled={isSelf}
                                                            onChange={() => commit((d) => toggleTransition(d, dataType.id, from.id, to.id))}
                                                        />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="dc-dt-transitions-list">
                            {statuses.map((from) => {
                                const toList = transitions
                                    .filter((t) => t.from === from.id && t.to !== from.id)
                                    .map((t) => t.to);
                                return (
                                    <div key={from.id} className="dc-dt-transition-row">
                                        <div className="dc-dt-transition-row__from">
                                            <code>{from.name || from.id}</code>
                                        </div>
                                        <span className="dc-muted">→</span>
                                        <div className="dc-dt-transition-row__to">
                                            {toList.length === 0 ? (
                                                <span className="dc-muted">нет переходов</span>
                                            ) : (
                                                toList.map((toId) => {
                                                    const to = statuses.find((s) => s.id === toId);
                                                    return (
                                                        <span
                                                            key={toId}
                                                            className="dc-dt-transition-chip"
                                                            onClick={() =>
                                                                commit((d) => toggleTransition(d, dataType.id, from.id, toId))
                                                            }
                                                            title="Клик — удалить переход"
                                                        >
                                                            {to?.name || toId} ×
                                                        </span>
                                                    );
                                                })
                                            )}
                                            <select
                                                className="dc-input dc-input--compact"
                                                style={{ width: 'auto', minWidth: 140 }}
                                                value=""
                                                onChange={(e) => {
                                                    if (e.target.value)
                                                        commit((d) => toggleTransition(d, dataType.id, from.id, e.target.value));
                                                }}
                                            >
                                                <option value="">+ переход в…</option>
                                                {statuses
                                                    .filter((x) => x.id !== from.id && !toList.includes(x.id))
                                                    .map((x) => (
                                                        <option key={x.id} value={x.id}>{x.name || x.id}</option>
                                                    ))}
                                            </select>
                                        </div>
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
                            onChange={(e) => setField('name', e.target.value)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <textarea
                            className="dc-input dc-input--textarea"
                            value={dataType.description ?? ''}
                            onChange={(e) => setField('description', e.target.value)}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">Начальный статус</label>
                        <select
                            className="dc-input"
                            value={dataType.initial ?? ''}
                            onChange={(e) =>
                                commit((d) => setInitialStatus(d, dataType.id, e.target.value))
                            }
                        >
                            <option value="">— не выбран —</option>
                            {statuses.map((s) => (
                                <option key={s.id} value={s.id}>{s.name || s.id}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {tab === 'preview' && (
                <div className="dc-dt-section">
                    <PreviewPanel dataType={dataType} workflowView={view} />
                </div>
            )}

            <BulkPasteDialog
                open={bulkOpen}
                title="Вставить статусы пачкой"
                hint="Каждая строка — название статуса (ID сгенерируется)"
                placeholder={'Новый\nВ работе\nЗакрыт'}
                onClose={() => setBulkOpen(false)}
                onSubmit={(lines) => {
                    commit((d) => bulkAddStatuses(d, dataType.id, lines));
                    toast.success(`Добавлено статусов: ${lines.length}`);
                }}
            />

            <ConfirmDialog
                open={copyOpen}
                title="Скопировать матрицу переходов"
                description={
                    <div>
                        <p>Переходы, у которых from и to есть в текущих статусах, будут скопированы.</p>
                        <select
                            className="dc-input"
                            defaultValue=""
                            onChange={(e) => {
                                if (!e.target.value) return;
                                let n = 0;
                                commit((d) => {
                                    n = copyWorkflowMatrix(d, dataType.id, e.target.value);
                                });
                                if (n === 0) toast.warning('Нет совпадающих статусов');
                                else toast.success(`Скопировано переходов: ${n}`);
                                setCopyOpen(false);
                            }}
                        >
                            <option value="">— выберите workflow —</option>
                            {otherWorkflows.map((w) => (
                                <option key={w.id} value={w.id}>{w.name || w.id}</option>
                            ))}
                        </select>
                    </div>
                }
                confirmLabel="Отмена"
                cancelLabel=""
                danger={false}
                onCancel={() => setCopyOpen(false)}
                onConfirm={() => setCopyOpen(false)}
            />

            <ConfirmDialog
                open={pendingDelete !== null}
                title="Удалить статус?"
                description={
                    <p>
                        Все переходы с этим статусом будут удалены.
                        {isPublished && <><br /><strong>После публикации удаление запрещено.</strong></>}
                    </p>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (pendingDelete === null) return;
                    commit((d) => removeStatus(d, dataType.id, pendingDelete));
                    setPendingDelete(null);
                }}
            />
        </div>
    );
};