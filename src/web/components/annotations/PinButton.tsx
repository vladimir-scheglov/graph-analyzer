import React, {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    annotationsStore,
    type Annotation,
} from "../../lib/storage/annotations";
import { MIcon } from "../common/MIcon";

export interface PinButtonProps {
    target: string;
    domainId: string;
    kind: Annotation["kind"];
    label?: string;

    /**
     * Готовый список заметок (уже отфильтрованный вызывающей стороной,
     * например из `pinByLine` в YamlViewerModal). Если задан — PinButton
     * НЕ подписывается на annotationsStore для чтения. Источник истины —
     * родитель.
     *
     * Зачем: gutter-декорации строятся из `pinByLine`, а PinButton
     * независимо читал store по точному target'у. Расхождение приводило
     * к «значок в gutter есть, а кнопка пустая». Когда оба читают
     * `pinByLine`, расхождение невозможно по построению.
     *
     * Добавление новых заметок всё равно идёт через annotationsStore
     * (родитель увидит через свою подписку).
     */
    annotationsOverride?: Annotation[];

    /** Кастомный resolve (по умолчанию — annotationsStore.update). */
    onResolve?: (id: string) => void;

    /** Кастомный delete (по умолчанию — annotationsStore.remove). */
    onDelete?: (id: string) => void;
}

const POPOVER_WIDTH = 300;
const POPOVER_MAX_HEIGHT = 340;
const POPOVER_MIN_HEIGHT = 160;
const VIEWPORT_MARGIN = 8;
const GAP = 6;

export function PinButton({
    target,
    domainId,
    kind,
    label,
    annotationsOverride,
    onResolve,
    onDelete,
}: PinButtonProps) {
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");

    const wrapRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    const [pos, setPos] = useState<{
        left: number;
        top: number;
        maxHeight: number;
    } | null>(null);

    // ── Источник данных ──
    // Если передан override — используем его, без подписки на store.
    // Иначе — подписка по точному target (старое поведение).
    useEffect(() => {
        if (annotationsOverride) {
            setAnnotations(annotationsOverride);
            return;
        }

        let cancelled = false;
        const load = () => {
            annotationsStore
                .listForTarget(target)
                .then((list) => {
                    if (!cancelled) setAnnotations(list);
                })
                .catch(() => { });
        };
        load();
        const unsub = annotationsStore.subscribe(load);
        return () => {
            cancelled = true;
            unsub();
        };
    }, [target, annotationsOverride]);

    // ── Расчёт позиции popover (flip up/down) ──
    const computePosition = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        const spaceBelow = vh - rect.bottom - GAP - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;

        const measured = popoverRef.current
            ? Math.min(popoverRef.current.scrollHeight, POPOVER_MAX_HEIGHT)
            : POPOVER_MAX_HEIGHT;

        let top: number;
        let maxHeight: number;

        const preferDown =
            spaceBelow >= Math.min(measured, POPOVER_MIN_HEIGHT) ||
            spaceBelow >= spaceAbove;

        if (preferDown) {
            top = rect.bottom + GAP;
            maxHeight = Math.min(
                POPOVER_MAX_HEIGHT,
                Math.max(POPOVER_MIN_HEIGHT, spaceBelow),
            );
        } else {
            maxHeight = Math.min(
                POPOVER_MAX_HEIGHT,
                Math.max(POPOVER_MIN_HEIGHT, spaceAbove),
            );
            top = rect.top - Math.min(measured, maxHeight) - GAP;
        }

        let left = rect.right - POPOVER_WIDTH;
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
        if (left + POPOVER_WIDTH > vw - VIEWPORT_MARGIN) {
            left = vw - POPOVER_WIDTH - VIEWPORT_MARGIN;
        }

        setPos((prev) => {
            if (
                prev &&
                prev.left === left &&
                prev.top === top &&
                prev.maxHeight === maxHeight
            ) {
                return prev;
            }
            return { left, top, maxHeight };
        });
    };

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        computePosition();
        const raf = requestAnimationFrame(() => computePosition());

        const onScroll = () => computePosition();
        const onResize = () => computePosition();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    // ── Закрытие по клику вне и Escape ──
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (wrapRef.current?.contains(t)) return;
            if (popoverRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // Не даём Escape закрыть родительскую модалку — это должен
            // быть закрытый поповер, а не редактор.
            e.stopPropagation();
            e.stopImmediatePropagation();
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc, true);
        };
    }, [open]);

    // ── Действия ──
    const add = async () => {
        if (!text.trim()) return;
        await annotationsStore.add({
            kind,
            target,
            domainId,
            text: text.trim(),
            color: "yellow",
            author: "me",
        });
        setText("");
    };

    const resolve = async (id: string) => {
        if (onResolve) {
            onResolve(id);
        } else {
            await annotationsStore.update(id, { resolvedAt: Date.now() });
        }
    };

    const remove = async (id: string) => {
        if (onDelete) {
            onDelete(id);
        } else {
            await annotationsStore.remove(id);
        }
    };

    const activeCount = annotations.length;

    return (
        <div className="pin-button" ref={wrapRef}>
            <button
                ref={triggerRef}
                type="button"
                className={
                    "pin-button__trigger" + (activeCount > 0 ? " active" : "")
                }
                onClick={() => setOpen((v) => !v)}
                title={
                    activeCount > 0
                        ? `${activeCount} заметок`
                        : "Добавить заметку"
                }
            >
                <MIcon name="push_pin" size="sm" fill={activeCount > 0} />
                {activeCount > 0 && <span>{activeCount}</span>}
            </button>

            {open &&
                pos &&
                createPortal(
                    <div
                        ref={popoverRef}
                        className="pin-button__popover"
                        style={{
                            position: "fixed",
                            left: pos.left,
                            top: pos.top,
                            width: POPOVER_WIDTH,
                            maxHeight: pos.maxHeight,
                            zIndex: 10000,
                        }}
                    >
                        {label && (
                            <div className="pin-button__target">{label}</div>
                        )}

                        {annotations.map((a) => (
                            <div
                                key={a.id}
                                className={
                                    "pin-button__note pin-button__note--" +
                                    a.color
                                }
                            >
                                <span className="pin-button__note-text">
                                    {a.text}
                                </span>
                                <div className="pin-button__note-actions">
                                    <button
                                        type="button"
                                        className="pin-button__note-resolve"
                                        onClick={() => resolve(a.id)}
                                        title="Пометить решённой"
                                    >
                                        ✓
                                    </button>
                                    <button
                                        type="button"
                                        className="pin-button__note-delete"
                                        onClick={() => remove(a.id)}
                                        title="Удалить заметку"
                                    >
                                        🗑
                                    </button>
                                </div>
                            </div>
                        ))}

                        {annotations.length === 0 && (
                            <div className="pin-button__empty">
                                Заметок пока нет
                            </div>
                        )}

                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="TODO: …"
                            rows={2}
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter" &&
                                    (e.ctrlKey || e.metaKey)
                                ) {
                                    e.preventDefault();
                                    void add();
                                }
                            }}
                        />
                        <button
                            className="btn btn--small btn--primary"
                            onClick={add}
                            disabled={!text.trim()}
                        >
                            Добавить
                        </button>
                    </div>,
                    document.body,
                )}
        </div>
    );
}