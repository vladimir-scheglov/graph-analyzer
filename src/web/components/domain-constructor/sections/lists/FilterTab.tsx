import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import type { ViewSchema } from '../../types';
import {
    setFilterAttributesType, addFilterAttribute, removeFilterAttribute, updateFilterAttribute,
    setFilterLinkagesType, addFilterLinkage, removeFilterLinkage, updateFilterLinkageField,
} from './lists-handlers';
import { LinkageSelect } from '../../ui/LinkageSelect';

interface Props { view: ViewSchema }

export const FilterTab: FC<Props> = ({ view }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const filter = ((view as any).table?.filter ?? {}) as any;
    const attrs = filter.attributes ?? {};
    const linkages = filter.linkages ?? {};

    const view2 = view as any;
    const sourceEntity = view2.source?.entity;
    const entityObj = sourceEntity
        ? schema.entities.find((e) => e.id === sourceEntity)
        : null;

    return (
        <div>
            <h4 className="dc-constraints__title">Фильтрация по атрибутам</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`filterAttr-${view.id}`}
                        checked={(attrs.type ?? 'all') === 'all'}
                        onChange={() => commit((doc) => setFilterAttributesType(doc, view.id, 'all'))}
                    />{' '}
                    Все атрибуты
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`filterAttr-${view.id}`}
                        checked={attrs.type === 'specific'}
                        onChange={() => commit((doc) => setFilterAttributesType(doc, view.id, 'specific'))}
                    />{' '}
                    Только указанные
                </label>
            </div>

            {attrs.type === 'specific' && (
                <>
                    <div className="dc-constraints__header">
                        <span className="dc-muted">Атрибуты в фильтре</span>
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => commit((doc) => addFilterAttribute(doc, view.id))}
                        >+ атрибут</button>
                    </div>

                    {(attrs.use ?? []).map((u: any, i: number) => (
                        <div key={i} className="dc-constraint">
                            <div className="dc-constraint__header">
                                <span className="dc-constraint__kind">#{i + 1}</span>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => commit((doc) => removeFilterAttribute(doc, view.id, i))}
                                >×</button>
                            </div>
                            <select
                                className="dc-input"
                                value={u.attribute ?? ''}
                                onChange={(e) =>
                                    commit((doc) => updateFilterAttribute(doc, view.id, i, e.target.value))
                                }
                            >
                                <option value="">—</option>
                                {entityObj?.attributes?.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                ))}
                            </select>
                        </div>
                    ))}
                </>
            )}

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Фильтрация по связям
            </h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`filterLink-${view.id}`}
                        checked={(linkages.type ?? 'all') === 'all'}
                        onChange={() => commit((doc) => setFilterLinkagesType(doc, view.id, 'all'))}
                    />{' '}
                    Все связи
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`filterLink-${view.id}`}
                        checked={linkages.type === 'specific'}
                        onChange={() => commit((doc) => setFilterLinkagesType(doc, view.id, 'specific'))}
                    />{' '}
                    Только указанные
                </label>
            </div>

            {linkages.type === 'specific' && (
                <>
                    <div className="dc-constraints__header">
                        <span className="dc-muted">Связи в фильтре</span>
                        <button
                            className="dc-btn dc-btn--dashed"
                            onClick={() => commit((doc) => addFilterLinkage(doc, view.id))}
                        >+ связь</button>
                    </div>

                    {(linkages.use ?? []).map((u: any, i: number) => (
                        <div key={i} className="dc-constraint">
                            <div className="dc-constraint__header">
                                <span className="dc-constraint__kind">#{i + 1}</span>
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() => commit((doc) => removeFilterLinkage(doc, view.id, i))}
                                >×</button>
                            </div>
                            <LinkageSelect
                                value={u.linkage ?? null}
                                onChange={(v) =>
                                    commit((doc) =>
                                        updateFilterLinkageField(doc, view.id, i, 'linkage', v ?? ''),
                                    )
                                }
                            />
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};