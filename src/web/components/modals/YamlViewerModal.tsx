import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '../../lib/monaco/monaco-providers';
import { useNavigation } from '../../hooks/useNavigation';
import { extractExternalRefs, groupExternalRefs, ExternalRefGroup } from '../../lib/yaml/external-refs';
import { YamlViewerHelp } from './YamlViewerHelp';
import { readRemoteInfo } from '../../state/initial';
import { scanRqlInText } from '../../lib/monaco/rql-check';
import { SECTION_LABELS } from '../../lib/consts';
import yaml from "js-yaml";

type RightTab = 'issues' | 'refs';

export function YamlViewerModal() {
    const { index } = useModelIndex();
    const { ready: monacoReady, error: monacoError } = useMonacoLoader();

    const open = useGraphStore((s) => s.yamlViewerOpen);
    const filePath = useGraphStore((s) => s.yamlViewerFilePath);
    const fqid = useGraphStore((s) => s.yamlViewerFqid);
    const domainId = useGraphStore((s) => s.yamlViewerDomainId);

    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const isRemoteMode = !!(remoteInfo && remoteInfo.server);

    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (open) setReloadKey((k) => k + 1);
    }, [open]);

    const { content: fetchedContent, loading, error: loadError } = useYamlContent(
        open ? filePath : null,
        reloadKey,
    );

    const [content, setContent] = useState('');
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
    const [leftWidth, setLeftWidth] = useState(280);
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

    const { goto: gotoDomain } = useNavigation();

    // ============ Monaco refs ============
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const saveRef = useRef<() => void>(() => { });
    const toggleLockRef = useRef<() => void>(() => { });
    const isLockedRef = useRef(isLocked);
    const isProgrammaticChange = useRef(false);

    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    // ============ Line map / schema ============
    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const lineMap = useMemo(() => {
        if (!content || !schema) return null;
        return buildLineMap(content, schema);
    }, [content, schema]);

    const currentContext = useMemo(() => {
        if (!lineMap) return null;
        return lineMap.lineContexts.get(cursorLine) || null;
    }, [lineMap, cursorLine]);

    // ============ Issues ============
    const domainIssues = useMemo(() => {
        if (!index || !domainId) return [];
        return index.lint.lintReport.issues.filter((i) => i.domainId === domainId);
    }, [index, domainId]);

    // Проверка синтаксиса YAML (включая отступы)
    const yamlSyntaxIssue = useMemo(() => {
        if (!content) return null;
        try {
            // Убираем кастомные теги !rql, чтобы js-yaml не ругался на них
            const textToValidate = content.replace(/!rql/g, "");
            yaml.load(textToValidate);
            return null;
        } catch (e: any) {
            const errLine = e.mark?.line !== undefined ? e.mark.line + 1 : 1;
            const errCol = e.mark?.column !== undefined ? e.mark.column + 1 : 1;
            const errMsg = e.reason || e.message.split('\n')[0] || "Ошибка синтаксиса YAML";

            return {
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
            };
        }
    }, [content, domainId]);

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
        if (!lineMap || !content || !domainId) return domainIssues;

        const rqlIssues = scanRqlInText(content, lineMap.lineContexts, index || null);

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
    }, [domainIssues, lineMap, content, index, domainId, yamlSyntaxIssue]);

    const filteredIssues = useMemo(
        () => allIssues.filter((i: any) => severityFilter.has(i.severity)),
        [allIssues, severityFilter],
    );

    // ============ External refs ============
    const [refsVersion, setRefsVersion] = useState(0);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const disposable = editorRef.current.onDidChangeModelContent(() => {
            setRefsVersion((v) => v + 1);
        });
        return () => {
            try { disposable?.dispose?.(); } catch { }
        };
    }, [editorCreated]);

    const externalRefs = useMemo(() => {
        if (!content || !domainId) return { refs: [], groups: [] as ExternalRefGroup[] };
        const refs = extractExternalRefs(content, domainId);
        return { refs, groups: groupExternalRefs(refs) };
    }, [content, domainId, liveVersion]);

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
            });
            editorRef.current = editor;
            setContent(fetchedContent);
            setSavedContent(fetchedContent);
            setEditorCreated(true);

            // Блокируем ввод, если файл заблокирован
            editor.onKeyDown((e: any) => {
                if (!isLockedRef.current) return;

                // Разрешаем навигацию и Escape
                const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', 'Tab'];
                if (navKeys.includes(e.browserEvent.key)) return;

                // Разрешаем системные шорткаты (Ctrl+C, Ctrl+F, Ctrl+S, Ctrl+Z)
                if (e.ctrlKey || e.metaKey) return;

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
                setCursorLine(e.position.lineNumber);
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
                    }, 50);
                });
                ro.observe(containerRef.current);
            }
        } catch (e) {
            console.error('[yaml-viewer] create failed', e);
        }

        return () => {
            layouts.forEach(clearTimeout);
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

    // Двойной Shift → переключение режима редактирования
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

        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("keyup", onKeyUp);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("keyup", onKeyUp);
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

    // ============ RQL markers ============
    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;
        const model = editorRef.current.getModel();
        if (!model) return;
        const t = setTimeout(() => {
            applyRqlMarkers(m, model);
            requestAnimationFrame(() => {
                if (!editorRef.current) return;
                try { editorRef.current.layout(); } catch { }
            });
        }, 100);
        return () => clearTimeout(t);
    }, [monacoReady, editorCreated, lineMap]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current) return;
        if (!index || !domainId) return;
        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        let timer: any = null;
        const runMarkers = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                applyFqidMarkers(m, model, index, domainId);
            }, 300); // Дебаунс 300мс
        };

        // Слушаем изменения модели напрямую, а не через React-стейт content
        const disposable = editorRef.current.onDidChangeModelContent(runMarkers);

        // Первый запуск
        runMarkers();

        return () => {
            if (timer) clearTimeout(timer);
            try { disposable?.dispose?.(); } catch { }
        };
    }, [monacoReady, editorCreated, index, domainId]);

    // ============ Issue markers ============
    const ignored = useMemo(() => {
        try {
            const key = `dg-yaml-ignored:${domainId}`;
            const raw = localStorage.getItem(key);
            return new Set<string>(raw ? JSON.parse(raw) : []);
        } catch { return new Set<string>(); }
    }, [domainId, ignoredVersion]);

    useEffect(() => {
        if (!monacoReady || !editorCreated || !editorRef.current || !lineMap) return;
        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        const currentText = model.getValue();
        const markers = domainIssues
            .filter((issue) => severityFilter.has(issue.severity))
            .filter((issue) => !isIgnored(issue, ignored))
            .filter((issue) => isIssueStillPresent(issue, currentText, lineMap))
            .map((issue) => {
                const line = findIssueLine(issue, lineMap);
                if (line == null) return null;
                // Реальный диапазон до конца строки — Monaco корректно рисует underline
                // и hover не «съезжает» на всю линию как на zero-width
                return {
                    severity:
                        issue.severity === 'error' ? m.MarkerSeverity.Error :
                            issue.severity === 'warning' ? m.MarkerSeverity.Warning :
                                m.MarkerSeverity.Info,
                    message: `[${issue.rule}] ${issue.message}${issue.hint ? '\n\n💡 ' + issue.hint : ''}`,
                    startLineNumber: line,
                    startColumn: 1,
                    endLineNumber: line,
                    endColumn: 1_000_000,
                    source: 'dg-linter',
                    code: issue.ruleId
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
    }, [monacoReady, editorCreated, lineMap, domainIssues, isLocked, content, severityFilter]);

    // ============ Jump ============
    const jumpTo = useCallback((line: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
    }, []);

    // ============ Auto-jump ============
    useEffect(() => {
        if (!open || !lineMap || !fqid || !editorCreated) return;
        const entityId = fqid.split('/')[1];
        if (!entityId) return;
        const line = lineMap.itemLines.get(`entities#${entityId}`);
        if (!line) return;
        const sectionEl = document.querySelector(
            '.yaml-nav-section[data-section-key="entities"]'
        ) as HTMLDetailsElement | null;
        if (sectionEl) sectionEl.open = true;
        setTimeout(() => jumpTo(line), 200);
    }, [open, lineMap, fqid, editorCreated, jumpTo]);

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
        if (isLocked || !editorRef.current) return;
        if (isRemoteMode) return;

        const currentValue = editorRef.current.getValue();

        if (currentValue === savedContent) {
            setSaveFeedback(true);
            setTimeout(() => setSaveFeedback(false), 1500);
            return;
        }

        // Предупреждение при наличии errors
        const errorCount = domainIssues.filter((i) => i.severity === "error").length;
        if (errorCount > 0) {
            const ok = confirm(
                `В схеме ${errorCount} ${errorCount === 1 ? "ошибка" : "ошибок"}. ` +
                `Всё равно сохранить? Ошибки могут привести к поломке домена.`,
            );
            if (!ok) return;
        }

        setIsSaving(true);
        setSaveError(null);

        try {
            const res = await fetch('/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, content: currentValue })
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
            setSavedContent(currentValue);
            setContent(currentValue);
            setLiveVersion((v) => v + 1);

            try {
                editorRef.current?.pushUndoStop();
            } catch { }

            setSaveFeedback(true);
            setTimeout(() => setSaveFeedback(false), 2000);
        } catch (err: any) {
            setSaveError(err.message || 'Ошибка сохранения');
        } finally {
            setIsSaving(false);
        }
    }, [isLocked, isRemoteMode, savedContent, filePath]);

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
    }, [filePath, open]);

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
        if (!lineMap || !content) return;
        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model) return;

        // Убираем комментарии, чтобы не считать их за использования
        const textWithoutComments = content.replace(/#[^\n]*/g, "");
        const newDecorations: any[] = [];

        const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
        if (entitiesSection) {
            entitiesSection.nodes.forEach((entityNode) => {
                if (!entityNode.children) return;
                entityNode.children.forEach((attrNode) => {
                    const attrId = attrNode.id;
                    const escaped = attrId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

                    // 1. Считаем, сколько раз этот ID вообще встречается в тексте (как отдельное слово)
                    const wordRegex = new RegExp(`\\b${escaped}\\b`, "g");
                    const allMatches = textWithoutComments.match(wordRegex)?.length || 0;

                    // 2. Считаем, сколько раз он встречается как "id: attrId" (т.е. само объявление)
                    const defRegex = new RegExp(`id:\\s*['"]?${escaped}['"]?`, "g");
                    const defMatches = textWithoutComments.match(defRegex)?.length || 0;

                    // 3. Если упоминаний больше, чем объявлений — значит атрибут где-то используется
                    const usages = allMatches - defMatches;

                    if (usages <= 0) {
                        newDecorations.push({
                            range: new m.Range(attrNode.line, 1, attrNode.line, 1),
                            options: {
                                isWholeLine: true,
                                className: "unused-attribute-line",
                                inlineClassName: "unused-attribute-text", // <--- Красим сам текст
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
        decorationsCollection.current = editorRef.current.createDecorationsCollection(newDecorations);

        return () => {
            if (decorationsCollection.current) decorationsCollection.current.clear();
        };
    }, [monacoReady, editorCreated, lineMap, content, liveVersion]);

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

    if (!open) return null;

    const canSave = !isRemoteMode && !isLocked && isDirty;
    const issueCount = allIssues.length;
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
                        {isDirty && <span className="help-modal__badge help-modal__badge--dirty">● изменён</span>}
                        {saveFeedback && <span className="help-modal__badge help-modal__badge--ok">✓ сохранён</span>}
                    </div>

                    <div className="help-modal__actions">
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
                                if (!domainId) {
                                    useGraphStore.getState().showSnackbar("Домен не определён для этого файла");
                                    return;
                                }

                                useGraphStore.getState().setYamlViewerOpen(false);
                                useGraphStore.getState().setDomainComparePrefillA(domainId);
                                useGraphStore.getState().setDomainCompareOpen(true);
                            }}
                            title="Сравнить домены"
                        >
                            <MIcon name="compare_arrows" />
                        </button>

                        <button
                            className="help-modal__icon-btn"
                            onClick={() => {
                                if (!domainId) {
                                    useGraphStore.getState().showSnackbar("Домен не определён для этого файла");
                                    return;
                                }

                                useGraphStore.getState().setYamlViewerOpen(false);
                                gotoDomain(domainId);
                            }}
                            title="Показать на графе"
                        >
                            <MIcon name="my_location" />
                        </button>

                        <button
                            className={'help-modal__icon-btn' + (!isLocked ? ' active' : '')}
                            onClick={handleToggleLock}
                            title={isLocked ? 'Разблокировать для редактирования' : 'Заблокировать (сбросить изменения)'}
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
                                isRemoteMode
                                    ? 'Сохранение недоступно в режиме --server'
                                    : isLocked
                                        ? 'Разблокируйте файл для сохранения'
                                        : isDirty
                                            ? 'Сохранить изменения (Ctrl+S)'
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
                                    useGraphStore.getState().setYamlViewerOpen(false);
                                    useGraphStore.getState().setDomainSchemaDomainId(domainId);
                                    useGraphStore.getState().setDomainSchemaOpen(true);
                                }}
                                title="Открыть структурированный обзор схемы"
                            >
                                <MIcon name="menu_book" />
                            </button>
                        )}

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
                        {loadError && <div className="yaml-viewer-nav__error">{loadError}</div>}
                        {lineMap && (
                            <>
                                <div className="yaml-viewer-nav__header">
                                    <span>Навигация</span>
                                    <button
                                        className={
                                            "yaml-viewer-nav__toggle" +
                                            (onlyProblematic ? " active" : "")
                                        }
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
                                        <button className="yaml-viewer-nav__action" onClick={expandAll} title="Развернуть всё">⤢</button>
                                        <button className="yaml-viewer-nav__action" onClick={collapseAll} title="Свернуть всё">⤡</button>
                                    </div>
                                </div>

                                <div className="yaml-viewer-nav__search">
                                    <span className="yaml-viewer-nav__search-icon">🔍</span>
                                    <input
                                        type="text"
                                        className="yaml-viewer-nav__search-input"
                                        placeholder="Фильтр по id..."
                                        value={navQuery}
                                        onChange={(e) => { setNavQuery(e.target.value); setActiveNavIdx(-1); }}
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
                                            />
                                        ))
                                    )}
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
                            <div className="yaml-viewer-breadcrumbs">
                                {currentContext ? (
                                    <>
                                        {currentContext.section && (
                                            <span className="yaml-viewer-breadcrumbs__item">
                                                {currentContext.section}
                                            </span>
                                        )}
                                        {currentContext.entityId && (
                                            <>
                                                <span className="yaml-viewer-breadcrumbs__sep">›</span>
                                                <span className="yaml-viewer-breadcrumbs__item yaml-viewer-breadcrumbs__item--entity">
                                                    {currentContext.entityId}
                                                </span>
                                            </>
                                        )}
                                        {currentContext.ruleId && !currentContext.entityId && (
                                            <>
                                                <span className="yaml-viewer-breadcrumbs__sep">›</span>
                                                <span className="yaml-viewer-breadcrumbs__item">
                                                    {currentContext.ruleId}
                                                </span>
                                            </>
                                        )}
                                        <span className="yaml-viewer-breadcrumbs__line">:{cursorLine}</span>
                                    </>
                                ) : (
                                    <span className="yaml-viewer-breadcrumbs__item">—</span>
                                )}
                            </div>

                            {lineMap && (
                                <div className="yaml-viewer-quickjumps">
                                    {lineMap.sections.map((s) => {
                                        const icon = s.key === 'entities' ? 'category'
                                            : s.key === 'linkages' ? 'link'
                                                : s.key === 'dataTypes' ? 'data_object'
                                                    : s.key === 'actions' ? 'bolt'
                                                        : s.key === 'views' ? 'visibility'
                                                            : s.key === 'menus' ? 'menu'
                                                                : s.key === 'mixins' ? 'merge'
                                                                    : s.key === 'dataRules' ? 'rule'
                                                                        : s.key === 'medias' ? 'image'
                                                                            : 'arrow_right';

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
                        </div>

                        {/* Обертка для Monaco */}
                        <div className="yaml-viewer-editor__canvas" style={{ width: '100%', height: '100%' }}>
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

                            {(loading || (!monacoReady && !monacoError)) && (
                                <div className="yaml-viewer-editor__loading">
                                    {loading ? 'Загрузка содержимого...' : 'Загрузка Monaco...'}
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
                                className={'yaml-viewer-tab' + (rightTab === 'issues' ? ' active' : '')}
                                onClick={() => setRightTab('issues')}
                            >
                                <MIcon name="rule" size="sm" />
                                <span>Проблемы</span>
                                {issueCount > 0 && <span className="yaml-viewer-tab__count">{issueCount}</span>}
                            </button>
                            <button
                                className={'yaml-viewer-tab' + (rightTab === 'refs' ? ' active' : '')}
                                onClick={() => setRightTab('refs')}
                            >
                                <MIcon name="link" size="sm" />
                                <span>Ссылки</span>
                                {refsCount > 0 && <span className="yaml-viewer-tab__count">{refsCount}</span>}
                            </button>
                        </div>

                        {rightTab === 'issues' && (
                            <IssuesPanel
                                issues={filteredIssues}
                                allIssuesCount={allIssues.length}
                                onJump={jumpTo}
                                lineMap={lineMap}
                                severityFilter={severityFilter}
                                setSeverityFilter={setSeverityFilter}
                            />
                        )}
                        {rightTab === 'refs' && (
                            <ExternalRefsPanel
                                groups={externalRefs.groups}
                                onJump={jumpTo}
                                currentDomain={domainId || ''}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Help modal */}
            {showHelp && <YamlViewerHelp onClose={() => setShowHelp(false)} />}
        </div>
    );
}

// ============ ExternalRefsPanel ============

function ExternalRefsPanel({
    groups,
    onJump,
    currentDomain
}: {
    groups: ExternalRefGroup[];
    onJump: (line: number) => void;
    currentDomain: string;
}) {
    if (groups.length === 0) {
        return (
            <div className="yaml-issues-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                <div style={{ color: 'var(--text-400)', fontSize: 12 }}>
                    Нет ссылок на другие домены
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-500)' }}>
                    Домен изолирован в графе зависимостей
                </div>
            </div>
        );
    }

    const totalRefs = groups.reduce((s, g) => s + g.refs.length, 0);

    return (
        <div className="yaml-issues">
            <div className="yaml-issues__header">
                Внешние ссылки ({totalRefs} → {groups.length} доменов)
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

function isIssueStillPresent(
    issue: any,
    currentText: string,
    lineMap: LineMap | null,
): boolean {
    if (issue.__clientOnly) return true;
    if (!lineMap) return true;

    const ruleId = String(issue.ruleId || "").toLowerCase();
    const lines = currentText.split("\n");

    const getEntityLine = (entityId: string): number | null => {
        const key = `entities#${entityId}`.toLowerCase();
        for (const [k, line] of lineMap.itemLines.entries()) {
            if (k.toLowerCase() === key) return line;
        }
        return null;
    };

    // Хелпер: поиск атрибута с фоллбэком на camelCase
    const getAttributeLine = (entityId: string, attrId: string): number | null => {
        // 1. Пытаемся найти через lineMap
        let line = findAttributeInEntity(entityId, attrId, lineMap);
        if (line) return line;

        // 2. Пробуем camelCase-версию
        const parts = attrId.split(/[_\-]+/);
        const camel = parts
            .map((p, i) => i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))
            .join("");
        line = findAttributeInEntity(entityId, camel, lineMap);
        if (line) return line;

        // 3. ФОЛЛБЭК: ищем строку с `- id: attrId` напрямую в тексте
        const re = new RegExp(`-\\s+id:\\s*['"]?${attrId}['"]?\\s*$`);
        for (let i = 0; i < lines.length; i++) {
            if (re.test(lines[i])) return i + 1;
        }

        return null;
    };

    // --- Entity: label ---
    if (ruleId.includes("entity-label") && issue.entityFqid) {
        const entityId = issue.entityFqid.split("/").pop();
        if (!entityId) return true;
        const entityLine = getEntityLine(entityId);
        if (!entityLine) return true;
        return !hasFieldInEntityBlock("label", entityLine, lines);
    }

    // --- Entity: description ---
    if (ruleId.includes("entity-description") && issue.entityFqid) {
        const entityId = issue.entityFqid.split("/").pop();
        if (!entityId) return true;
        const entityLine = getEntityLine(entityId);
        if (!entityLine) return true;
        return !hasFieldInEntityBlock("description", entityLine, lines);
    }

    // --- Attribute: description ---
    if (ruleId.includes("attribute-description") && issue.entityFqid && issue.attributeId) {
        const entityId = issue.entityFqid.split("/").pop();
        if (!entityId) return true;

        const attrLine = getAttributeLine(entityId, issue.attributeId);
        if (!attrLine) return true; // Атрибут не найден даже с camelCase

        return !hasFieldInAttributeBlock("description", attrLine, lines);
    }

    // --- Attribute: camelCase ---
    if (ruleId.includes("attribute-camelcase") && issue.attributeId) {
        const entityId = issue.entityFqid?.split("/").pop();
        if (entityId) {
            const attrLine = getAttributeLine(entityId, issue.attributeId);
            if (attrLine) {
                const line = lines[attrLine - 1] || "";
                const match = line.match(/id:\s*([a-zA-Z0-9_\-]+)/);
                if (match && match[1]) {
                    return !/^[a-z][a-zA-Z0-9]*$/.test(match[1]);
                }
            }
        }
        return !/^[a-z][a-zA-Z0-9]*$/.test(issue.attributeId);
    }

    // --- Entity: camelCase ---
    if (ruleId.includes("entity-camelcase") && issue.entityFqid) {
        const entityId = issue.entityFqid.split("/").pop() || "";
        if (/^[A-Z][a-zA-Z0-9]*$/.test(entityId)) return false;

        const parts = entityId.split(/[_\-]+/);
        const pascal = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
        if (getEntityLine(pascal)) return false;

        return true;
    }

    return true;
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
        const entityMatch = path.match(/entities\[([^\]]+)\]/);
        if (entityMatch) {
            const entityId = entityMatch[1];
            const attrMatch = path.match(/attributes\[([^\]]+)\]/);
            if (attrMatch) {
                const line = findAttributeInEntity(entityId, attrMatch[1], lineMap);
                if (line != null) return line;
            }
            const line = lineMap.itemLines.get(`entities#${entityId}`);
            if (line != null) return line;
        }
        const sectionItemMatch = path.match(/^([a-zA-Z]+)\[([^\]]+)\]/);
        if (sectionItemMatch) {
            const line = lineMap.itemLines.get(`${sectionItemMatch[1]}#${sectionItemMatch[2]}`);
            if (line != null) return line;
        }
    }

    // 3. Поиск по entityFqid (для проблем без propertyPath — description, label и т.д.)
    if (issue.entityFqid) {
        const entityId = issue.entityFqid.split("/")[1]; // регистр может быть любым
        const entitiesSection = lineMap.sections.find((s) => s.key === "entities");

        if (entitiesSection) {
            // Ищем сущность без учета регистра
            const entityNode = entitiesSection.nodes.find(
                (n) => n.id.toLowerCase() === entityId.toLowerCase()
            );

            if (entityNode) {
                // Если проблема на конкретном атрибуте
                if (issue.attributeId && entityNode.children) {
                    const findAttrRecursive = (nodes: NavNode[], attrId: string): number | null => {
                        for (const child of nodes) {
                            if (child.id.toLowerCase() === attrId.toLowerCase()) {
                                return child.line;
                            }
                            if (child.children) {
                                const res = findAttrRecursive(child.children, attrId);
                                if (res) return res;
                            }
                        }
                        return null;
                    };
                    const attrLine = findAttrRecursive(entityNode.children, issue.attributeId);
                    if (attrLine != null) return attrLine;
                }

                // Если атрибут не указан или не найден — возвращаем строку сущности
                return entityNode.line;
            }
        }
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
    onHover
}: {
    nodes: ReturnType<typeof flatNavNodesType>;
    activeIdx: number;
    onJump: (line: number) => void;
    onHover: (idx: number) => void;
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
            {nodes.map((n: any, i: number) => (
                <button
                    key={n.key + '#' + i}
                    className={
                        'yaml-nav-filtered-item' +
                        (i === activeIdx ? ' yaml-nav-filtered-item--active' : '') +
                        (n.hasIssues ? ' yaml-nav-filtered-item--issues' : '')
                    }
                    onClick={() => onJump(n.line)}
                    onMouseEnter={() => onHover(i)}
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
            ))}
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
    attrIssuesMap
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
    attrIssuesMap
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
                        <span className="yaml-issue__text">{issue.message}</span>
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