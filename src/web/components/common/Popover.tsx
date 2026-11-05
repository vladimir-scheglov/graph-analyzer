import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface PopoverProps {
    trigger: (open: boolean) => ReactNode;
    children: ReactNode | ((close: () => void) => ReactNode);
    align?: "left" | "right";
    width?: number;
    /** Предпочтительная сторона открытия. По умолчанию — снизу. */
    side?: "bottom" | "top";
}

const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 8;
const MAX_POPOVER_HEIGHT = 480;
const MIN_POPOVER_HEIGHT = 200;

export function Popover({
    trigger,
    children,
    align = "left",
    width = 320,
    side = "bottom",
}: PopoverProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{
        left: number;
        top: number;
        maxHeight: number;
    } | null>(null);

    // ============ Position calculation ============
    const computePosition = useCallback(() => {
        const wrap = wrapRef.current;
        const popover = popoverRef.current;
        if (!wrap) return;

        const rect = wrap.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // --- Horizontal: привязка к триггеру + clamp ---
        let left = align === "left" ? rect.left : rect.right - width;
        if (left + width > vw - VIEWPORT_MARGIN) {
            left = vw - width - VIEWPORT_MARGIN;
        }
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

        // --- Vertical: предпочтение + flip ---
        const measured = popover
            ? Math.min(popover.scrollHeight, MAX_POPOVER_HEIGHT)
            : MIN_POPOVER_HEIGHT;

        const spaceBelow = vh - rect.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - POPOVER_GAP - VIEWPORT_MARGIN;

        let top: number;
        let maxHeight: number;

        const fitsBelow = spaceBelow >= Math.min(measured, MIN_POPOVER_HEIGHT);
        const fitsAbove = spaceAbove >= Math.min(measured, MIN_POPOVER_HEIGHT);

        const preferBelow = side === "bottom";

        if (preferBelow && fitsBelow) {
            top = rect.bottom + POPOVER_GAP;
            maxHeight = Math.min(MAX_POPOVER_HEIGHT, spaceBelow);
        } else if (!preferBelow && fitsAbove) {
            maxHeight = Math.min(MAX_POPOVER_HEIGHT, spaceAbove);
            top = rect.top - Math.min(measured, maxHeight) - POPOVER_GAP;
        } else if (fitsAbove && spaceAbove > spaceBelow) {
            maxHeight = Math.min(MAX_POPOVER_HEIGHT, spaceAbove);
            top = rect.top - Math.min(measured, maxHeight) - POPOVER_GAP;
        } else {
            top = rect.bottom + POPOVER_GAP;
            maxHeight = Math.min(MAX_POPOVER_HEIGHT, spaceBelow);
        }

        if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN;
        if (maxHeight < MIN_POPOVER_HEIGHT) {
            maxHeight = Math.min(MAX_POPOVER_HEIGHT, vh - 2 * VIEWPORT_MARGIN);
        }

        setPos({ left, top, maxHeight });
    }, [align, width, side]);

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        // Первый расчёт — по оценке высоты
        computePosition();
        // Второй — после рендера, когда реальная высота известна
        const raf = requestAnimationFrame(() => computePosition());
        return () => cancelAnimationFrame(raf);
    }, [open, computePosition]);

    // Пересчёт при скролле/резмере — popover прибит к триггеру
    useEffect(() => {
        if (!open) return;
        const onScroll = () => computePosition();
        const onResize = () => computePosition();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open, computePosition]);

    // Закрытие по клику вне и по Escape
    useEffect(() => {
        if (!open) return;

        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (wrapRef.current?.contains(target)) return;
            if (popoverRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);

        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc, true);
        };
    }, [open]);

    // Программное закрытие (совместимость)
    useEffect(() => {
        const handler = () => setOpen(false);
        document.addEventListener("close-all-popovers", handler);
        return () => document.removeEventListener("close-all-popovers", handler);
    }, []);

    const close = useCallback(() => setOpen(false), []);

    return (
        <div className="popover-wrap" ref={wrapRef}>
            <div className="popover-trigger" onClick={() => setOpen(!open)}>
                {trigger(open)}
            </div>
            {open &&
                pos &&
                createPortal(
                    <div
                        ref={popoverRef}
                        className={`popover popover--portal popover--${align}`}
                        style={{
                            position: "fixed",
                            left: pos.left,
                            top: pos.top,
                            width,
                            maxHeight: pos.maxHeight,
                        }}
                    >
                        {typeof children === "function"
                            ? children(close)
                            : children}
                    </div>,
                    document.body,
                )}
        </div>
    );
}