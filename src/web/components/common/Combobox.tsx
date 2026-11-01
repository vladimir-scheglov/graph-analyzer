import React, {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { MIcon } from "./MIcon";

export interface ComboboxOption {
    value: string;
    label?: string;
    hint?: string;
}

export interface ComboboxProps {
    value: string | null;
    onChange: (v: string) => void;
    options: ComboboxOption[];
    placeholder?: string;
    allowCreate?: boolean;
    createLabel?: (input: string) => string;
    icon?: string;
    disabled?: boolean;
    emptyHint?: string;
}

const DROPDOWN_MAX_HEIGHT = 320;
const DROPDOWN_MIN_HEIGHT = 120;
const VIEWPORT_MARGIN = 8;
const DROPDOWN_WIDTH_MIN = 280;

export function Combobox({
    value,
    onChange,
    options,
    placeholder = "Выберите или введите...",
    allowCreate = false,
    createLabel,
    icon = "edit",
    disabled = false,
    emptyHint,
}: ComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeIdx, setActiveIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [pos, setPos] = useState<{
        left: number;
        top: number;
        width: number;
        maxHeight: number;
    } | null>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) =>
                o.value.toLowerCase().indexOf(q) !== -1 ||
                (o.label || "").toLowerCase().indexOf(q) !== -1,
        );
    }, [options, query]);

    const trimmedQuery = query.trim();
    const exactExists = options.some((o) => o.value === trimmedQuery);
    const canCreate =
        allowCreate && trimmedQuery.length > 0 && !exactExists;
    const createIdx = filtered.length;

    // ── Пересчёт позиции dropdown ──
    const computePosition = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        const width = Math.max(rect.width, DROPDOWN_WIDTH_MIN);
        let left = rect.left;
        if (left + width > vw - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN);
        }

        const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - VIEWPORT_MARGIN;

        let top: number;
        let maxHeight: number;
        if (spaceBelow >= DROPDOWN_MIN_HEIGHT || spaceBelow >= spaceAbove) {
            top = rect.bottom + 4;
            maxHeight = Math.min(
                DROPDOWN_MAX_HEIGHT,
                Math.max(DROPDOWN_MIN_HEIGHT, spaceBelow),
            );
        } else {
            maxHeight = Math.min(
                DROPDOWN_MAX_HEIGHT,
                Math.max(DROPDOWN_MIN_HEIGHT, spaceAbove),
            );
            top = rect.top - maxHeight - 4;
        }
        setPos({ left, top, width, maxHeight });
    };

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        computePosition();
        const onScroll = () => computePosition();
        const onResize = () => computePosition();
        // capture: true — ловим скролл любой родительской панели (модалки)
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        // Открываемся с пустым фильтром: пользователь видит полный список,
        // выбранный элемент подсвечивается как active, но не сужает поиск.
        setQuery("");
        const idx = options.findIndex((o) => o.value === value);
        setActiveIdx(idx >= 0 ? idx : 0);
        const t = setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 30);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Закрытие по клику вне
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (wrapRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    // Скролл активного элемента — только в пределах списка
    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector(
            ".entity-combobox__option--active",
        ) as HTMLElement | null;
        if (!el) return;
        const list = listRef.current;
        const elTop = el.offsetTop;
        const elBottom = elTop + el.offsetHeight;
        if (elTop < list.scrollTop) list.scrollTop = elTop;
        else if (elBottom > list.scrollTop + list.clientHeight) {
            list.scrollTop = elBottom - list.clientHeight;
        }
    }, [activeIdx, open]);

    const commit = (v: string) => {
        onChange(v);
        setOpen(false);
    };

    const onKey = (e: React.KeyboardEvent) => {
        const total = filtered.length + (canCreate ? 1 : 0);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, total - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIdx === createIdx && canCreate) commit(trimmedQuery);
            else {
                const item = filtered[activeIdx];
                if (item) commit(item.value);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    };

    const current = options.find((o) => o.value === value);
    const isCustom = !!value && !current;

    return (
        <div className="entity-combobox" ref={wrapRef}>
            <button
                ref={triggerRef}
                type="button"
                className={"entity-combobox__trigger" + (open ? " open" : "")}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                title={value || placeholder}
            >
                <MIcon name={icon} size="sm" />
                <span
                    className="entity-combobox__trigger-text"
                    style={
                        isCustom
                            ? { fontStyle: "italic", color: "var(--text-300)" }
                            : undefined
                    }
                >
                    {value || placeholder}
                </span>
                {isCustom && (
                    <span
                        className="entity-combobox__custom-badge"
                        title="Значение не из списка — будет создано"
                    >
                        new
                    </span>
                )}
                <MIcon name={open ? "expand_less" : "expand_more"} size="sm" />
            </button>

            {open && pos && createPortal(
                <div
                    ref={dropdownRef}
                    className="entity-combobox__dropdown entity-combobox__dropdown--portal"
                    style={{
                        position: "fixed",
                        left: pos.left,
                        top: pos.top,
                        width: pos.width,
                        maxHeight: pos.maxHeight,
                        zIndex: 10000,
                    }}
                >
                    <div className="entity-combobox__search">
                        <MIcon name="search" size="sm" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActiveIdx(0);
                            }}
                            onKeyDown={onKey}
                            placeholder={
                                allowCreate
                                    ? "Выберите или введите новое..."
                                    : "Фильтр..."
                            }
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {query && (
                            <button
                                type="button"
                                className="entity-combobox__clear"
                                onClick={() => {
                                    setQuery("");
                                    setActiveIdx(0);
                                    inputRef.current?.focus();
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div className="entity-combobox__list" ref={listRef}>
                        {filtered.length === 0 && !canCreate && (
                            <div className="entity-combobox__empty">
                                {emptyHint || "Ничего не найдено"}
                            </div>
                        )}
                        {filtered.map((o, idx) => (
                            <button
                                key={o.value}
                                type="button"
                                className={
                                    "entity-combobox__option" +
                                    (o.value === value
                                        ? " entity-combobox__option--selected"
                                        : "") +
                                    (idx === activeIdx
                                        ? " entity-combobox__option--active"
                                        : "")
                                }
                                onMouseEnter={() => setActiveIdx(idx)}
                                onClick={() => commit(o.value)}
                            >
                                <span className="entity-combobox__option-id">
                                    {o.value}
                                </span>
                                {o.label && o.label !== o.value && (
                                    <span className="entity-combobox__option-name">
                                        {o.label}
                                    </span>
                                )}
                                {o.hint && (
                                    <span className="entity-combobox__option-hint">
                                        {o.hint}
                                    </span>
                                )}
                            </button>
                        ))}
                        {canCreate && (
                            <button
                                type="button"
                                className={
                                    "entity-combobox__option entity-combobox__option--create" +
                                    (createIdx === activeIdx
                                        ? " entity-combobox__option--active"
                                        : "")
                                }
                                onMouseEnter={() => setActiveIdx(createIdx)}
                                onClick={() => commit(trimmedQuery)}
                            >
                                <MIcon name="add" size="sm" />
                                <span className="entity-combobox__option-id">
                                    {createLabel
                                        ? createLabel(trimmedQuery)
                                        : `Создать: ${trimmedQuery}`}
                                </span>
                            </button>
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}