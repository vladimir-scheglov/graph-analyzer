import {
    useEffect, useMemo, useRef, useState, type FC, type KeyboardEvent,
} from 'react';

export interface SchemaSelectOption {
    /** Сохраняемое значение (локальный ID для своего домена, FQID для чужого). */
    value: string;
    /** Отображаемое имя (может быть пустым). */
    name: string;
    /** ID для отображения и поиска (локальный или FQID). */
    id: string;
    /** Домен, к которому относится элемент (lowercase). */
    domain: string;
    /** Доп. инфа: тип действия, side связи и т.п. */
    hint?: string;
    /** Помечать как «не сохранено в ModelIndex». */
    unsaved?: boolean;
}

interface Props {
    value: string | null;
    onChange: (v: string | null) => void;
    options: SchemaSelectOption[];
    /** Домен схемы (для разделения «текущий / другие»). */
    currentDomainId: string;
    placeholder?: string;
    disabled?: boolean;
    /** Показать кнопку «очистить» (✕). */
    allowClear?: boolean;
    /** Кастомный текст для пустого результата поиска. */
    emptyText?: string;
}

/**
 * Комбобокс выбора элемента схемы.
 *
 * - Группирует опции: сначала «Текущий домен», затем — по одному заголовку на домен.
 * - Поиск по `name` и `id` (case-insensitive).
 * - Формат опции: `name (id)` + опциональный hint (серым).
 * - Клавиатура: ↑/↓, Enter, Esc, Home/End.
 */
