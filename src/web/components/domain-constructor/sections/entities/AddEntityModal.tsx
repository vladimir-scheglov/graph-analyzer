import { useEffect, useMemo, useState, type FC } from "react";
import { useEditorStore } from "../../store/editor-store";
import { EntitySelect } from "../../ui/EntitySelect";
import { addEntity, validateEntityId } from "./entity-handlers";
import { suggestId } from "./entity-utils";

interface Props {
    open: boolean;
    onClose: () => void;
}

type Preset = "empty" | "dictionary" | "identified";

const PRESETS: Array<{ value: Preset; label: string; hint: string }> = [
    { value: "empty", label: "Пустая", hint: "Только сущность, атрибуты добавите сами" },
    { value: "dictionary", label: "Справочник", hint: "Поля name (обязательное) + description" },
    { value: "identified", label: "С идентификатором", hint: "name + человекочитаемый ID вида 2025-06-0001" },
];

export const AddEntityModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [name, setName] = useState("");
    const [id, setId] = useState("");
    const [idTouched, setIdTouched] = useState(false);
    const [inherits, setInherits] = useState<string | null>(null);
    const [kind, setKind] = useState("regular");
    const [preset, setPreset] = useState<Preset>("dictionary");

    useEffect(() => {
        if (open) {
            setName(""); setId(""); setIdTouched(false);
            setInherits(null); setKind("regular"); setPreset("dictionary");
        }
    }, [open]);

    const existingIds = useMemo(() => new Set(schema.entities.map((e) => e.id)), [schema.entities]);
    const autoId = name.trim() ? suggestId(name, "pascal", existingIds) : "";
    const effectiveId = idTouched ? id : autoId;

    const idErr = effectiveId ? validateEntityId(effectiveId) : null;
    const dup = existingIds.has(effectiveId);
    const canSubmit = !!effectiveId && !idErr && !dup;

    if (!open) return null;

    const handleSubmit = () => {
        if (!canSubmit) return;
        const attributes: Array<Record<string, unknown>> = [];
        if (preset !== "empty") {
            attributes.push({
                id: "name",
                dataType: "String",
                name: "Название",
                constraints: [{ kind: "required" }],
            });
            attributes.push({ id: "description", dataType: "Text", name: "Описание" });
        }
        if (preset === "identified") {
            attributes.push({
                id: "displayId",
                dataType: "Identifier",
                name: "Идентификатор",
                template: "{@YYYY}-{@MM}-{@inc}",
                incrementTemplate: "0000",
            });
        }
        commit((doc) =>
            addEntity(doc, {
                id: effectiveId,
                name: name.trim() || undefined,
                inherits,
                kind,
                label: preset !== "empty" ? "{name}" : undefined,
                attributes,
            }),
        );
        select(`entity:${effectiveId}`);
        onClose();
    };

    return (
        <div className="dc-modal-backdrop ent" onClick={onClose}>
            <div className="ent-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="ent-modal__title">Новая сущность</h3>

                <div className="ent-field">
                    <label className="ent-label">Название</label>
                    <input
                        className="ent-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Например: Уязвимость, Сервер, Категория инцидента…"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                    />
                    <div className="ent-hint">Можно на русском — ID сгенерируется автоматически.</div>
                </div>

                <div className="ent-field" style={{ marginTop: 12 }}>
                    <label className="ent-label">ID (Data ID, ≤30)</label>
                    <input
                        className="ent-input"
                        style={{ fontFamily: "ui-monospace, Menlo, monospace" }}
                        value={effectiveId}
                        onChange={(e) => {
                            setIdTouched(true);
                            setId(e.target.value);
                        }}
                        placeholder="Vulnerability"
                    />
                    {idErr && <div className="ent-error">{idErr}</div>}
                    {dup && <div className="ent-error">Сущность с таким ID уже есть</div>}
                </div>

                <div className="ent-grid" style={{ marginTop: 12 }}>
                    <div className="ent-field">
                        <label className="ent-label">Вид</label>
                        <select className="ent-select" value={kind} onChange={(e) => setKind(e.target.value)}>
                            <option value="regular">regular</option>
                            <option value="abstract">abstract</option>
                            <option value="static">static</option>
                        </select>
                    </div>
                    <div className="ent-field">
                        <label className="ent-label">Родитель</label>
                        <EntitySelect value={inherits} onChange={setInherits} placeholder="— нет —" />
                    </div>
                </div>

                <div className="ent-field" style={{ marginTop: 12 }}>
                    <label className="ent-label">Стартовый набор полей</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {PRESETS.map((p) => (
                            <label
                                key={p.value}
                                className="ent-switch"
                                style={{
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    border: `1px solid ${preset === p.value ? "var(--ent-primary)" : "var(--ent-border)"}`,
                                    background: preset === p.value ? "color-mix(in srgb, var(--ent-primary) 10%, transparent)" : "transparent",
                                }}
                            >
                                <input
                                    type="radio"
                                    name="ent-preset"
                                    checked={preset === p.value}
                                    onChange={() => setPreset(p.value)}
                                    style={{ accentColor: "var(--ent-primary)" }}
                                />
                                <span className="ent-switch__label">
                                    <b>{p.label}</b> <span className="ent-hint">— {p.hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="ent-modal__actions">
                    <button className="ent-btn" onClick={onClose}>Отмена</button>
                    <button className="ent-btn ent-btn--primary" disabled={!canSubmit} onClick={handleSubmit}>
                        Создать сущность
                    </button>
                </div>
            </div>
        </div>
    );
};