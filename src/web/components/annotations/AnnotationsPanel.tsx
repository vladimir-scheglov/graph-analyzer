import React, { useEffect, useState } from "react";
import { annotationsStore, type Annotation } from "../../lib/storage/annotations";
import { MIcon } from "../common/MIcon";

function formatTarget(a: Annotation): string {
    const t = a.target;
    if (t.startsWith("domain:")) {
        return t.slice("domain:".length);
    }
    if (t.startsWith("line:")) {
        const m = t.match(/:(\d+)$/);
        const line = m ? m[1] : "?";
        return `${a.domainId} :${line}`;
    }
    if (t.startsWith("edge:")) {
        return `${a.domainId} · связь`;
    }
    if (t.startsWith("entity:") || t.startsWith("attr:")) {
        const rest = t.slice(t.indexOf(":") + 1);
        return `${a.domainId} · ${rest}`;
    }
    return t;
}

export function AnnotationsPanel({ domainId }: { domainId?: string | null }) {
    const [all, setAll] = useState<Annotation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = () => {
            annotationsStore
                .list()
                .then((list) => {
                    if (cancelled) return;
                    const filtered = list.filter((a) => {
                        if (a.resolvedAt) return false;
                        if (domainId && a.domainId !== domainId) return false;
                        return true;
                    });
                    setAll(filtered);
                    setLoading(false);
                })
                .catch(() => {
                    if (!cancelled) setLoading(false);
                });
        };

        setLoading(true);
        load();
        const unsub = annotationsStore.subscribe(load);

        return () => {
            cancelled = true;
            unsub();
        };
    }, [domainId]);

    if (loading) return null;
    if (all.length === 0) return null;

    return (
        <div className="annotations-panel">
            <div className="annotations-panel__title">
                <MIcon name="push_pin" size="sm" />
                Заметки ({all.length})
            </div>
            {all.map((a) => (
                <div
                    key={a.id}
                    className={
                        "annotations-panel__item annotations-panel__item--" +
                        (a.color || "yellow")
                    }
                >
                    <code>{formatTarget(a)}</code>
                    <span>{a.text}</span>
                </div>
            ))}
        </div>
    );
}