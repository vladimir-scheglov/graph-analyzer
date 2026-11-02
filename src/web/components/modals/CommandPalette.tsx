import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useSearch } from '../../hooks/useSearch';
import { MIcon } from '../common/MIcon';
import { HighlightedText } from '../common/HighlightedText';
import type { Command } from '../../lib/commands';
import type { ModelSearchResult, ModelSearchKind } from '../../lib/search/types';
import { useModelIndex } from '../../hooks/useModelIndex';

const SYNTAX_HELP: Array<{ code: string; text: string }> = [
    { code: 'entity:Server', text: 'сущности; Enter — каталог' },
    { code: 'type:Reference', text: 'атрибуты по dataType' },
    { code: 'constraint:required', text: 'атрибуты с ограничением' },
    { code: 'has:mixin', text: 'сущности с миксинами' },
    { code: 'has:table', text: 'с Table-атрибутом' },
    { code: '-has:mixin', text: 'без миксинов (отрицание)' },
    { code: 'ref:it.assets.*', text: 'с Reference на домен' },
    { code: 'pii:critical', text: 'PII-хиты critical' },
    { code: 'lint:error', text: 'с ошибками линтера' },
    { code: 'domain:it.*', text: 'только эти домены' },
    { code: 'namespace:it.assets', text: 'сужение по неймспейсу' },
    { code: 'fqid:it.assets.rvision.ru/Server', text: 'точный прыжок' },
    { code: 'Server domain:it.*', text: 'текст + сужение' },
];

