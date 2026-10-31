import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MIcon } from './MIcon';

export interface EntityComboboxProps {
    value: string | null;
    onChange: (entityId: string) => void;
    entities: Array<{ id: string; name: string }>;
    placeholder?: string;
    disabled?: boolean;
}

export function EntityCombobox({
    value,
    onChange,
    entities,
    placeholder = 'Выберите сущность...',
    disabled = false,
}: EntityComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return entities;
        return entities.filter(
            (e) =>
                e.id.toLowerCase().indexOf(q) !== -1 ||
                e.name.toLowerCase().indexOf(q) !== -1,
        );
    }, [entities, query]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector(
            '.entity-combobox__option--active',
        ) as HTMLElement | null;
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [activeIdx, open]);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const item = filtered[activeIdx];
            if (item) {
                onChange(item.id);
                setOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
        }
    };

    const current = entities.find((e) => e.id === value);

    return (
        <div className="entity-combobox" ref={wrapRef}>
            <button
                type="button"
                className={'entity-combobox__trigger' + (open ? ' open' : '')}
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                title={current?.id || placeholder}
            >
                <MIcon name="data_object" size="sm" />
                <span className="entity-combobox__trigger-text">
                    {current ? current.id : placeholder}
                </span>
                <MIcon name={open ? 'expand_less' : 'expand_more'} size="sm" />
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
                            placeholder="Фильтр по id или имени..."
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {query && (
                            <button
                                type="button"
                                className="entity-combobox__clear"
                                onClick={() => {
                                    setQuery('');
                                    setActiveIdx(0);
                                    inputRef.current?.focus();
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div className="entity-combobox__list" ref={listRef}>
                        {filtered.length === 0 ? (
                            <div className="entity-combobox__empty">
                                Ничего не найдено
                            </div>
                        ) : (
                            filtered.map((e, idx) => (
                                <button
                                    key={e.id}
                                    type="button"
                                    className={
                                        'entity-combobox__option' +
                                        (e.id === value
                                            ? ' entity-combobox__option--selected'
                                            : '') +
                                        (idx === activeIdx
                                            ? ' entity-combobox__option--active'
                                            : '')
                                    }
                                    onMouseEnter={() => setActiveIdx(idx)}
                                    onClick={() => {
                                        onChange(e.id);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="entity-combobox__option-id">
                                        {e.id}
                                    </span>
                                    {e.name && e.name !== e.id && (
                                        <span className="entity-combobox__option-name">
                                            {e.name}
                                        </span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}