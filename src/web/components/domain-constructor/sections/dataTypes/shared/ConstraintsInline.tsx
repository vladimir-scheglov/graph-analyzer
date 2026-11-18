import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { getAvailableConstraints } from '../../../model/compat-tables';
import {
    addTableAttributeConstraint,
    removeTableAttributeConstraint,
    updateTableAttributeConstraintField,
} from '../dataType-handlers';

interface Props {
    dataTypeId: string;
    attrIndex: number;
    attrDataType: string;
    constraints: any[];
    disabled?: boolean;
}

/**
 * Inline-редактор constraints для колонок таблицы (и любого
 * `dataTypes[].attributes[].constraints[]`).
 *
 * Виды ограничений фильтруются по dataType через getAvailableConstraints.
 * Уже присутствующие, но несовместимые с типом — показываются с пометкой.
 */
export const ConstraintsInline: FC<Props> = ({
    dataTypeId, attrIndex, attrDataType, constraints, disabled,
}) => {
    const commit = useEditorStore((s) => s.commit);

    const availableKinds = useMemo(
        () => getAvailableConstraints(attrDataType as any),
        [attrDataType],
    );
    const usedKinds = new Set(constraints.map((c) => c.kind));
    const addableKinds = availableKinds.filter((k) => !usedKinds.has(k));

    const update = (constraintIdx: number, field: string, value: unknown) =>
        commit((d) =>
            updateTableAttributeConstraintField(
                d, dataTypeId, attrIndex, constraintIdx, field, value,
            ),
        );

    return (
        <div className="dc-dt-constraints-expand">
            <div className="dc-dt-constraints-expand__header">
                <span className="dc-constraints__title">Ограничения</span>
                {!disabled && addableKinds.length > 0 && (
                    <select
                        className="dc-input dc-input--inline"
                        value=""
                        onChange={(e) => {
                            if (!e.target.value) return;
                            commit((d) =>
                                addTableAttributeConstraint(
                                    d, dataTypeId, attrIndex, e.target.value,
                                ),
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
                <div className="dc-muted dc-constraints__empty">Ограничений нет</div>
            )}

            {constraints.map((c, ci) => {
                const isAvailable = availableKinds.includes(c.kind as any);
                return (
                    <div
                        key={ci}
                        className={
                            'dc-constraint' + (isAvailable ? '' : ' dc-constraint--invalid')
                        }
                    >
                        <div className="dc-constraint__header">
                            <span className="dc-constraint__kind">{labelForKind(c.kind)}</span>
                            {!isAvailable && (
                                <span className="dc-badge dc-badge--warn">
                                    несовместимо с {attrDataType}
                                </span>
                            )}
                            {!disabled && (
                                <button
                                    className="dc-btn dc-btn--danger dc-btn--icon"
                                    onClick={() =>
                                        commit((d) =>
                                            removeTableAttributeConstraint(d, dataTypeId, attrIndex, ci),
                                        )
                                    }
                                    title="Удалить"
                                >×</button>
                            )}
                        </div>

                        <div className="dc-constraint__body">
                            {(c.kind === 'range' || c.kind === 'length' || c.kind === 'size') && (
                                <div className="dc-field-row">
                                    <div className="dc-field">
                                        <label className="dc-field__label">
                                            {c.kind === 'size' ? 'min (байт)' : 'min'}
                                        </label>
                                        <input
                                            className="dc-input dc-input--compact"
                                            type="number"
                                            value={c.min ?? ''}
                                            onChange={(e) =>
                                                update(ci, 'min',
                                                    e.target.value === '' ? undefined : Number(e.target.value))
                                            }
                                            disabled={disabled}
                                        />
                                    </div>
                                    <div className="dc-field">
                                        <label className="dc-field__label">
                                            {c.kind === 'size' ? 'max (байт)' : 'max'}
                                        </label>
                                        <input
                                            className="dc-input dc-input--compact"
                                            type="number"
                                            value={c.max ?? ''}
                                            onChange={(e) =>
                                                update(ci, 'max',
                                                    e.target.value === '' ? undefined : Number(e.target.value))
                                            }
                                            disabled={disabled}
                                        />
                                    </div>
                                </div>
                            )}

                            {c.kind === 'regexp' && (
                                <div className="dc-field">
                                    <label className="dc-field__label">Регулярное выражение</label>
                                    <input
                                        className="dc-input dc-input--compact dc-input--mono"
                                        value={c.regexp ?? ''}
                                        onChange={(e) => update(ci, 'regexp', e.target.value)}
                                        disabled={disabled}
                                        placeholder="^[A-Za-z0-9]+$"
                                    />
                                </div>
                            )}

                            {c.kind === 'mime_types' && (
                                <div className="dc-field">
                                    <label className="dc-field__label">
                                        MIME-типы (через запятую)
                                    </label>
                                    <input
                                        className="dc-input dc-input--compact"
                                        value={(c.mimeTypes ?? []).join(', ')}
                                        onChange={(e) => {
                                            const arr = e.target.value
                                                .split(',')
                                                .map((s) => s.trim())
                                                .filter(Boolean);
                                            update(ci, 'mimeTypes', arr.length ? arr : undefined);
                                        }}
                                        disabled={disabled}
                                        placeholder="application/pdf, image/png"
                                    />
                                </div>
                            )}

                            <div className="dc-field">
                                <label className="dc-field__label">Сообщение об ошибке</label>
                                <input
                                    className="dc-input dc-input--compact"
                                    value={c.message ?? ''}
                                    onChange={(e) => update(ci, 'message', e.target.value)}
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