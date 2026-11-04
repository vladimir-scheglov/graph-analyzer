import React, { useMemo } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelDiff } from "../../hooks/useModelDiff";
import { MIcon } from "../common/MIcon";
import {
    buildChangelogBlocks,
    buildChangelogMarkdown,
    suggestBump,
    applyBump,
    isValidSemVer,
    compareSemVer,
} from "../../lib/model/changelog";
import { readRemoteInfo } from "../../state/initial";
import { confirmDialog } from "../../lib/dialogs";

export function ChangelogModal() {
    const open = useGraphStore((s) => s.changelogOpen);
    const setOpen = useGraphStore((s) => s.setChangelogOpen);
    const { diff, loading, error } = useModelDiff();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);

    const blocks = useMemo(() => (diff ? buildChangelogBlocks(diff) : []), [diff]);
    const bump = useMemo(() => (diff ? suggestBump(diff) : "patch"), [diff]);

    const downloadMarkdown = async () => {
        if (!diff) return;
        const nextVersion = applyBump("1.0.0", bump) || "1.0.1"; // упрощённо, версия берётся из схемы
        const md = buildChangelogMarkdown(blocks, {
            version: nextVersion,
            previousVersion: "",
            takenAt: new Date().toISOString().slice(0, 10),
            server: remoteInfo?.server,
        });
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `CHANGELOG-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
        useGraphStore.getState().showSnackbar("CHANGELOG.md скачан");
    };

    const copyMarkdown = async () => {
        if (!diff) return;
        const md = buildChangelogMarkdown(blocks, {
            version: applyBump("1.0.0", bump) || "1.0.1",
            previousVersion: "",
            takenAt: new Date().toISOString().slice(0, 10),
            server: remoteInfo?.server,
        });
        try {
            await navigator.clipboard.writeText(md);
            useGraphStore.getState().showSnackbar("CHANGELOG в буфере обмена");
        } catch { /* ignore */ }
    };

    if (!open) return null;

    return (
        <div className="help-overlay help-overlay--fullscreen" onMouseDown={() => setOpen(false)}>
            <div className="help-modal changelog-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="history_edu" size="sm" />
                        <span className="icon-label">CHANGELOG и версионирование</span>
                        {diff && (
                            <span className="help-modal__badge">
                                рекомендовано: {bump.toUpperCase()}
                            </span>
                        )}
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                </div>

                {loading && <div className="help-modal__body"><div className="help-modal__loading">Загрузка diff…</div></div>}
                {error && <div className="help-modal__body"><div style={{ color: "var(--danger)" }}>{error}</div></div>}

                {!loading && !error && !diff && (
                    <div className="help-modal__body">
                        <div className="changelog-empty">
                            Нет данных diff. Снапшот модели ещё не создан или не было изменений.
                        </div>
                    </div>
                )}

                {diff && (
                    <div className="help-modal__body help-modal__body--flush">
                        <div className="changelog-version-badge">
                            <MIcon name="upgrade" size="sm" />
                            <span>Рекомендованный bump: </span>
                            <strong className={"changelog-bump changelog-bump--" + bump}>
                                {bump.toUpperCase()}
                            </strong>
                            <span className="changelog-version-badge__hint">
                                {bump === "major" ? "Удалены сущности/атрибуты/типы — несовместимо" :
                                    bump === "minor" ? "Добавлены сущности/атрибуты — обратная совместимость" :
                                        "Только внутренние изменения"}
                            </span>
                        </div>

                        {blocks.length === 0 ? (
                            <div className="changelog-empty">Изменений нет</div>
                        ) : (
                            <div className="changelog-blocks">
                                {blocks.map((b) => (
                                    <div key={b.title} className="changelog-block">
                                        <div className="changelog-block__title">{b.title}</div>
                                        <ul className="changelog-block__list">
                                            {b.entries.map((e, i) => (
                                                <li key={i} className={"changelog-entry changelog-entry--" + e.kind}>
                                                    {e.domainId && <code className="changelog-entry__domain">{e.domainId}</code>}
                                                    <span>{e.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="validation-footer">
                    <div className="validation-stats">
                        {diff && <span className="validation-stat">{diff.stats.entitiesAdded + diff.stats.entitiesRemoved + diff.stats.entitiesChanged} изменённых сущностей</span>}
                    </div>
                    <div className="validation-footer__actions">
                        <button className="btn" onClick={copyMarkdown} disabled={!diff}>📋 Копировать</button>
                        <button className="btn btn--primary" onClick={downloadMarkdown} disabled={!diff}>💾 Скачать .md</button>
                        <button className="btn" onClick={() => setOpen(false)}>Закрыть</button>
                    </div>
                </div>
            </div>
        </div>
    );
}