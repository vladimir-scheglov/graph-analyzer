import { useMemo, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { InheritableField } from '../../ui/InheritableField';
import { EntitySelect } from '../../ui/EntitySelect';
import { SequenceSelect } from '../../ui/SequenceSelect';
import { ConstraintsEditor } from './ConstraintsEditor';
import {
    updateAttributePath,
    updateConstraintField,
    addConstraint,
    removeConstraint,
    addPrefixRule,
    removePrefixRule,
    updatePrefixRuleField,
    setSegment,
    AttributeOwnerType,
} from './entity-handlers';
import type { AttributeSchema } from '../../types';

interface Props {
    ownerType: 'entity' | 'linkage';
    ownerId: string;
    attribute: AttributeSchema;
    mode: 'edit' | 'inherited';
    inheritedFrom?: string;
    /** Скрыть чекбокс readonly (для атрибутов связи — readonly задаётся в виджете). */
    hideReadonly?: boolean;
}

/**
 * Форма атрибута. Все поля — через updateAttributePath.
 *
 * Для mode='inherited' все поля disabled, кнопка «Переопределить» создаёт
 * собственный атрибут с теми же данными.
 */
export const AttributeForm: FC<Props> = ({
    ownerType, ownerId, attribute, mode, inheritedFrom, hideReadonly = false,
}) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);
    const select = useEditorStore((s) => s.select);

    const isInherited = mode === 'inherited';
    const disabled = isInherited;

    const setField = (path: readonly (string | number)[], value: unknown) => {
        if (isInherited) return;
        commit((doc) => updateAttributePath(doc, ownerType, ownerId, attribute.id, path, value));
    };

    const onOverride = () => {
        if (!isInherited) return;
        commit((doc) => {
            // Найти индекс сущности
            const entities = doc.get(['entities']);
            if (!Array.isArray(entities)) return;
            const eIdx = entities.findIndex((e: any) => e && e.id === ownerId);
            if (eIdx < 0) return;
            const attrs = doc.get(['entities', eIdx, 'attributes']);
            const aIdx = Array.isArray(attrs) ? attrs.length : 0;

            // Копируем все поля унаследованного атрибута в собственный
            doc.set(['entities', eIdx, 'attributes', aIdx], {
                id: attribute.id,
                dataType: attribute.dataType,
                ...(attribute.name ? { name: attribute.name } : {}),
                ...(attribute.description ? { description: attribute.description } : {}),
                ...(attribute.readonly ? { readonly: true } : {}),
                ...(attribute.entity ? { entity: attribute.entity } : {}),
                ...(attribute.item ? { item: attribute.item } : {}),
                ...(attribute.constraints ? { constraints: attribute.constraints } : {}),
                ...(attribute.comments ? { comments: true } : {}),
                ...(attribute.sequence ? { sequence: attribute.sequence } : {}),
                ...(attribute.template ? { template: attribute.template } : {}),
                ...(attribute.segment ? { segment: attribute.segment } : {}),
                ...(attribute.defaultPrefix ? { defaultPrefix: attribute.defaultPrefix } : {}),
                ...(attribute.prefixRules ? { prefixRules: attribute.prefixRules } : {}),
                ...(attribute.incrementTemplate ? { incrementTemplate: attribute.incrementTemplate } : {}),
                ...(attribute.calculation ? { calculation: attribute.calculation } : {}),
            });
        });
        select(`entity:${ownerId}/attribute:${attribute.id}`);
    };

    const isCounterOrIdentifier =
        attribute.dataType === 'Counter' || attribute.dataType === 'Identifier';

    return (
        <div className="dc-attr-form">
            <div className="dc-attr-form__header">
                <h3 className="dc-attr-form__title">
                    {isInherited ? 'Унаследованный атрибут' : 'Атрибут'}
                    <code className="dc-code dc-attr-form__id">{attribute.id}</code>
                    <span className="dc-badge">{attribute.dataType}</span>
                    {isInherited && inheritedFrom && (
                        <span className="dc-badge dc-badge--inherited">
                            от {inheritedFrom}
                        </span>
                    )}
                </h3>
                {isInherited && (
                    <button className="dc-btn dc-btn--primary" onClick={onOverride}>
                        Переопределить
                    </button>
                )}
            </div>

            {/* ============ Общие поля ============ */}

            <InheritableField
                label="Название"
                state={{
                    value: attribute.name ?? '',
                    origin: isInherited ? 'inherited' : 'own',
                    from: inheritedFrom,
                }}
                onChange={(v) => setField(['name'], v)}
            />

            <InheritableField
                label="Описание"
                kind="textarea"
                state={{
                    value: attribute.description ?? '',
                    origin: isInherited ? 'inherited' : 'own',
                    from: inheritedFrom,
                }}
                onChange={(v) => setField(['description'], v)}
            />

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!attribute.readonly}
                        disabled={disabled || isPublished || isCounterOrIdentifier}
                        onChange={(e) => setField(['readonly'], e.target.checked)}
                    />{' '}
                    Только для чтения
                </label>
                {isCounterOrIdentifier && (
                    <div className="dc-field__hint">
                        Неприменимо для типов {attribute.dataType}
                    </div>
                )}
            </div>

            {/* ============ Специфика по типу ============ */}

            {/* Reference */}
            {attribute.dataType === 'Reference' && (
                <div className="dc-field">
                    <label className="dc-field__label">Связанная сущность</label>
                    <EntitySelect
                        value={attribute.entity ?? null}
                        onChange={(fqid) => setField(['entity'], fqid ?? undefined)}
                        disabled={disabled}
                        placeholder="— выберите сущность —"
                    />
                </div>
            )}

            {/* Array */}
            {attribute.dataType === 'Array' && (
                <ArrayEditor
                    ownerType={ownerType}
                    ownerId={ownerId}
                    attributeId={attribute.id}
                    attribute={attribute}
                    disabled={disabled}
                    setField={setField}
                    commit={commit}
                />
            )}

            {/* Text */}
            {attribute.dataType === 'Text' && (
                <div className="dc-field">
                    <label className="dc-field__label">
                        <input
                            type="checkbox"
                            className="dc-checkbox"
                            checked={!!attribute.comments}
                            disabled={disabled}
                            onChange={(e) => setField(['comments'], e.target.checked)}
                        />{' '}
                        Разрешить комментарии
                    </label>
                </div>
            )}

            {/* Identifier */}
            {attribute.dataType === 'Identifier' && (
                <IdentifierEditor
                    ownerType={ownerType}
                    ownerId={ownerId}
                    attributeId={attribute.id}
                    attribute={attribute}
                    disabled={disabled}
                    setField={setField}
                    commit={commit}
                />
            )}

            {/* Calculation */}
            {attribute.dataType === 'Calculation' && (
                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">schemaId</label>
                        <input
                            className="dc-input"
                            value={attribute.calculation?.schemaId ?? ''}
                            onChange={(e) =>
                                setField(['calculation', 'schemaId'], e.target.value)
                            }
                            disabled={disabled}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">id</label>
                        <input
                            className="dc-input"
                            value={attribute.calculation?.id ?? ''}
                            onChange={(e) => setField(['calculation', 'id'], e.target.value)}
                            disabled={disabled}
                        />
                    </div>
                </div>
            )}

            {/* ============ Constraints ============ */}

            <ConstraintsEditor
                ownerType={ownerType}
                ownerId={ownerId}
                attributeId={attribute.id}
                dataType={attribute.dataType}
                constraints={attribute.constraints ?? []}
                target="attribute"
                disabled={disabled}
            />
        </div>
    );
};

