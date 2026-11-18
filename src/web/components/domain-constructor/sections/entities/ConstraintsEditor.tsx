import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    addConstraint,
    removeConstraint,
    updateConstraintField,
} from './entity-handlers';
import { getAvailableConstraints } from '../../model/compat-tables';
import type { AttributeDataType, Constraint } from '../../types';

interface Props {
    ownerType: 'entity' | 'linkage';
    ownerId: string;
    attributeId: string;
    dataType: AttributeDataType;
    constraints: Constraint[];
    /** 'attribute' — constraints самого атрибута; 'item' — item.constraints у Array. */
    target?: 'attribute' | 'item';
    disabled?: boolean;
}

/**
 * Редактор ограничений атрибута.
 *
 * Список доступных kind фильтруется по dataType (getAvailableConstraints).
 * Для каждого kind — свои поля:
 *   required   → message
 *   range      → min, max, message
 *   length     → min, max, message
 *   regexp     → regexp, message
 *   size       → min, max, message
 *   mime_types → mimeTypes[], message
 *   unique     → message
 *
 * Constraints, уже присутствующие в YAML, но невалидные для типа —
 * показываются с предупреждением (не удаляем автоматически).
 */
export const ConstraintsEditor: FC<Props> = ({
    ownerType,
    ownerId,
    attributeId,
    dataType,
    constraints,
    target = 'attribute',
    disabled = false,
}) => {
    const commit = useEditorStore((s) => s.commit);

    const availableKinds = getAvailableConstraints(dataType);
    const usedKinds = new Set(constraints.map((c) => c.kind));
    const addableKinds = availableKinds.filter((k) => !usedKinds.has(k));

    const updateField = (index: number, field: string, value: unknown) => {
        commit((doc) =>
            updateConstraintField(doc, ownerType, ownerId, attributeId, index, field, value, target),
        );
    };

    const updateMimeTypes = (index: number, raw: string) => {
        const arr = raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        updateField(index, 'mimeTypes', arr);
    };

    return (
        <div className="dc-constraints">
            <div className="dc-constraints__header">
                <h4 className="dc-constraints__title">Ограничения</h4>
                {!disabled && addableKinds.length > 0 && (
                    <select
                        className="dc-input dc-input--inline"
                        value=""
                        onChange={(e) => {
                            if (!e.target.value) return;
                            commit((doc) =>
                                addConstraint(doc, ownerType, ownerId, attributeId, e.target.value, target),
                            );
                        }}
                    >
                        <option value="">+ добавить ограничение</option>
                        {addableKinds.map((k) => (
                            <option key={k} value={k}>{labelForKind(k)}</option>
                        ))}
                    </select>
                )}
            </div>

            {constraints.length === 0 && (
                <div className="dc-constraints__empty dc-muted">Нет ограничений</div>
            )}

            {constraints.map((c, idx) => {
                const isAvailable = availableKinds.includes(c.kind as any);
                return (
                    <div
                        key={idx}
                        className={
                            'dc-constraint' +
                            (isAvailable ? '' : ' dc-constraint--invalid')
                        }
                    >
                        <div className="dc-constraint__header">
                            <span className="dc-constraint__kind">{labelForKind(c.kind)}</span>
                            {!isAvailable && (
                                <span className="dc-badge dc-badge--warn">
                                    несовместимо с {dataType}
                                </span>
                            )}
                            {!disabled && (
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() =>
                                        commit((doc) =>
                                            removeConstraint(doc, ownerType, ownerId, attributeId, idx, target),
                                        )
                                    }
                                    title="Удалить"
                                >×</button>
                            )}
                        </div>

                        <div className="dc-constraint__body">
                            {/* min / max для range, length, size */}
                            {(c.kind === 'range' || c.kind === 'length' || c.kind === 'size') && (
                                <div className="dc-field-row">
                                    <div className="dc-field">
                                        <label className="dc-field__label">min</label>
                                        <input
                                            className="dc-input"
                                            type="number"
                                            value={c.min ?? ''}
                                            onChange={(e) =>
                                                updateField(idx, 'min',
                                                    e.target.value === '' ? undefined : Number(e.target.value))
                                            }
                                            disabled={disabled}
                                        />
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">max</label>
                                        <input
                                            className="dc-input"
                                            type="number"
                                            value={c.max ?? ''}
                                            onChange={(e) =>
                                                updateField(idx, 'max',
                                                    e.target.value === '' ? undefined : Number(e.target.value))
                                            }
                                            disabled={disabled}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* regexp */}
                            {c.kind === 'regexp' && (
                                <div className="dc-field">
                                    <label className="dc-field__label">Регулярное выражение</label>
                                    <input
                                        className="dc-input"
                                        value={c.regexp ?? ''}
                                        onChange={(e) => updateField(idx, 'regexp', e.target.value)}
                                        disabled={disabled}
                                        placeholder="^[A-Za-z0-9]+$"
                                    />
                                </div>
                            )}

                            {/* mimeTypes */}
                            {c.kind === 'mime_types' && (
                                <div className="dc-field">
                                    <label className="dc-field__label">
                                        MIME-типы (через запятую)
                                    </label>
                                    <input
                                        className="dc-input"
                                        value={(c.mimeTypes ?? []).join(', ')}
                                        onChange={(e) => updateMimeTypes(idx, e.target.value)}
                                        disabled={disabled}
                                        placeholder="application/pdf, image/png"
                                    />
                                </div>
                            )}

                            {/* message — для всех, кроме unique? Нет, для всех */}
                            <div className="dc-field">
                                <label className="dc-field__label">Сообщение об ошибке</label>
                                <input
                                    className="dc-input"
                                    value={c.message ?? ''}
                                    onChange={(e) => updateField(idx, 'message', e.target.value)}
                                    disabled={disabled}
                                    placeholder="Текст ошибки"
                                />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ============ Метки ============

function labelForKind(kind: string): string {
    switch (kind) {
        case 'required': return 'Обязательное';
        case 'range': return 'Диапазон';
        case 'length': return 'Длина';
        case 'regexp': return 'Regexp';
        case 'size': return 'Размер файла';
        case 'mime_types': return 'MIME-типы';
        case 'unique': return 'Уникальное значение';
        default: return kind;
    }
}