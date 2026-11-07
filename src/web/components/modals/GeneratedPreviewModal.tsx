// src/web/components/modals/GeneratedPreviewModal.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import {
    buildSchemaPreview,
    countPreviewActionsByType,
    type PreviewView,
    type PreviewWidget,
    type PreviewGroup,
    type PreviewAction,
    type PreviewIssue,
    type SchemaPreview,
} from "../../lib/model/schema-preview";
import { MIcon } from "../common/MIcon";

// ============ Корень модалки ============

export function GeneratedPreviewModal() {
    const open = useGraphStore((s) => s.generatedPreviewOpen);
    const setOpen = useGraphStore((s) => s.setGeneratedPreviewOpen);
    const data = useGraphStore((s) => s.generatedPreviewData);
    const { index } = useModelIndex();

    const preview = useMemo<SchemaPreview | null>(() => {
        if (!data) return null;
        return buildSchemaPreview(data.blocks, {
            entityId: data.entityId,
            domainId: data.domainId,
            index,
        });
    }, [data, index]);

    const [activeViewId, setActiveViewId] = useState<string | null>(null);
    const [inspector, setInspector] = useState<InspectorSubject | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

    // Дефолтный view — первая карточка
    React.useEffect(() => {
        if (!preview) return;
        if (activeViewId && preview.views.find((v) => v.id === activeViewId)) return;
        const first = preview.views.find((v) => v.kind !== "list") || preview.views[0];
        setActiveViewId(first?.id || null);
        setBreadcrumbs([]);
    }, [preview, activeViewId]);

    // Стек крошек — не история кликов, а текущий путь.
    // Если view уже есть в стеке — это возврат «назад»: обрезаем стек до него.
    // Если view === activeViewId — no-op.
    const navigateTo = useCallback((viewId: string) => {
        if (!preview) return;
        if (!preview.views.find((v) => v.id === viewId)) return;
        if (viewId === activeViewId) return;

        setBreadcrumbs((prev) => {
            const idx = prev.indexOf(viewId);
            if (idx >= 0) {
                // Возврат к предку — обрезаем историю до него
                return prev.slice(0, idx);
            }
            // Новый view — добавляем текущий в стек
            return activeViewId ? [...prev, activeViewId] : prev;
        });
        setActiveViewId(viewId);
        setInspector(null);
    }, [preview, activeViewId]);

    const navigateBack = useCallback(() => {
        if (breadcrumbs.length === 0) return;
        const prevId = breadcrumbs[breadcrumbs.length - 1];
        setBreadcrumbs(breadcrumbs.slice(0, -1));
        setActiveViewId(prevId);
        setInspector(null);
    }, [breadcrumbs]);

    const jumpToBreadcrumb = useCallback((idx: number) => {
        if (idx < 0 || idx >= breadcrumbs.length) return;
        const target = breadcrumbs[idx];
        setBreadcrumbs(breadcrumbs.slice(0, idx));
        setActiveViewId(target);
        setInspector(null);
    }, [breadcrumbs]);

    const trailRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = trailRef.current;
        if (!el) return;
        el.scrollLeft = el.scrollWidth;
    }, [breadcrumbs.length, activeViewId]);

    if (!open || !data || !preview) return null;

    const active = preview.views.find((v) => v.id === activeViewId) || null;
    const problemsByViewId = new Map<string, PreviewIssue[]>();
    for (const iss of preview.issues) {
        const m = iss.subject.match(/^view (\S+)/);
        if (m) {
            if (!problemsByViewId.has(m[1])) problemsByViewId.set(m[1], []);
            problemsByViewId.get(m[1])!.push(iss);
        }
    }

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
                        <span className="help-modal__badge">
                            {preview.views.length} view · {preview.actions.length} actions
                        </span>
                        {preview.issues.length > 0 && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "rgba(245,158,11,0.15)",
                                    color: "#f59e0b",
                                }}
                                title={preview.issues.map((i) => `[${i.severity}] ${i.message}`).join("\n")}
                            >
                                ⚠ {preview.issues.length} проблем
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>
                        ✕
                    </button>
                </div>

                <div className="generated-preview-body">
                    <ViewTree
                        preview={preview}
                        activeViewId={activeViewId}
                        problemsByViewId={problemsByViewId}
                        onNavigate={navigateTo}
                    />

                    <div className="generated-preview-canvas">
                        <Breadcrumbs
                            view={active}
                            breadcrumbs={breadcrumbs}
                            onBack={navigateBack}
                            onJump={jumpToBreadcrumb}
                            trailRef={trailRef}
                        />
                        {active ? (
                            <ViewPreview
                                view={active}
                                actions={preview.actions}
                                entityChain={preview.entityChain}
                                onNavigate={navigateTo}
                                onInspect={setInspector}
                                inspector={inspector}
                            />
                        ) : (
                            <div className="generated-preview-empty">Выберите view</div>
                        )}
                    </div>

                    {inspector && (
                        <Inspector
                            subject={inspector}
                            actions={preview.actions}
                            onClose={() => setInspector(null)}
                            onNavigate={navigateTo}
                        />
                    )}
                </div>

                {preview.actions.length > 0 && (
                    <ActionsSummary
                        actions={preview.actions}
                        onNavigate={navigateTo}
                        viewIds={preview.views.map((v) => v.id)}
                    />
                )}

                <div className="generated-preview-footer">
                    <span className="generated-preview-footer__hint">
                        <MIcon name="info" size="sm" />
                        Схематичный wireframe · не финальный UI. Кликните по кнопке или
                        элементу, чтобы посмотреть детали.
                        {preview.skippedBlocks > 0 && (
                            <>
                                {" "}
                                · Пропущено: {preview.skippedBlocks}
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

// ============ Дерево views ============

function ViewTree({
    preview,
    activeViewId,
    problemsByViewId,
    onNavigate,
}: {
    preview: SchemaPreview;
    activeViewId: string | null;
    problemsByViewId: Map<string, PreviewIssue[]>;
    onNavigate: (viewId: string) => void;
}) {
    // Иерархия: parentViewId → children
    const tree = useMemo(() => {
        const byParent = new Map<string | null, PreviewView[]>();
        for (const v of preview.views) {
            const key = v.parentViewId || null;
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key)!.push(v);
        }
        return byParent;
    }, [preview.views]);

    const renderNode = (v: PreviewView, depth: number): React.ReactNode => {
        const children = tree.get(v.id) || [];
        const problems = problemsByViewId.get(v.id) || [];
        const isActive = v.id === activeViewId;
        const icon =
            v.kind === "entity"
                ? "view_quilt"
                : v.kind === "list"
                    ? "table_rows"
                    : v.kind === "panel"
                        ? "view_sidebar"
                        : v.kind === "modal"
                            ? "open_in_new"
                            : "fullscreen";

        return (
            <React.Fragment key={v.id}>
                <button
                    className={
                        "generated-preview-nav" + (isActive ? " active" : "")
                    }
                    style={{ paddingLeft: 12 + depth * 16 }}
                    onClick={() => onNavigate(v.id)}
                    title={v.label || v.id}
                >
                    <MIcon name={icon} size="sm" />
                    <span className="generated-preview-nav__id">{v.id}</span>
                    <span className="generated-preview-nav__type">{v.kind}</span>
                    {problems.length > 0 && (
                        <span
                            className="generated-preview-nav__warn"
                            title={problems.map((p) => p.message).join("\n")}
                        >
                            ⚠
                        </span>
                    )}
                </button>
                {children.map((c) => renderNode(c, depth + 1))}
            </React.Fragment>
        );
    };

    const roots = tree.get(null) || [];

    return (
        <div className="generated-preview-sidebar">
            <div className="generated-preview-sidebar__title">
                Views ({preview.views.length})
            </div>
            {roots.length === 0 && (
                <div className="generated-preview-sidebar__empty">
                    В выбранных блоках нет views
                </div>
            )}
            {roots.map((v) => renderNode(v, 0))}
        </div>
    );
}

// ============ Breadcrumbs ============

function Breadcrumbs({
    view,
    breadcrumbs,
    onBack,
    onJump,
    trailRef,
}: {
    view: PreviewView | null;
    breadcrumbs: string[];
    onBack: () => void;
    onJump: (idx: number) => void;
    trailRef: React.RefObject<HTMLDivElement>;
}) {
    return (
        <div className="generated-preview-breadcrumbs">
            <button
                className="generated-preview-breadcrumbs__back"
                onClick={onBack}
                disabled={breadcrumbs.length === 0}
                title="Назад"
            >
                <MIcon name="arrow_back" size="sm" />
            </button>
            <div
                className="generated-preview-breadcrumbs__trail"
                ref={trailRef}
            >
                {breadcrumbs.map((id, i) => (
                    <React.Fragment key={`${id}-${i}`}>
                        {i > 0 && (
                            <span className="generated-preview-breadcrumbs__sep">›</span>
                        )}
                        <button
                            className="generated-preview-breadcrumbs__item"
                            onClick={() => onJump(i)}
                            title={id}
                        >
                            {id}
                        </button>
                    </React.Fragment>
                ))}
                {view && (
                    <>
                        {breadcrumbs.length > 0 && (
                            <span className="generated-preview-breadcrumbs__sep">›</span>
                        )}
                        <span className="generated-preview-breadcrumbs__item generated-preview-breadcrumbs__item--current" title={view.id}>
                            {view.id}
                        </span>
                        <span
                            className={
                                "generated-preview-breadcrumbs__kind generated-preview-breadcrumbs__kind--" +
                                view.kind
                            }
                        >
                            {view.kind}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

// ============ ViewPreview ============

function ViewPreview({
    view,
    actions,
    entityChain,
    onNavigate,
    onInspect,
    inspector,
}: {
    view: PreviewView;
    actions: PreviewAction[];
    entityChain: any[];
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
}) {
    const actionMap = useMemo(
        () => new Map(actions.map((a) => [a.id, a])),
        [actions],
    );

    if (view.kind === "list") {
        return (
            <ListViewPreview
                view={view}
                actionMap={actionMap}
                onNavigate={onNavigate}
                onInspect={onInspect}
                inspector={inspector}
            />
        );
    }
    return (
        <CardViewPreview
            view={view}
            actionMap={actionMap}
            onNavigate={onNavigate}
            onInspect={onInspect}
            inspector={inspector}
        />
    );
}

// ============ ListView ============

function ListViewPreview({
    view,
    actionMap,
    onNavigate,
    onInspect,
    inspector,
}: {
    view: PreviewView;
    actionMap: Map<string, PreviewAction>;
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
}) {
    return (
        <div className="preview-list">
            <div className="preview-list__header">
                <div>
                    <span className="preview-list__title">{view.label || view.id}</span>
                    {view.sourceEntity && (
                        <span className="preview-list__source">← {view.sourceEntity}</span>
                    )}
                </div>
                {view.actionPanel && view.actionPanel.length > 0 && (
                    <div className="preview-list__actions">
                        {view.actionPanel.map((wId) => {
                            const aId = wId.replace(/^buttons_/, "actions_");
                            const a = actionMap.get(aId) || actionMap.get(wId);
                            return (
                                <ActionButton
                                    key={wId}
                                    action={a}
                                    actionId={wId}
                                    onNavigate={onNavigate}
                                    onInspect={onInspect}
                                    inspector={inspector}
                                    variant="primary"
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="preview-list__filters">
                <div className="preview-fake-search">
                    <MIcon name="search" size="sm" />
                    <span>Поиск…</span>
                </div>
                <div className="preview-fake-pager">
                    {view.paging?.sizes?.join(" / ")}
                    {view.paging?.defaultSize && ` · ${view.paging.defaultSize} по умолчанию`}
                </div>
                {view.selection && (
                    <div className="preview-list__selection">☑ Выбор строк</div>
                )}
            </div>

            <table className="preview-table">
                <thead>
                    <tr>
                        {view.selection && <th style={{ width: 28 }}>☐</th>}
                        {(view.tableColumns || []).map((c) => (
                            <th
                                key={c.id}
                                onClick={() =>
                                    onInspect({ kind: "column", columnId: c.id, view })
                                }
                                style={{ cursor: "pointer" }}
                            >
                                <span>{c.label}</span>
                                {c.dataType && (
                                    <span className="preview-table__type">{c.dataType}</span>
                                )}
                                {c.readonly && <span className="preview-table__badge">🔒</span>}
                                {c.required && <span className="preview-table__badge">*</span>}
                            </th>
                        ))}
                        {(!view.tableColumns || view.tableColumns.length === 0) && (
                            <th>—</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    <tr className="preview-table__empty">
                        <td colSpan={Math.max(1, view.tableColumns?.length || 0) + (view.selection ? 1 : 0)}>
                            Данные отсутствуют
                        </td>
                    </tr>
                </tbody>
            </table>

            {view.rowClickAction && (
                <div className="preview-list__rowhint">
                    <MIcon name="ads_click" size="sm" />
                    Клик по строке →{" "}
                    <button
                        className="preview-link"
                        onClick={() => {
                            const a = actionMap.get(view.rowClickAction!);
                            if (a?.targetViewId) onNavigate(a.targetViewId);
                        }}
                    >
                        {view.rowClickAction}
                    </button>
                </div>
            )}
            {view.rowContextMenu && view.rowContextMenu.length > 0 && (
                <div className="preview-list__rowhint">
                    <MIcon name="menu_open" size="sm" />
                    Контекстное меню:{" "}
                    {view.rowContextMenu.map((it, i) => (
                        <React.Fragment key={it.action}>
                            {i > 0 && ", "}
                            <button
                                className="preview-link"
                                onClick={() => {
                                    const a = actionMap.get(it.action);
                                    if (a?.targetViewId) onNavigate(a.targetViewId);
                                }}
                            >
                                {it.label || it.action}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============ CardView ============

function CardViewPreview({
    view,
    actionMap,
    onNavigate,
    onInspect,
    inspector,
}: {
    view: PreviewView;
    actionMap: Map<string, PreviewAction>;
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
}) {
    return (
        <div className="preview-card">
            <div className="preview-card__header">
                <div>
                    <span className="preview-card__title">{view.label || view.id}</span>
                    {view.description && (
                        <span className="preview-card__desc">{view.description}</span>
                    )}
                </div>
                {view.menu.length > 0 && (
                    <div className="preview-card__menu">
                        {view.menu.map((m) => {
                            const a = actionMap.get(m);
                            return (
                                <ActionButton
                                    key={m}
                                    action={a}
                                    actionId={m}
                                    onNavigate={onNavigate}
                                    onInspect={onInspect}
                                    inspector={inspector}
                                />
                            );
                        })}
                        <span className="preview-btn preview-btn--menu">⋮</span>
                    </div>
                )}
            </div>

            {view.tabs.length > 0 && (
                <div className="preview-tabs">
                    {view.tabs.map((t, i) => (
                        <div
                            key={t.id}
                            className={
                                "preview-tab" +
                                (i === 0 ? " active" : "") +
                                (t.missingGroup ? " preview-tab--broken" : "")
                            }
                            title={t.missingGroup ? "Группа не найдена" : t.label}
                        >
                            {t.label}
                            {t.missingGroup && <span className="preview-tab__warn">⚠</span>}
                        </div>
                    ))}
                </div>
            )}

            <div className="preview-card__body">
                {view.groups.map((g) => (
                    <PreviewGroupBlock
                        key={g.id}
                        group={g}
                        actionMap={actionMap}
                        onNavigate={onNavigate}
                        onInspect={onInspect}
                        inspector={inspector}
                        depth={0}
                    />
                ))}
                {view.widgets.length > 0 && (
                    <PreviewFieldGrid>
                        {view.widgets.map((w) => (
                            <PreviewWidgetRow
                                key={w.id}
                                widget={w}
                                actionMap={actionMap}
                                onNavigate={onNavigate}
                                onInspect={onInspect}
                                inspector={inspector}
                            />
                        ))}
                    </PreviewFieldGrid>
                )}
                {view.actionPanel && view.actionPanel.length > 0 && (
                    <div className="preview-action-panel">
                        <div className="preview-action-panel__label">Действия</div>
                        {view.actionPanel.map((wId) => {
                            const aId = wId.replace(/^buttons_/, "actions_");
                            const a = actionMap.get(aId) || actionMap.get(wId);
                            return (
                                <ActionButton
                                    key={wId}
                                    action={a}
                                    actionId={wId}
                                    onNavigate={onNavigate}
                                    onInspect={onInspect}
                                    inspector={inspector}
                                    variant="primary"
                                />
                            );
                        })}
                    </div>
                )}
                {view.groups.length === 0 &&
                    view.widgets.length === 0 &&
                    (!view.actionPanel || view.actionPanel.length === 0) && (
                        <div className="preview-card__empty">
                            Пустая карточка — нет ни групп, ни виджетов
                        </div>
                    )}
            </div>
        </div>
    );
}

// ============ Компоненты виджетов ============

function PreviewFieldGrid({ children }: { children: React.ReactNode }) {
    return <div className="preview-field-grid">{children}</div>;
}

function PreviewGroupBlock({
    group,
    actionMap,
    onNavigate,
    onInspect,
    inspector,
    depth,
}: {
    group: PreviewGroup;
    actionMap: Map<string, PreviewAction>;
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
    depth: number;
}) {
    if (depth > 3) return null;
    return (
        <div
            className={
                "preview-group preview-group--" +
                group.type +
                (group.isEmpty ? " preview-group--empty" : "")
            }
        >
            {group.label && (
                <button
                    className="preview-group__label"
                    onClick={() => onInspect({ kind: "group", group, view: undefined as any })}
                >
                    {group.label}
                    {group.isEmpty && <span className="preview-group__warn">⚠ пусто</span>}
                </button>
            )}
            <div className="preview-group__body">
                {group.widgets.length > 0 && (
                    <PreviewFieldGrid>
                        {group.widgets.map((w) => (
                            <PreviewWidgetRow
                                key={w.id}
                                widget={w}
                                actionMap={actionMap}
                                onNavigate={onNavigate}
                                onInspect={onInspect}
                                inspector={inspector}
                            />
                        ))}
                    </PreviewFieldGrid>
                )}
                {group.nestedGroups.map((g) => (
                    <PreviewGroupBlock
                        key={g.id}
                        group={g}
                        actionMap={actionMap}
                        onNavigate={onNavigate}
                        onInspect={onInspect}
                        inspector={inspector}
                        depth={depth + 1}
                    />
                ))}
            </div>
        </div>
    );
}

function PreviewWidgetRow({
    widget,
    actionMap,
    onNavigate,
    onInspect,
    inspector,
}: {
    widget: PreviewWidget;
    actionMap: Map<string, PreviewAction>;
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
}) {
    const isInspected =
        inspector?.kind === "widget" && inspector.widget.id === widget.id;

    if (widget.type === "action") {
        const aId = widget.actionIds?.[0];
        const a = aId ? actionMap.get(aId) : undefined;
        return (
            <ActionButton
                action={a}
                actionId={aId || widget.id}
                onNavigate={onNavigate}
                onInspect={onInspect}
                inspector={inspector}
            />
        );
    }

    if (widget.type === "attribute") {
        return (
            <div
                className={
                    "preview-field" + (isInspected ? " preview-field--inspected" : "")
                }
                onClick={() => onInspect({ kind: "widget", widget, view: undefined as any })}
            >
                <label className="preview-field__label">
                    {widget.label || widget.id}
                    {widget.required && <span className="preview-field__required">*</span>}
                    {widget.readonly && (
                        <span className="preview-field__readonly" title="readonly">
                            🔒
                        </span>
                    )}
                </label>
                <FieldControl widget={widget} />
                <div className="preview-field__meta">
                    {widget.dataType && <code>{widget.dataType}</code>}
                    {widget.constraints && widget.constraints.length > 0 && (
                        <span>{widget.constraints.join(", ")}</span>
                    )}
                </div>
            </div>
        );
    }

    if (widget.type === "linkage") {
        return (
            <div
                className={
                    "preview-linkage" +
                    (isInspected ? " preview-linkage--inspected" : "")
                }
                onClick={() => onInspect({ kind: "widget", widget, view: undefined as any })}
            >
                <div className="preview-linkage__label">
                    {widget.label || widget.linkageName || widget.linkageId || widget.id}
                    {widget.linkageSide && (
                        <span className="preview-linkage__side">side {widget.linkageSide}</span>
                    )}
                </div>
                <div className="preview-linkage__target">
                    {widget.targetEntityId ? (
                        <>
                            → <code>{widget.targetEntityId}</code>
                            {widget.targetEntityName && (
                                <span className="preview-linkage__name">{widget.targetEntityName}</span>
                            )}
                        </>
                    ) : (
                        <span className="preview-linkage__unknown">целевая сущность не определена</span>
                    )}
                </div>
                <div className="preview-linkage__count">0 связанных</div>
            </div>
        );
    }

    return (
        <div
            className="preview-widget-fallback"
            onClick={() => onInspect({ kind: "widget", widget, view: undefined as any })}
        >
            [{widget.type}] {widget.id}
        </div>
    );
}

// ============ Реалистичные контролы ============

function FieldControl({ widget }: { widget: PreviewWidget }) {
    const dt = widget.dataType || "";
    const kind = widget.dataTypeKind || "base";
    const ctrl = widget.controlType || "";

    // Custom Enum
    if (kind === "custom" && widget.enumValues && widget.enumValues.length > 0) {
        return (
            <select className="preview-field__input preview-field__select" disabled>
                <option>{widget.enumValues[0]}</option>
                {widget.enumValues.slice(1).map((v) => (
                    <option key={v}>{v}</option>
                ))}
            </select>
        );
    }

    // Custom Workflow
    if (kind === "custom" && widget.workflowStatuses && widget.workflowStatuses.length > 0) {
        return (
            <div className="preview-field__workflow">
                <select className="preview-field__input preview-field__select" disabled>
                    {widget.workflowStatuses.map((s) => (
                        <option key={s} selected={s === widget.initialStatus}>
                            {s}
                            {s === widget.initialStatus ? " (начальный)" : ""}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    // Bool
    if (dt === "Bool" || ctrl === "switch" || ctrl === "checkbox") {
        const label =
            ctrl === "bool_text" && (widget as any).trueText
                ? (widget as any).trueText
                : "false";
        return (
            <div className="preview-field__bool">
                <span className="preview-field__switch" />
                <span className="preview-field__switch-label">{label}</span>
            </div>
        );
    }

    // Text
    if (dt === "Text" || ctrl === "text_area") {
        return (
            <textarea
                className="preview-field__input preview-field__textarea"
                disabled
                rows={2}
                placeholder="Text"
            />
        );
    }

    // Date/Time
    if (["Timestamp", "Date", "Time", "TimestampRange"].includes(dt)) {
        return (
            <input
                className="preview-field__input"
                disabled
                placeholder={dt === "Date" ? "YYYY-MM-DD" : "date-time"}
            />
        );
    }

    // Reference
    if (dt === "Reference" || widget.referenceTarget) {
        return (
            <div className="preview-field__reference">
                <input
                    className="preview-field__input"
                    disabled
                    placeholder={widget.referenceTarget || "Reference"}
                />
                <button className="preview-field__ref-btn" disabled>
                    🔍
                </button>
            </div>
        );
    }

    // Attachment
    if (dt === "Attachment" || ctrl === "file" || ctrl === "drag_drop_area") {
        return (
            <div className="preview-field__drop">
                <MIcon name="attach_file" size="sm" />
                <span>Перетащите файл</span>
            </div>
        );
    }

    // Slider
    if (ctrl === "slider" || ctrl === "integer_slider" || ctrl === "decimal_slider") {
        return (
            <input
                type="range"
                className="preview-field__slider"
                disabled
                min={0}
                max={100}
                value={50}
            />
        );
    }

    // Number
    if (["Integer", "Decimal", "Float", "Counter", "Calculation"].includes(dt)) {
        return (
            <input
                type="number"
                className="preview-field__input"
                disabled
                placeholder="0"
            />
        );
    }

    // Default
    return (
        <input
            type="text"
            className="preview-field__input"
            disabled
            placeholder="String"
        />
    );
}

// ============ Action button ============

function ActionButton({
    action,
    actionId,
    onNavigate,
    onInspect,
    inspector,
    variant,
}: {
    action: PreviewAction | undefined;
    actionId: string;
    onNavigate: (viewId: string) => void;
    onInspect: (s: InspectorSubject) => void;
    inspector: InspectorSubject | null;
    variant?: "primary";
}) {
    const label = action?.name || actionId;
    const isBroken = action && action.targetViewId && !action.targetViewId;
    const isInspected =
        inspector?.kind === "action" && inspector.action?.id === action?.id;

    return (
        <span
            className={
                "preview-btn" +
                (variant === "primary" ? " preview-btn--primary" : "") +
                (action?.targetViewId ? " preview-btn--link" : "") +
                (isBroken ? " preview-btn--broken" : "") +
                (isInspected ? " preview-btn--inspected" : "")
            }
            onClick={(e) => {
                e.stopPropagation();
                if (action?.targetViewId) onNavigate(action.targetViewId);
                onInspect({ kind: "action", actionId, action });
            }}
            title={
                action
                    ? `${action.type}${action.operation ? ` · ${action.operation}` : ""}${action.targetViewId ? ` → ${action.targetViewId}` : ""
                    }`
                    : actionId
            }
        >
            {label}
            {action?.targetViewId && (
                <span className="preview-btn__arrow">→</span>
            )}
        </span>
    );
}

// ============ Inspector ============

type InspectorSubject =
    | { kind: "widget"; widget: PreviewWidget; view: PreviewView }
    | { kind: "group"; group: PreviewGroup; view: PreviewView }
    | { kind: "column"; columnId: string; view: PreviewView }
    | { kind: "action"; actionId: string; action: PreviewAction | undefined };

function Inspector({
    subject,
    actions,
    onClose,
    onNavigate,
}: {
    subject: InspectorSubject;
    actions: PreviewAction[];
    onClose: () => void;
    onNavigate: (viewId: string) => void;
}) {
    return (
        <div className="generated-preview-inspector">
            <div className="generated-preview-inspector__head">
                <MIcon
                    name={
                        subject.kind === "widget"
                            ? "widgets"
                            : subject.kind === "group"
                                ? "view_module"
                                : subject.kind === "column"
                                    ? "view_column"
                                    : "bolt"
                    }
                    size="sm"
                />
                <span className="generated-preview-inspector__kind">
                    {subject.kind}
                </span>
                <button
                    className="generated-preview-inspector__close"
                    onClick={onClose}
                >
                    ✕
                </button>
            </div>
            <div className="generated-preview-inspector__body">
                {subject.kind === "widget" && <WidgetInspector widget={subject.widget} />}
                {subject.kind === "group" && <GroupInspector group={subject.group} />}
                {subject.kind === "column" && (
                    <ColumnInspector columnId={subject.columnId} view={subject.view} />
                )}
                {subject.kind === "action" && (
                    <ActionInspector
                        actionId={subject.actionId}
                        action={subject.action}
                        onNavigate={onNavigate}
                    />
                )}
            </div>
        </div>
    );
}

function WidgetInspector({ widget }: { widget: PreviewWidget }) {
    return (
        <>
            <InspectorRow label="id" value={<code>{widget.id}</code>} />
            <InspectorRow label="type" value={widget.type} />
            {widget.attributeId && (
                <InspectorRow label="attribute" value={<code>{widget.attributeId}</code>} />
            )}
            {widget.dataType && (
                <InspectorRow
                    label="dataType"
                    value={
                        <>
                            <code>{widget.dataType}</code>
                            {widget.dataTypeKind === "custom" && (
                                <span className="inspector-badge">custom</span>
                            )}
                        </>
                    }
                />
            )}
            {widget.controlType && (
                <InspectorRow label="control" value={<code>{widget.controlType}</code>} />
            )}
            {widget.constraints && widget.constraints.length > 0 && (
                <InspectorRow
                    label="constraints"
                    value={widget.constraints.map((c) => (
                        <code key={c} className="inspector-chip">
                            {c}
                        </code>
                    ))}
                />
            )}
            {widget.required && (
                <InspectorRow
                    label="required"
                    value={<span className="inspector-badge inspector-badge--err">да</span>}
                />
            )}
            {widget.readonly && (
                <InspectorRow
                    label="readonly"
                    value={<span className="inspector-badge inspector-badge--warn">да</span>}
                />
            )}
            {widget.enumValues && (
                <InspectorRow
                    label="значения"
                    value={widget.enumValues.map((v) => (
                        <code key={v} className="inspector-chip">
                            {v}
                        </code>
                    ))}
                />
            )}
            {widget.workflowStatuses && (
                <InspectorRow
                    label="статусы"
                    value={widget.workflowStatuses.map((v) => (
                        <code
                            key={v}
                            className={
                                "inspector-chip" + (v === widget.initialStatus ? " inspector-chip--active" : "")
                            }
                        >
                            {v}
                        </code>
                    ))}
                />
            )}
            {widget.linkageId && (
                <InspectorRow label="linkage" value={<code>{widget.linkageId}</code>} />
            )}
            {widget.targetEntityId && (
                <InspectorRow
                    label="→ сущность"
                    value={<code>{widget.targetEntityId}</code>}
                />
            )}
        </>
    );
}

function GroupInspector({ group }: { group: PreviewGroup }) {
    return (
        <>
            <InspectorRow label="id" value={<code>{group.id}</code>} />
            <InspectorRow label="type" value={group.type} />
            {group.label && <InspectorRow label="label" value={group.label} />}
            <InspectorRow
                label="widgets"
                value={String(group.widgets.length)}
            />
            <InspectorRow
                label="вложенные"
                value={String(group.nestedGroups.length)}
            />
            {group.isEmpty && (
                <div className="inspector-warn">⚠ Группа пуста — ни один widget в неё не пришёл</div>
            )}
        </>
    );
}

function ColumnInspector({ columnId, view }: { columnId: string; view: PreviewView }) {
    const col = view.tableColumns?.find((c) => c.id === columnId);
    if (!col) return <div className="inspector-warn">Колонка не найдена</div>;
    return (
        <>
            <InspectorRow label="id" value={<code>{col.id}</code>} />
            <InspectorRow label="label" value={col.label} />
            <InspectorRow label="attribute" value={<code>{col.attribute}</code>} />
            {col.dataType && (
                <InspectorRow label="dataType" value={<code>{col.dataType}</code>} />
            )}
            {col.required && (
                <InspectorRow
                    label="required"
                    value={<span className="inspector-badge inspector-badge--err">да</span>}
                />
            )}
            {col.readonly && (
                <InspectorRow
                    label="readonly"
                    value={<span className="inspector-badge inspector-badge--warn">да</span>}
                />
            )}
        </>
    );
}

function ActionInspector({
    actionId,
    action,
    onNavigate,
}: {
    actionId: string;
    action: PreviewAction | undefined;
    onNavigate: (viewId: string) => void;
}) {
    if (!action) {
        return <div className="inspector-warn">Action «{actionId}» не найден</div>;
    }
    return (
        <>
            <InspectorRow label="id" value={<code>{action.id}</code>} />
            <InspectorRow label="name" value={action.name} />
            <InspectorRow label="type" value={<code>{action.type}</code>} />
            {action.operation && (
                <InspectorRow label="operation" value={<code>{action.operation}</code>} />
            )}
            {action.entity && (
                <InspectorRow label="entity" value={<code>{action.entity}</code>} />
            )}
            {action.targetViewId && (
                <InspectorRow
                    label="→ target"
                    value={
                        <button
                            className="inspector-link"
                            onClick={() => onNavigate(action.targetViewId!)}
                        >
                            {action.targetViewId}
                        </button>
                    }
                />
            )}
        </>
    );
}

function InspectorRow({
    label,
    value,
}: {
    label: string;
    value: React.ReactNode;
}) {
    return (
        <div className="inspector-row">
            <span className="inspector-row__label">{label}</span>
            <span className="inspector-row__value">{value}</span>
        </div>
    );
}

// ============ Actions summary ============

function ActionsSummary({
    actions,
    onNavigate,
    viewIds,
}: {
    actions: PreviewAction[];
    onNavigate: (viewId: string) => void;
    viewIds: string[];
}) {
    const [open, setOpen] = useState(false);
    const byType = useMemo(() => countPreviewActionsByType(actions), [actions]);
    const viewIdSet = useMemo(() => new Set(viewIds), [viewIds]);

    return (
        <div
            className={
                "generated-preview-actions-summary" + (open ? " open" : "")
            }
        >
            <button
                className="generated-preview-actions-summary__head"
                onClick={() => setOpen(!open)}
            >
                <MIcon name={open ? "expand_more" : "chevron_right"} size="sm" />
                <MIcon name="bolt" size="sm" />
                <span>Actions ({actions.length})</span>
                <span className="generated-preview-actions-summary__types">
                    {Object.entries(byType).map(([t, n]) => (
                        <code key={t}>
                            {t}: {n}
                        </code>
                    ))}
                </span>
            </button>
            {open && (
                <div className="generated-preview-actions-summary__body">
                    <table>
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Type</th>
                                <th>Operation</th>
                                <th>Target</th>
                            </tr>
                        </thead>
                        <tbody>
                            {actions.map((a) => {
                                const broken =
                                    a.targetViewId && !viewIdSet.has(a.targetViewId);
                                return (
                                    <tr
                                        key={a.id}
                                        className={broken ? "generated-preview-actions-summary__broken" : ""}
                                    >
                                        <td>
                                            <code>{a.id}</code>
                                        </td>
                                        <td>{a.type}</td>
                                        <td>{a.operation || "—"}</td>
                                        <td>
                                            {a.targetViewId ? (
                                                <button
                                                    className="preview-link"
                                                    onClick={() => onNavigate(a.targetViewId!)}
                                                    disabled={!!broken}
                                                >
                                                    {a.targetViewId}
                                                </button>
                                            ) : (
                                                "—"
                                            )}
                                            {broken && <span className="preview-broken">⚠ не найден</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}