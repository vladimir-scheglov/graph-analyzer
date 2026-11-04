import React, { useMemo } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common/MIcon";
import { DomainCombobox } from "../common/DomainCombobox";

interface Step {
    id: string;
    title: string;
    description: string;
    done: boolean;
    actionLabel?: string;
    action?: () => void;
    icon: string;
    hint?: string;
}

export function DomainOnboardingWizard() {
    const open = useGraphStore((s) => s.onboardingWizardOpen);
    const domainId = useGraphStore((s) => s.onboardingWizardDomainId);
    const setOpen = useGraphStore((s) => s.setOnboardingWizardOpen);
    const { index } = useModelIndex();

    const allDomains = useMemo<Array<[string, number]>>(() => {
        if (!index) return [];
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        index.domains.forEach((d) => {
            if (!map.has(d.id)) map.set(d.id, 0);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const steps = useMemo<Step[]>(() => {
        if (!index || !domainId || !schema) return [];
        const s = schema.sections;
        const domainEntities = index.entities.filter((e) => e.domainId === domainId);
        const hasMenuRoot = s.menus.items?.some((m: any) => m.type === "root_group" || m.type === "root_menu");
        const hasMedias = (s.medias.items?.length || 0) > 0;
        const hasActions = s.actions.items?.length > 0;
        const hasViews = s.views.items?.length > 0;
        const hasExchange = !!index.exchangeSettingsByDomain?.[domainId];
        const hasUiRules = s.uiRules.items?.length > 0;
        const hasLint = (index.lint?.lintReport?.issues || []).some(
            (i: any) => i.domainId === domainId && i.severity === "error",
        );

        return [
            {
                id: "entities",
                title: "Сущности и атрибуты",
                description: "Опишите хотя бы одну сущность с 1–2 атрибутами",
                done: domainEntities.length > 0,
                icon: "category",
                hint: `${domainEntities.length} сущностей`,
            },
            {
                id: "linkages",
                title: "Связи",
                description: "Опишите связи между сущностями (или пропустите, если связей нет)",
                done: (s.linkages.items?.length || 0) > 0,
                icon: "link",
                hint: `${s.linkages.items?.length || 0} связей`,
            },
            {
                id: "medias",
                title: "Иконки",
                description: "Добавьте набор иконок для кнопок (add/edit/delete)",
                done: hasMedias,
                icon: "image",
                actionLabel: "Добавить палитру",
                action: () => {
                    const st = useGraphStore.getState();
                    st.setGenerateSchemaDomainId(domainId);
                    st.setGenerateSchemaEntityId(null);
                    st.setGenerateSchemaPrefillProfile("domain-extras");
                    st.setGenerateSchemaOpen(true);
                    setOpen(false);
                },
            },
            {
                id: "actions",
                title: "Действия",
                description: "Кнопки: создать / открыть / удалить",
                done: hasActions,
                icon: "bolt",
                actionLabel: "Профиль CRUD",
                action: () => {
                    const st = useGraphStore.getState();
                    st.setGenerateBatchDomainId(domainId);
                    st.setGenerateBatchOpen(true);
                    setOpen(false);
                },
            },
            {
                id: "views",
                title: "Views",
                description: "Entity-view, list-view, панель, модалка",
                done: hasViews,
                icon: "view_quilt",
            },
            {
                id: "menu",
                title: "Меню",
                description: "Пункт меню, чтобы пользователь попал в раздел",
                done: hasMenuRoot,
                icon: "menu",
                actionLabel: "Создать root_group",
                action: () => {
                    const st = useGraphStore.getState();
                    st.setGenerateSchemaDomainId(domainId);
                    st.setGenerateSchemaEntityId(null);
                    st.setGenerateSchemaPrefillProfile("domain-extras");
                    st.setGenerateSchemaOpen(true);
                    setOpen(false);
                },
            },
            {
                id: "exchange",
                title: "Обмен данными",
                description: "Настройки импорта/экспорта (опционально)",
                done: hasExchange,
                icon: "swap_horiz",
                actionLabel: "Скелет exchangeSettings",
                action: () => {
                    const st = useGraphStore.getState();
                    st.setGenerateSchemaDomainId(domainId);
                    st.setGenerateSchemaEntityId(null);
                    st.setGenerateSchemaPrefillProfile("exchange-settings");
                    st.setGenerateSchemaOpen(true);
                    setOpen(false);
                },
            },
            {
                id: "uiRules",
                title: "UI Rules",
                description: "Условное скрытие / readonly (опционально)",
                done: hasUiRules,
                icon: "rule_folder",
            },
            {
                id: "lint",
                title: "Линтер чист",
                description: "Нет ошибок в линтере схемы",
                done: !hasLint,
                icon: "science",
                actionLabel: "Открыть линтер",
                action: () => {
                    useGraphStore.getState().setLintOpen(true);
                    setOpen(false);
                },
            },
        ];
    }, [index, domainId, schema, setOpen]);

    const doneCount = steps.filter((s) => s.done).length;
    const pct = steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100);

    if (!open) return null;

    return (
        <div className="help-overlay help-overlay--fullscreen" onMouseDown={() => setOpen(false)}>
            <div className="help-modal onboarding-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="rocket_launch" size="sm" />
                        <span className="icon-label">Онбординг домена</span>
                    </div>
                    <div style={{ marginLeft: "auto", marginRight: 12, minWidth: 280 }}>
                        <DomainCombobox
                            value={domainId || ""}
                            onChange={(v) => useGraphStore.getState().setOnboardingWizardDomainId(v || null)}
                            domains={allDomains}
                            placeholder="Выберите домен..."
                        />
                    </div>
                    <button className="help-modal__close" onClick={() => setOpen(false)}>✕</button>
                </div>

                <div className="help-modal__body">
                    {!domainId ? (
                        <div className="onboarding-domain-picker">
                            <div className="onboarding-domain-picker__icon">
                                <MIcon name="rocket_launch" size="xl" />
                            </div>
                            <div className="onboarding-domain-picker__title">
                                Выберите домен
                            </div>
                            <div className="onboarding-domain-picker__hint">
                                Домен можно выбрать в селекторе в шапке модалки. Покажем
                                пошаговый чек-лист: что уже сделано, что осталось.
                            </div>
                        </div>
                    ) : !schema ? (
                        <div className="onboarding-empty">Схема домена не найдена</div>
                    ) : (
                        <>
                            <div className="onboarding-progress">...
                                <div className="onboarding-progress__bar">
                                    <div className="onboarding-progress__fill" style={{ width: `${pct}%` }} />
                                </div>
                                <div className="onboarding-progress__label">
                                    {doneCount} / {steps.length} шагов ({pct}%)
                                </div>
                            </div>

                            <div className="onboarding-steps">
                                {steps.map((s, i) => (
                                    <div key={s.id} className={"onboarding-step" + (s.done ? " onboarding-step--done" : "")}>
                                        <div className="onboarding-step__icon">
                                            <MIcon name={s.done ? "check_circle" : s.icon} size="sm" />
                                        </div>
                                        <div className="onboarding-step__body">
                                            <div className="onboarding-step__title">
                                                <span className="onboarding-step__num">{i + 1}.</span>
                                                {s.title}
                                                {s.hint && <span className="onboarding-step__hint">({s.hint})</span>}
                                            </div>
                                            <div className="onboarding-step__desc">{s.description}</div>
                                        </div>
                                        {s.action && !s.done && (
                                            <button className="btn btn--primary btn--small" onClick={s.action}>
                                                {s.actionLabel}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="validation-footer">
                    <div className="validation-stats">
                        {pct === 100 && <span className="validation-stat validation-stat--ok">✅ Домен полностью готов</span>}
                    </div>
                    <div className="validation-footer__actions">
                        <button className="btn" onClick={() => setOpen(false)}>Закрыть</button>
                    </div>
                </div>
            </div>
        </div>
    );
}