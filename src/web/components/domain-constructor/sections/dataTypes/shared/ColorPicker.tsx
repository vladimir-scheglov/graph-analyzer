import { useEffect, useRef, useState, type FC } from 'react';

const PRESET_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308',
    '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
    '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
    '#EC4899', '#F43F5E', '#64748B', '#94A3B8',
];

interface Props {
    value?: string;
    onChange: (color: string | undefined) => void;
    disabled?: boolean;
}

export const ColorPicker: FC<Props> = ({ value, onChange, disabled }) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const displayColor = value ?? '#64748B';

    return (
        <div className="dc-color-picker" ref={rootRef}>
            <button
                type="button"
                className="dc-color-picker__trigger"
                onClick={() => setOpen((v) => !v)}
                disabled={disabled}
                title={value ?? 'Не задан'}
            >
                <span
                    className="dc-color-picker__swatch"
                    style={{ background: value ?? 'transparent' }}
                />
                {value ? (
                    <code className="dc-color-picker__hex">{value}</code>
                ) : (
                    <span className="dc-color-picker__none">—</span>
                )}
            </button>

            {open && (
                <div className="dc-color-picker__dropdown">
                    <div className="dc-color-picker__presets">
                        {PRESET_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                className={
                                    'dc-color-picker__preset' +
                                    (c.toLowerCase() === value?.toLowerCase() ? ' dc-color-picker__preset--active' : '')
                                }
                                style={{ background: c }}
                                onClick={() => {
                                    onChange(c);
                                    setOpen(false);
                                }}
                                title={c}
                            />
                        ))}
                    </div>

                    <div className="dc-color-picker__custom">
                        <input
                            type="color"
                            className="dc-color-picker__native"
                            value={displayColor}
                            onChange={(e) => onChange(e.target.value.toUpperCase())}
                        />
                        <input
                            className="dc-input dc-input--compact"
                            value={value ?? ''}
                            onChange={(e) => onChange(e.target.value.toUpperCase() || undefined)}
                            placeholder="#22C55E"
                        />
                    </div>

                    {value && (
                        <button
                            type="button"
                            className="dc-btn dc-btn--danger dc-btn--icon"
                            onClick={() => { onChange(undefined); setOpen(false); }}
                            title="Убрать цвет"
                        >
                            Очистить
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};