function SearchSyntaxPanel({ onPick }: { onPick: (code: string) => void }) {
    return (
        <div className="search-modal__syntax">
            <div className="search-modal__syntax-title">
                Синтаксис: <code>field:value</code>, отрицание — <code>-</code> или <code>!</code>
            </div>
            <div className="search-modal__syntax-grid">
                {SYNTAX_HELP.map((r) => (
                    <button
                        key={r.code}
                        type="button"
                        className="search-modal__syntax-example"
                        onClick={() => onPick(r.code)}
                    >
                        <code>{r.code}</code>
                        <span>{r.text}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

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
    const inputRef = useRef<HTMLInputElement>(null);

    const [syntaxOpen, setSyntaxOpen] = useState(false);

    const searchOutcome = useSearch();
    const results = searchOutcome.results;

    const dispatchResult = useCallback((r: ModelSearchResult) => {
        const st = useGraphStore.getState();
        switch (r.kind) {
            case 'domain':
                if (r.domainId) goto(r.domainId);
                break;
            case 'entity':
            case 'attribute':
                if (r.fqid) {
                    st.setEntityCatalogInitialFqid(r.fqid);
                    st.setEntityCatalogOpen(true);
                }
                break;
            case 'pii':
                if (r.piiHit) {
                    st.setPiiInitialDomain(r.piiHit.entityFqid.split('/')[0]);
                    st.setPiiInitialSeverity(r.piiHit.severity);
                    st.setPiiOpen(true);
                }
                break;
            case 'lint':
                st.setLintOpen(true);
                break;
            case 'view':
            case 'action':
            case 'linkage':
            case 'dataType':
            case 'dataRule':
            case 'mixin':
            case 'menu':
                if (r.domainId) {
                    st.setDomainSchemaDomainId(r.domainId);
                    st.setDomainSchemaOpen(true);
                }
                break;
        }
    }, [goto]);

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

    const close = useCallback(() => {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchIndex(0);
    }, [setSearchOpen, setSearchQuery, setSearchIndex]);

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
                const item = results[safeIndex - filteredCommands.length];
                if (item) {
                    dispatchResult(item);
                    close();
                }
            }
        }
    };

    useEffect(() => {
        if (open) {
            setSyntaxOpen(false);
            setTimeout(() => {
                const input = inputRef.current;
                if (!input) return;
                input.focus();
                input.setSelectionRange(0, input.value.length);
            }, 50);
        }
    }, [open]);

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
                        placeholder='Команда, домен, FQID или запрос: entity:Server · type:Reference'
                        value={query}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={onKey}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="search-modal__kbd">Esc</kbd>
                    {query.trim() === '' && (
                        <button
                            className="search-modal__kbd"
                            onClick={() => setSyntaxOpen(v => !v)}
                            title="Синтаксис поиска"
                        >
                            ?
                        </button>
                    )}
                </div>

                <div className="search-modal__results">
                    {!searchOutcome.ready && query.trim() !== '' && (
                        <div className="search-modal__hint">Загрузка модели…</div>
                    )}
                    {searchOutcome.ready && query.trim() === '' && filteredCommands.length === 0 && results.length === 0 && (
                        <div className="search-modal__hint">
                            Начните вводить имя команды, домен или FQID
                        </div>
                    )}
                    {searchOutcome.ready && query.trim() !== '' && filteredCommands.length === 0 && results.length === 0 && (
                        <div className="search-modal__hint">
                            {searchOutcome.error
                                ? <>Ошибка поиска: <code>{searchOutcome.error}</code></>
                                : <>Ничего не найдено по запросу «{query}».</>}
                            {query.includes(':') && (
                                <>
                                    {' '}
                                    <button
                                        type="button"
                                        className="search-modal__hint-link search-modal__syntax-example"
                                        style={{ display: 'inline' }}
                                        onClick={() => setSyntaxOpen(true)}
                                    >
                                        Подсказка по синтаксису
                                    </button>
                                </>
                            )}
                        </div>
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
                            <div className="palette-section__title">
                                {searchOutcome.total > results.length
                                    ? `Найдено ${searchOutcome.total} — показаны первые ${results.length}`
                                    : `Результаты (${results.length})`}
                            </div>
                            {results.map((r, i) => {
                                const itemIdx = domainStartIdx + i;
                                return (
                                    <ModelResultItem
                                        key={r.key}
                                        result={r}
                                        itemIdx={itemIdx}
                                        isActive={itemIdx === safeIndex}
                                        query={query}
                                        onHover={handleHover}
                                        onSelect={() => {
                                            dispatchResult(r);
                                            close();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}

                    {searchOutcome.error && (
                        <div className="palette-section">
                            <div className="palette-section__title" style={{ color: 'var(--danger)' }}>
                                Ошибка поиска
                            </div>
                            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-400)' }}>
                                {searchOutcome.error}
                            </div>
                        </div>
                    )}
                </div>

                {syntaxOpen && (
                    <SearchSyntaxPanel onPick={(code) => { setSearchQuery(code); setSyntaxOpen(false); }} />
                )}

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

const KIND_ICONS: Record<ModelSearchKind, string> = {
    domain: 'hub',
    entity: 'data_object',
    attribute: 'edit_note',
    linkage: 'link',
    view: 'view_quilt',
    action: 'bolt',
    menu: 'menu',
    dataType: 'category',
    dataRule: 'rule',
    mixin: 'merge',
    pii: 'shield_lock',
    lint: 'warning',
};

const ModelResultItem = React.memo(function ModelResultItem({
    result,
    itemIdx,
    isActive,
    query,
    onHover,
    onSelect,
}: {
    result: ModelSearchResult;
    itemIdx: number;
    isActive: boolean;
    query: string;
    onHover: (idx: number) => void;
    onSelect: () => void;
}) {
    return (
        <div
            className={'palette-item' + (isActive ? ' active' : '')}
            onMouseEnter={() => onHover(itemIdx)}
            onClick={onSelect}
        >
            <span className="palette-item__icon">
                <MIcon name={KIND_ICONS[result.kind]} size="sm" />
            </span>
            <div className="palette-item__content">
                <div className="search-result__id">
                    <HighlightedText text={result.label} query={query} />
                    <span
                        className="search-result__badge"
                        style={{
                            background:
                                result.kind === 'pii'
                                    ? 'rgba(239,68,68,0.2)'
                                    : result.kind === 'lint'
                                        ? 'rgba(245,158,11,0.2)'
                                        : undefined,
                        }}
                    >
                        {result.kind}
                    </span>
                </div>
                {result.sublabel && (
                    <div className="search-result__label">
                        <HighlightedText text={result.sublabel} query={query} />
                    </div>
                )}
            </div>
        </div>
    );
});