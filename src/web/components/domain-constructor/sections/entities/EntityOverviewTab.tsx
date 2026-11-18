import { useMemo, useRef, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { EntitySelect } from "../../ui/EntitySelect";
import type { EntitySchema } from "../../types";
import { updateEntityField, setEntityGraphColor } from "./entity-handlers";
import { useInheritedAttributes } from "./use-inherited-attributes";
import { GRAPH_COLORS, GRAPH_COLOR_HEX, SYSTEM_ATTRIBUTES } from "./entity-utils";
import { Chip, FormSection, InlineText, Switch } from "./ui";

export const EntityOverviewTab: FC<{ entity: EntitySchema }> = ({ entity }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);
    const select = useEditorStore((s) => s.select);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const isPublished = useEditorStore((s) => s.isPublished);
    const inherited = useInheritedAttributes(entity, modelIndex);
    const labelRef = useRef<HTMLInputElement>(null);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateEntityField(doc, entity.id, field, value));

    const allAttrs = useMemo(() => {
        const own = entity.attributes.map((a) => ({ id: a.id, name: a.name, dataType: a.dataType }));
        const inh = inherited.map((x) => ({ id: x.attr.id, name: x.attr.name, dataType: x.attr.dataType }));
        return [...own, ...inh];
    }, [entity.attributes, inherited]);

    const labelAttrs = useMemo(
        () => [...allAttrs.filter((a) => a.dataType !== "Reference"), ...SYSTEM_ATTRIBUTES.filter((s) => s.dataType !== "Reference")],
        [allAttrs],
    );

    const requiredCount = entity.attributes.filter((a) =>
        (a.constraints ?? []).some((c) => c.kind === "required"),
    ).length;

    const linkages = schema.linkages.filter((l) => {
        const id = entity.id.toLowerCase();
        return (
            l.side1.split("/").pop()?.toLowerCase() === id ||
            l.side2.split("/").pop()?.toLowerCase() === id
        );
    });

    const projection = entity.projection ?? [];
    const searching = entity.searching ?? [];

    const insertLabelToken = (attrId: string) => {
        const token = `{${attrId}}`;
        const input = labelRef.current;
        const current = entity.label ?? "";
        let next: string;
        if (input && document.activeElement === input) {
            const pos = input.selectionStart ?? current.length;
            next = current.slice(0, pos) + token + current.slice(pos);
        } else {
            next = current ? `${current} ${token}` : token;
        }
        set("label", next);
    };

    const labelPreview = (entity.label ?? "").replace(/\{([^}]+)\}/g, (_, id) => {
        const attr = [...allAttrs, ...SYSTEM_ATTRIBUTES].find((a) => a.id === id);
        return attr ? `‹${attr.name || attr.id}›` : `‹?${id}›`;
    });

    const renderPicker = (
        title: string,
        hint: string,
        items: Array<{ attribute: string }>,
        field: "projection" | "searching",
    ) => {
        const used = new Set(items.map((i) => i.attribute));
        const available = allAttrs.filter((a) => !used.has(a.id));
        return (
            <FormSection title={title}>
                <div className="ent-hint" style={{ marginBottom: 8 }}>{hint}</div>
                <div className="ent-chips">
                    {items.map((p) => (
                        <Chip
                            key={p.attribute}
                            tone="accent"
                            onRemove={() => set(field, items.filter((x) => x.attribute !== p.attribute).length ? items.filter((x) => x.attribute !== p.attribute) : undefined)}
                        >
                            {p.attribute}
                        </Chip>
                    ))}
                    {items.length === 0 && <span className="ent-hint">Не задано</span>}
                </div>
                {available.length > 0 && (
                    <select
                        className="ent-select ent-select--inline"
                        style={{ marginTop: 10 }}
                        value=""
                        onChange={(e) => {
                            if (!e.target.value) return;
                            set(field, [...items, { attribute: e.target.value }]);
                        }}
                    >
                        <option value="">+ добавить атрибут…</option>
                        {available.map((a) => (
                            <option key={a.id} value={a.id}>{a.name || a.id} ({a.dataType})</option>
                        ))}
                    </select>
                )}
            </FormSection>
        );
    };

    return (
        <div>
            <div className="ent-stats">
                <div className="ent-stat" style={{ ["--stat-hue" as any]: "var(--ent-blue)" }}>
                    <div className="ent-stat__value">{entity.attributes.length}</div>
                    <div className="ent-stat__label">Атрибутов</div>
                </div>
                <div className="ent-stat" style={{ ["--stat-hue" as any]: "var(--ent-danger)" }}>
                    <div className="ent-stat__value">{requiredCount}</div>
                    <div className="ent-stat__label">Обязательных</div>
                </div>
                <div className="ent-stat" style={{ ["--stat-hue" as any]: "var(--ent-violet)" }}>
                    <div className="ent-stat__value">{entity.sorting?.length ?? 0}</div>
                    <div className="ent-stat__label">Правил сортировки</div>
                </div>
                <div className="ent-stat" style={{ ["--stat-hue" as any]: "var(--ent-magenta)" }}>
                    <div className="ent-stat__value">{linkages.length}</div>
                    <div className="ent-stat__label">Связей</div>
                </div>
                <div className="ent-stat" style={{ ["--stat-hue" as any]: "var(--ent-teal)" }}>
                    <div className="ent-stat__value">{inherited.length}</div>
                    <div className="ent-stat__label">Унаследовано</div>
                </div>
            </div>

            <FormSection title="Основное">
                <div className="ent-grid">
                    <div className="ent-field">
                        <label className="ent-label">Название</label>
                        <InlineText value={entity.name ?? ""} onCommit={(v) => set("name", v)} placeholder="Отображаемое имя" />
                    </div>
                    <div className="ent-field">
                        <label className="ent-label">Вид сущности</label>
                        <select
                            className="ent-select"
                            value={entity.kind ?? "regular"}
                            onChange={(e) => set("kind", e.target.value === "regular" ? undefined : e.target.value)}
                        >
                            <option value="regular">regular — стандартная</option>
                            <option value="abstract">abstract — абстрактная</option>
                            <option value="static">static — статическая</option>
                        </select>
                    </div>
                    <div className="ent-field ent-field--full">
                        <label className="ent-label">Описание</label>
                        <InlineText value={entity.description ?? ""} onCommit={(v) => set("description", v)} placeholder="Назначение сущности (видно только в схеме)" />
                    </div>
                    <div className="ent-field ent-field--full">
                        <label className="ent-label">Родитель (inherits)</label>
                        <EntitySelect
                            value={entity.inherits ?? null}
                            onChange={(fqid) => set("inherits", fqid ?? undefined)}
                            disabled={isPublished}
                            placeholder="— нет —"
                        />
                        <div className="ent-hint">
                            Атрибуты и интерфейсы родителя станут доступны как унаследованные.
                            {isPublished && " Смена родителя заблокирована после публикации."}
                        </div>
                    </div>
                </div>
            </FormSection>

            <FormSection title="Лейбл — шаблон названия объекта">
                <input
                    ref={labelRef}
                    className="ent-input"
                    defaultValue={entity.label ?? ""}
                    key={entity.id + ":" + (entity.label ?? "")}
                    placeholder="{type}: {value}"
                    onBlur={(e) => set("label", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <div className="ent-hint" style={{ margin: "8px 0" }}>
                    Кликните атрибут, чтобы вставить его в шаблон. Без лейбла объект отображается как <code>{"{id} ({domainId}/{entityId})"}</code>.
                </div>
                <div className="ent-chips">
                    {labelAttrs.map((a) => (
                        <Chip key={a.id} onClick={() => insertLabelToken(a.id)} title={a.name || a.id}>
                            {a.id}
                        </Chip>
                    ))}
                </div>
                {entity.label && (
                    <div className="ent-labelpreview">
                        Предпросмотр: <b>{labelPreview || "—"}</b>
                    </div>
                )}
            </FormSection>

            {renderPicker(
                "Проекции",
                "Атрибуты, которые автоматически подгружаются при обращении к объекту через Reference.",
                projection,
                "projection",
            )}
            {renderPicker(
                "Атрибуты для поиска",
                "Поиск объектов будет выполняться не только по лейблу, но и по этим атрибутам.",
                searching,
                "searching",
            )}

            <FormSection title="Граф и сканирование">
                <div className="ent-field" style={{ marginBottom: 14 }}>
                    <label className="ent-label">Цвет иконки на диаграмме связей</label>
                    <div className="ent-swatches" style={{ marginTop: 6 }}>
                        <button
                            className={"ent-swatch ent-swatch--none" + (!entity.graphView?.iconColor ? " ent-swatch--active" : "")}
                            title="Без цвета"
                            onClick={() => commit((doc) => setEntityGraphColor(doc, entity.id, undefined))}
                        >
                            ∅
                        </button>
                        {GRAPH_COLORS.map((c) => (
                            <button
                                key={c}
                                className={"ent-swatch" + (entity.graphView?.iconColor === c ? " ent-swatch--active" : "")}
                                style={{ background: GRAPH_COLOR_HEX[c] }}
                                title={c}
                                onClick={() => commit((doc) => setEntityGraphColor(doc, entity.id, c))}
                            />
                        ))}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <Switch
                        checked={!!entity.scanTarget}
                        onChange={(v) => set("scanTarget", v ? true : undefined)}
                        label="Цель сканирования (scanTarget)"
                    />
                    <Switch
                        checked={!!entity.scanTargetGroup}
                        onChange={(v) => set("scanTargetGroup", v ? true : undefined)}
                        label="Группа целей сканирования"
                    />
                </div>
            </FormSection>

            {linkages.length > 0 && (
                <FormSection title="Связи сущности">
                    <div className="ent-chips">
                        {linkages.map((l) => (
                            <Chip key={l.id} onClick={() => select(`linkage:${l.id}`)} title="Открыть связь">
                                {l.name || l.id} · {l.type}
                            </Chip>
                        ))}
                    </div>
                </FormSection>
            )}
        </div>
    );
};