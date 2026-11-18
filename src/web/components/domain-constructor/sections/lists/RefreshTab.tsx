import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ViewSchema } from '../../types';
import { setRefreshMode, updateRefreshDefaults } from './lists-handlers';

interface Props { view: ViewSchema }

export const RefreshTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const refresh = ((view as any).table?.refresh ?? {}) as any;
    const defaults = refresh.defaults ?? {};
    const mode = refresh.mode ?? 'manual';

    return (
        <div>
            <h4 className="dc-constraints__title">Режим обновления</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`refresh-${view.id}`}
                        checked={mode === 'manual'}
                        onChange={() => commit((doc) => setRefreshMode(doc, view.id, 'manual'))}
                    />{' '}
                    Вручную
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`refresh-${view.id}`}
                        checked={mode === 'auto'}
                        onChange={() => commit((doc) => setRefreshMode(doc, view.id, 'auto'))}
                    />{' '}
                    Автоматически
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`refresh-${view.id}`}
                        checked={mode === 'all'}
                        onChange={() => commit((doc) => setRefreshMode(doc, view.id, 'all'))}
                    />{' '}
                    Ручное и автоматическое
                </label>
            </div>

            {(mode === 'auto' || mode === 'all') && (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">
                            <input
                                type="checkbox"
                                className="dc-checkbox"
                                checked={!!defaults.enabled}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateRefreshDefaults(doc, view.id, 'enabled', e.target.checked),
                                    )
                                }
                            />{' '}
                            Автообновление включено по умолчанию
                        </label>
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Интервал</label>
                            <input
                                className="dc-input"
                                type="number"
                                min={1}
                                value={defaults.interval ?? 10}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateRefreshDefaults(doc, view.id, 'interval', Number(e.target.value)),
                                    )
                                }
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Единица</label>
                            <select
                                className="dc-input"
                                value={defaults.unit ?? 'minute'}
                                onChange={(e) =>
                                    commit((doc) =>
                                        updateRefreshDefaults(doc, view.id, 'unit', e.target.value),
                                    )
                                }
                            >
                                <option value="second">секунды</option>
                                <option value="minute">минуты</option>
                                <option value="hour">часы</option>
                            </select>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};