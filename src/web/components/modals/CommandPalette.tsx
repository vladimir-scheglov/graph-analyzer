import React, { useMemo, useRef, useEffect } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useSearch } from '../../hooks/useSearch';
import { MIcon } from '../common/MIcon';
import { HighlightedText } from '../common/HighlightedText';
import type { Command } from '../../lib/commands';

export interface CommandPaletteProps {
    commands: Command[];
    onOpenFile?: (filePath: string, fqid: string | null) => void;
}

export function CommandPalette({ commands, onOpenFile }: CommandPaletteProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const results = useSearch();
    const inputRef = useRef<HTMLInputElement>(null);

    const open = store.searchOpen;
    const query = store.searchQuery;
    const index = store.searchIndex;

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
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

    const close = () => store.setSearchOpen(false);

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            store.setSearchIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            store.setSearchIndex(Math.max(safeIndex - 1, 0));
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
                        onChange={(e) => store.setSearchQuery(e.target.value)}
                        onKeyDown={onKey}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="search-modal__kbd">Esc</kbd>
                </div>

                <div className="search-modal__results">
                    {query.trim() === '' && filteredCommands.length === 0 && results.length === 0 && (
                        <div className="search-modal__hint">Начните вводить имя команды, домен или FQID</div>
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
                                    const isActive = itemIdx === safeIndex;
                                    return (
                                        <div
                                            key={'cmd-' + itemIdx}
                                            className={'palette-item palette-item--command' + (isActive ? ' active' : '')}
                                            onMouseEnter={() => store.setSearchIndex(itemIdx)}
                                            onClick={() => {
                                                close();
                                                setTimeout(() => cmd.run && cmd.run(), 50);
                                            }}
                                        >
                                            <span className="palette-item__icon">
                                                {cmd.iconName ? <MIcon name={cmd.iconName} size="sm" /> : cmd.icon}
                                            </span>
                                            <span className="palette-item__label">{cmd.label}</span>
                                            {cmd.hotkey && <kbd className="palette-item__hotkey">{cmd.hotkey}</kbd>}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                    {results.length > 0 && (
                        <div className="palette-section">
                            <div className="palette-section__title">Домены ({results.length})</div>
                            {results.map((item, i) => {
                                const itemIdx = domainStartIdx + i;
                                const isActive = itemIdx === safeIndex;
                                const n = item.node;
                                const matched = new Set(item.matches.map((m) => m.field));

                                return (
                                    <div
                                        key={'dom-' + i}
                                        className={'palette-item' + (isActive ? ' active' : '')}
                                        onMouseEnter={() => store.setSearchIndex(itemIdx)}
                                        onClick={() => {
                                            goto(n.data.domainId);
                                            close();
                                        }}
                                    >
                                        <span className="palette-item__icon">
                                            <span
                                                className={'search-result__dot search-result__dot--' + n.data.nodeType}
                                            />
                                        </span>
                                        <div className="palette-item__content">
                                            <div className="search-result__id">
                                                <HighlightedText text={n.data.domainId} query={query} />
                                                {matched.has('id') && <span className="search-result__badge">id</span>}
                                            </div>
                                            {n.data.name && n.data.name !== n.data.domainId && (
                                                <div className="search-result__label">
                                                    <HighlightedText text={n.data.name} query={query} />
                                                    {matched.has('name') && (
                                                        <span className="search-result__badge">name</span>
                                                    )}
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
                                                    {matched.has('tags') && (
                                                        <span className="search-result__badge">tags</span>
                                                    )}
                                                </div>
                                            )}

                                            {(() => {
                                                const fqidMatch = item.matches.find((m) => m.field === 'fqid');
                                                if (!fqidMatch || !Array.isArray(fqidMatch.value) || !fqidMatch.value.length) {
                                                    return null;
                                                }
                                                return (
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
                                                                        close();
                                                                    } else {
                                                                        goto(n.data.domainId);
                                                                        close();
                                                                    }
                                                                }}
                                                                title={
                                                                    onOpenFile ? 'Открыть файл на строке с FQID' : 'Перейти к домену'
                                                                }
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
                                                );
                                            })()}
                                        </div>
                                    </div>
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