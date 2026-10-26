import React, { useMemo } from "react";
import { MIcon } from "../common/MIcon";
import type { ModelIndex } from "../../../shared/model-types";

export interface TreeLinkageCandidate {
    id: string;
    name: string;
    type: string;
    undirected: boolean;
    peerEntityId: string;
    peerFqid: string;
    peerInDomain: boolean;
}

export interface TreeLinkageSelectorProps {
    index: ModelIndex | null;
    domainId: string;
    entityId: string;
    value: string[] | undefined;
    onChange: (v: string[] | undefined) => void;
}

export function useTreeLinkageCandidates(
    index: ModelIndex | null,
    domainId: string,
    entityId: string,
): TreeLinkageCandidate[] {
    return useMemo(() => {
        if (!index || !domainId || !entityId) return [];
        const fqid = `${domainId}/${entityId}`.toLowerCase();
        return index.entityLinkages
            .filter(
                (l) =>
                    l.domainId === domainId &&
                    l.side1Fqid === fqid &&
                    (l.type === "1_n" || l.type === "n_n"),
            )
            .map((l) => {
                const peerSlash = l.side2Fqid.indexOf("/");
                const peerDomainId =
                    peerSlash > 0 ? l.side2Fqid.slice(0, peerSlash) : "";
                const peerEntityId =
                    peerSlash > 0 ? l.side2Fqid.slice(peerSlash + 1) : l.side2Fqid;
                return {
                    id: l.id,
                    name: l.name,
                    type: l.type,
                    undirected: l.undirected === true,
                    peerEntityId,
                    peerFqid: l.side2Fqid,
                    peerInDomain: peerDomainId === domainId,
                };
            });
    }, [index, domainId, entityId]);
}

export function TreeLinkageSelector({
    index,
    domainId,
    entityId,
    value,
    onChange,
}: TreeLinkageSelectorProps) {
    const candidates = useTreeLinkageCandidates(index, domainId, entityId);
    if (candidates.length === 0) return null;

    const useAll = !value || value.length === 0;
    const selected = new Set(value ?? []);

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        // если выбрали все — сбрасываем в undefined (авто-режим)
        onChange(next.size === candidates.length ? undefined : Array.from(next));
    };

    const toggleAll = () => {
        onChange(useAll ? candidates.map((c) => c.id) : undefined);
    };

    return (
        <div className="tree-linkage-selector">
            <div className="tree-linkage-selector__head">
                <span className="tree-linkage-selector__title">Связи дерева</span>
                <button
                    type="button"
                    className="btn btn--link"
                    onClick={toggleAll}
                    style={{ padding: "2px 8px", fontSize: 11 }}
                >
                    {useAll ? "Выбрать конкретные" : "Все (авто)"}
                </button>
            </div>
            {useAll ? (
                <div className="tree-linkage-selector__auto">
                    <MIcon name="auto_awesome" size="sm" />
                    <span>
                        Используются все side-1 связи типа 1_n и n_n ({candidates.length})
                    </span>
                </div>
            ) : (
                <div className="tree-linkage-selector__list">
                    {candidates.map((c) => (
                        <label key={c.id} className="tree-linkage-selector__item">
                            <input
                                type="checkbox"
                                checked={selected.has(c.id)}
                                onChange={() => toggle(c.id)}
                            />
                            <code>{c.id}</code>
                            <span className="tree-linkage-selector__name">{c.name}</span>
                            <span
                                className={
                                    "tree-linkage-selector__peer" +
                                    (c.peerInDomain
                                        ? ""
                                        : " tree-linkage-selector__peer--cross")
                                }
                                title={c.peerFqid}
                            >
                                → {c.peerEntityId}
                                {!c.peerInDomain && " (др. домен)"}
                            </span>
                            <span className="tree-linkage-selector__type">
                                {c.type}
                                {c.undirected ? " ↔" : " →"}
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}