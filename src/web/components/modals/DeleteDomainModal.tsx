import React, { useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { readRemoteInfo } from "../../state/initial";
import { MIcon } from "../common/MIcon";

interface RefInfo {
    kind: string;
    fromDomainId: string;
    description: string;
}

export function DeleteDomainModal() {
    const target = useGraphStore((s) => s.deleteDomainTarget);
    const setTarget = useGraphStore((s) => s.setDeleteDomainTarget);
    const { index } = useModelIndex();
    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const isRemote = !!remoteInfo?.server && remoteInfo.mode !== "hybrid";

    const [expertiseId, setExpertiseId] = useState<string | null>(null);
    const [expertiseReady, setExpertiseReady] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = !!target;

    useEffect(() => {
        if (!open || !target) return;
        setExpertiseId(null); setExpertiseReady(false); setConfirmed(false); setError(null);
        if (!isRemote) { setExpertiseReady(true); return; }
        fetch("/api/domain-index")
            .then((r) => r.json())
            .then((d) => {
                const entry = (d.domains || []).find((x: any) => x.sourceId === target.domainId);
                setExpertiseId(entry?.id || null);
                setExpertiseReady(true);
            })
            .catch(() => setExpertiseReady(true));
    }, [open, target, isRemote]);

    const refs = useMemo<RefInfo[]>(() => {
        if (!index || !target) return [];
        const t = target.domainId.toLowerCase();
        const matches = (fqid: string | null | undefined) =>
            !!fqid && fqid.toLowerCase().startsWith(t + "/");

        const out: RefInfo[] = [];
        for (const e of index.entities) {
            if (e.domainId.toLowerCase() === t) continue;
            if (matches(e.inherits)) {
                out.push({
                    kind: "inherits", fromDomainId: e.domainId,
                    description: `${e.entityId} наследует ${e.inherits}`
                });
            }
            for (const a of e.attributes) {
                const ref = a.referenceEntity || a.itemReferenceEntity;
                if (matches(ref)) {
                    out.push({
                        kind: "reference", fromDomainId: e.domainId,
                        description: `${e.entityId}.${a.id} → ${ref}`
                    });
                }
            }
        }
        for (const l of index.entityLinkages) {
            if (l.domainId.toLowerCase() === t) continue;
            if (matches(l.side1Fqid) || matches(l.side2Fqid)) {
                out.push({
                    kind: "linkage", fromDomainId: l.domainId,
                    description: `${l.id} (${l.side1Fqid} ↔ ${l.side2Fqid})`
                });
            }
        }
        for (const m of index.mixins) {
            if (m.domainId.toLowerCase() === t) continue;
            if (matches(m.targetEntityFqid)) {
                out.push({
                    kind: "mixin", fromDomainId: m.domainId,
                    description: `${m.id} (target: ${m.targetEntityFqid})`
                });
            }
            if (matches(m.sourceEntityFqid)) {
                out.push({
                    kind: "mixin", fromDomainId: m.domainId,
                    description: `${m.id} (from: ${m.sourceEntityFqid})`
                });
            }
        }
        return out;
    }, [index, target]);

    if (!open || !target) return null;

    const canDelete =
        confirmed && !deleting && (!isRemote || (expertiseReady && !!expertiseId));

    const doDelete = async () => {
        if (!canDelete) return;
        setDeleting(true); setError(null);
        try {
            const res = await fetch("/api/delete-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    domainId: target.domainId,
                    expertiseId: isRemote ? expertiseId : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setError(data.error || `HTTP ${res.status}`); return; }
            useGraphStore.getState().bumpModelVersion();
            setTarget(null);
        } catch (e: any) {
            setError(e.message || String(e));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="help-overlay help-overlay--fullscreen" onMouseDown={() => setTarget(null)}>
            <div className="help-modal delete-domain-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="delete_forever" size="sm" style={{ color: "var(--danger)" }} />
                        <span className="icon-label">Удалить домен</span>
                        <span className="help-modal__badge">{target.domainId}</span>
                    </div>
                    <button className="help-modal__close" onClick={() => setTarget(null)}>✕</button>
                </div>

                <div className="help-modal__body">
                    <div className="delete-domain-warning">
                        <MIcon name="warning" size="sm" />
                        <span>
                            Домен будет <strong>удалён {isRemote ? "на сервере и в кэше" : "с диска"}</strong>.
                            {refs.length > 0
                                ? ` Ссылки из других доменов (${refs.length}) сломаются.`
                                : " Прямых ссылок из других доменов не найдено."}
                        </span>
                    </div>

                    {refs.length > 0 && (
                        <div className="delete-domain-refs">
                            <div className="delete-domain-refs__title">Ссылки из других доменов ({refs.length})</div>
                            {refs.map((r, i) => (
                                <div key={i} className="delete-domain-ref">
                                    <span className="delete-domain-ref__kind">{r.kind}</span>
                                    <code className="delete-domain-ref__from">{r.fromDomainId}</code>
                                    <span className="delete-domain-ref__desc">{r.description}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {isRemote && expertiseReady && !expertiseId && (
                        <div className="create-domain-error-banner" style={{ marginTop: 12 }}>
                            <MIcon name="error" size="sm" />
                            {" "}expertise-id не найден в _index.json — удалить на сервере нельзя.
                            Попробуйте --refresh, затем повторите.
                        </div>
                    )}

                    {error && (
                        <div className="create-domain-error-banner" style={{ marginTop: 12 }}>
                            <MIcon name="error" size="sm" /> {error}
                        </div>
                    )}

                    <label className="delete-domain-confirm">
                        <input type="checkbox" checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)} />
                        <span>
                            Я понимаю, что это необратимо, и хочу удалить домен <code>{target.domainId}</code>
                        </span>
                    </label>
                </div>

                <div className="help-modal__footer">
                    <button className="btn" onClick={() => setTarget(null)}>Отмена</button>
                    <button className="btn btn--danger" onClick={doDelete} disabled={!canDelete}>
                        {deleting ? "Удаление…" : "Удалить"}
                    </button>
                </div>
            </div>
        </div>
    );
}