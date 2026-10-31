import React, { useEffect, useMemo, useRef, useState } from "react";
import { MIcon } from "./MIcon";

export interface ComboboxOption {
    value: string;
    /** Подпись — если не задана, показывается value. */
    label?: string;
    /** Доп. пояснение справа (например, домен, тип). */
    hint?: string;
}

export interface ComboboxProps {
    value: string | null;
    onChange: (v: string) => void;
    options: ComboboxOption[];
    placeholder?: string;
    /** Разрешить ввод значения, которого нет в options. */
    allowCreate?: boolean;
    /** Текст в dropdown для нового значения. */
    createLabel?: (input: string) => string;
    /** Иконка слева в триггере (по умолчанию `edit`). */
    icon?: string;
    disabled?: boolean;
    /** Подсказка под пустым dropdown'ом. */
    emptyHint?: string;
}

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
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

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
    // Индекс «создать» — после списка, чтобы Enter на пустом query выбирал первый
    const createIdx = filtered.length;

    useEffect(() => {
        if (open) {
            setQuery(value || "");
            setActiveIdx(0);
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 30);
        }
    }, [open, value]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector(
            ".entity-combobox__option--active",
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ block: "nearest" });
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
            if (activeIdx === createIdx && canCreate) {
                commit(trimmedQuery);
            } else {
                const item = filtered[activeIdx];
                if (item) commit(item.value);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
        }
    };

    const current = options.find((o) => o.value === value);
    const display = value || "";
    const isCustom = !!value && !current;

    return (
        <div className="entity-combobox" ref={wrapRef}>
            <button
                type="button"
                className={"entity-combobox__trigger" + (open ? " open" : "")}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                title={display || placeholder}
            >
                <MIcon name={icon} size="sm" />
                <span
                    className="entity-combobox__trigger-text"
                    style={
                        value && !current
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

            {open && (
                <div className="entity-combobox__dropdown">
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
                </div>
            )}
        </div>
    );
}