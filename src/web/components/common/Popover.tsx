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
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onEsc, true);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onEsc, true);
        };
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