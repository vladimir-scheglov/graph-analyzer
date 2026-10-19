import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useSearch } from '../../hooks/useSearch';
import { MIcon } from '../common/MIcon';
import { HighlightedText } from '../common/HighlightedText';
import type { Command } from '../../lib/commands';
import type { SearchResult } from '../../hooks/useSearch';

export interface CommandPaletteProps {
    commands: Command[];
    onOpenFile?: (filePath: string, fqid: string | null) => void;
}

// ============ memo-компоненты для строк ============

interface CommandItemProps {
    cmd: Command;
    itemIdx: number;
    isActive: boolean;
    onHover: (idx: number) => void;
    onSelect: () => void;
}

const CommandItem = React.memo(function CommandItem({
    cmd,
    itemIdx,
    isActive,
    onHover,
    onSelect
}: CommandItemProps) {
    return (
        <div
            className={'palette-item palette-item--command' + (isActive ? ' active' : '')}
            onMouseEnter={() => onHover(itemIdx)}
            onClick={onSelect}
        >
            <span className="palette-item__icon">
                {cmd.iconName ? <MIcon name={cmd.iconName} size="sm" /> : cmd.icon}
            </span>
            <span className="palette-item__label">{cmd.label}</span>
            {cmd.hotkey && <kbd className="palette-item__hotkey">{cmd.hotkey}</kbd>}
        </div>
    );
});

interface DomainItemProps {
    item: SearchResult;
    itemIdx: number;
    isActive: boolean;
    query: string;
    onHover: (idx: number) => void;
    onSelect: () => void;
    onOpenFile?: (filePath: string, fqid: string | null) => void;
    onGoto: (domainId: string) => void;
}

