import type { ChangeEvent, FC, ReactNode } from 'react';
import type { FieldState } from '../types';
import { InheritToggle } from './InheritToggle';

interface Props<T> {
    label: string;
    hint?: string;
    required?: boolean;
    /** Текущее состояние поля (value + origin). */
    state: FieldState<T>;
    /** Колбэк изменения значения (для текстовых/чисел). */
    onChange?: (value: T) => void;
    /** Если переопределено — вызвать, чтобы сбросить в 'inherited'. */
    onReset?: () => void;
    /** Если inherited — вызвать, чтобы «переопределить». */
    onOverride?: () => void;
    /** Кастомный рендер контрола (select, switch, кастомный RqlEditor). */
    render?: (value: T, onChange: (v: T) => void, disabled: boolean) => ReactNode;
    /** Тип контрола для дефолтного рендера. */
    kind?: 'text' | 'textarea' | 'number' | 'checkbox';
    placeholder?: string;
}

/**
 * Поле, поддерживающее наследование.
 *
 *  - origin 'own'        → обычное редактируемое поле;
 *  - origin 'inherited'  → readonly + кнопка «переопределить»;
 *  - origin 'overridden' → редактируемое + кнопка «вернуть наследование».
 */
export function InheritableField<T>({
    label, hint, required, state, onChange, onOverride, onReset,
    render, kind = 'text', placeholder,
}: Props<T>) {
    const isInherited = state.origin === 'inherited';
    const disabled = isInherited;

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (kind === 'checkbox') {
            onChange?.((e.target as HTMLInputElement).checked as unknown as T);
        } else if (kind === 'number') {
            const n = e.target.value === '' ? null : Number(e.target.value);
            onChange?.(n as unknown as T);
        } else {
            onChange?.(e.target.value as unknown as T);
        }
    };

    return (
        <div className={'dc-field' + (isInherited ? ' dc-field--inherited' : '')}>
            <div className="dc-field__label-row">
                <label className="dc-field__label">
                    {label}
                    {required && <span className="dc-field__required">*</span>}
                </label>
                <InheritToggle
                    origin={state.origin}
                    from={state.from}
                    onOverride={onOverride}
                    onReset={onReset}
                />
            </div>

            {render ? (
                render(state.value, onChange ?? (() => { }), disabled)
            ) : kind === 'textarea' ? (
                <textarea
                    className="dc-input dc-input--textarea"
                    value={(state.value as unknown as string) ?? ''}
                    onChange={handleChange}
                    disabled={disabled}
                    placeholder={placeholder}
                />
            ) : kind === 'checkbox' ? (
                <input
                    type="checkbox"
                    className="dc-checkbox"
                    checked={!!state.value}
                    onChange={handleChange}
                    disabled={disabled}
                />
            ) : (
                <input
                    className="dc-input"
                    type={kind === 'number' ? 'number' : 'text'}
                    value={(state.value as unknown as string) ?? ''}
                    onChange={handleChange}
                    disabled={disabled}
                    placeholder={placeholder}
                />
            )}

            {hint && <div className="dc-field__hint">{hint}</div>}
        </div>
    );
}