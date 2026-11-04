import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { buildEntityIndex, entityKey } from "../../lib/entities";
import { buildEntityTree, EntityTreeMode } from "../../lib/entities/tree";
import { EntityHierarchyFlow } from "./EntityHierarchyFlow";
import { useModelIndex } from "../../hooks/useModelIndex";
import { MIcon } from "../common";
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from "../common/ModalHelp";
import { useHelpEscape } from "../../hooks/useHelpEscape";
import { openFileInEditor } from "../../lib/open-file";
import { alertDialog } from "../../lib/dialogs";

export interface EntityHierarchyModalProps {
    entities: any[];
}

export function EntityHierarchyModal({ entities }: EntityHierarchyModalProps) {
    const setEntityHierarchyOpen = useGraphStore(
        (s) => s.setEntityHierarchyOpen,
    );
    const entityHierarchyOpen = useGraphStore((s) => s.entityHierarchyOpen);
    const entityHierarchyInitialKey = useGraphStore(
        (s) => s.entityHierarchyInitialKey,
    );
    const nodes = useGraphStore((s) => s.nodes);

    const { index: modelIndex } = useModelIndex();

    const [showHelp, setShowHelp] = useState(false);
    useHelpEscape(entityHierarchyOpen, showHelp, setShowHelp);

    // ── Параметры ──
    const [mode, setMode] = useState<EntityTreeMode>("inherits");
    const [depth, setDepth] = useState(2);
    const [showInheritance, setShowInheritance] = useState(true);
    const [showReferences, setShowReferences] = useState(true);
    const [showLinkages, setShowLinkages] = useState(true);
    const [showSiblings, setShowSiblings] = useState(false);
    const [hideIsolated, setHideIsolated] = useState(true);

    // ── Состояние ──
    const [query, setQuery] = useState("");
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [history, setHistory] = useState<string[]>([]);

    // ── Detail drawer ──
    const [detailOpen, setDetailOpen] = useState(true);

    const open = entityHierarchyOpen;
    const initialKey = entityHierarchyInitialKey;

    const index = useMemo(() => buildEntityIndex(entities), [entities]);

    useEffect(() => {
        if (open && initialKey) {
            setSelectedKey(initialKey);
            setHistory([]);
            setQuery("");
        }
    }, [open, initialKey]);

    useEffect(() => {
        if (!open) {
            setQuery("");
            setSelectedKey(null);
            setHistory([]);
        }
    }, [open]);

    const handleBack = useCallback(() => {
        setHistory((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            setSelectedKey(last);
            return prev.slice(0, -1);
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showHelp) return; // обрабатывается useHelpEscape
                e.preventDefault();
                if (history.length > 0) handleBack();
                else setEntityHierarchyOpen(false);
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [open, history, handleBack, setEntityHierarchyOpen, showHelp]);

    // ── Поиск ──
    const searchResults = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const results: any[] = [];
        entities.forEach((e) => {
            const idMatch = e.entityId.toLowerCase().indexOf(q) !== -1;
            const nameMatch =
                e.name && e.name.toLowerCase().indexOf(q) !== -1;
            if (!idMatch && !nameMatch) return;
            const key = entityKey(e.domainId, e.entityId);
            const hasParents = !!e.inherits;
            const hasChildren = (index.children.get(key) || []).length > 0;
            results.push({
                entity: e,
                key,
                hasParents,
                hasChildren,
                isOrphan: !hasParents && !hasChildren,
                rank:
                    idMatch && e.entityId.toLowerCase().indexOf(q) === 0
                        ? 0
                        : idMatch
                            ? 1
                            : 2,
            });
        });
        return results
            .sort((a, b) => a.rank - b.rank)
            .slice(0, 200);
    }, [query, entities, index]);

    // ── Дерево ──
    const tree = useMemo(() => {
        if (!selectedKey) return null;
        if (!modelIndex) return null;
        return buildEntityTree(selectedKey, index, modelIndex, {
            mode,
            depth,
            showInheritance,
            showReferences,
            showLinkages,
            showSiblings,
            hideIsolated,
        });
    }, [
        selectedKey,
        index,
        modelIndex,
        mode,
        depth,
        showInheritance,
        showReferences,
        showLinkages,
        showSiblings,
        hideIsolated,
    ]);

    const handleSelect = useCallback(
        (node: any) => {
            if (!node || node.missing) return;
            if (node.key === selectedKey) return;
            setHistory((prev) =>
                selectedKey ? prev.concat([selectedKey]) : prev,
            );
            setSelectedKey(node.key);
        },
        [selectedKey],
    );

    const navigateTo = useCallback(
        (key: string) => {
            if (!key || key === selectedKey) return;
            setHistory((prev) =>
                selectedKey ? prev.concat([selectedKey]) : prev,
            );
            setSelectedKey(key);
        },
        [selectedKey],
    );

    // ── Detail текущего узла ──
    const currentEntity = useMemo(() => {
        if (!selectedKey || !modelIndex) return null;
        return modelIndex.entitiesByFqid[selectedKey.toLowerCase()] || null;
    }, [selectedKey, modelIndex]);

    const entityIssuesCount = useMemo(() => {
        if (!currentEntity || !modelIndex) return 0;
        return modelIndex.lint.lintReport.issues.filter(
            (i) =>
                i.entityFqid?.toLowerCase() === currentEntity.fqid.toLowerCase(),
        ).length;
    }, [currentEntity, modelIndex]);

    // ── Экспорт Mermaid (classDiagram) ──
    const handleExportMermaid = () => {
        if (!tree) return;
        const lines: string[] = ["classDiagram"];
        for (const n of tree.nodes) {
            const cls = `E_${n.key.replace(/[^a-z0-9]/gi, "_")}`;
            lines.push(`    class ${cls} {`);
            lines.push(`        <<${n.domainId}>>`);
            lines.push(`        ${n.entityId}`);
            lines.push("    }");
        }
        // Inheritance-рёбра
        for (const e of tree.edges) {
            if (e.kind !== "inheritance") continue;
            const src = `E_${e.source.replace(/[^a-z0-9]/gi, "_")}`;
            const tgt = `E_${e.target.replace(/[^a-z0-9]/gi, "_")}`;
            lines.push(`    ${src} <|-- ${tgt}`);
        }
        // Reference-рёбра
        for (const e of tree.edges) {
            if (e.kind !== "reference") continue;
            const src = `E_${e.source.replace(/[^a-z0-9]/gi, "_")}`;
            const tgt = `E_${e.target.replace(/[^a-z0-9]/gi, "_")}`;
            lines.push(`    ${src} --> ${tgt} : ${e.label || "ref"}`);
        }
        // Linkage-рёбра
        for (const e of tree.edges) {
            if (e.kind !== "linkage") continue;
            const src = `E_${e.source.replace(/[^a-z0-9]/gi, "_")}`;
            const tgt = `E_${e.target.replace(/[^a-z0-9]/gi, "_")}`;
            lines.push(`    ${src} -- ${tgt} : ${e.label || "linkage"}`);
        }
        const blob = new Blob([lines.join("\n")], {
            type: "text/plain;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `inheritance-${selectedKey?.split("/").pop() || "tree"}.mmd`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportJSON = () => {
        if (!tree || !selectedKey) return;
        const data = {
            generatedAt: new Date().toISOString(),
            rootKey: selectedKey,
            mode,
            depth,
            stats: {
                total: tree.nodes.length,
                ancestors: tree.parentKeys.size,
                descendants: tree.childKeys.size,
                siblings: tree.siblingKeys.size,
                cycles: tree.cycles.length,
            },
            nodes: tree.nodes.map((n) => ({
                ...n,
                role: tree.nodeRoles.get(n.key),
            })),
            edges: tree.edges,
            cycles: tree.cycles,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `inheritance-${selectedKey?.split("/").pop() || "tree"}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const openEntityInCatalog = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setEntityHierarchyOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const openYamlForEntity = async (fqid: string, domainId: string) => {
        const node = nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() ===
                domainId.toLowerCase(),
        );
        if (node?.data.filePath) {
            const ok = await openFileInEditor(node.data.filePath, fqid, domainId);
            if (ok) setEntityHierarchyOpen(false);
        } else {
            useGraphStore.getState().showSnackbar("Файл схемы не найден");
        }
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => setEntityHierarchyOpen(false)}
        >
            <div
                className="help-modal entity-hierarchy-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="account_tree" size="sm" />
                        <span className="icon-label">
                            Иерархия наследования сущностей
                        </span>
                        {tree && (
                            <span className="help-modal__badge">
                                {tree.nodes.length} узлов ·{" "}
                                {tree.edges.length} связей
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => setEntityHierarchyOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="entity-hierarchy-body">
                    <ModalHelp
                        visible={showHelp}
                    >
                        <HelpSection title="Что это">
                            <HelpText>
                                Показывает структуру наследования сущностей вокруг
                                выбранной. Три роли узлов:
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong style={{ color: "#a78bfa" }}>Предки</strong> —
                                    сущности, от которых наследует текущая. Они
                                    выше по графу.
                                </li>
                                <li>
                                    <strong style={{ color: "#6366f1" }}>Текущая</strong> —
                                    выделена в центре. От неё строится граф.
                                </li>
                                <li>
                                    <strong style={{ color: "#10b981" }}>Потомки</strong> —
                                    сущности, которые наследуют от текущей.
                                </li>
                                <li>
                                    <strong style={{ color: "#94a3b8" }}>Siblings</strong> —
                                    другие дети того же родителя. Помогают
                                    сравнить структуру (как устроены «соседи»).
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Режимы">
                            <HelpList>
                                <li>
                                    <strong>Наследование</strong> — только
                                    inherits-связи. Стандартная иерархия,
                                    «дерево классов».
                                </li>
                                <li>
                                    <strong>Все связи</strong> — плюс Reference и
                                    linkages. Показывает, как сущность встроена
                                    в модель.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Глубина">
                            <HelpText>
                                Сколько «шагов» от текущей сущности показывать.
                                1 — только прямые соседи. 6 — максимальная
                                разумная. При больших глубинах граф может стать
                                нечитаемым — используйте фильтры.
                            </HelpText>
                        </HelpSection>

                        <HelpSection title="Фильтры">
                            <HelpList>
                                <li>
                                    <strong>Наследование / Reference / Linkage</strong>{" "}
                                    — какие типы связей показывать. В режиме
                                    «Наследование» эти чекбоксы не влияют.
                                </li>
                                <li>
                                    <strong>Siblings</strong> — добавить других
                                    детей родителя текущей сущности. Полезно
                                    для сравнения структуры: например, есть ли
                                    у всех «соседей» общие атрибуты.
                                </li>
                                <li>
                                    <strong>Без связей</strong> — скрыть узлы,
                                    у которых нет ни входящих, ни исходящих
                                    рёбер в графе. Убирает «висячие» сущности.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="KPI сверху">
                            <HelpList>
                                <li>
                                    <strong>Предки</strong> — все, от кого
                                    наследует текущая, по цепочке вверх.
                                </li>
                                <li>
                                    <strong>Потомки</strong> — все, кто
                                    наследует от текущей, по цепочке вниз.
                                </li>
                                <li>
                                    <strong>Siblings</strong> — количество
                                    «соседей» (других детей того же родителя).
                                </li>
                                <li>
                                    <strong>Всего</strong> — узлов в графе с
                                    текущими фильтрами.
                                </li>
                                <li>
                                    <strong>Циклы</strong> — если граф содержит
                                    циклическое наследование. Это ошибка модели —
                                    смотрите список ниже.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Детали сущности">
                            <HelpText>
                                Клик по узлу в графе открывает правую панель:
                                атрибуты, References, наследование, кнопки
                                действий.
                            </HelpText>
                            <HelpList>
                                <li>
                                    <strong>Схема домена</strong> — открыть
                                    полную структуру домена.
                                </li>
                                <li>
                                    <strong>В каталоге</strong> — открыть
                                    сущность в каталоге с impact-анализом.
                                </li>
                                <li>
                                    <strong>YAML</strong> — открыть файл в
                                    редакторе на этой сущности.
                                </li>
                                <li>
                                    <strong>Корень</strong> — перейти к самой
                                    «верхней» сущности в цепочке предков.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Навигация">
                            <HelpList>
                                <li>
                                    <strong>Клик по узлу</strong> — выбрать
                                    сущность, от неё построится новая иерархия.
                                </li>
                                <li>
                                    <strong>Назад</strong> — вернуться к
                                    предыдущей сущности (или Esc, если истории
                                    нет — закрыть модалку).
                                </li>
                                <li>
                                    <strong>Поиск</strong> — фильтр по id и
                                    name. Клик по результату — выбрать.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Экспорт">
                            <HelpList>
                                <li>
                                    <strong>Mermaid</strong> — classDiagram
                                    для вставки в MD / PR / Confluence.
                                </li>
                                <li>
                                    <strong>JSON</strong> — машинно-читаемо:
                                    узлы с ролями, рёбра, циклы, KPI. Для CI
                                    или документации.
                                </li>
                            </HelpList>
                        </HelpSection>

                        <HelpSection title="Циклы">
                            <HelpText>
                                Если в графе есть цикл (A → B → C → A), это
                                ошибка модели: наследование по кругу ломает
                                логику. Модалка подсветит такие узлы красным
                                и покажет цепочку в списке циклов под графом.
                            </HelpText>
                        </HelpSection>

                        <HelpSection title="Ограничения">
                            <HelpList>
                                <li>
                                    Показывает только загруженные сущности.
                                    FQID на другой домен, которого нет в кэше,
                                    — узел «missing».
                                </li>
                                <li>
                                    Вложенные атрибуты Table не участвуют в
                                    графе — только сущности.
                                </li>
                                <li>
                                    На больших иерархиях (200+ узлов) граф
                                    может тормозить — используйте глубину 2–3
                                    и фильтры.
                                </li>
                            </HelpList>
                        </HelpSection>
                    </ModalHelp>

                    {!showHelp && (
                        <>
                            {/* ── Левая панель: поиск и список ── */}
                            <div className="entity-search-panel">
                                <div className="entity-search-input-wrap">
                                    <span className="entity-search-icon">
                                        <MIcon name="search" size="sm" />
                                    </span>
                                    <input
                                        className="entity-search-input"
                                        type="text"
                                        placeholder="Поиск по id или названию…"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                    />
                                </div>

                                {/* Текущая сущность / хлебные крошки */}
                                {tree && selectedKey && (
                                    <div className="entity-hierarchy-breadcrumb">
                                        <button
                                            className="entity-hierarchy-breadcrumb__root"
                                            onClick={() => {
                                                const root =
                                                    tree.ancestorsOrdered[
                                                    tree.ancestorsOrdered
                                                        .length - 1
                                                    ];
                                                if (root) navigateTo(root);
                                            }}
                                            disabled={
                                                tree.ancestorsOrdered.length === 0
                                            }
                                            title={
                                                tree.ancestorsOrdered.length > 0
                                                    ? "Перейти к корню иерархии"
                                                    : "Это и есть корень"
                                            }
                                        >
                                            <MIcon
                                                name="vertical_align_top"
                                                size="sm"
                                            />
                                        </button>
                                        <code className="entity-hierarchy-breadcrumb__id">
                                            {selectedKey.split("/").pop()}
                                        </code>
                                        {tree.ancestorsOrdered.length > 0 && (
                                            <span className="entity-hierarchy-breadcrumb__hint">
                                                ↑ {tree.ancestorsOrdered.length}{" "}
                                                {tree.ancestorsOrdered.length === 1
                                                    ? "предок"
                                                    : "предков"}
                                            </span>
                                        )}
                                    </div>
                                )}

                                <div className="entity-search-results">
                                    {query.trim() === "" ? (
                                        <div className="entity-search-hint">
                                            Всего сущностей: {entities.length}
                                            <br />
                                            <span style={{ fontSize: 11 }}>
                                                Начните вводить для поиска
                                            </span>
                                        </div>
                                    ) : searchResults.length === 0 ? (
                                        <div className="entity-search-hint">
                                            Ничего не найдено
                                        </div>
                                    ) : (
                                        searchResults.map((r) => (
                                            <div
                                                key={r.key}
                                                className={
                                                    "entity-search-item" +
                                                    (r.key === selectedKey
                                                        ? " entity-search-item--active"
                                                        : "") +
                                                    (r.isOrphan
                                                        ? " entity-search-item--orphan"
                                                        : "")
                                                }
                                                onClick={() => {
                                                    setHistory((prev) =>
                                                        selectedKey
                                                            ? prev.concat([
                                                                selectedKey,
                                                            ])
                                                            : prev,
                                                    );
                                                    setSelectedKey(r.key);
                                                }}
                                            >
                                                <div className="entity-search-item__id">
                                                    {r.entity.entityId}
                                                </div>
                                                {r.entity.name &&
                                                    r.entity.name !==
                                                    r.entity.entityId && (
                                                        <div className="entity-search-item__name">
                                                            {r.entity.name}
                                                        </div>
                                                    )}
                                                <div className="entity-search-item__meta">
                                                    <span className="entity-search-item__domain">
                                                        {r.entity.domainId}
                                                    </span>
                                                    {r.isOrphan ? (
                                                        <span className="entity-search-item__badge">
                                                            без иерархии
                                                        </span>
                                                    ) : (
                                                        <span className="entity-search-item__badge entity-search-item__badge--ok">
                                                            {(r.hasParents
                                                                ? "↑"
                                                                : "·") +
                                                                (r.hasChildren
                                                                    ? "↓"
                                                                    : "·")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* ── Правая панель: граф + KPI + циклы ── */}
                            <div className="entity-graph-panel">
                                {!selectedKey ? (
                                    <div className="entity-graph-empty">
                                        <div className="entity-graph-empty__icon">
                                            <MIcon name="account_tree" size="xl" />
                                        </div>
                                        <div className="entity-graph-empty__title">
                                            Выберите сущность слева
                                        </div>
                                        <div className="entity-graph-empty__hint">
                                            Родители сверху, наследники снизу.
                                            Во втором режиме — ещё Reference и
                                            Linkage.
                                        </div>
                                    </div>
                                ) : tree ? (
                                    <>
                                        {/* ── Toolbar ── */}
                                        <div className="entity-hierarchy-toolbar">
                                            {history.length > 0 && (
                                                <button
                                                    className="entity-hierarchy-back"
                                                    onClick={handleBack}
                                                    title="Назад (Esc)"
                                                >
                                                    ← Назад
                                                </button>
                                            )}

                                            <div className="entity-hierarchy-toolbar__modes">
                                                <button
                                                    className={
                                                        "entity-hierarchy-mode" +
                                                        (mode === "inherits"
                                                            ? " active"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        setMode("inherits")
                                                    }
                                                >
                                                    <span
                                                        className="entity-hierarchy-mode__dot"
                                                        style={{
                                                            background: "#a78bfa",
                                                        }}
                                                    />
                                                    Наследование
                                                </button>
                                                <button
                                                    className={
                                                        "entity-hierarchy-mode" +
                                                        (mode === "all"
                                                            ? " active"
                                                            : "")
                                                    }
                                                    onClick={() => setMode("all")}
                                                >
                                                    <span
                                                        className="entity-hierarchy-mode__dot"
                                                        style={{
                                                            background: "#6366f1",
                                                        }}
                                                    />
                                                    Все связи
                                                </button>
                                            </div>

                                            <div className="entity-hierarchy-toolbar__filters">
                                                {mode === "all" && (
                                                    <>
                                                        <label className="entity-hierarchy-filter">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    showInheritance
                                                                }
                                                                onChange={() =>
                                                                    setShowInheritance(
                                                                        !showInheritance,
                                                                    )
                                                                }
                                                            />
                                                            <span
                                                                className="entity-hierarchy-filter__dot"
                                                                style={{
                                                                    background:
                                                                        "#a78bfa",
                                                                }}
                                                            />
                                                            Наслед.
                                                        </label>
                                                        <label className="entity-hierarchy-filter">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    showReferences
                                                                }
                                                                onChange={() =>
                                                                    setShowReferences(
                                                                        !showReferences,
                                                                    )
                                                                }
                                                            />
                                                            <span
                                                                className="entity-hierarchy-filter__dot"
                                                                style={{
                                                                    background:
                                                                        "#6366f1",
                                                                }}
                                                            />
                                                            Reference
                                                        </label>
                                                        <label className="entity-hierarchy-filter">
                                                            <input
                                                                type="checkbox"
                                                                checked={
                                                                    showLinkages
                                                                }
                                                                onChange={() =>
                                                                    setShowLinkages(
                                                                        !showLinkages,
                                                                    )
                                                                }
                                                            />
                                                            <span
                                                                className="entity-hierarchy-filter__dot"
                                                                style={{
                                                                    background:
                                                                        "#10b981",
                                                                }}
                                                            />
                                                            Linkage
                                                        </label>
                                                        <span className="entity-hierarchy-toolbar__sep" />
                                                    </>
                                                )}
                                                <label
                                                    className="entity-hierarchy-filter"
                                                    title="Показать других детей того же родителя"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={showSiblings}
                                                        onChange={() => setShowSiblings(!showSiblings)}
                                                    />
                                                    <span
                                                        className="entity-hierarchy-filter__dot"
                                                        style={{ background: "#94a3b8" }}
                                                    />
                                                    Siblings
                                                    {tree.siblingCandidates.size > 0 && (
                                                        <span className="entity-hierarchy-filter__count">
                                                            {showSiblings
                                                                ? tree.siblingKeys.size
                                                                : tree.siblingCandidates.size}
                                                        </span>
                                                    )}
                                                </label>
                                                <label className="entity-hierarchy-filter">
                                                    <input
                                                        type="checkbox"
                                                        checked={hideIsolated}
                                                        onChange={() =>
                                                            setHideIsolated(
                                                                !hideIsolated,
                                                            )
                                                        }
                                                    />
                                                    Без связей
                                                </label>
                                            </div>

                                            {mode === "all" && (
                                                <div className="entity-hierarchy-toolbar__depth">
                                                    <span>Глубина:</span>
                                                    <input
                                                        type="range"
                                                        min={1}
                                                        max={6}
                                                        value={depth}
                                                        onChange={(e) =>
                                                            setDepth(
                                                                parseInt(
                                                                    e.target.value,
                                                                    10,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                    <span className="entity-hierarchy-depth-value">
                                                        {depth}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="entity-hierarchy-toolbar__actions">
                                                <button
                                                    className="btn btn--icon"
                                                    onClick={handleExportJSON}
                                                    title="Экспорт JSON"
                                                >
                                                    <MIcon
                                                        name="data_object"
                                                        size="sm"
                                                    />
                                                </button>
                                                <button
                                                    className="btn btn--icon"
                                                    onClick={handleExportMermaid}
                                                    title="Экспорт Mermaid classDiagram"
                                                >
                                                    <MIcon
                                                        name="schema"
                                                        size="sm"
                                                    />
                                                </button>
                                                <button
                                                    className={
                                                        "btn btn--icon" +
                                                        (detailOpen ? " active" : "")
                                                    }
                                                    onClick={() =>
                                                        setDetailOpen(!detailOpen)
                                                    }
                                                    title={
                                                        detailOpen
                                                            ? "Скрыть детали"
                                                            : "Показать детали"
                                                    }
                                                >
                                                    <MIcon
                                                        name="info"
                                                        size="sm"
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {/* ── KPI ── */}
                                        <div className="entity-hierarchy-kpi">
                                            <div className="entity-hierarchy-kpi-card entity-hierarchy-kpi-card--ancestor">
                                                <div className="entity-hierarchy-kpi-card__value">
                                                    {tree.ancestorsOrdered.length}
                                                </div>
                                                <div className="entity-hierarchy-kpi-card__label">
                                                    Предков
                                                </div>
                                            </div>
                                            <div className="entity-hierarchy-kpi-card entity-hierarchy-kpi-card--descendant">
                                                <div className="entity-hierarchy-kpi-card__value">
                                                    {tree.childKeys.size}
                                                </div>
                                                <div className="entity-hierarchy-kpi-card__label">
                                                    Потомков
                                                </div>
                                            </div>
                                            <div className="entity-hierarchy-kpi-card entity-hierarchy-kpi-card--sibling">
                                                <div className="entity-hierarchy-kpi-card__value">
                                                    {tree.siblingCandidates.size}
                                                </div>
                                                <div className="entity-hierarchy-kpi-card__label">Siblings</div>
                                            </div>
                                            <div className="entity-hierarchy-kpi-card">
                                                <div className="entity-hierarchy-kpi-card__value">
                                                    {tree.nodes.length}
                                                </div>
                                                <div className="entity-hierarchy-kpi-card__label">
                                                    Всего узлов
                                                </div>
                                            </div>
                                            {tree.cycles.length > 0 && (
                                                <div className="entity-hierarchy-kpi-card entity-hierarchy-kpi-card--err">
                                                    <div className="entity-hierarchy-kpi-card__value">
                                                        {tree.cycles.length}
                                                    </div>
                                                    <div className="entity-hierarchy-kpi-card__label">
                                                        Циклов
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Граф + detail drawer ── */}
                                        <div
                                            className={
                                                "entity-hierarchy-canvas" +
                                                (detailOpen
                                                    ? " entity-hierarchy-canvas--with-detail"
                                                    : "")
                                            }
                                        >
                                            <div className="entity-hierarchy-graph">
                                                <EntityHierarchyFlow
                                                    tree={tree}
                                                    onSelect={handleSelect}
                                                />
                                            </div>

                                            {detailOpen && currentEntity && (
                                                <div className="entity-hierarchy-detail">
                                                    <div className="entity-hierarchy-detail__head">
                                                        <code className="entity-hierarchy-detail__id">
                                                            {currentEntity.entityId}
                                                        </code>
                                                        {currentEntity.name &&
                                                            currentEntity.name !==
                                                            currentEntity.entityId && (
                                                                <span className="entity-hierarchy-detail__name">
                                                                    {
                                                                        currentEntity.name
                                                                    }
                                                                </span>
                                                            )}
                                                    </div>

                                                    <div className="entity-hierarchy-detail__meta">
                                                        <span className="entity-hierarchy-detail__badge">
                                                            {currentEntity.domainId}
                                                        </span>
                                                        {currentEntity.inherits && (
                                                            <button
                                                                className="entity-hierarchy-detail__badge entity-hierarchy-detail__badge--link"
                                                                onClick={() =>
                                                                    navigateTo(
                                                                        currentEntity.inherits!.toLowerCase(),
                                                                    )
                                                                }
                                                            >
                                                                ↳{" "}
                                                                {currentEntity.inherits
                                                                    .split("/")
                                                                    .pop()}
                                                            </button>
                                                        )}
                                                        {currentEntity.attributes
                                                            .length > 0 && (
                                                                <span className="entity-hierarchy-detail__badge">
                                                                    {
                                                                        currentEntity
                                                                            .attributes
                                                                            .length
                                                                    }{" "}
                                                                    атр.
                                                                </span>
                                                            )}
                                                        {entityIssuesCount > 0 && (
                                                            <span className="entity-hierarchy-detail__badge entity-hierarchy-detail__badge--warn">
                                                                ⚠ {entityIssuesCount}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {currentEntity.attributes
                                                        .length > 0 && (
                                                            <div className="entity-hierarchy-detail__section">
                                                                <div className="entity-hierarchy-detail__section-title">
                                                                    Атрибуты (
                                                                    {
                                                                        currentEntity
                                                                            .attributes
                                                                            .length
                                                                    }
                                                                    )
                                                                </div>
                                                                <div className="entity-hierarchy-detail__attrs">
                                                                    {currentEntity.attributes
                                                                        .slice(0, 15)
                                                                        .map((a) => (
                                                                            <div
                                                                                key={
                                                                                    a.id
                                                                                }
                                                                                className="entity-hierarchy-detail__attr"
                                                                            >
                                                                                <code className="entity-hierarchy-detail__attr-id">
                                                                                    {
                                                                                        a.id
                                                                                    }
                                                                                </code>
                                                                                <span className="entity-hierarchy-detail__attr-type">
                                                                                    {
                                                                                        a.dataType
                                                                                    }
                                                                                </span>
                                                                                {a.readonly && (
                                                                                    <span
                                                                                        className="entity-hierarchy-detail__attr-badge"
                                                                                        title="readonly"
                                                                                    >
                                                                                        🔒
                                                                                    </span>
                                                                                )}
                                                                                {a.constraints.includes(
                                                                                    "required",
                                                                                ) && (
                                                                                        <span
                                                                                            className="entity-hierarchy-detail__attr-badge entity-hierarchy-detail__attr-badge--req"
                                                                                            title="required"
                                                                                        >
                                                                                            ★
                                                                                        </span>
                                                                                    )}
                                                                            </div>
                                                                        ))}
                                                                    {currentEntity
                                                                        .attributes
                                                                        .length >
                                                                        15 && (
                                                                            <div className="entity-hierarchy-detail__attr-more">
                                                                                …и ещё{" "}
                                                                                {currentEntity
                                                                                    .attributes
                                                                                    .length -
                                                                                    15}
                                                                            </div>
                                                                        )}
                                                                </div>
                                                            </div>
                                                        )}

                                                    <div className="entity-hierarchy-detail__actions">
                                                        <button
                                                            className="btn btn--primary"
                                                            onClick={() =>
                                                                openEntityInCatalog(
                                                                    currentEntity.fqid,
                                                                )
                                                            }
                                                        >
                                                            <MIcon
                                                                name="menu_book"
                                                                size="sm"
                                                            />
                                                            В каталоге
                                                        </button>
                                                        <button
                                                            className="btn"
                                                            onClick={() =>
                                                                openYamlForEntity(
                                                                    currentEntity.fqid,
                                                                    currentEntity.domainId,
                                                                )
                                                            }
                                                        >
                                                            <MIcon
                                                                name="description"
                                                                size="sm"
                                                            />
                                                            YAML
                                                        </button>
                                                        {tree.ancestorsOrdered
                                                            .length > 0 && (
                                                                <button
                                                                    className="btn"
                                                                    onClick={() =>
                                                                        navigateTo(
                                                                            tree
                                                                                .ancestorsOrdered[
                                                                            tree
                                                                                .ancestorsOrdered
                                                                                .length -
                                                                            1
                                                                            ],
                                                                        )
                                                                    }
                                                                    title="Перейти к корню иерархии"
                                                                >
                                                                    <MIcon
                                                                        name="vertical_align_top"
                                                                        size="sm"
                                                                    />
                                                                    Корень
                                                                </button>
                                                            )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* ── Циклы ── */}
                                        {tree.cycles.length > 0 && (
                                            <div className="entity-hierarchy-cycles">
                                                <div className="entity-hierarchy-cycles__title">
                                                    <MIcon
                                                        name="cycle"
                                                        size="sm"
                                                    />
                                                    Циклы наследования (
                                                    {tree.cycles.length}) —
                                                    ошибка модели
                                                </div>
                                                {tree.cycles.map((cycle, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="entity-hierarchy-cycle"
                                                    >
                                                        {cycle.map((k, i) => (
                                                            <React.Fragment
                                                                key={k}
                                                            >
                                                                <button
                                                                    className="entity-hierarchy-cycle__link"
                                                                    onClick={() =>
                                                                        navigateTo(k)
                                                                    }
                                                                >
                                                                    {k.split(
                                                                        "/",
                                                                    ).pop()}
                                                                </button>
                                                                {i <
                                                                    cycle.length -
                                                                    1 && (
                                                                        <span className="entity-hierarchy-cycle__arrow">
                                                                            →
                                                                        </span>
                                                                    )}
                                                            </React.Fragment>
                                                        ))}
                                                        <span className="entity-hierarchy-cycle__arrow">
                                                            ↺
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </div>
                        </>
                    )}
                </div>

                {!showHelp && (
                    <div className="validation-footer entity-hierarchy-footer">
                        <div className="validation-stats">
                            {tree && (
                                <>
                                    <span className="validation-stat">
                                        🌳 {tree.nodes.length} в графе
                                    </span>
                                    <span className="validation-stat validation-stat--ok">
                                        ↑ {tree.parentKeys.size} предков
                                    </span>
                                    <span className="validation-stat validation-stat--warn">
                                        ↓ {tree.childKeys.size} наследников
                                    </span>
                                    {tree.siblingKeys.size > 0 && (
                                        <span className="validation-stat">
                                            ⚭ {tree.siblingKeys.size} siblings
                                        </span>
                                    )}
                                    {tree.cycles.length > 0 && (
                                        <span className="validation-stat validation-stat--err">
                                            ⚠ {tree.cycles.length} цикл.
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            <button
                                className="btn"
                                onClick={() => setEntityHierarchyOpen(false)}
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}