const DomainItem = React.memo(function DomainItem({
    item,
    itemIdx,
    isActive,
    query,
    onHover,
    onSelect,
    onOpenFile,
    onGoto
}: DomainItemProps) {
    const n = item.node;
    const matched = useMemo(
        () => new Set(item.matches.map((m) => m.field)),
        [item.matches]
    );

    const fqidMatch = useMemo(
        () => item.matches.find((m) => m.field === 'fqid'),
        [item.matches]
    );

    return (
        <div
            className={'palette-item' + (isActive ? ' active' : '')}
            onMouseEnter={() => onHover(itemIdx)}
            onClick={onSelect}
        >
            <span className="palette-item__icon">
                <span className={'search-result__dot search-result__dot--' + n.data.nodeType} />
            </span>
            <div className="palette-item__content">
                <div className="search-result__id">
                    <HighlightedText text={n.data.domainId} query={query} />
                    {matched.has('id') && <span className="search-result__badge">id</span>}
                </div>

                {n.data.name && n.data.name !== n.data.domainId && (
                    <div className="search-result__label">
                        <HighlightedText text={n.data.name} query={query} />
                        {matched.has('name') && <span className="search-result__badge">name</span>}
                    </div>
                )}

                {n.data.description && (
                    <div className="search-result__desc">
                        <HighlightedText text={n.data.description} query={query} />
                        {matched.has('description') && (
                            <span className="search-result__badge">description</span>
                        )}
                    </div>
                )}

                {Array.isArray(n.data.tags) && n.data.tags.length > 0 && (
                    <div className="search-result__tags">
                        {n.data.tags.slice(0, 5).map((tag: string, ti: number) => (
                            <span key={ti} className="search-result__tag">
                                <HighlightedText text={tag} query={query} />
                            </span>
                        ))}
                        {matched.has('tags') && <span className="search-result__badge">tags</span>}
                    </div>
                )}

                {fqidMatch && Array.isArray(fqidMatch.value) && fqidMatch.value.length > 0 && (
                    <div className="search-result__fqid-block">
                        <div className="search-result__fqid-head">
                            <MIcon name="link" size="sm" />
                            <span>FQID-ссылки ({fqidMatch.value.length})</span>
                            <span className="search-result__badge">fqid</span>
                        </div>
                        {fqidMatch.value.slice(0, 3).map((f: any, fi: number) => (
                            <div
                                key={fi}
                                className="search-result__fqid-item"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenFile && f.filePath) {
                                        onOpenFile(f.filePath, f.fullFQID);
                                    } else {
                                        onGoto(n.data.domainId);
                                    }
                                }}
                                title={onOpenFile ? 'Открыть файл на строке с FQID' : 'Перейти к домену'}
                            >
                                <HighlightedText text={f.fullFQID} query={query} />
                                {f.propertyPath && (
                                    <span className="search-result__fqid-path">{f.propertyPath}</span>
                                )}
                            </div>
                        ))}
                        {fqidMatch.value.length > 3 && (
                            <div className="search-result__fqid-more">
                                ...и ещё {fqidMatch.value.length - 3}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});

// ============ Главный компонент ============

export function CommandPalette({ commands, onOpenFile }: CommandPaletteProps) {
    // Точечные подписки
    const open = useGraphStore((s) => s.searchOpen);
    const query = useGraphStore((s) => s.searchQuery);
    const index = useGraphStore((s) => s.searchIndex);
    const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
    const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
    const setSearchIndex = useGraphStore((s) => s.setSearchIndex);

    const { goto } = useNavigation();
    const results = useSearch();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setTimeout(() => {
                const input = inputRef.current;
                if (!input) return;
                input.focus();
                // Выделяем весь текст, чтобы при печати он заменился
                input.setSelectionRange(0, input.value.length);
            }, 50);
        }
    }, [open]);

    const filteredCommands = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return commands;
        return commands.filter((c) => {
            const hay = ((c.label || '') + ' ' + (c.keywords || '') + ' ' + (c.section || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }, [query, commands]);

    const commandsBySection = useMemo(() => {
        const map = new Map<string, Command[]>();
        filteredCommands.forEach((c) => {
            const s = c.section || 'Прочее';
            if (!map.has(s)) map.set(s, []);
            map.get(s)!.push(c);
        });
        return Array.from(map.entries());
    }, [filteredCommands]);

    const totalItems = filteredCommands.length + results.length;
    const safeIndex = Math.min(index, Math.max(totalItems - 1, 0));

    const close = useCallback(() => setSearchOpen(false), [setSearchOpen]);

    // Стабильные колбэки для memo-строк
    const handleHover = useCallback(
        (idx: number) => setSearchIndex(idx),
        [setSearchIndex]
    );

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSearchIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSearchIndex(Math.max(safeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (totalItems === 0) return;
            if (safeIndex < filteredCommands.length) {
                const cmd = filteredCommands[safeIndex];
                close();
                setTimeout(() => cmd.run && cmd.run(), 50);
            } else {
                const domainItem = results[safeIndex - filteredCommands.length];
                if (domainItem && domainItem.node) {
                    goto(domainItem.node.data.domainId);
                    close();
                }
            }
        }
    };

    if (!open) return null;

    let cmdIdx = 0;
    const domainStartIdx = filteredCommands.length;

    return (
        <div className="search-overlay" onMouseDown={close}>
            <div className="search-modal search-modal--palette" onMouseDown={(e) => e.stopPropagation()}>
                <div className="search-modal__input-wrap">
                    <span className="search-modal__icon">
                        <MIcon name="search" />
                    </span>
                    <input
                        ref={inputRef}
                        className="search-modal__input"
                        type="text"
                        placeholder="Команда, домен или FQID..."
                        value={query}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={onKey}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="search-modal__kbd">Esc</kbd>
                </div>

                <div className="search-modal__results">
                    {query.trim() === '' && filteredCommands.length === 0 && results.length === 0 && (
                        <div className="search-modal__hint">
                            Начните вводить имя команды, домен или FQID
                        </div>
                    )}
                    {query.trim() !== '' && filteredCommands.length === 0 && results.length === 0 && (
                        <div className="search-modal__hint">Ничего не найдено по запросу «{query}»</div>
                    )}

                    {filteredCommands.length > 0 &&
                        commandsBySection.map(([section, cmds]) => (
                            <div key={'sec-' + section} className="palette-section">
                                <div className="palette-section__title">{section}</div>
                                {cmds.map((cmd) => {
                                    const itemIdx = cmdIdx++;
                                    return (
                                        <CommandItem
                                            key={'cmd-' + itemIdx}
                                            cmd={cmd}
                                            itemIdx={itemIdx}
                                            isActive={itemIdx === safeIndex}
                                            onHover={handleHover}
                                            onSelect={() => {
                                                close();
                                                setTimeout(() => cmd.run && cmd.run(), 50);
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ))}

                    {results.length > 0 && (
                        <div className="palette-section">
                            <div className="palette-section__title">Домены ({results.length})</div>
                            {results.map((item, i) => {
                                const itemIdx = domainStartIdx + i;
                                return (
                                    <DomainItem
                                        key={'dom-' + item.node.id}
                                        item={item}
                                        itemIdx={itemIdx}
                                        isActive={itemIdx === safeIndex}
                                        query={query}
                                        onHover={handleHover}
                                        onSelect={() => {
                                            goto(item.node.data.domainId);
                                            close();
                                        }}
                                        onOpenFile={onOpenFile}
                                        onGoto={(domainId) => {
                                            goto(domainId);
                                            close();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="search-modal__footer">
                    <span>
                        <kbd>↑</kbd>
                        <kbd>↓</kbd> навигация
                    </span>
                    <span>
                        <kbd>Enter</kbd> выбрать
                    </span>
                    <span>
                        <kbd>Esc</kbd> закрыть
                    </span>
                </div>
            </div>
        </div>
    );
}