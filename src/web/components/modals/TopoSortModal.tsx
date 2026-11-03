import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import {
    buildDependencyGraph,
    topologicalSort,
    findDeps
} from '../../lib/algorithms/topological';
import { simplePatternMatch } from '../../lib/namespace-filter';
import { MIcon } from '../common';
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from '../common/ModalHelp';
import { useHelpEscape } from '../../hooks/useHelpEscape';

export interface TopoSortModalProps {
    allDomains: Array<{ id: string; domainId: string }>;
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
}

function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

interface TopoResult {
    levels: string[][];
    cyclic: string[];
    broken: Array<{ id: string; level: number; brokenDeps: string[] }>;
    criticalPath: number;
    levelMap: Map<string, number>;
    stats: {
        total: number;
        levels: number;
        cyclic: number;
        criticalPath: number;
        excluded: number;
        brokenCount: number;
    };
}

export function TopoSortModal(props: TopoSortModalProps) {
    const { goto } = useNavigation();

    const [scope, setScope] = useState<'all' | 'visible' | 'bookmarked'>('all');
    const [includeFqid, setIncludeFqid] = useState(true);
    const [includeLinkage, setIncludeLinkage] = useState(true);
    const [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
    const [excludePattern, setExcludePattern] = useState('');
    const [autoBreak, setAutoBreak] = useState(false);
    const [result, setResult] = useState<TopoResult | null>(null);
    const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
    const [expandedDeps, setExpandedDeps] = useState<Set<string>>(new Set());
    const [showHelp, setShowHelp] = useState(false);

    const open = useGraphStore((s) => s.topoOpen);
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);

    useEffect(() => {
        if (!open) {
            setResult(null);
            setExpandedLevels(new Set());
            setExpandedDeps(new Set());
        }
    }, [open]);

    useHelpEscape(open, showHelp, setShowHelp);

    const build = useCallback(() => {
        const nodeSet =
            scope === 'visible' ? props.visibleDomains
                : scope === 'bookmarked' ? props.bookmarkedDomains
                    : props.allDomains;

        const restrictTo = new Set(nodeSet.map((d) => d.domainId));

        const excludedIds = new Set<string>();
        const tokens = excludePattern
            .replace(/[,;]/g, ' ')
            .split(' ')
            .filter((t) => t.length > 0);
        if (tokens.length > 0) {
            nodes.forEach((n) => {
                if (n.data.nodeType !== 'domain') return;
                for (const t of tokens) {
                    if (simplePatternMatch(n.data.domainId.toLowerCase(), t.toLowerCase())) {
                        excludedIds.add(n.data.domainId.toLowerCase());
                        return;
                    }
                }
            });
        }

        const depGraph = buildDependencyGraph(nodes, edges, {
            includeFqid,
            includeLinkage,
            missingAsSatisfied,
            excludedIds,
            restrictTo
        });

        const sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });

        const levelMap = new Map<string, number>();
        sorted.levels.forEach((level, idx) => {
            level.forEach((id) => levelMap.set(id, idx + 1));
        });

        setResult({
            levels: sorted.levels,
            cyclic: sorted.cyclic,
            broken: sorted.broken,
            criticalPath: sorted.criticalPath,
            levelMap,
            stats: {
                total: depGraph.domainIds.size,
                levels: sorted.levels.length,
                cyclic: sorted.cyclic.length,
                criticalPath: sorted.criticalPath,
                excluded: excludedIds.size,
                brokenCount: sorted.broken.length
            }
        });
    }, [
        autoBreak, scope, includeFqid, includeLinkage, missingAsSatisfied,
        excludePattern, nodes, edges, props
    ]);

    const exportJSON = () => {
        if (!result) return;
        downloadFile(
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    scope,
                    options: { includeFqid, includeLinkage, missingAsSatisfied, excludePattern },
                    criticalPath: result.criticalPath,
                    stats: result.stats,
                    levels: result.levels,
                    cyclic: result.cyclic,
                    broken: result.broken
                },
                null,
                2
            ),
            'topo-sort-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.json',
            'application/json'
        );
    };

    const exportMD = () => {
        if (!result) return;
        const lines: string[] = [];
        lines.push('# Порядок установки доменов');
        lines.push('');
        lines.push('_Сгенерировано: ' + new Date().toLocaleString('ru-RU') + '_');
        lines.push('');
        lines.push('## Сводка');
        lines.push('');
        lines.push('| Метрика | Значение |');
        lines.push('| --- | ---: |');
        lines.push('| Всего доменов | ' + result.stats.total + ' |');
        lines.push('| Уровней | ' + result.stats.levels + ' |');
        lines.push('| Критический путь | ' + result.stats.criticalPath + ' |');
        lines.push('| В циклах | ' + result.stats.cyclic + ' |');
        lines.push('');
        result.levels.forEach((level, idx) => {
            lines.push('## Уровень ' + (idx + 1) + ' (' + level.length + ')');
            lines.push('');
            level.forEach((id) => lines.push('- `' + id + '`'));
            lines.push('');
        });
        if (result.broken.length > 0) {
            lines.push('## Разорванные циклы');
            lines.push('');
            result.broken.forEach((b) => {
                lines.push('- `' + b.id + '` (уровень ' + b.level + ')');
                b.brokenDeps.forEach((d) => lines.push('  - `' + d + '`'));
            });
            lines.push('');
        }
        if (result.cyclic.length > 0) {
            lines.push('## Требуют ручного вмешательства');
            lines.push('');
            result.cyclic.forEach((id) => lines.push('- `' + id + '`'));
            lines.push('');
        }
        downloadFile(
            lines.join('\n'),
            'topo-sort-' + new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-') + '.md',
            'text/markdown;charset=utf-8'
        );
    };

    const copyAsText = () => {
        if (!result) return;
        const lines: string[] = [];
        result.levels.forEach((level, idx) => {
            lines.push('# Уровень ' + (idx + 1));
            level.forEach((id) => lines.push(id));
            lines.push('');
        });
        if (result.cyclic.length > 0) {
            lines.push('# Циклические');
            result.cyclic.forEach((id) => lines.push(id));
        }
        navigator.clipboard.writeText(lines.join('\n'));
    };

    const toggleLevel = (idx: number) => {
        setExpandedLevels((prev) => {
            const s = new Set(prev);
            if (s.has(idx)) s.delete(idx);
            else s.add(idx);
            return s;
        });
    };

    const toggleDeps = (id: string) => {
        setExpandedDeps((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id);
            else s.add(id);
            return s;
        });
    };

    const scopeOption = (
        value: 'all' | 'visible' | 'bookmarked',
        label: string,
        count: number
    ) => (
        <label className={'validation-scope__option' + (scope === value ? ' active' : '')}>
            <input type="radio" checked={scope === value} onChange={() => setScope(value)} />
            <span className="validation-scope__radio" />
            <span className="validation-scope__text">{label}</span>
            <span className="validation-scope__count">{count}</span>
        </label>
    );

    if (!open) return null;

    return (
        <div className="help-overlay" onMouseDown={() => useGraphStore.getState().setTopoOpen(false)}>
            <div className="help-modal topo-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="inventory_2" size="sm" />
                        <span className="icon-label">Порядок установки доменов</span>
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Что это?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setTopoOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="validation-modal__body">
                    <ModalHelp visible={showHelp}>
                        <HelpSection title="Что это">
                            <HelpText>
                                Модалка строит <strong>порядок установки доменов</strong> —
                                последовательность, в которой их можно безопасно
                                разворачивать. Домен нельзя ставить, пока не установлены
                                все, от кого он зависит. Топологическая сортировка
                                разбивает граф на <strong>уровни</strong>: всё, что на
                                одном уровне, ставится параллельно.
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong>Уровень 1</strong> — фундамент. Доменов,
                                    от которых они зависят, нет (или они не входят в
                                    выбранную область).
                                </li>
                                <li>
                                    <strong>Уровень 2</strong> — зависит только от уровня 1.
                                </li>
                                <li>
                                    <strong>Уровень N</strong> — зависит от уровней 1…N−1.
                                    Всё, что на уровне, можно ставить одновременно.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Область">
                            <HelpList>
                                <li>
                                    <strong>Все домены</strong> — полный граф кэша. Для
                                    реального деплоя — самый честный вариант: увидите
                                    также зависимости от чужих доменов.
                                </li>
                                <li>
                                    <strong>Только видимые</strong> — домены после
                                    текущих фильтров (namespace / теги / поиск).
                                    Зависимости на «скрытые» домены игнорируются.
                                </li>
                                <li>
                                    <strong>Только избранные</strong> — быстрый
                                    прогон по своей подборке.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Учитывать зависимости">
                            <HelpList>
                                <li>
                                    <strong>FQID-ссылки</strong> — атрибуты{" "}
                                    <code>Reference</code>, <code>inherits</code>,
                                    cross-domain <code>extends</code>. Классический
                                    источник «этот домен использует чужую сущность».
                                </li>
                                <li>
                                    <strong>Linkage-связи</strong> — меж-доменные
                                    linkages (обе стороны в разных доменах). Обычно
                                    тоже требуют установки, но иногда это «мягкая»
                                    зависимость: UI не сломается, но связи не будут
                                    открываться. Отключайте, если строите минимальный
                                    план установки.
                                </li>
                                <li>
                                    <strong>Missing-домены как установленные</strong> —
                                    если зависимость указывает на домен, которого нет в
                                    кэше, по умолчанию это ошибка валидации схемы, и
                                    домен не будет установлен на сервере. Галочка «считать
                                    установленными» позволяет построить план для сценария
                                    «missing — это опечатка, поправим позже». Снимите —
                                    увидите проблемные домены в блоке «Разорванные» /
                                    «Требуют ручного вмешательства».
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Автоматически разрывать циклы">
                            <HelpText>
                                Цикл — это когда <code>A</code> зависит от{" "}
                                <code>B</code>, а <code>B</code> — от <code>A</code>.
                                Ни один из них нельзя установить первым, поэтому
                                план без вмешательства построить нельзя.
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong>Галочка включена</strong> — циклы разрешаются
                                    автоматически: выбирается домен с наименьшим числом
                                    зависимостей, «разрывается» одна связь, домен
                                    ставится на текущий уровень. Такие домены помечаются
                                    бейджем <em>«⚠️ цикл разорван»</em> и
                                    «<em>↯N</em>» (отрезанных связей).
                                </li>
                                <li>
                                    <strong>Галочка снята</strong> — домены с циклом
                                    попадают в блок «Требуют ручного вмешательства».
                                    Их надо чинить в схеме — убрать одну из зависимостей
                                    или разнести на два домена.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Исключить домены по маске">
                            <HelpText>
                                Glob-паттерны через запятую, точку с запятой или пробел.
                                Исключённые домены исчезают из плана и из зависимостей
                                других (но зависимости на них остаются как «внешние»
                                и в этом плане не учитываются).
                            </HelpText>
                            <HelpList>
                                <li>
                                    <code>*.settings.*</code> — все домены, где в FQDN
                                    встречается <code>.settings.</code>.
                                </li>
                                <li>
                                    <code>test.*</code> — все тестовые домены.
                                </li>
                                <li>
                                    <code>!prod.*</code> — синтаксис <code>!</code>{" "}
                                    пока поддерживается только в namespace-фильтре, в
                                    маске исключения — только включение.
                                </li>
                            </HelpList>
                            <HelpText>
                                Полезно, когда в кэше лежат чужие домены (сторонние
                                организации, dev-окружения), которые в вашем деплое
                                не участвуют.
                            </HelpText>
                        </HelpSection>

                        <HelpSection title="Как читать результат">
                            <HelpList>
                                <li>
                                    <strong>Уровень 1 / 2 / 3 …</strong> — кликабельные
                                    заголовки. Раскройте, чтобы увидеть список доменов
                                    этого уровня.
                                </li>
                                <li>
                                    <strong>▸ у домена</strong> — раскрывает список{" "}
                                    <em>прямых</em> зависимостей (тех, что на нижних
                                    уровнях). Так удобно проверять «а правда ли он
                                    зависит только от фундамента?».
                                </li>
                                <li>
                                    <strong>📊 N уровней</strong> — общая длина плана.
                                    Большое число (20+) означает «очень много
                                    последовательных шагов», обычно из-за редких
                                    cross-domain-ссылок в самом низу.
                                </li>
                                <li>
                                    <strong>⏱ N шагов</strong> — критический путь:
                                    самый длинный маршрут через уровни. Это минимум
                                    времени, если ставить по одному домену за шаг.
                                </li>
                                <li>
                                    <strong>⚠️ N цикл.</strong> — домены, для которых не
                                    удалось разорвать цикл (только при выключенном
                                    авторазрыве). Их нужно чинить в схеме вручную.
                                </li>
                                <li>
                                    <strong>🔗 N разорвано</strong> — сколько циклов
                                    разрешено автоматически. Это <em>не ошибки</em>,
                                    просто предупреждение: возможно, схему стоит
                                    почистить.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Кнопки внизу">
                            <HelpList>
                                <li>
                                    <strong>🎨 На графе</strong> — закрывает модалку и
                                    подсвечивает каждый узел бейджем <code>L1</code>,{" "}
                                    <code>L2</code>, … Наведите на бейдж — увидите
                                    уровень установки. Удобно для визуального ревью плана.
                                </li>
                                <li>
                                    <strong>📋 Копировать</strong> — план в буфер
                                    обмена (текстом, по уровням). Подходит для вставки
                                    в задачу в трекере.
                                </li>
                                <li>
                                    <strong>💾 JSON</strong> — машинно-читаемый план:
                                    <code>levels[]</code>, <code>broken[]</code>,{" "}
                                    <code>cyclic[]</code>, <code>stats</code>. Для
                                    интеграции с CI-скриптами деплоя.
                                </li>
                                <li>
                                    <strong>📝 MD</strong> — Markdown-отчёт: сводка
                                    + список уровней + разорванные циклы. Открывается
                                    в любом вики/MR.
                                </li>
                                <li>
                                    <strong>← Настройки</strong> — возвращает к форме
                                    (область, галочки, маска), чтобы поправить параметры
                                    без закрытия модалки.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Ограничения">
                            <HelpList>
                                <li>
                                    Только домены, которые есть в кэше и успешно
                                    распарсились. Missing/broken-домены не участвуют в
                                    уровнях.
                                </li>
                                <li>
                                    Cross-domain ссылки на незагруженные домены (когда
                                    зависимости указывают на чужую организацию или
                                    отсутствующий домен) — трактуются по галочке{" "}
                                    <em>«Missing-домены как установленные»</em>.
                                </li>
                                <li>
                                    Учитываются только <strong>прямые</strong> ссылки
                                    (FQID, inherits, cross-domain extends). Транзитивные
                                    связи <code>transitiveLinkages</code> и{" "}
                                    <code>calculation.schemaId</code>{" "}
                                    <strong>не влияют</strong> на порядок: они
                                    рантайм-зависимости, а не build-time.
                                </li>
                            </HelpList>
                        </HelpSection>
                    </ModalHelp>
                    {!result && (
                        <div className="validation-scope">
                            <div className="validation-scope__label">Область</div>
                            {scopeOption('all', 'Все домены', props.allDomains.length)}
                            {scopeOption('visible', 'Только видимые', props.visibleDomains.length)}
                            {scopeOption('bookmarked', 'Только избранные', props.bookmarkedDomains.length)}

                            <div className="validation-scope__label" style={{ marginTop: 16 }}>
                                Учитывать зависимости
                            </div>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    style={{ marginLeft: 8 }}
                                    checked={includeFqid}
                                    onChange={() => setIncludeFqid(!includeFqid)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">FQID-ссылки</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    style={{ marginLeft: 8 }}
                                    checked={includeLinkage}
                                    onChange={() => setIncludeLinkage(!includeLinkage)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Linkage-связи</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    style={{ marginLeft: 8 }}
                                    checked={missingAsSatisfied}
                                    onChange={() => setMissingAsSatisfied(!missingAsSatisfied)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Missing-домены считать установленными</span>
                            </label>
                            <label className="menu__checkbox">
                                <input
                                    type="checkbox"
                                    style={{ marginLeft: 8 }}
                                    checked={autoBreak}
                                    onChange={() => setAutoBreak(!autoBreak)}
                                />
                                <span className="menu__check" />
                                <span className="menu__text">Автоматически разрывать циклы</span>
                            </label>
                            <div className="menu__hint">
                                {autoBreak
                                    ? 'Домены с циклом будут размещены в порядке, а разорванные связи — помечены.'
                                    : 'Домены с циклом попадут в отдельный блок «Требуют ручного вмешательства».'}
                            </div>

                            <div className="validation-scope__label" style={{ marginTop: 16 }}>
                                Исключить домены по маске
                            </div>
                            <input
                                className="menu__input"
                                style={{ margin: 0, width: '100%' }}
                                type="text"
                                placeholder="например: *.settings.*"
                                value={excludePattern}
                                onChange={(e) => setExcludePattern(e.target.value)}
                            />

                            <button
                                className="btn btn--primary"
                                onClick={build}
                                style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
                            >
                                ▶ Построить порядок
                            </button>
                        </div>
                    )}

                    {result && (
                        <div className="topo-result">
                            {(result.cyclic.length > 0 || result.broken.length > 0) && (
                                <div className="topo-cyclic">
                                    {result.cyclic.length > 0 && (
                                        <>
                                            <div className="topo-cyclic__header">
                                                <span className="topo-cyclic__icon">⚠️</span>
                                                <span>Требуют ручного вмешательства — цикл ({result.cyclic.length})</span>
                                            </div>
                                            <div className="topo-cyclic__body">
                                                {result.cyclic.map((id) => (
                                                    <a
                                                        key={id}
                                                        className="validation-log__domain"
                                                        onClick={() => {
                                                            goto(id);
                                                            useGraphStore.getState().setTopoOpen(false);
                                                        }}
                                                    >
                                                        {id}
                                                    </a>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {result.cyclic.length === 0 && result.broken.length > 0 && (
                                        <>
                                            <div className="topo-cyclic__header topo-cyclic__header--broken">
                                                <span className="topo-cyclic__icon">🔗</span>
                                                <span>Циклы разорваны автоматически ({result.broken.length})</span>
                                            </div>
                                            <div className="topo-cyclic__body">
                                                {result.broken.map((b) => (
                                                    <div key={b.id} className="topo-broken-item">
                                                        <a
                                                            className="validation-log__domain"
                                                            onClick={() => {
                                                                goto(b.id);
                                                                useGraphStore.getState().setTopoOpen(false);
                                                            }}
                                                        >
                                                            {b.id}
                                                        </a>
                                                        <span className="topo-broken-item__meta">L{b.level}</span>
                                                        {b.brokenDeps.length > 0 && (
                                                            <span
                                                                className="topo-broken-item__deps"
                                                                title={'Разорваны связи с: ' + b.brokenDeps.join(', ')}
                                                            >
                                                                ↯{b.brokenDeps.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {result.levels.map((level, idx) => {
                                const isOpen = expandedLevels.has(idx);
                                return (
                                    <div
                                        key={idx}
                                        className={'topo-level' + (isOpen ? ' topo-level--open' : '')}
                                    >
                                        <div className="topo-level__header" onClick={() => toggleLevel(idx)}>
                                            <span className="validation-log__chevron">{isOpen ? '▾' : '▸'}</span>
                                            <span className="topo-level__badge">{idx + 1}</span>
                                            <span className="topo-level__title">Уровень {idx + 1}</span>
                                            <span className="topo-level__count">
                                                {level.length}{' '}
                                                {level.length === 1 ? 'домен' : level.length < 5 ? 'домена' : 'доменов'}
                                            </span>
                                        </div>

                                        {isOpen && (
                                            <div className="topo-level__body">
                                                {level.map((id) => {
                                                    const isDepsOpen = expandedDeps.has(id);
                                                    const deps = findDeps(id, result.levelMap, edges, nodes);
                                                    const brokenInfo = result.broken.find((b) => b.id === id);
                                                    return (
                                                        <div
                                                            key={id}
                                                            className={'topo-domain' + (brokenInfo ? ' topo-domain--broken' : '')}
                                                        >
                                                            <div className="topo-domain__head">
                                                                {deps.length > 0 ? (
                                                                    <span
                                                                        className="validation-log__chevron"
                                                                        style={{ cursor: 'pointer' }}
                                                                        onClick={() => toggleDeps(id)}
                                                                    >
                                                                        {isDepsOpen ? '▾' : '▸'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="validation-log__chevron"> </span>
                                                                )}
                                                                <a
                                                                    className="validation-log__domain"
                                                                    onClick={() => {
                                                                        goto(id);
                                                                        useGraphStore.getState().setTopoOpen(false);
                                                                    }}
                                                                >
                                                                    {id}
                                                                </a>
                                                                {brokenInfo && (
                                                                    <span
                                                                        className="topo-broken-badge"
                                                                        title={
                                                                            'Цикл разорван. Отрезаны: ' +
                                                                            brokenInfo.brokenDeps.join(', ')
                                                                        }
                                                                    >
                                                                        ⚠️ цикл разорван
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isDepsOpen && deps.length > 0 && (
                                                                <div className="topo-domain__deps">
                                                                    {deps.map((dep) => (
                                                                        <div key={dep} className="topo-dep">
                                                                            <span className="topo-dep__level">
                                                                                L{result.levelMap.get(dep)}
                                                                            </span>
                                                                            <a
                                                                                className="validation-log__domain"
                                                                                onClick={() => {
                                                                                    goto(dep);
                                                                                    useGraphStore.getState().setTopoOpen(false);
                                                                                }}
                                                                            >
                                                                                {dep}
                                                                            </a>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {result && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat">📦 {result.stats.total}</span>
                            <span className="validation-stat validation-stat--ok">
                                📊 {result.stats.levels} уровней
                            </span>
                            <span className="validation-stat validation-stat--warn">
                                ⏱ {result.stats.criticalPath} шагов
                            </span>
                            {result.stats.brokenCount > 0 && (
                                <span className="validation-stat validation-stat--warn">
                                    🔗 {result.stats.brokenCount} разорвано
                                </span>
                            )}
                            {result.stats.cyclic > 0 && (
                                <span className="validation-stat validation-stat--err">
                                    ⚠️ {result.stats.cyclic} цикл.
                                </span>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            <button
                                className="btn"
                                onClick={() => {
                                    const st = useGraphStore.getState();
                                    st.setTopoLevelMap(result.levelMap);
                                    st.setTopoOpen(false);
                                }}
                            >
                                🎨 На графе
                            </button>
                            <button className="btn" onClick={copyAsText}>
                                📋 Копировать
                            </button>
                            <button className="btn" onClick={exportJSON}>
                                💾 JSON
                            </button>
                            <button className="btn" onClick={exportMD}>
                                📝 MD
                            </button>
                            <button className="btn" onClick={() => setResult(null)}>
                                ← Настройки
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}