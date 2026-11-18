import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import {
    enableExchange, disableExchange, updateExchangeTop,
    updateAttributeFormat,
    enableEntityExchange, disableEntityExchange, updateEntityExchangeField,
} from './exchangeSettings-handlers';

export const ExchangeSettingsSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const settings = (schema as any).exchangeSettings;

    if (!settings) {
        return (
            <div className="dc-section" style={{ padding: 16 }}>
                <DetailCard title="Настройки обмена" emptyText="">
                    <p>Настройки обмена не заданы для этого домена.</p>
                    <button
                        className="dc-btn dc-btn--primary"
                        onClick={() => commit((doc) => enableExchange(doc))}
                    >
                        Включить обмен данными
                    </button>
                </DetailCard>
            </div>
        );
    }

    const entities = settings.entities ?? {};
    const attributeFormats = settings.attributeFormats ?? {};

    return (
        <div className="dc-section" style={{ padding: 16, flexDirection: 'column', overflow: 'auto' }}>
            <DetailCard title="Настройки обмена">
                <div className="dc-field">
                    <label className="dc-field__label">
                        <input
                            type="checkbox"
                            className="dc-checkbox"
                            checked={settings.enable !== false}
                            onChange={(e) =>
                                commit((doc) =>
                                    e.target.checked
                                        ? enableExchange(doc)
                                        : disableExchange(doc),
                                )
                            }
                        />{' '}
                        Обмен включён
                    </label>
                </div>

                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">label</label>
                        <input
                            className="dc-input"
                            value={settings.label ?? ''}
                            onChange={(e) =>
                                commit((doc) => updateExchangeTop(doc, 'label', e.target.value))
                            }
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">description</label>
                        <input
                            className="dc-input"
                            value={settings.description ?? ''}
                            onChange={(e) =>
                                commit((doc) => updateExchangeTop(doc, 'description', e.target.value))
                            }
                        />
                    </div>
                </div>

                <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Форматы даты/времени</h4>

                {(['Date', 'Time', 'Timestamp', 'TimestampRange'] as const).map((t) => (
                    <div className="dc-field" key={t}>
                        <label className="dc-field__label">{t}</label>
                        <input
                            className="dc-input"
                            value={attributeFormats[t] ?? ''}
                            onChange={(e) => commit((doc) => updateAttributeFormat(doc, t, e.target.value))}
                            placeholder={
                                t === 'Date' ? 'DD-MM-YYYY'
                                    : t === 'Time' ? 'HH:mm:ss'
                                        : 'DD-MM-YYYYTHH:mm:ss'
                            }
                        />
                    </div>
                ))}

                <h4 className="dc-constraints__title" style={{ marginTop: 24 }}>
                    Сущности ({Object.keys(entities).length})
                </h4>

                {schema.entities.map((e) => {
                    const entitySettings = entities[e.id];
                    const enabled = !!entitySettings;
                    return (
                        <div key={e.id} className="dc-constraint">
                            <div className="dc-constraint__header">
                                <label className="dc-field__label" style={{ margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        className="dc-checkbox"
                                        checked={enabled}
                                        onChange={(ev) =>
                                            commit((doc) =>
                                                ev.target.checked
                                                    ? enableEntityExchange(doc, e.id)
                                                    : disableEntityExchange(doc, e.id),
                                            )
                                        }
                                    />{' '}
                                    <code>{e.name || e.id}</code>
                                </label>
                            </div>

                            {enabled && (
                                <>
                                    <div className="dc-field-row">
                                        <div className="dc-field">
                                            <label className="dc-field__label">label</label>
                                            <input
                                                className="dc-input dc-input--compact"
                                                value={entitySettings.label ?? ''}
                                                onChange={(ev) =>
                                                    commit((doc) =>
                                                        updateEntityExchangeField(doc, e.id, 'label', ev.target.value || undefined),
                                                    )
                                                }
                                            />
                                        </div>
                                        <div className="dc-field">
                                            <label className="dc-field__label">domainLabel</label>
                                            <input
                                                className="dc-input dc-input--compact"
                                                value={entitySettings.domainLabel ?? ''}
                                                onChange={(ev) =>
                                                    commit((doc) =>
                                                        updateEntityExchangeField(doc, e.id, 'domainLabel', ev.target.value || undefined),
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="dc-field-row">
                                        <div className="dc-field">
                                            <label className="dc-field__label">forExport (атрибут)</label>
                                            <select
                                                className="dc-input dc-input--compact"
                                                value={entitySettings.forExport ?? ''}
                                                onChange={(ev) =>
                                                    commit((doc) =>
                                                        updateEntityExchangeField(doc, e.id, 'forExport', ev.target.value || undefined),
                                                    )
                                                }
                                            >
                                                <option value="">—</option>
                                                {e.attributes.map((a) => (
                                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="dc-field">
                                            <label className="dc-field__label">upsertWith (через запятую)</label>
                                            <input
                                                className="dc-input dc-input--compact"
                                                value={entitySettings.upsertWith ?? ''}
                                                onChange={(ev) =>
                                                    commit((doc) =>
                                                        updateEntityExchangeField(doc, e.id, 'upsertWith', ev.target.value || undefined),
                                                    )
                                                }
                                            />
                                        </div>
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">ignoreAttributes (через запятую)</label>
                                        <input
                                            className="dc-input dc-input--compact"
                                            value={entitySettings.ignoreAttributes ?? ''}
                                            onChange={(ev) =>
                                                commit((doc) =>
                                                    updateEntityExchangeField(doc, e.id, 'ignoreAttributes', ev.target.value || undefined),
                                                )
                                            }
                                        />
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">exportSystemAttributes</label>
                                        <input
                                            className="dc-input dc-input--compact"
                                            value={
                                                entitySettings.exportSystemAttributes === 'all'
                                                    ? 'all'
                                                    : (entitySettings.exportSystemAttributes ?? []).join(',')
                                            }
                                            onChange={(ev) => {
                                                const v = ev.target.value.trim();
                                                const val = v === 'all'
                                                    ? 'all'
                                                    : v.split(',').map((s) => s.trim()).filter(Boolean);
                                                commit((doc) =>
                                                    updateEntityExchangeField(
                                                        doc, e.id, 'exportSystemAttributes',
                                                        v === '' ? undefined : val,
                                                    ),
                                                );
                                            }}
                                            placeholder="all или id,id"
                                        />
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">
                                            <input
                                                type="checkbox"
                                                className="dc-checkbox"
                                                checked={!!entitySettings.noCmsSync}
                                                onChange={(ev) =>
                                                    commit((doc) =>
                                                        updateEntityExchangeField(doc, e.id, 'noCmsSync', ev.target.checked),
                                                    )
                                                }
                                            />{' '}
                                            noCmsSync (не использовать sdk.cms.sync)
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </DetailCard>
        </div>
    );
};