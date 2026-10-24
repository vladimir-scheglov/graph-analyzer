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

    useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => {
            const el = wrapRef.current?.querySelector(
                ".popover",
            ) as HTMLElement | null;
            if (!el) return;

            // Сбрасываем возможные прошлые сдвиги
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