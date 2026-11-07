import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { useSearch } from '../../hooks/useSearch';
import { MIcon } from '../common/MIcon';
import { HighlightedText } from '../common/HighlightedText';
import type { Command } from '../../lib/commands';
import type { ModelSearchResult, ModelSearchKind } from '../../lib/search/types';

// ============ Constants ============

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
];

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

const KIND_LABELS: Record<ModelSearchKind, string> = {
    domain: 'Домены',
    entity: 'Сущности',
    attribute: 'Атрибуты',
    linkage: 'Связи',
    view: 'Views',
    action: 'Actions',
    menu: 'Меню',
    dataType: 'Типы данных',
    dataRule: 'Правила',
    mixin: 'Миксины',
    pii: 'PII',
    lint: 'Lint',
};

const KIND_ORDER: ModelSearchKind[] = [
    'domain', 'entity', 'attribute', 'view', 'action',
    'linkage', 'dataType', 'mixin', 'dataRule', 'menu',
    'pii', 'lint',
];

const RECENT_COMMANDS_KEY = 'dg-palette-recent-commands';
const RECENT_SEARCHES_KEY = 'dg-palette-recent-searches';
const MAX_RECENT_COMMANDS = 8;
const MAX_RECENT_SEARCHES = 5;

// ============ Recent persistence ============

function loadRecentCommands(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_COMMANDS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRecentCommands(ids: string[]): void {
    try {
        localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(ids));
    } catch {
        /* ignore */
    }
}