// ============ Array-редактор ============

interface ArrayEditorProps {
    ownerType: AttributeOwnerType;
    ownerId: string;
    attributeId: string;
    attribute: AttributeSchema;
    disabled: boolean;
    setField: (path: readonly (string | number)[], value: unknown) => void;
    commit: ReturnType<typeof useEditorStore.getState>['commit'];
}

const ARRAY_ITEM_TYPES = [
    'Timestamp', 'Date', 'Time', 'TimestampRange',
    'MAC', 'IpAddress', 'CIDR', 'Bool',
    'Uuid', 'String', 'Text',
    'Integer', 'Decimal', 'Float',
    'Attachment', 'Reference', 'Enum', 'Workflow',
];

const ArrayEditor: FC<ArrayEditorProps> = ({
    ownerType, ownerId, attributeId, attribute, disabled, setField, commit,
}) => {
    const item = attribute.item;
    return (
        <div className="dc-array-editor">
            <h4 className="dc-array-editor__title">Элемент массива</h4>

            <div className="dc-field">
                <label className="dc-field__label">Тип элемента</label>
                <select
                    className="dc-input"
                    value={item?.dataType ?? 'String'}
                    onChange={(e) => setField(['item', 'dataType'], e.target.value)}
                    disabled={disabled}
                >
                    {ARRAY_ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>

            {item?.dataType === 'Reference' && (
                <div className="dc-field">
                    <label className="dc-field__label">Сущность элемента</label>
                    <EntitySelect
                        value={item.entity ?? null}
                        onChange={(fqid) => setField(['item', 'entity'], fqid ?? undefined)}
                        disabled={disabled}
                    />
                </div>
            )}

            <ConstraintsEditor
                ownerType={ownerType}
                ownerId={ownerId}
                attributeId={attributeId}
                dataType={(item?.dataType ?? 'String') as any}
                constraints={item?.constraints ?? []}
                target="item"
                disabled={disabled}
            />
        </div>
    );
};

// ============ Identifier-редактор ============

interface IdentifierEditorProps {
    ownerType: AttributeOwnerType;
    ownerId: string;
    attributeId: string;
    attribute: AttributeSchema;
    disabled: boolean;
    setField: (path: readonly (string | number)[], value: unknown) => void;
    commit: ReturnType<typeof useEditorStore.getState>['commit'];
}

const IdentifierEditor: FC<IdentifierEditorProps> = ({
    ownerType, ownerId, attributeId, attribute, disabled, setField, commit,
}) => {
    // Режим: если есть sequence → несегментированный; иначе — сегментированный.
    const isSequenced = !!attribute.sequence;

    // Литералы в template — какие сегменты присутствуют.
    const templateLiterals = useMemo(() => {
        const t = attribute.template ?? '';
        const out: Record<string, boolean> = {
            '@prefix': /\{@prefix\}/.test(t),
            '@YYYY': /\{@YYYY\}/.test(t) || /\{@YY\}/.test(t),
            '@MM': /\{@MM\}/.test(t),
            '@DD': /\{@DD\}/.test(t),
        };
        return out;
    }, [attribute.template]);

    const segments = attribute.segment ?? [];

    const toggleSegment = (lit: string, on: boolean) => {
        const normalized = lit.replace('@', '');
        const next = on
            ? [...segments, normalized]
            : segments.filter((s) => s !== normalized);
        commit((doc) => setSegment(doc, ownerType, ownerId, attributeId, next));
    };

    return (
        <div className="dc-identifier-editor">
            <h4 className="dc-identifier-editor__title">Идентификатор</h4>

            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`idmode-${attributeId}`}
                        checked={isSequenced}
                        onChange={() => {
                            // Несегментированный: удаляем template/segment/prefixRules и т.д.
                            // sequence выберется из SequenceSelect
                            setField(['template'], undefined);
                            setField(['segment'], undefined);
                            setField(['defaultPrefix'], undefined);
                            setField(['prefixRules'], undefined);
                            setField(['incrementTemplate'], undefined);
                        }}
                        disabled={disabled}
                    />{' '}
                    Несегментированный
                </label>
                <label className="dc-field__label">
                    <input
                        type="radio"
                        name={`idmode-${attributeId}`}
                        checked={!isSequenced}
                        onChange={() => setField(['sequence'], undefined)}
                        disabled={disabled}
                    />{' '}
                    Сегментированный
                </label>
            </div>

            {isSequenced ? (
                <div className="dc-field">
                    <label className="dc-field__label">Последовательность</label>
                    <SequenceSelect
                        value={attribute.sequence ?? null}
                        onChange={(id) => setField(['sequence'], id ?? undefined)}
                        disabled={disabled}
                    />
                </div>
            ) : (
                <>
                    <div className="dc-field">
                        <label className="dc-field__label">Шаблон</label>
                        <input
                            className="dc-input"
                            value={attribute.template ?? ''}
                            onChange={(e) => setField(['template'], e.target.value)}
                            disabled={disabled}
                            placeholder="{@prefix}-{@YY}-{@MM}-{@DD}-{@inc}"
                        />
                        <div className="dc-field__hint">
                            Допустимые литералы: {'{@YYYY}'}, {'{@YY}'}, {'{@MM}'}, {'{@DD}'}, {'{@prefix}'}, {'{@inc}'} (обязателен).
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Префикс по умолчанию</label>
                        <input
                            className="dc-input"
                            value={attribute.defaultPrefix ?? ''}
                            onChange={(e) => setField(['defaultPrefix'], e.target.value)}
                            disabled={disabled}
                            placeholder="INC"
                        />
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">
                            Количество цифр в инкременте (2–10)
                        </label>
                        <input
                            className="dc-input"
                            value={attribute.incrementTemplate ?? ''}
                            onChange={(e) => setField(['incrementTemplate'], e.target.value)}
                            disabled={disabled}
                            placeholder="0000"
                        />
                    </div>

                    {Object.entries(templateLiterals).some(([, v]) => v) && (
                        <div className="dc-field">
                            <label className="dc-field__label">
                                Сегменты (не сбрасывают инкремент при изменении)
                            </label>
                            <div className="dc-segments">
                                {Object.entries(templateLiterals)
                                    .filter(([lit, present]) => present && lit !== '@inc')
                                    .map(([lit]) => {
                                        const normalized = lit.replace('@', '');
                                        return (
                                            <label key={lit} className="dc-segments__item">
                                                <input
                                                    type="checkbox"
                                                    className="dc-checkbox"
                                                    checked={segments.includes(normalized)}
                                                    disabled={disabled}
                                                    onChange={(e) => toggleSegment(lit, e.target.checked)}
                                                />
                                                {' '}{lit}
                                            </label>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    <PrefixRulesEditor
                        ownerType={ownerType}
                        ownerId={ownerId}
                        attributeId={attributeId}
                        rules={attribute.prefixRules ?? []}
                        disabled={disabled}
                        commit={commit}
                    />
                </>
            )}
        </div>
    );
};

// ============ PrefixRules ============

interface PrefixRulesEditorProps {
    ownerType: AttributeOwnerType;
    ownerId: string;
    attributeId: string;
    rules: NonNullable<AttributeSchema['prefixRules']>;
    disabled: boolean;
    commit: ReturnType<typeof useEditorStore.getState>['commit'];
}

const PrefixRulesEditor: FC<PrefixRulesEditorProps> = ({
    ownerType, ownerId, attributeId, rules, disabled, commit,
}) => (
    <div className="dc-prefix-rules">
        <div className="dc-prefix-rules__header">
            <label className="dc-field__label">Правила подстановки префикса</label>
            {!disabled && (
                <button
                    className="dc-btn dc-btn--dashed"
                    onClick={() => commit((doc) => addPrefixRule(doc, ownerType, ownerId, attributeId))}
                >+ Правило</button>
            )}
        </div>

        {rules.map((r, i) => (
            <div key={i} className="dc-prefix-rule">
                <div className="dc-prefix-rule__header">
                    <code className="dc-code">{r.id}</code>
                    {!disabled && (
                        <button
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() =>
                                commit((doc) => removePrefixRule(doc, ownerType, ownerId, attributeId, i))
                            }
                            title="Удалить"
                        >×</button>
                    )}
                </div>
                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">ID</label>
                        <input
                            className="dc-input"
                            value={r.id}
                            onChange={(e) =>
                                commit((doc) =>
                                    updatePrefixRuleField(doc, ownerType, ownerId, attributeId, i, ['id'], e.target.value),
                                )
                            }
                            disabled={disabled}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">attribute</label>
                        <input
                            className="dc-input"
                            value={r.attribute}
                            onChange={(e) =>
                                commit((doc) =>
                                    updatePrefixRuleField(doc, ownerType, ownerId, attributeId, i, ['attribute'], e.target.value),
                                )
                            }
                            disabled={disabled}
                        />
                    </div>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">entity (справочник)</label>
                    <EntitySelect
                        value={r.source.entity || null}
                        onChange={(fqid) =>
                            commit((doc) =>
                                updatePrefixRuleField(
                                    doc, ownerType, ownerId, attributeId, i,
                                    ['source', 'entity'],
                                    fqid ?? '',
                                ),
                            )
                        }
                        disabled={disabled}
                    />
                </div>
                <div className="dc-field-row">
                    <div className="dc-field">
                        <label className="dc-field__label">key</label>
                        <input
                            className="dc-input"
                            value={r.source.key}
                            onChange={(e) =>
                                commit((doc) =>
                                    updatePrefixRuleField(doc, ownerType, ownerId, attributeId, i, ['source', 'key'], e.target.value),
                                )
                            }
                            disabled={disabled}
                        />
                    </div>
                    <div className="dc-field">
                        <label className="dc-field__label">value</label>
                        <input
                            className="dc-input"
                            value={r.source.value}
                            onChange={(e) =>
                                commit((doc) =>
                                    updatePrefixRuleField(doc, ownerType, ownerId, attributeId, i, ['source', 'value'], e.target.value),
                                )
                            }
                            disabled={disabled}
                        />
                    </div>
                </div>
            </div>
        ))}
    </div>
);