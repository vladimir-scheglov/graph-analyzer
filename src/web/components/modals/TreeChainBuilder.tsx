import React, { useMemo } from "react";
import { MIcon } from "../common/MIcon";
import type { ModelIndex } from "../../../shared/model-types";
import type {
    TreeChain,
    TreeChainStep,
} from "../../../core/analyzer/schema-generator/types";

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

function caseFqid(
    raw: string,
    index: ModelIndex,
    currentDomainId: string,
): string {
    if (!raw) return raw;
    const normalized = raw.includes("/")
        ? raw.toLowerCase()
        : `${currentDomainId}/${raw}`.toLowerCase();
    const entity = index.entitiesByFqid[normalized];
    if (entity) return `${entity.domainId}/${entity.entityId}`;
    return raw.includes("/") ? raw : `${currentDomainId}/${raw}`;
}

function isAncestorOrEqual(
    ancestorFqid: string,
    entityFqid: string,
    index: ModelIndex,
): boolean {
    let cur = entityFqid.toLowerCase();
    const target = ancestorFqid.toLowerCase();
    let guard = 0;
    while (cur && guard < 20) {
        if (cur === target) return true;
        const rec = index.entitiesByFqid[cur];
        cur = rec?.inherits ? rec.inherits.toLowerCase() : "";
        guard++;
    }
    return false;
}

interface Candidate {
    linkageId: string;
    linkageName: string;
    linkageType: string;
    childFqid: string;
    childEntityId: string;
    childDomainId: string;
    parentMatchIsAncestor: boolean;
    parentAncestorFqid: string | null;
}

