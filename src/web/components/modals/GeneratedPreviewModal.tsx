import React, { useMemo } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { buildSchemaPreview, collectPreviewActions } from "../../lib/model/schema-preview";
import type { PreviewView, PreviewWidget, PreviewGroup } from "../../lib/model/schema-preview";
import { MIcon } from "../common/MIcon";

function viewIcon(kind: string): string {
    switch (kind) {
        case "entity": return "view_quilt";
        case "list": return "table_rows";
        case "panel": return "view_sidebar";
        case "modal": return "open_in_new";
        case "page": return "fullscreen";
        default: return "view";
    }
}

export function GeneratedPreviewModal() {
    const open = useGraphStore((s) => s.generatedPreviewOpen);
    const setOpen = useGraphStore((s) => s.setGeneratedPreviewOpen);
    const data = useGraphStore((s) => s.generatedPreviewData);

    const preview = useMemo(() => {
        if (!data) return null;
        return buildSchemaPreview(data.blocks, {
            entityId: data.entityId,
            domainId: data.domainId,
        });
    }, [data]);

    const actions = useMemo(
        () => (data ? collectPreviewActions(data.blocks) : new Map()),
        [data],
    );

    const [activeViewId, setActiveViewId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!preview) return;
        if (preview.views.length === 0) {
            setActiveViewId(null);
            return;
        }
        if (!activeViewId || !preview.views.find((v) => v.id === activeViewId)) {
            // По умолчанию — первая карточка (entity/panel/page), а не list
            const firstCard = preview.views.find((v) => v.kind !== "list");
            setActiveViewId(firstCard?.id || preview.views[0].id);
        }
    }, [preview, activeViewId]);

    if (!open || !data || !preview) return null;

    const active = preview.views.find((v) => v.id === activeViewId) || null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            style={{ zIndex: 500 }}
            onMouseDown={() => setOpen(false)}
        >
            <div
                className="help-modal generated-preview-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="visibility" size="sm" />
                        <span className="icon-label">Превью генерации</span>
                        {data.entityId && (
                            <span className="help-modal__badge">{data.entityId}</span>
                        )}
                        <span
                            style={{
                                marginLeft: 10,
                                paddingLeft: 10,
                                borderLeft: "1px solid var(--border)",
                                fontSize: 11,
                                color: "var(--text-500)",
                                fontWeight: 400,
                            }}
                        >
                            Схематичный wireframe · не финальный UI
                        </span>
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>
                        ✕
                    </button>
                </div>

                <div className="generated-preview-body">
                    <div className="generated-preview-sidebar">
                        <div className="generated-preview-sidebar__title">
                            Views ({preview.views.length})
                        </div>
                        {preview.views.length === 0 && (
                            <div className="generated-preview-sidebar__empty">
                                В выбранных блоках нет views
                            </div>
                        )}
                        {preview.views.map((v) => (
                            <button
                                key={v.id}
                                className={
                                    "generated-preview-nav" +
                                    (v.id === activeViewId ? " active" : "")
                                }
                                onClick={() => setActiveViewId(v.id)}
                            >
                                <MIcon name={viewIcon(v.kind)} size="sm" />
                                <span className="generated-preview-nav__id">{v.id}</span>
                                <span className="generated-preview-nav__type">{v.kind}</span>
                            </button>
                        ))}
                    </div>

                    <div className="generated-preview-canvas">
                        {active ? (
                            <ViewPreview view={active} actions={actions} />
                        ) : (
                            <div className="generated-preview-empty">Выберите view</div>
                        )}
                    </div>
                </div>

                <div className="generated-preview-footer">
                    <span className="generated-preview-footer__hint">
                        <MIcon name="info" size="sm" />
                        Проверьте состав полей, групп и кнопок. Если что-то не так —
                        вернитесь к параметрам профиля и поправьте.
                        {preview.skippedBlocks > 0 && (
                            <>
                                {" "}
                                · Пропущено блоков: {preview.skippedBlocks} (не view)
                            </>
                        )}
                    </span>
                    <button className="btn" onClick={() => setOpen(false)}>
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============ Рендер одного view ============

function ViewPreview({
    view,
    actions,
}: {
    view: PreviewView;
    actions: Map<string, any>;
}) {
    if (view.kind === "list") return <ListViewPreview view={view} actions={actions} />;
    return <CardViewPreview view={view} actions={actions} />;
}

