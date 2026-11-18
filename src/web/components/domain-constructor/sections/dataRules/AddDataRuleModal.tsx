import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import { LinkageSelect } from '../../ui/LinkageSelect';
import {
    DataRuleTarget, addDataRule, validateDataRuleId,
} from './dataRules-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const AddDataRuleModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [target, setTarget] = useState<DataRuleTarget>('entity');
    const [entity, setEntity] = useState<string | null>(null);
    const [linkage, setLinkage] = useState<string | null>(null);
    const [attribute, setAttribute] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setId(''); setTarget('entity');
            setEntity(null); setLinkage(null); setAttribute(null);
        }
    }, [open]);

    const idErr = id ? validateDataRuleId(id) : null;
    const dup = schema.dataRules.some((r) => r.id === id);

    const entityObj = entity
        ? schema.entities.find((e) => e.id === entity)
        : null;
    const tableAttrs = entityObj?.attributes?.filter(
        (a) => a.dataType === 'Table' || a.dataType === 'Array',
    ) ?? [];

    const canSubmit =
        !!id && !idErr && !dup
        && (target === 'entity'
            ? !!entity
            : target === 'entityAttribute'
                ? !!entity && !!attribute
                : !!linkage);

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новое правило данных</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="verdict_default, incident_dates_validation, …"
                            autoFocus
                        />
                        {idErr && <div className="dc-field__error">{idErr}</div>}
                        {dup && <div className="dc-field__error">Уже существует</div>}
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Объект правила</label>
                        <select
                            className="dc-input"
                            value={target}
                            onChange={(e) => setTarget(e.target.value as DataRuleTarget)}
                        >
                            <option value="entity">Сущность</option>
                            <option value="entityAttribute">Таблица / Массив</option>
                            <option value="linkage">Связь</option>
                        </select>
                    </div>

                    {(target === 'entity' || target === 'entityAttribute') && (
                        <div className="dc-field">
                            <label className="dc-field__label">Сущность <span className="dc-field__required">*</span></label>
                            <EntitySelect value={entity} onChange={setEntity} />
                        </div>
                    )}

                    {target === 'entityAttribute' && (
                        <div className="dc-field">
                            <label className="dc-field__label">Атрибут Table / Array <span className="dc-field__required">*</span></label>
                            <select
                                className="dc-input"
                                value={attribute ?? ''}
                                onChange={(e) => setAttribute(e.target.value || null)}
                            >
                                <option value="">— выберите —</option>
                                {tableAttrs.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name || a.id} ({a.dataType})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {target === 'linkage' && (
                        <div className="dc-field">
                            <label className="dc-field__label">Связь <span className="dc-field__required">*</span></label>
                            <LinkageSelect value={linkage} onChange={setLinkage} />
                        </div>
                    )}
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={() => {
                            commit((doc) =>
                                addDataRule(doc, {
                                    id, target,
                                    entity: entity ?? undefined,
                                    linkage: linkage ?? undefined,
                                    attribute: attribute ?? undefined,
                                }),
                            );
                            select(`dataRule:${id}`);
                            onClose();
                        }}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};