export const SchemaSelect: FC<Props> = ({
    value,
    onChange,
    options,
    currentDomainId,
    placeholder = '— не выбрано —',
    disabled = false,
    allowClear = true,
    emptyText = 'Ничего не найдено',
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    const currentDomain = currentDomainId.toLowerCase();

    // ---- Выбранный элемент ----
    const selected = useMemo(
        () => options.find((o) => o.value === value) ?? null,
        [options, value],
    );

    const displayLabel = selected
        ? formatOption(selected)
        : value
            ? `— ${value} (не найден) —`
            : placeholder;

    // ---- Фильтрация по поиску ----
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) =>
                (o.name || '').toLowerCase().includes(q) ||
                o.id.toLowerCase().includes(q),
        );
    }, [options, search]);

    // ---- Группировка ----
    const groups = useMemo(() => {
        const current: SchemaSelectOption[] = [];
        const others = new Map<string, SchemaSelectOption[]>();

        for (const opt of filtered) {
            if (opt.domain === currentDomain) {
                current.push(opt);
            } else {
                const arr = others.get(opt.domain);
                if (arr) arr.push(opt);
                else others.set(opt.domain, [opt]);
            }
        }

        // сортировка внутри групп по name (или по id, если name пусто)
        const cmp = (a: SchemaSelectOption, b: SchemaSelectOption) => {
            const an = (a.name || a.id).toLowerCase();
            const bn = (b.name || b.id).toLowerCase();
            return an.localeCompare(bn);
        };
        current.sort(cmp);
        for (const arr of others.values()) arr.sort(cmp);

        // domains sorted by id
        const otherDomains = [...others.entries()].sort(([a], [b]) => a.localeCompare(b));

        return { current, otherDomains };
    }, [filtered, currentDomain]);

    // ---- Плоский список (для клавиатуры) ----
    const flatList = useMemo(() => {
        const out: SchemaSelectOption[] = [];
        if (groups.current.length > 0) out.push(...groups.current);
        for (const [, arr] of groups.otherDomains) out.push(...arr);
        return out;
    }, [groups]);

    // ---- Клик вне — закрыть ----
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // ---- Фокус при открытии + сброс ----
    useEffect(() => {
        if (open) {
            setSearch('');
            setHighlightedIndex(0);
            // фокус на поиск — на следующем кадре (после рендера)
            requestAnimationFrame(() => searchRef.current?.focus());
        }
    }, [open]);

    // ---- Сброс highlight при поиске ----
    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    // ---- Scroll highlighted в видимую область ----
    const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!open) return;
        const el = optionRefs.current.get(highlightedIndex);
        el?.scrollIntoView({ block: 'nearest' });
    }, [highlightedIndex, open]);

    // ---- Хэндлеры ----
    const openDropdown = () => {
        if (disabled) return;
        setOpen(true);
    };

    const selectOption = (opt: SchemaSelectOption) => {
        onChange(opt.value);
        setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, flatList.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Home') {
            e.preventDefault();
            setHighlightedIndex(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            setHighlightedIndex(flatList.length - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const opt = flatList[highlightedIndex];
            if (opt) selectOption(opt);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
        }
    };

    // ---- Рендер ----
    let runningIndex = -1;
    const renderOption = (opt: SchemaSelectOption) => {
        runningIndex++;
        const idx = runningIndex;
        const isSelected = opt.value === value;
        const isHighlighted = idx === highlightedIndex;
        return (
            <div
                key={`${opt.domain}::${opt.value}`}
                ref={(el) => {
                    if (el) optionRefs.current.set(idx, el);
                    else optionRefs.current.delete(idx);
                }}
                className={
                    'dc-schema-select__option' +
                    (isSelected ? ' dc-schema-select__option--selected' : '') +
                    (isHighlighted ? ' dc-schema-select__option--highlighted' : '')
                }
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                    // избежать потери фокуса на search
                    e.preventDefault();
                    selectOption(opt);
                }}
            >
                <span className="dc-schema-select__option-name">
                    {opt.name || opt.id}
                </span>
                {opt.name && opt.name !== opt.id && (
                    <span className="dc-schema-select__option-id">({opt.id})</span>
                )}
                {!opt.name && null /* уже показали id вместо name */}
                {opt.hint && (
                    <span className="dc-schema-select__option-hint">{opt.hint}</span>
                )}
                {opt.unsaved && (
                    <span className="dc-schema-select__option-unsaved" title="Не сохранено в ModelIndex">
                        ⚠
                    </span>
                )}
            </div>
        );
    };

    return (
        <div
            ref={rootRef}
            className={'dc-schema-select' + (disabled ? ' dc-schema-select--disabled' : '')}
        >
            <div
                className={
                    'dc-schema-select__trigger' + (open ? ' dc-schema-select__trigger--open' : '')
                }
                onClick={() => (open ? setOpen(false) : openDropdown())}
                tabIndex={disabled ? -1 : 0}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                onKeyDown={(e) => {
                    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
                        e.preventDefault();
                        openDropdown();
                    }
                }}
            >
                <span
                    className={
                        'dc-schema-select__value' +
                        (!selected && !value ? ' dc-schema-select__value--placeholder' : '')
                    }
                >
                    {displayLabel}
                </span>
                {value && allowClear && !disabled && (
                    <button
                        type="button"
                        className="dc-schema-select__clear"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange(null);
                        }}
                        title="Очистить"
                    >×</button>
                )}
                <span className="dc-schema-select__arrow">{open ? '▴' : '▾'}</span>
            </div>

            {open && (
                <div className="dc-schema-select__dropdown">
                    <input
                        ref={searchRef}
                        className="dc-schema-select__search dc-input"
                        placeholder="Поиск по имени или ID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />

                    <div className="dc-schema-select__list" role="listbox">
                        {filtered.length === 0 && (
                            <div className="dc-schema-select__empty">{emptyText}</div>
                        )}

                        {groups.current.length > 0 && (
                            <div className="dc-schema-select__group">
                                <div className="dc-schema-select__group-label">Текущий домен</div>
                                {groups.current.map(renderOption)}
                            </div>
                        )}

                        {groups.otherDomains.map(([domain, opts]) => (
                            <div key={domain} className="dc-schema-select__group">
                                <div className="dc-schema-select__group-label">{domain}</div>
                                {opts.map(renderOption)}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============ Утилита форматирования ============

function formatOption(o: SchemaSelectOption): string {
    if (o.name && o.name !== o.id) return `${o.name} (${o.id})`;
    return o.id;
}