import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useNavigation } from "../../hooks/useNavigation";
import {
    buildDependencyGraph,
    topologicalSort,
    detectDependencyCycles,
    transitiveDeps,
    reverseDeps,
} from "../../lib/algorithms/topological";
import { simplePatternMatch } from "../../lib/namespace-filter";
import { MIcon } from "../common";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { alertDialog } from "../../lib/dialogs";

// ============ Types ============

export interface TopoSortModalProps {
    allDomains: Array<{ id: string; domainId: string }>;
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
}

type Scope = "all" | "visible" | "bookmarked";

interface TopoResult {
    levels: string[][];
    cyclic: string[];
    broken: Array<{ id: string; level: number; brokenDeps: string[] }>;
    criticalPath: number;
    levelMap: Map<string, number>;
    levelMapRaw: Map<string, number>;
    stats: {
        total: number;
        levels: number;
        cyclic: number;
        criticalPath: number;
        excluded: number;
        brokenCount: number;
        roots: number;
        leaves: number;
        cycles: string[][];
    };
    deps: Map<string, Set<string>>;
    reverseDeps: Map<string, Set<string>>;
}

type QuickFilter =
    | "all"
    | "cycles"
    | "roots"
    | "leaves"
    | "broken";

const QUICK_FILTERS: Array<{
    id: QuickFilter;
    label: string;
    icon: string;
}> = [
        { id: "all", label: "Все домены", icon: "list" },
        { id: "cycles", label: "Циклы", icon: "cycle" },
        { id: "roots", label: "Стартовые (L1)", icon: "play_arrow" },
        { id: "leaves", label: "Финальные", icon: "last_page" },
        { id: "broken", label: "Разорвано", icon: "link_off" },
    ];

interface DomainDetail {
    domainId: string;
    level: number | null;
    directDeps: string[];
    transitiveDeps: Map<string, number>;
    directDependents: string[];
    inCycle: string[] | null; // список доменов цикла, если есть
    brokenDeps: string[] | null;
}

// ============ Helpers ============

function formatList(arr: string[], max = 5): string {
    if (arr.length === 0) return "—";
    if (arr.length <= max) return arr.join(", ");
    return arr.slice(0, max).join(", ") + ` …и ещё ${arr.length - max}`;
}

// ============ Component ============

