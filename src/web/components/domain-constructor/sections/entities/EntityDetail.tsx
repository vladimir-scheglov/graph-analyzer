import { useEffect, useState, type FC } from "react";
import { useEditorStore, selectSelectedEntity } from "../../store/editor-store";
import { duplicateEntity } from "./entity-handlers";
import { EntityOverviewTab } from "./EntityOverviewTab";
import { AttributesTab } from "./AttributesTab";
import { SortingTab } from "./SortingTab";
import { EmptyState } from "./ui";
import { ENT_DELETE_EVENT } from "./EntitiesSection";

type Tab = "overview" | "attributes" | "sorting";

export const EntityDetail: FC = () => {
    const entity = useEditorStore(selectSelectedEntity);
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);
    const isPublished = useEditorStore((s) => s.isPublished);
    const [tab, setTab] = useState<Tab>("attributes");

    useEffect(() => {
        setTab("attributes");
    }, [entity?.id]);

    if (!entity) {
        return (
            <div className="ent-main__scroll ent-scroll">
                <EmptyState
                    icon="◈"
                    title="Выберите сущность слева"
                    hint="Или создайте новую: название на русском автоматически превратится в корректный Data ID, а атрибуты можно вставить прямо из таблицы ТЗ."
                />
            </div>
        );
    }

    const parentLabel = entity.inherits
        ? entity.inherits.split("/").pop() ?? entity.inherits
        : null;

    const linkagesCount = schema.linkages.filter((l) => {
        const s1 = l.side1.split("/").pop()?.toLowerCase();
        const s2 = l.side2.split("/").pop()?.toLowerCase();
        const id = entity.id.toLowerCase();
        return s1 === id || s2 === id;
    }).length;

    const handleDuplicate = () => {
        let newId: string | null = null;
        commit((doc) => {
            newId = duplicateEntity(doc, entity.id);
        });
        if (newId) select(`entity:${newId}`);
    };

    return (
        <>
            <header className="ent-header">
                <div className="ent-header__top">
                    <div className="ent-header__avatar">
                        {(entity.name || entity.id).charAt(0).toUpperCase()}
                    </div>
                    <div className="ent-header__titles">
                        <h2 className="ent-header__name">
                            {entity.name || entity.id}
                            {entity.kind && entity.kind !== "regular" && (
                                <span className="ent-pill ent-pill--kind">{entity.kind}</span>
                            )}
                            {parentLabel && <span className="ent-pill">↳ {parentLabel}</span>}
                            {isPublished && <span className="ent-pill ent-pill--warn">опубликована</span>}
                        </h2>
                        <div className="ent-header__sub">
                            {entity.id} · {entity.attributes.length} атрибутов · {linkagesCount} связей
                        </div>
                    </div>
                    <div className="ent-header__actions">
                        <button className="ent-btn ent-btn--sm" onClick={handleDuplicate} title="Создать копию сущности со всеми атрибутами">
                            ⧉ Дублировать
                        </button>
                        <button
                            className="ent-btn ent-btn--danger ent-btn--sm"
                            disabled={isPublished}
                            title={isPublished ? "Удаление опубликованной сущности несовместимо с предыдущей версией" : "Удалить сущность"}
                            onClick={() => window.dispatchEvent(new CustomEvent(ENT_DELETE_EVENT, { detail: entity.id }))}
                        >
                            × Удалить
                        </button>
                    </div>
                </div>
                <nav className="ent-tabs">
                    {(
                        [
                            { key: "attributes", label: "Атрибуты", count: entity.attributes.length },
                            { key: "overview", label: "Обзор и настройки", count: null },
                            { key: "sorting", label: "Сортировка", count: entity.sorting?.length ?? 0 },
                        ] as Array<{ key: Tab; label: string; count: number | null }>
                    ).map((t) => (
                        <button
                            key={t.key}
                            className={"ent-tab" + (tab === t.key ? " ent-tab--active" : "")}
                            onClick={() => setTab(t.key)}
                        >
                            {t.label}
                            {t.count !== null && <span className="ent-tab__count">{t.count}</span>}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="ent-main__scroll ent-scroll">
                {tab === "attributes" && <AttributesTab entity={entity} />}
                {tab === "overview" && <EntityOverviewTab entity={entity} />}
                {tab === "sorting" && <SortingTab entity={entity} />}
            </div>
        </>
    );
};