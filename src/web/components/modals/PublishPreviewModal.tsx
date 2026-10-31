import React from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { MIcon } from "../common/MIcon";

export function PublishPreviewModal() {
    const open = useGraphStore((s) => s.publishPreviewOpen);
    const data = useGraphStore((s) => s.publishPreviewData);
    const close = () => useGraphStore.getState().setPublishPreviewOpen(false);
    const confirm = useGraphStore((s) => s.publishPreviewConfirmAction);

    if (!open || !data) return null;

    const { serverVersion, localVersion, diff } = data;
    const hasBreaking = diff?.hasBreakingChanges;

    return (
        <div className="help-overlay help-overlay--fullscreen" style={{ zIndex: 600 }} onMouseDown={close}>
            <div className="help-modal" style={{ width: 800, maxHeight: "85vh", display: "flex", flexDirection: "column" }} onMouseDown={(e) => e.stopPropagation()}>

                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="cloud_upload" size="sm" />
                        <span className="icon-label">Предпросмотр публикации</span>
                    </div>
                    <button className="help-modal__close" onClick={close}>✕</button>
                </div>

                <div className="help-modal__body" style={{ flex: 1, overflowY: "auto", padding: 24 }}>
                    {/* Версии */}
                    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, padding: 16, background: "var(--bg-800)", borderRadius: 8 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "var(--text-500)", textTransform: "uppercase" }}>Версия на сервере</div>
                            <div style={{ fontSize: 18, fontFamily: "monospace", color: "var(--text-300)" }}>{serverVersion || "—"}</div>
                        </div>
                        <MIcon name="trending_flat" style={{ color: "var(--text-500)" }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "var(--text-500)", textTransform: "uppercase" }}>Новая версия</div>
                            <div style={{ fontSize: 18, fontFamily: "monospace", color: "var(--accent-hover)", fontWeight: 700 }}>{localVersion || "—"}</div>
                        </div>
                    </div>

                    {/* Предупреждение о breaking changes */}
                    {hasBreaking && (
                        <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid var(--danger)", borderRadius: 8, marginBottom: 24 }}>
                            <div style={{ fontWeight: 700, color: "var(--danger)", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                                <MIcon name="warning" size="sm" /> Внимание! Обнаружены несовместимые изменения
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-300)", lineHeight: 1.5 }}>
                                Сервер может отклонить публикацию с ошибкой <code>NotCompatible</code>, а потребители этой схемы (другие домены) могут сломаться.
                            </div>
                        </div>
                    )}

                    {/* Удалённые сущности */}
                    {diff?.removedEntities?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}>🔴 Удалены сущности ({diff.removedEntities.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {diff.removedEntities.map((e: any) => (
                                    <span key={e.id} className="entity-catalog-chip" style={{ background: "rgba(239,68,68,0.15)", color: "var(--danger)", borderColor: "var(--danger)" }}>
                                        {e.id}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Добавленные сущности */}
                    {diff?.addedEntities?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", marginBottom: 8 }}>🟢 Добавлены сущности ({diff.addedEntities.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                {diff.addedEntities.map((e: any) => (
                                    <span key={e.id} className="entity-catalog-chip" style={{ background: "rgba(16,185,129,0.15)", color: "var(--success)", borderColor: "var(--success)" }}>
                                        {e.id}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Изменённые сущности */}
                    {diff?.changedEntities?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--warning)", marginBottom: 8 }}>🟡 Изменены сущности ({diff.changedEntities.length})</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {diff.changedEntities.map((e: any) => (
                                    <div key={e.id} style={{ background: "var(--bg-750)", padding: 12, borderRadius: 6, borderLeft: `3px solid ${e.isBreaking ? 'var(--danger)' : 'var(--warning)'}` }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{e.id}</div>
                                        {e.attributes.map((a: any) => (
                                            <div key={a.id} style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "monospace", color: "var(--text-400)", marginTop: 2 }}>
                                                {a.kind === "removed" && <span style={{ color: "var(--danger)" }}>- {a.id} ({a.typeA})</span>}
                                                {a.kind === "added" && <span style={{ color: "var(--success)" }}>+ {a.id} ({a.typeB})</span>}
                                                {a.kind === "changed" && <span style={{ color: "var(--warning)" }}>~ {a.id}: {a.typeA} → {a.typeB}</span>}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Если вообще нет изменений */}
                    {(!diff || (diff.addedEntities.length === 0 && diff.removedEntities.length === 0 && diff.changedEntities.length === 0)) && (
                        <div style={{ textAlign: "center", color: "var(--text-500)", padding: 40 }}>
                            <MIcon name="check_circle" size="xl" style={{ color: "var(--success)", marginBottom: 8 }} />
                            <div>Схема не изменилась с момента последней публикации</div>
                        </div>
                    )}
                </div>

                <div className="help-modal__footer" style={{ padding: 16, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 12, background: "var(--bg-850)" }}>
                    <button className="btn" onClick={close}>Отмена</button>
                    <button
                        className={'btn ' + (hasBreaking ? 'btn--danger' : 'btn--primary')}
                        onClick={() => {
                            close();
                            if (confirm) confirm();
                        }}
                    >
                        {hasBreaking ? "Всё равно опубликовать" : "Опубликовать"}
                    </button>
                </div>

            </div>
        </div>
    );
}