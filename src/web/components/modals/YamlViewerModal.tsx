import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { useYamlContent, invalidateYamlCache } from '../../hooks/useYamlContent';
import { useMonacoLoader } from '../../hooks/useMonacoLoader';
import { MIcon } from '../common/MIcon';
import { buildLineMap, LineMap, NavNode, SectionBlock, findAttributeInEntity } from '../../lib/yaml/line-map';
import {
    registerMonacoProviders,
    updateProviderContext,
    resetProviderContext,
    applyRqlMarkers,
    applyFqidMarkers,
    applyDataTypeMarkers,
    applyEnumFieldMarkers,
    applyViewRefMarkers,
    applyAttributeMarkers,
    applyUiRuleRefMarkers,
    applyAttributeRefMarkers,
} from '../../lib/monaco/monaco-providers';
import { useNavigation } from '../../hooks/useNavigation';
import { extractExternalRefs, groupExternalRefs, ExternalRefGroup } from '../../lib/yaml/external-refs';
import { YamlViewerHelp } from './YamlViewerHelp';
import { readRemoteInfo } from '../../state/initial';
import { scanRqlInText } from '../../lib/monaco/rql-check';
import { SECTION_LABELS } from '../../lib/consts';
import { YamlSearchPanel, YamlSearchPanelHandle } from "./YamlSearchPanel";
import {
    SearchOptions,
    SearchMatch,
    SearchResult,
    DEFAULT_SEARCH_OPTIONS,
} from "../../lib/yaml/yaml-search";
import yaml from "js-yaml";
import { computeFocus, FocusKind, FocusTarget } from '../../lib/yaml/entity-focus';
import { SYSTEM_ATTRIBUTE_IDS } from '../../../core/analyzer/linter';
import {
    buildRecheckModel,
    recheck,
    type RecheckModel,
} from '../../../core/analyzer/local-recheck';
import { ModelIndex } from '../../../shared/model-types';
import { KNOWN_ACTION_TYPES } from "../../../shared/action-types";

type RightTab = 'issues' | 'refs' | 'backlinks' | 'server';

/**
 * Извлекает значение `version:` с indent 0 (top-level metadata).
 * Вложенные `version:` (если есть в entities/attributes) игнорируются.
 */
function extractTopLevelVersion(text: string | null | undefined): string | null {
    if (!text) return null;
    const lines = text.split("\n");
    for (const line of lines) {
        if (!line.trim()) continue;
        if (/^\s/.test(line)) continue; // не top-level
        const m = line.match(
            /^version\s*:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/,
        );
        if (m) return m[1];
    }
    return null;
}

/**
 * Бампает patch-часть SemVer: `0.0.54` → `0.0.55`.
 * Возвращает null для не-чистых SemVer (с pre-release/build-суффиксом) —
 * такие версии пользователь должен править вручную.
 */
function bumpPatchVersion(v: string): string | null {
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return null;
    const patch = parseInt(m[3], 10) + 1;
    return `${m[1]}.${m[2]}.${patch}`;
}

/**
 * Заменяет top-level `version:` на новое значение, сохраняя отступ,
 * кавычки и trailing-комментарий.
 */