function candidatesFor(
    parentFqid: string,
    index: ModelIndex,
    domainId: string,
): Candidate[] {
    const out: Candidate[] = [];
    const seen = new Set<string>();

    for (const L of index.entityLinkages) {
        if (L.type !== "1_n") continue;                            // только 1_n
        if (!isAncestorOrEqual(parentFqid, L.side1Fqid, index)) continue;  // parent на side1

        const childFqid = caseFqid(L.side2Fqid, index, domainId);
        const childRec = index.entitiesByFqid[childFqid.toLowerCase()];
        const childDomainId = childFqid.includes("/")
            ? childFqid.split("/")[0]
            : domainId;
        const childEntityId = childRec
            ? childRec.entityId
            : childFqid.split("/").pop() || childFqid;

        const parentMatchIsAncestor =
            L.side1Fqid.toLowerCase() !== parentFqid.toLowerCase();

        const key = `${L.id}\u0000${childFqid.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
            linkageId: L.id,
            linkageName: L.name,
            linkageType: L.type,
            childFqid,
            childEntityId,
            childDomainId,
            parentMatchIsAncestor,
            parentAncestorFqid: parentMatchIsAncestor ? L.side1Fqid : null,
        });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// props
// ─────────────────────────────────────────────────────────────

export interface ExistingTreeOption {
    id: string;
    name: string;
    hierarchy: any;
}

export interface TreeChainBuilderProps {
    index: ModelIndex | null;
    domainId: string;
    rootEntityId: string;
    value: TreeChain | undefined;
    useExistingId: string | undefined;
    onChangeChain: (v: TreeChain | undefined) => void;
    onChangeUseExisting: (id: string | undefined) => void;
    existingTrees: ExistingTreeOption[];
}

// ─────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────

export function TreeChainBuilder(props: TreeChainBuilderProps) {
    const {
        index,
        domainId,
        rootEntityId,
        value,
        useExistingId,
        onChangeChain,
        onChangeUseExisting,
        existingTrees,
    } = props;

    const useExisting = !!useExistingId;
    const chain: TreeChain = value ?? [];

    const steps = useMemo(() => {
        if (!index || !domainId) return [];
        const parents: string[] = [`${domainId}/${rootEntityId}`];
        for (const step of chain) parents.push(step.childEntityId);
        return parents.slice(0, chain.length + 1).map((parentFqid, i) => ({
            index: i,
            parentFqid,
            candidates: candidatesFor(parentFqid, index, domainId),
            selected: chain[i] ?? null,
        }));
    }, [index, domainId, rootEntityId, chain]);

    if (!index) {
        return (
            <div className="tree-chain tree-chain--empty">
                <MIcon name="hourglass_top" size="sm" />
                <span>Загрузка индекса…</span>
            </div>
        );
    }

    const handleSelectCandidate = (
        stepIdx: number,
        candidate: Candidate,
    ) => {
        const newChain = chain.slice(0, stepIdx);
        newChain[stepIdx] = {
            linkageId: candidate.linkageId,
            side: 1,
            childEntityId: candidate.childFqid,
        };
        onChangeChain(newChain);
    };

    const handleRemoveStep = (stepIdx: number) => {
        const newChain = chain.slice(0, stepIdx);
        onChangeChain(newChain.length > 0 ? newChain : undefined);
    };

    const handleToggleUseExisting = (on: boolean) => {
        if (on) onChangeChain(undefined);
        else onChangeUseExisting(undefined);
    };

    const preview = useMemo(() => {
        if (chain.length === 0) return null;
        const lines: Array<{
            depth: number;
            linkageId: string;
            entityId: string;
        }> = [{ depth: 0, linkageId: "", entityId: rootEntityId }];
        chain.forEach((step, i) => {
            lines.push({
                depth: i + 1,
                linkageId: step.linkageId,
                entityId: step.childEntityId,
            });
        });
        return lines;
    }, [chain, rootEntityId]);

    return (
        <div className="tree-chain">
            <label className="tree-chain__existing-option">
                <input
                    type="checkbox"
                    checked={useExisting}
                    onChange={(e) => handleToggleUseExisting(e.target.checked)}
                />
                <span>Использовать существующее дерево</span>
                {useExisting && (
                    <select
                        className="tree-chain__select"
                        value={useExistingId ?? ""}
                        onChange={(e) =>
                            onChangeUseExisting(e.target.value || undefined)
                        }
                        style={{ marginLeft: "auto", maxWidth: 280 }}
                    >
                        <option value="">— выберите дерево —</option>
                        {existingTrees.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.id} — {t.name}
                            </option>
                        ))}
                    </select>
                )}
            </label>

            {!useExisting && (
                <>
                    {steps.length > 0 && (
                        <div className="tree-chain__steps">
                            {steps.map((s) => {
                                const selected = s.selected;
                                return (
                                    <div
                                        key={s.index}
                                        className="tree-chain__step"
                                    >
                                        <div className="tree-chain__step-header">
                                            <span className="tree-chain__step-num">
                                                {s.index + 1}
                                            </span>
                                            <span className="tree-chain__step-parent">
                                                {s.parentFqid}
                                            </span>
                                            {selected && (
                                                <button
                                                    type="button"
                                                    className="tree-chain__remove"
                                                    onClick={() =>
                                                        handleRemoveStep(s.index)
                                                    }
                                                    title="Удалить шаг и все следующие"
                                                >
                                                    <MIcon name="close" size="sm" />
                                                </button>
                                            )}
                                        </div>
                                        <select
                                            className="tree-chain__select"
                                            value={selected ? selected.linkageId : ""}
                                            onChange={(e) => {
                                                const lid = e.target.value;
                                                if (!lid) {
                                                    handleRemoveStep(s.index);
                                                    return;
                                                }
                                                const cand = s.candidates.find(
                                                    (c) => c.linkageId === lid,
                                                );
                                                if (cand)
                                                    handleSelectCandidate(s.index, cand);
                                            }}
                                        >
                                            <option value="">
                                                {s.candidates.length === 0
                                                    ? "— нет подходящих связей —"
                                                    : "— выберите связь —"}
                                            </option>
                                            {s.candidates.map((c) => (
                                                <option
                                                    key={`${c.linkageId}::${c.childFqid}`}
                                                    value={c.linkageId}
                                                >
                                                    {c.linkageId}:{" "}
                                                    {c.parentMatchIsAncestor
                                                        ? `${c.parentAncestorFqid} (родитель)`
                                                        : s.parentFqid}{" "}
                                                    → {c.childEntityId}
                                                    {c.childDomainId !== domainId
                                                        ? ` (${c.childDomainId})`
                                                        : ""}
                                                </option>
                                            ))}
                                        </select>
                                        {s.candidates.length === 0 && s.index > 0 && (
                                            <div className="tree-chain__step-empty">
                                                <MIcon name="link_off" size="sm" />
                                                <span>
                                                    У этой сущности нет подходящих 1_n
                                                    связей (только n_n и 1_1 не
                                                    поддерживаются в иерархии).
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {preview && (
                        <div className="tree-chain__preview">
                            <div className="tree-chain__preview-title">
                                Предпросмотр
                            </div>
                            <div className="tree-chain__preview-tree">
                                {preview.map((p, i) => (
                                    <div
                                        key={i}
                                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                                    >
                                        <span
                                            className={
                                                "tree-chain__preview-node" +
                                                (i === 0 ? " tree-chain__preview-node--root" : "")
                                            }
                                            style={{ marginLeft: p.depth * 16 }}
                                        >
                                            {p.entityId}
                                        </span>
                                        {p.linkageId && (
                                            <span className="tree-chain__preview-linkage">
                                                ← {p.linkageId}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {chain.length === 0 && (
                        <div className="tree-chain__hint">
                            <MIcon name="info" size="sm" />
                            <span>
                                Выберите первую связь — она соединит{" "}
                                <code>{rootEntityId}</code> с дочерней сущностью.
                                Далее — по цепочке. Доступны только связи типа{" "}
                                <code>1_n</code>, где текущий parent стоит на стороне 1.
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}