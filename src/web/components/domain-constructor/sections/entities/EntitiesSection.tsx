import { useMemo, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { EntityDetail } from "./EntityDetail";
import { AddEntityModal } from "./AddEntityModal";
import { deleteEntity } from "./entity-handlers";

export const EntitiesSection: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const select = useEditorStore((s) => s.select);
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
    const [query, setQuery] = useState("");

    const selectedId = selectionKey?.startsWith("entity:")
        ? selectionKey.slice("entity:".length).split("/")[0]
        : null;

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return schema.entities;
        return schema.entities.filter(
            (e) => e.id.toLowerCase().includes(q) || (e.name ?? "").toLowerCase().includes(q),
        );
    }, [schema.entities, query]);

    return (
        <div className="dc-section ent">
            <div className="ent-layout">
                <aside className="ent-list">
                    <div className="ent-list__head">
                        <div className="ent-list__title-row">
                            <span className="ent-list__title">Сущности</span>
                            <span className="ent-list__count">{schema.entities.length}</span>
                        </div>
                        <div className="ent-search-wrap">
                            <input
                                className="ent-input ent-input--search"
                                placeholder="Поиск по названию и ID…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <button
                            className="ent-btn ent-btn--primary"
                            style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
                            onClick={() => setAddOpen(true)}
                        >
                            + Новая сущность
                        </button>
                    </div>

                    <div className="ent-list__items ent-scroll">
                        {filtered.length === 0 && (
                            <div className="ent-empty" style={{ padding: "28px 12px" }}>
                                <div className="ent-empty__icon">◈</div>
                                <div className="ent-empty__title" style={{ fontSize: 13 }}>
                                    {query ? "Ничего не найдено" : "Нет сущностей"}
                                </div>
                                {!query && (
                                    <div className="ent-empty__hint">
                                        Создайте первую сущность — основу домена.
                                    </div>
                                )}
                            </div>
                        )}
                        {filtered.map((e, i) => {
                            const requiredCount = e.attributes.filter((a) =>
                                (a.constraints ?? []).some((c) => c.kind === "required"),
                            ).length;
                            return (
                                <button
                                    key={e.id}
                                    className={
                                        "ent-entity-item" + (e.id === selectedId ? " ent-entity-item--active" : "")
                                    }
                                    style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}
                                    onClick={() => select(`entity:${e.id}`)}
                                >
                                    <div className="ent-entity-item__row">
                                        <span className="ent-entity-item__name">{e.name || e.id}</span>
                                        {e.scanTarget && <span title="Цель сканирования">🎯</span>}
                                    </div>
                                    <span className="ent-entity-item__id">{e.id}</span>
                                    <div className="ent-entity-item__badges">
                                        <span className="ent-pill ent-pill--accent">{e.attributes.length} атр.</span>
                                        {requiredCount > 0 && <span className="ent-pill ent-pill--warn">{requiredCount} обяз.</span>}
                                        {e.inherits && <span className="ent-pill">↳ наследует</span>}
                                        {e.kind && e.kind !== "regular" && (
                                            <span className="ent-pill ent-pill--kind">{e.kind}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className="ent-main">
                    <EntityDetail />
                </main>
            </div>

            <AddEntityModal open={addOpen} onClose={() => setAddOpen(false)} />

            <ConfirmDialog
                open={!!pendingDelete}
                title={`Удалить сущность «${pendingDelete}»?`}
                description={
                    <div>
                        <p>Все атрибуты и правила сортировки сущности будут удалены.</p>
                        <p className="dc-muted">
                            Ссылки из связей, виджетов и правил останутся в схеме и станут битыми.
                            Действие можно отменить через ↶ (Ctrl+Z).
                        </p>
                    </div>
                }
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return;
                    commit((doc) => deleteEntity(doc, pendingDelete));
                    if (selectedId === pendingDelete) select(null);
                    setPendingDelete(null);
                }}
            />
            {/* delete инициируется из EntityDetail через кастомное событие-пропс ниже */}
            <DeleteBridge onDelete={(id) => setPendingDelete(id)} />
        </div>
    );
};

// Мост: EntityDetail диспатчит событие удаления, секция показывает ConfirmDialog.
import { useEffect } from "react";
export const ENT_DELETE_EVENT = "ent:request-delete";
const DeleteBridge: FC<{ onDelete: (id: string) => void }> = ({ onDelete }) => {
    useEffect(() => {
        const handler = (e: Event) => onDelete((e as CustomEvent<string>).detail);
        window.addEventListener(ENT_DELETE_EVENT, handler);
        return () => window.removeEventListener(ENT_DELETE_EVENT, handler);
    }, [onDelete]);
    return null;
};