function ListViewPreview({
    view,
    actions,
}: {
    view: PreviewView;
    actions: Map<string, any>;
}) {
    return (
        <div className="preview-list">
            <div className="preview-list__header">
                <span>{view.label || view.id}</span>
                {view.actionPanel && view.actionPanel.length > 0 && (
                    <div className="preview-list__actions">
                        {view.actionPanel.map((w) => {
                            const actionId = w.replace(/^buttons_/, "actions_");
                            const a = actions.get(actionId);
                            return (
                                <span key={w} className="preview-btn preview-btn--primary">
                                    {a?.name || actionId}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
            <table className="preview-table">
                <thead>
                    <tr>
                        {(view.tableColumns || []).map((c) => (
                            <th key={c.id}>{c.label}</th>
                        ))}
                        {(!view.tableColumns || view.tableColumns.length === 0) && (
                            <th>—</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    <tr className="preview-table__empty">
                        <td colSpan={Math.max(1, view.tableColumns?.length || 0)}>
                            Данные отсутствуют
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

function CardViewPreview({
    view,
    actions,
}: {
    view: PreviewView;
    actions: Map<string, any>;
}) {
    // Поля и группы — в 2 колонки для компактности
    return (
        <div className="preview-card">
            <div className="preview-card__header">
                <span>{view.label || view.id}</span>
                {view.menu.length > 0 && (
                    <div className="preview-card__menu">
                        {view.menu.map((m) => {
                            const a = actions.get(m);
                            return (
                                <span key={m} className="preview-btn">
                                    {a?.name || m}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>

            {view.tabs.length > 0 && (
                <div className="preview-tabs">
                    {view.tabs.map((t, i) => (
                        <div
                            key={t.id}
                            className={"preview-tab" + (i === 0 ? " active" : "")}
                        >
                            {t.label}
                        </div>
                    ))}
                </div>
            )}

            <div className="preview-card__body">
                {view.groups.map((g) => (
                    <PreviewGroupBlock
                        key={g.id}
                        group={g}
                        actions={actions}
                        depth={0}
                    />
                ))}
                {view.widgets.length > 0 && (
                    <PreviewFieldGrid>
                        {view.widgets.map((w) => (
                            <PreviewWidgetRow key={w.id} widget={w} actions={actions} />
                        ))}
                    </PreviewFieldGrid>
                )}
                {view.groups.length === 0 && view.widgets.length === 0 && (
                    <div
                        style={{
                            padding: 20,
                            textAlign: "center",
                            color: "var(--text-500)",
                            fontStyle: "italic",
                            fontSize: 12,
                        }}
                    >
                        Пустая карточка — нет ни групп, ни виджетов
                    </div>
                )}
            </div>
        </div>
    );
}

function PreviewFieldGrid({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
            }}
        >
            {children}
        </div>
    );
}

function PreviewGroupBlock({
    group,
    actions,
    depth,
}: {
    group: PreviewGroup;
    actions: Map<string, any>;
    depth: number;
}) {
    if (depth > 3) return null;
    return (
        <div className={"preview-group preview-group--" + group.type}>
            {group.label && (
                <div className="preview-group__label">{group.label}</div>
            )}
            <div className="preview-group__body">
                {group.widgets.length > 0 && (
                    <PreviewFieldGrid>
                        {group.widgets.map((w) => (
                            <PreviewWidgetRow key={w.id} widget={w} actions={actions} />
                        ))}
                    </PreviewFieldGrid>
                )}
                {group.nestedGroups.map((g) => (
                    <PreviewGroupBlock
                        key={g.id}
                        group={g}
                        actions={actions}
                        depth={depth + 1}
                    />
                ))}
                {group.widgets.length === 0 && group.nestedGroups.length === 0 && (
                    <div className="preview-group__empty">Пусто</div>
                )}
            </div>
        </div>
    );
}

function PreviewWidgetRow({
    widget,
    actions,
}: {
    widget: PreviewWidget;
    actions: Map<string, any>;
}) {
    if (widget.type === "action") {
        const actionId = widget.actions?.[0];
        const a = actionId ? actions.get(actionId) : null;
        return (
            <span className="preview-btn">
                {a?.name || actionId || widget.id}
            </span>
        );
    }
    if (widget.type === "attribute") {
        return (
            <div className="preview-field">
                <label className="preview-field__label">
                    {widget.label || widget.id}
                </label>
                <input
                    className="preview-field__input"
                    disabled
                    value=""
                    placeholder={widget.controlType || "text"}
                />
            </div>
        );
    }
    if (widget.type === "linkage") {
        return (
            <div className="preview-linkage">
                <span className="preview-linkage__label">
                    {widget.label || widget.linkageId || widget.id}
                </span>
                <span className="preview-linkage__count">0</span>
            </div>
        );
    }
    return (
        <div className="preview-widget-fallback">
            [{widget.type}] {widget.id}
        </div>
    );
}