export function TopoSortModal(props: TopoSortModalProps) {
    const { goto } = useNavigation();
    const open = useGraphStore((s) => s.topoOpen);
    const nodes = useGraphStore((s) => s.nodes);
    const edges = useGraphStore((s) => s.edges);

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(open, showHelp, setShowHelp);

    // ── Параметры ──
    const [scope, setScope] = useState<Scope>("all");
    const [includeFqid, setIncludeFqid] = useState(true);
    const [includeLinkage, setIncludeLinkage] = useState(true);
    const [missingAsSatisfied, setMissingAsSatisfied] = useState(true);
    const [excludePattern, setExcludePattern] = useState("");
    const [autoBreak, setAutoBreak] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(true);

    // ── Результаты ──
    const [result, setResult] = useState<TopoResult | null>(null);
    const [rebuilding, setRebuilding] = useState(false);

    // ── UI ──
    const [expandedLevels, setExpandedLevels] = useState<Set<number>>(
        new Set([0]),
    );
    const [expandedDomainDeps, setExpandedDomainDeps] = useState<Set<string>>(
        new Set(),
    );
    const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedDomainId, setSelectedDomainId] = useState<string | null>(
        null,
    );

    // ── Пересборка при смене параметров ──
    const buildNow = useCallback(() => {
        const nodeSet =
            scope === "visible"
                ? props.visibleDomains
                : scope === "bookmarked"
                    ? props.bookmarkedDomains
                    : props.allDomains;

        const restrictTo = new Set(nodeSet.map((d) => d.domainId));

        const excludedIds = new Set<string>();
        const tokens = excludePattern
            .replace(/[,;]/g, " ")
            .split(" ")
            .filter((t) => t.length > 0);
        if (tokens.length > 0) {
            nodes.forEach((n) => {
                if (n.data.nodeType !== "domain") return;
                for (const t of tokens) {
                    if (
                        simplePatternMatch(n.data.domainId.toLowerCase(), t.toLowerCase())
                    ) {
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
            restrictTo,
        });

        const sorted = topologicalSort(depGraph, { autoBreakCycles: autoBreak });

        const levelMapRaw = new Map<string, number>();
        sorted.levels.forEach((level, idx) => {
            level.forEach((id) => levelMapRaw.set(id, idx + 1));
        });

        // levelMap — только для «чистых» доменов (не циклических)
        const levelMap = new Map(levelMapRaw);

        // Cycles
        const cyclicSet = new Set(sorted.cyclic);
        const cycles = detectDependencyCycles(depGraph.deps, cyclicSet);

        // Roots / leaves
        let roots = 0;
        let leaves = 0;
        const rev = reverseDeps(depGraph.deps);
        depGraph.domainIds.forEach((id) => {
            const outs = depGraph.deps.get(id) || new Set();
            const ins = rev.get(id) || new Set();
            // Фильтруем только в области видимости
            const outsInScope = Array.from(outs).filter((d) =>
                depGraph.domainIds.has(d),
            );
            const insInScope = Array.from(ins).filter((d) =>
                depGraph.domainIds.has(d),
            );
            if (outsInScope.length === 0) roots++;
            if (insInScope.length === 0) leaves++;
        });

        setResult({
            levels: sorted.levels,
            cyclic: sorted.cyclic,
            broken: sorted.broken,
            criticalPath: sorted.criticalPath,
            levelMap,
            levelMapRaw,
            stats: {
                total: depGraph.domainIds.size,
                levels: sorted.levels.length,
                cyclic: sorted.cyclic.length,
                criticalPath: sorted.criticalPath,
                excluded: excludedIds.size,
                brokenCount: sorted.broken.length,
                roots,
                leaves,
                cycles,
            },
            deps: depGraph.deps,
            reverseDeps: rev,
        });
    }, [
        scope,
        includeFqid,
        includeLinkage,
        missingAsSatisfied,
        excludePattern,
        autoBreak,
        nodes,
        edges,
        props.visibleDomains,
        props.bookmarkedDomains,
        props.allDomains,
    ]);

    // Первый build — при открытии
    const didInitRef = useRef(false);
    useEffect(() => {
        if (!open) {
            didInitRef.current = false;
            return;
        }
        if (didInitRef.current) return;
        didInitRef.current = true;
        setRebuilding(true);
        setTimeout(() => {
            buildNow();
            setRebuilding(false);
            setFiltersOpen(false);
        }, 0);
    }, [open, buildNow]);

    // Авто-перестройка при смене параметров (debounce 300ms)
    useEffect(() => {
        if (!open) return;
        if (!didInitRef.current) return;
        setRebuilding(true);
        const t = setTimeout(() => {
            buildNow();
            setRebuilding(false);
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        scope,
        includeFqid,
        includeLinkage,
        missingAsSatisfied,
        excludePattern,
        autoBreak,
        open,
    ]);

    // ── Детали выбранного домена ──
    const detail: DomainDetail | null = useMemo(() => {
        if (!result || !selectedDomainId) return null;
        const direct = Array.from(result.deps.get(selectedDomainId) || []).filter(
            (d) => result.levelMap.has(d) || result.cyclic.includes(d),
        );
        const rev = result.reverseDeps.get(selectedDomainId) || new Set<string>();
        const directDependents = Array.from(rev).filter(
            (d) => result.levelMap.has(d) || result.cyclic.includes(d),
        );
        const trans = transitiveDeps(selectedDomainId, result.deps, 5);
        // Оставляем только в области
        for (const key of Array.from(trans.keys())) {
            if (!result.levelMap.has(key) && !result.cyclic.includes(key)) {
                trans.delete(key);
            }
        }
        const inCycleGroup = result.stats.cycles.find((c) =>
            c.includes(selectedDomainId),
        );
        const brokenInfo = result.broken.find(
            (b) => b.id === selectedDomainId,
        );
        return {
            domainId: selectedDomainId,
            level: result.levelMap.get(selectedDomainId) ?? null,
            directDeps: direct,
            transitiveDeps: trans,
            directDependents,
            inCycle: inCycleGroup || null,
            brokenDeps: brokenInfo?.brokenDeps || null,
        };
    }, [result, selectedDomainId]);

    // ── Фильтрация уровней ──
    const filteredLevels = useMemo(() => {
        if (!result) return [];

        const search = searchQuery.trim().toLowerCase();
        const filterDomain = (id: string): boolean => {
            if (search) {
                const match = id.toLowerCase().includes(search);
                if (!match) return false;
            }
            if (quickFilter === "roots") {
                return result.levelMap.get(id) === 1;
            }
            if (quickFilter === "leaves") {
                const rev = result.reverseDeps.get(id) || new Set();
                const insInScope = Array.from(rev).filter(
                    (d) => result.levelMap.has(d) || result.cyclic.includes(d),
                );
                return insInScope.length === 0;
            }
            if (quickFilter === "cycles") {
                return false; // cycles показываем отдельно
            }
            if (quickFilter === "broken") {
                return false; // broken показываем отдельно
            }
            return true;
        };

        return result.levels.map((level, idx) => ({
            index: idx,
            domains: level.filter(filterDomain),
            totalInLevel: level.length,
        }));
    }, [result, quickFilter, searchQuery]);

    // ── Детали циклов (для секции) ──
    const cycleDetails = useMemo(() => {
        if (!result) return [] as Array<{
            domains: string[];
            filtered: string[];
        }>;
        if (quickFilter !== "all" && quickFilter !== "cycles") {
            return [] as Array<{ domains: string[]; filtered: string[] }>;
        }
        const search = searchQuery.trim().toLowerCase();
        return result.stats.cycles
            .map((cycle) => ({
                domains: cycle,
                filtered: search
                    ? cycle.filter((d) => d.toLowerCase().includes(search))
                    : cycle,
            }))
            .filter((c) => c.filtered.length > 0);
    }, [result, quickFilter, searchQuery]);

    // ── Детали broken ──
    const brokenDetails = useMemo(() => {
        if (!result) return [];
        if (
            quickFilter !== "all" &&
            quickFilter !== "broken"
        ) {
            return [];
        }
        const search = searchQuery.trim().toLowerCase();
        return result.broken.filter((b) =>
            search ? b.id.toLowerCase().includes(search) : true,
        );
    }, [result, quickFilter, searchQuery]);

    // ── Экспорт ──
    const exportJSON = () => {
        if (!result) return;
        const data = {
            generatedAt: new Date().toISOString(),
            scope,
            options: {
                includeFqid,
                includeLinkage,
                missingAsSatisfied,
                excludePattern,
                autoBreak,
            },
            criticalPath: result.criticalPath,
            stats: result.stats,
            levels: result.levels,
            cycles: result.stats.cycles,
            broken: result.broken,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `topo-sort-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportMD = () => {
        if (!result) return;
        const lines: string[] = [];
        lines.push("# Порядок установки доменов");
        lines.push("");
        lines.push(`_Сгенерировано: ${new Date().toLocaleString("ru-RU")}_`);
        lines.push("");

        lines.push("## Сводка");
        lines.push("");
        lines.push("| Метрика | Значение |");
        lines.push("| --- | ---: |");
        lines.push(`| Всего доменов | ${result.stats.total} |`);
        lines.push(`| Уровней | ${result.stats.levels} |`);
        lines.push(`| Критический путь | ${result.stats.criticalPath} |`);
        lines.push(`| Стартовых (L1) | ${result.stats.roots} |`);
        lines.push(`| Финальных | ${result.stats.leaves} |`);
        lines.push(`| В циклах | ${result.stats.cyclic} |`);
        lines.push(`| Разорванных | ${result.stats.brokenCount} |`);
        if (result.stats.excluded > 0) {
            lines.push(`| Исключено по маске | ${result.stats.excluded} |`);
        }
        lines.push("");

        // Уровни
        result.levels.forEach((level, idx) => {
            lines.push(
                `## Уровень ${idx + 1} — ${level.length} ${level.length === 1 ? "домен" : "доменов"}`,
            );
            lines.push("");
            for (const id of level) {
                const direct = Array.from(result.deps.get(id) || []).filter(
                    (d) => result.levelMap.has(d),
                );
                const rev = result.reverseDeps.get(id) || new Set();
                const directDependents = Array.from(rev).filter(
                    (d) => result.levelMap.has(d),
                );
                const flags: string[] = [];
                if (result.levelMap.get(id) === 1) flags.push("стартовый");
                if (directDependents.length === 0) flags.push("финальный");
                const broke = result.broken.find((b) => b.id === id);
                if (broke) flags.push(`цикл разорван (${broke.brokenDeps.length})`);

                lines.push(
                    `- \`${id}\`${flags.length > 0 ? ` — _${flags.join(", ")}_` : ""}`,
                );
                if (direct.length > 0) {
                    lines.push(`  - зависит от: ${formatList(direct, 8)}`);
                }
            }
            lines.push("");
        });

        // Циклы
        if (result.stats.cycles.length > 0) {
            lines.push("## Циклы (требуют ручного разбора)");
            lines.push("");
            result.stats.cycles.forEach((cycle, idx) => {
                lines.push(`### Цикл ${idx + 1} — ${cycle.length} доменов`);
                lines.push("");
                lines.push(cycle.map((d) => `\`${d}\``).join(" → ") + " →");
                lines.push("");
            });
        }

        // Broken
        if (result.broken.length > 0) {
            lines.push("## Разорванные циклы");
            lines.push("");
            lines.push(
                "_Удалены связи, которые замыкали цикл. Домены установятся, но их зависимость была проигнорирована._",
            );
            lines.push("");
            result.broken.forEach((b) => {
                lines.push(
                    `- \`${b.id}\` (L${b.level}) — отрезано: ${formatList(b.brokenDeps)}`,
                );
            });
            lines.push("");
        }

        const blob = new Blob([lines.join("\n")], {
            type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `topo-sort-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyAsText = async () => {
        if (!result) return;
        const lines: string[] = [];
        result.levels.forEach((level, idx) => {
            lines.push(`# Уровень ${idx + 1}`);
            level.forEach((id) => lines.push(id));
            lines.push("");
        });
        if (result.cyclic.length > 0) {
            lines.push("# Циклические (требуют ручного разбора)");
            result.cyclic.forEach((id) => lines.push(id));
        }
        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            useGraphStore.getState().showSnackbar("План скопирован в буфер");
        } catch {
            /* ignore */
        }
    };

    const showOnGraph = () => {
        if (!result) return;
        const st = useGraphStore.getState();
        st.setTopoLevelMap(result.levelMapRaw);
        st.setTopoOpen(false);
        st.setViewMode("graph");
    };

    const openDomainSchema = (domainId: string) => {
        const st = useGraphStore.getState();
        st.setTopoOpen(false);
        st.setDomainSchemaDomainId(domainId);
        st.setDomainSchemaOpen(true);
    };

    const openInCatalog = (domainId: string) => {
        const st = useGraphStore.getState();
        st.setTopoOpen(false);
        st.setViewMode("graph");
        goto(domainId);
    };

    const toggleLevel = (idx: number) => {
        setExpandedLevels((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    const toggleDomainDeps = (id: string) => {
        setExpandedDomainDeps((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!open) return null;

    const scopeOption = (
        value: Scope,
        label: string,
        count: number,
    ) => (
        <label
            className={
                "validation-scope__option" + (scope === value ? " active" : "")
            }
        >
            <input
                type="radio"
                checked={scope === value}
                onChange={() => setScope(value)}
            />
            <span className="validation-scope__radio" />
            <span className="validation-scope__text">{label}</span>
            <span className="validation-scope__count">{count}</span>
        </label>
    );

    const isEmpty =
        result &&
        result.levels.every((l) => l.length === 0) &&
        result.stats.cycles.length === 0 &&
        result.broken.length === 0;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setTopoOpen(false)}
        >
            <div
                className="help-modal topo-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="inventory_2" size="sm" />
                        <span className="icon-label">Порядок установки доменов</span>
                        {result && (
                            <span className="help-modal__badge">
                                {result.stats.total} доменов · {result.stats.levels} уровней
                            </span>
                        )}
                        {rebuilding && (
                            <span className="help-modal__badge help-modal__badge--saving">
                                ● пересчёт…
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как это читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setTopoOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>


                <div className="topo-body">
                    <ModalHelp visible={showHelp}>
                        <HelpSection title="Что это">
                            <HelpText>
                                Разбивка доменов на <strong>уровни установки</strong> — что
                                устанавливать первым, что последним. Домен нельзя поставить,
                                пока не установлены все, от кого он зависит. Домены на одном
                                уровне можно ставить параллельно.
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong>L1</strong> — стартовые. Ни от кого не зависят (в
                                    выбранной области) или зависят только от доменов вне её.
                                </li>
                                <li>
                                    <strong>L2</strong> — зависят только от L1.
                                </li>
                                <li>
                                    <strong>Ln</strong> — зависят от L1…L(n−1). Внутри уровня —
                                    параллельно.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Критический путь">
                            <HelpText>
                                Самая длинная цепочка зависимостей. Это <strong>минимум
                                    времени</strong>, если ставить по одному домену за шаг. Большое
                                число (20+) означает «очень много последовательных шагов» —
                                обычно из-за редких cross-domain-ссылок в самом низу.
                            </HelpText>
                        </HelpSection>

                        <HelpSection title="Стартовые и финальные">
                            <HelpList>
                                <li>
                                    <strong>Стартовые (L1)</strong> — устанавливать первыми.
                                    Символ <kbd>▶</kbd> в списке домена.
                                </li>
                                <li>
                                    <strong>Финальные</strong> — от них никто не зависит.
                                    Устанавливаются последними. Символ <kbd>⏭</kbd>.
                                </li>
                                <li>
                                    Если домен одновременно стартовый и финальный — это изолят,
                                    ставится в любом порядке.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Область">
                            <HelpList>
                                <li>
                                    <strong>Все домены</strong> — полный граф. Самый честный
                                    вариант для реального деплоя.
                                </li>
                                <li>
                                    <strong>Только видимые</strong> — домены после текущих
                                    фильтров (namespace / теги / поиск). Зависимости на
                                    «скрытые» домены игнорируются.
                                </li>
                                <li>
                                    <strong>Только избранные</strong> — быстрый прогон по
                                    подборке.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Параметры">
                            <HelpList>
                                <li>
                                    <strong>FQID-ссылки</strong> — атрибуты{" "}
                                    <code>Reference</code>, <code>inherits</code>,{" "}
                                    cross-domain <code>extends</code>. Классический источник
                                    «этот домен использует чужую сущность».
                                </li>
                                <li>
                                    <strong>Linkage-связи</strong> — меж-доменные linkages.
                                    Иногда «мягкая» зависимость: UI сломается, но схема
                                    установится. Отключайте, если строите минимальный план.
                                </li>
                                <li>
                                    <strong>Missing-домены как установленные</strong> — если
                                    dependency указывает на домен, которого нет в кэше,
                                    обычно это ошибка валидации: домен не установится. Галочка
                                    позволяет построить план для сценария «missing — опечатка,
                                    поправим позже».
                                </li>
                                <li>
                                    <strong>Автоматически разрывать циклы</strong> — если
                                    включено, циклические домены ставятся в план, с пометкой
                                    «⚠️ цикл разорван». Если выключено — попадают в отдельный
                                    блок «Требует ручного вмешательства».
                                </li>
                                <li>
                                    <strong>Исключить по маске</strong> — glob-паттерны.
                                    <code>test.*</code>, <code>*.settings.*</code>. Полезно,
                                    когда в кэше лежат чужие домены.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Циклы — что делать">
                            <HelpText>
                                Цикл — когда <code>A</code> зависит от <code>B</code>, а{" "}
                                <code>B</code> — от <code>A</code>. Ни один нельзя установить
                                первым. На сервере это всё равно не сработает.
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong>Разорвать в схеме</strong> — убрать одну из
                                    зависимостей. Обычно одна из них — «мягкая» (лишний
                                    Reference, старая linkage).
                                </li>
                                <li>
                                    <strong>Разделить домен</strong> — если A и B плотно
                                    связаны, возможно, они должны быть одним доменом.
                                </li>
                                <li>
                                    <strong>Разрешить авторазрыв</strong> — для тестовых
                                    окружений. Помните, что установка пойдёт «вопреки» одной
                                    зависимости, и её надо будет разобрать вручную.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Быстрые фильтры и поиск">
                            <HelpList>
                                <li>
                                    <strong>Циклы</strong> — только домены в циклах.
                                </li>
                                <li>
                                    <strong>Стартовые / Финальные</strong> — фокус на концах
                                    графа.
                                </li>
                                <li>
                                    <strong>Разорвано</strong> — домены, у которых авторазрыв
                                    отрезал зависимость.
                                </li>
                                <li>
                                    <strong>Поиск</strong> — фильтр по имени домена.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Экспорт">
                            <HelpList>
                                <li>
                                    <strong>MD</strong> — Markdown-отчёт: сводка, все уровни,
                                    обоснование, циклы. Подходит для PR/задачи в трекере.
                                </li>
                                <li>
                                    <strong>JSON</strong> — машинно-читаемо для CI/CD.
                                </li>
                                <li>
                                    <strong>Копировать</strong> — плоский текст по уровням.
                                </li>
                                <li>
                                    <strong>На графе</strong> — подсветить бейджами L1, L2, …
                                    на графе.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Ограничения">
                            <HelpList>
                                <li>
                                    Учитываются только домены в кэше. Missing / broken не
                                    участвуют.
                                </li>
                                <li>
                                    Только прямые ссылки (FQID, inherits, extends). Транзитивные
                                    связи <code>transitiveLinkages</code> и{" "}
                                    <code>calculation.schemaId</code> не влияют — они
                                    рантайм-зависимости, не build-time.
                                </li>
                                <li>
                                    При <code>--refresh</code> план может измениться — новые
                                    cross-domain-ссылки появятся/исчезнут.
                                </li>
                            </HelpList>
                        </HelpSection>
                    </ModalHelp>

                    {!showHelp && (
                        <>
                            {/* ============ Filters (collapsible) ============ */}
                            <div
                                className={
                                    "topo-filters" + (filtersOpen ? "" : " topo-filters--collapsed")
                                }
                            >
                                <button
                                    className="topo-filters__toggle"
                                    onClick={() => setFiltersOpen(!filtersOpen)}
                                >
                                    <MIcon
                                        name={filtersOpen ? "expand_more" : "chevron_right"}
                                        size="sm"
                                    />
                                    <MIcon name="tune" size="sm" />
                                    <span>Параметры</span>
                                    {!filtersOpen && (
                                        <span className="topo-filters__summary">
                                            {scope === "all"
                                                ? "все"
                                                : scope === "visible"
                                                    ? "видимые"
                                                    : "избранные"}
                                            {!includeFqid && " · без FQID"}
                                            {!includeLinkage && " · без linkage"}
                                            {autoBreak && " · авторазрыв"}
                                            {excludePattern && " · маска"}
                                        </span>
                                    )}
                                </button>
                                {filtersOpen && (
                                    <div className="topo-filters__body">
                                        <div className="validation-scope">
                                            <div className="validation-scope__label">Область</div>
                                            {scopeOption("all", "Все домены", props.allDomains.length)}
                                            {scopeOption(
                                                "visible",
                                                "Только видимые",
                                                props.visibleDomains.length,
                                            )}
                                            {scopeOption(
                                                "bookmarked",
                                                "Только избранные",
                                                props.bookmarkedDomains.length,
                                            )}
                                        </div>

                                        <div className="topo-filters__checks">
                                            <div className="validation-scope__label">
                                                Учитывать зависимости
                                            </div>
                                            <label className="menu__checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={includeFqid}
                                                    onChange={() => setIncludeFqid(!includeFqid)}
                                                />
                                                <span className="menu__check" />
                                                <span className="menu__text">FQID-ссылки</span>
                                            </label>
                                            <label className="menu__checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={includeLinkage}
                                                    onChange={() => setIncludeLinkage(!includeLinkage)}
                                                />
                                                <span className="menu__check" />
                                                <span className="menu__text">Linkage-связи</span>
                                            </label>
                                            <label className="menu__checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={missingAsSatisfied}
                                                    onChange={() =>
                                                        setMissingAsSatisfied(!missingAsSatisfied)
                                                    }
                                                />
                                                <span className="menu__check" />
                                                <span className="menu__text">
                                                    Missing-домены считать установленными
                                                </span>
                                            </label>
                                            <label className="menu__checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={autoBreak}
                                                    onChange={() => setAutoBreak(!autoBreak)}
                                                />
                                                <span className="menu__check" />
                                                <span className="menu__text">
                                                    Автоматически разрывать циклы
                                                </span>
                                            </label>
                                        </div>

                                        <div className="topo-filters__mask">
                                            <div className="validation-scope__label">
                                                Исключить домены по маске
                                            </div>
                                            <input
                                                className="menu__input"
                                                type="text"
                                                placeholder="например: *.settings.* test.*"
                                                value={excludePattern}
                                                onChange={(e) => setExcludePattern(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ============ KPI ============ */}
                            {result && (
                                <div className="topo-kpi">
                                    <div className="topo-kpi-card topo-kpi-card--neutral">
                                        <div className="topo-kpi-card__value">
                                            {result.stats.total}
                                        </div>
                                        <div className="topo-kpi-card__label">доменов</div>
                                        {result.stats.excluded > 0 && (
                                            <div className="topo-kpi-card__sub">
                                                {result.stats.excluded} исключено
                                            </div>
                                        )}
                                    </div>
                                    <div className="topo-kpi-card topo-kpi-card--ok">
                                        <div className="topo-kpi-card__value">
                                            {result.stats.levels}
                                        </div>
                                        <div className="topo-kpi-card__label">уровней</div>
                                        <div className="topo-kpi-card__sub">
                                            критический путь: {result.stats.criticalPath}
                                        </div>
                                    </div>
                                    <div
                                        className={
                                            "topo-kpi-card" +
                                            (result.stats.roots > 0
                                                ? " topo-kpi-card--ok"
                                                : " topo-kpi-card--neutral")
                                        }
                                    >
                                        <div className="topo-kpi-card__value">
                                            {result.stats.roots}
                                        </div>
                                        <div className="topo-kpi-card__label">стартовых</div>
                                        <div className="topo-kpi-card__sub">ставить первыми</div>
                                    </div>
                                    <div
                                        className={
                                            "topo-kpi-card" +
                                            (result.stats.leaves > 0
                                                ? " topo-kpi-card--neutral"
                                                : " topo-kpi-card--neutral")
                                        }
                                    >
                                        <div className="topo-kpi-card__value">
                                            {result.stats.leaves}
                                        </div>
                                        <div className="topo-kpi-card__label">финальных</div>
                                        <div className="topo-kpi-card__sub">ставить последними</div>
                                    </div>
                                    {result.stats.cyclic > 0 && (
                                        <div className="topo-kpi-card topo-kpi-card--err">
                                            <div className="topo-kpi-card__value">
                                                {result.stats.cyclic}
                                            </div>
                                            <div className="topo-kpi-card__label">в циклах</div>
                                            <div className="topo-kpi-card__sub">
                                                {result.stats.cycles.length}{" "}
                                                {result.stats.cycles.length === 1 ? "цикл" : "циклов"}
                                            </div>
                                        </div>
                                    )}
                                    {result.stats.brokenCount > 0 && (
                                        <div className="topo-kpi-card topo-kpi-card--warn">
                                            <div className="topo-kpi-card__value">
                                                {result.stats.brokenCount}
                                            </div>
                                            <div className="topo-kpi-card__label">разорвано</div>
                                            <div className="topo-kpi-card__sub">циклы авто-разрыв</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ============ Quick filters + Search ============ */}
                            {result && !isEmpty && (
                                <div className="topo-toolbar">
                                    <div className="topo-quick-filters">
                                        {QUICK_FILTERS.map((f) => {
                                            const active = quickFilter === f.id;
                                            let count = 0;
                                            if (f.id === "all") count = result.stats.total;
                                            else if (f.id === "cycles") count = result.stats.cyclic;
                                            else if (f.id === "roots") count = result.stats.roots;
                                            else if (f.id === "leaves") count = result.stats.leaves;
                                            else if (f.id === "broken")
                                                count = result.stats.brokenCount;

                                            if (f.id !== "all" && !active && count === 0) return null;

                                            return (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    className={
                                                        "health-quick-filter" +
                                                        (active ? " health-quick-filter--active" : "") +
                                                        (f.id === "cycles"
                                                            ? " health-quick-filter--err"
                                                            : f.id === "broken"
                                                                ? " health-quick-filter--warn"
                                                                : "")
                                                    }
                                                    onClick={() => setQuickFilter(f.id)}
                                                >
                                                    <MIcon name={f.icon} size="sm" />
                                                    {f.label}
                                                    <span className="health-quick-filter__count">
                                                        {count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="topo-search">
                                        <MIcon name="search" size="sm" />
                                        <input
                                            type="text"
                                            placeholder="Найти домен…"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            spellCheck={false}
                                        />
                                        {searchQuery && (
                                            <button
                                                className="topo-search__clear"
                                                onClick={() => setSearchQuery("")}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ============ Distribution bar ============ */}
                            {result && !isEmpty && quickFilter === "all" && !searchQuery && (
                                <div className="topo-distribution">
                                    <div className="topo-distribution__title">
                                        Распределение по уровням
                                    </div>
                                    <div className="topo-distribution__bars">
                                        {result.levels.map((level, idx) => {
                                            const maxCount = Math.max(
                                                ...result.levels.map((l) => l.length),
                                                1,
                                            );
                                            const width = (level.length / maxCount) * 100;
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    className="topo-distribution__bar-row"
                                                    onClick={() => {
                                                        setExpandedLevels((prev) => {
                                                            const next = new Set(prev);
                                                            next.add(idx);
                                                            return next;
                                                        });
                                                        const el = document.querySelector(
                                                            `.topo-level[data-level="${idx}"]`,
                                                        ) as HTMLElement | null;
                                                        if (el) {
                                                            el.scrollIntoView({
                                                                behavior: "smooth",
                                                                block: "center",
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <span className="topo-distribution__level-badge">
                                                        L{idx + 1}
                                                    </span>
                                                    <span className="topo-distribution__track">
                                                        <span
                                                            className="topo-distribution__fill"
                                                            style={{ width: `${width}%` }}
                                                        />
                                                    </span>
                                                    <span className="topo-distribution__count">
                                                        {level.length}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ============ Content ============ */}
                            <div className="topo-content">
                                {!result && (
                                    <div className="topo-empty">
                                        <div className="topo-empty__icon">
                                            <MIcon name="inventory_2" size="xl" />
                                        </div>
                                        <div className="topo-empty__title">Построение плана…</div>
                                    </div>
                                )}

                                {result && isEmpty && (
                                    <div className="topo-empty">
                                        <div className="topo-empty__icon">
                                            <MIcon name="check_circle" size="xl" />
                                        </div>
                                        <div className="topo-empty__title">
                                            {searchQuery
                                                ? `Ничего не найдено по «${searchQuery}»`
                                                : "Доменов не осталось после фильтров"}
                                        </div>
                                        {result.stats.excluded > 0 && (
                                            <div className="topo-empty__hint">
                                                {result.stats.excluded} доменов исключено по маске
                                            </div>
                                        )}
                                    </div>
                                )}

                                {result && !isEmpty && (
                                    <div className="topo-result">
                                        {/* ── Уровни ── */}
                                        {filteredLevels.map((level) => {
                                            if (level.domains.length === 0) return null;
                                            const isOpen = expandedLevels.has(level.index);
                                            const filtered = level.domains.length < level.totalInLevel;
                                            return (
                                                <div
                                                    key={level.index}
                                                    className={
                                                        "topo-level" + (isOpen ? " topo-level--open" : "")
                                                    }
                                                    data-level={level.index}
                                                >
                                                    <div
                                                        className="topo-level__header"
                                                        onClick={() => toggleLevel(level.index)}
                                                    >
                                                        <span className="validation-log__chevron">
                                                            {isOpen ? "▾" : "▸"}
                                                        </span>
                                                        <span className="topo-level__badge">
                                                            {level.index + 1}
                                                        </span>
                                                        <span className="topo-level__title">
                                                            Уровень {level.index + 1}
                                                        </span>
                                                        <span className="topo-level__count">
                                                            {level.domains.length}
                                                            {filtered && (
                                                                <span
                                                                    style={{
                                                                        color: "var(--text-500)",
                                                                        marginLeft: 4,
                                                                    }}
                                                                >
                                                                    / {level.totalInLevel}
                                                                </span>
                                                            )}
                                                            {level.domains.length === 1
                                                                ? " домен"
                                                                : level.domains.length < 5
                                                                    ? " домена"
                                                                    : " доменов"}
                                                        </span>
                                                    </div>

                                                    {isOpen && (
                                                        <div className="topo-level__body">
                                                            {level.domains.map((id) => {
                                                                const isDepsOpen =
                                                                    expandedDomainDeps.has(id);
                                                                const directDeps = Array.from(
                                                                    result.deps.get(id) || [],
                                                                ).filter(
                                                                    (d) =>
                                                                        result.levelMap.has(d) ||
                                                                        result.cyclic.includes(d),
                                                                );
                                                                const rev =
                                                                    result.reverseDeps.get(id) || new Set();
                                                                const directDependents = Array.from(rev).filter(
                                                                    (d) =>
                                                                        result.levelMap.has(d) ||
                                                                        result.cyclic.includes(d),
                                                                );
                                                                const brokenInfo = result.broken.find(
                                                                    (b) => b.id === id,
                                                                );
                                                                const isRoot =
                                                                    result.levelMap.get(id) === 1;
                                                                const isLeaf = directDependents.length === 0;
                                                                const isSelected = selectedDomainId === id;

                                                                return (
                                                                    <div
                                                                        key={id}
                                                                        className={
                                                                            "topo-domain" +
                                                                            (brokenInfo
                                                                                ? " topo-domain--broken"
                                                                                : "") +
                                                                            (isSelected
                                                                                ? " topo-domain--selected"
                                                                                : "")
                                                                        }
                                                                    >
                                                                        <div className="topo-domain__head">
                                                                            {directDeps.length > 0 ? (
                                                                                <span
                                                                                    className="validation-log__chevron"
                                                                                    style={{ cursor: "pointer" }}
                                                                                    onClick={() => toggleDomainDeps(id)}
                                                                                >
                                                                                    {isDepsOpen ? "▾" : "▸"}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="validation-log__chevron">
                                                                                    {" "}
                                                                                </span>
                                                                            )}
                                                                            <a
                                                                                className="validation-log__domain"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedDomainId(id);
                                                                                }}
                                                                                title="Показать детали"
                                                                            >
                                                                                {id}
                                                                            </a>
                                                                            {isRoot && (
                                                                                <span
                                                                                    className="topo-domain-badge topo-domain-badge--root"
                                                                                    title="Стартовый домен — устанавливать первым"
                                                                                >
                                                                                    ▶ старт
                                                                                </span>
                                                                            )}
                                                                            {isLeaf && (
                                                                                <span
                                                                                    className="topo-domain-badge topo-domain-badge--leaf"
                                                                                    title="Финальный — никто от него не зависит"
                                                                                >
                                                                                    ⏭ финал
                                                                                </span>
                                                                            )}
                                                                            {brokenInfo && (
                                                                                <span
                                                                                    className="topo-broken-badge"
                                                                                    title={
                                                                                        "Цикл разорван. Отрезаны: " +
                                                                                        brokenInfo.brokenDeps.join(", ")
                                                                                    }
                                                                                >
                                                                                    ⚠️ разрыв
                                                                                </span>
                                                                            )}
                                                                            {directDependents.length > 0 && (
                                                                                <span
                                                                                    className="topo-domain-badge topo-domain-badge--deps"
                                                                                    title={`${directDependents.length} доменов зависят от него`}
                                                                                >
                                                                                    ← {directDependents.length}
                                                                                </span>
                                                                            )}
                                                                            <button
                                                                                className="topo-domain__open-btn"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openDomainSchema(id);
                                                                                }}
                                                                                title="Открыть схему домена"
                                                                            >
                                                                                <MIcon name="menu_book" size="sm" />
                                                                            </button>
                                                                        </div>
                                                                        {isDepsOpen && directDeps.length > 0 && (
                                                                            <div className="topo-domain__deps">
                                                                                {directDeps.map((dep) => (
                                                                                    <div
                                                                                        key={dep}
                                                                                        className="topo-dep"
                                                                                    >
                                                                                        <span className="topo-dep__level">
                                                                                            L{result.levelMap.get(dep) || "?"}
                                                                                        </span>
                                                                                        <a
                                                                                            className="validation-log__domain"
                                                                                            onClick={() =>
                                                                                                setSelectedDomainId(dep)
                                                                                            }
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

                                        {/* ── Циклы ── */}
                                        {cycleDetails.length > 0 && (
                                            <div className="topo-cyclic topo-cyclic--cycles">
                                                <div className="topo-cyclic__header">
                                                    <span className="topo-cyclic__icon">⚠️</span>
                                                    <span>
                                                        Циклы в зависимостях ({cycleDetails.length})
                                                    </span>
                                                    <span className="topo-cyclic__subtitle">
                                                        Требуют ручного разбора — установить в один
                                                        проход нельзя
                                                    </span>
                                                </div>
                                                <div className="topo-cyclic__body">
                                                    {cycleDetails.map((cycle, idx) => (
                                                        <div key={idx} className="topo-cycle-group">
                                                            <div className="topo-cycle-group__title">
                                                                Цикл {idx + 1} · {cycle.domains.length}{" "}
                                                                {cycle.domains.length === 1
                                                                    ? "домен"
                                                                    : cycle.domains.length < 5
                                                                        ? "домена"
                                                                        : "доменов"}
                                                                {cycle.filtered.length !== cycle.domains.length && (
                                                                    <span style={{ color: "var(--text-500)", marginLeft: 6 }}>
                                                                        (показано {cycle.filtered.length})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="topo-cycle-group__chain">
                                                                {cycle.filtered.map((d, i) => (
                                                                    <React.Fragment key={d}>
                                                                        <button
                                                                            className="validation-log__domain topo-cycle-link"
                                                                            onClick={() => setSelectedDomainId(d)}
                                                                        >
                                                                            {d}
                                                                        </button>
                                                                        {i < cycle.filtered.length - 1 && (
                                                                            <span className="topo-cycle-arrow">→</span>
                                                                        )}
                                                                    </React.Fragment>
                                                                ))}
                                                                <span className="topo-cycle-arrow">↺</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Broken ── */}
                                        {brokenDetails.length > 0 && (
                                            <div className="topo-cyclic topo-cyclic--broken">
                                                <div className="topo-cyclic__header topo-cyclic__header--broken">
                                                    <span className="topo-cyclic__icon">🔗</span>
                                                    <span>
                                                        Разорвано авторазрывом ({brokenDetails.length})
                                                    </span>
                                                    <span className="topo-cyclic__subtitle">
                                                        Домены установятся, но одна из зависимостей
                                                        проигнорирована
                                                    </span>
                                                </div>
                                                <div className="topo-cyclic__body">
                                                    {brokenDetails.map((b) => (
                                                        <div
                                                            key={b.id}
                                                            className="topo-broken-item"
                                                        >
                                                            <a
                                                                className="validation-log__domain"
                                                                onClick={() => setSelectedDomainId(b.id)}
                                                            >
                                                                {b.id}
                                                            </a>
                                                            <span className="topo-broken-item__meta">
                                                                L{b.level}
                                                            </span>
                                                            {b.brokenDeps.length > 0 && (
                                                                <span
                                                                    className="topo-broken-item__deps"
                                                                    title={
                                                                        "Отрезаны: " + b.brokenDeps.join(", ")
                                                                    }
                                                                >
                                                                    ↯ {b.brokenDeps.length}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ============ Detail drawer ============ */}
                            {detail && (
                                <div className="topo-detail">
                                    <div className="topo-detail__head">
                                        <MIcon name="info" size="sm" />
                                        <code className="topo-detail__id">{detail.domainId}</code>
                                        {detail.level != null && (
                                            <span className="topo-detail__badge">
                                                L{detail.level} / {result!.stats.levels}
                                            </span>
                                        )}
                                        {detail.inCycle && (
                                            <span className="topo-detail__badge topo-detail__badge--err">
                                                в цикле ({detail.inCycle.length})
                                            </span>
                                        )}
                                        {detail.brokenDeps && (
                                            <span className="topo-detail__badge topo-detail__badge--warn">
                                                разрыв ({detail.brokenDeps.length})
                                            </span>
                                        )}
                                        <button
                                            className="btn"
                                            style={{
                                                marginLeft: "auto",
                                                padding: "3px 10px",
                                                fontSize: 11,
                                            }}
                                            onClick={() => openDomainSchema(detail.domainId)}
                                        >
                                            <MIcon name="menu_book" size="sm" />
                                            Схема
                                        </button>
                                        <button
                                            className="btn"
                                            style={{ padding: "3px 10px", fontSize: 11 }}
                                            onClick={() => openInCatalog(detail.domainId)}
                                        >
                                            <MIcon name="my_location" size="sm" />
                                            На графе
                                        </button>
                                        <button
                                            className="topo-detail__close"
                                            onClick={() => setSelectedDomainId(null)}
                                            title="Закрыть"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <div className="topo-detail__body">
                                        <div className="topo-detail__section">
                                            <div className="topo-detail__section-title">
                                                Прямые зависимости ({detail.directDeps.length})
                                            </div>
                                            {detail.directDeps.length === 0 ? (
                                                <div className="topo-detail__empty">
                                                    Ни от кого не зависит — можно ставить первым
                                                </div>
                                            ) : (
                                                <div className="topo-detail__chips">
                                                    {detail.directDeps.map((d) => (
                                                        <button
                                                            key={d}
                                                            className="topo-detail__chip"
                                                            onClick={() => setSelectedDomainId(d)}
                                                            title={`L${result!.levelMap.get(d) || "?"}`}
                                                        >
                                                            <span className="topo-detail__chip-level">
                                                                L{result!.levelMap.get(d) || "?"}
                                                            </span>
                                                            {d}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="topo-detail__section">
                                            <div className="topo-detail__section-title">
                                                Транзитивные зависимости ({detail.transitiveDeps.size})
                                            </div>
                                            {detail.transitiveDeps.size === 0 ? (
                                                <div className="topo-detail__empty">Нет</div>
                                            ) : (
                                                <div className="topo-detail__chips">
                                                    {Array.from(detail.transitiveDeps.entries())
                                                        .sort((a, b) => a[1] - b[1])
                                                        .slice(0, 20)
                                                        .map(([d, dist]) => (
                                                            <button
                                                                key={d}
                                                                className="topo-detail__chip topo-detail__chip--transitive"
                                                                onClick={() => setSelectedDomainId(d)}
                                                                title={`Через ${dist} ${dist === 1 ? "шаг" : "шагов"}`}
                                                            >
                                                                <span className="topo-detail__chip-level">
                                                                    +{dist}
                                                                </span>
                                                                {d}
                                                            </button>
                                                        ))}
                                                    {detail.transitiveDeps.size > 20 && (
                                                        <span className="topo-detail__more">
                                                            …и ещё {detail.transitiveDeps.size - 20}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="topo-detail__section">
                                            <div className="topo-detail__section-title">
                                                Кто зависит от него ({detail.directDependents.length})
                                            </div>
                                            {detail.directDependents.length === 0 ? (
                                                <div className="topo-detail__empty">
                                                    Никто — конечная точка плана
                                                </div>
                                            ) : (
                                                <div className="topo-detail__chips">
                                                    {detail.directDependents.map((d) => (
                                                        <button
                                                            key={d}
                                                            className="topo-detail__chip topo-detail__chip--dependent"
                                                            onClick={() => setSelectedDomainId(d)}
                                                            title={`L${result!.levelMap.get(d) || "?"}`}
                                                        >
                                                            <span className="topo-detail__chip-level">
                                                                L{result!.levelMap.get(d) || "?"}
                                                            </span>
                                                            {d}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {detail.brokenDeps && (
                                            <div className="topo-detail__section topo-detail__section--warn">
                                                <div className="topo-detail__section-title">
                                                    ⚠️ Разорванные зависимости
                                                </div>
                                                <div className="topo-detail__chips">
                                                    {detail.brokenDeps.map((d) => (
                                                        <span
                                                            key={d}
                                                            className="topo-detail__chip topo-detail__chip--broken"
                                                        >
                                                            {d}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="topo-detail__hint">
                                                    Авторазрыв отрезал эти связи. Домен установится, но
                                                    зависимость проигнорирована — проверьте вручную.
                                                </div>
                                            </div>
                                        )}

                                        {detail.inCycle && (
                                            <div className="topo-detail__section topo-detail__section--err">
                                                <div className="topo-detail__section-title">
                                                    ⚠️ Входит в цикл
                                                </div>
                                                <div className="topo-detail__chips">
                                                    {detail.inCycle.map((d) => (
                                                        <button
                                                            key={d}
                                                            className="topo-detail__chip topo-detail__chip--broken"
                                                            onClick={() => setSelectedDomainId(d)}
                                                        >
                                                            {d}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="topo-detail__hint">
                                                    Цикл нельзя установить в один проход. Разорвите в
                                                    схеме (уберите одну из зависимостей) или включите
                                                    авторазрыв.
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ============ Footer ============ */}
                <div className="topo-footer">
                    <div className="topo-footer__stats">
                        {result && (
                            <>
                                <span>{result.stats.total} доменов</span>
                                <span className="topo-footer__sep">·</span>
                                <span>{result.stats.levels} уровней</span>
                                {result.stats.cyclic > 0 && (
                                    <>
                                        <span className="topo-footer__sep">·</span>
                                        <span style={{ color: "var(--danger)" }}>
                                            {result.stats.cyclic} в циклах
                                        </span>
                                    </>
                                )}
                                {result.stats.brokenCount > 0 && (
                                    <>
                                        <span className="topo-footer__sep">·</span>
                                        <span style={{ color: "var(--warning)" }}>
                                            {result.stats.brokenCount} разорвано
                                        </span>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    <div className="topo-footer__actions">
                        <button
                            className="btn"
                            onClick={showOnGraph}
                            disabled={!result}
                            title="Подсветить уровни бейджами на графе"
                        >
                            <MIcon name="hub" size="sm" />
                            На графе
                        </button>
                        <button
                            className="btn"
                            onClick={copyAsText}
                            disabled={!result}
                        >
                            <MIcon name="content_copy" size="sm" />
                            Копировать
                        </button>
                        <button
                            className="btn"
                            onClick={exportJSON}
                            disabled={!result}
                        >
                            <MIcon name="data_object" size="sm" />
                            JSON
                        </button>
                        <button
                            className="btn"
                            onClick={exportMD}
                            disabled={!result}
                        >
                            <MIcon name="description" size="sm" />
                            MD
                        </button>
                        <button
                            className="btn"
                            onClick={() => useGraphStore.getState().setTopoOpen(false)}
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}