function replaceTopLevelVersion(text: string, newVersion: string): string {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (/^\s/.test(lines[i])) continue; // не top-level
        const m = lines[i].match(
            /^(version\s*:\s*)(["']?)([^"'\s#]+)(["']?)(\s*(?:#.*)?)$/,
        );
        if (m) {
            lines[i] = `${m[1]}${m[2]}${newVersion}${m[4]}${m[5]}`;
            return lines.join("\n");
        }
    }
    return text;
}

export function YamlViewerModal() {
    const { index } = useModelIndex();
    const { ready: monacoReady, error: monacoError } = useMonacoLoader();

    const open = useGraphStore((s) => s.yamlViewerOpen);
    const filePath = useGraphStore((s) => s.yamlViewerFilePath);
    const fqid = useGraphStore((s) => s.yamlViewerFqid);
    const domainId = useGraphStore((s) => s.yamlViewerDomainId);
    const pendingIssue = useGraphStore((s) => s.yamlViewerPendingIssue);
    const setPendingIssue = useGraphStore((s) => s.setYamlViewerPendingIssue);

    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const mode: "local" | "hybrid" | "remote" = !remoteInfo?.server
        ? "local"
        : remoteInfo.mode === "hybrid"
            ? "hybrid"
            : "remote";

    const [reloadKey, setReloadKey] = useState(0);

    const CHECKS_ENABLED_KEY = "dg-yaml-checks-enabled";
    const [checksEnabled, setChecksEnabled] = useState<boolean>(() => {
        try {
            const v = localStorage.getItem(CHECKS_ENABLED_KEY);
            return v === null ? true : v === "true";
        } catch {
            return true;
        }
    });

    const toggleChecks = useCallback(() => {
        setChecksEnabled((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(CHECKS_ENABLED_KEY, String(next));
            } catch { }
            return next;
        });
    }, []);

    useEffect(() => {
        if (open) setReloadKey((k) => k + 1);
    }, [open]);

    const { content: fetchedContent, loading, error: loadError } = useYamlContent(
        open ? filePath : null,
        reloadKey,
        mode === "remote",
    );

    const [content, setContent] = useState('');
    const [yamlSyntaxIssue, setYamlSyntaxIssue] = useState<any>(null);
    // Deferred-версия content для тяжёлых вычислений: не блокирует keystroke'и
    // и Monaco-render. Обновляется в фоне, приоритезируя ввод.
    const deferredContent = useDeferredValue(content);
    const [savedContent, setSavedContent] = useState('');
    const [liveVersion, setLiveVersion] = useState(0);
    const liveDebounce = useRef<any>(null);
    const skipNextEffect = useRef(false);
    const [editorCreated, setEditorCreated] = useState(false);
    const [ignoredVersion, setIgnoredVersion] = useState(0);
    const [diffMode, setDiffMode] = useState(false);
    const [previousContent, setPreviousContent] = useState<string | null>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const diffEditorRef = useRef<any>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [leftWidth, setLeftWidth] = useState(380);
    const isDraggingLeft = useRef(false);
    const decorationsCollection = useRef<any>(null);


    const startResizingLeft = (e: React.MouseEvent) => {
        e.preventDefault();
        isDraggingLeft.current = true;
        document.body.style.cursor = 'col-resize';
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDraggingLeft.current) return;
            // Ограничиваем ширину от 180 до 600 пикселей
            const newWidth = Math.max(180, Math.min(600, e.clientX));
            setLeftWidth(newWidth);
        };
        const onMouseUp = () => {
            if (isDraggingLeft.current) {
                isDraggingLeft.current = false;
                document.body.style.cursor = '';
                if (editorRef.current) {
                    try { editorRef.current.layout(); } catch { }
                }
            }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    useEffect(() => {
        if (!checksEnabled) {
            setYamlSyntaxIssue(null);
            return;
        }
        if (!deferredContent) {
            setYamlSyntaxIssue(null);
            return;
        }
        const t = setTimeout(() => {
            try {
                const textToValidate = deferredContent.replace(/!rql/g, "");
                yaml.load(textToValidate);
                setYamlSyntaxIssue(null);
            } catch (e: any) {
                const errLine =
                    e.mark?.line !== undefined ? e.mark.line + 1 : 1;
                const errCol =
                    e.mark?.column !== undefined ? e.mark.column + 1 : 1;
                const errMsg =
                    e.reason ||
                    e.message.split("\n")[0] ||
                    "Ошибка синтаксиса YAML";
                setYamlSyntaxIssue({
                    ruleId: "yaml-syntax",
                    rule: "Синтаксис YAML",
                    severity: "error" as const,
                    category: "validation",
                    message: errMsg,
                    domainId,
                    line: errLine,
                    column: errCol,
                    propertyPath: "",
                    __clientOnly: true,
                    __key: "yaml-syntax",
                });
            }
        }, 2000);
        return () => clearTimeout(t);
    }, [deferredContent, domainId, checksEnabled]);

    // При загрузке файла — сбросить оба
    useEffect(() => {
        if (loading) return;
        if (fetchedContent === null || fetchedContent === undefined) return;
        setContent(fetchedContent);
        setSavedContent(fetchedContent);
    }, [loading, fetchedContent, filePath]);

    // Слушаем правки в редакторе → debounce → setContent
    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;

        const handler = () => {
            // Если изменение сделали мы программно (при загрузке файла) — игнорируем
            if (isProgrammaticChange.current) return;

            // Авто-разблокировка при редактировании (в т.ч. Quick Fix)
            if (isLockedRef.current) {
                setIsLocked(false);
                useGraphStore.getState().showSnackbar("Файл автоматически разблокирован для применения изменений");
            }

            clearTimeout(liveDebounce.current);
            liveDebounce.current = setTimeout(() => {
                if (editorRef.current) {
                    // skipNextEffect больше не нужен
                    setContent(editorRef.current.getValue());
                    setLiveVersion((v) => v + 1);
                }
            }, 300);
        };

        const sub = editorRef.current.onDidChangeModelContent(handler);
        return () => {
            clearTimeout(liveDebounce.current);
            try { sub?.dispose?.(); } catch { }
        };
    }, [editorCreated]);

    // ============ UI state ============
    const [rightTab, setRightTab] = useState<RightTab>('issues');
    const [showHelp, setShowHelp] = useState(false);
    const [isLocked, setIsLocked] = useState(true);
    const [onlyProblematic, setOnlyProblematic] = useState(false);
    const isDirty = content !== savedContent;
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveStage, setSaveStage] = useState<"idle" | "writing" | "publishing">("idle");
    const [copyFeedback, setCopyFeedback] = useState(false);
    const [saveFeedback, setSaveFeedback] = useState(false);

    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [navQuery, setNavQuery] = useState('');
    const navListRef = useRef<HTMLDivElement>(null);
    const [activeNavIdx, setActiveNavIdx] = useState(-1);

    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(false);
    const [severityFilter, setSeverityFilter] = useState<Set<"error" | "warning" | "info">>(
        new Set(["error", "warning", "info"]),
    );

    const [serverValidation, setServerValidation] = useState<{
        isValid?: boolean;
        diagnostics?: any[];
        error?: string;
        validatedAt?: string;
    } | null>(null);
    const [serverValidating, setServerValidating] = useState(false);
    const [serverAvailable, setServerAvailable] = useState(false);
    const [navTab, setNavTab] = useState<"navigation" | "search">("navigation");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchOptions, setSearchOptions] =
        useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [activeSearchMatch, setActiveSearchMatch] =
        useState<SearchMatch | null>(null);
    const searchPanelRef = useRef<YamlSearchPanelHandle>(null);
    const searchDecorationsRef = useRef<any>(null);
    const [focusIncludeDeps, setFocusIncludeDeps] = useState(false);
    const [navContextMenu, setNavContextMenu] = useState<{
        x: number;
        y: number;
        node: NavNode;
        sectionKey: string;
    } | null>(null);

    const { goto: gotoDomain } = useNavigation();

    // ============ Monaco refs ============
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const saveRef = useRef<() => void>(() => { });
    const toggleLockRef = useRef<() => void>(() => { });
    const isLockedRef = useRef(isLocked);
    const isProgrammaticChange = useRef(false);

    const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
    const focusDecorationsRef = useRef<any>(null);
    const saveAbortRef = useRef<AbortController | null>(null);

    // Синхронизация dirty-state в store — чтобы openFileInEditor мог
    // предупредить о потере изменений перед переключением файла.
    useEffect(() => {
        useGraphStore.getState().setYamlViewerDirty(!!open && isDirty);
    }, [open, isDirty]);

    // Сброс флага при закрытии модалки
    useEffect(() => {
        if (open) return;
        useGraphStore.getState().setYamlViewerDirty(false);
    }, [open]);

    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    // ============ Line map / schema ============
    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const lineMap = useMemo(() => {
        if (!deferredContent || !schema) return null;
        return buildLineMap(deferredContent, schema);
    }, [deferredContent, schema]);

    const currentContext = useMemo(() => {
        if (!lineMap) return null;
        return lineMap.lineContexts.get(cursorLine) || null;
    }, [lineMap, cursorLine]);

    const focusResult = useMemo(() => {
        if (!focusTarget || !lineMap || !index || !domainId) return null;
        try {
            return computeFocus(focusTarget, lineMap, index, domainId, deferredContent, {
                includeTertiary: focusIncludeDeps,
            });
        } catch {
            return null;
        }
    }, [focusTarget, focusIncludeDeps, lineMap, index, domainId, deferredContent]);

    // ============ Issues ============
    const domainIssues = useMemo(() => {
        if (!index || !domainId) return [];
        return index.lint.lintReport.issues.filter((i) => i.domainId === domainId);
    }, [index, domainId]);

    // ============ Счётчики для шапки ============
    const counters = useMemo(() => {
        if (!schema) return null;
        const totalAttrs = schema.sections.entities.items.reduce(
            (s, x) => s + (x.attributesCount || 0),
            0,
        );
        const sonar = domainId
            ? index?.lint?.sonar?.byDomain?.[domainId] || null
            : null;
        return {
            entities: schema.sections.entities.count,
            attributes: totalAttrs,
            linkages: schema.sections.linkages.count,
            views: schema.sections.views.count,
            issues: domainIssues.length,
            sonar,
        };
    }, [schema, domainIssues, index, domainId]);

    // ============ Issues для навигации ============
    const issuesByEntity = useMemo(() => {
        const m = new Map<string, any[]>();
        domainIssues.forEach((issue) => {
            if (!issue.entityFqid) return;
            if (!m.has(issue.entityFqid)) m.set(issue.entityFqid, []);
            m.get(issue.entityFqid)!.push(issue);
        });
        return m;
    }, [domainIssues]);

    const issuesByAttribute = useMemo(() => {
        const m = new Map<string, any[]>();
        domainIssues.forEach((issue) => {
            if (!issue.entityFqid || !issue.attributeId) return;
            const key = `${issue.entityFqid}#${issue.attributeId}`;
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(issue);
        });
        return m;
    }, [domainIssues]);

    // ============ Maps для быстрого получения issues по узлу ============
    const entityIssuesMap = useMemo(() => {
        const m = new Map<string, any[]>();
        domainIssues.forEach((issue) => {
            if (!issue.entityFqid) return;
            const parts = issue.entityFqid.split("/");
            if (parts.length < 2) return;
            const key = parts[1].toLowerCase();
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(issue);
        });
        return m;
    }, [domainIssues]);

    const attrIssuesMap = useMemo(() => {
        const m = new Map<string, any[]>();
        domainIssues.forEach((issue) => {
            if (!issue.attributeId) return;
            const key = issue.attributeId.toLowerCase();
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(issue);
        });
        return m;
    }, [domainIssues]);

    /** Объединённые issues: серверный линтер + клиентский RQL-чек. */
    const allIssues = useMemo(() => {
        if (!checksEnabled) return domainIssues;
        if (!lineMap || !deferredContent || !domainId) return domainIssues;

        const rqlIssues = scanRqlInText(deferredContent, lineMap.lineContexts, index || null);

        const mapped = rqlIssues.map((r, idx) => ({
            ruleId: 'rql-check',
            rule: r.message.length > 60 ? r.message.slice(0, 60) + '…' : r.message,
            severity: r.severity,
            category: 'validation',
            message: r.message,
            domainId,
            line: r.line,
            propertyPath: '',
            __clientOnly: true,
            __key: 'rql-' + idx
        }));

        const combined = [...domainIssues, ...mapped];

        // Добавляем ошибку синтаксиса YAML самой первой
        if (yamlSyntaxIssue) {
            combined.unshift(yamlSyntaxIssue as any);
        }

        return combined;
    }, [domainIssues, lineMap, deferredContent, index, domainId, yamlSyntaxIssue, checksEnabled]);

    const recheckModel: RecheckModel = useMemo(
        () => buildRecheckModel(deferredContent || ""),
        [deferredContent],
    );

    const effectiveIssues = useMemo(() => {
        if (!checksEnabled) return allIssues;
        if (!isDirty || !lineMap) return allIssues;
        if (deferredContent === savedContent) return allIssues;
        const out: any[] = [];
        for (const issue of allIssues) {
            const state = classifyIssue(
                issue,
                deferredContent,
                lineMap,
                recheckModel,
                index,
            );
            if (state === "resolved") continue;
            if (state === "unknown") out.push({ ...issue, __isUnknown: true });
            else out.push(issue);
        }
        return out;
    }, [allIssues, isDirty, deferredContent, lineMap, savedContent, recheckModel, index]);

    const filteredIssues = useMemo(
        () => effectiveIssues.filter((i: any) => severityFilter.has(i.severity)),
        [effectiveIssues, severityFilter],
    );

    const backlinks = useMemo(() => {
        if (rightTab !== "backlinks" || !deferredContent) {
            return { entity: [], attribute: [], target: null };
        }

        if (!deferredContent) return { entity: [] as Backlink[], attribute: [] as Backlink[], target: null as CursorTarget | null };
        const lines = deferredContent.split("\n");
        const target = detectCursorTarget(lines, cursorLine);
        if (!target) return { entity: [], attribute: [], target };

        const entity: Backlink[] = [];
        const attribute: Backlink[] = [];

        if (target.type === "entity" && target.id) {
            entity.push(...resolveEntityBacklinks(lines, target.id));
        } else if (target.type === "attribute" && target.id && target.parentId) {
            entity.push(...resolveEntityBacklinks(lines, target.parentId));
            attribute.push(...resolveAttributeBacklinks(lines, target.parentId, target.id));
        }

        return { entity, attribute, target };
    }, [deferredContent, cursorLine, rightTab]);

    const externalRefs = useMemo(() => {
        if (!deferredContent || !domainId) return { refs: [], groups: [] as ExternalRefGroup[] };
        const refs = extractExternalRefs(deferredContent, domainId);
        return { refs, groups: groupExternalRefs(refs) };
    }, [deferredContent, domainId, liveVersion]);

    const scenarioRefs = useMemo(() => {
        if (!deferredContent) return [] as Array<{
            scenarioId: string;
            actions: Array<{
                line: number;
                scenarioId: string;
                actionId: string;
                actionName: string;
                workerTag?: string;
            }>;
        }>;
        const lines = deferredContent.split("\n");
        const result: Array<{
            line: number;
            scenarioId: string;
            actionId: string;
            actionName: string;
            workerTag?: string;
        }> = [];

        let inActions = false;
        let currentAction: { id: string; name: string; type?: string; line: number } | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const sectionM = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            if (sectionM) {
                inActions = sectionM[1] === "actions";
                currentAction = null;
                continue;
            }
            if (!inActions) continue;

            const idm = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
            if (idm) {
                currentAction = {
                    id: idm[1].replace(/["']/g, ""),
                    name: idm[1],
                    line: i + 1,
                };
                continue;
            }
            if (!currentAction) continue;

            const nameM = line.match(/^\s*name\s*:\s*([^\n#]+)/);
            if (nameM) currentAction.name = nameM[1].trim();

            const typeM = line.match(/^\s*type\s*:\s*([^\s#]+)/);
            if (typeM) currentAction.type = typeM[1].replace(/["']/g, "");

            const scenarioM = line.match(/^\s*scenario\s*:\s*([^\s#]+)/);
            if (scenarioM && currentAction.type === "scenario") {
                const scenarioId = scenarioM[1].replace(/["']/g, "");
                const workerM = lines
                    .slice(i + 1, Math.min(i + 8, lines.length))
                    .map((l) => l.match(/^\s*workerTag\s*:\s*([^\s#]+)/))
                    .find(Boolean);
                result.push({
                    line: i + 1,
                    scenarioId,
                    actionId: currentAction.id,
                    actionName: currentAction.name,
                    workerTag: workerM ? workerM[1].replace(/["']/g, "") : undefined,
                });
            }
        }

        // Группировка по scenarioId
        const grouped = new Map<string, typeof result>();
        for (const r of result) {
            if (!grouped.has(r.scenarioId)) grouped.set(r.scenarioId, []);
            grouped.get(r.scenarioId)!.push(r);
        }

        return Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([scenarioId, actions]) => ({ scenarioId, actions }));
    }, [deferredContent]);

    // ============ Flat nav nodes ============
    const flatNavNodes = useMemo(() => {
        if (!lineMap) return [];
        const result: Array<{
            key: string;
            label: string;
            line: number;
            depth: number;
            sectionKey: string;
            hasChildren: boolean;
            expanded: boolean;
            node: NavNode;
            hasIssues: boolean;
            issuesPreview: string;
        }> = [];
        const walk = (node: NavNode, sectionKey: string, depth: number) => {
            const key = sectionKey + '#' + node.id;
            const hasChildren = !!node.children && node.children.length > 0;
            const expanded = expandedNodes.has(key);

            let hasIssues = false;
            let issuesPreview = "";
            if (sectionKey === "entities") {
                const list =
                    depth === 0
                        ? entityIssuesMap.get(node.id.toLowerCase())
                        : attrIssuesMap.get(node.id.toLowerCase());
                hasIssues = !!list && list.length > 0;
                issuesPreview = buildIssuesPreview(list);
            }

            result.push({
                key,
                label: node.id,
                line: node.line,
                depth,
                sectionKey,
                hasChildren,
                expanded,
                node,
                hasIssues,
                issuesPreview
            });

            if (hasChildren && expanded) {
                node.children!.forEach((child) => walk(child, key, depth + 1));
            }
        };
        lineMap.sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key, 0)));
        return result;
    }, [lineMap, expandedNodes, entityIssuesMap, attrIssuesMap]);

    const filteredNavNodes = useMemo(() => {
        let result = flatNavNodes;
        if (onlyProblematic) {
            result = result.filter((n) => n.hasIssues);
        }
        const q = navQuery.trim().toLowerCase();
        if (q) {
            result = result.filter((n) => n.label.toLowerCase().indexOf(q) !== -1);
        }
        return result;
    }, [flatNavNodes, navQuery, onlyProblematic]);

    // ============ Monaco: create ============
    useEffect(() => {
        if (!open) return;
        if (!monacoReady) return;
        if (loading) return;
        if (!filePath) return;
        if (!fetchedContent) return;
        if (!containerRef.current) return;
        if (editorRef.current) return;

        const m = (window as any).monaco;
        if (!m || !m.editor) return;

        try {
            registerMonacoProviders(m);
        } catch (err) {
            console.error('[monaco] providers registration failed', err);
        }

        try {
            m.editor.defineTheme('dg-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#0d1424',
                    'editor.foreground': '#e2e8f0',
                    'editorLineNumber.foreground': '#475569',
                    'editorLineNumber.activeForeground': '#94a3b8',

                    // === Цвета для автокомплита (Suggest Widget) ===
                    'editorSuggestWidget.background': '#111827',
                    'editorSuggestWidget.foreground': '#e2e8f0',
                    'editorSuggestWidget.selectedBackground': '#1e293b',
                    'editorSuggestWidget.highlightForeground': '#818cf8',
                    'editorSuggestWidget.border': '#334155',
                    'editorSuggestWidget.selectedForeground': '#f1f5f9',
                    'editorSuggestWidget.focusHighlightForeground': '#a78bfa',
                }
            });
        } catch { }

        let editor: any = null;
        let ro: ResizeObserver | null = null;
        const layouts: ReturnType<typeof setTimeout>[] = [];
        let cursorTimer: ReturnType<typeof setTimeout> | null = null;
        let suggestTimer: ReturnType<typeof setTimeout> | null = null;

        try {
            editor = m.editor.create(containerRef.current, {
                value: fetchedContent,
                language: 'yaml',
                theme: 'dg-dark',
                readOnly: false,
                glyphMargin: true,
                automaticLayout: false,
                fontSize: 13,
                minimap: { enabled: false },
                overviewRulerLanes: 0,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                folding: true,
                breadcrumbs: { enabled: true },
                fontFamily: 'JetBrains Mono, SF Mono, Monaco, monospace',
                renderWhitespace: 'selection',
                wordWrap: 'off',
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                occurrencesHighlight: 'off',
                selectionHighlight: false,
                renderValidationDecorations: 'on',
                lightbulb: { enabled: 'on' },
                wordBasedSuggestions: false as any,
                suggest: {
                    showWords: false,
                    showSnippets: false,
                    showMethods: false,
                    showFunctions: false,
                    filterGraceful: false as any,
                    preview: true as any,
                    showDetails: true as any,
                    showInlineDetails: true as any,
                    showStatusBar: false as any,
                } as any,

                quickSuggestions: false,
                suggestOnTriggerCharacters: true,
            }, {
                storageService: {
                    get: () => null,
                    getBoolean: (key: string) => {
                        // Если ключ совпадает, возвращаем true, чтобы панель была раскрыта
                        return key === 'expandSuggestionDocs' ? true : false;
                    },
                    getNumber: () => 0,
                    store: () => { },
                    onDidChangeStorage: () => ({ dispose: () => { } }),
                    onWillSaveState: () => ({ dispose: () => { } }),
                } as any, // Приводим к any, чтобы не реализовывать все методы интерфейса
            });
            editorRef.current = editor;
            setTimeout(() => {
                const suggestController = editor.getContribution('editor.contrib.suggestController');
                if (suggestController && suggestController.widget) {
                    const suggestWidget = suggestController.widget.value;
                    if (suggestWidget && typeof suggestWidget._setDetailsVisible === 'function') {
                        suggestWidget._setDetailsVisible(true);
                    }
                }
            }, 50);
            setContent(fetchedContent);
            setSavedContent(fetchedContent);
            setEditorCreated(true);

            // Многократный layout — Monaco должен узнать свою реальную высоту
            // после того, как toolbar и соседние панели отрендерились
            const forceLayout = () => {
                if (!editorRef.current) return;
                try { editorRef.current.layout(); } catch { }
            };
            setTimeout(forceLayout, 0);
            setTimeout(forceLayout, 50);
            setTimeout(forceLayout, 150);
            setTimeout(forceLayout, 400);
            setTimeout(forceLayout, 1000);

            // Пересчитываем после загрузки Material Symbols (иконки в тулбаре меняют высоту)
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(() => {
                    if (editorRef.current) {
                        try { editorRef.current.layout(); } catch { }
                    }
                });
            }

            // Блокируем ввод, если файл заблокирован
            editor.onKeyDown((e: any) => {
                if (!isLockedRef.current) return;

                // Разрешаем навигацию, Escape, Tab, Shift и модификаторы.
                // Shift нужен, чтобы двойной Shift → разблокировка не показывал
                // тост «Файл заблокирован»: слушатель двойного Shift висит на
                // document (capture) и перехватывает раньше, но Monaco не должен
                // сам по себе реагировать на Shift как на «попытку ввода».
                const navKeys = [
                    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                    'PageUp', 'PageDown', 'Home', 'End',
                    'Escape', 'Tab',
                    'Shift', 'Control', 'Alt', 'Meta',
                ];
                if (navKeys.includes(e.browserEvent.key)) return;

                // Разрешаем системные шорткаты (Ctrl+C, Ctrl+F, Ctrl+S, Ctrl+Z, Alt+...)
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                // Блокируем ввод (буквы, Backspace, Delete, Enter)
                e.preventDefault();
                e.stopPropagation();
                useGraphStore.getState().showSnackbar("Файл заблокирован. Нажмите 🔒 для редактирования.");
            });

            editor.onDidPaste(() => {
                if (!isLockedRef.current) return;
                isProgrammaticChange.current = true; // Чтобы не триггерить авто-разблокировку
                editor.trigger('locked', 'undo', null);
                isProgrammaticChange.current = false;
                useGraphStore.getState().showSnackbar("Вставка в заблокированный файл запрещена.");
            });

            editor.onDidChangeCursorPosition((e: any) => {
                if (cursorTimer) clearTimeout(cursorTimer);
                const line = e.position.lineNumber;
                cursorTimer = setTimeout(() => setCursorLine(line), 120);
            });

            // ============ Auto-suggest при наборе ============
            // quickSuggestions отключён — для custom YAML-провайдера Monaco
            // не открывает suggest на обычных буквах. Триггерим вручную.
            // Guard `.suggest-widget.visible` — если виджет уже открыт,
            // Monaco сам фильтрует по введённому символу.

            const isSuggestOpen = (): boolean => {
                const el = document.querySelector(
                    ".suggest-widget",
                ) as HTMLElement | null;
                if (!el) return false;
                return el.offsetParent !== null && el.style.display !== "none";
            };

            editor.onDidType((text: string) => {
                if (!text) return;
                if (isSuggestOpen()) return;

                const isTriggerChar = /^[:.\/\s-]$/.test(text);
                const isWordChar = /^[\w\u0400-\u04FF]$/.test(text);
                if (!isTriggerChar && !isWordChar) return;

                if (suggestTimer) clearTimeout(suggestTimer);
                suggestTimer = setTimeout(
                    () => {
                        if (!editorRef.current) return;
                        if (isSuggestOpen()) return;

                        const pos = editorRef.current.getPosition();
                        const model = editorRef.current.getModel();
                        if (!pos || !model) return;

                        const lineText = model.getLineContent(pos.lineNumber);
                        const before = lineText.slice(0, pos.column - 1);

                        // Игнорируем комментарии, RQL-теги и содержимое block scalar
                        if (/^\s*#/.test(before)) return;
                        if (/^\s*!rql\b/.test(before)) return;
                        if (/^\s*[|>][+\-]?\s*$/.test(before)) return;

                        // Контексты, где suggest осмыслен:
                        //   `key: <cursor>`                 — значение (dataType, type, attribute, ...)
                        //   `key: val<cursor>`              — дорисовываем значение
                        //   `- <cursor>`                    — элемент списка (`- id:`)
                        //   `- key: <cursor>`               — поле объекта внутри списка
                        //   `<indent><word>`                — field-name в объекте (`      na|` → name) ← ГЛАВНОЕ
                        //   `<indent>- <word>`              — field-name в списке
                        const inValue = /:\s*[^\s#]*$/.test(before);
                        const inListItem = /^\s*-\s*[\w.]*$/.test(before);
                        const inItemField = /^\s*-\s+\w+\s*:\s*[^\s#]*$/.test(
                            before,
                        );
                        const inFieldName = /^\s+[\w.]*$/.test(before);

                        if (
                            inValue ||
                            inListItem ||
                            inItemField ||
                            inFieldName
                        ) {
                            editorRef.current.trigger(
                                "yaml-viewer",
                                "editor.action.triggerSuggest",
                                {},
                            );
                        }
                    },
                    isTriggerChar ? 50 : 220,
                );
            });

            setTimeout(() => {
                if (!editorRef.current) return;
                try {
                    if (isLocked) {
                        editorRef.current.updateOptions({ readOnly: false });
                        editorRef.current.updateOptions({ readOnly: true });
                    }
                } catch { }
            }, 500);

            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 0));
            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 100));
            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 350));

            if (containerRef.current) {
                let roTimer: any = null;
                ro = new ResizeObserver(() => {
                    clearTimeout(roTimer);
                    roTimer = setTimeout(() => {
                        try { editor?.layout(); } catch { }
                    }, 10);
                });
                ro.observe(containerRef.current);
            }
        } catch (e) {
            console.error('[yaml-viewer] create failed', e);
        }

        return () => {
            layouts.forEach(clearTimeout);
            if (cursorTimer) clearTimeout(cursorTimer);
            if (suggestTimer) clearTimeout(suggestTimer);
            try { ro?.disconnect(); } catch { }
            try { editor?.dispose(); } catch { }
            if (editorRef.current === editor) {
                editorRef.current = null;
                setEditorCreated(false);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, monacoReady, filePath, loading, fetchedContent]);

    useEffect(() => {
        if (!editorRef.current) return;
        const t = setTimeout(() => {
            try { editorRef.current?.layout(); } catch { }
        }, 250); // 250мс — совпадает с длительностью CSS-анимации
        return () => clearTimeout(t);
    }, [leftCollapsed, rightCollapsed]);

    // ============ Ctrl+S ============
    useEffect(() => {
        saveRef.current = handleSave;
        toggleLockRef.current = handleToggleLock;
    });

    // Двойной Shift → переключение режима редактирования.
    // ВАЖНО: capture: true — иначе Monaco (при фокусе в редакторе) делает
    // stopPropagation в своём onKeyDown, и событие не доходит до document.
    useEffect(() => {
        if (!open) return;

        let lastShiftRelease = 0;
        let pendingShiftDown = 0;
        let hadOtherKey = false;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.altKey || e.metaKey) {
                if (pendingShiftDown > 0) hadOtherKey = true;
                return;
            }
            if (e.key === "Shift") {
                if (lastShiftRelease > 0 && Date.now() - lastShiftRelease < 400) {
                    pendingShiftDown = Date.now();
                    hadOtherKey = false;
                }
            } else if (pendingShiftDown > 0) {
                hadOtherKey = true;
            }
        };

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === "Shift" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (pendingShiftDown > 0 && !hadOtherKey) {
                    pendingShiftDown = 0;
                    lastShiftRelease = 0;
                    toggleLockRef.current();
                    return;
                }
                pendingShiftDown = 0;
                lastShiftRelease = Date.now();
            }
        };

        // capture: true — срабатывает РАНЬШЕ Monaco
        document.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("keyup", onKeyUp, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            document.removeEventListener("keyup", onKeyUp, true);
        };
    }, [open]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;
        const id = editorRef.current.addCommand(
            m.KeyMod.CtrlCmd | m.KeyCode.KeyS,
            () => saveRef.current()
        );
        return () => {
            // Monaco не всегда отдаёт dispose — очистим при dispose редактора
        };
    }, [editorCreated]);

    // ============ Provider context ============
    useEffect(() => {
        if (!monacoReady) return;
        updateProviderContext({
            lineMap: lineMap || null,
            currentFilePath: filePath,
            currentDomainId: domainId,
            modelIndex: index || null
        });
    }, [monacoReady, lineMap, filePath, domainId, index]);

    useEffect(() => {
        if (open) return;
        resetProviderContext();
    }, [open]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;
        const ed = editorRef.current;

        // очищаем старые
        if (searchDecorationsRef.current) {
            try { searchDecorationsRef.current.clear(); } catch { }
            searchDecorationsRef.current = null;
        }

        if (!searchResult || searchResult.groups.length === 0) return;

        const decorations: any[] = [];
        for (const g of searchResult.groups) {
            for (const match of g.matches) {
                const isActive =
                    activeSearchMatch !== null &&
                    activeSearchMatch.line === match.line &&
                    activeSearchMatch.column === match.column &&
                    activeSearchMatch.length === match.length;
                decorations.push({
                    range: new m.Range(
                        match.line,
                        match.column,
                        match.line,
                        match.column + match.length,
                    ),
                    options: {
                        inlineClassName: isActive
                            ? "yaml-search-match-active"
                            : "yaml-search-match",
                        overviewRuler: {
                            color: isActive ? "#fbbf24" : "#f59e0b",
                            position: m.editor.OverviewRulerLane.Center,
                        },
                    },
                });
            }
        }

        try {
            searchDecorationsRef.current = ed.createDecorationsCollection(decorations);
        } catch {
            // createDecorationsCollection есть в Monaco ≥ 0.34; для более старых —
            // fallback через deltaDecorations, если понадобится.
        }

        return () => {
            if (searchDecorationsRef.current) {
                try { searchDecorationsRef.current.clear(); } catch { }
                searchDecorationsRef.current = null;
            }
        };
    }, [monacoReady, editorCreated, searchResult, activeSearchMatch]);

    // ============ Consolidated markers: FQID + dataType + enum ============
    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        if (!index || !domainId) return;
        const m = (window as any).monaco;
        if (!m) return;

        if (!checksEnabled) {
            const model = editorRef.current.getModel();
            if (model) {
                const sources = [
                    "fqid-validator",
                    "dataType-validator",
                    "enum-validator",
                    "view-ref-validator",
                    "attribute-validator",
                    "ui-rule-validator",
                    "attribute-ref-validator",
                    "rql-check",
                ];
                for (const src of sources) {
                    try { m.editor.setModelMarkers(model, src, []); } catch { }
                }
            }
            return;
        }

        let timer: any = null;

        const runAll = () => {
            if (!editorRef.current) return;
            const model = editorRef.current.getModel();
            if (!model) return;
            try { applyFqidMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyDataTypeMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyEnumFieldMarkers(m, model); } catch { /* ignore */ }
            try { applyViewRefMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyAttributeMarkers(m, model); } catch { /* ignore */ }
            try { applyUiRuleRefMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyAttributeRefMarkers(m, model); } catch { /* ignore */ }
            try { applyRqlMarkers(m, model); } catch { /* ignore */ }
            requestAnimationFrame(() => {
                if (!editorRef.current) return;
                try { editorRef.current.layout(); } catch { }
            });
        };

        const schedule = () => {
            if (timer) clearTimeout(timer);
            // 800ms — комфортно для пользователя: маркеры обновляются
            // только когда он остановился и читает ошибку, а не во время печати.
            timer = setTimeout(runAll, 800);
        };

        const disposable = editorRef.current.onDidChangeModelContent(schedule);
        runAll(); // первый запуск — после открытия файла

        return () => {
            if (timer) clearTimeout(timer);
            try { disposable?.dispose?.(); } catch { /* ignore */ }
        };
    }, [checksEnabled, monacoReady, editorCreated, index, domainId]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        if (!serverValidation || serverValidation.isValid) {
            m.editor.setModelMarkers(model, "server-validate", []);
            return;
        }

        const diags = serverValidation.diagnostics || [];
        const markers: any[] = [];
        for (const d of diags) {
            const label =
                (d.labels || []).find((l: any) => l.primary) ||
                (d.labels || [])[0];
            const span = label?.span;
            let line = 1;
            let col = 1;
            let endLine = 1;
            let endCol = 1;
            if (span && typeof span.start === "number") {
                const startPos = model.getPositionAt(span.start);
                line = startPos.lineNumber;
                col = startPos.column;
                const endPos = model.getPositionAt(
                    typeof span.end === "number" ? span.end : span.start,
                );
                endLine = endPos.lineNumber;
                endCol = endPos.column;
            }
            markers.push({
                severity:
                    d.severity === "ERROR"
                        ? m.MarkerSeverity.Error
                        : d.severity === "WARNING"
                            ? m.MarkerSeverity.Warning
                            : m.MarkerSeverity.Info,
                message:
                    d.message +
                    (label?.message ? `\n${label.message}` : ""),
                startLineNumber: line,
                startColumn: col,
                endLineNumber: endLine,
                endColumn: Math.max(endCol, col + 1),
                source: "server-validate",
                code: d.severity,
            });
        }
        m.editor.setModelMarkers(model, "server-validate", markers);
    }, [monacoReady, editorCreated, serverValidation]);

    // ============ Issue markers ============
    const ignored = useMemo(() => {
        try {
            const key = `dg-yaml-ignored:${domainId}`;
            const raw = localStorage.getItem(key);
            return new Set<string>(raw ? JSON.parse(raw) : []);
        } catch { return new Set<string>(); }
    }, [domainId, ignoredVersion]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        if (!checksEnabled) {
            try { m.editor.setModelMarkers(model, "dg-linter", []); } catch { }
            try { m.editor.setModelMarkers(model, "yaml-syntax", []); } catch { }
            return;
        }

        if (!lineMap) return;

        const currentText = model.getValue();
        const isDirty = content !== savedContent;
        const markers = domainIssues
            .filter((issue) => severityFilter.has(issue.severity))
            .filter((issue) => !isIgnored(issue, ignored))
            .map((issue) => {
                const state = isDirty
                    ? classifyIssue(issue, currentText, lineMap, recheckModel, index)
                    : "still";
                if (state === "resolved") return null;

                // Показываем маркер и для "still", и для "unknown".
                // "still" — правило проверено локально, проблема точно осталась.
                // "unknown" — правило не покрыто classifyIssue (view/uiRule/
                // dataRule/mixin/tree/exchangeSettings); локально проверить
                // нельзя, но маркер не должен исчезать на каждом keystroke —
                // пользователь теряет контекст. Маркер останется до Ctrl+S,
                // после чего серверный линтер пересчитает.
                // Без суффикса «⏱ возможно устарело» — он был визуальным шумом.
                const line = findIssueLine(issue, lineMap);
                if (line == null) return null;
                return {
                    severity:
                        issue.severity === "error" ? m.MarkerSeverity.Error :
                            issue.severity === "warning" ? m.MarkerSeverity.Warning :
                                m.MarkerSeverity.Info,
                    message: `[${issue.rule}] ${issue.message}${issue.hint ? "\n\n💡 " + issue.hint : ""}`,
                    startLineNumber: line,
                    startColumn: 1,
                    endLineNumber: line,
                    endColumn: 1_000_000,
                    source: "dg-linter",
                    code: issue.ruleId,
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);

        // Устанавливаем маркеры для линтера
        m.editor.setModelMarkers(model, 'dg-linter', markers);

        // Устанавливаем маркер для синтаксической ошибки YAML
        if (yamlSyntaxIssue) {
            let maxCol = 1000;
            try {
                if (yamlSyntaxIssue.line <= model.getLineCount()) {
                    maxCol = model.getLineMaxColumn(yamlSyntaxIssue.line);
                }
            } catch (e) { }

            m.editor.setModelMarkers(model, "yaml-syntax", [{
                severity: m.MarkerSeverity.Error,
                message: `YAML Syntax Error: ${yamlSyntaxIssue.message}`,
                startLineNumber: yamlSyntaxIssue.line,
                startColumn: 1,
                endLineNumber: yamlSyntaxIssue.line,
                endColumn: maxCol,
                source: "yaml-syntax"
            }]);
        } else {
            m.editor.setModelMarkers(model, "yaml-syntax", []);
        }

        // Принудительный layout ПОСЛЕ установки маркеров.
        // Без этого при readOnly: true Monaco кэширует viewport=0×0 и не рисует
        // маркеры до первого взаимодействия с редактором (unlock, focus, resize).
        requestAnimationFrame(() => {
            if (!editorRef.current) return;
            try { editorRef.current.layout(); } catch { }
        });

        // Дополнительный вариант на случай, если rAF сработал слишком рано:
        setTimeout(() => {
            if (!editorRef.current) return;
            try { editorRef.current.layout(); } catch { }
        }, 400);

        return () => {
            try { m.editor.setModelMarkers(model, 'dg-linter', []); } catch { }
        };
    }, [index, recheckModel, checksEnabled, monacoReady, editorCreated, lineMap, domainIssues, isLocked, content, severityFilter, savedContent]);

    // ============ Jump ============
    const jumpTo = useCallback((line: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
    }, []);

    const [activeFoldLevel, setActiveFoldLevel] = useState<number | null>(null);

    // Сброс свёрнутости при смене файла / открытии
    useEffect(() => {
        setActiveFoldLevel(null);
    }, [filePath, open]);

    const gotoStart = useCallback(() => {
        if (!editorRef.current) return;
        editorRef.current.setPosition({ lineNumber: 1, column: 1 });
        editorRef.current.revealLine(1);
        editorRef.current.focus();
    }, []);

    const gotoEnd = useCallback(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const lineCount = ed.getModel()?.getLineCount() ?? 1;
        ed.setPosition({ lineNumber: lineCount, column: 1 });
        ed.revealLine(lineCount);
        ed.focus();
    }, []);

    const toggleFold = useCallback((level: 1 | 2 | 3 | 4 | 5) => {
        const ed = editorRef.current;
        if (!ed) return;
        if (activeFoldLevel === level) {
            // Повторный клик по активному уровню — развернуть всё
            ed.getAction("editor.unfoldAll")?.run();
            setActiveFoldLevel(null);
            return;
        }
        const action = ed.getAction(`editor.foldLevel${level}`);
        if (action) {
            action.run();
            setActiveFoldLevel(level);
        }
    }, [activeFoldLevel]);

    const unfoldAll = useCallback(() => {
        editorRef.current?.getAction("editor.unfoldAll")?.run();
        setActiveFoldLevel(null);
    }, []);

    // ============ Auto-jump to pending issue ============
    // Срабатывает когда:
    //   - редактор открыт,
    //   - есть «намерение» из LintModal,
    //   - Monaco создан и lineMap построен.
    // Откладываем jumpTo на 50ms — Monaco должен отрисоваться.
    useEffect(() => {
        if (!open) return;
        if (!pendingIssue) return;
        if (!editorCreated || !editorRef.current) return;
        if (!lineMap) return;

        const line = findIssueLine(pendingIssue, lineMap);
        if (line == null) {
            // Строку найти не удалось — сбрасываем намерение,
            // чтобы не зависло до следующего клика
            setPendingIssue(null);
            return;
        }

        const t = setTimeout(() => {
            setPendingIssue(null);
            if (!editorRef.current) return;
            try {
                jumpTo(line);
            } catch {
                /* ignore */
            }
        }, 50);
        return () => clearTimeout(t);
    }, [
        open,
        pendingIssue,
        editorCreated,
        lineMap,
        jumpTo,
        setPendingIssue,
    ]);

    // ============ Toggle helpers ============
    const toggleNode = useCallback((key: string) => {
        setExpandedNodes((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key); else s.add(key);
            return s;
        });
    }, []);

    const expandAll = useCallback(() => {
        if (!lineMap) return;
        const all = new Set<string>();
        const walk = (node: NavNode, sectionKey: string) => {
            if (node.children && node.children.length > 0) {
                const key = sectionKey + '#' + node.id;
                all.add(key);
                node.children.forEach((child) => walk(child, key));
            }
        };
        lineMap.sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key)));
        setExpandedNodes(all);
        document.querySelectorAll('.yaml-nav-section').forEach((el) => {
            (el as HTMLDetailsElement).open = true;
        });
    }, [lineMap]);

    const collapseAll = useCallback(() => {
        setExpandedNodes(new Set());
        document.querySelectorAll('.yaml-nav-section').forEach((el) => {
            (el as HTMLDetailsElement).open = false;
        });
    }, []);

    // ============ Copy ============
    const handleCopy = useCallback(async () => {
        const text = editorRef.current ? editorRef.current.getValue() : content;
        try {
            await navigator.clipboard.writeText(text);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 1500);
        } catch (err: any) {
            alert('Не удалось скопировать: ' + err.message);
        }
    }, [content]);

    // ============ Toggle lock ============
    const handleToggleLock = useCallback(() => {
        if (isLocked) {
            setIsLocked(false);
            setSaveError(null);
        } else {
            if (isDirty) {
                if (!confirm('Есть несохранённые изменения. Сбросить их и заблокировать файл?')) return;
                if (editorRef.current) {
                    isProgrammaticChange.current = true;
                    editorRef.current.setValue(savedContent);
                    isProgrammaticChange.current = false;
                }
                setContent(savedContent);
            }
            setIsLocked(true);
        }
    }, [isLocked, isDirty, savedContent]);

    // ============ Save ============
    const handleSave = useCallback(async () => {
        if (isLocked || isSaving || !editorRef.current) return;

        let valueToSave = editorRef.current.getValue();

        if (valueToSave === savedContent) {
            setSaveFeedback(true);
            setTimeout(() => setSaveFeedback(false), 1500);
            return;
        }

        // ============ Auto-bump version (только remote) ============
        // В remote-режиме каждый save = publishExpertise. Сервер отклонит
        // публикацию, если version не больше предыдущей. Если пользователь
        // не изменил version — предлагаем поднять patch автоматически.
        if (mode === "remote") {
            const oldVersion = extractTopLevelVersion(savedContent);
            const newVersion = extractTopLevelVersion(valueToSave);

            if (oldVersion && newVersion && oldVersion === newVersion) {
                const bumped = bumpPatchVersion(oldVersion);
                if (bumped) {
                    const ok = confirm(
                        `Версия схемы не изменилась: ${oldVersion}.\n\n` +
                        `Для публикации version должна быть больше, чем на сервере.\n` +
                        `Поднять до ${bumped} и сохранить?`,
                    );
                    if (!ok) return;

                    valueToSave = replaceTopLevelVersion(valueToSave, bumped);

                    // Синхронизируем Monaco, чтобы пользователь увидел новую version
                    isProgrammaticChange.current = true;
                    try {
                        editorRef.current.setValue(valueToSave);
                    } finally {
                        isProgrammaticChange.current = false;
                    }
                    setContent(valueToSave);
                }
                // Если version не-SemVer (с суффиксом) — молча пропускаем,
                // сервер сам отругает LOWER_VERSION и пользователь увидит hint.
            }
        }

        // Дальше — как обычно, но работаем с valueToSave
        setIsSaving(true);
        setSaveStage(mode === "remote" ? "publishing" : "writing");
        setSaveError(null);

        // Таймаут на запрос: publish может подвесить ответ.
        const controller = new AbortController();
        saveAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
            const res = await fetch('/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: valueToSave }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const errText = await res.text();
                let errMsg = errText;
                try {
                    const j = JSON.parse(errText);
                    if (j.error) errMsg = j.error;
                } catch { }
                throw new Error(errMsg);
            }

            invalidateYamlCache(filePath || undefined);

            // Триггерим перезапрос /api/model
            useGraphStore.getState().bumpModelVersion();

            // Небольшая задержка, чтобы сервер успел ребилдить
            setTimeout(() => {
                useGraphStore.getState().bumpModelVersion();
            }, 800);


            // Обновляем savedContent и content одновременно
            setSavedContent(valueToSave);
            setContent(valueToSave);
            setLiveVersion((v) => v + 1);

            try {
                editorRef.current?.pushUndoStop();
            } catch { }

            // ============ Публикация (remote) ============
            // Разбираем ответ: локальная запись уже прошла (data.ok === true),
            // publish — отдельное поле.
            let publishInfo: any = null;
            try {
                const data = await res.json();
                if (data && data.publish) publishInfo = data.publish;
            } catch {
                /* ignore — старый сервер мог вернуть не-JSON; не блокируем сохранение */
            }

            // ============ Read-back: сверяем диск с Monaco ============
            let diskContent: string | null = null;
            try {
                const back = await fetch(
                    "/file?path=" + encodeURIComponent(filePath || ""),
                );
                if (back.ok) diskContent = await back.text();
            } catch {
                /* ignore — диагностика, не блокирует save */
            }

            // ============ Собираем итог: error / feedback ============
            // «Сохранён» показываем ТОЛЬКО если ни ошибки publish,
            // ни расхождения с диском не было.
            let hadError = false;

            if (
                diskContent !== null &&
                diskContent !== valueToSave &&
                editorRef.current
            ) {
                isProgrammaticChange.current = true;
                try {
                    editorRef.current.setValue(diskContent);
                } finally {
                    isProgrammaticChange.current = false;
                }
                setSavedContent(diskContent);
                setContent(diskContent);
                setLiveVersion((v) => v + 1);
                hadError = true;
                setSaveError(
                    "На диске оказалось другое содержимое. Monaco синхронизирован. " +
                    "Проверьте, не запущен ли --refresh параллельно.",
                );
            }

            if (publishInfo && publishInfo.ok === true) {
                // publish успешен — "✓ сохранён" и toast
                useGraphStore.getState().showSnackbar(
                    `✅ Опубликовано: ${publishInfo.domain?.name || filePath}`,
                );
            } else if (publishInfo && publishInfo.ok === false) {
                // локально сохранили, publish упал — БЕЗ "✓ сохранён"
                hadError = true;
                const hint = publishInfo.hint ? `\n${publishInfo.hint}` : "";
                setSaveError(
                    `Локально сохранено. Публикация не удалась: ${publishInfo.error}${hint}`,
                );
                useGraphStore.getState().showSnackbar(
                    `⚠️ Локально сохранено, публикация не удалась: ${publishInfo.error}`,
                );
            }
            // local / hybrid — hadError остаётся false, просто показать feedback

            if (!hadError) {
                setSaveFeedback(true);
                setTimeout(() => setSaveFeedback(false), 2000);
            }
        } catch (err: any) {
            setSaveError(err.message || 'Ошибка сохранения');
        } finally {
            clearTimeout(timeoutId);
            saveAbortRef.current = null;
            setIsSaving(false);
            setSaveStage("idle");
        }
    }, [isLocked, savedContent, filePath, mode]);

    const handleServerValidate = useCallback(async () => {
        if (!editorRef.current) return;
        const sourceCode = editorRef.current.getValue();
        setServerValidating(true);
        setServerValidation(null);
        setRightTab("server");
        try {
            const res = await fetch("/api/validate-single", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sourceCode }),
            });
            const data = await res.json();
            if (!res.ok) {
                setServerValidation({
                    isValid: false,
                    error: data?.error || `HTTP ${res.status}`,
                    diagnostics: [],
                });
            } else {
                setServerValidation(data);
            }
        } catch (e: any) {
            setServerValidation({
                isValid: false,
                error: e.message || "Ошибка запроса",
                diagnostics: [],
            });
        } finally {
            setServerValidating(false);
        }
    }, []);

    // ============ Close ============
    const handleClose = useCallback(() => {
        if (isDirty && !isLocked) {
            if (!confirm('Есть несохранённые изменения. Закрыть без сохранения?')) return;
        }
        useGraphStore.getState().setYamlViewerOpen(false);
    }, [isDirty, isLocked]);

    // ============ Keyboard nav ============
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            const isMod = e.ctrlKey || e.metaKey;
            if (
                isMod &&
                e.shiftKey &&
                !e.altKey &&
                (e.code === "KeyF" || e.key === "F" || e.key === "f")
            ) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                setNavTab("search");
                setTimeout(() => searchPanelRef.current?.focusInput(), 30);
            }
        };

        // capture: true — перехватываем РАНЬШЕ Monaco, ReactFlow и браузера
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable
            )) return;

            // Не перехватываем если фокус в редакторе
            if (editorRef.current && editorRef.current.hasTextFocus && editorRef.current.hasTextFocus()) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveNavIdx((prev) => Math.min(prev + 1, filteredNavNodes.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveNavIdx((prev) => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && activeNavIdx >= 0) {
                e.preventDefault();
                const node = filteredNavNodes[activeNavIdx];
                if (node) jumpTo(node.line);
            } else if (e.key === 'ArrowRight' && activeNavIdx >= 0) {
                const node = filteredNavNodes[activeNavIdx];
                if (node && node.hasChildren && !node.expanded) {
                    e.preventDefault();
                    toggleNode(node.key);
                }
            } else if (e.key === 'ArrowLeft' && activeNavIdx >= 0) {
                const node = filteredNavNodes[activeNavIdx];
                if (node && node.hasChildren && node.expanded) {
                    e.preventDefault();
                    toggleNode(node.key);
                }
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, filteredNavNodes, activeNavIdx, jumpTo, toggleNode]);

    useEffect(() => {
        if (activeNavIdx < 0 || !navListRef.current) return;
        const el = navListRef.current.querySelector('.yaml-nav-item--active') as HTMLElement | null;
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [activeNavIdx]);

    // ============ Collapse persistence ============
    const STORAGE_KEY = useMemo(
        () => domainId ? `dg-yaml-nav-collapsed:${domainId}` : null,
        [domainId]
    );

    useEffect(() => {
        if (!open || !STORAGE_KEY) return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (Array.isArray(data.collapsedSections)) {
                requestAnimationFrame(() => {
                    document.querySelectorAll('.yaml-nav-section').forEach((el) => {
                        const key = (el as HTMLElement).dataset.sectionKey;
                        if (key) (el as HTMLDetailsElement).open = !data.collapsedSections.includes(key);
                    });
                });
            }
            if (Array.isArray(data.expandedNodes)) {
                setExpandedNodes(new Set(data.expandedNodes));
            }
        } catch { }
    }, [open, STORAGE_KEY]);

    useEffect(() => {
        if (open || !STORAGE_KEY) return;
        try {
            const sections = Array.from(
                document.querySelectorAll<HTMLDetailsElement>('.yaml-nav-section')
            );
            const collapsedSections = sections
                .filter((el) => !el.open)
                .map((el) => el.dataset.sectionKey)
                .filter(Boolean);
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                collapsedSections,
                expandedNodes: Array.from(expandedNodes)
            }));
        } catch { }
    }, [open, STORAGE_KEY, expandedNodes]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const w = window as any;
        const m = w.monaco;
        if (!m) return;

        // Регистрируем однократно для этого инстанса
        if ((editorRef.current as any).__dgActionsRegistered) return;
        (editorRef.current as any).__dgActionsRegistered = true;

        try {
            editorRef.current.addAction({
                id: 'dg-go-to-definition',
                label: 'Перейти к определению',
                keybindings: [
                    // F12 обычно перехватывается браузером (DevTools),
                    // поэтому используем альтернативы
                    m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.F12,
                    m.KeyMod.Alt | m.KeyCode.F12
                ],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1,
                run: (ed: any) => {
                    ed.trigger('dg', 'editor.action.revealDefinition', {});
                }
            });

            editorRef.current.addAction({
                id: 'dg-open-fqid-in-catalog',
                label: 'Открыть сущность в каталоге (FQID)',
                keybindings: [
                    m.KeyMod.CtrlCmd | m.KeyMod.Alt | m.KeyCode.F12
                ],
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 2,
                run: (ed: any) => {
                    const pos = ed.getPosition();
                    if (!pos) return;
                    const lineText = ed.getModel().getLineContent(pos.lineNumber);
                    // Ищем FQID в текущей строке
                    const fqidMatch = lineText.match(/[a-zA-Z0-9][\w.\-]*\/[\w.\-]+/);
                    if (!fqidMatch) return;
                    const fqid = fqidMatch[0].toLowerCase();
                    useGraphStore.getState().setEntityCatalogInitialFqid(fqid);
                    useGraphStore.getState().setEntityCatalogOpen(true);
                }
            });
        } catch (err) {
            console.error('[yaml-viewer] addAction failed', err);
        }
    }, [editorCreated]);

    // Сбрасываем в read-only при смене файла ИЛИ при закрытии модалки
    useEffect(() => {
        if (!open) {
            setIsLocked(true);
        }
        setSaveError(null);
        setSaveFeedback(false);
        setFocusTarget(null);
        setFocusIncludeDeps(false);
    }, [filePath, open]);

    useEffect(() => {
        if (!navContextMenu) return;
        const onDoc = (e: MouseEvent) => {
            const el = document.querySelector(".yaml-nav-ctx-menu");
            if (el && el.contains(e.target as Node)) return;
            setNavContextMenu(null);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setNavContextMenu(null);
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onEsc, true);
        return () => {
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onEsc, true);
        };
    }, [navContextMenu]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (!detail || !detail.action) return;

            if (detail.action === 'help') {
                alert(detail.message);
            } else if (detail.action === 'ignore') {
                // Игнорируем правило: сохраняем в localStorage по (domainId, line, message)
                try {
                    const key = `dg-yaml-ignored:${domainId}`;
                    const raw = localStorage.getItem(key);
                    const arr: string[] = raw ? JSON.parse(raw) : [];
                    const sig = `${detail.source}|${detail.message}`;
                    if (!arr.includes(sig)) {
                        arr.push(sig);
                        localStorage.setItem(key, JSON.stringify(arr));
                    }
                    // Переприменяем маркеры без ignored
                    if (editorRef.current) {
                        const m = (window as any).monaco;
                        const model = editorRef.current.getModel();
                        if (m && model) {
                            // Убираем этот маркер вручную — переустановим через существующий эффект с задержкой
                            setIgnoredVersion((v) => v + 1);
                        }
                    }
                } catch { }
            } else if (detail.action === 'open-lint') {
                useGraphStore.getState().setLintOpen(true);
            }
        };
        document.addEventListener('dg:issue-action', handler);
        return () => document.removeEventListener('dg:issue-action', handler);
    }, [domainId]);

    useEffect(() => {
        if (!open || !filePath) { setPreviousContent(null); return; }
        let cancelled = false;
        fetch('/file/previous?path=' + encodeURIComponent(filePath))
            .then((r) => (r.status === 204 ? null : r.text()))
            .then((text) => { if (!cancelled) setPreviousContent(text); })
            .catch(() => { if (!cancelled) setPreviousContent(null); });
        return () => { cancelled = true; };
    }, [open, filePath, saveFeedback]);

    useEffect(() => {
        if (!diffMode || !monacoReady || !editorCreated || !diffContainerRef.current) return;
        if (previousContent == null) return;
        const w = window as any;
        const m = w.monaco;
        if (!m || !editorRef.current) return;

        const modifiedContent = editorRef.current.getValue();
        const originalModel = m.editor.createModel(previousContent, 'yaml');
        const modifiedModel = m.editor.createModel(modifiedContent, 'yaml');

        const diffEditor = m.editor.createDiffEditor(diffContainerRef.current, {
            readOnly: true,
            automaticLayout: true,
            renderSideBySide: true,
            originalEditable: false,
            renderOverviewRuler: true,
            ignoreTrimWhitespace: false
        });
        diffEditor.setModel({ original: originalModel, modified: modifiedModel });
        diffEditorRef.current = diffEditor;

        return () => {
            try { diffEditor.dispose(); } catch { }
            try { originalModel.dispose(); } catch { }
            try { modifiedModel.dispose(); } catch { }
            diffEditorRef.current = null;
        };
    }, [diffMode, monacoReady, editorCreated, previousContent]);

    useEffect(() => {
        if (!editorRef.current) return;
        try { editorRef.current.updateOptions({ readOnly: isLocked }); } catch { }
    }, [isLocked, editorCreated]);

    useEffect(() => {
        if (!open) {
            if (editorRef.current) {
                try { editorRef.current.dispose(); } catch { }
                editorRef.current = null;
                setEditorCreated(false);
            }
        }
    }, [open]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        if (!checksEnabled) {
            if (decorationsCollection.current) {
                decorationsCollection.current.clear();
            }
            return;
        }
        if (!lineMap || !content) return;

        // Safety-net: на больших файлах подсветка неиспользуемых атрибутов
        // не оправдывает затрат CPU (O(n) по 1.2M символов). Отключаем.
        if (content.length > 250_000) {
            if (decorationsCollection.current) decorationsCollection.current.clear();
            return;
        }

        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        // Убираем комментарии, чтобы не считать их за использования
        const textWithoutComments = content.replace(/#[^\n]*/g, "");

        // ============ O(n) — один проход по тексту, а не per-attr ============
        // 1) Частоты word-токенов (attrId встречается в тексте)
        const wordCounts = new Map<string, number>();
        for (const mw of textWithoutComments.matchAll(
            /[a-zA-Z_][a-zA-Z0-9_]*/g,
        )) {
            const w = mw[0];
            wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        }
        // 2) Частоты определений (`id: xxx`, `- id: xxx`)
        const defCounts = new Map<string, number>();
        for (const md of textWithoutComments.matchAll(
            /(?:^|[\s-])id\s*:\s*['"]?([a-zA-Z_][a-zA-Z0-9_]*)/g,
        )) {
            const id = md[1];
            defCounts.set(id, (defCounts.get(id) || 0) + 1);
        }

        const newDecorations: any[] = [];
        const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
        if (entitiesSection) {
            entitiesSection.nodes.forEach((entityNode) => {
                if (!entityNode.children) return;
                entityNode.children.forEach((attrNode) => {
                    if (attrNode.type !== "attribute") return;
                    const attrId = attrNode.id;
                    const total = wordCounts.get(attrId) || 0;
                    const defs = defCounts.get(attrId) || 0;
                    if (total - defs <= 0) {
                        newDecorations.push({
                            range: new m.Range(attrNode.line, 1, attrNode.line, 1),
                            options: {
                                isWholeLine: true,
                                className: "unused-attribute-line",
                                inlineClassName: "unused-attribute-text",
                                hoverMessage: {
                                    value: `⚠️ Атрибут «${attrId}» не используется ни в представлениях, ни в правилах данных`,
                                },
                            },
                        });
                    }
                });
            });
        }

        if (decorationsCollection.current) decorationsCollection.current.clear();
        decorationsCollection.current =
            editorRef.current.createDecorationsCollection(newDecorations);

        return () => {
            if (decorationsCollection.current) decorationsCollection.current.clear();
        };
    }, [monacoReady, editorCreated, lineMap, content, checksEnabled]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;
        const model = editorRef.current.getModel();
        if (!model) return;

        if (focusDecorationsRef.current) {
            try { focusDecorationsRef.current.clear(); } catch { }
            focusDecorationsRef.current = null;
        }

        if (!focusTarget || !focusResult) return;

        // строки с маркерами всегда видимы
        const linesWithMarkers = new Set<number>();
        try {
            const markers = m.editor.getModelMarkers({ resource: model.uri });
            /*for (const mrk of markers) {
                // Monaco: 1=Hint, 2=Info, 4=Warning, 8=Error.
                // Info/hint НЕ защищают от затенения — они не «проблема».
                if (mrk.severity < 4) continue;
                for (let l = mrk.startLineNumber; l <= mrk.endLineNumber; l++) {
                    linesWithMarkers.add(l);
                }
            }*/
        } catch { }
        for (const issue of effectiveIssues) {
            if (issue.severity === "info") continue;
            if (typeof issue.line === "number" && issue.line > 0) {
                linesWithMarkers.add(issue.line);
            }
        }
        if (yamlSyntaxIssue) {
            if (typeof yamlSyntaxIssue.line === "number") {
                linesWithMarkers.add(yamlSyntaxIssue.line);
            }
        }

        if (focusResult.lineLevel.size === 0) return; // нечего затенять

        const decorations: any[] = [];
        const lineLevel = focusResult.lineLevel;
        const totalLines = model.getLineCount();
        for (let l = 1; l <= totalLines; l++) {
            const lvl = lineLevel.get(l);
            if (lvl === "primary" || lvl === "secondary") continue;
            if (linesWithMarkers.has(l)) continue;

            const maxCol = Math.max(1, model.getLineMaxColumn(l));
            if (lvl === "tertiary") {
                decorations.push({
                    range: new m.Range(l, 1, l, maxCol),
                    options: {
                        isWholeLine: true,
                        className: "yaml-focus-tertiary",
                        inlineClassName: "yaml-focus-tertiary-text",
                    },
                });
            } else {
                decorations.push({
                    range: new m.Range(l, 1, l, maxCol),
                    options: {
                        isWholeLine: true,
                        className: "yaml-focus-unrelated",
                        inlineClassName: "yaml-focus-unrelated-text",
                    },
                });
            }
        }

        try {
            focusDecorationsRef.current = editorRef.current.createDecorationsCollection(decorations);
        } catch { }

        return () => {
            if (focusDecorationsRef.current) {
                try { focusDecorationsRef.current.clear(); } catch { }
                focusDecorationsRef.current = null;
            }
        };
    }, [
        monacoReady, editorCreated, focusTarget, focusResult,
        effectiveIssues, yamlSyntaxIssue, focusIncludeDeps
    ]);

    const crossDomainStats = useMemo(() => {
        if (!index || !domainId) return null;
        const currentDomainLower = domainId.toLowerCase();

        let incoming = 0;
        let outgoing = 0;
        const incomingDomains = new Set<string>();
        const outgoingDomains = new Set<string>();

        // Исходящие (текущий домен -> другие)
        const currentEntities = index.entities.filter(e => e.domainId.toLowerCase() === currentDomainLower);
        currentEntities.forEach(e => {
            e.attributes.forEach(a => {
                const target = a.referenceEntity || a.itemReferenceEntity;
                if (target) {
                    const targetDomain = target.split('/')[0];
                    if (targetDomain !== currentDomainLower) {
                        outgoing++;
                        outgoingDomains.add(targetDomain);
                    }
                }
            });
            if (e.inherits) {
                const targetDomain = e.inherits.split('/')[0];
                if (targetDomain !== currentDomainLower) {
                    outgoing++;
                    outgoingDomains.add(targetDomain);
                }
            }
        });

        // Входящие (другие -> текущий домен)
        index.entities.forEach(e => {
            if (e.domainId.toLowerCase() === currentDomainLower) return;
            e.attributes.forEach(a => {
                const target = a.referenceEntity || a.itemReferenceEntity;
                if (target) {
                    const targetDomain = target.split('/')[0];
                    if (targetDomain === currentDomainLower) {
                        incoming++;
                        incomingDomains.add(e.domainId);
                    }
                }
            });
            if (e.inherits) {
                const targetDomain = e.inherits.split('/')[0];
                if (targetDomain === currentDomainLower) {
                    incoming++;
                    incomingDomains.add(e.domainId);
                }
            }
        });

        return {
            incoming, outgoing, incomingDomainList: Array.from(incomingDomains).sort(),
            outgoingDomainList: Array.from(outgoingDomains).sort(),
        };
    }, [index, domainId]);

    useEffect(() => {
        if (!open) return;
        fetch("/api/validation-available")
            .then((r) => r.json())
            .then((d) => setServerAvailable(!!d.available))
            .catch(() => setServerAvailable(false));
    }, [open]);

    useEffect(() => {
        setServerValidation(null);
    }, [filePath, open]);

    const staleIssueCount = useMemo(
        () => effectiveIssues.filter((i: any) => i.__isUnknown).length,
        [effectiveIssues],
    );

    const handleFocus = useCallback((node: NavNode, sectionKey: string) => {
        const kind: FocusKind = sectionKey === "entities" ? "entity" : "linkage";
        setFocusTarget((prev) => {
            if (prev && prev.kind === kind && prev.id === node.id) return null;
            return { kind, id: node.id };
        });
    }, []);

    const handleFocusWithDeps = useCallback((node: NavNode, sectionKey: string) => {
        const kind: FocusKind = sectionKey === "entities" ? "entity" : "linkage";
        setFocusTarget({ kind, id: node.id });
        setFocusIncludeDeps(kind === "entity");
        setNavContextMenu(null);
    }, []);

    if (!open) return null;

    const canSave = !isLocked && isDirty;
    const issueCount = effectiveIssues.length;
    const refsCount = externalRefs.refs.length;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={handleClose}
        >
            <div
                className="help-modal yaml-viewer-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* ============ HEADER ============ */}
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        📄 {filePath?.split('/').pop() || 'Файл схемы'}
                        {domainId && <span className="help-modal__badge">{domainId}</span>}
                        {/* Приоритет бейджей: saving > saved > dirty.
                            Одновременно виден только один. */}
                        {isSaving ? (
                            <span
                                className="help-modal__badge help-modal__badge--saving"
                                title={
                                    saveStage === "publishing"
                                        ? "Идёт публикация на сервере"
                                        : "Идёт запись файла на диск"
                                }
                            >
                                {saveStage === "publishing"
                                    ? "● публикация…"
                                    : "● сохранение…"}
                            </span>
                        ) : loading ? (
                            <span
                                className="help-modal__badge help-modal__badge--loading"
                                title={
                                    mode === "remote"
                                        ? "Запрашиваем актуальную схему с сервера"
                                        : "Загрузка файла"
                                }
                            >
                                {mode === "remote"
                                    ? "● загрузка с сервера…"
                                    : "● загрузка…"}
                            </span>
                        ) : saveFeedback ? (
                            <span className="help-modal__badge help-modal__badge--ok">
                                ✓ сохранён
                            </span>
                        ) : isDirty ? (
                            <span className="help-modal__badge help-modal__badge--dirty">
                                ● изменён
                            </span>
                        ) : null}
                    </div>

                    <div className="help-modal__actions">
                        {serverAvailable && (
                            <button
                                className={
                                    "help-modal__icon-btn" +
                                    (serverValidating ? " active" : "") +
                                    (serverValidation && !serverValidating
                                        ? serverValidation.isValid
                                            ? " help-modal__icon-btn--success"
                                            : " help-modal__icon-btn--error"
                                        : "")
                                }
                                onClick={handleServerValidate}
                                disabled={serverValidating}
                                title={
                                    serverValidating
                                        ? "Проверка на сервере..."
                                        : "Проверить на сервере"
                                }
                            >
                                <MIcon
                                    name={
                                        serverValidating
                                            ? "hourglass_top"
                                            : serverValidation
                                                ? serverValidation.isValid
                                                    ? "cloud_done"
                                                    : "cloud_off"
                                                : "cloud_upload"
                                    }
                                />
                            </button>
                        )}

                        <button
                            className="help-modal__icon-btn"
                            onClick={() => setLeftCollapsed(!leftCollapsed)}
                            title={leftCollapsed ? "Развернуть навигацию" : "Свернуть навигацию"}
                        >
                            <MIcon name={leftCollapsed ? "chevron_right" : "chevron_left"} />
                        </button>

                        <button
                            className="help-modal__icon-btn"
                            onClick={() => setRightCollapsed(!rightCollapsed)}
                            title={
                                rightCollapsed
                                    ? "Развернуть панель проблем"
                                    : "Свернуть панель проблем"
                            }
                        >
                            <MIcon name={rightCollapsed ? "chevron_left" : "chevron_right"} />
                        </button>
                        {index?.pii?.byDomain?.some((d: any) => d.domainId === domainId) && (
                            <button
                                className="help-modal__icon-btn"
                                onClick={() => {
                                    useGraphStore.getState().setYamlViewerOpen(false);
                                    useGraphStore.getState().setPiiOpen(true);
                                }}
                                title="PII-атрибуты в домене"
                            >
                                <MIcon name="shield_lock" />
                            </button>
                        )}

                        <button
                            className="help-modal__icon-btn"
                            onClick={() => {
                                useGraphStore.getState().setYamlViewerOpen(false);
                                useGraphStore.getState().setDomainComparePrefillA(domainId);
                                useGraphStore.getState().setDomainCompareOpen(true);
                            }}
                            disabled={isDirty}
                            title={
                                isDirty
                                    ? "Сохраните или отмените изменения перед переходом"
                                    : "Сравнить домены"
                            }
                        >
                            <MIcon name="compare_arrows" />
                        </button>

                        {domainId ? (
                            <button
                                className="help-modal__icon-btn"
                                onClick={() => {
                                    useGraphStore.getState().setYamlViewerOpen(false);
                                    gotoDomain(domainId);
                                }}
                                disabled={isDirty}
                                title={
                                    isDirty
                                        ? "Сохраните или отмените изменения перед переходом"
                                        : "Показать на графе"
                                }
                            >
                                <MIcon name="my_location" />
                            </button>
                        ) : null}

                        <button
                            className={'help-modal__icon-btn' + (!isLocked ? ' active' : '')}
                            onClick={handleToggleLock}
                            title={isLocked ? 'Разблокировать для редактирования (двойной Shift)' : 'Заблокировать (сбросить изменения)'}
                        >
                            <MIcon name={isLocked ? 'lock' : 'lock_open'} />
                        </button>

                        <button
                            className={'help-modal__icon-btn' + (copyFeedback ? ' active' : '')}
                            onClick={handleCopy}
                            title="Копировать содержимое в буфер"
                        >
                            <MIcon name={copyFeedback ? 'check' : 'content_copy'} />
                        </button>

                        <button
                            className={'help-modal__icon-btn' + (saveFeedback ? ' active' : '')}
                            onClick={handleSave}
                            disabled={!canSave || isSaving}
                            title={
                                isLocked
                                    ? 'Разблокируйте файл для сохранения'
                                    : isDirty
                                        ? mode === 'remote'
                                            ? 'Сохранить и опубликовать на сервере (Ctrl+S)'
                                            : 'Сохранить изменения (Ctrl+S)'
                                        : 'Нет изменений для сохранения'
                            }
                        >
                            <MIcon name={isSaving ? 'hourglass' : 'save'} />
                        </button>

                        {previousContent && (
                            <button
                                className={'help-modal__icon-btn' + (diffMode ? ' active' : '')}
                                onClick={() => setDiffMode(!diffMode)}
                                title={diffMode ? 'Вернуться к редактору' : 'Показать diff с предыдущим сохранением'}
                            >
                                <MIcon name="difference" />
                            </button>
                        )}

                        {domainId && (
                            <button
                                className="help-modal__icon-btn"
                                onClick={() => {
                                    const st = useGraphStore.getState();
                                    st.setDomainSchemaDomainId(domainId);
                                    if (navQuery.trim()) st.setDomainSchemaPrefillQuery(navQuery.trim());
                                    if (onlyProblematic) st.setDomainSchemaPrefillOnlyProblematic(true);
                                    st.setDomainSchemaOpen(true);
                                }}
                                title="Структурированный обзор схемы"
                            >
                                <MIcon name="menu_book" />
                            </button>
                        )}

                        <button
                            className={"help-modal__icon-btn" + (checksEnabled ? " active" : "")}
                            onClick={toggleChecks}
                            title={
                                checksEnabled
                                    ? "Проверки включены. Нажмите, чтобы отключить (быстрый режим для медленных машин)"
                                    : "Проверки отключены. Нажмите, чтобы включить"
                            }
                        >
                            <MIcon name={checksEnabled ? "rule" : "block"} />
                        </button>

                        <button
                            className="help-modal__icon-btn"
                            onClick={() => setShowHelp(true)}
                            title="Справка по навигации"
                        >
                            <MIcon name="help" />
                        </button>

                        <button
                            className="help-modal__close"
                            onClick={handleClose}
                            title={isDirty && !isLocked ? 'Закрыть без сохранения' : 'Закрыть'}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Счётчики домена */}
                {counters && (
                    <div className="yaml-viewer-info">
                        <span className="yaml-viewer-info__item">
                            <strong>{counters.entities}</strong> сущностей
                        </span>
                        <span className="yaml-viewer-info__item">
                            <strong>{counters.attributes}</strong> атрибутов
                        </span>
                        <span className="yaml-viewer-info__item">
                            <strong>{counters.linkages}</strong> связей
                        </span>
                        <span className="yaml-viewer-info__item">
                            <strong>{counters.views}</strong> views
                        </span>
                        {crossDomainStats &&
                            (crossDomainStats.incoming > 0 || crossDomainStats.outgoing > 0) && (
                                <div className="yaml-viewer-info__crossdomain">
                                    {crossDomainStats.outgoing > 0 && (
                                        <CrossDomainBadge
                                            direction="out"
                                            count={crossDomainStats.outgoing}
                                            domains={crossDomainStats.outgoingDomainList}
                                            label="исх."
                                            onDomainClick={(d) => {
                                                useGraphStore
                                                    .getState()
                                                    .setDomainSchemaDomainId(d);
                                                useGraphStore.getState().setDomainSchemaOpen(true);
                                            }}
                                        />
                                    )}
                                    {crossDomainStats.incoming > 0 && (
                                        <CrossDomainBadge
                                            direction="in"
                                            count={crossDomainStats.incoming}
                                            domains={crossDomainStats.incomingDomainList}
                                            label="вх."
                                            onDomainClick={(d) => {
                                                useGraphStore
                                                    .getState()
                                                    .setDomainSchemaDomainId(d);
                                                useGraphStore.getState().setDomainSchemaOpen(true);
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                        {counters.sonar && (
                            <button
                                className={
                                    "yaml-viewer-info__item yaml-viewer-info__item--sonar " +
                                    "yaml-viewer-info__sonar-" + counters.sonar.grade.toLowerCase()
                                }
                                onClick={() => useGraphStore.getState().setLintOpen(true)}
                                title="Sonar-оценка домена — открыть линтер"
                            >
                                <strong>{counters.sonar.score}</strong>
                                <span className="yaml-viewer-info__sonar-grade">
                                    {counters.sonar.grade}
                                </span>
                            </button>
                        )}
                        {counters.issues > 0 && (
                            <button
                                className="yaml-viewer-info__item yaml-viewer-info__item--issues"
                                onClick={() => setRightTab("issues")}
                                title="Открыть список проблем"
                            >
                                <MIcon name="warning" size="sm" />
                                <strong>{counters.issues}</strong> проблем
                            </button>
                        )}
                    </div>
                )}

                {focusTarget && (
                    <FocusBar
                        target={focusTarget}
                        result={focusResult}
                        includeDeps={focusIncludeDeps}
                        onToggleDeps={setFocusIncludeDeps}
                        onClear={() => {
                            setFocusTarget(null);
                            setFocusIncludeDeps(false);
                        }}
                    />
                )}

                {/* Save error */}
                {saveError && (
                    <div className="yaml-save-error">
                        ❌ {saveError}
                        <button onClick={() => setSaveError(null)}>✕</button>
                    </div>
                )}

                {/* ============ BODY ============ */}
                <div className="yaml-viewer-body">
                    {/* Nav */}
                    <div
                        className={"yaml-viewer-nav" + (leftCollapsed ? " yaml-viewer-nav--collapsed" : "")}
                        style={{ width: leftCollapsed ? 0 : leftWidth }}
                    >
                        {loading && <div className="yaml-viewer-nav__loading">Загрузка...</div>}
                        {lineMap && (
                            <>
                                <div className="yaml-viewer-nav__tabs">
                                    <button
                                        type="button"
                                        className={
                                            "yaml-viewer-nav__tab" +
                                            (navTab === "navigation" ? " active" : "")
                                        }
                                        onClick={() => setNavTab("navigation")}
                                    >
                                        <MIcon name="account_tree" size="sm" />
                                        Навигация
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            "yaml-viewer-nav__tab" +
                                            (navTab === "search" ? " active" : "")
                                        }
                                        onClick={() => {
                                            setNavTab("search");
                                            setTimeout(
                                                () => searchPanelRef.current?.focusInput(),
                                                30,
                                            );
                                        }}
                                    >
                                        <MIcon name="search" size="sm" />
                                        Поиск
                                        {searchResult && searchResult.totalMatches > 0 && (
                                            <span className="yaml-viewer-nav__tab-badge">
                                                {searchResult.totalMatches > 99
                                                    ? "99+"
                                                    : searchResult.totalMatches}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                <div
                                    className="yaml-viewer-nav__pane"
                                    style={navTab === "navigation" ? undefined : { display: "none" }}
                                >
                                    <div className="yaml-viewer-nav__header">
                                        <span>Навигация</span>
                                        <button
                                            className={
                                                "yaml-viewer-nav__toggle" +
                                                (onlyProblematic ? " active" : "")
                                            }
                                            style={{ marginLeft: "auto" }}
                                            onClick={() => setOnlyProblematic(!onlyProblematic)}
                                            title={
                                                onlyProblematic
                                                    ? "Показать все элементы"
                                                    : "Показать только элементы с проблемами"
                                            }
                                            disabled={domainIssues.length === 0}
                                        >
                                            <MIcon name="warning" size="sm" />
                                            {domainIssues.length}
                                        </button>
                                        <div className="yaml-viewer-nav__actions">
                                            <button
                                                className="yaml-viewer-nav__action"
                                                onClick={expandAll}
                                                title="Развернуть всё"
                                            >⤢</button>
                                            <button
                                                className="yaml-viewer-nav__action"
                                                onClick={collapseAll}
                                                title="Свернуть всё"
                                            >⤡</button>
                                        </div>
                                    </div>

                                    <div className="yaml-viewer-nav__search">
                                        <span className="yaml-viewer-nav__search-icon">🔍</span>
                                        <input
                                            type="text"
                                            className="yaml-viewer-nav__search-input"
                                            placeholder="Фильтр по id..."
                                            value={navQuery}
                                            onChange={(e) => {
                                                setNavQuery(e.target.value);
                                                setActiveNavIdx(-1);
                                            }}
                                            spellCheck={false}
                                        />
                                        {navQuery && (
                                            <button
                                                className="yaml-viewer-nav__search-clear"
                                                onClick={() => setNavQuery('')}
                                            >✕</button>
                                        )}
                                    </div>

                                    <div className="yaml-viewer-nav__list" ref={navListRef}>
                                        {navQuery.trim() !== '' || onlyProblematic ? (
                                            <FilteredNavList
                                                nodes={filteredNavNodes}
                                                activeIdx={activeNavIdx}
                                                onJump={jumpTo}
                                                onHover={setActiveNavIdx}
                                                focusTarget={focusTarget}
                                                onFocus={handleFocus}
                                            />
                                        ) : (
                                            lineMap.sections.map((section) => (
                                                <SectionNav
                                                    key={section.key}
                                                    section={section}
                                                    expandedNodes={expandedNodes}
                                                    onToggleNode={toggleNode}
                                                    onJump={jumpTo}
                                                    issues={allIssues}
                                                    activeIdx={activeNavIdx}
                                                    onSetActive={setActiveNavIdx}
                                                    filteredNavNodes={filteredNavNodes}
                                                    sectionKey={section.key}
                                                    entityIssuesMap={entityIssuesMap}
                                                    attrIssuesMap={attrIssuesMap}
                                                    focusTarget={focusTarget}
                                                    onFocus={handleFocus}
                                                    onContextMenu={(node, sectionKey, x, y) =>
                                                        setNavContextMenu({ node, sectionKey, x, y })
                                                    }
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div
                                    className="yaml-viewer-nav__pane"
                                    style={navTab === "search" ? undefined : { display: "none" }}
                                >
                                    <YamlSearchPanel
                                        ref={searchPanelRef}
                                        content={content}
                                        lineMap={lineMap}
                                        query={searchQuery}
                                        options={searchOptions}
                                        onQueryChange={setSearchQuery}
                                        onOptionsChange={setSearchOptions}
                                        onResultChange={setSearchResult}
                                        onActiveMatchChange={setActiveSearchMatch}
                                        onEscape={() => setNavTab("navigation")}
                                        onJump={jumpTo}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {!leftCollapsed && (
                        <div className="yaml-viewer-resizer" onMouseDown={startResizingLeft} />
                    )}

                    {/* Editor */}
                    <div className="yaml-viewer-editor">
                        {/* Новая панель: Breadcrumbs (слева) + Quick Jumps (справа) */}
                        <div className="yaml-viewer-editor__toolbar">
                            {/* Left: goto start/end */}
                            <div className="yaml-viewer-goto-controls">
                                <button onClick={gotoStart} title="В начало файла (Ctrl+Home)">
                                    <MIcon name="vertical_align_top" size="sm" />
                                </button>
                                <button onClick={gotoEnd} title="В конец файла (Ctrl+End)">
                                    <MIcon name="vertical_align_bottom" size="sm" />
                                </button>
                            </div>

                            <div className="yaml-viewer-breadcrumbs">
                                {currentContext && currentContext.breadcrumbs.length > 0 ? (
                                    <>
                                        {currentContext.breadcrumbs.map((item, idx) => (
                                            <React.Fragment key={`bc-${idx}-${item.line}`}>
                                                {idx > 0 && <span className="yaml-viewer-breadcrumbs__sep">›</span>}
                                                <button
                                                    type="button"
                                                    className={`yaml-viewer-breadcrumbs__item yaml-viewer-breadcrumbs__item--${item.type}`}
                                                    onClick={() => jumpTo(item.line)}
                                                    title={`${item.type}: ${item.id} — строка ${item.line}`}
                                                >
                                                    {item.id}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                        <span className="yaml-viewer-breadcrumbs__line">:{cursorLine}</span>
                                    </>
                                ) : (
                                    <span className="yaml-viewer-breadcrumbs__item">—</span>
                                )}
                            </div>

                            {/* Right: quickjumps + fold controls */}
                            <div className="yaml-viewer-toolbar-right">
                                {lineMap && (
                                    <div className="yaml-viewer-quickjumps">
                                        {lineMap.sections.map((s) => {
                                            const icon =
                                                s.key === "entities" ? "category"
                                                    : s.key === "linkages" ? "link"
                                                        : s.key === "dataTypes" ? "data_object"
                                                            : s.key === "actions" ? "bolt"
                                                                : s.key === "views" ? "visibility"
                                                                    : s.key === "menus" ? "menu"
                                                                        : s.key === "mixins" ? "merge"
                                                                            : s.key === "dataRules" ? "rule"
                                                                                : s.key === "medias" ? "image"
                                                                                    : "arrow_right";
                                            return (
                                                <button
                                                    key={s.key}
                                                    className="yaml-viewer-quickjump"
                                                    onClick={() => jumpTo(s.line)}
                                                    title={`${s.label} (${s.count})`}
                                                >
                                                    <MIcon name={icon} size="sm" />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="yaml-viewer-fold-controls">
                                    {([1, 2, 3, 4, 5] as const).map((lvl) => (
                                        <button
                                            key={lvl}
                                            className={
                                                "yaml-viewer-fold-btn" +
                                                (activeFoldLevel === lvl ? " yaml-viewer-fold-btn--active" : "")
                                            }
                                            onClick={() => toggleFold(lvl)}
                                            title={
                                                activeFoldLevel === lvl
                                                    ? `Развернуть всё (уровень ${lvl} активен)`
                                                    : `Свернуть до уровня ${lvl}`
                                            }
                                        >
                                            {lvl}
                                        </button>
                                    ))}
                                    <button
                                        className="yaml-viewer-fold-btn"
                                        onClick={unfoldAll}
                                        title="Развернуть всё"
                                    >
                                        <MIcon name="unfold_more" size="sm" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Обертка для Monaco */}
                        <div className="yaml-viewer-editor__canvas">
                            <div
                                key="monaco"
                                ref={containerRef}
                                style={{ width: '100%', height: '100%' }}
                            />

                            {/* Diff-контейнер — рендерится только в diff-режиме */}
                            {diffMode && (
                                <div
                                    ref={diffContainerRef}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0
                                    }}
                                />
                            )}

                            {loading && (
                                <div className="yaml-viewer-editor__loading">
                                    <div className="yaml-viewer-editor__loading-inner">
                                        <div className="yaml-viewer-editor__spinner" />
                                        <div className="yaml-viewer-editor__loading-text">
                                            {mode === "remote"
                                                ? "Загрузка актуальной схемы с сервера…"
                                                : "Загрузка содержимого…"}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {!loading && !monacoReady && !monacoError && (
                                <div className="yaml-viewer-editor__loading">
                                    Загрузка Monaco…
                                </div>
                            )}

                            {loadError && (
                                <div className="yaml-viewer-editor__error">
                                    Ошибка загрузки схемы: {loadError}
                                    <div style={{ marginTop: 8 }}>
                                        <button
                                            className="btn"
                                            onClick={() => setReloadKey((k) => k + 1)}
                                        >
                                            Повторить
                                        </button>
                                    </div>
                                </div>
                            )}

                            {monacoError && (
                                <div className="yaml-viewer-editor__error">
                                    Ошибка Monaco: {monacoError}
                                </div>
                            )}
                        </div>

                        {/* Карта секций */}
                        {lineMap && (
                            <div className="yaml-section-minimap">
                                {lineMap.sections.map((s) => {
                                    const totalLines = lineMap.sections.reduce((acc, curr) => acc + curr.linesCount, 0);
                                    const heightPercent = (s.linesCount / totalLines) * 100;

                                    // Используем filteredIssues, чтобы учитывать фильтр
                                    const sectionIssues = filteredIssues.filter((i) => {
                                        const line = findIssueLine(i, lineMap);
                                        return line && line >= s.line && line <= s.line + s.linesCount;
                                    });
                                    const hasError = sectionIssues.some((i) => i.severity === "error");
                                    const hasWarning = sectionIssues.some((i) => i.severity === "warning");

                                    return (
                                        <div
                                            key={s.key}
                                            className={
                                                "yaml-section-minimap__block " +
                                                (hasError ? "yaml-section-minimap__block--error" :
                                                    hasWarning ? "yaml-section-minimap__block--warning" :
                                                        "yaml-section-minimap__block--ok")
                                            }
                                            style={{ height: `${heightPercent}%` }}
                                            onClick={() => jumpTo(s.line)}
                                            title={`${s.label} (${s.count})${sectionIssues.length > 0 ? ` — ${sectionIssues.length} проблем` : ""}`}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {!isLocked && (
                            <div className="yaml-viewer-editor__mode">
                                <MIcon name="edit" size="sm" />
                                <span className="icon-label">Режим редактирования</span>
                            </div>
                        )}
                    </div>

                    {/* Right panel with tabs */}
                    <div className={"yaml-viewer-issues" + (rightCollapsed ? " yaml-viewer-issues--collapsed" : "")}>
                        <div className="yaml-viewer-tabs">
                            <button
                                className={"yaml-viewer-tab" + (rightTab === "issues" ? " active" : "")}
                                onClick={() => setRightTab("issues")}
                                title={`Проблемы${issueCount > 0 ? ` (${issueCount})` : ""}`}
                            >
                                <MIcon name="rule" size="sm" />
                                {issueCount > 0 && (
                                    <span
                                        className="yaml-viewer-tab__badge"
                                        title={staleIssueCount > 0 ? `из них ${staleIssueCount} — возможно, устарели` : undefined}
                                    >
                                        {issueCount}
                                    </span>
                                )}
                            </button>
                            <button
                                className={"yaml-viewer-tab" + (rightTab === "refs" ? " active" : "")}
                                onClick={() => setRightTab("refs")}
                                title={`Ссылки${refsCount > 0 ? ` (${refsCount})` : ""}`}
                            >
                                <MIcon name="link" size="sm" />
                                {refsCount > 0 && (
                                    <span className="yaml-viewer-tab__badge">{refsCount}</span>
                                )}
                            </button>
                            <button
                                className={"yaml-viewer-tab" + (rightTab === "backlinks" ? " active" : "")}
                                onClick={() => setRightTab("backlinks")}
                                title={`Используется${backlinks.entity.length + backlinks.attribute.length > 0
                                    ? ` (${backlinks.entity.length + backlinks.attribute.length})`
                                    : ""
                                    }`}
                            >
                                <MIcon name="call_received" size="sm" />
                                {backlinks.entity.length + backlinks.attribute.length > 0 && (
                                    <span className="yaml-viewer-tab__badge">
                                        {backlinks.entity.length + backlinks.attribute.length}
                                    </span>
                                )}
                            </button>
                            {serverAvailable && (
                                <button
                                    className={
                                        "yaml-viewer-tab" +
                                        (rightTab === "server" ? " active" : "") +
                                        (serverValidation && !serverValidating
                                            ? serverValidation.isValid
                                                ? " yaml-viewer-tab--ok"
                                                : " yaml-viewer-tab--err"
                                            : "")
                                    }
                                    onClick={() => setRightTab("server")}
                                    title={
                                        serverValidation?.isValid
                                            ? "Сервер: схема валидна"
                                            : serverValidation && !serverValidation.isValid
                                                ? `Сервер: ${serverValidation.diagnostics?.length || "!"} ошибок`
                                                : "Серверная валидация"
                                    }
                                >
                                    <MIcon
                                        name={
                                            serverValidating
                                                ? "hourglass_top"
                                                : serverValidation?.isValid
                                                    ? "cloud_done"
                                                    : serverValidation && !serverValidation.isValid
                                                        ? "cloud_off"
                                                        : "cloud"
                                        }
                                        size="sm"
                                    />
                                    {serverValidation && !serverValidation.isValid && (
                                        <span className="yaml-viewer-tab__badge yaml-viewer-tab__badge--err">
                                            {serverValidation.diagnostics?.length || "!"}
                                        </span>
                                    )}
                                    {serverValidation?.isValid && (
                                        <span className="yaml-viewer-tab__badge yaml-viewer-tab__badge--ok">
                                            ✓
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>

                        {rightTab === 'issues' && (
                            <IssuesPanel
                                issues={filteredIssues}
                                allIssuesCount={effectiveIssues.length}
                                onJump={jumpTo}
                                lineMap={lineMap}
                                severityFilter={severityFilter}
                                setSeverityFilter={setSeverityFilter}
                            />
                        )}
                        {rightTab === 'refs' && (
                            <ExternalRefsPanel
                                groups={externalRefs.groups}
                                scenarioRefs={scenarioRefs}
                                onJump={jumpTo}
                                currentDomain={domainId || ''}
                            />
                        )}
                        {rightTab === "backlinks" && (
                            <div className="yaml-issues">
                                <div className="yaml-issues__header">
                                    Используется{" "}
                                    {backlinks.target?.id && (
                                        <span style={{ color: "var(--accent-hover)", fontFamily: "'JetBrains Mono', monospace", marginLeft: 6 }}>
                                            {backlinks.target.type === "attribute" && backlinks.target.parentId
                                                ? `${backlinks.target.parentId}.${backlinks.target.id}`
                                                : backlinks.target.id}
                                        </span>
                                    )}
                                </div>

                                {!backlinks.target && (
                                    <div className="yaml-issues-empty">
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                                        Поставьте курсор на сущность или атрибут, чтобы увидеть входящие ссылки
                                    </div>
                                )}

                                {backlinks.target &&
                                    backlinks.entity.length === 0 &&
                                    backlinks.attribute.length === 0 && (
                                        <div className="yaml-issues-empty">
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                                            На {backlinks.target.type === "attribute" ? "этот атрибут" : "эту сущность"} ничего не ссылается
                                        </div>
                                    )}

                                {backlinks.entity.length > 0 && (
                                    <>
                                        <div className="yaml-issues__header" style={{ fontSize: 10 }}>
                                            На сущность {backlinks.target?.type === "attribute" ? backlinks.target.parentId : backlinks.target?.id} ({backlinks.entity.length})
                                        </div>
                                        <div className="yaml-issues__list">
                                            {backlinks.entity.map((bl, idx) => (
                                                <button key={`e-${idx}`} className="yaml-backlink" onClick={() => jumpTo(bl.line)}>
                                                    <MIcon name={bl.icon} size="sm" />
                                                    <span className="yaml-backlink__kind">{BACKLINK_KIND_LABELS[bl.kind]}</span>
                                                    <code className="yaml-backlink__id">{bl.label}</code>
                                                    {bl.detail && <span className="yaml-backlink__detail">{bl.detail}</span>}
                                                    <span className="yaml-backlink__line">:{bl.line}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {backlinks.attribute.length > 0 && (
                                    <>
                                        <div className="yaml-issues__header" style={{ fontSize: 10 }}>
                                            На атрибут {backlinks.target?.id} ({backlinks.attribute.length})
                                        </div>
                                        <div className="yaml-issues__list">
                                            {backlinks.attribute.map((bl, idx) => (
                                                <button key={`a-${idx}`} className="yaml-backlink" onClick={() => jumpTo(bl.line)}>
                                                    <MIcon name={bl.icon} size="sm" />
                                                    <span className="yaml-backlink__kind">{BACKLINK_KIND_LABELS[bl.kind]}</span>
                                                    <code className="yaml-backlink__id">{bl.label}</code>
                                                    {bl.detail && <span className="yaml-backlink__detail">{bl.detail}</span>}
                                                    <span className="yaml-backlink__line">:{bl.line}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {rightTab === "server" && (
                            <div className="yaml-issues">
                                <div className="yaml-issues__header">
                                    Серверная валидация
                                </div>

                                {!serverValidation && !serverValidating && (
                                    <div className="yaml-issues-empty">
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
                                        <div style={{ fontSize: 12, color: "var(--text-400)", marginBottom: 12 }}>
                                            Нажмите кнопку в шапке, чтобы отправить текущую схему на проверку.
                                        </div>
                                        <button className="btn btn--primary" onClick={handleServerValidate}>
                                            <MIcon name="cloud_upload" size="sm" />
                                            <span style={{ marginLeft: 6 }}>Проверить на сервере</span>
                                        </button>
                                    </div>
                                )}

                                {serverValidating && (
                                    <div className="yaml-issues-empty">
                                        <MIcon name="hourglass" size="xl" />
                                        <div>Проверка на сервере...</div>
                                    </div>
                                )}

                                {!serverValidating && serverValidation?.error && (
                                    <div className="yaml-issues-empty" style={{ color: "var(--danger)" }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
                                        <div style={{ fontSize: 12, marginBottom: 12 }}>
                                            {serverValidation.error}
                                        </div>
                                        <button className="btn" onClick={handleServerValidate}>
                                            Повторить
                                        </button>
                                    </div>
                                )}

                                {!serverValidating && serverValidation?.isValid && (
                                    <div className="yaml-issues-empty">
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                                        <div style={{ color: "var(--success)", fontSize: 13, marginBottom: 4 }}>
                                            Схема валидна
                                        </div>
                                        <div style={{ fontSize: 11, color: "var(--text-500)" }}>
                                            Проверено:{" "}
                                            {serverValidation.validatedAt
                                                ? new Date(serverValidation.validatedAt).toLocaleTimeString("ru-RU")
                                                : "только что"}
                                        </div>
                                        <button
                                            className="btn"
                                            onClick={handleServerValidate}
                                            style={{ marginTop: 12 }}
                                        >
                                            Проверить снова
                                        </button>
                                    </div>
                                )}

                                {!serverValidating &&
                                    serverValidation &&
                                    !serverValidation.isValid &&
                                    !serverValidation.error &&
                                    (serverValidation.diagnostics?.length || 0) > 0 && (
                                        <>
                                            <div className="yaml-issues__header">
                                                Ошибки сервера ({serverValidation.diagnostics!.length})
                                            </div>
                                            <div className="yaml-issues__list">
                                                {serverValidation.diagnostics!.map((d: any, i: number) => {
                                                    const label =
                                                        (d.labels || []).find((l: any) => l.primary) ||
                                                        (d.labels || [])[0];
                                                    const span = label?.span;
                                                    const isError = d.severity === "ERROR";
                                                    return (
                                                        <button
                                                            key={i}
                                                            className={
                                                                "yaml-issue yaml-issue--" +
                                                                (isError ? "error" : "warning")
                                                            }
                                                            onClick={() => {
                                                                if (
                                                                    span &&
                                                                    typeof span.start === "number" &&
                                                                    editorRef.current
                                                                ) {
                                                                    const model = editorRef.current.getModel();
                                                                    if (model) {
                                                                        const pos = model.getPositionAt(span.start);
                                                                        jumpTo(pos.lineNumber);
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            <span
                                                                className={
                                                                    "yaml-issue__dot yaml-issue__dot--" +
                                                                    (isError ? "error" : "warning")
                                                                }
                                                            />
                                                            <span className="yaml-issue__text">
                                                                {d.message}
                                                                {label?.message && (
                                                                    <span
                                                                        style={{
                                                                            display: "block",
                                                                            fontSize: 10,
                                                                            color: "var(--text-500)",
                                                                            marginTop: 2,
                                                                        }}
                                                                    >
                                                                        {label.message}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            {span &&
                                                                typeof span.start === "number" &&
                                                                editorRef.current?.getModel() && (
                                                                    <span className="yaml-issue__line">
                                                                        :{editorRef.current.getModel().getPositionAt(span.start).lineNumber}
                                                                    </span>
                                                                )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div style={{ padding: "8px 12px", textAlign: "center" }}>
                                                <button className="btn" onClick={handleServerValidate}>
                                                    Проверить снова
                                                </button>
                                            </div>
                                        </>
                                    )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {navContextMenu && (
                <NavContextMenu
                    state={navContextMenu}
                    focusTarget={focusTarget}
                    onFocus={() => handleFocus(navContextMenu.node, navContextMenu.sectionKey)}
                    onFocusWithDeps={() =>
                        handleFocusWithDeps(navContextMenu.node, navContextMenu.sectionKey)
                    }
                    onClearFocus={() => {
                        setFocusTarget(null);
                        setFocusIncludeDeps(false);
                        setNavContextMenu(null);
                    }}
                    onClose={() => setNavContextMenu(null)}
                />
            )}

            {/* Help modal */}
            {showHelp && <YamlViewerHelp onClose={() => setShowHelp(false)} />}
        </div>
    );
}

// ============ ExternalRefsPanel ============

function ExternalRefsPanel({
    groups,
    scenarioRefs,
    onJump,
    currentDomain,
}: {
    groups: ExternalRefGroup[];
    scenarioRefs: Array<{
        scenarioId: string;
        actions: Array<{
            line: number;
            scenarioId: string;
            actionId: string;
            actionName: string;
            workerTag?: string;
        }>;
    }>;
    onJump: (line: number) => void;
    currentDomain: string;
}) {
    if (groups.length === 0 && scenarioRefs.length === 0) {
        return (
            <div className="yaml-issues-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                <div style={{ color: "var(--text-400)", fontSize: 12 }}>
                    Нет ссылок на другие домены
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-500)" }}>
                    Домен изолирован в графе зависимостей
                </div>
            </div>
        );
    }

    const totalRefs = groups.reduce((s, g) => s + g.refs.length, 0);
    const totalScenarios = scenarioRefs.length;

    return (
        <div className="yaml-issues">
            {totalRefs > 0 && (
                <>
                    <div className="yaml-issues__header">
                        Внешние FQID-ссылки ({totalRefs} → {groups.length} доменов)
                    </div>
                    <div className="yaml-issues__list">
                        {groups.map((g) => (
                            <details key={g.domain} className="yaml-ext-refs-group" open>
                                <summary className="yaml-ext-refs-group__summary">
                                    <span className="yaml-ext-refs-group__chevron" aria-hidden="true" />
                                    <code className="yaml-ext-refs-group__domain">{g.domain}</code>
                                    <span className="yaml-ext-refs-group__count">{g.refs.length}</span>
                                </summary>
                                {g.refs.map((r, i) => (
                                    <button
                                        key={i}
                                        className="yaml-ext-ref"
                                        onClick={() => onJump(r.line)}
                                        title={`${r.lineText.trim()}\n\n${r.field}: ${r.raw}`}
                                    >
                                        <span className="yaml-ext-ref__line">:{r.line}</span>
                                        <span className="yaml-ext-ref__field">{r.field}</span>
                                        <code className="yaml-ext-ref__target">{r.target}</code>
                                    </button>
                                ))}
                            </details>
                        ))}
                    </div>
                </>
            )}

            {totalScenarios > 0 && (
                <>
                    <div
                        className="yaml-issues__header"
                        style={{
                            borderTop: totalRefs > 0 ? "1px solid var(--border)" : undefined,
                            marginTop: totalRefs > 0 ? 8 : 0,
                        }}
                    >
                        <MIcon name="movie" size="sm" />
                        {" "}Playbooks / скрипты ({totalScenarios})
                    </div>
                    <div className="yaml-issues__list">
                        {scenarioRefs.map((s) => (
                            <details
                                key={s.scenarioId}
                                className="yaml-ext-refs-group"
                                open
                            >
                                <summary className="yaml-ext-refs-group__summary">
                                    <span className="yaml-ext-refs-group__chevron" aria-hidden="true" />
                                    <code className="yaml-ext-refs-group__domain">
                                        {s.scenarioId}
                                    </code>
                                    <span className="yaml-ext-refs-group__count">
                                        {s.actions.length}
                                    </span>
                                </summary>
                                {s.actions.map((a, i) => (
                                    <button
                                        key={i}
                                        className="yaml-ext-ref"
                                        onClick={() => onJump(a.line)}
                                        title={`${a.actionId}: ${a.actionName}${a.workerTag ? "\nWorker: " + a.workerTag : ""}`}
                                    >
                                        <span className="yaml-ext-ref__line">:{a.line}</span>
                                        <span className="yaml-ext-ref__field">
                                            {a.actionName}
                                        </span>
                                        <code
                                            className="yaml-ext-ref__target"
                                            style={{ fontSize: 10, opacity: 0.7 }}
                                        >
                                            {a.actionId}
                                        </code>
                                    </button>
                                ))}
                            </details>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

function isIgnored(issue: any, ignoredSet: Set<string>): boolean {
    const sig = `dg-linter|${issue.message || ''}`;
    return ignoredSet.has(sig);
}

// ============ SectionNav / NavItem / FilteredNavList / IssuesPanel ============
function hasFieldInEntityBlock(
    fieldName: string,
    entityLine: number,
    lines: string[],
): boolean {
    const startIdx = entityLine - 1;
    const baseLine = lines[startIdx];
    if (!baseLine) return false;
    const entityIndent = (baseLine.match(/^(\s*)/) || ["", ""])[1].length;

    // Находим отступ прямых дочерних элементов
    let childIndent = -1;
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (indent <= entityIndent) return false;
        childIndent = indent;
        break;
    }
    if (childIndent === -1) return false;

    // Ищем только на уровне childIndent
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
        if (indent < childIndent) break;

        if (indent === childIndent) {
            const trimmed = line.trim();
            if (trimmed.startsWith("-") || trimmed.startsWith("#")) continue;
            const re = new RegExp(`^${fieldName}\\s*:`);
            if (re.test(trimmed)) return true;
        }
    }
    return false;
}

function hasFieldInAttributeBlock(
    fieldName: string,
    attrLine: number,
    lines: string[],
): boolean {
    const startIdx = attrLine - 1;
    const baseLine = lines[startIdx];
    if (!baseLine) return false;

    // Отступ текущего атрибута (позиция дефиса)
    const attrIndent = (baseLine.match(/^(\s*)/) || ["", ""])[1].length;

    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
        const trimmed = line.trim();

        // Если наткнулись на следующий атрибут (с таким же отступом и дефисом) - выходим
        if (indent === attrIndent && trimmed.startsWith("-")) break;

        // Если вышли из сущности - выходим
        if (indent < attrIndent) break;

        // Проверяем само поле
        const re = new RegExp(`^${fieldName}\\s*:`);
        if (re.test(trimmed)) return true;
    }
    return false;
}

type IssueState = "still" | "resolved" | "unknown";

/**
 * Резолвит строку сущности или её атрибута по паре (entityId, attributeId?).
 *
 * Поведение:
 *  - находит сущность регистронезависимо (с учётом того, что ModelIndex
 *    хранит fqid в lowercase, а в YAML — как в схеме);
 *  - если `attributeId` задан — ищет строку атрибута с camelCase-фоллбэком
 *    (переиспользует `findAttributeLineInMap`);
 *  - если атрибут не найден, но сущность есть — возвращает null,
 *    чтобы маркер не «уезжал» на строку сущности при переименованном
 *    атрибуте;
 *  - если сущности нет — null.
 *
 * Единая точка для обеих веток `findIssueLine`: и для propertyPath
 * `entities[...].attributes[...]`, и для пары `entityFqid + attributeId`.
 */
function resolveEntityOrAttributeLine(
    lineMap: LineMap,
    entityId: string,
    attributeId: string | null | undefined,
): number | null {
    if (!entityId) return null;

    const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
    if (!entitiesSection) return null;

    const entityNode = entitiesSection.nodes.find(
        (n) => n.id.toLowerCase() === entityId.toLowerCase(),
    );
    if (!entityNode) return null;

    if (!attributeId) return entityNode.line;

    const line = findAttributeLineInMap(
        entityNode.id,
        attributeId,
        lineMap,
    );
    return line;
}

/**
 * Ищет строку атрибута в lineMap, толерантно к переименованию под camelCase.
 * Возвращает 1-based строку или null.
 */
function findAttributeLineInMap(
    entityId: string,
    attrId: string,
    lineMap: LineMap,
): number | null {
    if (!entityId || !attrId) return null;

    // findAttributeInEntity чувствителен к регистру id. В ModelIndex
    // entityFqid хранится lowercase, а в lineMap — как в YAML
    // ("SummaryRequirementCalcs"). Найдём сущность регистронезависимо
    // и передадим её оригинальный регистр.
    const section = lineMap.sections.find((s) => s.key === "entities");
    if (!section) return null;

    const entity = section.nodes.find(
        (n) => n.id.toLowerCase() === entityId.toLowerCase(),
    );
    if (!entity) return null;

    const casedEntityId = entity.id;

    // 1) Прямое совпадение с id из issue (например, "assessment_quantitative")
    const exact = findAttributeInEntity(casedEntityId, attrId, lineMap);
    if (exact != null) return exact;

    // 2) camelCase-версия (например, "assessmentQuantitative") — для случая,
    //    когда пользователь УЖЕ переименовал атрибут, но серверный issue
    //    ещё не пересчитан.
    const parts = attrId.split(/[_\-]+/);
    if (parts.length > 1) {
        const camel = parts
            .map((p, i) =>
                i === 0
                    ? p.charAt(0).toLowerCase() + p.slice(1)
                    : p.charAt(0).toUpperCase() + p.slice(1),
            )
            .join("");
        const viaCamel = findAttributeInEntity(casedEntityId, camel, lineMap);
        if (viaCamel != null) return viaCamel;
    }

    return null;
}

/**
 * Находит текущее значение `type:` у action с заданным id в тексте.
 *   - null, если action не найден (удалён) или у него нет `type:`.
 *   - строку значения — если найдено.
 *
 * Опирается на lineMap: берёт стартовую строку action из sections[actions],
 * дальше идёт вниз, пока не встретит следующий `- id:` на том же отступе
 * (новый action) или строку с меньшим отступом (выход из секции).
 */
function getActionTypeFromText(
    actionId: string,
    lines: string[],
    lineMap: LineMap,
): string | null {
    const section = lineMap.sections.find((s) => s.key === "actions");
    if (!section) return null;

    const actionNode = section.nodes.find((n) => n.id === actionId);
    if (!actionNode) return null;

    const startLine = actionNode.line; // 1-based
    const startLineText = lines[startLine - 1] || "";
    const dashIndent = (startLineText.match(/^(\s*)/) || ["", ""])[1].length;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        const dashMatch = line.match(/^(\s*)-\s+id\s*:/);
        if (dashMatch && dashMatch[1].length === dashIndent) {
            // Следующий action — `type:` в нашем блоке не встретился
            return null;
        }

        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
        const trimmed = line.trim();
        if (
            indent < dashIndent &&
            trimmed &&
            /^[a-zA-Z_]/.test(trimmed)
        ) {
            // Вышли из секции actions
            return null;
        }

        if (indent > dashIndent) {
            const typeMatch = line.match(
                /^\s*type\s*:\s*['"]?([\w.-]+)['"]?\s*(?:#.*)?$/,
            );
            if (typeMatch) return typeMatch[1];
        }
    }

    return null;
}

/**
 * Классифицирует серверный lint-issue относительно ТЕКУЩЕГО текста.
 *
 *   still    — проблема точно осталась (мы знаем, как её перепроверить);
 *   resolved — проблема точно исправлена;
 *   unknown  — перепроверить локально нельзя (правило требует серверной
 *              сборки индекса). Не скрываем — показываем с пометкой
 *              «возможно устарело».
 *
 * Клиентские issues (`__clientOnly`) уже посчитаны по текущему тексту —
 * всегда `still`.
 */
function classifyIssue(
    issue: any,
    _currentText: string,
    _lineMap: LineMap | null,
    recheckModel: RecheckModel,
    index: ModelIndex | null,
): IssueState {
    if (issue.__clientOnly) return "still";
    return recheck(issue, recheckModel, index) as IssueState;
}

/**
 * Разбирает propertyPath вида `views[a].widgets[b].side` на цепочку
 * пар `[section, id]` и ищет самый глубокий узел в `lineMap.sections`.
 *
 * Нужно для правил, чей propertyPath указывает на вложенный item:
 *   - views[x].widgets[y].*   → строка виджета, не view
 *   - views[x].table.columns[c].* → строка колонки
 *   - linkages[x].attributes[a].* → строка атрибута связи
 *
 * Если id = ".." (как `menus[..].items[issues]`), возвращает текущий
 * уровень — lineMap не знает, какой именно parent имеется в виду.
 */
function findNestedPathLine(
    lineMap: LineMap,
    propertyPath: string,
): number | null {
    const pairs: Array<[string, string]> = [];
    const re = /([a-zA-Z][a-zA-Z0-9_]*)\[([^\]]+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(propertyPath)) !== null) {
        pairs.push([m[1], m[2]]);
    }
    if (pairs.length < 2) return null; // только top-level — пусть решает старый fallback

    const [firstKey, firstId] = pairs[0];
    if (firstId === "..") return null;

    const section = lineMap.sections.find((s) => s.key === firstKey);
    if (!section) return null;

    let current = section.nodes.find((n) => n.id === firstId);
    if (!current) return null;
    let line = current.line;

    const findNode = (nodes: NavNode[], id: string): NavNode | null => {
        for (const n of nodes) {
            if (n.id === id) return n;
            if (n.children) {
                const hit = findNode(n.children, id);
                if (hit) return hit;
            }
        }
        return null;
    };

    for (let i = 1; i < pairs.length; i++) {
        const id = pairs[i][1];
        if (id === "..") return line;
        if (!current.children) return line;
        const next = findNode(current.children, id);
        if (!next) return line;
        current = next;
        line = next.line;
    }
    return line;
}

function findIssueLine(issue: any, lineMap: LineMap | null): number | null {
    if (!lineMap) return null;

    // 1. Клиентские ошибки RQL
    if (issue.__clientOnly && typeof issue.line === 'number' && issue.line > 0) {
        return issue.line;
    }

    // 2. Поиск по propertyPath (если есть)
    if (issue.propertyPath) {
        const path = issue.propertyPath;

        // 2a. entities — единый резолвер (entity + attr с camelCase-фоллбэком)
        const entityMatch = path.match(/entities\[([^\]]+)\]/);
        if (entityMatch) {
            const entityId = entityMatch[1];
            const attrMatch = path.match(/attributes\[([^\]]+)\]/);
            const line = resolveEntityOrAttributeLine(
                lineMap,
                entityId,
                attrMatch ? attrMatch[1] : null,
            );
            if (line != null) return line;

            // если атрибут не нашли — не падаем на строку сущности:
            // лучше не рисовать маркер, чем рисовать его не там.
            if (attrMatch) return null;

            // fallback на itemLines (регистр как в YAML)
            const fallback = lineMap.itemLines.get(`entities#${entityId}`);
            if (fallback != null) return fallback;
        }

        // 2b. Вложенные пути: views[x].widgets[y], views[x].table.columns[c],
        //     linkages[x].attributes[a] и т.п.
        const nested = findNestedPathLine(lineMap, path);
        if (nested != null) return nested;

        // 2c. Fallback: top-level <section>[id]
        const sectionItemMatch = path.match(/^([a-zA-Z]+)\[([^\]]+)\]/);
        if (sectionItemMatch) {
            const line = lineMap.itemLines.get(
                `${sectionItemMatch[1]}#${sectionItemMatch[2]}`,
            );
            if (line != null) return line;
        }
    }

    // 3. Поиск по entityFqid — единый резолвер с camelCase-фоллбэком
    if (issue.entityFqid) {
        const entityId = issue.entityFqid.split("/")[1];
        if (!entityId) return null;

        const line = resolveEntityOrAttributeLine(
            lineMap,
            entityId,
            issue.attributeId ?? null,
        );
        if (line != null) return line;

        // Если атрибут задан, но не найден — null (не «уезжаем» на сущность).
        // Если атрибута нет — вернули бы line сущности из helper'а выше.
        if (issue.attributeId) return null;
    }

    // 4. Фоллбэк по секции
    const sectionMatch = (issue.propertyPath || '').match(/^([a-zA-Z]+)/);
    if (sectionMatch) {
        const sec = lineMap.sections.find((s) => s.key === sectionMatch[1]);
        if (sec) return sec.line;
    }
    return null;
}

// ============ SectionNav ============
function FilteredNavList({
    nodes,
    activeIdx,
    onJump,
    onHover,
    focusTarget,
    onFocus,
}: {
    nodes: ReturnType<typeof flatNavNodesType>;
    activeIdx: number;
    onJump: (line: number) => void;
    onHover: (idx: number) => void;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
}) {
    if (nodes.length === 0) {
        return (
            <div className="yaml-viewer-nav__empty">
                Ничего не найдено
            </div>
        );
    }

    return (
        <div className="yaml-nav-filtered">
            {nodes.map((n: any, i: number) => {
                const canFocus =
                    n.depth === 0 &&
                    (n.sectionKey === "entities" || n.sectionKey === "linkages");
                const isFocusActive = !!(
                    canFocus &&
                    focusTarget &&
                    ((focusTarget.kind === "entity" &&
                        n.sectionKey === "entities" &&
                        focusTarget.id === n.node.id) ||
                        (focusTarget.kind === "linkage" &&
                            n.sectionKey === "linkages" &&
                            focusTarget.id === n.node.id))
                );
                return (
                    <div
                        key={n.key + '#' + i}
                        className={
                            "yaml-nav-filtered-row" +
                            (i === activeIdx ? " yaml-nav-filtered-row--active" : "")
                        }
                        onMouseEnter={() => onHover(i)}
                    >
                        <button
                            type="button"
                            className={
                                "yaml-nav-filtered-item__main" +
                                (n.hasIssues ? " yaml-nav-filtered-item__main--issues" : "")
                            }
                            onClick={() => onJump(n.line)}
                            title={n.issuesPreview || undefined}
                        >
                            <code className="yaml-nav-filtered-item__id">
                                {n.label}
                            </code>
                            <span className="yaml-nav-filtered-item__section">
                                {n.sectionKey}
                            </span>
                            {n.hasIssues && (
                                <span
                                    className="yaml-nav-filtered-item__issues"
                                    title={n.issuesPreview || "Есть проблемы"}
                                >
                                    <MIcon name="warning" size="sm" />
                                </span>
                            )}
                            <span className="yaml-nav-filtered-item__line">:{n.line}</span>
                        </button>
                        {canFocus && (
                            <button
                                type="button"
                                className={
                                    "yaml-nav-filtered-item__focus" +
                                    (isFocusActive ? " yaml-nav-filtered-item__focus--active" : "")
                                }
                                onClick={() => onFocus(n.node, n.sectionKey)}
                                title={isFocusActive ? "Снять фокус" : "Фокус на этом элементе"}
                            >
                                <MIcon name="my_location" size="sm" />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Тип-хак: тип flatNavNodes выводится из возвращаемого значения
const flatNavNodesType = () => [] as Array<{
    key: string;
    label: string;
    line: number;
    depth: number;
    sectionKey: string;
    hasChildren: boolean;
    expanded: boolean;
    node: NavNode;
}>;

function SectionNav({
    section,
    expandedNodes,
    onToggleNode,
    onJump,
    issues,
    activeIdx,
    onSetActive,
    filteredNavNodes,
    sectionKey,
    entityIssuesMap,
    attrIssuesMap,
    focusTarget,
    onFocus,
    onContextMenu,
}: {
    section: SectionBlock;
    expandedNodes: Set<string>;
    onToggleNode: (key: string) => void;
    onJump: (line: number) => void;
    issues: any[];
    activeIdx: number;
    onSetActive: (idx: number) => void;
    filteredNavNodes: Array<{ key: string; line: number }>;
    sectionKey: string;
    entityIssuesMap: Map<string, any[]>;
    attrIssuesMap: Map<string, any[]>;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
    onContextMenu: (node: NavNode, sectionKey: string, x: number, y: number) => void;
}) {
    const detailsRef = React.useRef<HTMLDetailsElement>(null);

    React.useEffect(() => {
        if (detailsRef.current && detailsRef.current.dataset.initialized !== '1') {
            detailsRef.current.open = true;
            detailsRef.current.dataset.initialized = '1';
        }
    }, []);

    const sectionIssues = issues.filter(
        (i) => (i.propertyPath || '').toLowerCase().indexOf(section.key.toLowerCase()) !== -1
    );

    return (
        <details
            ref={detailsRef}
            className="yaml-nav-section"
            data-section-key={section.key}
        >
            <summary className="yaml-nav-section__head">
                <span className="yaml-nav-section__chevron" aria-hidden="true" />
                <span className="yaml-nav-section__label" title={`${section.linesCount} строк в секции`}>
                    {section.label}
                    <span className="yaml-nav-section__lines">~{section.linesCount}</span>
                </span>
                <span className="yaml-nav-section__count">{section.count}</span>
                {sectionIssues.length > 0 && (
                    <span className="yaml-nav-section__issues">⚠ {sectionIssues.length}</span>
                )}
                <button
                    type="button"
                    className="yaml-nav-section__jump"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onJump(section.line);
                    }}
                    title="Перейти к разделу"
                >
                    →
                </button>
            </summary>

            {section.nodes.length > 0 && (
                <div className="yaml-nav-section__items">
                    {section.nodes.map((node) => {
                        const issuesList =
                            sectionKey === "entities"
                                ? entityIssuesMap.get(node.id.toLowerCase())
                                : undefined;
                        return (
                            <NavItem
                                key={node.id}
                                node={node}
                                parentKey={section.key}
                                depth={0}
                                expandedNodes={expandedNodes}
                                onToggleNode={onToggleNode}
                                onJump={onJump}
                                activeIdx={activeIdx}
                                onSetActive={onSetActive}
                                filteredNavNodes={filteredNavNodes}
                                sectionKey={sectionKey}
                                hasIssues={!!issuesList && issuesList.length > 0}
                                issuesPreview={buildIssuesPreview(issuesList)}
                                entityIssuesMap={entityIssuesMap}
                                attrIssuesMap={attrIssuesMap}
                                focusTarget={focusTarget}
                                onFocus={onFocus}
                                onContextMenu={onContextMenu}
                            />
                        );
                    })}
                </div>
            )}
        </details>
    );
}

function NavItem({
    node,
    parentKey,
    depth,
    expandedNodes,
    onToggleNode,
    onJump,
    activeIdx,
    onSetActive,
    filteredNavNodes,
    sectionKey,
    hasIssues,
    issuesPreview,
    entityIssuesMap,
    attrIssuesMap,
    focusTarget,
    onFocus,
    onContextMenu,
}: {
    node: NavNode;
    parentKey: string;
    depth: number;
    expandedNodes: Set<string>;
    onToggleNode: (key: string) => void;
    onJump: (line: number) => void;
    activeIdx: number;
    onSetActive: (idx: number) => void;
    filteredNavNodes: Array<{ key: string; line: number }>;
    sectionKey: string;
    hasIssues: boolean;
    issuesPreview: string;
    entityIssuesMap: Map<string, any[]>;
    attrIssuesMap: Map<string, any[]>;
    focusTarget: FocusTarget | null;
    onFocus: (node: NavNode, sectionKey: string) => void;
    onContextMenu: (node: NavNode, sectionKey: string, x: number, y: number) => void;
}) {
    const key = parentKey + '#' + node.id;
    const hasChildren = !!node.children && node.children.length > 0;
    const expanded = expandedNodes.has(key);

    // Индекс этого узла в плоском списке — для подсветки активного
    const globalIdx = useMemo(
        () => filteredNavNodes.findIndex((n) => n.key === key),
        [filteredNavNodes, key]
    );
    const isActive = globalIdx >= 0 && globalIdx === activeIdx;

    return (
        <div className={'yaml-nav-item yaml-nav-item--d' + Math.min(depth, 4)}>
            <div
                className={
                    'yaml-nav-item__row' + (isActive ? ' yaml-nav-item__row--active' : '')
                }
                onContextMenu={(e) => {
                    if (depth !== 0) return;
                    if (sectionKey !== "entities" && sectionKey !== "linkages") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(node, sectionKey, e.clientX, e.clientY);
                }}
            >
                {hasChildren ? (
                    <button
                        type="button"
                        className={
                            'yaml-nav-item__chevron-btn' +
                            (expanded ? ' yaml-nav-item__chevron-btn--expanded' : '')
                        }
                        onClick={() => onToggleNode(key)}
                        aria-expanded={expanded}
                        title={expanded ? 'Свернуть' : 'Развернуть'}
                    />
                ) : (
                    <span className="yaml-nav-item__chevron-btn yaml-nav-item__chevron-btn--empty" />
                )}
                <button
                    type="button"
                    className="yaml-nav-item__head"
                    onClick={() => {
                        onJump(node.line);
                        if (globalIdx >= 0) onSetActive(globalIdx);
                    }}
                    onMouseEnter={() => globalIdx >= 0 && onSetActive(globalIdx)}
                >
                    <code className="yaml-nav-item__id">{node.id}</code>
                    {node.meta && <span className="yaml-nav-item__meta">{node.meta}</span>}
                    {hasIssues && (
                        <span
                            className="yaml-nav-item__issues"
                            title={issuesPreview || "Есть проблемы"}
                        >
                            <MIcon name="warning" size="sm" />
                        </span>
                    )}
                </button>
                {(sectionKey === "entities" || sectionKey === "linkages") && depth === 0 && (
                    <button
                        type="button"
                        className={
                            "yaml-nav-item__focus" +
                            (focusTarget &&
                                ((focusTarget.kind === "entity" && sectionKey === "entities" && focusTarget.id === node.id) ||
                                    (focusTarget.kind === "linkage" && sectionKey === "linkages" && focusTarget.id === node.id))
                                ? " yaml-nav-item__focus--active"
                                : "")
                        }
                        onClick={(e) => { e.stopPropagation(); onFocus(node, sectionKey); }}
                        title={focusTarget && focusTarget.id === node.id ? "Снять фокус" : "Фокус на этом элементе"}
                    >
                        <MIcon name="my_location" size="sm" />
                    </button>
                )}
            </div>

            {hasChildren && expanded && (
                <div className="yaml-nav-item__children">
                    {node.children!.map((child) => {
                        const childIssues =
                            sectionKey === "entities"
                                ? attrIssuesMap.get(child.id.toLowerCase())
                                : undefined;
                        return (
                            <NavItem
                                key={child.id}
                                node={child}
                                parentKey={key}
                                depth={depth + 1}
                                expandedNodes={expandedNodes}
                                onToggleNode={onToggleNode}
                                onJump={onJump}
                                activeIdx={activeIdx}
                                onSetActive={onSetActive}
                                filteredNavNodes={filteredNavNodes}
                                sectionKey={sectionKey}
                                hasIssues={!!childIssues && childIssues.length > 0}
                                issuesPreview={buildIssuesPreview(childIssues)}
                                entityIssuesMap={entityIssuesMap}
                                attrIssuesMap={attrIssuesMap}
                                focusTarget={focusTarget}
                                onFocus={onFocus}
                                onContextMenu={onContextMenu}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ============ Issues ============

function IssuesPanel({
    issues,
    allIssuesCount,
    onJump,
    lineMap,
    severityFilter,
    setSeverityFilter,
}: {
    issues: any[];
    allIssuesCount: number;
    onJump: (line: number) => void;
    lineMap: LineMap | null;
    severityFilter: Set<"error" | "warning" | "info">;
    setSeverityFilter: (s: Set<"error" | "warning" | "info">) => void;
}) {
    const [issueGroupMode, setIssueGroupMode] = useState<"rule" | "entity">("rule");

    const grouped = useMemo(() => {
        const map = new Map<string, any[]>();
        issues.forEach((i) => {
            // Группируем либо по правилу, либо по сущности
            const key = issueGroupMode === "rule"
                ? i.ruleId
                : (i.entityFqid ? i.entityFqid.split("/")[1] : "Без сущности");
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(i);
        });
        return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
    }, [issues, issueGroupMode]);

    const toggleSeverity = (sev: "error" | "warning" | "info") => {
        const next = new Set(severityFilter);
        if (next.has(sev)) next.delete(sev);
        else next.add(sev);
        setSeverityFilter(next);
    };

    return (
        <div className="yaml-issues">
            <div className="yaml-issues__severity">
                {(["error", "warning", "info"] as const).map((sev) => (
                    <button
                        key={sev}
                        className={
                            "yaml-issues__severity-btn yaml-issues__severity-btn--" +
                            sev +
                            (severityFilter.has(sev) ? " active" : "")
                        }
                        onClick={() => toggleSeverity(sev)}
                        title={`Показать/скрыть ${sev}`}
                    >
                        <span className="yaml-issues__severity-dot" />
                        {sev === "error" ? "Ошибки" : sev === "warning" ? "Предупр." : "Инфо"}
                    </button>
                ))}
            </div>

            <div className="yaml-issues__toolbar">
                <span style={{ fontSize: 11, color: "var(--text-500)" }}>Группировка:</span>
                <button
                    className={"yaml-issues__group-btn" + (issueGroupMode === "rule" ? " active" : "")}
                    onClick={() => setIssueGroupMode("rule")}
                >
                    По правилу
                </button>
                <button
                    className={"yaml-issues__group-btn" + (issueGroupMode === "entity" ? " active" : "")}
                    onClick={() => setIssueGroupMode("entity")}
                >
                    По сущности
                </button>
            </div>

            <div className="yaml-issues__header">
                Проблемы ({issues.length}
                {issues.length !== allIssuesCount ? ` / ${allIssuesCount}` : ""})
            </div>

            {issues.length === 0 ? (
                <div className="yaml-issues-empty">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                    {allIssuesCount > 0
                        ? "Нет проблем с выбранной severity"
                        : "Проблем не найдено"}
                </div>
            ) : (
                <div className="yaml-issues__list">
                    {grouped.map(([ruleId, items]) => (
                        <IssuesGroup
                            key={ruleId}
                            title={issueGroupMode === "rule" ? items[0].rule : ruleId}
                            ruleId={ruleId}
                            items={items}
                            lineMap={lineMap}
                            onJump={onJump}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function IssuesGroup({
    ruleId,
    title,
    items,
    lineMap,
    onJump
}: {
    ruleId: string;
    title: string;
    items: any[];
    lineMap: LineMap | null;
    onJump: (line: number) => void;
}) {
    const detailsRef = React.useRef<HTMLDetailsElement>(null);

    React.useEffect(() => {
        if (detailsRef.current && detailsRef.current.dataset.initialized !== '1') {
            detailsRef.current.open = true;
            detailsRef.current.dataset.initialized = '1';
        }
    }, []);

    return (
        <details ref={detailsRef} className="yaml-issues__group">
            <summary className="yaml-issues__group-title">
                <span className="yaml-issues__group-chevron" aria-hidden="true" />
                <span className="yaml-issues__group-label">{title}</span>
                <span className="yaml-issues__group-count">{items.length}</span>
            </summary>
            {items.map((issue, i) => {
                const line = findIssueLine(issue, lineMap);
                return (
                    <button
                        key={i}
                        type="button"
                        className={'yaml-issue yaml-issue--' + issue.severity}
                        onClick={() => line != null && onJump(line)}
                        disabled={line == null}
                    >
                        <span className={'yaml-issue__dot yaml-issue__dot--' + issue.severity} />
                        <span
                            className={
                                "yaml-issue__text" + (issue.__isUnknown ? " yaml-issue__text--stale" : "")
                            }
                        >
                            {issue.__isUnknown && (
                                <span
                                    className="yaml-issue__stale-badge"
                                    title="Требуется сохранение — серверный линтер перепроверит"
                                >
                                    ⏱{" "}
                                </span>
                            )}
                            {issue.message}
                        </span>
                        {line != null && <span className="yaml-issue__line">:{line}</span>}
                    </button>
                );
            })}
        </details>
    );
}

function buildIssuesPreview(issues: any[] | undefined): string {
    if (!issues || issues.length === 0) return "";
    const lines = issues
        .slice(0, 5)
        .map((i) => `• [${i.severity}] ${i.rule}: ${i.message}`);
    if (issues.length > 5) {
        lines.push(`...и ещё ${issues.length - 5}`);
    }
    return lines.join("\n");
}

function CrossDomainBadge({
    direction,
    count,
    domains,
    label,
    onDomainClick,
}: {
    direction: "in" | "out";
    count: number;
    domains: string[];
    label: string;
    onDomainClick: (d: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const closeTimer = useRef<any>(null);

    const onEnter = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setOpen(true);
    };
    const onLeave = () => {
        closeTimer.current = setTimeout(() => setOpen(false), 200);
    };

    return (
        <span
            className="yaml-viewer-info__item yaml-viewer-info__item--cross"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            style={{ position: "relative" }}
        >
            <strong>
                {direction === "out" ? "→" : "←"} {count}
            </strong>{" "}
            {label}
            {open && (
                <div
                    className="yaml-crossdomain-tooltip"
                    onMouseEnter={onEnter}
                    onMouseLeave={onLeave}
                >
                    <div className="yaml-crossdomain-tooltip__title">
                        {direction === "out"
                            ? "Ссылается на домены"
                            : "Ссылаются домены"}{" "}
                        ({domains.length}):
                    </div>
                    <div className="yaml-crossdomain-tooltip__list">
                        {domains.map((d) => (
                            <button
                                key={d}
                                className="yaml-crossdomain-tooltip__link"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDomainClick(d);
                                }}
                            >
                                <MIcon name="menu_book" size="sm" />
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </span>
    );
}
// ============ Backlinks ============

interface CursorTarget {
    type: 'entity' | 'attribute' | 'linkage' | 'action' | 'view' | 'dataRule' | 'mixin' | null;
    id: string | null;
    parentId?: string;
    section?: string;
}

interface Backlink {
    kind: 'inheritance' | 'reference' | 'linkage' | 'view' | 'dataRule' | 'mixin' | 'action' | 'widget';
    line: number;
    label: string;
    detail?: string;
    icon: string;
}

const BACKLINK_KIND_LABELS: Record<Backlink['kind'], string> = {
    inheritance: 'наследование',
    reference: 'reference',
    linkage: 'связь',
    view: 'view',
    dataRule: 'правило',
    mixin: 'примесь',
    action: 'действие',
    widget: 'виджет',
};

function detectCursorTarget(lines: string[], cursorLine: number): CursorTarget | null {
    if (cursorLine < 1 || cursorLine > lines.length) return null;

    // Ближайшая непустая строка (не комментарий)
    let effectiveLine = cursorLine;
    while (effectiveLine > 1) {
        const l = lines[effectiveLine - 1];
        if (l && l.trim() && !l.trim().startsWith("#")) break;
        effectiveLine--;
    }

    // Секция (indent 0)
    let section = "";
    for (let i = effectiveLine - 1; i >= 0; i--) {
        const m = lines[i].match(/^([a-zA-Z_][\w]*)\s*:/);
        if (m) {
            section = m[1];
            break;
        }
    }
    if (!section) return null;

    // Цепочка - id: от корня к курсору
    interface IdNode {
        id: string;
        indent: number;
        line: number;
    }
    const chain: IdNode[] = [];

    for (let i = effectiveLine - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;

        // Вышли из секции верхнего уровня
        if (indent === 0) break;

        const idm = line.match(/^\s*-\s+id\s*:\s*([^\s#]+)/);
        if (!idm) continue;

        const id = idm[1].replace(/["']/g, "");

        // unshift - только если это родитель (indent меньше текущего корня цепочки).
        // Siblings и потомки пропускаются.
        if (chain.length === 0 || indent < chain[0].indent) {
            chain.unshift({ id, indent, line: i });
        }
    }

    if (chain.length === 0) return null;

    const root = chain[0];
    const inner = chain[chain.length - 1];

    // Если в цепочке 2+ уровня и между ними есть `attributes:` — это атрибут
    if (chain.length >= 2 && inner.line > root.line) {
        const attrSectionRegex = /^\s*attributes\s*:\s*$/;
        for (let i = root.line + 1; i < inner.line; i++) {
            if (attrSectionRegex.test(lines[i])) {
                return {
                    type: "attribute",
                    id: inner.id,
                    parentId: root.id,
                    section,
                };
            }
        }
    }

    if (section === "entities") return { type: "entity", id: root.id, section };
    if (section === "linkages") return { type: "linkage", id: root.id, section };
    if (section === "actions") return { type: "action", id: root.id, section };
    if (section === "views") return { type: "view", id: root.id, section };
    if (section === "dataRules") return { type: "dataRule", id: root.id, section };
    if (section === "mixins") return { type: "mixin", id: root.id, section };
    return null;
}

function resolveEntityBacklinks(lines: string[], entityId: string): Backlink[] {
    const out: Backlink[] = [];

    const matches = (val: string): boolean => {
        if (val === entityId) return true;
        const slash = val.indexOf('/');
        return slash > 0 && val.slice(slash + 1) === entityId;
    };

    interface Block { id: string; indent: number; section: string; isAttribute: boolean; attrSectionIndent?: number; }
    const stack: Block[] = [];
    let section = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;

        if (indent === 0) {
            const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            if (sm) section = sm[1];
            stack.length = 0;
            continue;
        }

        const attrsMatch = line.match(/^(\s*)attributes\s*:\s*$/);
        if (attrsMatch) {
            const attrsIndent = attrsMatch[1].length;
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].indent < attrsIndent) {
                    stack[j].attrSectionIndent = attrsIndent;
                    break;
                }
            }
            continue;
        }

        const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idm) {
            const idIndent = idm[1].length;
            const id = idm[2].replace(/["']/g, '');
            while (stack.length && stack[stack.length - 1].indent >= idIndent) stack.pop();
            const parent = stack[stack.length - 1];
            const isAttribute =
                !!parent && parent.attrSectionIndent !== undefined && idIndent > parent.attrSectionIndent;
            stack.push({ id, indent: idIndent, section, isAttribute });
            continue;
        }

        const fm = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+)$/);
        if (!fm) continue;
        const field = fm[1];
        let value = fm[2].split(' #')[0].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        const top = stack[stack.length - 1];
        if (!top) continue;

        if (field === 'inherits' && matches(value) && top.section === 'entities' && !top.isAttribute) {
            out.push({ kind: 'inheritance', line: i + 1, label: top.id, detail: 'наследует', icon: 'account_tree' });
        }

        if (field === 'entity' && matches(value)) {
            if (top.section === 'entities' && top.isAttribute) {
                out.push({ kind: 'reference', line: i + 1, label: top.id, detail: 'Reference', icon: 'link' });
            } else if (top.section === 'views' && !top.isAttribute) {
                out.push({ kind: 'view', line: i + 1, label: top.id, detail: 'view сущности', icon: 'visibility' });
            } else if (top.section === 'dataRules' && !top.isAttribute) {
                out.push({ kind: 'dataRule', line: i + 1, label: top.id, detail: 'правило данных', icon: 'rule' });
            } else if (top.section === 'mixins' && !top.isAttribute) {
                out.push({ kind: 'mixin', line: i + 1, label: top.id, detail: 'примесь', icon: 'merge' });
            } else if (top.section === 'actions' && !top.isAttribute) {
                out.push({ kind: 'action', line: i + 1, label: top.id, detail: 'действие', icon: 'bolt' });
            }
        }

        // uiRules — ссылки из condition (проверяем, упоминается ли сущность в RQL)
        if (
            top.section === "uiRules" &&
            field === "condition" &&
            new RegExp(`\\b${entityId}\\b`).test(value)
        ) {
            out.push({
                kind: "dataRule",
                line: i + 1,
                label: top.id,
                detail: "UI Rule",
                icon: "rule",
            });
        }

        if ((field === 'side1' || field === 'side2') && matches(value) && top.section === 'linkages') {
            out.push({ kind: 'linkage', line: i + 1, label: top.id, detail: field, icon: 'link' });
        }
    }

    return out;
}

function resolveAttributeBacklinks(
    lines: string[],
    targetEntity: string,
    targetAttr: string,
): Backlink[] {
    const out: Backlink[] = [];

    const matches = (val: string): boolean => {
        if (val === targetEntity) return true;
        const slash = val.indexOf('/');
        return slash > 0 && val.slice(slash + 1) === targetEntity;
    };

    interface Block { id: string; indent: number; section: string; entityContext: string | null; }
    const stack: Block[] = [];
    let section = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;

        if (indent === 0) {
            const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            if (sm) section = sm[1];
            stack.length = 0;
            continue;
        }

        const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idm) {
            const idIndent = idm[1].length;
            const id = idm[2].replace(/["']/g, '');
            while (stack.length && stack[stack.length - 1].indent >= idIndent) stack.pop();
            const parent = stack[stack.length - 1];
            stack.push({ id, indent: idIndent, section, entityContext: parent?.entityContext || null });
            continue;
        }

        const fm = line.match(/^\s*(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+)$/);
        if (!fm) continue;
        const field = fm[1];
        let value = fm[2].split(' #')[0].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        const top = stack[stack.length - 1];
        if (!top) continue;

        if (field === 'entity' &&
            (top.section === 'views' || top.section === 'dataRules') &&
            matches(value)) {
            top.entityContext = targetEntity;
            continue;
        }

        if (field === 'attribute' && value === targetAttr) {
            // Ищем ближайший блок с нужным entityContext
            let contextIdx = -1;
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].entityContext === targetEntity) {
                    contextIdx = j;
                    break;
                }
            }
            if (contextIdx === -1) continue;

            // Поднимаемся до top-level (view или dataRule)
            let topLevelIdx = contextIdx;
            for (let j = contextIdx - 1; j >= 0; j--) {
                if (stack[j].section === 'views' || stack[j].section === 'dataRules') {
                    topLevelIdx = j;
                    break;
                }
            }

            const immediate = stack[contextIdx];
            const topLevel = stack[topLevelIdx];
            const isWidget = topLevel.id !== immediate.id && topLevel.section === 'views';

            out.push({
                kind: isWidget ? 'widget' : 'dataRule',
                line: i + 1,
                label: topLevel.id,
                detail: isWidget ? `виджет ${immediate.id}` : 'правило',
                icon: isWidget ? 'widgets' : 'rule',
            });
        }

        // uiRules: attribute упоминается в условии через @doc.attr
        if (
            top.section === "uiRules" &&
            field === "condition" &&
            new RegExp(`@doc\\.${targetAttr}\\b`).test(value)
        ) {
            // Ищем top-level uiRule
            let topLevelIdx = -1;
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].section === "uiRules") {
                    topLevelIdx = j;
                    break;
                }
            }
            if (topLevelIdx !== -1) {
                out.push({
                    kind: "dataRule",
                    line: i + 1,
                    label: stack[topLevelIdx].id,
                    detail: "UI Rule по атрибуту",
                    icon: "rule",
                });
            }
        }

        // uiRules: attribute упоминается через `- widget: editors_<attr>` или `attribute: <attr>`
        if (top.section === "uiRules" && field === "widget" && value.startsWith("editors_")) {
            const attrFromWidget = value.replace(/^editors_/, "");
            if (attrFromWidget === targetAttr) {
                // Ищем top-level uiRule
                let topLevelIdx = -1;
                for (let j = stack.length - 1; j >= 0; j--) {
                    if (stack[j].section === "uiRules") {
                        topLevelIdx = j;
                        break;
                    }
                }
                if (topLevelIdx !== -1) {
                    out.push({
                        kind: "widget",
                        line: i + 1,
                        label: stack[topLevelIdx].id,
                        detail: "UI Rule по виджету",
                        icon: "rule",
                    });
                }
            }
        }

        // actions.values[] — ссылается на атрибут
        if (top.section === "actions" && field === "attribute" && value === targetAttr) {
            // Ищем top-level action
            let topLevelIdx = -1;
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].section === "actions") {
                    topLevelIdx = j;
                    break;
                }
            }
            if (topLevelIdx !== -1) {
                out.push({
                    kind: "action",
                    line: i + 1,
                    label: stack[topLevelIdx].id,
                    detail: "массовое действие",
                    icon: "bolt",
                });
            }
        }
    }

    return out;
}

function FocusBar({
    target,
    result,
    includeDeps,
    onToggleDeps,
    onClear,
}: {
    target: FocusTarget;
    result: { relatedLines: number; totalLines: number } | null;
    includeDeps: boolean;
    onToggleDeps: (v: boolean) => void;
    onClear: () => void;
}) {
    const notFound = !result || result.relatedLines === 0;
    return (
        <div className="yaml-focus-bar">
            <span className="yaml-focus-bar__icon">
                <MIcon name="my_location" size="sm" />
            </span>
            <span className="yaml-focus-bar__label">
                Фокус: <strong>{target.id}</strong>
                <span className="yaml-focus-bar__kind">
                    {target.kind === "entity" ? " (сущность)" : " (связь)"}
                </span>
            </span>
            {result && (
                <span className="yaml-focus-bar__counter">
                    {result.relatedLines} / {result.totalLines} строк
                </span>
            )}
            {target.kind === "entity" && (
                <label
                    className="yaml-focus-bar__deps"
                    title="Показать dataTypes / sequences / counterColorPatterns из атрибутов и views"
                >
                    <input
                        type="checkbox"
                        checked={includeDeps}
                        onChange={(e) => onToggleDeps(e.target.checked)}
                    />
                    Зависимости
                </label>
            )}
            {notFound && (
                <span className="yaml-focus-bar__warn">⚠ не найдено в YAML</span>
            )}
            <button
                className="yaml-focus-bar__close"
                onClick={onClear}
                title="Снять фокус"
            >
                ✕
            </button>
        </div>
    );
}

function NavContextMenu({
    state,
    focusTarget,
    onFocus,
    onFocusWithDeps,
    onClearFocus,
    onClose,
}: {
    state: { x: number; y: number; node: NavNode; sectionKey: string };
    focusTarget: FocusTarget | null;
    onFocus: () => void;
    onFocusWithDeps: () => void;
    onClearFocus: () => void;
    onClose: () => void;
}) {
    const kind: FocusKind =
        state.sectionKey === "entities" ? "entity" : "linkage";
    const isThisFocused =
        !!focusTarget &&
        focusTarget.kind === kind &&
        focusTarget.id === state.node.id;

    // прижимаем к краям, чтобы не вылезало за viewport
    const MENU_W = 230;
    const MENU_H = 120;
    const x = Math.max(8, Math.min(state.x, window.innerWidth - MENU_W - 8));
    const y = Math.max(8, Math.min(state.y, window.innerHeight - MENU_H - 8));

    return (
        <div
            className="yaml-nav-ctx-menu"
            style={{ left: x, top: y }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <button
                type="button"
                className="yaml-nav-ctx-menu__item"
                onClick={() => {
                    onFocus();
                    onClose();
                }}
            >
                <MIcon name="my_location" size="sm" />
                {isThisFocused ? "Снять фокус" : "Фокус"}
            </button>
            {kind === "entity" && (
                <button
                    type="button"
                    className="yaml-nav-ctx-menu__item"
                    onClick={() => {
                        onFocusWithDeps();
                        onClose();
                    }}
                >
                    <MIcon name="account_tree" size="sm" />
                    Фокус с зависимостями
                </button>
            )}
            {focusTarget && !isThisFocused && (
                <>
                    <div className="yaml-nav-ctx-menu__divider" />
                    <button
                        type="button"
                        className="yaml-nav-ctx-menu__item"
                        onClick={() => {
                            onClearFocus();
                            onClose();
                        }}
                    >
                        <MIcon name="close" size="sm" />
                        Снять текущий фокус
                    </button>
                </>
            )}
        </div>
    );
}

function unquoteLite(s: string): string {
    const t = String(s || "").trim();
    if (
        (t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))
    ) {
        return t.slice(1, -1);
    }
    return t;
}