function loadRecentSearches(): string[] {
    try {
        const raw = sessionStorage.getItem(RECENT_SEARCHES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRecentSearches(list: string[]): void {
    try {
        sessionStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch {
        /* ignore */
    }
}

function commandId(c: Command): string {
    return `${c.section || ''}:${c.label}`;
}

// ============ Fuzzy scoring ============

function fuzzyMatch(str: string, q: string): boolean {
    let i = 0;
    let j = 0;
    while (i < str.length && j < q.length) {
        if (str[i] === q[j]) j++;
        i++;
    }
    return j === q.length;
}

function scoreCommand(cmd: Command, q: string): number {
    const label = (cmd.label || '').toLowerCase();
    const keywords = (cmd.keywords || '').toLowerCase();
    const section = (cmd.section || '').toLowerCase();

    if (label === q) return 1000;
    if (label.startsWith(q)) return 800;
    if (keywords.split(/\s+/).includes(q)) return 700;
    if (keywords.startsWith(q)) return 600;
    if (label.includes(q)) return 500;
    if (keywords.includes(q)) return 400;
    if (section.includes(q)) return 300;
    if (fuzzyMatch(label, q)) return 100;
    if (fuzzyMatch(keywords, q)) return 80;
    return 0;
}

// ============ Sub-components ============

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
    onSelect,
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

// ============ Main ============

export interface CommandPaletteProps {
    commands: Command[];
    onOpenFile?: (filePath: string, fqid: string | null) => void;
}

export function CommandPalette({ commands, onOpenFile }: CommandPaletteProps) {
    const open = useGraphStore((s) => s.searchOpen);
    const query = useGraphStore((s) => s.searchQuery);
    const index = useGraphStore((s) => s.searchIndex);
    const setSearchOpen = useGraphStore((s) => s.setSearchOpen);
    const setSearchQuery = useGraphStore((s) => s.setSearchQuery);
    const setSearchIndex = useGraphStore((s) => s.setSearchIndex);

    const { goto } = useNavigation();
    const inputRef = useRef<HTMLInputElement>(null);

    const [syntaxOpen, setSyntaxOpen] = useState(false);
    const [recentIds, setRecentIds] = useState<string[]>(loadRecentCommands);
    const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);

    const searchOutcome = useSearch();
    const results = searchOutcome.results;

    // ============ Recent helpers ============

    const rememberCommand = useCallback((cmd: Command) => {
        const id = commandId(cmd);
        setRecentIds((prev) => {
            const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT_COMMANDS);
            saveRecentCommands(next);
            return next;
        });
    }, []);

    const rememberSearch = useCallback((q: string) => {
        const t = q.trim();
        if (t.length < 2) return;
        setRecentSearches((prev) => {
            const next = [t, ...prev.filter((x) => x !== t)].slice(0, MAX_RECENT_SEARCHES);
            saveRecentSearches(next);
            return next;
        });
    }, []);

    // ============ Dispatch result ============

    const dispatchResult = useCallback(
        (r: ModelSearchResult) => {
            rememberSearch(query);
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
        },
        [goto, query, rememberSearch],
    );

    // ============ Filtering: recents first + score ============

    const recentCommands = useMemo(
        () =>
            recentIds
                .map((id) => commands.find((c) => commandId(c) === id))
                .filter((c): c is Command => !!c),
        [recentIds, commands],
    );

    const filteredCommands = useMemo(() => {
        const q = query.trim().toLowerCase();

        if (!q) {
            const recentSet = new Set(recentIds);
            const others = commands.filter(
                (c) => !recentSet.has(commandId(c)),
            );
            return [...recentCommands, ...others];
        }

        return commands
            .map((cmd) => ({ cmd, score: scoreCommand(cmd, q) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.cmd);
    }, [query, commands, recentCommands, recentIds]);

    const commandsBySection = useMemo(() => {
        const q = query.trim().toLowerCase();
        const recentSet = new Set(recentIds);
        const map = new Map<string, Command[]>();
        const recentItems: Command[] = [];

        filteredCommands.forEach((c) => {
            if (!q && recentSet.has(commandId(c))) {
                recentItems.push(c);
                return;
            }
            const s = c.section || 'Прочее';
            if (!map.has(s)) map.set(s, []);
            map.get(s)!.push(c);
        });

        const result: Array<[string, Command[]]> = [];
        if (recentItems.length > 0) {
            result.push(['Недавние', recentItems]);
        }
        map.forEach((items, section) => result.push([section, items]));
        return result;
    }, [filteredCommands, query, recentIds]);

    // ============ Ordered results for keyboard nav ============

    // Сортируем по KIND_ORDER, чтобы визуальный порядок == навигация
    const orderedResults = useMemo(() => {
        const grouped = new Map<ModelSearchKind, ModelSearchResult[]>();
        for (const r of results) {
            if (!grouped.has(r.kind)) grouped.set(r.kind, []);
            grouped.get(r.kind)!.push(r);
        }
        const out: ModelSearchResult[] = [];
        for (const k of KIND_ORDER) {
            const items = grouped.get(k);
            if (items) out.push(...items);
        }
        return out;
    }, [results]);

    const resultsByKind = useMemo(() => {
        const m = new Map<
            ModelSearchKind,
            Array<{ result: ModelSearchResult; flatIdx: number }>
        >();
        orderedResults.forEach((r, i) => {
            if (!m.has(r.kind)) m.set(r.kind, []);
            m.get(r.kind)!.push({ result: r, flatIdx: i });
        });
        return KIND_ORDER.filter((k) => m.has(k)).map((k) => ({
            kind: k,
            items: m.get(k)!,
        }));
    }, [orderedResults]);

    // ============ Focus / close ============

    useEffect(() => {
        if (!open) return;
        setSyntaxOpen(false);
        setRecentIds(loadRecentCommands());
        setRecentSearches(loadRecentSearches());
        const t = setTimeout(() => {
            const input = inputRef.current;
            if (!input) return;
            input.focus();
            input.setSelectionRange(0, input.value.length);
        }, 50);
        return () => clearTimeout(t);
    }, [open]);

    const close = useCallback(() => {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchIndex(0);
    }, [setSearchOpen, setSearchQuery, setSearchIndex]);

    const runCommand = useCallback(
        (cmd: Command) => {
            rememberCommand(cmd);
            rememberSearch(query);
            close();
            setTimeout(() => cmd.run && cmd.run(), 50);
        },
        [close, query, rememberCommand, rememberSearch],
    );

    // ============ Keyboard ============

    const totalItems = filteredCommands.length + orderedResults.length;
    const safeIndex = Math.min(index, Math.max(totalItems - 1, 0));

    const handleHover = useCallback(
        (idx: number) => setSearchIndex(idx),
        [setSearchIndex],
    );

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSearchIndex(Math.min(safeIndex + 1, Math.max(totalItems - 1, 0)));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSearchIndex(Math.max(safeIndex - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (totalItems === 0) return;
            if (safeIndex < filteredCommands.length) {
                runCommand(filteredCommands[safeIndex]);
            } else {
                const item = orderedResults[safeIndex - filteredCommands.length];
                if (item) {
                    dispatchResult(item);
                    close();
                }
            }
            return;
        }
        if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
            if (safeIndex < filteredCommands.length) {
                const cmd = filteredCommands[safeIndex];
                if (cmd) {
                    e.preventDefault();
                    navigator.clipboard.writeText(cmd.label).then(() => {
                        useGraphStore.getState().showSnackbar(`Скопировано: ${cmd.label}`);
                    });
                }
            } else {
                const item = orderedResults[safeIndex - filteredCommands.length];
                if (item) {
                    e.preventDefault();
                    const text = item.fqid || item.label;
                    navigator.clipboard.writeText(text).then(() => {
                        useGraphStore.getState().showSnackbar(`Скопировано: ${text}`);
                    });
                }
            }
            return;
        }
    };

    // ============ Render ============

    if (!open) return null;

    let cmdIdx = 0;
    const domainStartIdx = filteredCommands.length;
    const showEmptyState =
        searchOutcome.ready &&
        query.trim() !== '' &&
        filteredCommands.length === 0 &&
        orderedResults.length === 0;

    return (
        <div className="search-overlay" onMouseDown={close}>
            <div
                className="search-modal search-modal--palette"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="search-modal__input-wrap">
                    <span className="search-modal__icon">
                        <MIcon name="search" />
                    </span>
                    <input
                        ref={inputRef}
                        className="search-modal__input"
                        type="text"
                        placeholder="Команда или поиск: entity:Server · type:Reference · has:mixin · !error"
                        value={query}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setSearchIndex(0);
                        }}
                        onKeyDown={onKey}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="search-modal__kbd">Esc</kbd>
                    {query.trim() === '' && (
                        <button
                            className="search-modal__kbd"
                            onClick={() => setSyntaxOpen((v) => !v)}
                            title="Синтаксис поиска"
                        >
                            ?
                        </button>
                    )}
                </div>

                {/* Recent searches chips */}
                {query.trim() === '' && recentSearches.length > 0 && (
                    <div className="palette-recent-searches">
                        <span className="palette-recent-searches__label">
                            Недавние запросы:
                        </span>
                        {recentSearches.map((q) => (
                            <button
                                key={q}
                                type="button"
                                className="palette-recent-searches__chip"
                                onClick={() => {
                                    setSearchQuery(q);
                                    setSearchIndex(0);
                                }}
                                title={`Искать: ${q}`}
                            >
                                <MIcon name="history" size="sm" />
                                <span>{q}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="search-modal__results">
                    {!searchOutcome.ready && query.trim() !== '' && (
                        <div className="search-modal__hint">Загрузка модели…</div>
                    )}

                    {searchOutcome.ready &&
                        query.trim() === '' &&
                        filteredCommands.length === 0 &&
                        orderedResults.length === 0 && (
                            <div className="search-modal__hint">
                                Начните вводить имя команды, домен или FQID
                            </div>
                        )}

                    {showEmptyState && (
                        <div className="palette-empty">
                            <MIcon name="search_off" size="lg" />
                            <div className="palette-empty__title">
                                {searchOutcome.error
                                    ? 'Ошибка поиска'
                                    : `Ничего не найдено по «${query}»`}
                            </div>
                            {searchOutcome.error ? (
                                <div className="palette-empty__hint">
                                    <code>{searchOutcome.error}</code>
                                </div>
                            ) : (
                                <div className="palette-empty__hint">
                                    Попробуйте:
                                    <button onClick={() => setSearchQuery('entity:')}>entity:</button>
                                    <button onClick={() => setSearchQuery('type:')}>type:</button>
                                    <button onClick={() => setSearchQuery('has:mixin')}>has:mixin</button>
                                    <button onClick={() => setSearchQuery('ref:')}>ref:</button>
                                    <button onClick={() => setSearchQuery('!error')}>!error</button>
                                    <button
                                        onClick={() => setSyntaxOpen(true)}
                                        className="palette-empty__hint-link"
                                    >
                                        Все команды
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {filteredCommands.length > 0 &&
                        commandsBySection.map(([section, cmds]) => (
                            <div
                                key={'sec-' + section}
                                className={
                                    'palette-section' +
                                    (section === 'Недавние' ? ' palette-section--recent' : '')
                                }
                            >
                                <div className="palette-section__title">
                                    {section === 'Недавние' && (
                                        <MIcon name="history" size="sm" />
                                    )}
                                    <span>{section}</span>
                                    <span className="palette-section__count">{cmds.length}</span>
                                </div>
                                {cmds.map((cmd) => {
                                    const itemIdx = cmdIdx++;
                                    return (
                                        <CommandItem
                                            key={'cmd-' + itemIdx}
                                            cmd={cmd}
                                            itemIdx={itemIdx}
                                            isActive={itemIdx === safeIndex}
                                            onHover={handleHover}
                                            onSelect={() => runCommand(cmd)}
                                        />
                                    );
                                })}
                            </div>
                        ))}

                    {orderedResults.length > 0 && searchOutcome.truncated && (
                        <div className="palette-section-hint">
                            Показано {orderedResults.length} из {searchOutcome.total}
                        </div>
                    )}

                    {resultsByKind.map(({ kind, items }) => (
                        <div key={'res-' + kind} className="palette-section">
                            <div className="palette-section__title">
                                <MIcon name={KIND_ICONS[kind]} size="sm" />
                                <span>{KIND_LABELS[kind]}</span>
                                <span className="palette-section__count">{items.length}</span>
                            </div>
                            {items.map(({ result, flatIdx }) => {
                                const itemIdx = domainStartIdx + flatIdx;
                                return (
                                    <ModelResultItem
                                        key={result.key}
                                        result={result}
                                        itemIdx={itemIdx}
                                        isActive={itemIdx === safeIndex}
                                        query={query}
                                        onHover={handleHover}
                                        onSelect={() => {
                                            dispatchResult(result);
                                            close();
                                        }}
                                    />
                                );
                            })}
                        </div>
                    ))}
                </div>

                {syntaxOpen && (
                    <SearchSyntaxPanel
                        onPick={(code) => {
                            setSearchQuery(code);
                            setSyntaxOpen(false);
                            setSearchIndex(0);
                        }}
                    />
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
                        <kbd>Ctrl</kbd>+<kbd>C</kbd> копировать
                    </span>
                    <span>
                        <kbd>Esc</kbd> закрыть
                    </span>
                </div>
            </div>
        </div>
    );
}