import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MIcon } from './MIcon';

export interface DomainComboboxProps {
    value: string;
    onChange: (domainId: string) => void;
    domains: Array<[string, number]>;
    placeholder?: string;
}

export function DomainCombobox({
    value,
    onChange,
    domains,
    placeholder = 'Выберите домен...'
}: DomainComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return domains;
        return domains.filter(([d]) => d.toLowerCase().indexOf(q) !== -1);
    }, [domains, query]);

    // Синхронизация query с value — при открытии показываем выбранный домен
    useEffect(() => {
        if (open) {
            setQuery(value || '');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        } else {
            setQuery('');
        }
    }, [open, value]);

    // Клик вне
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    // Скролл к активному
    useEffect(() => {
        if (!open || !listRef.current) return;
        const el = listRef.current.querySelector('.domain-combobox__option--active') as HTMLElement | null;
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
                onChange(item[0]);
                setOpen(false);
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
        }
    };

    const current = domains.find(([d]) => d === value);

    return (
        <div className="domain-combobox" ref={wrapRef}>
            <button
                type="button"
                className={'domain-combobox__trigger' + (open ? ' open' : '')}
                onClick={() => setOpen(!open)}
            >
                <MIcon name="folder" size="sm" />
                <span className="domain-combobox__trigger-text">
                    {current ? current[0] : placeholder}
                </span>
                {current && (
                    <span className="domain-combobox__trigger-count">{current[1]}</span>
                )}
                <MIcon name={open ? 'expand_less' : 'expand_more'} size="sm" />
            </button>

            {open && (
                <div className="domain-combobox__dropdown">
                    <div className="domain-combobox__search">
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
                            placeholder="Фильтр по имени..."
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {query && (
                            <button
                                type="button"
                                className="domain-combobox__clear"
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

                    <div className="domain-combobox__list" ref={listRef}>
                        {filtered.length === 0 ? (
                            <div className="domain-combobox__empty">Ничего не найдено</div>
                        ) : (
                            filtered.map(([d, count], idx) => (
                                <button
                                    key={d}
                                    type="button"
                                    className={
                                        'domain-combobox__option' +
                                        (d === value ? ' domain-combobox__option--selected' : '') +
                                        (idx === activeIdx ? ' domain-combobox__option--active' : '')
                                    }
                                    onMouseEnter={() => setActiveIdx(idx)}
                                    onClick={() => {
                                        onChange(d);
                                        setOpen(false);
                                    }}
                                >
                                    <span className="domain-combobox__option-name">{d}</span>
                                    <span className="domain-combobox__option-count">{count}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}