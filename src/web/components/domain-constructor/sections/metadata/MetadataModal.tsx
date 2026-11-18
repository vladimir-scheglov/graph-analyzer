import { useEffect, useMemo, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    readMetadata, updateMetadataField,
    validateDomainId, validateVersion, validateName, validateTags,
    type MetadataSnapshot,
} from './metadata-handlers';

interface Props {
    open: boolean;
    onClose: () => void;
}

/**
 * Модальное окно метаданных схемы домена.
 *
 * Поля:
 *  - id          — FQDN, read-only после публикации
 *  - type        — domain, всегда read-only
 *  - version     — SemVer
 *  - name        — без пробелов
 *  - description — свободный текст
 *  - author      — свободный текст
 *  - status      — свободный текст (draft / test / published / …)
 *  - date        — YYYY-MM-DD
 *  - tags[]      — список через запятую
 */
export const MetadataModal: FC<Props> = ({ open, onClose }) => {
    const doc = useEditorStore((s) => s.doc);
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    // Снимок при открытии — чтобы «Отмена» не сломала текущее состояние
    const [snapshot, setSnapshot] = useState<MetadataSnapshot | null>(null);
    const [tagsInput, setTagsInput] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        const snap = readMetadata(doc);
        setSnapshot(snap);
        setTagsInput((snap.tags ?? []).join(', '));
        setErrors({});
    }, [open, doc]);

    if (!open || !snapshot) return null;

    const setField = (field: keyof MetadataSnapshot, value: unknown) => {
        setSnapshot((prev) => prev ? { ...prev, [field]: value } : prev);
    };

    const validate = (): Record<string, string> => {
        const errs: Record<string, string> = {};

        const idErr = validateDomainId(snapshot.id);
        if (idErr && !isPublished) errs.id = idErr;

        const verErr = validateVersion(snapshot.version);
        if (verErr) errs.version = verErr;

        const nameErr = validateName(snapshot.name);
        if (nameErr) errs.name = nameErr;

        if (snapshot.date && !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)) {
            errs.date = 'Формат YYYY-MM-DD';
        }

        const parsedTags = tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        const tagErrs = validateTags(parsedTags);
        if (tagErrs.length > 0) errs.tags = tagErrs.join('; ');

        return errs;
    };

    const handleSave = () => {
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }

        const parsedTags = tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);

        commit((d) => {
            // id — только если не published
            if (!isPublished) updateMetadataField(d, 'id', snapshot.id);
            updateMetadataField(d, 'version', snapshot.version);
            updateMetadataField(d, 'name', snapshot.name);
            updateMetadataField(d, 'description', snapshot.description);
            updateMetadataField(d, 'author', snapshot.author);
            updateMetadataField(d, 'status', snapshot.status);
            updateMetadataField(d, 'date', snapshot.date);
            updateMetadataField(d, 'tags', parsedTags.length > 0 ? parsedTags : undefined);
        });

        onClose();
    };

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div
                className="dc-modal dc-modal--wide"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="dc-modal__title">Метаданные схемы</h3>

                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">
                            ID (FQDN) {isPublished && <span className="dc-badge">read-only</span>}
                        </label>
                        <input
                            className="dc-input"
                            value={snapshot.id}
                            onChange={(e) => setField('id', e.target.value)}
                            disabled={isPublished}
                            placeholder="iocs.test"
                        />
                        {errors.id && <div className="dc-field__error">{errors.id}</div>}
                        {isPublished && (
                            <div className="dc-field__hint">
                                ID нельзя изменить после публикации — на него ссылаются другие домены.
                            </div>
                        )}
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Тип</label>
                        <input className="dc-input" value="domain" disabled />
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Версия (SemVer)</label>
                            <input
                                className="dc-input"
                                value={snapshot.version}
                                onChange={(e) => setField('version', e.target.value)}
                                placeholder="1.0.0"
                            />
                            {errors.version && <div className="dc-field__error">{errors.version}</div>}
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Status</label>
                            <select
                                className="dc-input"
                                value={snapshot.status ?? ''}
                                onChange={(e) => setField('status', e.target.value || undefined)}
                            >
                                <option value="">— не задано —</option>
                                <option value="draft">draft</option>
                                <option value="test">test</option>
                                <option value="published">published</option>
                                <option value="deprecated">deprecated</option>
                            </select>
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={snapshot.name}
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="IOCs Domain"
                        />
                        {errors.name && <div className="dc-field__error">{errors.name}</div>}
                        <div className="dc-field__hint">
                            Без пробелов; допустимы буквы, цифры, точки, подчёркивания, дефисы.
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Описание</label>
                        <textarea
                            className="dc-input dc-input--textarea"
                            value={snapshot.description ?? ''}
                            onChange={(e) => setField('description', e.target.value || undefined)}
                            placeholder="Краткое описание назначения домена"
                            rows={3}
                        />
                    </div>

                    <div className="dc-field-row">
                        <div className="dc-field">
                            <label className="dc-field__label">Автор</label>
                            <input
                                className="dc-input"
                                value={snapshot.author ?? ''}
                                onChange={(e) => setField('author', e.target.value || undefined)}
                                placeholder="Ivan Ivanov"
                            />
                        </div>
                        <div className="dc-field">
                            <label className="dc-field__label">Дата</label>
                            <input
                                className="dc-input"
                                type="date"
                                value={snapshot.date ?? ''}
                                onChange={(e) => setField('date', e.target.value || undefined)}
                            />
                            {errors.date && <div className="dc-field__error">{errors.date}</div>}
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Теги (через запятую)</label>
                        <input
                            className="dc-input"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                            placeholder="iocs, security, demo"
                        />
                        {errors.tags && <div className="dc-field__error">{errors.tags}</div>}
                    </div>
                </div>

                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button className="dc-btn dc-btn--primary" onClick={handleSave}>
                        Сохранить
                    </button>
                </div>
            </div>
        </div>
    );
};