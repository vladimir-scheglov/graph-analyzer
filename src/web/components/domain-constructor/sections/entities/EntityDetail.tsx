import { useState, type FC } from 'react';
import { useEditorStore, selectSelectedEntity } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { InheritableField } from '../../ui/InheritableField';
import { AttributesTab } from './AttributesTab';
import { SortingTab } from './SortingTab';
import { updateEntityField } from './entity-handlers';
import { EntitySelect } from '../../ui/EntitySelect';


type Tab = 'attributes' | 'sorting';

export const EntityDetail: FC = () => {
    const entity = useEditorStore(selectSelectedEntity);
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const [tab, setTab] = useState<Tab>('attributes');

    if (!entity) {
        return <DetailCard title="" empty emptyText="Выберите сущность слева" children={null} />;
    }

    const parentFqid = entity.inherits ? entity.inherits.toLowerCase() : null;
    const parentLabel = parentFqid
        ? (parentFqid.split('/')[1] ?? parentFqid)
        : null;

    const badge = parentFqid ? (
        <span className="dc-badge dc-badge--inherited">наследует {parentLabel}</span>
    ) : undefined;

    return (
        <DetailCard
            title={entity.name || entity.id}
            subtitle={`ID: ${entity.id}`}
            badge={badge}
            tabs={[
                { key: 'attributes', label: `Атрибуты (${entity.attributes.length})` },
                { key: 'sorting', label: `Правила сортировки (${entity.sorting?.length ?? 0})` },
            ]}
            activeTab={tab}
            onTabChange={(k) => setTab(k as Tab)}
        >
            {/* Шапка сущности */}
            <div className="dc-entity-meta">
                <div className="dc-entity-meta__row">
                    <InheritableField
                        label="ID"
                        state={{ value: entity.id, origin: 'own' }}
                        render={(v) => (
                            <input
                                className="dc-input"
                                value={v}
                                disabled  /* id после создания менять нельзя */
                            />
                        )}
                    />
                    <InheritableField
                        label="Название"
                        state={{ value: entity.name ?? '', origin: 'own' }}
                        onChange={(v) =>
                            commit((doc) => updateEntityField(doc, entity.id, 'name', v))
                        }
                    />
                </div>
                <InheritableField
                    label="Описание"
                    kind="textarea"
                    state={{ value: entity.description ?? '', origin: 'own' }}
                    onChange={(v) =>
                        commit((doc) => updateEntityField(doc, entity.id, 'description', v))
                    }
                />
                <InheritableField
                    label="Лейбл"
                    hint="Шаблон названия объекта. Например: {type}: {value}"
                    state={{ value: entity.label ?? '', origin: 'own' }}
                    onChange={(v) =>
                        commit((doc) => updateEntityField(doc, entity.id, 'label', v))
                    }
                    placeholder="{id}"
                />
                {!isPublished && (
                    <div className="dc-field">
                        <div className="dc-field__label-row">
                            <label className="dc-field__label">Родитель</label>
                        </div>
                        <EntitySelect
                            value={entity.inherits ?? null}
                            onChange={(fqid) =>
                                commit((doc) => updateEntityField(doc, entity.id, 'inherits', fqid))
                            }
                            placeholder="— нет —"
                        />
                        <div className="dc-field__hint">
                            Смена родителя удалит все данные бывшего родителя из текущей сущности.
                        </div>
                    </div>
                )}
            </div>

            {/* Вкладки */}
            {tab === 'attributes' && <AttributesTab entity={entity} />}
            {tab === 'sorting' && <SortingTab entity={entity} />}
        </DetailCard>
    );
};