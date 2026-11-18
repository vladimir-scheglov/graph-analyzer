import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { typeGroup } from "./entity-utils";

// ============ InlineText: правка по blur / Enter, Esc — откат ============
export const InlineText: FC<{
    value: string;
    onCommit: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
    mono?: boolean;
    className?: string;
    validate?: (v: string) => string | null;
    title?: string;
}> = ({ value, onCommit, placeholder, disabled, mono, className, validate, title }) => {
    const [local, setLocal] = useState(value);
    const [error, setError] = useState<string | null>(null);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLocal(value);
        setError(null);
    }, [value]);

    const commit = () => {
        if (local === value) return;
        const err = validate ? validate(local) : null;
        if (err) {
            setError(err);
            setLocal(value);
            return;
        }
        setError(null);
        onCommit(local);
    };

    return (
        <input
            ref={ref}
            className={
                "ent-inline" +
                (mono ? " ent-inline--mono" : "") +
                (error ? " ent-inline--error" : "") +
                (className ? " " + className : "")
            }
            value={local}
            placeholder={placeholder}
            disabled={disabled}
            title={error ?? title}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                    setLocal(value);
                    setError(null);
                    (e.target as HTMLInputElement).blur();
                }
                e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
        />
    );
};

// ============ Switch ============
export const Switch: FC<{
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
    label?: ReactNode;
    small?: boolean;
}> = ({ checked, onChange, disabled, label, small }) => (
    <label className={"ent-switch" + (small ? " ent-switch--small" : "") + (disabled ? " ent-switch--disabled" : "")}>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className={"ent-switch__track" + (checked ? " ent-switch__track--on" : "")}
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!checked);
            }}
        >
            <span className="ent-switch__thumb" />
        </button>
        {label && <span className="ent-switch__label">{label}</span>}
    </label>
);

// ============ TypeBadge ============
export const TypeBadge: FC<{ type: string; compact?: boolean }> = ({ type, compact }) => {
    const g = typeGroup(type);
    return (
        <span
            className={"ent-type" + (compact ? " ent-type--compact" : "")}
            style={{
                color: `var(${g.hue})`,
                background: `color-mix(in srgb, var(${g.hue}) 13%, transparent)`,
                borderColor: `color-mix(in srgb, var(${g.hue}) 38%, transparent)`,
            }}
            title={g.label}
        >
            <span className="ent-type__glyph">{g.glyph}</span>
            {!compact && <span className="ent-type__name">{type}</span>}
        </span>
    );
};

// ============ Chip ============
export const Chip: FC<{
    children: ReactNode;
    onRemove?: () => void;
    onClick?: () => void;
    tone?: "default" | "accent" | "warn";
    title?: string;
}> = ({ children, onRemove, onClick, tone = "default", title }) => (
    <span
        className={`ent-chip ent-chip--${tone}` + (onClick ? " ent-chip--click" : "")}
        onClick={onClick}
        title={title}
        role={onClick ? "button" : undefined}
    >
        {children}
        {onRemove && (
            <button
                type="button"
                className="ent-chip__x"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
            >
                ×
            </button>
        )}
    </span>
);

// ============ Секция формы ============
export const FormSection: FC<{ title: ReactNode; extra?: ReactNode; children: ReactNode }> = ({
    title, extra, children,
}) => (
    <section className="ent-formsec">
        <header className="ent-formsec__head">
            <h4 className="ent-formsec__title">{title}</h4>
            {extra}
        </header>
        {children}
    </section>
);

// ============ Пустое состояние ============
export const EmptyState: FC<{ icon?: string; title: string; hint?: string; action?: ReactNode }> = ({
    icon = "◇", title, hint, action,
}) => (
    <div className="ent-empty">
        <div className="ent-empty__icon">{icon}</div>
        <div className="ent-empty__title">{title}</div>
        {hint && <div className="ent-empty__hint">{hint}</div>}
        {action}
    </div>
);