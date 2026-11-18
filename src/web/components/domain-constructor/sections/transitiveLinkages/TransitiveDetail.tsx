import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { EntitySelect } from '../../ui/EntitySelect';
import { updateTransitiveField, addJoin } from './transitiveLinkages-handlers';
import { JoinNode } from './JoinNode';

export const TransitiveDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const commit = useEditorStore((s) => s.commit);

    if (!selectionKey?.startsWith('transitive:')) {
        return <DetailCard title="" empty emptyText="Выберите транзитивную связь слева" children={null} />;
    }

    const id = selectionKey.slice('transitive:'.length);
    const t = schema.transitiveLinkages.find((x) => x.id === id);

    if (!t) {
        return <DetailCard title="" empty emptyText="Не найдено" children={null} />;
    }

    const set = (field: string, value: unknown) =>
        commit((doc) => updateTransitiveField(doc, t.id, field, value));

    return (
        <DetailCard
            title={t.id}
            subtitle={`Корень: ${short(t.entity)}`}
        >
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={t.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Корневая сущность</label>
                    <EntitySelect
                        value={t.entity}
                        onChange={(v) => set('entity', v ?? '')}
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={t.description ?? ''}
                    onChange={(e) => set('description', e.target.value)}
                />
            </div>

            <div className="dc-constraints__header" style={{ marginTop: 16 }}>
                <h4 className="dc-constraints__title">Узлы ({t.joins.length})</h4>
                <button
                    className="dc-btn dc-btn--primary"
                    onClick={() => commit((doc) => addJoin(doc, t.id, null))}
                >+ Корневой узел</button>
            </div>

            {t.joins.length === 0 && (
                <div className="dc-muted dc-constraints__empty">Нет узлов</div>
            )}

            <div className="dc-join-tree">
                {t.joins.map((j, i) => (
                    <JoinNode
                        key={(j as any).id || i}
                        transitiveId={t.id}
                        join={j}
                        depth={0}
                    />
                ))}
            </div>
        </DetailCard>
    );
};

function short(fqid: string): string {
    const slash = fqid.lastIndexOf('/');
    return slash < 0 ? fqid : fqid.slice(slash + 1);
}