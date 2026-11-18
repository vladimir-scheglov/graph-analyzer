import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    updateJoinField, updateJoinSearch, removeJoin, addJoin,
} from './transitiveLinkages-handlers';

interface Props {
    transitiveId: string;
    join: any; // TransitiveLinkageJoin из types
    depth: number;
}

export const JoinNode: FC<Props> = ({ transitiveId, join, depth }) => {
    const commit = useEditorStore((s) => s.commit);
    const search = join.search as { enabled?: boolean; mode?: string } | undefined;

    const set = (field: string, value: unknown) =>
        commit((doc) => updateJoinField(doc, transitiveId, join.id, field, value));

    return (
        <div className="dc-join-node" style={{ marginLeft: depth * 20 }}>
            <div className="dc-join-node__header">
                <code className="dc-code">{join.id || '(без id)'}</code>
                <button
                    className="dc-btn dc-btn--danger dc-btn--icon"
                    onClick={() => commit((doc) => removeJoin(doc, transitiveId, join.id))}
                    title="Удалить узел (и дочерние)"
                >×</button>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={join.id ?? ''}
                        onChange={(e) => set('id', e.target.value)}
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Linkage</label>
                    <input
                        className="dc-input dc-input--compact"
                        value={join.linkage ?? ''}
                        onChange={(e) => set('linkage', e.target.value)}
                        placeholder="id связи"
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!search?.enabled}
                        onChange={(e) =>
                            commit((doc) =>
                                updateJoinSearch(
                                    doc, transitiveId, join.id,
                                    e.target.checked,
                                    (search?.mode as any) ?? 'both',
                                ),
                            )
                        }
                    />{' '}
                    Доступна для поиска
                </label>
                {search?.enabled && (
                    <select
                        className="dc-input dc-input--inline"
                        value={search.mode ?? 'both'}
                        onChange={(e) =>
                            commit((doc) =>
                                updateJoinSearch(doc, transitiveId, join.id, true, e.target.value as any),
                            )
                        }
                    >
                        <option value="entity">По атрибутам связанной сущности</option>
                        <option value="linkage">По атрибутам связи</option>
                        <option value="both">По обоим</option>
                    </select>
                )}
            </div>

            {/* Дочерние */}
            {join.joins && join.joins.length > 0 && (
                <div className="dc-join-node__children">
                    {join.joins.map((child: any, i: number) => (
                        <JoinNode
                            key={child.id || i}
                            transitiveId={transitiveId}
                            join={child}
                            depth={depth + 1}
                        />
                    ))}
                </div>
            )}

            <button
                className="dc-btn dc-btn--dashed"
                style={{ marginTop: 6 }}
                onClick={() => commit((doc) => addJoin(doc, transitiveId, join.id))}
            >+ Дочерний узел</button>
        </div>
    );
};