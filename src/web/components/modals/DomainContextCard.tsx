// src/web/components/modals/DomainContextCard.tsx
import React from "react";
import { MIcon } from "../common/MIcon";
import type { ModelIndex } from "../../../shared/model-types";

export interface DomainContextCardProps {
    domainId: string;
    index: ModelIndex | null;
}

export function DomainContextCard({ domainId, index }: DomainContextCardProps) {
    if (!index) return null;
    const schema = index.schemasByDomain[domainId];
    const entities = index.entities.filter((e) => e.domainId === domainId);

    const stats = [
        {
            icon: "data_object",
            label: "сущ.",
            value: entities.length,
            warn: entities.length === 0,
            title: "Сущностей в домене",
        },
        {
            icon: "view_quilt",
            label: "views",
            value: schema?.sections.views.count ?? 0,
            title: "Представлений",
        },
        {
            icon: "bolt",
            label: "actions",
            value: schema?.sections.actions.count ?? 0,
            title: "Действий",
        },
        {
            icon: "menu",
            label: "меню",
            value: schema?.sections.menus.count ?? 0,
            warn: (schema?.sections.menus.count ?? 0) === 0,
            title: "Корневых пунктов меню",
        },
        {
            icon: "category",
            label: "типы",
            value: schema?.sections.dataTypes.count ?? 0,
            title: "Типов данных",
        },
    ];

    return (
        <div className="generate-schema-domain-context">
            <div className="generate-schema-domain-context__title">
                <MIcon name="folder" size="sm" />
                <span>Домен</span>
                <code>{domainId}</code>
            </div>
            <div className="generate-schema-domain-context__stats">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className={
                            "generate-schema-domain-context__stat" +
                            (s.warn ? " generate-schema-domain-context__stat--warn" : "")
                        }
                        title={s.title}
                    >
                        <MIcon name={s.icon} size="sm" />
                        <strong>{s.value}</strong>
                        <span>{s.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}