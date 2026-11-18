import type { FC } from 'react';
import type { FieldOrigin } from '../types';

interface Props {
    origin: FieldOrigin;
    /** Откуда унаследовано (FQID или id миксина). */
    from?: string;
    onOverride?: () => void;
    onReset?: () => void;
}

/**
 * Кнопка-переключатель «наследовать / переопределить».
 * Используется внутри <InheritableField>.
 */
export const InheritToggle: FC<Props> = ({ origin, from, onOverride, onReset }) => {
    if (origin === 'own') return null;

    if (origin === 'inherited') {
        return (
            <button
                type="button"
                className="dc-inherit-toggle dc-inherit-toggle--inherited"
                onClick={onOverride}
                title={from ? `Унаследовано от ${from}` : 'Унаследовано'}
            >
                ↙ переопределить
            </button>
        );
    }

    // overridden
    return (
        <button
            type="button"
            className="dc-inherit-toggle dc-inherit-toggle--overridden"
            onClick={onReset}
            title={from ? `Переопределено (родитель: ${from})` : 'Переопределено'}
        >
            ↺ вернуть наследование
        </button>
    );
};