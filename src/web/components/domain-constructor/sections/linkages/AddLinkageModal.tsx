import { useEffect, useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import {
    addLinkage, validateLinkageDraft,
} from './linkages-handlers';
import { toast } from '../../ui/toast';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Предзаполненная сторона 1 (локальный ID или FQID). */
    presetSide1?: string;
    /** Предзаполненная сторона 2 (локальный ID или FQID). */
    presetSide2?: string;
    /** Колбэк после успешного создания. */
    onCreated?: (linkageId: string) => void;
}

export const AddLinkageModal: FC<Props> = ({
    open, onClose, presetSide1, presetSide2, onCreated,
}) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [side1, setSide1] = useState<string | null>(null);
    const [side2, setSide2] = useState<string | null>(null);
    const [type, setType] = useState<'1_1' | '1_n' | 'n_n'>('1_n');
    const [undirected, setUndirected] = useState(false);

    useEffect(() => {
        if (!open) return;
        setId('');
        setName('');
        setSide1(presetSide1 ?? null);
        setSide2(presetSide2 ?? null);
        setType('1_n');
        setUndirected(false);
    }, [open, presetSide1, presetSide2]);

    const existingIds = useMemo(
        () => new Set(schema.linkages.map((l) => l.id)),
        [schema.linkages],
    );

    const validation = useMemo(
        () =>
            validateLinkageDraft({
                id,
                side1: side1 ?? '',
                side2: side2 ?? '',
                type,
                undirected,
                existingIds,
            }),
        [id, side1, side2, type, undirected, existingIds],
    );

    const canSubmit = validation.errors.length === 0;

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal dc-modal--wide" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новая связь</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">
                            ID <span className="dc-field__required">*</span>
                        </label>
                        <input
                            className="dc-input"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            autoFocus
                        />
                        {validation.errors.length === 0 && existingIds.has(id) && (
                            <div className="dc-field__error">ID уже используется</div>
                        )}
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">
                                Сторона 1 <span className="dc-field__required">*</span>
                            </label>
                            <EntitySelect
                                value={side1}
                                onChange={setSide1}
                                placeholder="— выберите —"
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">
                                Сторона 2 <span className="dc-field__required">*</span>
                            </label>
                            <EntitySelect
                                value={side2}
                                onChange={setSide2}
                                placeholder="— выберите —"
                            />
                        </div>
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Тип связи</label>
                            <select
                                className="dc-input"
                                value={type}
                                onChange={(e) => {
                                    const t = e.target.value as '1_1' | '1_n' | 'n_n';
                                    setType(t);
                                    if (t !== 'n_n') setUndirected(false);
                                }}
                            >
                                <option value="1_1">1–1</option>
                                <option value="1_n">1–N</option>
                                <option value="n_n">N–N</option>
                            </select>
                        </div>
                        <div className="dc-field">
                            <label
                                className="dc-field__label"
                                style={{ visibility: type === 'n_n' ? 'visible' : 'hidden' }}
                            >
                                <input
                                    type="checkbox"
                                    className="dc-checkbox"
                                    checked={undirected}
                                    onChange={(e) => setUndirected(e.target.checked)}
                                    disabled={type !== 'n_n'}
                                />{' '}
                                Ненаправленная
                            </label>
                        </div>
                    </div>

                    {validation.errors.length > 0 && (
                        <div className="dc-banner dc-banner--error" style={{ marginTop: 8 }}>
                            <ul>
                                {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                    {validation.warnings.length > 0 && (
                        <div className="dc-banner dc-banner--warn" style={{ marginTop: 8 }}>
                            <ul>
                                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
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
                                addLinkage(doc, {
                                    id,
                                    side1: side1!,
                                    side2: side2!,
                                    type,
                                    name: name || undefined,
                                    undirected: type === 'n_n' && undirected,
                                }),
                            );
                            select(`linkage:${id}`);
                            toast.success(`Связь «${id}» создана`);
                            onCreated?.(id);
                            onClose();
                        }}
                    >
                        Создать
                    </button>
                </div>
            </div>
        </div>
    );
};