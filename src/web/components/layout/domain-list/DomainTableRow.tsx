import React from "react";
import { useGraphStore } from "../../../state/useGraphStore";
import { MIcon } from "../../common/MIcon";
import { openFileInEditor } from "../../../lib/open-file";
import { plural, relativeTimeShort } from "../../../lib/format";
import type { EnrichedDomain } from "./types";

export interface DomainTableRowProps {
    domain: EnrichedDomain;
    isActive: boolean;
    isFocused: boolean;
    isChecked: boolean;
    onSelect: () => void;
    onToggleCheck: () => void;
}

export const DomainTableRow = React.memo(function DomainTableRow({
    domain,
    isActive,
    isFocused,
    isChecked,
    onSelect,
    onToggleCheck,
}: DomainTableRowProps) {
    const d = domain;
    const status = d.statusNormalized;
    const isDisabled = status === "disabled";

    const openSchema = (e: React.MouseEvent) => {
        e.stopPropagation();
        const st = useGraphStore.getState();
        st.setDomainSchemaDomainId(d.domainId);
        st.setDomainSchemaOpen(true);
    };
    const openFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!d.filePath) return;
        openFileInEditor(d.filePath, null, d.domainId);
    };
    const toggleFav = (e: React.MouseEvent) => {
        e.stopPropagation();
        useGraphStore.getState().toggleBookmark(d.node.id);
    };
    const toggleStatus = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const res = await fetch("/api/toggle-domain-status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domainId: d.domainId }),
            });
            if (!res.ok) {
                useGraphStore.getState().showSnackbar("Ошибка смены статуса");
                return;
            }
            useGraphStore.getState().refreshGraphFromServer(true).catch(() => { });
        } catch {
            /* ignore */
        }
    };

    return (
        <tr
            className={
                "domain-table-row" +
                (isActive ? " domain-table-row--active" : "") +
                (isFocused ? " domain-table-row--focused" : "") +
                (isDisabled ? " domain-table-row--disabled" : "")
            }
            onClick={onSelect}
            data-node-id={d.node.id}
            title={d.description || d.domainId}
        >
            <td className="domain-table-row__check-cell">
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={onToggleCheck}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Выбрать ${d.domainId}`}
                />
            </td>
            <td className="domain-table-row__star-cell">
                <button
                    className={"domain-table-row__star" + (d.isFavorite ? " active" : "")}
                    onClick={toggleFav}
                    title={d.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                    <MIcon
                        name={d.isFavorite ? "star" : "star_border"}
                        size="sm"
                        fill={d.isFavorite}
                    />
                </button>
            </td>
            <td className="domain-table-row__name-cell">
                <div className="domain-table-row__name-row">
                    <span className="domain-table-row__name">
                        {d.name || d.domainId}
                    </span>
                    {d.hasDraft && (
                        <span className="domain-table-row__badge domain-table-row__badge--draft">
                            черновик
                        </span>
                    )}
                </div>
                <code className="domain-table-row__id" title={d.domainId}>
                    {d.domainId}
                </code>
            </td>
            <td className="domain-table-row__num-cell">
                {d.version ? (
                    <span className="domain-table-row__version">v{d.version}</span>
                ) : (
                    <span className="domain-table-row__dash">—</span>
                )}
            </td>
            <td className="domain-table-row__num-cell">
                <span
                    className={
                        "domain-table-row__entities" +
                        (d.entitiesCount === 0 ? " domain-table-row__entities--zero" : "")
                    }
                    title={`${d.entitiesCount} ${plural(d.entitiesCount, "сущность", "сущностей")}`}
                >
                    {d.entitiesCount}
                </span>
            </td>
            <td className="domain-table-row__num-cell">
                {d.attrs > 0 ? d.attrs : <span className="domain-table-row__dash">—</span>}
            </td>
            <td className="domain-table-row__num-cell">
                {d.views > 0 ? d.views : <span className="domain-table-row__dash">—</span>}
            </td>
            <td className="domain-table-row__health-cell">
                {d.health != null ? (
                    <span
                        className={
                            "domain-table-row__health domain-table-row__health--" +
                            d.healthLevel
                        }
                        title={`Health ${d.health}/100`}
                    >
                        {d.health}
                    </span>
                ) : (
                    <span className="domain-table-row__dash">—</span>
                )}
            </td>
            <td className="domain-table-row__badges-cell">
                <div className="domain-table-row__badges">
                    {d.isInvalid && (
                        <span
                            className="domain-table-row__badge domain-table-row__badge--err"
                            title="Невалидный домен"
                        >
                            <MIcon name="cancel" size="sm" />
                        </span>
                    )}
                    {d.lintErrors > 0 && (
                        <span
                            className="domain-table-row__badge domain-table-row__badge--err"
                            title={`${d.lintErrors} lint errors`}
                        >
                            <MIcon name="error" size="sm" />
                            {d.lintErrors}
                        </span>
                    )}
                    {d.piiCritical > 0 && (
                        <span
                            className="domain-table-row__badge domain-table-row__badge--warn"
                            title={`${d.piiCritical} PII critical`}
                        >
                            <MIcon name="shield_lock" size="sm" />
                            {d.piiCritical}
                        </span>
                    )}
                </div>
            </td>
            <td className="domain-table-row__tags-cell">
                <div className="domain-table-row__tags">
                    {d.tags.slice(0, 2).map((t) => (
                        <span key={t} className="domain-table-row__tag">
                            {t}
                        </span>
                    ))}
                    {d.tags.length > 2 && (
                        <span
                            className="domain-table-row__tag"
                            title={d.tags.join(", ")}
                        >
                            +{d.tags.length - 2}
                        </span>
                    )}
                </div>
            </td>
            <td className="domain-table-row__author-cell">
                {d.author ? (
                    <span className="domain-table-row__author" title={d.author}>
                        {d.author}
                    </span>
                ) : (
                    <span className="domain-table-row__dash">—</span>
                )}
            </td>
            <td className="domain-table-row__updated-cell">
                {d.updatedAt ? (
                    <span title={new Date(d.updatedAt).toLocaleString("ru-RU")}>
                        {relativeTimeShort(d.updatedAt)}
                    </span>
                ) : (
                    <span className="domain-table-row__dash">—</span>
                )}
            </td>
            <td className="domain-table-row__status-cell">
                {d.status && (
                    <button
                        className={
                            "domain-table-row__status domain-table-row__status--" +
                            status
                        }
                        onClick={toggleStatus}
                        title={
                            isDisabled
                                ? "Включить домен"
                                : "Выключить домен"
                        }
                    >
                        <MIcon
                            name={isDisabled ? "pause_circle" : "play_circle"}
                            size="sm"
                        />
                    </button>
                )}
            </td>
            <td className="domain-table-row__actions-cell">
                <button
                    className="domain-table-row__action"
                    onClick={openSchema}
                    title="Схема домена"
                >
                    <MIcon name="menu_book" size="sm" />
                </button>
                {d.filePath && (
                    <button
                        className="domain-table-row__action"
                        onClick={openFile}
                        title="Открыть файл"
                    >
                        <MIcon name="description" size="sm" />
                    </button>
                )}
            </td>
        </tr>
    );
});