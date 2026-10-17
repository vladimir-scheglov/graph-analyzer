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
    applyRqlMarkers
} from '../../lib/monaco/monaco-providers';
import { extractExternalRefs, groupExternalRefs, ExternalRefGroup } from '../../lib/yaml/external-refs';
import { YamlViewerHelp } from './YamlViewerHelp';
import { readRemoteInfo } from '../../state/initial';
import { scanRqlInText } from '../../lib/monaco/rql-check';

type RightTab = 'issues' | 'refs';

export function YamlViewerModal() {
    const store = useGraphStore();
    const { index } = useModelIndex();
    const { ready: monacoReady, error: monacoError } = useMonacoLoader();

    const open = store.yamlViewerOpen;
    const filePath = store.yamlViewerFilePath;
    const fqid = store.yamlViewerFqid;
    const domainId = store.yamlViewerDomainId;

    const remoteInfo = useMemo(() => readRemoteInfo(), []);
    const isRemoteMode = !!(remoteInfo && remoteInfo.server);

    const { content: fetchedContent, loading, error: loadError } = useYamlContent(open ? filePath : null);

    const [content, setContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [liveVersion, setLiveVersion] = useState(0);
    const liveDebounce = useRef<any>(null);
    const [editorCreated, setEditorCreated] = useState(false);
    const [ignoredVersion, setIgnoredVersion] = useState(0);
    const [diffMode, setDiffMode] = useState(false);
    const [previousContent, setPreviousContent] = useState<string | null>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const diffEditorRef = useRef<any>(null);
    const [contentForPath, setContentForPath] = useState<string | null>(null);


    // При загрузке файла — сбросить оба
    useEffect(() => {
        if (loading) return;
        if (fetchedContent === null || fetchedContent === undefined) return;
        setContent(fetchedContent);
        setSavedContent(fetchedContent);
        setContentForPath(filePath);   // ← фиксируем: контент именно для этого файла
    }, [loading, fetchedContent, filePath]);

    // Слушаем правки в редакторе → debounce → setContent
    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const handler = () => {
            clearTimeout(liveDebounce.current);
            liveDebounce.current = setTimeout(() => {
                if (editorRef.current) {
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
    const isDirty = content !== savedContent;
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [copyFeedback, setCopyFeedback] = useState(false);
    const [saveFeedback, setSaveFeedback] = useState(false);

    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [navQuery, setNavQuery] = useState('');
    const navListRef = useRef<HTMLDivElement>(null);
    const [activeNavIdx, setActiveNavIdx] = useState(-1);

    // ============ Monaco refs ============
    const editorRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const saveRef = useRef<() => void>(() => { });

    // ============ Line map / schema ============
    const schema = useMemo(() => {
        if (!index || !domainId) return null;
        return index.schemasByDomain[domainId] || null;
    }, [index, domainId]);

    const lineMap = useMemo(() => {
        if (!content || !schema) return null;
        return buildLineMap(content, schema);
    }, [content, schema]);

    // ============ Issues ============
    const domainIssues = useMemo(() => {
        if (!index || !domainId) return [];
        return index.lint.lintReport.issues.filter((i) => i.domainId === domainId);
    }, [index, domainId]);

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

        return [...domainIssues, ...mapped];
    }, [domainIssues, lineMap, content, index, domainId]);

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
        }> = [];
        const walk = (node: NavNode, sectionKey: string, depth: number) => {
            const key = sectionKey + '#' + node.id;
            const hasChildren = !!node.children && node.children.length > 0;
            const expanded = expandedNodes.has(key);
            result.push({
                key,
                label: node.id,
                line: node.line,
                depth,
                sectionKey,
                hasChildren,
                expanded,
                node
            });
            if (hasChildren && expanded) {
                node.children!.forEach((child) => walk(child, key, depth + 1));
            }
        };
        lineMap.sections.forEach((s) => s.nodes.forEach((n) => walk(n, s.key, 0)));
        return result;
    }, [lineMap, expandedNodes]);

    const filteredNavNodes = useMemo(() => {
        const q = navQuery.trim().toLowerCase();
        if (!q) return flatNavNodes;
        return flatNavNodes.filter((n) => n.label.toLowerCase().indexOf(q) !== -1);
    }, [flatNavNodes, navQuery]);

    // ============ Monaco: create ============
    useEffect(() => {
        if (!open) return;
        if (!monacoReady) return;
        if (loading) return;
        if (!filePath) return;
        if (contentForPath !== filePath) return;   // ← ключевая проверка: контент для ЭТОГО файла
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
                    'editorLineNumber.activeForeground': '#94a3b8'
                }
            });
        } catch { }

        let editor: any = null;
        let ro: ResizeObserver | null = null;
        const layouts: ReturnType<typeof setTimeout>[] = [];

        try {
            editor = m.editor.create(containerRef.current, {
                value: content,
                language: 'yaml',
                theme: 'dg-dark',
                readOnly: isLocked,
                automaticLayout: true,
                fontSize: 13,
                lineNumbers: 'on',
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                folding: true,
                breadcrumbs: { enabled: true },
                fontFamily: 'JetBrains Mono, SF Mono, Monaco, monospace',
                renderWhitespace: 'selection',
                wordWrap: 'off',
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                occurrencesHighlight: 'off',
                selectionHighlight: false
            });
            editorRef.current = editor;
            setEditorCreated(true);

            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 0));
            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 100));
            layouts.push(setTimeout(() => { try { editor?.layout(); } catch { } }, 350));

            if (containerRef.current) {
                ro = new ResizeObserver(() => {
                    try { editor?.layout(); } catch { }
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
    }, [open, monacoReady, filePath, loading, contentForPath]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        // Ждём, пока контент будет соответствовать текущему файлу
        if (contentForPath !== filePath) return;
        if (!content) return;

        const current = editorRef.current.getValue();
        // Ставим только если реально отличается — иначе слетает позиция курсора
        if (current !== content) {
            editorRef.current.setValue(content);
        }
    }, [content, editorCreated, contentForPath, filePath]);

    // ============ Ctrl+S ============
    useEffect(() => {
        saveRef.current = handleSave;
    });

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

    // ============ Lock state sync ============
    useEffect(() => {
        if (!editorRef.current) return;
        try {
            editorRef.current.updateOptions({ readOnly: isLocked });
        } catch { }
    }, [isLocked, editorCreated]);

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
        const t = setTimeout(() => applyRqlMarkers(m, model), 100);
        return () => clearTimeout(t);
    }, [monacoReady, editorCreated, lineMap]);

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

        const markers = domainIssues
            .filter((issue) => !isIgnored(issue, ignored))
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
                    source: 'dg-linter'
                };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);

        m.editor.setModelMarkers(model, 'dg-linter', markers);
        return () => {
            try { m.editor.setModelMarkers(model, 'dg-linter', []); } catch { }
        };
    }, [monacoReady, editorCreated, lineMap, domainIssues]);

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
                    editorRef.current.setValue(savedContent);   // ← откат к последнему сохранённому
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

            // Обновляем savedContent и content одновременно
            setSavedContent(currentValue);
            setContent(currentValue);
            setLiveVersion((v) => v + 1);

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
        store.setYamlViewerOpen(false);
    }, [isDirty, isLocked, store]);

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

    useEffect(() => {
        setIsLocked(true);
        setSaveError(null);
        setSaveFeedback(false);
    }, [filePath]);

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
                store.setLintOpen(true);
            }
        };
        document.addEventListener('dg:issue-action', handler);
        return () => document.removeEventListener('dg:issue-action', handler);
    }, [domainId, store]);

    useEffect(() => {
        if (!open || !filePath) { setPreviousContent(null); return; }
        let cancelled = false;
        fetch('/file/previous?path=' + encodeURIComponent(filePath))
            .then((r) => (r.ok ? r.text() : null))
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
        if (!editorCreated || !editorRef.current) return;
        if (contentForPath !== filePath) return;
        if (!content) return;

        // Если редактор разблокирован — пользователь работает, не трогаем
        if (!isLocked) return;

        const current = editorRef.current.getValue();
        if (current !== content) {
            editorRef.current.setValue(content);
        }
    }, [content, editorCreated, contentForPath, filePath, isLocked]);

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

                        {previousContent != null && (
                            <button
                                className={'help-modal__icon-btn' + (diffMode ? ' active' : '')}
                                onClick={() => setDiffMode(!diffMode)}
                                title={diffMode ? 'Вернуться к редактору' : 'Показать diff с предыдущим сохранением'}
                            >
                                <MIcon name="difference" />
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
                    <div className="yaml-viewer-nav">
                        {loading && <div className="yaml-viewer-nav__loading">Загрузка...</div>}
                        {loadError && <div className="yaml-viewer-nav__error">{loadError}</div>}
                        {lineMap && (
                            <>
                                <div className="yaml-viewer-nav__header">
                                    <span>Навигация</span>
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
                                    {navQuery.trim() !== '' ? (
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
                                            />
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Editor */}
                    <div className="yaml-viewer-editor">
                        {/* Контейнер Monaco — ВСЕГДА первый и единственный в потоке.
      Условные overlay'и — absolute поверх, не влияют на reconciliation. */}
                        <div
                            key="monaco"
                            ref={containerRef}
                            style={{ width: '100%', height: '100%' }}
                        />

                        {(loading || (!monacoReady && !monacoError)) && (
                            <div
                                key="loading"
                                className="yaml-viewer-editor__loading"
                            >
                                {loading ? 'Загрузка содержимого...' : 'Загрузка Monaco...'}
                            </div>
                        )}

                        {monacoError && (
                            <div key="monaco-error" className="yaml-viewer-editor__error">
                                Ошибка Monaco: {monacoError}
                            </div>
                        )}

                        {loadError && (
                            <div key="load-error" className="yaml-viewer-editor__error">
                                Не удалось загрузить файл: {loadError}
                            </div>
                        )}

                        {!isLocked && (
                            <div key="mode" className="yaml-viewer-editor__mode">
                                ✏️ Режим редактирования
                            </div>
                        )}
                    </div>

                    {/* Right panel with tabs */}
                    <div className="yaml-viewer-issues">
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
                            <IssuesPanel issues={allIssues} onJump={jumpTo} lineMap={lineMap} />
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
// (остались из предыдущей итерации, только замените ссылки на yaml-nav-item--active если ещё не)

// findIssueLine — тоже из предыдущей итерации
function findIssueLine(issue: any, lineMap: LineMap | null): number | null {
    if (!lineMap) return null;

    // Client-side issue уже содержит готовый номер строки
    if (issue.__clientOnly && typeof issue.line === 'number' && issue.line > 0) {
        return issue.line;
    }

    // Server-side: из propertyPath
    const path = (issue.propertyPath || '').toLowerCase();
    const entityMatch = path.match(/entities\[([^\]]+)\]/);
    if (entityMatch) {
        const line = lineMap.itemLines.get(`entities#${entityMatch[1]}`);
        if (line != null) return line;
    }
    const sectionMatch = path.match(/([a-zA-Z]+)/);
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
            {nodes.map((n, i) => (
                <button
                    key={n.key + '#' + i}
                    className={
                        'yaml-nav-filtered-item' + (i === activeIdx ? ' yaml-nav-filtered-item--active' : '')
                    }
                    onClick={() => onJump(n.line)}
                    onMouseEnter={() => onHover(i)}
                >
                    <code className="yaml-nav-filtered-item__id">
                        {n.label}
                    </code>
                    <span className="yaml-nav-filtered-item__section">
                        {n.sectionKey}
                    </span>
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
    filteredNavNodes
}: {
    section: SectionBlock;
    expandedNodes: Set<string>;
    onToggleNode: (key: string) => void;
    onJump: (line: number) => void;
    issues: any[];
    activeIdx: number;
    onSetActive: (idx: number) => void;
    filteredNavNodes: Array<{ key: string; line: number }>;
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
                <span className="yaml-nav-section__label">{section.label}</span>
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
                    {section.nodes.map((node) => (
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
                        />
                    ))}
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
    filteredNavNodes
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
                </button>
            </div>

            {hasChildren && expanded && (
                <div className="yaml-nav-item__children">
                    {node.children!.map((child) => (
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
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ============ Issues ============

function IssuesPanel({
    issues,
    onJump,
    lineMap
}: {
    issues: any[];
    onJump: (line: number) => void;
    lineMap: LineMap | null;
}) {
    const grouped = useMemo(() => {
        const map = new Map<string, any[]>();
        issues.forEach((i) => {
            if (!map.has(i.ruleId)) map.set(i.ruleId, []);
            map.get(i.ruleId)!.push(i);
        });
        return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
    }, [issues]);

    if (issues.length === 0) {
        return (
            <div className="yaml-issues-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                Проблем не найдено
            </div>
        );
    }

    return (
        <div className="yaml-issues">
            <div className="yaml-issues__header">Проблемы ({issues.length})</div>
            <div className="yaml-issues__list">
                {grouped.map(([ruleId, items]) => (
                    <IssuesGroup
                        key={ruleId}
                        ruleId={ruleId}
                        items={items}
                        lineMap={lineMap}
                        onJump={onJump}
                    />
                ))}
            </div>
        </div>
    );
}

function IssuesGroup({
    ruleId,
    items,
    lineMap,
    onJump
}: {
    ruleId: string;
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
                <span className="yaml-issues__group-label">{items[0].rule}</span>
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