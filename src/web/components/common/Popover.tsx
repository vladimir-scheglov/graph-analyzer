import React, { useEffect, useRef, useState, ReactNode } from 'react';

export interface PopoverProps {
    trigger: (open: boolean) => ReactNode;
    children: ReactNode | ((close: () => void) => ReactNode);
    align?: 'left' | 'right';
    width?: number;
}

export function Popover({ trigger, children, align = 'left', width = 320 }: PopoverProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Позиционирование при открытии
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => {
            const el = wrapRef.current?.querySelector(
                ".popover",
            ) as HTMLElement | null;
            if (!el) return;

            el.style.marginLeft = "";
            el.style.marginRight = "";

            const rect = el.getBoundingClientRect();
            const margin = 8;
            if (rect.right > window.innerWidth - margin) {
                const shift = rect.right - (window.innerWidth - margin);
                el.style.marginRight = `${shift}px`;
            } else if (rect.left < margin) {
                const shift = margin - rect.left;
                el.style.marginLeft = `${shift}px`;
            }
        }, 50);
        return () => clearTimeout(t);
    }, [open]);

    // Закрытие по клику вне и по Escape
    useEffect(() => {
        if (!open) return;

        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
            }
        };

        // mousedown — сработает раньше, чем onClick детей (не закроет сам себя при клике внутри)
        document.addEventListener("mousedown", onDoc);
        // capture: true — перехватываем Escape раньше Monaco
        document.addEventListener("keydown", onEsc, true);

        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc, true);
        };
    }, [open]);

    // Программное закрытие (как было)
    useEffect(() => {
        const handler = () => setOpen(false);
        document.addEventListener('close-all-popovers', handler);
        return () => document.removeEventListener('close-all-popovers', handler);
    }, []);

    return (
        <div className="popover-wrap" ref={wrapRef}>
            <div className="popover-trigger" onClick={() => setOpen(!open)}>
                {trigger(open)}
            </div>
            {open && (
                <div className={`popover popover--${align}`} style={{ width }}>
                    {typeof children === 'function' ? children(() => setOpen(false)) : children}
                </div>
            )}
        </div>
    );
}