import React, { startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../../../state/useGraphStore';
import { useModelIndex } from '../../../hooks/useModelIndex';
import { useYamlContent, invalidateYamlCache } from '../../../hooks/useYamlContent';
import { useMonacoLoader } from '../../../hooks/useMonacoLoader';
import { MIcon } from '../../common/MIcon';
import { buildLineMap, LineMap, NavNode, SectionBlock, findAttributeInEntity } from '../../../lib/yaml/line-map';
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
    applyActionRequiredFieldsMarkers,
    INLINE_COVERED_RULE_IDS,
    buildQuickFix,
    applyWorkflowStatusRefMarkers,
    KNOWN_VALUE_FIELDS,
} from '../../../lib/monaco/monaco-providers';
import { useNavigation } from '../../../hooks/useNavigation';
import { extractExternalRefs, groupExternalRefs, ExternalRefGroup } from '../../../lib/yaml/external-refs';
import { YamlViewerHelp } from './YamlViewerHelp';
import { readRemoteInfo } from '../../../state/initial';
import { scanRqlInText } from '../../../lib/monaco/rql-check';
import { SECTION_LABELS } from '../../../lib/consts';
import { YamlSearchPanel, YamlSearchPanelHandle } from "./YamlSearchPanel";
import {
    SearchOptions,
    SearchMatch,
    SearchResult,
    DEFAULT_SEARCH_OPTIONS,
} from "../../../lib/yaml/yaml-search";
import yaml from "js-yaml";
import { computeFocus, FocusKind, FocusTarget } from '../../../lib/yaml/entity-focus';
import { SYSTEM_ATTRIBUTE_IDS } from '../../../../core/analyzer/linter';
import {
    buildRecheckModel,
    recheck,
    type RecheckModel,
} from '../../../../core/analyzer/local-recheck';
import { ModelIndex } from '../../../../shared/model-types';
import { KNOWN_ACTION_TYPES } from "../../../../shared/action-types";
import { SectionQuickNav } from "../SectionQuickNav";
import { planEdits } from "../../../lib/yaml/apply-generation";
import { findBlockRange } from "../../../lib/yaml/view-insert";
import { Popover } from "../../common/Popover";
import { relativeTime, pluralFew, escapeHtml } from '../../../lib/format';
import type { YamlExpertiseMeta } from '../../../hooks/useYamlContent';
import { computeUnusedInYaml, UnusedAnalysis } from '../../../lib/yaml/unused-analysis';
import { YamlQuickJump } from "./YamlQuickJump";
import { Hint, HINTS } from '../../common/Hint';
import { openFileInEditor } from '../../../lib/open-file';
import { getLineDiff } from '../../../lib/diff-lines';
import { hashPayload } from '../../../../core/analyzer/schema-generator/util-hash';
import { computePublishDiff } from '../../../lib/model/publish-diff';
import { suggestVersionBump } from '../../../lib/version-impact';
import { alertDialog, confirmDialog } from '../../../lib/dialogs';
import { SchemaHistoryModal } from '../SchemaHistoryModal';
// Добавить:
import {
    SectionNavPanel,
    FilteredNavList,
    parseNavQuery,
    isEmptyParsedQuery,
    getCategoryForSection,
    SECTION_CATEGORIES,
    severityOf,
    type FilteredRow,
    SectionIssueStats,
} from "./YamlViewerNavPanel";
import { yamlBackups } from '../../../lib/storage/yaml-backup';
import { applyAllFixes, MarkerWithFix } from '../../../lib/monaco/fix-all';
import { applyInlineDiffDecorations, buildLineDiffMarks } from '../../../lib/monaco/inline-diff';
import { computePreSaveImpact } from '../../../lib/model/pre-save-impact';
import { PinButton } from '../../annotations/PinButton';
import { Annotation, annotationsStore } from '../../../lib/storage/annotations';
import { isAutoFixable } from '../../../lib/monaco/quickfix-rules';

type RightTab = 'issues' | 'refs' | 'backlinks' | 'server';
type NavTab = "navigation" | "search" | "bookmarks";
type DiffAgainst = "previous" | "published" | null;
const EMPTY_BOOKMARKS: number[] = [];
const INLINE_SOURCES = [
    "attribute-validator",
    "fqid-validator",
    "dataType-validator",
    "enum-validator",
    "view-ref-validator",
    "ui-rule-validator",
    "attribute-ref-validator",
    "action-required-validator",
    "rql-check",
    "workflow-status-validator",
];

/**
 * Запускает серверную валидацию текущего контента.
 * Используется как предвалидация перед публикацией — чтобы не показывать
 * preview-модалку, если схема заведомо не пройдёт проверку.
 */
async function validateSourceCodeOnServer(sourceCode: string): Promise<{
    isValid: boolean;
    diagnostics?: any[];
    error?: string;
}> {
    try {
        const res = await fetch("/api/validate-single", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                isValid: false,
                error: data?.error || `HTTP ${res.status}`,
            };
        }
        return {
            isValid: !!data.isValid,
            diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics : [],
            error: data.error,
        };
    } catch (e: any) {
        return { isValid: false, error: e?.message || String(e) };
    }
}

/**
 * Превращает результат валидации в человекочитаемый текст для диалога.
 * Ограничивает вывод 30 диагностиками — дальше пользователь сам откроет
 * вкладку «Сервер» в правой панели.
 */
function formatValidationDiagnostics(v: {
    diagnostics?: any[];
    error?: string;
}): string {
    if (v.error) return v.error;
    const diags = v.diagnostics || [];
    if (diags.length === 0) {
        return "Сервер вернул «не валидна», но без диагностик. Откройте вкладку «Сервер» для деталей.";
    }
    const lines = diags.slice(0, 30).map((d: any) => {
        const sev = d.severity || "ERROR";
        const labels = (d.labels || [])
            .map((l: any) => l.message)
            .filter(Boolean);
        const labelText =
            labels.length > 0 ? "\n    " + labels.join("\n    ") : "";
        return `[${sev}] ${d.message}${labelText}`;
    });
    if (diags.length > 30) {
        lines.push(`…и ещё ${diags.length - 30} диагностик(и).`);
    }
    return lines.join("\n\n");
}

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

const normalizeEol = (s: string) => s.replace(/\r\n/g, "\n");

export function YamlViewerModal() {
    const { index } = useModelIndex();
    const { ready: monacoReady, error: monacoError } = useMonacoLoader();

    const open = useGraphStore((s) => s.yamlViewerOpen);
    const filePath = useGraphStore((s) => s.yamlViewerFilePath);
    const fqid = useGraphStore((s) => s.yamlViewerFqid);
    const domainId = useGraphStore((s) => s.yamlViewerDomainId);
    const pendingIssue = useGraphStore((s) => s.yamlViewerPendingIssue);
    const setPendingIssue = useGraphStore((s) => s.setYamlViewerPendingIssue);
    const pendingBlock = useGraphStore((s) => s.yamlViewerPendingBlock);
    const setPendingBlock = useGraphStore((s) => s.setYamlViewerPendingBlock);
    const yamlQuickNavEnabled = useGraphStore((s) => s.yamlQuickNavEnabled);
    const setYamlQuickNavEnabled = useGraphStore((s) => s.setYamlQuickNavEnabled);
    const [lastKnownMtime, setLastKnownMtime] = useState<number>(0);
    const lastEditAtRef = useRef<number | null>(null);
    const runAllMarkersRef = useRef<(() => void) | null>(null);

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

    const {
        content: fetchedContent,
        loading,
        error: loadError,
        contentSource,
        meta: contentMeta,
    } = useYamlContent(
        open ? filePath : null,
        reloadKey,
        mode === "remote",
    );

    // После saveDraft / publish — обновляем updatedAt/updatedBy оптимистично,
    // чтобы в шапке не висело «сохранён 5 минут назад» сразу после сохранения.
    const [metaOverride, setMetaOverride] = useState<Partial<YamlExpertiseMeta> | null>(null);
    const yamlMeta: YamlExpertiseMeta | null = contentMeta
        ? { ...contentMeta, ...(metaOverride || {}) }
        : null;

    useEffect(() => {
        useGraphStore.getState().setYamlViewerContentSource(open ? contentSource : null);
    }, [open, contentSource]);

    const [backupResolved, setBackupResolved] = useState(false);
    const [backupContent, setBackupContent] = useState<string | null>(null);
    const resolvedKeyRef = useRef<string | null>(null);
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
    const [diffAgainst, setDiffAgainst] = useState<DiffAgainst>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [previousContent, setPreviousContent] = useState<string | null>(null);
    const [publishedContent, setPublishedContent] = useState<string | null>(null);
    const diffContainerRef = useRef<HTMLDivElement>(null);
    const diffEditorRef = useRef<any>(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const [selection, setSelection] = useState<{ 
        chars: number;
        lines: number;
    } | null>(null);
    const [leftWidth, setLeftWidth] = useState(380);
    const isDraggingLeft = useRef(false);
    const decorationsCollection = useRef<any>(null);
    const appTheme = useGraphStore((s) => s.theme);
    const monacoTheme = appTheme === "light" ? "dg-light" : "dg-dark";
    const [editorTopLine, setEditorTopLine] = useState(1);
    const [scrollSignal, setScrollSignal] = useState(0);
    const pendingGeneration = useGraphStore((s) => s.yamlViewerPendingGeneration);
    const setPendingGeneration = useGraphStore((s) => s.setYamlViewerPendingGeneration);
    const yamlHighlightUnused = useGraphStore((s) => s.yamlHighlightUnused);
    const [quickJumpOpen, setQuickJumpOpen] = useState(false);
    const [quickJumpInitialQuery, setQuickJumpInitialQuery] = useState<string | null>(null);
    // ref — чтобы window-обработчик видел актуальный open без пересоздания listener'а
    const quickJumpOpenRef = useRef(false);
    useLayoutEffect(() => {
        quickJumpOpenRef.current = quickJumpOpen;
    }, [quickJumpOpen]);

    useEffect(() => {
        if (!open) {
            setQuickJumpOpen(false);
            setHistoryOpen(false);
        }
    }, [open]);

    const [idleContent, setIdleContent] = useState(content);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bookmarksDecorationsRef = useRef<any>(null);

    // ============ Скрытие затенённых строк при фокусе ============
    const [hideDimmed, setHideDimmed] = useState(false);
    const hideDimmedRef = useRef(false);
    useEffect(() => {
        hideDimmedRef.current = hideDimmed;
    }, [hideDimmed]);

    // Диапазоны, которые пользователь явно раскрыл через «Показать».
    // Ключ — стартовая строка диапазона.
    const [revealedRanges, setRevealedRanges] = useState<Set<number>>(
        () => new Set(),
    );
    const hiddenZonesRef = useRef<number[]>([]);

    useEffect(() => {
        // Не обновляем idleContent, если текст не менялся (первый mount)
        if (idleContent === content && idleTimerRef.current === null) return;

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            startTransition(() => setIdleContent(content));
        }, 1500);

        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [content]);

    // Поделиться: если в URL есть #q=..., открыть поповер с этим query.
    // Одноразово — после подстановки hash убирается.
    useEffect(() => {
        if (!open) return;
        try {
            const hash = window.location.hash || "";
            const m = hash.match(/[#&]q=([^&]*)/);
            if (!m) return;
            const decoded = decodeURIComponent(m[1]);
            if (!decoded) return;
            setQuickJumpInitialQuery(decoded);
            setQuickJumpOpen(true);
            // убрать hash, чтобы при перезагрузке не открывалось снова
            const url = new URL(window.location.href);
            url.hash = "";
            window.history.replaceState(null, "", url.toString());
        } catch {
            /* ignore */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

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
                startTransition(() => setYamlSyntaxIssue(null));
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
        }, 1000);
        return () => clearTimeout(t);
    }, [deferredContent, domainId, checksEnabled]);

    // ============ Эффект A: резолв бэкапа ============
    useEffect(() => {
        if (!open) {
            resolvedKeyRef.current = null;
            setBackupResolved(false);
            setBackupContent(null);
            return;
        }

        if (loading) return;
        if (!filePath) {
            resolvedKeyRef.current = "";
            setBackupResolved(true);
            return;
        }

        const key = `${filePath}#${hashPayload(normalizeEol(fetchedContent || ""))}`;
        if (resolvedKeyRef.current === key) return;

        let cancelled = false;

        (async () => {
            // IDB — асинхронно. Пока идёт чтение, параллельный запуск effect'а
            // (например, при смене filePath) не должен перезаписать ref.
            const backup = await yamlBackups.get(filePath);
            if (cancelled) return;
            if (resolvedKeyRef.current === key) return;

            // Ключевой гвард: если бэкап есть, а fetchedContent ещё не загрузился —
            // ждём следующий запуск effect'а. Иначе преждевременно резолвим и убиваем
            // валидный бэкап (та же логика, что была с `hasBackupNow`).
            if (!fetchedContent && backup) return;

            resolvedKeyRef.current = key;
            setBackupResolved(false);
            setBackupContent(null);

            if (!backup) {
                setBackupResolved(true);
                return;
            }

            const currentHash = hashPayload(normalizeEol(fetchedContent || ""));
            if (backup.savedContentHash !== currentHash) {
                // Файл на диске изменился (git pull, другая вкладка) — бэкап устарел
                await yamlBackups.delete(filePath);
                if (!cancelled) setBackupResolved(true);
                return;
            }

            const ok = await confirmDialog(
                "Найдены несохранённые правки",
                {
                    detail:
                        `Файл «${filePath.split(/[\\/]/).pop()}» ` +
                        `содержит несохранённые изменения от ` +
                        `${new Date(backup.savedAt).toLocaleTimeString()}.` +
                        `\n\nВосстановить их при открытии?`,
                    confirmLabel: "Восстановить",
                    cancelLabel: "Отменить правки",
                    variant: "warning",
                },
            );
            if (cancelled) return;

            if (ok) {
                setBackupContent(backup.content);
                setIsLocked(false);
                isLockedRef.current = false;
            } else {
                await yamlBackups.delete(filePath);
            }
            if (!cancelled) setBackupResolved(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [open, loading, fetchedContent, filePath]);

    const savedContentRef = useRef(savedContent);
    useEffect(() => {
        savedContentRef.current = savedContent;
    }, [savedContent]);

    /**
     * Если открытый suggest widget не содержит ни одной строки
     * (или в нём показано "No suggestions") — закрыть его.
     *
     * Monaco 0.52 не закрывает такой widget автоматически, и он
     * перехватывает ↑/↓, пока пользователь не нажмёт Esc.
     */
    const closeEmptySuggestWidget = useCallback(() => {
        const ed = editorRef.current;
        if (!ed) return;
        const widget = document.querySelector(".suggest-widget") as HTMLElement | null;
        if (!widget) return;
        if (widget.style.display === "none") return;
        if (widget.offsetParent === null) return;

        const rows = widget.querySelectorAll(".monaco-list-row");
        const isEmpty =
            widget.classList.contains("empty") ||
            widget.classList.contains("no-suggestions") ||
            rows.length === 0;
        if (!isEmpty) return;

        try {
            ed.trigger("dg", "hideSuggestWidget", null);
        } catch { /* ignore */ }
    }, []);

    // Слушаем правки в редакторе → debounce → setContent
    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;

        const handler = () => {
            // Если изменение сделали мы программно (при загрузке файла) — игнорируем
            if (isProgrammaticChange.current) return;

            if (yamlSyntaxIssue !== null) {
                const model = editorRef.current?.getModel();
                const m = (window as any).monaco;
                if (model && m) {
                    try { m.editor.setModelMarkers(model, "yaml-syntax", []); } catch { /* ignore */ }
                }
                startTransition(() => setYamlSyntaxIssue(null));
            }

            // Авто-разблокировка при редактировании (в т.ч. Quick Fix)
            if (isLockedRef.current) {
                setIsLocked(false);
                useGraphStore.getState().showSnackbar("Файл автоматически разблокирован для применения изменений");
            }

            window.setTimeout(closeEmptySuggestWidget, 40);
            lastEditAtRef.current = Date.now();
            clearTimeout(liveDebounce.current);
            liveDebounce.current = setTimeout(() => {
                if (!editorRef.current) return;
                const val = editorRef.current.getValue();

                // Тяжёлые вычисления (buildLineMap, computeUnusedInYaml, scanRqlInText)
                // не должны блокировать ввод в Monaco. startTransition помечает
                // re-render как low-priority — React сначала отдаёт кадр браузеру,
                // потом выполняет setContent.
                startTransition(() => {
                    setContent(val);
                    setLiveVersion((v) => v + 1);
                });

                // ─── АВТОСОХРАНЕНИЕ ─── (IDB, fire-and-forget: debounce 1с, гонки не страшны —
                // IDB сериализует транзакции per-store, last-write-wins)
                if (filePath) {
                    const currentSaved = savedContentRef.current;
                    if (normalizeEol(val) !== normalizeEol(currentSaved)) {
                        void yamlBackups.put({
                            filePath,
                            content: val,
                            savedContentHash: hashPayload(normalizeEol(currentSaved)),
                            savedAt: Date.now(),
                        });
                    } else {
                        void yamlBackups.delete(filePath);
                    }
                }
            }, 1000);
        };

        const sub = editorRef.current.onDidChangeModelContent(handler);
        return () => {
            clearTimeout(liveDebounce.current);
            try { sub?.dispose?.(); } catch { }
        };
    }, [editorCreated, filePath]);

    // ============ UI state ============
    const [rightTab, setRightTab] = useState<RightTab>('issues');
    const [showHelp, setShowHelp] = useState(false);
    const [isLocked, setIsLocked] = useState(true);
    const [onlyProblematic, setOnlyProblematic] = useState(false);
    const isDirty = normalizeEol(content) !== normalizeEol(savedContent);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveStage, setSaveStage] = useState<
        "idle" | "writing" | "publishing" | "validating"
    >("idle");
    const [copyFeedback, setCopyFeedback] = useState(false);
    const [saveFeedback, setSaveFeedback] = useState(false);
    const [inlineMarkersVersion, setInlineMarkersVersion] = useState(0);
    const inlineMarkersRef = useRef<Set<string> | null>(null);

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
    const [navTab, setNavTab] = useState<NavTab>("navigation");
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

    const [pinAnnotations, setPinAnnotations] = useState<Annotation[]>([]);
    const pinDecorationsRef = useRef<any>(null);

    // ============ Monaco refs ============
    const editorRef = useRef<any>(null);
    const previousFetchId = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const saveRef = useRef<() => void>(() => { });
    const publishRef = useRef<() => void>(() => { });
    const toggleLockRef = useRef<() => void>(() => { });
    const isLockedRef = useRef(isLocked);
    const isProgrammaticChange = useRef(false);

    const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
    const focusDecorationsRef = useRef<any>(null);
    const saveAbortRef = useRef<AbortController | null>(null);
    const editorTopLineRef = useRef(1);

    const tabs = useGraphStore((s) => s.editorTabs);
    const addTab = useGraphStore((s) => s.addEditorTab);
    const removeTab = useGraphStore((s) => s.removeEditorTab);

    useEffect(() => {
        if (open && filePath) addTab(filePath);
    }, [open, filePath, addTab]);

    const setYamlViewerLocked = useGraphStore((s) => s.setYamlViewerLocked);

    useEffect(() => {
        setYamlViewerLocked(isLocked);
    }, [isLocked, setYamlViewerLocked]);

    // Синхронизация dirty-state в store — чтобы openFileInEditor мог
    // предупредить о потере изменений перед переключением файла.
    useEffect(() => {
        useGraphStore.getState().setYamlViewerDirty(!!open && isDirty);
    }, [open, isDirty]);

    // Сброс флага при закрытии модалки
    useEffect(() => {
        if (open) return;
        useGraphStore.getState().setYamlViewerDirty(false);
        useGraphStore.getState().setYamlViewerPendingManifest(null);
    }, [open]);

    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    // Добавить рядом с остальными refs (после searchDecorationsRef и т. п.):
    const lastAutoScrolledQueryRef = useRef<string | null>(null);

    // Сбросить, когда поиск очищается — чтобы при повторном вводе того же
    // запроса всё-таки прокрутило к первому матчу.
    useEffect(() => {
        if (!searchQuery) lastAutoScrolledQueryRef.current = null;
    }, [searchQuery]);

    // ============ Line map / schema ============
    const effectiveDomainId = useMemo(() => {
        // 1. Явный domainId из store — приоритет
        if (domainId && index?.schemasByDomain[domainId]) return domainId;

        // 2. Фоллбэк: имя файла без .ro — обычно совпадает с id домена
        if (filePath) {
            const base = filePath.split(/[\\/]/).pop()?.replace(/\.ro$/i, "");
            if (base && index?.schemasByDomain[base]) return base;
        }

        // 3. Отдать как есть — buildLineMap теперь умеет жить без schema
        return domainId;
    }, [domainId, filePath, index]);

    const schema = useMemo(() => {
        if (!index || !effectiveDomainId) return null;
        return index.schemasByDomain[effectiveDomainId] || null;
    }, [index, effectiveDomainId]);

    const schemaMeta = schema?.metadata;
    const displayDomainName =
        schemaMeta?.name && schemaMeta.name !== schemaMeta.id
            ? schemaMeta.name
            : null;
    const publishedVersion = yamlMeta?.publishedVersion || null;

    // lineMap — дорогая операция (buildLineMap ~10–100ms на больших файлах).
    // Зависит от deferredContent, чтобы не блокировать keystroke'и.
    // Жертвуем микро-рассинхронизацией (lineMap может отставать от content
    // на 1–2 рендера при очень быстром наборе) — но это невидимо в UI,
    // т.к. currentContext gracefully handles «строка не найдена».
    const lineMap = useMemo(() => {
        if (!idleContent) return null;
        return buildLineMap(idleContent, schema);
    }, [idleContent, schema]);

    const currentContext = useMemo(() => {
        if (!lineMap) return null;
        return lineMap.lineContexts.get(cursorLine) || null;
    }, [lineMap, cursorLine]);

    const entityIdUnderCursor = useMemo(() => {
        return (
            currentContext?.breadcrumbs.find((b) => b.type === "entity")?.id ||
            null
        );
    }, [currentContext]);

    const cursorAttributeId = useMemo(() => {
        if (!currentContext) return null;
        const crumbs = currentContext.breadcrumbs;
        const entityIdx = crumbs.findIndex((b) => b.type === "entity");
        if (entityIdx === -1) return null;
        for (let i = crumbs.length - 1; i > entityIdx; i--) {
            if (crumbs[i].type === "attribute") return crumbs[i].id;
        }
        return null;
    }, [currentContext]);

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

    const dimmedCount = useMemo(() => {
        if (!focusResult) return 0;
        return Math.max(0, focusResult.totalLines - focusResult.lineLevel.size);
    }, [focusResult]);

    // Смена фокуса или toggle — забываем ручные раскрытия
    useEffect(() => {
        setRevealedRanges(new Set());
    }, [focusTarget, hideDimmed]);

    // Сняли фокус — выключаем режим
    useEffect(() => {
        if (!focusTarget && hideDimmed) setHideDimmed(false);
    }, [focusTarget, hideDimmed]);

    // ============ Issues ============
    // Полный набор серверных issues — для панели «Проблемы», навигации,
    // счётчиков. НЕ фильтруем inline-покрытые: пользователь должен видеть
    // их в панели (это реальные проблемы схемы), даже если в редакторе
    // уже есть inline-маркер.
    //
    // Фильтр INLINE_COVERED_RULE_IDS применяется отдельно — только
    // при установке маркеров dg-linter (см. эффект ниже), чтобы не
    // дублировать маркеры в gutter/overview-ruler.
    const domainIssues = useMemo(() => {
        if (!index || !effectiveDomainId) return [];
        return index.lint.lintReport.issues.filter(
            (i) => i.domainId === effectiveDomainId,
        );
    }, [index, effectiveDomainId]);

    // ============ Счётчики для шапки ============
    const counters = useMemo(() => {
        if (!schema) return null;
        const totalAttrs = schema.sections.entities.items.reduce(
            (s, x) => s + (x.attributesCount || 0), 0,
        );
        const sonar = effectiveDomainId
            ? index?.lint?.sonar?.byDomain?.[effectiveDomainId] || null
            : null;
        return {
            entities: schema.sections.entities.count,
            attributes: totalAttrs,
            linkages: schema.sections.linkages.count,
            views: schema.sections.views.count,
            issues: domainIssues.length,
            sonar,
        };
    }, [schema, domainIssues, index, effectiveDomainId]);

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

    const pinByLine = useMemo(() => {
        const map = new Map<number, Annotation[]>();
        const newPrefix = `line:${effectiveDomainId}:`;
        for (const a of pinAnnotations) {
            let line: number | null = null;
            if (a.target.startsWith(newPrefix)) {
                line = parseInt(a.target.slice(newPrefix.length), 10);
            } else if (a.target.startsWith("line:")) {
                // старый формат `line:<filePath>:<N>` — берём только номер
                const m = a.target.match(/:(\d+)$/);
                if (m) line = parseInt(m[1], 10);
            }
            if (line == null || isNaN(line)) continue;
            if (!map.has(line)) map.set(line, []);
            map.get(line)!.push(a);
        }
        return map;
    }, [pinAnnotations, effectiveDomainId]);

    /** Объединённые issues: серверный линтер + клиентский RQL-чек. */
    const allIssues = useMemo(() => {
        if (!checksEnabled) return domainIssues;
        if (!lineMap || !idleContent || !domainId) return domainIssues;

        const rqlIssues = scanRqlInText(idleContent, lineMap.lineContexts, index || null);
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

        if (yamlSyntaxIssue) {
            combined.unshift(yamlSyntaxIssue as any);
        }

        return combined;
    }, [domainIssues, lineMap, idleContent, index, domainId, yamlSyntaxIssue, checksEnabled]);

    const recheckModel = useMemo(
        () => buildRecheckModel(idleContent || ""),
        [idleContent],
    );

    const effectiveIssues = useMemo(() => {
        if (!checksEnabled) return allIssues;
        if (!isDirty || !lineMap) return allIssues;
        if (idleContent === savedContent) return allIssues;

        const out: any[] = [];
        for (const issue of allIssues) {
            const state = classifyIssue(issue, idleContent, recheckModel, index);
            if (state === "resolved") continue;

            // Правило покрывается inline-валидатором → доверяем inline.
            // Если inline сейчас не даёт маркер с этим (ruleId, line) —
            // проблема решена (или скрыта фильтром severity, что для панели
            // означает то же самое: показывать её не надо).
            if (
                INLINE_COVERED_RULE_IDS.has(issue.ruleId) &&
                inlineMarkersRef.current !== null
            ) {
                const line = findIssueLine(issue, lineMap);
                if (
                    line != null &&
                    !inlineMarkersRef.current.has(`${issue.ruleId}#${line}`)
                ) {
                    continue;
                }
            }

            if (state === "unknown") out.push({ ...issue, __isUnknown: true });
            else out.push(issue);
        }
        return out;
    }, [
        allIssues,
        isDirty,
        idleContent,
        lineMap,
        savedContent,
        recheckModel,
        index,
        inlineMarkersVersion,
    ]);

    // Стабильная ссылка для IssuesPanel: возвращаем prev, если содержимое
    // семантически не изменилось. Иначе IssuesPanel (React.memo по ref'у
    // issues) перерисовывается на каждый idleContent-пересчёт.
    const filteredIssuesRef = useRef<any[]>([]);
    const filteredIssues = useMemo(() => {
        const filtered = effectiveIssues.filter((i: any) =>
            severityFilter.has(i.severity),
        );
        const prev = filteredIssuesRef.current;
        const same =
            prev.length === filtered.length &&
            prev.every(
                (p, i) =>
                    p.ruleId === filtered[i].ruleId &&
                    p.entityFqid === filtered[i].entityFqid &&
                    p.attributeId === filtered[i].attributeId &&
                    p.message === filtered[i].message &&
                    p.__isUnknown === filtered[i].__isUnknown,
            );
        if (same) return prev;
        filteredIssuesRef.current = filtered;
        return filtered;
    }, [effectiveIssues, severityFilter]);

    const backlinks = useMemo(() => {
        if (rightTab !== "backlinks" || !deferredContent) {
            return { entity: [] as Backlink[], attribute: [] as Backlink[], target: null as CursorTarget | null };
        }

        const lines = deferredContent.split("\n");
        const target = detectCursorTarget(lines, cursorLine);
        if (!target || !target.id) {
            return { entity: [], attribute: [], target };
        }

        const entity: Backlink[] = [];
        const attribute: Backlink[] = [];

        switch (target.type) {
            case "entity":
                entity.push(...resolveEntityBacklinks(lines, target.id));
                break;
            case "attribute":
                if (target.parentId) {
                    entity.push(...resolveEntityBacklinks(lines, target.parentId));
                    attribute.push(...resolveAttributeBacklinks(lines, target.parentId, target.id));
                }
                break;
            case "linkage":
                entity.push(...resolveLinkageBacklinks(lines, target.id));
                break;
            case "action":
                entity.push(...resolveActionBacklinks(lines, target.id));
                break;
            case "view":
                entity.push(...resolveViewBacklinks(lines, target.id));
                break;
            case "dataType":
                entity.push(...resolveDataTypeBacklinks(lines, target.id));
                break;
            case "sequence":
                entity.push(...resolveSequenceBacklinks(lines, target.id));
                break;
            case "media":
                entity.push(...resolveMediaBacklinks(lines, target.id));
                break;
            case "tree":
                entity.push(...resolveTreeBacklinks(lines, target.id));
                break;
            case "counterColorPattern":
                entity.push(...resolveCounterColorBacklinks(lines, target.id));
                break;
            case "uiPreset":
                entity.push(...resolveUiPresetBacklinks(lines, target.id));
                break;
            case "permission":
                entity.push(...resolvePermissionBacklinks(lines, target.id));
                break;
            case "menuItem":
                entity.push(...resolveMenuItemBacklinks(lines, target.id));
                break;
            case "dataRule":
            case "mixin":
                // для них пока — только через entity/attribute, отдельных резолверов нет
                break;
        }

        return { entity, attribute, target };
    }, [deferredContent, cursorLine, rightTab]);

    const externalRefs = useMemo(() => {
        if (!idleContent || !domainId) return { refs: [], groups: [] as ExternalRefGroup[] };
        const refs = extractExternalRefs(idleContent, domainId);
        return { refs, groups: groupExternalRefs(refs) };
    }, [idleContent, domainId]);

    const scenarioRefs = useMemo(() => {
        if (!idleContent) return [] as Array<{
            scenarioId: string;
            actions: Array<{
                line: number;
                scenarioId: string;
                actionId: string;
                actionName: string;
                workerTag?: string;
            }>;
        }>;
        const lines = idleContent.split("\n");
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
    }, [idleContent]);

    // ============ Flat nav nodes ============
    // Анализ «что не используется» — обновляется вместе с контентом.
    // В отличие от серверного индекса, реагирует на генерацию и правки
    // сразу, без необходимости сохранять.
    const unusedAnalysis = useMemo(() => {
        if (!yamlHighlightUnused) return null;
        if (!lineMap || !idleContent) return null;
        try {
            return computeUnusedInYaml(idleContent, lineMap);
        } catch {
            return null;
        }
    }, [idleContent, lineMap, yamlHighlightUnused]);

    const flatNavNodes = useMemo(() => {
        if (!lineMap) return [];
        const result: FilteredRow[] = [];
        const walk = (
            node: NavNode,
            sectionKey: string,
            sectionLabel: string,
            depth: number,
            parentKey: string,
        ) => {
            const key = parentKey + "#" + node.id;
            const hasChildren = !!node.children && node.children.length > 0;
            const expanded = expandedNodes.has(key);

            let stats: SectionIssueStats = { error: 0, warning: 0, info: 0, total: 0 };
            if (sectionKey === "entities") {
                const list =
                    depth === 0
                        ? entityIssuesMap.get(node.id.toLowerCase())
                        : attrIssuesMap.get(node.id.toLowerCase());
                stats = severityOf(list);
            }

            // unused check
            let isUnused = false;
            let unusedHint: string | null = null;
            if (unusedAnalysis) {
                if (sectionKey === "entities") {
                    if (depth === 0 && unusedAnalysis.entities.has(node.id.toLowerCase())) {
                        isUnused = true;
                        unusedHint = "Сущность не используется";
                    } else if (depth === 1) {
                        const entityId = parentKey.split("#")[1];
                        if (entityId) {
                            const ak = `${entityId.toLowerCase()}:${node.id.toLowerCase()}`;
                            if (unusedAnalysis.attributes.has(ak)) {
                                isUnused = true;
                                unusedHint = "Атрибут не используется";
                            }
                        }
                    }
                } else if (depth === 0) {
                    if (sectionKey === "actions" && unusedAnalysis.actions.has(node.id)) {
                        isUnused = true;
                        unusedHint = "Действие не используется";
                    } else if (
                        sectionKey === "dataTypes" &&
                        unusedAnalysis.dataTypes.has(node.id)
                    ) {
                        isUnused = true;
                        unusedHint = "Тип данных не используется";
                    } else if (
                        sectionKey === "sequences" &&
                        unusedAnalysis.sequences.has(node.id)
                    ) {
                        isUnused = true;
                        unusedHint = "Последовательность не используется";
                    } else if (sectionKey === "medias" && unusedAnalysis.medias.has(node.id)) {
                        isUnused = true;
                        unusedHint = "Иконка не используется";
                    } else if (sectionKey === "trees" && unusedAnalysis.trees.has(node.id)) {
                        isUnused = true;
                        unusedHint = "Дерево не используется";
                    }
                }
            }

            result.push({
                key,
                label: node.id,
                line: node.line,
                depth,
                sectionKey,
                sectionLabel,
                node,
                issues: stats,
                isUnused,
                unusedHint,
                meta: node.meta,
                hasChildren,
                expanded,
            });

            if (hasChildren && expanded) {
                node.children!.forEach((child) =>
                    walk(child, sectionKey, sectionLabel, depth + 1, key),
                );
            }
        };
        lineMap.sections.forEach((s) =>
            s.nodes.forEach((n) => walk(n, s.key, s.label, 0, s.key)),
        );
        return result;
    }, [
        lineMap,
        expandedNodes,
        entityIssuesMap,
        attrIssuesMap,
        unusedAnalysis,
    ]);

    const sectionFilterKeys = useMemo(() => {
        if (!lineMap) return [];
        return lineMap.sections.map((s) => ({ key: s.key, label: s.label }));
    }, [lineMap]);

    const fileBookmarks = useGraphStore(
        (s) => (s.editorBookmarks || {})[filePath!] ?? EMPTY_BOOKMARKS,
    );
    const [bookmarksQuery, setBookmarksQuery] = useState("");
    const setEditorBookmarks = useGraphStore((s) => s.setEditorBookmarks);

    // Формируем список с текстом
    const bookmarkDetails = useMemo(() => {
        if (!fileBookmarks || fileBookmarks.length === 0) return [];
        const model = editorRef.current?.getModel();
        // idleContent вместо content — пересчёт раз в 3.5с, а не на каждый keystroke
        const lines = (idleContent || "").split("\n");
        return fileBookmarks.map((lineNum) => {
            const raw = model ? model.getLineContent(lineNum) : (lines[lineNum - 1] || "");
            const trimmed = raw.trim();
            return {
                line: lineNum,
                text: trimmed.slice(0, 100) + (trimmed.length > 100 ? "…" : ""),
                indent: raw.length - raw.trimStart().length,
                raw: raw,
            };
        });
    }, [fileBookmarks, idleContent, editorCreated]);

    const filteredBookmarks = useMemo(() => {
        const q = bookmarksQuery.trim().toLowerCase();
        if (!q) return bookmarkDetails;
        return bookmarkDetails.filter(
            (b) =>
                b.text.toLowerCase().includes(q) ||
                String(b.line) === q ||
                b.raw.toLowerCase().includes(q),
        );
    }, [bookmarkDetails, bookmarksQuery]);

    const parsedQuery = useMemo(() => parseNavQuery(navQuery), [navQuery]);

    const filteredNavNodes = useMemo(() => {
        let result = flatNavNodes;

        // Section filter (#entities)
        if (parsedQuery.sectionFilter) {
            result = result.filter((n) =>
                n.sectionKey.toLowerCase().includes(parsedQuery.sectionFilter!),
            );
        }

        // Type filter (type:enum / type:workflow / type:table)
        if (parsedQuery.typeFilter) {
            result = result.filter((n) => {
                if (!n.meta) return false;
                return n.meta.toLowerCase().includes(parsedQuery.typeFilter!);
            });
        }

        // Issues filter
        if (parsedQuery.hasIssues === true) {
            result = result.filter((n) => n.issues.total > 0);
        } else if (parsedQuery.hasIssues === false) {
            result = result.filter((n) => n.issues.total === 0);
        }

        // Unused filter
        if (parsedQuery.unused === true) {
            result = result.filter((n) => n.isUnused);
        } else if (parsedQuery.unused === false) {
            result = result.filter((n) => !n.isUnused);
        }

        // Legacy: onlyProblematic (checkbox)
        if (onlyProblematic) {
            result = result.filter((n) => n.issues.total > 0);
        }

        // Text search
        if (parsedQuery.text) {
            const q = parsedQuery.text;
            result = result.filter((n) => n.label.toLowerCase().includes(q));
        }

        return result;
    }, [flatNavNodes, parsedQuery, onlyProblematic]);

    const flatNavKeys = useMemo(
        () => filteredNavNodes.map((n) => n.key),
        [filteredNavNodes],
    );

    const activeKey = useMemo(
        () =>
            activeNavIdx >= 0 && activeNavIdx < flatNavKeys.length
                ? flatNavKeys[activeNavIdx]
                : null,
        [activeNavIdx, flatNavKeys],
    );

    // ============ Декорации закладок ============
    useEffect(() => {
        if (!editorCreated || !editorRef.current) {
            bookmarksDecorationsRef.current = null;
            return;
        }
        const monaco = (window as any).monaco;
        if (!monaco) return;

        // Коллекция создаётся один раз на жизнь редактора
        if (!bookmarksDecorationsRef.current) {
            bookmarksDecorationsRef.current =
                editorRef.current.createDecorationsCollection([]);
        }

        const decos = (fileBookmarks || []).map((line) => ({
            range: new monaco.Range(line, 1, line, 1),
            options: {
                isWholeLine: true,
                linesDecorationsClassName: "yaml-bookmark-line",
                glyphMarginClassName: "yaml-bookmark-glyph",
                glyphMarginHoverMessage: { value: `🔖 Закладка · строка ${line}` },
                overviewRuler: {
                    color: "#f59e0b",
                    position: monaco.editor.OverviewRulerLane.Left,
                },
            },
        }));

        try {
            bookmarksDecorationsRef.current.set(decos);
        } catch {
            /* ignore */
        }
    }, [editorCreated, fileBookmarks]);

    useEffect(() => {
        if (!open) {
            setBookmarksQuery("");
        }
    }, [open, filePath]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;
        const model = editorRef.current.getModel();
        if (!model) return;

        if (!pinDecorationsRef.current) {
            pinDecorationsRef.current = editorRef.current.createDecorationsCollection([]);
        }

        const decorations: any[] = [];
        const lineCount = model.getLineCount();

        pinByLine.forEach((anns, line) => {
            if (line < 1 || line > lineCount) return;

            // Monaco рендерит markdown → HTML-теги не работают. Используем
            // только markdown-синтаксис: **bold** и переносы строк.
            const header = `**📌 ${anns.length} ${anns.length === 1 ? "заметка" : "заметок"
                }**`;
            const body = anns.map((a) => `- ${a.text}`).join("\n");
            const value = `${header}\n\n${body}`;

            decorations.push({
                range: new m.Range(line, 1, line, 1),
                options: {
                    isWholeLine: false,
                    glyphMarginClassName: "yaml-pin-glyph",
                    glyphMarginHoverMessage: { value },
                },
            });
        });

        try {
            pinDecorationsRef.current.set(decorations);
        } catch {
            /* ignore */
        }
    }, [editorCreated, pinByLine]);

    // ============ Скрытие затенённых строк при фокусе ============
    // Идея: focusResult.lineLevel содержит ТОЛЬКО связанные строки
    // (primary/secondary/tertiary). Всё остальное — «затенено».
    // Скрываем эти строки через setHiddenAreas + добавляем между
    // диапазонами кликабельные плашки «⋯ N стр. скрыто».
    //
    // Линии с маркерами (warnings/errors линтера, YAML-синтаксис) НЕ
    // скрываем — иначе пользователь потеряет контекст проблем.
    useEffect(() => {
        if (!editorCreated) return;
        const editor = editorRef.current;
        const model = editor?.getModel();
        const monaco = (window as any).monaco;
        if (!editor || !model || !monaco) return;

        // ── 1. Собираем защищённые линии (маркеры линтера / YAML) ──
        const linesWithMarkers = new Set<number>();
        try {
            const markers = monaco.editor.getModelMarkers({ resource: model.uri });
            for (const mrk of markers) {
                if (mrk.severity < 4) continue; // warning / error only
                for (let l = mrk.startLineNumber; l <= mrk.endLineNumber; l++) {
                    linesWithMarkers.add(l);
                }
            }
        } catch {
            /* ignore */
        }
        for (const issue of effectiveIssues) {
            if (issue.severity === "info") continue;
            if (typeof issue.line === "number" && issue.line > 0) {
                linesWithMarkers.add(issue.line);
            }
        }
        if (yamlSyntaxIssue && typeof yamlSyntaxIssue.line === "number") {
            linesWithMarkers.add(yamlSyntaxIssue.line);
        }

        // ── 2. Выключено / нет фокуса — очищаем всё ──
        if (!hideDimmed || !focusResult || !focusTarget) {
            try {
                editor.setHiddenAreas([]);
            } catch {
                /* ignore */
            }
            try {
                editor.changeViewZones((acc) => {
                    for (const id of hiddenZonesRef.current) {
                        try {
                            acc.removeZone(id);
                        } catch {
                            /* ignore */
                        }
                    }
                });
            } catch {
                /* ignore */
            }
            hiddenZonesRef.current = [];
            return;
        }

        // ── 3. Кандидаты на скрытие: unrelated (без уровня) + не маркер ──
        const totalLines = model.getLineCount();
        const candidates: number[] = [];
        for (let l = 1; l <= totalLines; l++) {
            if (focusResult.lineLevel.has(l)) continue;
            if (linesWithMarkers.has(l)) continue;
            candidates.push(l);
        }

        // ── 4. Склеиваем в contiguous ranges ──
        const ranges: Array<{ start: number; end: number }> = [];
        let start = -1;
        let prev = -1;
        for (const l of candidates) {
            if (start < 0) {
                start = l;
                prev = l;
                continue;
            }
            if (l === prev + 1) {
                prev = l;
                continue;
            }
            ranges.push({ start, end: prev });
            start = l;
            prev = l;
        }
        if (start > 0) ranges.push({ start, end: prev });

        // ── 5. Убираем те, что пользователь раскрыл вручную ──
        const effectiveRanges = ranges.filter(
            (r) => !revealedRanges.has(r.start),
        );

        // ── 6. setHiddenAreas ──
        try {
            if (effectiveRanges.length === 0) {
                editor.setHiddenAreas([]);
            } else {
                editor.setHiddenAreas(
                    effectiveRanges.map(
                        (r) => new monaco.Range(r.start, 1, r.end, 1),
                    ),
                );
            }
        } catch (e) {
            console.warn("[hide-dimmed] setHiddenAreas failed:", e);
            return;
        }

        // ── 7. View zones: плашки «⋯ N стр. скрыто» между диапазонами ──
        try {
            editor.changeViewZones((acc) => {
                for (const id of hiddenZonesRef.current) {
                    try {
                        acc.removeZone(id);
                    } catch {
                        /* ignore */
                    }
                }
                hiddenZonesRef.current = [];

                for (const r of effectiveRanges) {
                    const count = r.end - r.start + 1;
                    const dom = document.createElement("div");
                    dom.className = "yaml-focus-hidden-zone";

                    const label = document.createElement("span");
                    label.className = "yaml-focus-hidden-zone__label";
                    label.textContent = `⋯ ${count} ${pluralFew(count, "строка", "строки", "строк")} скрыто (${r.start}–${r.end})`;

                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "yaml-focus-hidden-zone__reveal";
                    btn.textContent = "Показать";
                    btn.title = `Показать строки ${r.start}–${r.end}`;
                    btn.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        setRevealedRanges((prevSet) => {
                            const next = new Set(prevSet);
                            next.add(r.start);
                            return next;
                        });
                    });

                    dom.appendChild(label);
                    dom.appendChild(btn);

                    // afterLineNumber: 1-based; 0 = перед первой строкой
                    const afterLineNumber = Math.max(0, r.start - 1);
                    const id = acc.addZone({
                        afterLineNumber,
                        heightInLines: 1,
                        domNode: dom,
                    });
                    hiddenZonesRef.current.push(id);
                }
            });
        } catch (e) {
            console.warn("[hide-dimmed] addZone failed:", e);
        }
    }, [
        editorCreated,
        hideDimmed,
        focusResult,
        focusTarget,
        revealedRanges,
        effectiveIssues,
        yamlSyntaxIssue,
    ]);

    // Cleanup при dispose редактора
    useEffect(() => {
        return () => {
            const editor = editorRef.current;
            if (!editor) return;
            try {
                editor.setHiddenAreas([]);
            } catch {
                /* ignore */
            }
            try {
                editor.changeViewZones((acc) => {
                    for (const id of hiddenZonesRef.current) {
                        try {
                            acc.removeZone(id);
                        } catch {
                            /* ignore */
                        }
                    }
                });
            } catch {
                /* ignore */
            }
            hiddenZonesRef.current = [];
        };
    }, [editorCreated]);

    const closeEmptySuggestWidgetDirect = useCallback(() => {
        const ed = editorRef.current;
        if (!ed) return;

        const el = document.querySelector(".suggest-widget") as HTMLElement | null;
        if (!el) return;
        if (!el.classList.contains("visible")) return;

        const rows = el.querySelectorAll(".monaco-list-row");
        if (rows.length > 0) return; // widget с результатами — не трогаем

        try {
            const ctrl = ed.getContribution?.("editor.contrib.suggestController");
            const widget = (ctrl as any)?.widget?.value;
            if (!widget) return;

            if (typeof widget.hide === "function") {
                widget.hide();
            } else if (typeof widget._setVisible === "function") {
                widget._setVisible(false);
            } else if (typeof widget._setState === "function") {
                // 0 = Idle в SuggestController.State
                widget._setState(0);
            }
        } catch { /* ignore */ }
    }, []);

    const closeEmptySuggestWidgetDirectRef = useRef(closeEmptySuggestWidgetDirect);
    useEffect(() => {
        closeEmptySuggestWidgetDirectRef.current = closeEmptySuggestWidgetDirect;
    }, [closeEmptySuggestWidgetDirect]);

    // ============ Monaco: create ============
    useEffect(() => {
        if (!open) return;
        if (!monacoReady) return;
        if (loading) return;
        if (!backupResolved) return;
        if (!filePath) return;
        if (!fetchedContent) return;
        if (!containerRef.current) return;
        if (editorRef.current) return;

        const m = (window as any).monaco;
        if (!m || !m.editor) return;

        // Контент уже разрешён — либо бэкап, либо файл с диска
        const initialContent = backupContent ?? fetchedContent;
        const restoredFromBackup = backupContent !== null;

        const onKeyDownCapture = (e: KeyboardEvent) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            const ed = editorRef.current;
            if (!ed) return;
            if (!ed.hasTextFocus()) return;

            const widget = document.querySelector(".suggest-widget") as HTMLElement | null;
            if (!widget || !widget.classList.contains("visible")) return;
            if (widget.querySelectorAll(".monaco-list-row").length > 0) return;

            // Widget открыт, но пуст — Monaco будет перехватывать стрелки впустую.
            // Закрываем widget и вручную перемещаем курсор в редакторе.
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            closeEmptySuggestWidgetDirectRef.current();

            const pos = ed.getPosition();
            if (!pos) return;
            const lineCount = ed.getModel()?.getLineCount() ?? 1;
            const targetLine =
                e.key === "ArrowUp"
                    ? Math.max(1, pos.lineNumber - 1)
                    : Math.min(lineCount, pos.lineNumber + 1);

            ed.setPosition({ lineNumber: targetLine, column: pos.column });
            ed.revealLineInCenterIfOutsideViewport(targetLine);
        };

        // Если восстанавливаем бэкап, принудительно переводим в режим редактирования!
        if (restoredFromBackup) {
            setIsLocked(false);
            isLockedRef.current = false;
        }

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

            m.editor.defineTheme("dg-light", {
                base: "vs",
                inherit: true,
                rules: [],
                colors: {
                    "editor.background": "#ffffff",
                    "editor.foreground": "#0f172a",
                    "editorLineNumber.foreground": "#94a3b8",
                    "editorLineNumber.activeForeground": "#475569",

                    // === Цвета для автокомплита (Suggest Widget) ===
                    "editorSuggestWidget.background": "#ffffff",
                    "editorSuggestWidget.foreground": "#0f172a",
                    "editorSuggestWidget.selectedBackground": "#f1f5f9",
                    "editorSuggestWidget.highlightForeground": "#4f46e5",
                    "editorSuggestWidget.border": "#e2e8f0",
                    "editorSuggestWidget.selectedForeground": "#0f172a",
                    "editorSuggestWidget.focusHighlightForeground": "#4338ca",
                },
            });
        } catch { }

        let editor: any = null;
        let ro: ResizeObserver | null = null;
        const layouts: ReturnType<typeof setTimeout>[] = [];
        let cursorTimer: ReturnType<typeof setTimeout> | null = null;

        try {
            isProgrammaticChange.current = true;

            editor = m.editor.create(containerRef.current, {
                value: initialContent,
                language: 'yaml',
                theme: monacoTheme,
                readOnly: false,
                glyphMargin: true,
                automaticLayout: false,
                fontSize: 13,
                minimap: { enabled: false },
                overviewRulerLanes: 0,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                folding: true,
                foldingStrategy: 'indentation',
                breadcrumbs: { enabled: true },
                fontFamily: 'JetBrains Mono, SF Mono, Monaco, monospace',
                renderWhitespace: 'selection',
                wordWrap: 'off',
                scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
                occurrencesHighlight: 'off',
                selectionHighlight: false,
                renderValidationDecorations: 'on',
                lightbulb: { enabled: 'on' },
                wordBasedSuggestions: "off",
                suggest: {
                    showWords: false,
                    showSnippets: true,
                    showMethods: false,
                    showFunctions: false,
                    filterGraceful: true,
                    preview: false,
                    showDetails: true,
                    showInlineDetails: true,
                    showStatusBar: false,
                } as any,

                quickSuggestions: false,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'off',
                tabCompletion: 'on',
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
            editor.onDidDispose(() => {
                if (editorRef.current === editor) {
                    editorRef.current = null;
                }
                setEditorCreated(false);
            });
            isProgrammaticChange.current = false;
            setTimeout(() => {
                const suggestController = editor.getContribution('editor.contrib.suggestController');
                if (suggestController && suggestController.widget) {
                    const suggestWidget = suggestController.widget.value;
                    if (suggestWidget && typeof suggestWidget._setDetailsVisible === 'function') {
                        suggestWidget._setDetailsVisible(true);
                    }
                }
            }, 50);

            editor.onDidBlurEditorWidget(() => {
                window.setTimeout(closeEmptySuggestWidget, 0);
            });

            setEditorCreated(true);

            // Хелпер: открыт ли suggest widget. DOM-проверка надёжнее Monaco-API —
            // работает во всех версиях.
            const isSuggestWidgetOpen = (): boolean => {
                const el = document.querySelector('.suggest-widget') as HTMLElement | null;
                if (!el) return false;
                if (el.offsetParent === null || el.style.display === 'none') return false;
                // Пустой виджет (No suggestions) — 0 строк в списке.
                // В Monaco 0.52 нет класса .empty, поэтому считаем по items.
                const rows = el.querySelectorAll('.monaco-list-row');
                return rows.length > 0;
            };

            editor.addCommand(m.KeyCode.Enter, () => {
                // В заблокированном файле Enter не обрабатываем —
                // его заблокирует наш editor.onKeyDown.
                if (isLockedRef.current) return;

                if (isSuggestWidgetOpen()) {
                    // Принимаем выбранный. В Monaco 0.52 при открытии виджета
                    // первый элемент selected автоматически — acceptSelectedSuggestion
                    // принимает именно его, даже если пользователь не жал стрелки.
                    editor.trigger('dg-enter', 'acceptSelectedSuggestion', null);
                    return;
                }

                // Обычный Enter с auto-indent.
                // 'keyboard', 'type' — встроенный handler, работает в 0.30–0.52.
                editor.trigger('keyboard', 'type', { text: '\n' });
            });

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
                    'F2'
                ];
                if (navKeys.includes(e.browserEvent.key)) return;

                // Разрешаем системные шорткаты (Ctrl+C, Ctrl+F, Ctrl+S, Ctrl+Z, Alt+...)
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                // Блокируем ввод (буквы, Backspace, Delete, Enter)
                e.preventDefault();
                e.stopPropagation();
                useGraphStore.getState().showSnackbar("Файл заблокирован. Нажмите 🔒 для редактирования.");
            });

            document.addEventListener("keydown", onKeyDownCapture, true);

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
                const col = e.position.column;
                cursorTimer = setTimeout(() => {
                    startTransition(() => {
                        setCursorLine(line);
                        setCursorColumn(col);
                    });
                }, 120);
            });

            editor.onDidChangeCursorSelection((e: any) => {
                const sel = e.selection;
                if (
                    !sel ||
                    (sel.startLineNumber === sel.endLineNumber &&
                        sel.startColumn === sel.endColumn)
                ) {
                    setSelection(null);
                    return;
                }
                const model = editor.getModel();
                if (!model) return;
                const text = model.getValueInRange(sel) || "";
                setSelection({
                    chars: text.length,
                    lines: sel.endLineNumber - sel.startLineNumber + 1,
                });
            });

            editor.onDidScrollChange(() => {
                if (!editorRef.current) return;
                const ranges = editorRef.current.getVisibleRanges();
                const top = ranges[0]?.startLineNumber;
                if (top && top !== editorTopLineRef.current) {
                    editorTopLineRef.current = top;
                    startTransition(() => {
                        setEditorTopLine(top);
                        setScrollSignal((v) => v + 1);
                    });
                }
            });

            // ============ Auto-suggest при наборе ============
            // quickSuggestions отключён — для custom YAML-провайдера Monaco
            // не открывает suggest на обычных буквах. Триггерим вручную.
            // Guard `.suggest-widget.visible` — если виджет уже открыт,
            // Monaco сам фильтрует по введённому символу.

            const isSuggestOpen = (): boolean => {
                const el = document.querySelector(".suggest-widget") as HTMLElement | null;
                if (!el) return false;
                if (!el.classList.contains("visible")) return false;
                // ВАЖНО: НЕ проверять el.offsetParent — для position: fixed он всегда null,
                // и тогда функция всегда возвращает false, ломая логику триггеров.
                return el.querySelectorAll(".monaco-list-row").length > 0;
            };

            // ============ Auto-suggest: ТОЛЬКО на "field:" / "field: " ============
            // Раньше триггерили на первой букве любого слова — это открывало widget
            // с полями entity, widget фильтровался до нуля и висел, перехватывая ↑/↓.
            editor.onDidChangeModelContent((e: any) => {
                if (isLockedRef.current) return;
                if (isProgrammaticChange.current) return;

                if (hideDimmedRef.current) {
                    setHideDimmed(false);
                    useGraphStore
                        .getState()
                        .showSnackbar("Режим скрытия отключён для редактирования");
                }

                const change = (e.changes || [])[0];
                const typedText = change ? String(change.text || "") : "";

                // ============ NEW: accept field-suggestion → открыть widget для значения ============
                // Monaco вставил "fieldName: " как единую строку — `:` не прошёл через
                // `type`, поэтому suggestOnTriggerCharacters не сработал. Триггерим вручную,
                // но только для полей, у которых реально есть value-автокомплит.
                const fieldAccept = typedText.match(/^([a-zA-Z_][\w]*):\s+$/);
                if (fieldAccept && KNOWN_VALUE_FIELDS.has(fieldAccept[1])) {
                    window.setTimeout(() => {
                        if (!editorRef.current) return;
                        if (isLockedRef.current) return;
                        if (isProgrammaticChange.current) return;
                        if (isSuggestOpen()) return;
                        try {
                            editorRef.current.trigger(
                                "dg-autosuggest",
                                "editor.action.triggerSuggest",
                                null,
                            );
                        } catch { /* ignore */ }
                        // Если провайдер вернёт null (пусто) — не даём widget'у висеть
                        window.setTimeout(() => closeEmptySuggestWidgetDirectRef.current(), 100);
                    }, 30);
                    return; // не даём остальным веткам авто-триггера сработать
                }

                // При вводе НЕ-буквы — подчистить пустой widget
                if (typedText && !/^[a-zA-Z_]$/.test(typedText)) {
                    window.setTimeout(() => closeEmptySuggestWidgetDirectRef.current(), 100);
                }

                if (isSuggestOpen()) return;

                if (!change) return;

                const text = String(change.text || "");
                const newLine = change.range?.startLineNumber ?? 1;
                const newCol = (change.range?.startColumn ?? 1) + text.length;
                const lineText =
                    editorRef.current?.getModel()?.getLineContent(newLine) || "";
                const before = lineText.slice(0, newCol - 1);

                // 2) Авто-триггер ТОЛЬКО для имён полей:
                //    строка до курсора — это indent + опциональный "- " + буквы, без ":".
                //    Значения после "field:" открываются через suggestOnTriggerCharacters.
                const isFieldName = /^\s*(?:-\s+)?[a-zA-Z_][\w]*$/.test(before);
                if (!isFieldName) return;

                window.setTimeout(() => {
                    if (!editorRef.current) return;
                    if (isLockedRef.current) return;
                    if (isProgrammaticChange.current) return;
                    if (isSuggestOpen()) return;
                    try {
                        editorRef.current.trigger(
                            "dg-autosuggest",
                            "editor.action.triggerSuggest",
                            null,
                        );
                    } catch { /* ignore */ }
                }, 30);
            });
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
            isProgrammaticChange.current = false;
            console.error('[yaml-viewer] create failed', e);
        }

        return () => {
            document.removeEventListener("keydown", onKeyDownCapture, true);

            // 1. Сначала отменяем всё, что могло запланировать обращение к editor
            layouts.forEach(clearTimeout);
            if (cursorTimer) clearTimeout(cursorTimer);
            try { ro?.disconnect(); } catch { }

            // 2. Обнуляем ref ДО dispose — любой pending setTimeout теперь видит null
            if (editorRef.current === editor) {
                editorRef.current = null;
            }
            setEditorCreated(false);

            // 3. Только теперь dispose
            try { editor?.dispose(); } catch { }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, monacoReady, filePath, loading, fetchedContent, backupResolved, backupContent]);

    useEffect(() => {
        if (!editorRef.current) return;
        const t = setTimeout(() => {
            try { editorRef.current?.layout(); } catch { }
        }, 250); // 250мс — совпадает с длительностью CSS-анимации
        return () => clearTimeout(t);
    }, [leftCollapsed, rightCollapsed]);

    useEffect(() => {
        if (!open || !effectiveDomainId) {
            setPinAnnotations([]);
            return;
        }
        let cancelled = false;
        const load = () => {
            annotationsStore
                .list()
                .then((list) => {
                    if (cancelled) return;
                    setPinAnnotations(
                        list.filter(
                            (a) => !a.resolvedAt && a.domainId === effectiveDomainId,
                        ),
                    );
                })
                .catch(() => { });
        };
        load();
        const unsub = annotationsStore.subscribe(load);
        return () => {
            cancelled = true;
            unsub();
        };
    }, [open, effectiveDomainId]);

    // ============ Ctrl+S ============
    useEffect(() => {
        saveRef.current = handleSave;
        publishRef.current = handlePublish;
        toggleLockRef.current = handleToggleLock;
    });

    // Shift+Tab — toggle поповера при открытой модалке.
    // Перехватываем всегда при open=true, чтобы:
    //  • не сработал outdent в Monaco;
    //  • не сработал useHotkeys (глобальная палитра) — он на document:capture,
    //    а мы — на window:capture → идём раньше;
    //  • повторный Shift+Tab закрывал поповер, а не открывал палитру.
    useEffect(() => {
        if (!open) return;

        const handler = (e: KeyboardEvent) => {
            if (
                e.key !== "Tab" ||
                !e.shiftKey ||
                e.ctrlKey ||
                e.metaKey ||
                e.altKey
            ) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();

            if (quickJumpOpenRef.current) {
                setQuickJumpOpen(false);
            } else {
                setQuickJumpInitialQuery(null);
                setQuickJumpOpen(true);
            }

        };

        window.addEventListener("keydown", handler, true);
        return () => window.removeEventListener("keydown", handler, true);
    }, [open]);

    // F2 — открыть quick jump с предзаполненным словом под курсором
    useEffect(() => {
        if (!open || !editorCreated || !editorRef.current) return;
        const m = (window as any).monaco;
        if (!m) return;

        const ed = editorRef.current;
        if ((ed as any).__dgQuickJumpF2) return;
        (ed as any).__dgQuickJumpF2 = true;

        try {
            ed.addCommand(m.KeyCode.F2, () => {
                const ed2 = editorRef.current;
                if (!ed2) return;
                const pos = ed2.getPosition();
                const model = ed2.getModel();
                if (!pos || !model) return;
                const word = model.getWordAtPosition(pos);
                const text = (word?.word || "").trim();
                setQuickJumpInitialQuery(text || null);
                setQuickJumpOpen(true);
            });
        } catch { }
    }, [open, editorCreated]);

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
        editorRef.current.addCommand(
            m.KeyMod.CtrlCmd | m.KeyCode.KeyS,
            () => saveRef.current()
        );
        editorRef.current.addCommand(
            m.KeyMod.CtrlCmd | m.KeyMod.Shift | m.KeyCode.KeyS,
            () => publishRef.current()
        );
        return () => {
            // Monaco не всегда отдаёт dispose — очистим при dispose редактора
        };
    }, [editorCreated]);

    // ============ Provider context ============
    useEffect(() => {
        if (!monacoReady) return;
        try {
            updateProviderContext({
                lineMap: lineMap || null,
                currentFilePath: filePath,
                currentDomainId: effectiveDomainId,
                modelIndex: index || null,
            });
        } catch (err) {
            console.error('[yaml-viewer] updateProviderContext failed:', err);
            // Покажем в UI, но не размонтируем редактор
            useGraphStore.getState().showSnackbar(
                'Внутренняя ошибка автокомплита — см. консоль',
            );
        }
    }, [monacoReady, lineMap, filePath, effectiveDomainId, index]);

    useEffect(() => {
        if (open) return;
        resetProviderContext();
    }, [open]);

    // Ref с id декораций — ЖИВЁТ между перезапусками эффекта.
    // deltaDecorations принимает previous ids и удаляет их атомарно.
    const searchDecorIdsRef = useRef<string[]>([]);

    useEffect(() => {
        if (!monacoReady || !editorCreated) return;
        const m = (window as any).monaco;
        const ed = editorRef.current;
        if (!m || !ed) return;
        const model = editorRef.current.getModel();

        const buildRange = (match: any): any | null => {
            const startLine = match.line;
            const startCol = match.column;
            const len = match.length;

            if (!Number.isInteger(startLine) || startLine < 1) return null;
            if (!Number.isInteger(startCol) || startCol < 1) return null;
            if (!Number.isInteger(len) || len <= 0) return null;

            const lineCount = model.getLineCount();
            if (startLine > lineCount) return null;

            // ============ Многострочный: ТОЛЬКО если явно задан валидный endLine ============
            // Требуем matchLineCount > 1 И endLine > startLine. Иначе — однострочный путь.
            // Это защита от searchSingleLine, который может отдавать endLine=0/NaN.
            const isMultiline =
                match.matchLineCount > 1 &&
                Number.isInteger(match.endLine) &&
                Number.isInteger(match.endColumn) &&
                match.endLine > startLine;

            if (isMultiline) {
                const endLine = match.endLine as number;
                const endCol = match.endColumn as number;
                if (endLine > lineCount) return null;

                const maxColStart = model.getLineMaxColumn(startLine);
                const maxColEnd = model.getLineMaxColumn(endLine);
                const safeStartCol = Math.min(startCol, maxColStart);
                const safeEndCol = Math.min(endCol, maxColEnd);
                if (safeEndCol < 1) return null;

                try {
                    return new m.Range(startLine, safeStartCol, endLine, safeEndCol);
                } catch {
                    return null;
                }
            }

            // ============ Однострочный — простой Range, ignore endLine/endColumn ============
            // Именно эта форма работала до multiline-патча.
            const maxCol = model.getLineMaxColumn(startLine);
            const safeStartCol = Math.min(startCol, maxCol);
            const safeEndCol = Math.min(startCol + len, maxCol);
            if (safeEndCol <= safeStartCol) return null;

            try {
                return new m.Range(startLine, safeStartCol, startLine, safeEndCol);
            } catch {
                return null;
            }
        };

        const applyNow = () => {
            const ed2 = editorRef.current;
            if (!ed2) return;

            // ============ Очистка ============
            if (!searchQuery) {
                try {
                    searchDecorIdsRef.current = ed2.deltaDecorations(
                        searchDecorIdsRef.current,
                        [],
                    );
                } catch { }
                searchDecorIdsRef.current = [];
                return;
            }

            if (!searchResult || searchResult.groups.length === 0) return;

            const decorations: any[] = [];
            let skippedInvalid = 0;
            for (const g of searchResult.groups) {
                for (const match of g.matches) {
                    const range = buildRange(match);
                    if (!range) {
                        skippedInvalid++;
                        continue;
                    }
                    const isActive =
                        activeSearchMatch != null &&
                        activeSearchMatch.line === match.line &&
                        activeSearchMatch.column === match.column &&
                        activeSearchMatch.length === match.length;
                    decorations.push({
                        range,
                        options: {
                            inlineClassName: isActive
                                ? "yaml-search-match-active"
                                : "yaml-search-match",
                        },
                    });
                }
            }

            try {
                // Атомарная замена: previous ids удаляются, новые добавляются
                searchDecorIdsRef.current = ed2.deltaDecorations(
                    searchDecorIdsRef.current,
                    decorations,
                );
            } catch (err) {
                console.error("[search-dec] deltaDecorations failed:", err);
                return;
            }
        };

        applyNow();

        // Переприменение при изменении модели (setValue от reload)
        const sub = ed.onDidChangeModelContent(() => {
            setTimeout(applyNow, 0);
        });

        return () => {
            try { sub.dispose(); } catch { }
            // ВАЖНО: НЕ очищаем searchDecorIdsRef.
            // При следующем applyNow ids передадутся — старые удалятся атомарно.
        };
    }, [monacoReady, editorCreated, searchResult, activeSearchMatch, searchQuery]);

    // Auto-scroll к первому матчу при появлении результатов.
    // Без этого пользователь видит верх файла, а матчи могут быть
    // на любой из 10000 строк — Monaco виртуализирует и рисует только
    // ~20 видимых строк, поэтому декорации есть в модели, но не в DOM.
    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        if (!searchQuery) return;
        if (!searchResult || searchResult.groups.length === 0) return;

        // Результат относится к прошлому запросу: query ввели быстрее, чем
        // отработал debounce в YamlSearchPanel. Прокручивать по нему нельзя —
        // уедем к матчу старого запроса.
        if (searchResult.query !== searchQuery) return;

        // Уже прокручивали к первому матчу для этого запроса. Дальше
        // searchResult будет меняться на каждое изменение content — без этой
        // проверки редактор дёргается при каждом keystroke.
        if (lastAutoScrolledQueryRef.current === searchQuery) return;

        // Не перебиваем активный матч — если пользователь уже Ctrl+Enter'ом
        // ушёл к 5-му, не должны прыгать назад.
        if (activeSearchMatch) return;

        const firstMatch = searchResult.groups[0]?.matches[0];
        if (!firstMatch) return;

        lastAutoScrolledQueryRef.current = searchQuery;

        const m = (window as any).monaco;
        if (!m) return;

        const doScroll = () => {
            const ed = editorRef.current;
            if (!ed) return;
            try {
                ed.revealPositionInCenterIfOutsideViewport(
                    { lineNumber: firstMatch.line, column: firstMatch.column },
                    m.editor.ScrollType.Immediate,
                );
            } catch { /* ignore */ }
            try {
                ed.setPosition({ lineNumber: firstMatch.line, column: firstMatch.column });
            } catch { /* ignore */ }
            requestAnimationFrame(() => {
                const ed2 = editorRef.current;
                if (!ed2) return;
                try {
                    const visible = ed2.getVisibleRanges();
                    const isVisible = visible.some(
                        (r) => r.startLineNumber <= firstMatch.line && firstMatch.line <= r.endLineNumber,
                    );
                    if (!isVisible) {
                        const lineTop = ed2.getTopForLineNumber(firstMatch.line);
                        const layout = ed2.getLayoutInfo();
                        const lineHeight = ed2.getOption(m.editor.EditorOption.lineHeight);
                        ed2.setScrollTop(
                            Math.max(0, lineTop - layout.height / 2 + lineHeight / 2),
                        );
                    }
                } catch { /* ignore */ }
            });
        };

        const t = setTimeout(doScroll, 50);
        return () => clearTimeout(t);
    }, [searchResult, activeSearchMatch, editorCreated, searchQuery]);

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
                    "action-required-validator",
                    "workflow-status-validator"
                ];
                for (const src of sources) {
                    try { m.editor.setModelMarkers(model, src, []); } catch { }
                }
            }
            return;
        }

        let timer: any = null;
        let lastRunKey = "";

        const runAll = () => {
            if (!editorRef.current) return;
            const model = editorRef.current.getModel();
            if (!model) return;

            // Пропускаем повторный прогон, если содержимое не менялось
            const currentText = model.getValue();
            const runKey = `${currentText.length}:${currentText.slice(0, 32)}:${currentText.slice(-32)}`;
            if (runKey === lastRunKey) return;
            lastRunKey = runKey;

            try { applyFqidMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyDataTypeMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyEnumFieldMarkers(m, model); } catch { /* ignore */ }
            try { applyViewRefMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyAttributeMarkers(m, model); } catch { /* ignore */ }
            try { applyUiRuleRefMarkers(m, model, index, domainId); } catch { /* ignore */ }
            try { applyAttributeRefMarkers(m, model); } catch { /* ignore */ }
            try { applyWorkflowStatusRefMarkers(m, model); } catch { /* ignore */ }
            try { applyRqlMarkers(m, model); } catch { /* ignore */ }

            // Post-filter по severityFilter: inline-валидаторы не знают про
            // панельный фильтр, поэтому их маркеры оставались даже при
            // выключенном severity. Перебираем все inline-источники и
            // оставляем только те, чья severity включена пользователем.
            try {
                const severityMap: Record<number, "error" | "warning" | "info"> = {
                    [m.MarkerSeverity.Error]: "error",
                    [m.MarkerSeverity.Warning]: "warning",
                    [m.MarkerSeverity.Info]: "info",
                    [m.MarkerSeverity.Hint]: "info",
                };

                for (const source of INLINE_SOURCES) {
                    const markers = m.editor.getModelMarkers({
                        resource: model.uri,
                        owner: source,
                    });
                    if (markers.length === 0) continue;
                    const filtered = markers.filter((mk: any) => {
                        const sev = severityMap[mk.severity];
                        return sev != null && severityFilter.has(sev);
                    });
                    if (filtered.length !== markers.length) {
                        m.editor.setModelMarkers(model, source, filtered);
                    }
                }
            } catch { /* ignore */ }

            // ── Собираем актуальные inline-маркеры: (ruleId#line) для правил,
            //    покрытых inline-валидаторами. Используется в effectiveIssues,
            //    чтобы убирать из панели «Проблемы» уже исправленные проблемы.
            try {
                const codes = new Set<string>();
                for (const source of INLINE_SOURCES) {
                    const list = m.editor.getModelMarkers({
                        resource: model.uri,
                        owner: source,
                    });
                    for (const mk of list) {
                        if (mk.code) codes.add(`${mk.code}#${mk.startLineNumber}`);
                    }
                }
                inlineMarkersRef.current = codes;
                setInlineMarkersVersion((v) => v + 1);
            } catch {
                /* ignore */
            }
        };

        const schedule = () => {
            if (timer) clearTimeout(timer);
            // 800ms — комфортно для пользователя: маркеры обновляются
            // только когда он остановился и читает ошибку, а не во время печати.
            timer = setTimeout(runAll, 600);
        };

        const disposable = editorRef.current.onDidChangeModelContent(schedule);
        runAll(); // первый запуск — после открытия файла
        runAllMarkersRef.current = runAll;

        return () => {
            if (timer) clearTimeout(timer);
            runAllMarkersRef.current = null;
            try { disposable?.dispose?.(); } catch { /* ignore */ }
        };
    }, [checksEnabled, monacoReady, editorCreated, index, domainId, severityFilter]);

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
            // Скрываем серверные маркеры для правил, покрытых inline-
            // валидаторами. Иначе на одной строке — 2 маркера: inline
            // (attribute-validator) и dg-linter. При checksEnabled=false
            // этот эффект выходит раньше — серверные маркеры остаются
            // единственным источником (inline не запускается).
            .filter((issue) => !INLINE_COVERED_RULE_IDS.has(issue.ruleId))
            .filter((issue) => !isIgnored(issue, ignored))
            .map((issue) => {
                const state = isDirty
                    ? classifyIssue(issue, currentText, recheckModel, index)
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

        return () => {
            try { m.editor.setModelMarkers(model, 'dg-linter', []); } catch { }
        };
    }, [yamlSyntaxIssue, index, recheckModel, checksEnabled, monacoReady, editorCreated, lineMap, domainIssues, isLocked, severityFilter, savedContent]);

    // ============ Jump ============
    const jumpTo = useCallback(
        (line: number, opts?: { focus?: boolean; column?: number }) => {
            const editor = editorRef.current;
            if (!editor) return;

            try {
                editor.revealLineInCenter(line);
            } catch { }

            try {
                editor.setPosition({ lineNumber: line, column: opts?.column ?? 1 });
            } catch { }

            try { editor.layout(); } catch { }

            if (opts?.focus !== false) {
                editor.focus();
            } else {
                requestAnimationFrame(() => {
                    const ed = editorRef.current;
                    if (!ed) return;
                    try {
                        ed.revealLineInCenter(line);
                        ed.layout();
                    } catch { }
                });
            }
        },
        [],
    );

    const handleQuickJumpSelect = useCallback(
        (line: number, column?: number) => {
            // Чистим «намерения» из других мест (LintModal / sidecar),
            // чтобы они не перескочили поверх нашего прыжка.
            setPendingIssue(null);
            setPendingBlock(null);
            jumpTo(line, { column });
        },
        [jumpTo, setPendingIssue, setPendingBlock],
    );

    const [activeFoldLevel, setActiveFoldLevel] = useState<number | null>(null);

    // Сброс свёрнутости при смене файла / открытии
    useEffect(() => {
        setActiveFoldLevel(null);
    }, [filePath, open]);

    const getFoldingController = useCallback((ed: any): any => {
        const contributions = ed?._contributions;
        const instances: Map<string, any> | undefined = contributions?._instances?._store;
        return instances?.get("editor.contrib.folding") ?? null;
    }, []);

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

    const foldLines = useCallback((lines: number[]) => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        if (!ed || !model || lines.length === 0) return;

        if (!ed.hasTextFocus()) ed.focus();

        ed.trigger("dg-fold", "editor.unfoldAll", null);

        const monaco = (window as any).monaco;
        if (!monaco) return;

        const sorted = [...lines].sort((a, b) => b - a);
        for (const line of sorted) {
            ed.setSelection(new monaco.Selection(line, 1, line, 1));
            ed.trigger("dg-fold", "editor.fold", null);
        }
    }, []);

    const toggleFold = useCallback((level: 1 | 2 | 3 | 4 | 5) => {
        const ed = editorRef.current;
        if (!ed) return;

        if (activeFoldLevel === level) {
            ed.trigger("dg-fold", "editor.unfoldAll", null);
            setActiveFoldLevel(null);
            return;
        }

        ed.trigger("dg-fold", "editor.unfoldAll", null);
        ed.trigger("dg-fold", `editor.foldLevel${level}`, null);
        setActiveFoldLevel(level);
    }, [activeFoldLevel]);

    const foldAll = useCallback(() => {
        editorRef.current?.trigger("dg-fold", "editor.foldAll", null);
        setActiveFoldLevel(null);
    }, []);

    const unfoldAll = useCallback(() => {
        editorRef.current?.trigger("dg-fold", "editor.unfoldAll", null);
        setActiveFoldLevel(null);
    }, []);

    /**
     * Есть ли на этой строке собственный foldable-регион.
     * Проверяем, что следующий непустой не-комментарий имеет БОЛЬШИЙ indent.
     */
    const hasFoldableRange = useCallback((model: any, lineNumber: number): boolean => {
        const line = model.getLineContent(lineNumber);
        const indent = (line.match(/^(\s*)/) || ["", ""])[1].length;
        const total = model.getLineCount();
        for (let j = lineNumber + 1; j <= total; j++) {
            const next = model.getLineContent(j);
            if (!next.trim()) continue;
            const nextIndent = (next.match(/^(\s*)/) || ["", ""])[1].length;
            return nextIndent > indent;
        }
        return false;
    }, []);

    const foldByLines = useCallback((lines: number[]) => {
        const ed = editorRef.current;
        if (!ed || lines.length === 0) return;

        setTimeout(async () => {
            const fc = (ed as any)._contributions?._instances?._store?.get(
                "editor.contrib.folding",
            );
            if (!fc) {
                console.warn("[foldByLines] FoldingController не найден");
                return;
            }

            let fm: any = fc.foldingModel;
            if (!fm && fc.foldingModelPromise) {
                try {
                    fm = await fc.foldingModelPromise;
                } catch {
                    /* ignore */
                }
            }
            if (!fm || typeof fm.toggleCollapseState !== "function") {
                console.warn("[foldByLines] toggleCollapseState недоступен");
                return;
            }

            // Снизу вверх — координаты ниже не сдвигаются
            const sorted = [...lines].sort((a, b) => b - a);
            const regions: any[] = [];
            let noRegion = 0;
            let already = 0;

            for (const line of sorted) {
                try {
                    const region = fm.getRegionAtLine(line);
                    if (!region) {
                        noRegion++;
                        continue;
                    }
                    if (region.isCollapsed === true) {
                        already++;
                        continue;
                    }
                    regions.push(region);
                } catch (err) {
                    console.warn("[foldByLines] getRegionAtLine failed:", line, err);
                }
            }

            if (regions.length === 0) {
                return;
            }

            // toggleCollapseState принимает массив регионов.
            // Передаём все разом — Monaco пересчитает декорации один раз.
            try {
                fm.toggleCollapseState(regions, "dg-foldByLines");
            } catch (err) {
                console.warn("[foldByLines] toggleCollapseState (array) failed:", err);
                // Fallback: по одному
                for (const r of regions) {
                    try {
                        fm.toggleCollapseState(r, "dg-foldByLines");
                    } catch (e) {
                        console.warn("[foldByLines] toggle single failed:", e);
                    }
                }
            }
        }, 0);
    }, []);

    const foldSiblings = useCallback(() => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        const pos = ed?.getPosition();
        if (!ed || !model || !pos) return;

        const total = model.getLineCount();
        const cursorLine = pos.lineNumber;
        const cursorContent = model.getLineContent(cursorLine);
        const cursorIndent = (cursorContent.match(/^(\s*)/) || ["", ""])[1].length;

        // Шаг 1. Найти anchor — ближайший вверх `- id:` с indent <= cursorIndent.
        // Если курсор уже на `- id:`, anchor = курсор.
        let anchorLine = -1;
        let anchorIndent = -1;
        for (let i = cursorLine; i >= 1; i--) {
            const line = model.getLineContent(i);
            if (!line.trim() || line.trim().startsWith("#")) continue;
            const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
            if (ind > cursorIndent) continue;
            const m = line.match(/^(\s*)-\s+id\s*:/);
            if (m) {
                anchorLine = i;
                anchorIndent = m[1].length;
                break;
            }
        }

        if (anchorLine < 0) {
            setActiveFoldLevel(null);
            return;
        }

        // Шаг 2. Собрать все `- id:` на anchorIndent, кроме anchorLine.
        const targets: number[] = [];
        for (let i = 1; i <= total; i++) {
            if (i === anchorLine) continue;
            const line = model.getLineContent(i);
            const ind = (line.match(/^(\s*)/) || ["", ""])[1].length;
            if (ind !== anchorIndent) continue;
            if (!/^\s*-\s+id\s*:/.test(line)) continue;
            if (!hasFoldableRange(model, i)) continue;
            targets.push(i);
        }

        foldByLines(targets);
        setActiveFoldLevel(null);
    }, [hasFoldableRange, foldByLines]);

    const foldBlocksByKey = useCallback((key: string) => {
        const ed = editorRef.current;
        const model = ed?.getModel();
        if (!ed || !model) return;

        setTimeout(async () => {
            const fc = (ed as any)._contributions?._instances?._store?.get(
                "editor.contrib.folding",
            );
            if (!fc) return;

            let fm: any = fc.foldingModel;
            if (!fm && fc.foldingModelPromise) {
                try {
                    fm = await fc.foldingModelPromise;
                } catch {
                    /* ignore */
                }
            }
            if (!fm || typeof fm.toggleCollapseState !== "function") return;

            const total = model.getLineCount();
            const re = new RegExp(`^(\\s*)${key}\\s*:\\s*(?:#.*)?$`);
            const startIndexes: Uint32Array | undefined = fm._regions?._startIndexes;

            // Быстрый lookup: startLine → regionIndex
            const startMap = new Map<number, number>();
            if (startIndexes) {
                for (let i = 0; i < startIndexes.length; i++) {
                    startMap.set(startIndexes[i], i);
                }
            }

            const regions: any[] = [];
            const notFoldStart: number[] = [];

            for (let i = 1; i <= total; i++) {
                if (!re.test(model.getLineContent(i))) continue;
                if (!hasFoldableRange(model, i)) continue;

                // Проверяем через startMap: если line — точно старт региона
                const idx = startMap.get(i);
                if (idx == null) {
                    notFoldStart.push(i);
                    continue;
                }
                try {
                    const region = fm._regions.toRegion(idx);
                    if (region && region.isCollapsed !== true) {
                        regions.push(region);
                    }
                } catch {
                    notFoldStart.push(i);
                }
            }

            if (regions.length === 0) {
                setActiveFoldLevel(null);
                return;
            }

            try {
                fm.toggleCollapseState(regions, "dg-fold-key");
            } catch {
                for (const r of regions) {
                    try {
                        fm.toggleCollapseState(r, "dg-fold-key");
                    } catch { /* ignore */ }
                }
            }

            setActiveFoldLevel(null);
        }, 0);
    }, [hasFoldableRange]);


    const foldToLevel = useCallback((targetLevel: 1 | 2 | 3 | 4 | 5) => {
        const ed = editorRef.current;
        if (!ed) return;

        if (activeFoldLevel === targetLevel) {
            ed.trigger("dg-fold", "editor.unfoldAll", null);
            setActiveFoldLevel(null);
            return;
        }

        const savedPos = ed.getPosition();

        ed.trigger("dg-fold", "editor.unfoldAll", null);
        // Сброс курсора: без этого foldLevelN оставит регион с курсором развёрнутым
        ed.setPosition({ lineNumber: 1, column: 1 });
        ed.trigger("dg-fold", `editor.foldLevel${targetLevel}`, null);

        // Возвращаем курсор в ближайший видимый регион (не в свёрнутый)
        if (savedPos) {
            setTimeout(() => {
                const ranges = ed.getVisibleRanges();
                let targetLine = 1;
                for (const r of ranges) {
                    if (
                        r.startLineNumber <= savedPos.lineNumber &&
                        savedPos.lineNumber <= r.endLineNumber
                    ) {
                        targetLine = savedPos.lineNumber;
                        break;
                    }
                    if (r.startLineNumber <= savedPos.lineNumber) {
                        targetLine = r.startLineNumber;
                    }
                }
                ed.setPosition({ lineNumber: targetLine, column: 1 });
                ed.revealLineInCenter(targetLine);
            }, 0);
        }

        setActiveFoldLevel(targetLevel);
    }, [activeFoldLevel]);

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

    useEffect(() => {
        if (!open) return;
        const goto = useGraphStore.getState().yamlViewerPendingGoto;
        if (!goto) return;
        if (!editorCreated || !editorRef.current) return;
        if (loading) return;
        if (!lineMap || !deferredContent) return;

        const lines = deferredContent.split("\n");
        let targetLine: number | null = null;

        if (goto.kind === "fqid") {
            const entityId = goto.fqid.split("/").pop() || "";
            const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
            const node = entitiesSection?.nodes.find(
                (n) => n.id.toLowerCase() === entityId.toLowerCase(),
            );
            if (node) {
                targetLine = node.line;
            } else {
                const re = new RegExp(
                    `^\\s*-\\s+id\\s*:\\s*["']?${entityId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*$`,
                    "m",
                );
                const m = re.exec(deferredContent);
                if (m && typeof m.index === "number") {
                    targetLine = deferredContent.slice(0, m.index).split("\n").length;
                }
            }
        } else if (goto.kind === "line") {
            targetLine = Math.max(1, Math.min(goto.line, lines.length));
        }

        useGraphStore.getState().setYamlViewerPendingGoto(null);
        if (targetLine == null) return;

        const t = setTimeout(() => {
            if (!editorRef.current) return;
            try {
                jumpTo(targetLine!, { column: goto.kind === "line" ? goto.column : undefined });
            } catch { }
        }, 50);
        return () => clearTimeout(t);
    }, [open, editorCreated, loading, lineMap, deferredContent, jumpTo]);

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
            await alertDialog("Не удалось скопировать", {
                detail: err.message,
                variant: "warning",
            });
        }
    }, [content]);

    // ============ Toggle lock ============
    const handleToggleLock = useCallback(async () => {
        if (isLocked) {
            setIsLocked(false);
            setSaveError(null);
        } else {
            if (isDirty) {
                const ok = await confirmDialog(
                    "Сбросить несохранённые изменения и заблокировать файл?",
                    {
                        detail: "Все правки в редакторе будут потеряны.",
                        danger: true,
                        confirmLabel: "Сбросить и заблокировать",
                    },
                );
                if (!ok) return;
                if (editorRef.current) {
                    isProgrammaticChange.current = true;
                    editorRef.current.setValue(savedContent);
                    isProgrammaticChange.current = false;
                }
                setContent(savedContent);
                if (filePath) {
                    void yamlBackups.delete(filePath);
                }
            }
            setIsLocked(true);
        }
    }, [isLocked, isDirty, savedContent, filePath]);

    /**
 * Заменяет содержимое редактора содержимым выбранной версии.
 *
 * - Использует executeEdits-совместимый setValue, обёрнутый в
 *   isProgrammaticChange, чтобы не триггерить onChange-обработчик
 *   (иначе он сбросит backup и второй раз поставит content).
 * - pushUndoStop до и после — пользователь может откатить замену через Ctrl+Z.
 * - savedContent НЕ трогаем: isDirty станет true, что правильно.
 * - Backup пишем вручную — иначе он обновится только при следующем keystroke.
 */
    const handleApplyHistory = useCallback(
        (newContent: string) => {
            if (!editorRef.current) return;
            const ed = editorRef.current;
            try { ed.pushUndoStop(); } catch { /* ignore */ }

            isProgrammaticChange.current = true;
            try {
                ed.setValue(newContent);
            } finally {
                isProgrammaticChange.current = false;
            }

            try { ed.pushUndoStop(); } catch { /* ignore */ }

            setContent(newContent);
            setLiveVersion((v) => v + 1);

            if (filePath) {
                void yamlBackups.put({
                    filePath,
                    content: newContent,
                    savedContentHash: hashPayload(normalizeEol(savedContent)),
                    savedAt: Date.now(),
                });
            }

            useGraphStore
                .getState()
                .showSnackbar("Содержимое заменено версией из истории");
        },
        [filePath, savedContent],
    );

    // ============ Save ============
    const handleSave = useCallback(async () => {
        if (isLocked || isSaving || !editorRef.current) return;

        // Проверка конфликта
        try {
            const statRes = await fetch(`/file?path=${encodeURIComponent(filePath || "")}&stat=1`);
            if (statRes.ok) {
                const { mtime } = await statRes.json();
                if (lastKnownMtime > 0 && mtime > lastKnownMtime) {
                    const ok = await confirmDialog(
                        "Файл был изменён вне этого редактора",
                        {
                            detail: "Продолжить сохранение и перезаписать текущее содержимое на диске?",
                            variant: "warning",
                            confirmLabel: "Перезаписать",
                        },
                    );
                    if (!ok) return;
                }
            }
        } catch { }

        const valueToSave = editorRef.current.getValue();
        if (valueToSave === savedContent) {
            setSaveFeedback(true);
            setTimeout(() => setSaveFeedback(false), 1500);
            return;
        }

        const impact = computePreSaveImpact(
            effectiveDomainId!,
            savedContent,
            valueToSave,
            index!,
        );
        if (impact?.hasImpact) {
            const brokenRefsCount = impact.brokenRefs.length;
            const staleDomainsCount = impact.staleDomains.length;
            const affectedDomainsCount = new Set(
                impact.brokenRefs.map((r: any) => r.fromDomainId),
            ).size;

            const refsPreview = impact.brokenRefs
                .slice(0, 5)
                .map((r: any) => {
                    const path =
                        r.propertyPath ||
                        r.fqidRef ||
                        [r.entityId, r.attributeId].filter(Boolean).join(".") ||
                        "?";
                    return `  • ${r.fromDomainId} → ${path}`;
                })
                .join("\n");
            const moreRefs =
                brokenRefsCount > 5
                    ? `\n  …и ещё ${brokenRefsCount - 5}`
                    : "";

            const stalePreview = impact.staleDomains
                .slice(0, 5)
                .map((d: any) =>
                    typeof d === "string" ? d : d.domainId || d.name || "?",
                )
                .join("\n");
            const moreStale =
                staleDomainsCount > 5
                    ? `\n  …и ещё ${staleDomainsCount - 5}`
                    : "";

            const detailLines: string[] = [];
            if (brokenRefsCount > 0) {
                detailLines.push(
                    `🔴 Сломается (${brokenRefsCount} ${brokenRefsCount === 1 ? "ссылка" : "ссылок"
                    } в ${affectedDomainsCount} ${affectedDomainsCount === 1 ? "домене" : "доменах"
                    }):`,
                );
                if (refsPreview) detailLines.push(refsPreview);
                if (moreRefs) detailLines.push(moreRefs);
            }
            if (staleDomainsCount > 0) {
                if (detailLines.length > 0) detailLines.push("");
                detailLines.push(
                    `🟡 Устареет (${staleDomainsCount} ${staleDomainsCount === 1 ? "домен" : "доменов"
                    }):`,
                );
                if (stalePreview) detailLines.push(stalePreview);
                if (moreStale) detailLines.push(moreStale);
            }
            detailLines.push("");
            detailLines.push(
                "После сохранения откройте проблемные файлы и поправьте ссылки. Файл уже будет записан на диск.",
            );

            const ok = await confirmDialog(
                "Изменения затронут другие домены",
                {
                    detail: detailLines.join("\n"),
                    danger: impact.brokenRefs.length > 0,
                    confirmLabel: "Всё равно сохранить",
                    cancelLabel: "Отмена",
                },
            );
            if (!ok) return;
        }

        setIsSaving(true);
        setSaveStage("writing");
        setSaveError(null);

        const controller = new AbortController();
        saveAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
            const body: any = {
                path: filePath,
                content: valueToSave,
                action: "save",
            };
            const pendingManifest =
                useGraphStore.getState().yamlViewerPendingManifest;
            if (pendingManifest) body.generated = pendingManifest;

            const res = await fetch("/file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) {
                const errText = await res.text();
                let errMsg = errText;
                try {
                    const j = JSON.parse(errText);
                    if (j.error) errMsg = j.error;
                } catch { /* ignore */ }
                throw new Error(errMsg);
            }

            invalidateYamlCache(filePath || undefined);

            // Сервер уже сделал rebuild ДО ответа (см. onBeforeResponse),
            // поэтому один fetch /api/model и один /api/graph дают свежие данные.
            const st = useGraphStore.getState();
            st.bumpModelVersion();
            st.refreshGraphFromServer(index, true).catch((e: any) => {
                console.warn("[yaml-save] refreshGraphFromServer failed:", e);
                st.showSnackbar(
                    "Файл сохранён, но граф не обновился. Нажмите F5.",
                );
            });

            setSavedContent(valueToSave);
            setContent(valueToSave);
            setLiveVersion((v) => v + 1);
            void yamlBackups.delete(filePath!);
            refreshPreviousContent();

            if (pendingManifest) {
                useGraphStore.getState().setYamlViewerPendingManifest(null);
            }

            try {
                editorRef.current?.pushUndoStop();
            } catch { /* ignore */ }

            // Read-back: сверяем диск с Monaco
            let diskContent: string | null = null;
            try {
                const back = await fetch(
                    "/file?path=" + encodeURIComponent(filePath || ""),
                );
                if (back.ok) diskContent = await back.text();
            } catch { /* ignore */ }

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
                    "На диске оказалось другое содержимое. Monaco синхронизирован.",
                );
            }

            let draftInfo: any = null;
            try {
                const data = await res.json();
                if (data && data.draft) draftInfo = data.draft;
            } catch { /* ignore */ }

            if (draftInfo && draftInfo.ok === true) {
                // После saveDraft на сервере точно есть черновик — даже если
                // до этого был "published". Позволяет сразу публиковать
                // без дополнительного редактирования.
                useGraphStore.getState().setYamlViewerContentSource("draft");
                setMetaOverride((prev) => ({
                    ...(prev || {}),
                    updatedAt: new Date().toISOString(),
                    updatedBy: "вы",
                }));
                useGraphStore.getState().showSnackbar(
                    `✅ Черновик сохранён: ${draftInfo.domain?.name || filePath}`,
                );
            } else if (draftInfo && draftInfo.ok === false) {
                hadError = true;
                const hint = draftInfo.hint ? `\n${draftInfo.hint}` : "";
                setSaveError(
                    `Локально сохранено. Черновик на сервере не сохранён: ${draftInfo.error}${hint}`,
                );
                useGraphStore.getState().showSnackbar(
                    `⚠️ Локально сохранено, черновик не удался: ${draftInfo.error}`,
                );
            }

            if (!hadError) {
                setSaveFeedback(true);
                setTimeout(() => setSaveFeedback(false), 2000);
            }
        } catch (err: any) {
            setSaveError(err.message || "Ошибка сохранения");
        } finally {
            clearTimeout(timeoutId);
            saveAbortRef.current = null;
            setIsSaving(false);
            setSaveStage("idle");
            void yamlBackups.delete(filePath!);
        }
    }, [isLocked, savedContent, filePath, mode, isSaving, effectiveDomainId]);

    const handleDiffPublished = useCallback(async () => {
        if (!filePath) return;

        // Уже открыт в режиме published — закрываем.
        if (diffAgainst === "published") {
            setDiffAgainst(null);
            return;
        }

        // Лениво грузим опубликованную версию. Кэшируем: published не
        // меняется до следующего publish (после него мы сбрасываем кэш).
        if (publishedContent === null) {
            try {
                const r = await fetch(
                    "/file/published?path=" + encodeURIComponent(filePath),
                );
                if (!r.ok) {
                    const t = await r.text();
                    let msg = `HTTP ${r.status}`;
                    try {
                        const j = JSON.parse(t);
                        if (j?.error) msg = j.error;
                    } catch { /* ignore */ }
                    throw new Error(msg);
                }
                const text = await r.text();
                setPublishedContent(text);
                setDiffAgainst("published");
            } catch (e: any) {
                useGraphStore.getState().showSnackbar(
                    "Не удалось загрузить опубликованную версию: " +
                    (e?.message || String(e)),
                );
            }
        } else {
            setDiffAgainst("published");
        }
    }, [filePath, diffAgainst, publishedContent]);

    const handleDiffPrevious = useCallback(() => {
        setDiffAgainst(diffAgainst === "previous" ? null : "previous");
    }, [diffAgainst]);

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
    const handleClose = useCallback(async () => {
        if (quickJumpOpenRef.current) return;

        if (isSaving) {
            const ok = await confirmDialog(
                "Идёт сохранение",
                {
                    detail: "Прервать и закрыть без сохранения?",
                    variant: "warning",
                    confirmLabel: "Прервать и закрыть",
                },
            );
            if (!ok) return;
            try { saveAbortRef.current?.abort(); } catch { /* ignore */ }
        } else if (isDirty && !isLocked) {
            const ok = await confirmDialog(
                "Есть несохранённые изменения",
                {
                    detail: "Закрыть файл без сохранения?",
                    danger: true,
                    confirmLabel: "Закрыть без сохранения",
                },
            );
            if (!ok) return;
            if (filePath) {
                void yamlBackups.delete(filePath);
            }
        }

        useGraphStore.getState().setYamlViewerOpen(false);
    }, [isDirty, isLocked, isSaving, filePath]);

    useEffect(() => {
        if (!open) return;

        const runFixAll = (
            domainId: string | null,
            attempt: number,
            filter?: { keys?: Array<{ ruleId: string; line: number }> },
        ) => {
            const ed = editorRef.current;
            if (!ed) {
                if (attempt < 20)
                    setTimeout(() => runFixAll(domainId, attempt + 1, filter), 300);
                return;
            }
            if (domainId && domainId !== effectiveDomainId) return;

            const m = (window as any).monaco;
            const model = ed.getModel();
            if (!m || !model) {
                if (attempt < 20)
                    setTimeout(() => runFixAll(domainId, attempt + 1, filter), 300);
                return;
            }

            // Разблокировка (как было)
            if (isLockedRef.current) {
                isLockedRef.current = false;
                setIsLocked(false);
            }
            (ed as any).__dgFixAllInProgress = true;
            try { ed.updateOptions({ readOnly: false }); } catch { /* ignore */ }
            try { ed.focus(); } catch { /* ignore */ }

            const allMarkers = [
                ...m.editor.getModelMarkers({ resource: model.uri, owner: "dg-linter" }),
                ...m.editor.getModelMarkers({
                    resource: model.uri,
                    owner: "attribute-validator",
                }),
            ];

            // Маркеры ещё не построены (runAllMarkers ещё не отработал) → ждём
            if (allMarkers.length === 0) {
                if (attempt < 20) {
                    setTimeout(() => runFixAll(domainId, attempt + 1, filter), 300);
                } else {
                    (ed as any).__dgFixAllInProgress = false;
                    useGraphStore
                        .getState()
                        .showSnackbar("Нет проблем для автоисправления");
                }
                return;
            }

            // ============ NEW: фильтрация по группе ============
            let markers = allMarkers;
            if (filter?.keys && filter.keys.length > 0) {
                const keys = new Set(
                    filter.keys.map((k) => `${k.ruleId}#${k.line}`),
                );
                markers = allMarkers.filter((mk: any) =>
                    keys.has(`${mk.code}#${mk.startLineNumber}`),
                );
                if (markers.length === 0) {
                    (ed as any).__dgFixAllInProgress = false;
                    useGraphStore
                        .getState()
                        .showSnackbar("В этой группе нет проблем с автофиксом");
                    return;
                }
            }

            const fixes: MarkerWithFix[] = markers
                .map((mk: any) => ({ ...mk, fix: buildQuickFix(mk, model) }))
                .filter((x: any) => x.fix != null);

            if (fixes.length === 0) {
                (ed as any).__dgFixAllInProgress = false;
                useGraphStore
                    .getState()
                    .showSnackbar(
                        filter
                            ? "В этой группе нет автофиксов — правьте вручную"
                            : "Нет проблем, для которых есть автофикс",
                    );
                return;
            }

            // ============ дальше — без изменений (rAF, sanitize, applyAllFixes) ============
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const edNow = editorRef.current;
                    if (!edNow) return;

                    const readOnlyNow = edNow.getOption(
                        m.editor.EditorOption.readOnly,
                    );
                    if (readOnlyNow) {
                        try { edNow.updateOptions({ readOnly: false }); } catch { /* ignore */ }
                    }

                    const lineCount = model.getLineCount();
                    const sanitized: MarkerWithFix[] = fixes
                        .map((f) => {
                            const edits = (f.fix as any).edits
                                .filter((e: any) => {
                                    if (e.startLineNumber < 1 || e.startLineNumber > lineCount)
                                        return false;
                                    if (e.endLineNumber < 1 || e.endLineNumber > lineCount)
                                        return false;
                                    const maxCol = model.getLineMaxColumn(e.startLineNumber);
                                    if (e.startColumn < 1 || e.startColumn > maxCol) return false;
                                    const maxEndCol = model.getLineMaxColumn(e.endLineNumber);
                                    if (e.endColumn < 1 || e.endColumn > maxEndCol) return false;
                                    return true;
                                })
                                .map((e: any) => ({
                                    ...e,
                                    startColumn: Math.min(
                                        e.startColumn,
                                        model.getLineMaxColumn(e.startLineNumber),
                                    ),
                                    endColumn: Math.min(
                                        e.endColumn,
                                        model.getLineMaxColumn(e.endLineNumber),
                                    ),
                                }));
                            if (edits.length === 0) return null;
                            return { ...f, fix: { ...(f.fix as any), edits } };
                        })
                        .filter((x) => x !== null) as MarkerWithFix[];

                    if (sanitized.length === 0) {
                        (edNow as any).__dgFixAllInProgress = false;
                        useGraphStore
                            .getState()
                            .showSnackbar("Все автофиксы содержат невалидные диапазоны");
                        return;
                    }

                    const { applied, skipped } = applyAllFixes(edNow, m, sanitized);
                    setTimeout(() => {
                        try { runAllMarkersRef.current?.(); } catch { /* ignore */ }
                    }, 0);
                    (edNow as any).__dgFixAllInProgress = false;
                    useGraphStore
                        .getState()
                        .showSnackbar(
                            `Исправлено: ${applied}${skipped > 0 ? `, пропущено: ${skipped}` : ""
                            }`,
                        );
                });
            });
        };

        const handler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            runFixAll(detail?.domainId || null, 0, detail?.filter);
        };

        document.addEventListener("dg:lint-fix-all", handler);
        return () => document.removeEventListener("dg:lint-fix-all", handler);
    }, [open, effectiveDomainId]);

    // Effect в компоненте
    useEffect(() => {
        if (!editorCreated || !editorRef.current || !isDirty) return;
        const m = (window as any).monaco;
        if (!m) return;

        const saved = savedContentRef.current;
        if (!saved) return;

        const marks = buildLineDiffMarks(saved, content);
        const cleanup = applyInlineDiffDecorations(editorRef.current, m, marks);
        return cleanup;
    }, [editorCreated, isDirty, content, savedContent]);

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
        setDiffAgainst(null);
        setPublishedContent(null);
        setMetaOverride(null);
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
                void alertDialog(detail.message, { title: "Справка по правилу" });
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

    // Загрузчик: вызывается и при смене файла, и явно после save/publish.
    // Race-protection через монотонный счётчик: применяется только последний ответ.
    const refreshPreviousContent = useCallback(() => {
        if (!filePath) {
            setPreviousContent(null);
            return;
        }
        const myId = ++previousFetchId.current;
        fetch('/file/previous?path=' + encodeURIComponent(filePath))
            .then((r) => (r.status === 204 ? null : r.text()))
            .then((text) => {
                if (previousFetchId.current === myId) setPreviousContent(text);
            })
            .catch(() => {
                if (previousFetchId.current === myId) setPreviousContent(null);
            });
    }, [filePath]);

    // Первичная загрузка / смена файла / открытие модалки.
    // saveFeedback больше НЕ в deps — иначе двойной fetch после каждого save.
    useEffect(() => {
        if (!open) {
            setPreviousContent(null);
            return;
        }
        refreshPreviousContent();
    }, [open, refreshPreviousContent]);

    useEffect(() => {
        if (diffAgainst === null || !monacoReady || !editorCreated || !diffContainerRef.current) return;
        const original =
            diffAgainst === "published" ? publishedContent : previousContent;
        if (original == null) return;
        const w = window as any;
        const m = w.monaco;
        if (!m || !editorRef.current) return;

        const modifiedContent = editorRef.current.getValue();
        const originalModel = m.editor.createModel(original, 'yaml');
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
    }, [diffAgainst, monacoReady, editorCreated, previousContent, publishedContent]);

    useEffect(() => {
        if (!editorRef.current) return;
        // Если редактор в процессе автофикса — не откатывать readOnly назад
        if ((editorRef.current as any).__dgFixAllInProgress) return;
        try {
            editorRef.current.updateOptions({ readOnly: isLocked });
        } catch { /* ignore */ }
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

        // Затенение — визуализация, а не проверка:
        //   • отключается через yamlHighlightUnused (общий флаг),
        //   • НЕ зависит от checksEnabled,
        //   • НЕ работает в режиме редактирования (isLocked=false),
        //     чтобы не мешать при вводе.
        if (!yamlHighlightUnused || !isLocked) {
            if (decorationsCollection.current) decorationsCollection.current.clear();
            return;
        }

        if (!lineMap || !deferredContent) return;
        if (deferredContent.length > 2_000_000) {
            if (decorationsCollection.current) decorationsCollection.current.clear();
            return;
        }

        const m = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (!m || !model || !unusedAnalysis) return;

        const newDecorations: any[] = [];

        // ============ Entities (с вложенной логикой атрибутов) ============
        const entitiesSection = lineMap.sections.find((s) => s.key === "entities");
        if (entitiesSection) {
            entitiesSection.nodes.forEach((entityNode, entityIdx) => {
                const entityKey = entityNode.id.toLowerCase();
                const entityUnused = unusedAnalysis.entities.has(entityKey);

                if (entityUnused) {
                    pushBlockDecoration(
                        newDecorations,
                        m,
                        entitiesSection,
                        entityIdx,
                        `⚠️ Сущность «${entityNode.id}» не используется нигде: ` +
                        `нет inherits, Reference, linkages, views, actions, dataRules, mixins, trees, transitiveLinkages`,
                    );
                    return;
                }

                if (!entityNode.children) return;
                entityNode.children.forEach((attrNode) => {
                    if (attrNode.type !== "attribute") return;
                    const attrKey = `${entityKey}:${attrNode.id.toLowerCase()}`;
                    if (!unusedAnalysis.attributes.has(attrKey)) return;
                    newDecorations.push({
                        range: new m.Range(attrNode.line, 1, attrNode.line, 1),
                        options: {
                            isWholeLine: true,
                            className: "unused-attribute-line",
                            inlineClassName: "unused-attribute-text",
                            hoverMessage: {
                                value: `⚠️ Атрибут «${attrNode.id}» не используется ни в представлениях, ни в правилах данных`,
                            },
                        },
                    });
                });
            });
        }

        // ============ Block-level: dataTypes, actions, sequences, … ============
        const blockSections: Array<{
            sectionKey: string;
            ids: Set<string>;
            label: string;
        }> = [
                { sectionKey: "dataTypes", ids: unusedAnalysis.dataTypes, label: "Тип данных" },
                { sectionKey: "actions", ids: unusedAnalysis.actions, label: "Действие" },
                { sectionKey: "sequences", ids: unusedAnalysis.sequences, label: "Последовательность" },
                { sectionKey: "medias", ids: unusedAnalysis.medias, label: "Иконка" },
                { sectionKey: "trees", ids: unusedAnalysis.trees, label: "Дерево" },
                {
                    sectionKey: "counterColorPattern",
                    ids: unusedAnalysis.counterColorPatterns,
                    label: "Цветовая схема счётчика",
                },
                { sectionKey: "uiPresets", ids: unusedAnalysis.uiPresets, label: "UI Preset" },
                { sectionKey: "permissions", ids: unusedAnalysis.permissions, label: "Разрешение" },
            ];

        for (const cfg of blockSections) {
            if (cfg.ids.size === 0) continue;
            const section = lineMap.sections.find((s) => s.key === cfg.sectionKey);
            if (!section) continue;
            section.nodes.forEach((node, idx) => {
                if (!cfg.ids.has(node.id)) return;
                pushBlockDecoration(
                    newDecorations,
                    m,
                    section,
                    idx,
                    `⚠️ ${cfg.label} «${node.id}» не используется`,
                );
            });
        }

        // ============ transitiveLinkages ============
        if (unusedAnalysis.transitiveLinkages.size > 0) {
            const section = lineMap.sections.find(
                (s) => s.key === "transitiveLinkages",
            );
            if (section) {
                section.nodes.forEach((node, idx) => {
                    if (!unusedAnalysis.transitiveLinkages.has(node.id)) return;
                    pushBlockDecoration(
                        newDecorations,
                        m,
                        section,
                        idx,
                        `⚠️ Транзитивная связь «${node.id}» не используется: ` +
                        `ни один join-id не упоминается в column.join / filter.join / widget.joinId`,
                    );
                });
            }
        }

        // ============ nested views (panel/modal/page) ============
        for (const nv of unusedAnalysis.nestedViews) {
            newDecorations.push({
                range: new m.Range(
                    nv.startLine,
                    1,
                    Math.max(nv.startLine, nv.endLine),
                    1,
                ),
                options: {
                    isWholeLine: true,
                    className: "unused-entity-line",
                    inlineClassName: "unused-entity-text",
                    hoverMessage: {
                        value:
                            `⚠️ Вложенное представление «${nv.id}» не используется: ` +
                            `нет action.modal/panel/pageView, ссылающегося на него`,
                    },
                },
            });
        }

        if (decorationsCollection.current) decorationsCollection.current.clear();
        decorationsCollection.current =
            editorRef.current.createDecorationsCollection(newDecorations);

        return () => {
            if (decorationsCollection.current) decorationsCollection.current.clear();
        };
    }, [
        monacoReady,
        editorCreated,
        lineMap,
        deferredContent,
        yamlHighlightUnused,
        isLocked,
        unusedAnalysis,
    ]);

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
        if (!index || !effectiveDomainId) return null;
        const currentDomainLower = effectiveDomainId.toLowerCase();

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
    }, [index, effectiveDomainId]);

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

    // Смена темы приложения → глобально переключаем тему Monaco.
    // setTheme применяется ко всем инстансам: YamlViewer, Diff-редактор, FileTab.
    useEffect(() => {
        if (!monacoReady) return;
        const m = (window as any).monaco;
        if (!m) return;
        try {
            m.editor.setTheme(monacoTheme);
        } catch {
            /* ignore */
        }
    }, [monacoTheme, monacoReady]);

    useEffect(() => {
        if (!pendingGeneration) return;
        if (!editorCreated || !editorRef.current) return;
        if (!schema) return;

        const editor = editorRef.current;
        const currentContent = editor.getValue();
        const lm = buildLineMap(currentContent, schema);
        const edits = planEdits(
            currentContent,
            pendingGeneration.blocks,
            pendingGeneration.yamlByBlock,
            lm,
            pendingGeneration.manifestStatus,
            !!pendingGeneration.replaceModified,
            pendingGeneration.restoreOrphanedIds,
            pendingGeneration.forceReplaceIds,
        );

        setPendingGeneration(null);

        if (edits.length === 0) {
            useGraphStore.getState().showSnackbar("Не удалось вычислить позиции для вставки");
            return;
        }

        isProgrammaticChange.current = true;
        try {
            editor.executeEdits("dg-generate", edits);
            editor.pushUndoStop();
        } finally {
            isProgrammaticChange.current = false;
        }

        useGraphStore.getState().setYamlViewerPendingIssue(null);
        useGraphStore.getState().setYamlViewerPendingBlock(null);

        // после executeEdits — оставить курсор на первой строке первого edit'а
        if (edits.length > 0) {
            const first = edits[0].range;
            try {
                editor.setPosition({ lineNumber: first.startLineNumber, column: 1 });
                editor.revealLineInCenter(first.startLineNumber);
            } catch { /* ignore */ }
        }

        setContent(editor.getValue());
        setLiveVersion((v) => v + 1);

        useGraphStore
            .getState()
            .showSnackbar(`Добавлено блоков: ${pendingGeneration.blocks.length}`);
    }, [pendingGeneration, editorCreated, schema, setPendingGeneration]);

    // ============ Auto-jump to pending block ============
    // Устанавливается из sidecar (клик на blockId в манифесте). Ждём,
    // пока Monaco создан и контент загружен, вычисляем диапазон через
    // findBlockRange и прыгаем на startLine.
    useEffect(() => {
        if (!open) return;
        if (!pendingBlock) return;
        if (!editorCreated || !editorRef.current) return;
        if (loading) return;

        const content = editorRef.current.getValue();
        if (!content) return;

        const range = findBlockRange(
            content,
            pendingBlock.blockId,
            pendingBlock.parentViewId,
        );
        setPendingBlock(null);
        if (!range) return;

        const t = setTimeout(() => {
            try {
                jumpTo(range.startLine);
            } catch {
                /* ignore */
            }
        }, 50);
        return () => clearTimeout(t);
    }, [open, pendingBlock, editorCreated, loading, jumpTo, setPendingBlock]);

    const diffCount = useMemo(() => {
        if (!isDirty || !savedContent || !idleContent) return null;
        if (idleContent === savedContent) return null;
        return getLineDiff(savedContent, idleContent);
    }, [isDirty, savedContent, idleContent]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current || !filePath) return;
        const ed = editorRef.current;
        const monaco = (window as any).monaco;
        if (!monaco) return;

        const actions: any[] = [];

        // ── F2: toggle закладки на текущей строке ──
        actions.push(ed.addAction({
            id: "dg-toggle-bookmark",
            label: "Переключить закладку",
            keybindings: [monaco.KeyCode.F2],
            precondition: undefined,
            run: (editor: any) => {
                const pos = editor.getPosition();
                if (!pos) return;
                const line = pos.lineNumber;
                const cur = useGraphStore.getState().editorBookmarks[filePath] ?? [];
                const next = cur.includes(line)
                    ? cur.filter((l: number) => l !== line)
                    : [...cur, line].sort((a: number, b: number) => a - b);
                useGraphStore.getState().setEditorBookmarks(filePath, next);
            },
        }));

        // ── Shift+F2: следующая закладка (циклически) ──
        actions.push(ed.addAction({
            id: "dg-next-bookmark",
            label: "Следующая закладка",
            keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F2],
            precondition: undefined,
            run: (editor: any) => {
                const pos = editor.getPosition();
                if (!pos) return;
                const cur = useGraphStore.getState().editorBookmarks[filePath] ?? [];
                if (cur.length === 0) return;
                const next =
                    cur.find((l: number) => l > pos.lineNumber) ?? cur[0];
                editor.revealLineInCenter(next);
                editor.setPosition({ lineNumber: next, column: 1 });
            },
        }));

        // ── Ctrl+Shift+F2: предыдущая закладка ──
        actions.push(ed.addAction({
            id: "dg-prev-bookmark",
            label: "Предыдущая закладка",
            keybindings: [
                monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.F2,
            ],
            precondition: undefined,
            run: (editor: any) => {
                const pos = editor.getPosition();
                if (!pos) return;
                const cur = useGraphStore.getState().editorBookmarks[filePath] ?? [];
                if (cur.length === 0) return;
                const reversed = [...cur].reverse();
                const prev =
                    reversed.find((l: number) => l < pos.lineNumber) ??
                    cur[cur.length - 1];
                editor.revealLineInCenter(prev);
                editor.setPosition({ lineNumber: prev, column: 1 });
            },
        }));

        // ============ Shift+Esc — принудительный показ автодополнения ============
        // Ctrl+Space на macOS перехватывается Spotlight, поэтому используем Shift+Esc.
        // Esc одиночный в Monaco закрывает suggest/find widget — Shift+Esc свободен.
        actions.push(
            ed.addAction({
                id: "dg-force-suggest",
                label: "Показать автодополнение",
                keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Escape],
                contextMenuGroupId: "navigation",
                contextMenuOrder: 0,
                run: (ed: any) => {
                    if (!ed.hasTextFocus || !ed.hasTextFocus()) return;
                    try {
                        ed.trigger("dg-force-suggest", "editor.action.triggerSuggest", null);
                    } catch { /* ignore */ }
                },
            })
        );

        return () => actions.forEach((a) => a.dispose());
    }, [editorCreated, filePath]);

    useEffect(() => {
        if (!editorCreated || !editorRef.current) return;
        const ed = editorRef.current;
        const monaco = (window as any).monaco;

        const actions = [
            ed.addAction({
                id: 'open-in-catalog',
                label: 'Открыть сущность в каталоге',
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 1,
                precondition: 'editorHasSelection',
                run: (editor) => {
                    const selection = editor.getSelection();
                    const text = editor.getModel()?.getValueInRange(selection);
                    if (text && text.includes("/")) {
                        // Если выделен FQID (domain/Entity)
                        useGraphStore.getState().setEntityCatalogInitialFqid(text.trim());
                        useGraphStore.getState().setEntityCatalogOpen(true);
                    } else if (text) {
                        // Если выделен просто EntityId, ищем в текущем домене
                        const fqid = `${domainId}/${text.trim()}`;
                        useGraphStore.getState().setEntityCatalogInitialFqid(fqid);
                        useGraphStore.getState().setEntityCatalogOpen(true);
                    }
                }
            }),
            ed.addAction({
                id: 'generate-for-entity',
                label: 'Сгенерировать блоки для сущности',
                contextMenuGroupId: 'navigation',
                contextMenuOrder: 2,
                run: (editor) => {
                    // Определить сущность по курсору
                    const pos = editor.getPosition();
                    if (!pos || !lineMap) return;
                    const ctx = lineMap.lineContexts.get(pos.lineNumber);
                    const entityCrumb = ctx?.breadcrumbs.find(b => b.type === "entity");
                    if (entityCrumb && domainId) {
                        useGraphStore.getState().setGenerateSchemaDomainId(domainId);
                        useGraphStore.getState().setGenerateSchemaEntityId(entityCrumb.id);
                        useGraphStore.getState().setGenerateSchemaOpen(true);
                    }
                }
            })
        ];

        return () => actions.forEach(a => a.dispose());
    }, [editorCreated, domainId, lineMap]);

    // ============ Эффект B: установить контент (после резолва бэкапа) ============
    useEffect(() => {
        if (!backupResolved) return;
        if (loading) return;
        if (fetchedContent == null) return;

        const contentToSet = backupContent ?? fetchedContent;
        setContent(contentToSet);
        setSavedContent(fetchedContent);

        if (backupContent) {
            // Дать UI знать, что есть что сохранять
            useGraphStore.getState().setYamlViewerDirty(true);
            setLiveVersion((v) => v + 1);
        }

        // mtime — защита от перезаписи внешних правок
        if (filePath) {
            fetch(`/file?path=${encodeURIComponent(filePath)}&stat=1`)
                .then((r) => r.json())
                .then((d) => setLastKnownMtime(d.mtime))
                .catch(() => { /* ignore */ });
        }
    }, [backupResolved, backupContent, loading, fetchedContent, filePath]);

    const executePublish = useCallback(async (valueToSave: string) => {
        setIsSaving(true);
        setSaveStage(mode === "remote" ? "publishing" : "writing");
        setSaveError(null);

        const controller = new AbortController();
        saveAbortRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
            const body: any = {
                path: filePath,
                content: valueToSave,
                action: "publish",
            };
            const pendingManifest = useGraphStore.getState().yamlViewerPendingManifest;
            if (pendingManifest) body.generated = pendingManifest;

            const res = await fetch("/file", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            // !res.ok бывает только если запись на диск упала ДО публикации
            // (см. handleFileSave в routes/file.ts — после fs.writeFileSync
            // все ответы идут с кодом 200, даже при publish.ok === false).
            // Значит локальный файл НЕ изменён — savedContent не трогаем.
            if (!res.ok) {
                const errText = await res.text();
                let errMsg = errText;
                try {
                    const j = JSON.parse(errText);
                    if (j.error) errMsg = j.error;
                } catch { /* ignore */ }
                throw new Error(errMsg);
            }

            invalidateYamlCache(filePath || undefined);

            const st = useGraphStore.getState();
            st.bumpModelVersion();
            st.refreshGraphFromServer(index, true).catch((e: any) => {
                console.warn("[yaml-publish] refreshGraphFromServer failed:", e);
            });

            setSavedContent(valueToSave);
            setContent(valueToSave);
            setLiveVersion((v) => v + 1);
            void yamlBackups.delete(filePath!);
            refreshPreviousContent();

            if (pendingManifest) {
                useGraphStore.getState().setYamlViewerPendingManifest(null);
            }

            try {
                editorRef.current?.pushUndoStop();
            } catch { /* ignore */ }

            // Read-back: сервер мог нормализовать YAML (крайне редко, но
            // handleSave делал то же самое — сохраняем консистентность).
            let diskContent: string | null = null;
            try {
                const back = await fetch(
                    "/file?path=" + encodeURIComponent(filePath || ""),
                );
                if (back.ok) diskContent = await back.text();
            } catch { /* ignore */ }

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
                    "На диске оказалось другое содержимое. Monaco синхронизирован.",
                );
            }

            // Разбираем результат публикации из тела ответа.
            // publish === null бывает в local-режиме (publish не делается,
            // только запись файла) — тогда ведём себя как при обычном save.
            let publishInfo: any = null;
            try {
                const data = await res.json();
                if (data && data.publish) publishInfo = data.publish;
            } catch { /* ignore */ }

            if (publishInfo && publishInfo.ok === true) {
                const publishedVersion =
                    extractTopLevelVersion(valueToSave) || "";
                setMetaOverride((prev) => ({
                    ...(prev || {}),
                    updatedAt: new Date().toISOString(),
                    updatedBy: "вы",
                    ...(publishedVersion
                        ? { publishedVersion }
                        : {}),
                }));
                // После публикации черновика на сервере больше нет —
                // следующий /file/fresh вернёт published.
                useGraphStore
                    .getState()
                    .setYamlViewerContentSource("published");
                setPublishedContent(valueToSave);
                useGraphStore.getState().showSnackbar(
                    `✅ Опубликовано: ${publishInfo.domain?.name || filePath}`,
                );
            } else if (publishInfo && publishInfo.ok === false) {
                hadError = true;

                if (publishInfo.code === "VALIDATION_FAILED") {
                    // Сработала обязательная серверная валидация (defense in depth).
                    // Клиентская предвалидация уже должна была отсечь этот случай,
                    // но если состояние изменилось между вызовами — показываем детали.
                    const diagText = formatValidationDiagnostics({
                        diagnostics: publishInfo.diagnostics,
                        error: publishInfo.error,
                    });
                    setSaveError(
                        `Публикация отклонена: схема не прошла валидацию.\n${diagText}`,
                    );
                    useGraphStore.getState().showSnackbar(
                        "❌ Публикация отклонена: схема не прошла валидацию",
                    );
                } else {
                    const hint = publishInfo.hint ? `\n${publishInfo.hint}` : "";
                    setSaveError(
                        `Локально сохранено. Публикация не прошла: ${publishInfo.error}${hint}`,
                    );
                    useGraphStore.getState().showSnackbar(
                        `⚠️ Локально сохранено, публикация не удалась: ${publishInfo.error}`,
                    );
                }
            }
            // publishInfo === null → local-режим: файл записан, публикации нет.
            // Ничего дополнительного не делаем; setSaveFeedback ниже покажет ✓.

            if (!hadError) {
                setSaveFeedback(true);
                setTimeout(() => setSaveFeedback(false), 2000);
            }
        } catch (err: any) {
            setSaveError(err.message || "Ошибка публикации");
        } finally {
            clearTimeout(timeoutId);
            saveAbortRef.current = null;
            setIsSaving(false);
            setSaveStage("idle");
            // Чистим preview-состояние: пользователь уже подтвердил намерение
            // в модалке. При ошибке он увидит её в шапке, а PublishPreviewModal
            // при следующем открытии пересоберёт data с нуля.
            useGraphStore.getState().setPublishPreviewData(null);
            useGraphStore.getState().setPublishPreviewConfirmAction(null);
        }
    }, [filePath, mode, isSaving]);


    const handlePublish = useCallback(async () => {
        if (isLocked || isSaving || !editorRef.current) return;

        let valueToSave = editorRef.current.getValue();

        // ── 0. Обязательная серверная валидация (только remote) ──
        if (mode === "remote") {
            setIsSaving(true);
            setSaveStage("validating");
            setSaveError(null);

            // ── УДАЛЯЕМ СТАРЫЕ МАРКЕРЫ ПЕРЕД НОВОЙ ВАЛИДАЦИЕЙ ──
            // Тот же приём, что и в handleServerValidate: сброс serverValidation
            // в null заставляет существующий effect очистить source: "server-validate".
            setServerValidation(null);

            try {
                const validation = await validateSourceCodeOnServer(valueToSave);

                if (!validation.isValid) {
                    // ── УСТАНАВЛИВАЕМ МАРКЕРЫ ──
                    // Effect подхватит это состояние и отрисует маркеры в редакторе
                    // через model.setModelMarkers(model, "server-validate", [...]).
                    setServerValidation({
                        isValid: false,
                        diagnostics: validation.diagnostics || [],
                        error: validation.error,
                        validatedAt: new Date().toISOString(),
                    });

                    // Открываем вкладку «Сервер» — там список с кликабельными строками
                    setRightTab("server");

                    // Показываем диалог с деталями
                    const detail = formatValidationDiagnostics(validation);
                    await alertDialog("Схема не прошла серверную валидацию", {
                        variant: "danger",
                        detail,
                        title: "Публикация отменена",
                        confirmLabel: "Исправить",
                    });
                    return;
                }

                // ── УСПЕХ: очищаем маркеры ──
                // isValid: true в существующем effect снимает все маркеры
                // source: "server-validate".
                setServerValidation({
                    isValid: true,
                    diagnostics: [],
                    validatedAt: new Date().toISOString(),
                });
            } catch (e: any) {
                await alertDialog("Ошибка серверной валидации", {
                    variant: "danger",
                    detail: e.message || String(e),
                });
                return;
            } finally {
                setIsSaving(false);
                setSaveStage("idle");
            }
        }

        // 1. Проверяем версию (умный авто-bump по impact)
        if (mode === "remote" || mode === "local") {
            const oldVersion = extractTopLevelVersion(savedContent);
            const newVersion = extractTopLevelVersion(valueToSave);
            if (oldVersion && newVersion && oldVersion === newVersion) {
                // Сначала пробуем классифицировать изменения через computeSemanticDiff.
                // Если по какой-то причине не получилось (parse error, нет изменений) —
                // fallback на консервативный patch-bump, как было раньше.
                const suggestion = suggestVersionBump(
                    oldVersion,
                    savedContent,
                    valueToSave,
                    effectiveDomainId,
                );

                const targetVersion = suggestion
                    ? suggestion.suggested
                    : bumpPatchVersion(oldVersion);

                if (targetVersion) {
                    const levelLabel = suggestion
                        ? ({
                            major: "MAJOR — несовместимые изменения",
                            minor: "MINOR — добавление функционала",
                            patch: "PATCH — исправление",
                        }[suggestion.level])
                        : "PATCH — исправление";

                    const reasonText = suggestion
                        ? suggestion.reason
                        : "изменения не обнаружены";

                    const ok = await confirmDialog(
                        `Версия схемы не изменилась: ${oldVersion}`,
                        {
                            detail:
                                `Тип изменений: ${levelLabel}\n  ${reasonText}\n\n` +
                                `Предлагаю поднять до ${targetVersion} — согласны?`,
                            confirmLabel: `Поднять до ${targetVersion}`,
                            cancelLabel: "Оставить как есть",
                        },
                    );
                    if (!ok) return;

                    // Применяем bump точечно через executeEdits. setValue() сбрасывает
                    // undo-стек, и после отмены preview пользователь не смог бы откатить
                    // свои правки (удаление сущности и т.п.).
                    isProgrammaticChange.current = true;
                    try {
                        const currentText = editorRef.current.getValue();
                        const lines = currentText.split("\n");
                        let versionLineIdx = -1;
                        let newVersionLine = "";

                        for (let i = 0; i < lines.length; i++) {
                            if (/^\s/.test(lines[i])) continue; // только top-level
                            const m = lines[i].match(
                                /^(version\s*:\s*)(["']?)([^"'\s#]+)(["']?)(\s*(?:#.*)?)$/,
                            );
                            if (m) {
                                versionLineIdx = i;
                                newVersionLine = `${m[1]}${m[2]}${targetVersion}${m[4]}${m[5]}`;
                                break;
                            }
                        }

                        if (versionLineIdx < 0) {
                            // Fallback для нестандартного YAML: bump не найден в top-level.
                            editorRef.current.setValue(
                                replaceTopLevelVersion(currentText, targetVersion),
                            );
                        } else {
                            // pushUndoStop до — «запечатать» предыдущую правку пользователя
                            // (удаление сущности), чтобы она осталась отдельным шагом undo.
                            editorRef.current.pushUndoStop();
                            editorRef.current.executeEdits("version-bump", [
                                {
                                    range: {
                                        startLineNumber: versionLineIdx + 1,
                                        startColumn: 1,
                                        endLineNumber: versionLineIdx + 1,
                                        endColumn: lines[versionLineIdx].length + 1,
                                    },
                                    text: newVersionLine,
                                    forceMoveMarkers: true,
                                },
                            ]);
                            // pushUndoStop после — отделить bump от будущих правок.
                            editorRef.current.pushUndoStop();
                        }

                        valueToSave = editorRef.current.getValue();
                    } finally {
                        isProgrammaticChange.current = false;
                    }
                    setContent(valueToSave);
                    setLiveVersion((v) => v + 1);
                }
            }
        }

        // 2. Получаем серверную версию для сравнения
        let publishedYaml = publishedContent;
        if (!publishedYaml) {
            try {
                const r = await fetch("/file/published?path=" + encodeURIComponent(filePath || ""));
                if (r.ok) {
                    publishedYaml = await r.text();
                    setPublishedContent(publishedYaml);
                }
            } catch { /* ignore */ }
        }

        const serverVer = extractTopLevelVersion(publishedYaml) || "0.0.0";
        const localVer = extractTopLevelVersion(valueToSave) || "0.0.0";

        // 3. Считаем дифф
        const diff = computePublishDiff(publishedYaml || "", valueToSave);

        // 4. Если серверной версии нет (первая публикация) — можно пропустить модалку или показать пустую
        // Для безопасности показываем всегда.

        // 5. Открываем модалку
        const st = useGraphStore.getState();
        st.setPublishPreviewData({
            serverVersion: serverVer,
            localVersion: localVer,
            diff,
            valueToSave // сохраняем контент, чтобы передать в executePublish
        });
        st.setPublishPreviewConfirmAction(() => {
            executePublish(valueToSave);
        });
        st.setPublishPreviewOpen(true);

    }, [isLocked, savedContent, filePath, mode, isSaving, publishedContent, executePublish, effectiveDomainId]);

    const canSave = !isLocked && isDirty;

    // contentSource читаем из store, чтобы учитывать ручное обновление
    // после saveDraft / publish (хук useYamlContent обновляется только
    // при следующем fetch).
    const yamlContentSource = useGraphStore((s) => s.yamlViewerContentSource);

    // Публиковать можно не только при локальных изменениях, но и когда
    // на сервере есть черновик — даже если редактор не тронут.
    const canPublish =
        !isLocked && (isDirty || yamlContentSource === "draft");

    // ============ Disabled-флаги (для кнопок шапки) ============
    // Save/Publish дополнительно блокируются на время первичной
    // загрузки (loading из useYamlContent) — content/savedContent ещё
    // пустые, isDirty = false, но и это уже покрывается canSave; явный
    // `loading` нужен для tooltip «Загрузка…» и защиты от клика в
    // момент между fetch и setContent.
    const saveDisabled = !canSave || isSaving || loading;
    const publishDisabled =
        !canPublish || isSaving || mode === "hybrid" || loading;
    // Lock во время save: смена isLocked ломает state текущей операции.
    const lockDisabled = isSaving || loading;
    // Copy при loading: Monaco пуст.
    const copyDisabled = loading;
    // Diff во время save: база устарела, показывать бессмысленно.
    const diffDisabled = isSaving;
    // Server validate: не запускаем параллельно с save (race на сервере).
    const validateDisabled = serverValidating || isSaving;
    // More-меню: пункты, которые закрывают редактор или сравнивают
    // домены — блокируем на время save.
    const moreDisabled = isSaving || loading;

    // Визуал для disabled: в проекте CSS `:disabled` для .btn и
    // .help-modal__icon-btn отсутствует, поэтому применяем inline.
    // Рекомендую также добавить CSS (см. конец ответа) — уберём дублирование.
    const dimStyle = (
        isDisabled: boolean,
    ): React.CSSProperties | undefined =>
        isDisabled
            ? {
                opacity: 0.4,
                cursor: "not-allowed",
                filter: "grayscale(0.6)",
            }
            : undefined;

    const issueCount = effectiveIssues.length;
    const refsCount = externalRefs.refs.length;

    useEffect(() => {
        if (!open) return;
        useGraphStore.getState().setTooltip(null);
        (window as any).__tooltipHovered = false;
    }, [open]);

    useEffect(() => {
        return () => {
            if (pinDecorationsRef.current) {
                try { pinDecorationsRef.current.clear(); } catch { /* ignore */ }
                pinDecorationsRef.current = null;
            }
        };
    }, [editorCreated]);

    // Отступ текущей строки — критично в YAML
    const currentIndent = useMemo(() => {
        if (!idleContent) return null;
        const lines = idleContent.split("\n");
        const line = lines[cursorLine - 1];
        if (line === undefined) return null;
        const m = line.match(/^(\s*)/);
        if (!m) return null;
        const indent = m[1];
        if (!indent) return { spaces: 0, tabs: 0, total: 0 };
        const spaces = (indent.match(/ /g) || []).length;
        const tabs = (indent.match(/\t/g) || []).length;
        return { spaces, tabs, total: spaces + tabs };
    }, [idleContent, cursorLine]);

    const totalLines = useMemo(
        () => (content ? content.split("\n").length : 0),
        [content],
    );

    const lintBreakdown = useMemo(() => {
        const errs = filteredIssues.filter((i) => i.severity === "error").length;
        const warns = filteredIssues.filter((i) => i.severity === "warning").length;
        return { errs, warns };
    }, [filteredIssues]);

    if (!open) return null;

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
                    <div className="help-modal__title" style={{ flexWrap: "wrap", rowGap: 4 }}>
                        <MIcon name="description" size="sm" />

                        {domainId && <span className="help-modal__badge">{domainId}</span>}

                        {/* Статусы: черновик, diff, сохранение/изменён */}
                        {yamlContentSource === "draft" && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "rgba(245, 158, 11, 0.15)",
                                    color: "#f59e0b",
                                }}
                                title="В редакторе открыт черновик с сервера (не опубликован)"
                            >
                                черновик
                            </span>
                        )}
                        {diffAgainst !== null && (
                            <span
                                className="help-modal__badge"
                                style={{
                                    background: "rgba(99, 102, 241, 0.15)",
                                    color: "#818cf8",
                                }}
                                title={
                                    diffAgainst === "published"
                                        ? "Показан diff: черновик ↔ опубликованная версия"
                                        : "Показан diff: текущий файл ↔ предыдущее сохранение на диске"
                                }
                            >
                                {diffAgainst === "published" ? "diff: publish" : "diff: previous"}
                            </span>
                        )}
                        {/* Lock / Edit-mode status — всегда видим, read-only */}
                        <span
                            className={
                                "help-modal__badge help-modal__badge--mode " +
                                (isLocked
                                    ? "help-modal__badge--locked"
                                    : "help-modal__badge--editing")
                            }
                            title={
                                isLocked
                                    ? "Файл заблокирован. Разблокируйте кнопкой 🔒 или двойным Shift"
                                    : "Режим редактирования. Заблокируйте кнопкой 🔓 или двойным Shift"
                            }
                        >
                            <MIcon name={isLocked ? "lock" : "edit"} size="sm" />
                            <span>{isLocked ? "Заблокирован" : "Редактирование"}</span>
                        </span>
                        {isSaving ? (
                            <span
                                className="help-modal__badge help-modal__badge--saving"
                                title={
                                    saveStage === "validating"
                                        ? "Идёт серверная валидация схемы"
                                        : saveStage === "publishing"
                                            ? "Идёт публикация на сервере"
                                            : "Идёт запись файла на диск"
                                }
                            >
                                {saveStage === "validating"
                                    ? "● валидация…"
                                    : saveStage === "publishing"
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
                        ) : null}

                        {isDirty ? (
                            <>
                                <span className="help-modal__badge help-modal__badge--dirty">
                                    ● изменён
                                </span>
                                {/* Пункт 5: Diff-счётчик */}
                                {diffCount && (
                                    <span className="help-modal__badge" style={{ fontFamily: "monospace", background: "var(--bg-750)" }}>
                                        <span style={{ color: "var(--success)" }}>+{diffCount.added}</span>{" "}
                                        <span style={{ color: "var(--danger)" }}>-{diffCount.removed}</span>
                                    </span>
                                )}
                            </>
                        ) : null}

                        {/* Пункт 14: Устаревшие ошибки */}
                        {staleIssueCount > 0 && (
                            <span className="help-modal__badge help-modal__badge--warn" title="Ошибки могут быть неактуальны. Сохраните файл для пересборки.">
                                ⚠ {staleIssueCount} устарели
                            </span>
                        )}

                        {/* Meta-строка: версия (draft), время, автор */}
                        {yamlMeta && (yamlMeta.updatedAt || yamlMeta.updatedBy) && (
                            <span
                                style={{
                                    marginLeft: 12,
                                    paddingLeft: 12,
                                    borderLeft: "1px solid var(--border)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 8,
                                    fontSize: 11,
                                    fontWeight: 400,
                                    color: "var(--text-500)",
                                }}
                            >
                                {yamlMeta.updatedAt && (
                                    <span title={new Date(yamlMeta.updatedAt).toLocaleString("ru-RU")}>
                                        сохранён {relativeTime(yamlMeta.updatedAt)}
                                    </span>
                                )}
                                {yamlMeta.updatedBy && (
                                    <span title="Автор последних изменений">
                                        {yamlMeta.updatedAt ? "· " : ""}
                                        {yamlMeta.updatedBy}
                                    </span>
                                )}
                            </span>
                        )}

                        {(displayDomainName || publishedVersion) && (
                            <div className="yaml-viewer-title__subtitle">
                                {displayDomainName && (
                                    <span className="yaml-viewer-title__domain">
                                        {displayDomainName}
                                    </span>
                                )}
                                {publishedVersion && (
                                    <span
                                        className="yaml-viewer-title__published"
                                        title="Версия, опубликованная на сервере"
                                    >
                                        <MIcon
                                            name="cloud_done"
                                            size="sm"
                                        />
                                        <span>опубликовано v{publishedVersion}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    <div
                        className="help-modal__actions"
                        style={{ gap: 6, alignItems: "center" }}
                    >
                        {/* === PRIMARY: Save / Publish === */}
                        <button
                            className="btn btn--primary"
                            onClick={handleSave}
                            disabled={saveDisabled}
                            style={dimStyle(saveDisabled)}
                            title={
                                isLocked
                                    ? "Разблокируйте файл для сохранения (двойной Shift)"
                                    : isSaving
                                        ? "Сохранение уже выполняется"
                                        : loading
                                            ? "Загрузка схемы…"
                                            : !isDirty
                                                ? "Нет изменений для сохранения"
                                                : mode === "remote"
                                                    ? "Сохранить черновик на сервере (Ctrl+S)"
                                                    : "Сохранить изменения (Ctrl+S)"
                            }
                        >
                            <MIcon
                                name={
                                    isSaving && saveStage === "writing" ? "hourglass" : "save"
                                }
                                size="sm"
                            />
                            <span>Сохранить</span>
                        </button>

                        <button
                            className="btn"
                            onClick={handlePublish}
                            disabled={publishDisabled}
                            style={dimStyle(publishDisabled)}
                            title={
                                mode === "hybrid"
                                    ? "Публикация недоступна в гибридном режиме (только локальное сохранение)"
                                    : isLocked
                                        ? "Разблокируйте файл для публикации"
                                        : isSaving
                                            ? "Дождитесь окончания текущего сохранения"
                                            : loading
                                                ? "Загрузка схемы…"
                                                : !isDirty && yamlContentSource === "draft"
                                                    ? "Опубликовать черновик с сервера (Ctrl+Shift+S)"
                                                    : !isDirty
                                                        ? "Нет изменений для публикации"
                                                        : mode === "remote"
                                                            ? "Опубликовать на сервере (Ctrl+Shift+S). Поднимает version."
                                                            : "Сохранить с повышением version (Ctrl+Shift+S)"
                            }
                        >
                            <MIcon
                                name={
                                    isSaving && saveStage === "publishing"
                                        ? "hourglass"
                                        : "cloud_upload"
                                }
                                size="sm"
                            />
                            <span>Опубликовать</span>
                        </button>

                        <span
                            style={{
                                width: 1,
                                height: 20,
                                background: "var(--border)",
                                margin: "0 4px",
                                display: "inline-block",
                            }}
                        />

                        {/* === STATE: Lock, Copy === */}
                        <button
                            className={"help-modal__icon-btn" + (!isLocked ? " active" : "")}
                            onClick={handleToggleLock}
                            disabled={lockDisabled}
                            style={dimStyle(lockDisabled)}
                            title={
                                isSaving
                                    ? "Дождитесь окончания сохранения"
                                    : loading
                                        ? "Загрузка схемы…"
                                        : isLocked
                                            ? "Разблокировать для редактирования (двойной Shift)"
                                            : "Заблокировать (сбросить изменения)"
                            }
                        >
                            <MIcon name={isLocked ? "lock" : "lock_open"} />
                        </button>

                        <button
                            className={"help-modal__icon-btn" + (copyFeedback ? " active" : "")}
                            onClick={handleCopy}
                            disabled={copyDisabled}
                            style={dimStyle(copyDisabled)}
                            title={
                                loading
                                    ? "Загрузка схемы…"
                                    : "Копировать содержимое в буфер"
                            }
                        >
                            <MIcon name={copyFeedback ? "check" : "content_copy"} />
                        </button>

                        {/* === VIEW: Diff previous / Diff published === */}
                        {previousContent && (
                            <button
                                className={
                                    "help-modal__icon-btn" +
                                    (diffAgainst === "previous" ? " active" : "")
                                }
                                onClick={handleDiffPrevious}
                                disabled={diffDisabled}
                                style={dimStyle(diffDisabled)}
                                title={
                                    isSaving
                                        ? "Дождитесь окончания сохранения"
                                        : diffAgainst === "previous"
                                            ? "Вернуться к редактору"
                                            : "Diff с предыдущим сохранением на диске"
                                }
                            >
                                <MIcon name="difference" />
                            </button>
                        )}

                        {yamlContentSource === "draft" && (
                            <button
                                className={
                                    "help-modal__icon-btn" +
                                    (diffAgainst === "published" ? " active" : "")
                                }
                                onClick={handleDiffPublished}
                                disabled={diffDisabled}
                                style={dimStyle(diffDisabled)}
                                title={
                                    isSaving
                                        ? "Дождитесь окончания сохранения"
                                        : diffAgainst === "published"
                                            ? "Вернуться к редактору"
                                            : "Diff: черновик (в редакторе) ↔ опубликованная версия (на сервере)"
                                }
                            >
                                <MIcon name="cloud_download" />
                            </button>
                        )}

                        {mode === "remote" && (
                            <button
                                className={
                                    "help-modal__icon-btn" + (historyOpen ? " active" : "")
                                }
                                onClick={() => setHistoryOpen((v) => !v)}
                                disabled={isSaving || loading}
                                style={dimStyle(isSaving || loading)}
                                title={
                                    isSaving
                                        ? "Дождитесь окончания сохранения"
                                        : loading
                                            ? "Загрузка схемы…"
                                            : "История версий схемы"
                                }
                            >
                                <MIcon name="history" />
                            </button>
                        )}

                        {/* === SERVER VALIDATE === */}
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
                                disabled={validateDisabled}
                                style={dimStyle(validateDisabled)}
                                title={
                                    serverValidating
                                        ? "Проверка на сервере..."
                                        : isSaving
                                            ? "Дождитесь окончания сохранения"
                                            : serverValidation && !serverValidating
                                                ? serverValidation.isValid
                                                    ? "Сервер: схема валидна"
                                                    : `Сервер: ${serverValidation.diagnostics?.length || "!"} ошибок`
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

                        <span
                            style={{
                                width: 1,
                                height: 20,
                                background: "var(--border)",
                                margin: "0 4px",
                                display: "inline-block",
                            }}
                        />

                        {/* === MORE: dropdown со вторичными действиями === */}
                        <Popover
                            width={280}
                            align="right"
                            trigger={(open) => (
                                <button
                                    className={"help-modal__icon-btn" + (open ? " active" : "")}
                                    title="Дополнительные действия"
                                >
                                    <MIcon name="more_horiz" />
                                </button>
                            )}
                        >
                            {(close) => (
                                <div className="menu">
                                    {domainId && (
                                        <button
                                            className="menu__item"
                                            disabled={moreDisabled}
                                            style={dimStyle(moreDisabled)}
                                            onClick={() => {
                                                const st = useGraphStore.getState();
                                                st.setDomainSchemaDomainId(domainId);
                                                if (navQuery.trim())
                                                    st.setDomainSchemaPrefillQuery(
                                                        navQuery.trim(),
                                                    );
                                                if (onlyProblematic)
                                                    st.setDomainSchemaPrefillOnlyProblematic(true);
                                                st.setDomainSchemaOpen(true);
                                                close();
                                            }}
                                            title={
                                                moreDisabled
                                                    ? "Дождитесь окончания сохранения"
                                                    : "Открыть структурированный обзор схемы"
                                            }
                                        >
                                            <span className="menu__icon">
                                                <MIcon name="menu_book" size="sm" />
                                            </span>
                                            <span className="menu__text">Схема домена</span>
                                        </button>
                                    )}

                                    {domainId && entityIdUnderCursor && (
                                        <button
                                            className="menu__item"
                                            disabled={moreDisabled}
                                            style={dimStyle(moreDisabled)}
                                            onClick={() => {
                                                const st = useGraphStore.getState();
                                                st.setGenerateSchemaDomainId(domainId);
                                                st.setGenerateSchemaEntityId(entityIdUnderCursor);
                                                st.setGenerateSchemaOpen(true);
                                                close();
                                            }}
                                            title={
                                                moreDisabled
                                                    ? "Дождитесь окончания сохранения"
                                                    : `Сгенерировать типовой блок для «${entityIdUnderCursor}»`
                                            }
                                        >
                                            <span className="menu__icon">
                                                <MIcon name="auto_fix_high" size="sm" />
                                            </span>
                                            <span className="menu__text">
                                                Сгенерировать для «{entityIdUnderCursor}»
                                            </span>
                                        </button>
                                    )}

                                    {domainId && (
                                        <button
                                            className="menu__item"
                                            disabled={moreDisabled}
                                            style={dimStyle(moreDisabled)}
                                            onClick={() => {
                                                const st = useGraphStore.getState();
                                                st.setGenerateSchemaDomainId(domainId);
                                                st.setGenerateSchemaEntityId(null);
                                                st.setGenerateSchemaPrefillProfile("domain-extras");
                                                st.setGenerateSchemaOpen(true);
                                                close();
                                            }}
                                            title={
                                                moreDisabled
                                                    ? "Дождитесь окончания сохранения"
                                                    : "Профили без сущности: меню и иконки, Enum/Workflow, цвета статусов, exchangeSettings, counterColorPatterns"
                                            }
                                        >
                                            <span className="menu__icon">
                                                <MIcon name="auto_awesome_motion" size="sm" />
                                            </span>
                                            <span className="menu__text">Сгенерировать для домена</span>
                                        </button>
                                    )}

                                    {index?.pii?.byDomain?.some(
                                        (d: any) => d.domainId === domainId,
                                    ) && (
                                            <button
                                                className="menu__item"
                                                disabled={moreDisabled}
                                                style={dimStyle(moreDisabled)}
                                                onClick={() => {
                                                    useGraphStore.getState().setYamlViewerOpen(false);
                                                    useGraphStore.getState().setPiiOpen(true);
                                                    close();
                                                }}
                                                title={
                                                    moreDisabled
                                                        ? "Дождитесь окончания сохранения"
                                                        : "PII-атрибуты в домене"
                                                }
                                            >
                                                <span className="menu__icon">
                                                    <MIcon name="shield_lock" size="sm" />
                                                </span>
                                                <span className="menu__text">
                                                    PII-атрибуты в домене
                                                </span>
                                            </button>
                                        )}

                                    <button
                                        className="menu__item"
                                        disabled={isDirty || isSaving || loading}
                                        style={dimStyle(isDirty || isSaving || loading)}
                                        onClick={() => {
                                            useGraphStore.getState().setYamlViewerOpen(false);
                                            useGraphStore
                                                .getState()
                                                .setDomainComparePrefillA(domainId);
                                            useGraphStore.getState().setDomainCompareOpen(true);
                                            close();
                                        }}
                                        title={
                                            isDirty
                                                ? "Сохраните или отмените изменения перед переходом"
                                                : isSaving
                                                    ? "Дождитесь окончания сохранения"
                                                    : undefined
                                        }
                                    >
                                        <span className="menu__icon">
                                            <MIcon name="compare_arrows" size="sm" />
                                        </span>
                                        <span className="menu__text">Сравнить домены</span>
                                    </button>

                                    {domainId && (
                                        <button
                                            className="menu__item"
                                            disabled={isDirty || isSaving || loading}
                                            style={dimStyle(isDirty || isSaving || loading)}
                                            onClick={() => {
                                                useGraphStore.getState().setYamlViewerOpen(false);
                                                gotoDomain(domainId);
                                                close();
                                            }}
                                            title={
                                                isDirty
                                                    ? "Сохраните или отмените изменения перед переходом"
                                                    : isSaving
                                                        ? "Дождитесь окончания сохранения"
                                                        : undefined
                                            }
                                        >
                                            <span className="menu__icon">
                                                <MIcon name="my_location" size="sm" />
                                            </span>
                                            <span className="menu__text">
                                                Показать на графе
                                            </span>
                                        </button>
                                    )}

                                    <div className="menu__divider" />

                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            setLeftCollapsed(!leftCollapsed);
                                            close();
                                        }}
                                    >
                                        <span className="menu__icon">
                                            <MIcon
                                                name={
                                                    leftCollapsed ? "chevron_right" : "chevron_left"
                                                }
                                                size="sm"
                                            />
                                        </span>
                                        <span className="menu__text">
                                            {leftCollapsed ? "Показать" : "Скрыть"} навигацию
                                        </span>
                                    </button>

                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            setRightCollapsed(!rightCollapsed);
                                            close();
                                        }}
                                    >
                                        <span className="menu__icon">
                                            <MIcon
                                                name={
                                                    rightCollapsed ? "chevron_left" : "chevron_right"
                                                }
                                                size="sm"
                                            />
                                        </span>
                                        <span className="menu__text">
                                            {rightCollapsed ? "Показать" : "Скрыть"} панель проблем
                                        </span>
                                    </button>

                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            toggleChecks();
                                            close();
                                        }}
                                    >
                                        <span className="menu__icon">
                                            <MIcon
                                                name={checksEnabled ? "rule" : "block"}
                                                size="sm"
                                            />
                                        </span>
                                        <span className="menu__text">
                                            {checksEnabled
                                                ? "Выключить проверки"
                                                : "Включить проверки"}
                                        </span>
                                    </button>

                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            useGraphStore.getState().setYamlHighlightUnused(!yamlHighlightUnused);
                                            close();
                                        }}
                                    >
                                        <span className="menu__icon">
                                            <MIcon
                                                name={
                                                    yamlHighlightUnused
                                                        ? "visibility"
                                                        : "visibility_off"
                                                }
                                                size="sm"
                                            />
                                        </span>
                                        <span className="menu__text">
                                            {yamlHighlightUnused
                                                ? "Не затенять неиспользуемые"
                                                : "Затенять неиспользуемые"}
                                        </span>
                                    </button>

                                    <div className="menu__divider" />

                                    <button
                                        className="menu__item"
                                        onClick={() => {
                                            setShowHelp(true);
                                            close();
                                        }}
                                    >
                                        <span className="menu__icon">
                                            <MIcon name="help" size="sm" />
                                        </span>
                                        <span className="menu__text">Справка по редактору</span>
                                    </button>
                                </div>
                            )}
                        </Popover>

                        <button
                            className="help-modal__close"
                            onClick={handleClose}
                            title={
                                isSaving
                                    ? "Прервать сохранение и закрыть"
                                    : isDirty && !isLocked
                                        ? "Закрыть без сохранения"
                                        : "Закрыть"
                            }
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {open && (
                    <div className="yaml-viewer-tabs-bar">
                        {tabs.map(tab => (
                            <div
                                key={tab}
                                className={`yaml-viewer-tab-item ${tab === filePath ? 'active' : ''}`}
                                onClick={async () => {
                                    if (tab !== filePath) {
                                        await openFileInEditor(tab);
                                    }
                                }}
                            >
                                {tab.split('/').pop()?.replace('.ro', '')}
                                <button onClick={(e) => {
                                    e.stopPropagation();
                                    removeTab(tab);
                                    if (tab === filePath) {
                                        // Открыть другой файл или закрыть модалку
                                        const next = tabs.find(t => t !== tab);
                                        if (next) openFileInEditor(next);
                                        else handleClose();
                                    }
                                }}>✕</button>
                            </div>
                        ))}
                    </div>
                )}

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
                                            setTimeout(() => searchPanelRef.current?.focusInput(), 30);
                                        }}
                                    >
                                        <MIcon name="search" size="sm" />
                                        Поиск
                                        {searchResult && searchResult.totalMatches > 0 && (
                                            <span className="yaml-viewer-nav__tab-badge">
                                                {searchResult.totalMatches > 99 ? "99+" : searchResult.totalMatches}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            "yaml-viewer-nav__tab" +
                                            (navTab === "bookmarks" ? " active" : "")
                                        }
                                        onClick={() => setNavTab("bookmarks")}
                                        title="Закладки (F2 на строке)"
                                    >
                                        <MIcon name="star" size="sm" fill={fileBookmarks.length > 0} />
                                        Закладки
                                        {fileBookmarks.length > 0 && (
                                            <span className="yaml-viewer-nav__tab-badge">
                                                {fileBookmarks.length}
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
                                            placeholder="id, #секция, type:enum, issues, unused"
                                            value={navQuery}
                                            onChange={(e) => {
                                                setNavQuery(e.target.value);
                                                setActiveNavIdx(-1);
                                            }}
                                            spellCheck={false}
                                        />
                                        <button
                                            type="button"
                                            className="yaml-viewer-nav__search-help"
                                            onClick={() => {
                                                useGraphStore.getState().showSnackbar(
                                                    "#entities — фильтр по секции · type:enum — фильтр по типу · " +
                                                    "issues — только с проблемами · unused — только неиспользуемые",
                                                );
                                            }}
                                            title="Синтаксис поиска"
                                        >
                                            <MIcon name="help" size="sm" />
                                        </button>
                                        {navQuery && (
                                            <button
                                                className="yaml-viewer-nav__search-clear"
                                                onClick={() => setNavQuery('')}
                                            >✕</button>
                                        )}
                                    </div>

                                    <div className="yaml-viewer-nav__quick-filters">
                                        <button
                                            type="button"
                                            className={
                                                "yaml-nav-quick-chip" +
                                                (isEmptyParsedQuery(parsedQuery) && !onlyProblematic ? " active" : "")
                                            }
                                            onClick={() => {
                                                setNavQuery("");
                                                setOnlyProblematic(false);
                                            }}
                                            title="Сбросить фильтры"
                                        >
                                            Все
                                        </button>
                                        <button
                                            type="button"
                                            className={
                                                "yaml-nav-quick-chip" +
                                                (onlyProblematic || parsedQuery.hasIssues === true ? " active" : "")
                                            }
                                            onClick={() => {
                                                if (onlyProblematic) {
                                                    setOnlyProblematic(false);
                                                    setNavQuery("");
                                                } else {
                                                    setNavQuery("issues");
                                                }
                                            }}
                                            title="Только с проблемами"
                                        >
                                            <MIcon name="warning" size="sm" />
                                            С issues
                                        </button>
                                        {unusedAnalysis && (
                                            <button
                                                type="button"
                                                className={
                                                    "yaml-nav-quick-chip" +
                                                    (parsedQuery.unused === true ? " active" : "")
                                                }
                                                onClick={() => {
                                                    setNavQuery(parsedQuery.unused === true ? "" : "unused");
                                                }}
                                                title="Неиспользуемые элементы"
                                            >
                                                <MIcon name="visibility_off" size="sm" />
                                                Unused
                                            </button>
                                        )}
                                        {sectionFilterKeys.length > 1 && (
                                            <select
                                                className="yaml-nav-section-select"
                                                value={parsedQuery.sectionFilter || ""}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setNavQuery(v ? `#${v}` : "");
                                                }}
                                                title="Фильтр по секции"
                                            >
                                                <option value="">Секции</option>
                                                {sectionFilterKeys.map((k) => (
                                                    <option key={k.key} value={k.key}>
                                                        {k.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    <div className="yaml-viewer-nav__list" ref={navListRef}>
                                        {!isEmptyParsedQuery(parsedQuery) || onlyProblematic ? (
                                            <FilteredNavList
                                                rows={filteredNavNodes}
                                                activeKey={activeKey}
                                                onJump={jumpTo}
                                                onHover={setActiveNavIdx}
                                                focusTarget={focusTarget}
                                                onFocus={handleFocus}
                                                onContextMenu={(node, sectionKey, x, y) =>
                                                    setNavContextMenu({ node, sectionKey, x, y })
                                                }
                                                onOpenIssues={() => setRightTab("issues")}
                                            />
                                        ) : (
                                            <>
                                                {lineMap && lineMap.sections.length === 0 && (
                                                    <div className="yaml-viewer-nav__empty">
                                                        <MIcon name="warning" size="sm" />
                                                        <span>
                                                            Не удалось распознать секции YAML. Проверьте, что файл —
                                                            корректный YAML-документ с верхнеуровневыми секциями
                                                            (<code>entities:</code>, <code>views:</code>, …).
                                                        </span>
                                                    </div>
                                                )}
                                                {lineMap && lineMap.sections.length > 0 && (
                                                    lineMap.sections.map((section) => (
                                                        <SectionNavPanel
                                                            key={section.key}
                                                            section={section}
                                                            sectionKey={section.key}
                                                            expandedNodes={expandedNodes}
                                                            onToggleNode={toggleNode}
                                                            onJump={jumpTo}
                                                            issues={allIssues}
                                                            activeKey={activeKey}
                                                            onSetActive={setActiveNavIdx}
                                                            entityIssuesMap={entityIssuesMap}
                                                            attrIssuesMap={attrIssuesMap}
                                                            focusTarget={focusTarget}
                                                            onFocus={handleFocus}
                                                            onContextMenu={(node, sectionKey, x, y) =>
                                                                setNavContextMenu({ node, sectionKey, x, y })
                                                            }
                                                            unusedAnalysis={unusedAnalysis}
                                                            cursorEntityId={entityIdUnderCursor}
                                                            cursorAttributeId={cursorAttributeId}
                                                            onOpenIssues={() => setRightTab("issues")}
                                                        />
                                                    ))
                                                )}
                                            </>
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
                                        onJump={(line) => jumpTo(line, { focus: false })}
                                    />
                                </div>

                                <div
                                    className="yaml-viewer-nav__pane"
                                    style={navTab === "bookmarks" ? undefined : { display: "none" }}
                                >
                                    <div className="yaml-viewer-nav__header">
                                        <span>Закладки</span>
                                        <span className="yaml-viewer-nav__count">{fileBookmarks.length}</span>

                                        {fileBookmarks.length > 0 && (
                                            <div className="yaml-viewer-nav__actions">
                                                <button
                                                    className="yaml-viewer-nav__action"
                                                    onClick={() => {
                                                        if (!editorRef.current) return;
                                                        const pos = editorRef.current.getPosition();
                                                        if (!pos) return;
                                                        const next =
                                                            fileBookmarks.find((l) => l > pos.lineNumber) ??
                                                            fileBookmarks[0];
                                                        jumpTo(next, { focus: true });
                                                    }}
                                                    title="Следующая закладка (Shift+F2)"
                                                >
                                                    <MIcon name="expand_less" size="sm" />
                                                </button>
                                                <button
                                                    className="yaml-viewer-nav__action"
                                                    onClick={() => {
                                                        if (!editorRef.current) return;
                                                        const pos = editorRef.current.getPosition();
                                                        if (!pos) return;
                                                        const reversed = [...fileBookmarks].reverse();
                                                        const prev =
                                                            reversed.find((l) => l < pos.lineNumber) ??
                                                            fileBookmarks[fileBookmarks.length - 1];
                                                        jumpTo(prev, { focus: true });
                                                    }}
                                                    title="Предыдущая закладка (Ctrl+Shift+F2)"
                                                >
                                                    <MIcon name="expand_more" size="sm" />
                                                </button>
                                                <button
                                                    className="yaml-viewer-nav__action"
                                                    onClick={async () => {
                                                        const text = fileBookmarks
                                                            .map((l) => `${filePath}:${l}`)
                                                            .join("\n");
                                                        try {
                                                            await navigator.clipboard.writeText(text);
                                                            useGraphStore
                                                                .getState()
                                                                .showSnackbar(
                                                                    `Скопировано: ${fileBookmarks.length}`,
                                                                );
                                                        } catch {
                                                            /* ignore */
                                                        }
                                                    }}
                                                    title="Копировать все закладки"
                                                >
                                                    <MIcon name="content_copy" size="sm" />
                                                </button>
                                                <button
                                                    className="yaml-viewer-nav__action"
                                                    onClick={async () => {
                                                        const ok = await confirmDialog(
                                                            "Удалить все закладки?",
                                                            {
                                                                detail:
                                                                    "Все закладки в этом файле будут удалены.",
                                                                danger: true,
                                                                confirmLabel: "Удалить",
                                                            },
                                                        );
                                                        if (ok) setEditorBookmarks(filePath!, []);
                                                    }}
                                                    title="Удалить все закладки"
                                                >
                                                    <MIcon name="delete_sweep" size="sm" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Поиск по закладкам — только если их много */}
                                    {fileBookmarks.length > 3 && (
                                        <div className="yaml-viewer-bookmarks-search">
                                            <MIcon name="search" size="sm" />
                                            <input
                                                type="text"
                                                value={bookmarksQuery}
                                                onChange={(e) => setBookmarksQuery(e.target.value)}
                                                placeholder="Фильтр по тексту или номеру строки…"
                                                spellCheck={false}
                                            />
                                            {bookmarksQuery && (
                                                <button
                                                    type="button"
                                                    className="yaml-viewer-bookmarks-search__clear"
                                                    onClick={() => setBookmarksQuery("")}
                                                    title="Очистить"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <div className="yaml-viewer-nav__list">
                                        {bookmarkDetails.length === 0 ? (
                                            <div className="yaml-viewer-bookmarks-empty">
                                                <MIcon name="star_border" size="lg" />
                                                <div className="yaml-viewer-bookmarks-empty__title">
                                                    Нет закладок
                                                </div>
                                                <div className="yaml-viewer-bookmarks-empty__hint">
                                                    Поставьте курсор на нужную строку и нажмите <kbd>F2</kbd>,
                                                    чтобы закрепить место.
                                                </div>
                                            </div>
                                        ) : filteredBookmarks.length === 0 ? (
                                            <div className="yaml-viewer-bookmarks-empty">
                                                <MIcon name="search_off" size="lg" />
                                                <div className="yaml-viewer-bookmarks-empty__title">
                                                    Ничего не найдено
                                                </div>
                                                <div className="yaml-viewer-bookmarks-empty__hint">
                                                    Попробуйте изменить запрос «{bookmarksQuery}»
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn--small"
                                                    onClick={() => setBookmarksQuery("")}
                                                    style={{ marginTop: 8 }}
                                                >
                                                    Сбросить фильтр
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="yaml-viewer-bookmarks-list">
                                                {filteredBookmarks.map((b) => (
                                                    <div
                                                        key={b.line}
                                                        className="yaml-viewer-bookmark"
                                                        onClick={() => jumpTo(b.line, { focus: true })}
                                                        title={`Строка ${b.line}: ${b.raw.trim() || "(пустая строка)"}`}
                                                    >
                                                        <span className="yaml-viewer-bookmark__line">
                                                            {b.line}
                                                        </span>
                                                        <span className="yaml-viewer-bookmark__text">
                                                            {b.text || (
                                                                <span className="yaml-viewer-bookmark__empty">
                                                                    пустая строка
                                                                </span>
                                                            )}
                                                        </span>
                                                        <div className="yaml-viewer-bookmark__actions">
                                                            <button
                                                                type="button"
                                                                className="yaml-viewer-bookmark__action"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigator.clipboard
                                                                        .writeText(b.raw)
                                                                        .then(() =>
                                                                            useGraphStore
                                                                                .getState()
                                                                                .showSnackbar("Строка скопирована"),
                                                                        )
                                                                        .catch(() => {
                                                                            /* ignore */
                                                                        });
                                                                }}
                                                                title="Копировать строку"
                                                            >
                                                                <MIcon name="content_copy" size="sm" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="yaml-viewer-bookmark__action"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    navigator.clipboard
                                                                        .writeText(`${filePath}:${b.line}`)
                                                                        .then(() =>
                                                                            useGraphStore
                                                                                .getState()
                                                                                .showSnackbar(
                                                                                    "Путь к строке скопирован",
                                                                                ),
                                                                        )
                                                                        .catch(() => {
                                                                            /* ignore */
                                                                        });
                                                                }}
                                                                title="Копировать путь к строке"
                                                            >
                                                                <MIcon name="link" size="sm" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="yaml-viewer-bookmark__action yaml-viewer-bookmark__action--danger"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const next = fileBookmarks.filter(
                                                                        (l) => l !== b.line,
                                                                    );
                                                                    setEditorBookmarks(filePath!, next);
                                                                }}
                                                                title="Удалить закладку"
                                                            >
                                                                <MIcon name="close" size="sm" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
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
                                        {domainId && (
                                            <PinButton
                                                target={`line:${domainId}:${cursorLine}`}
                                                domainId={domainId}
                                                kind="domain"
                                                label={`${domainId} :${cursorLine}`}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <span className="yaml-viewer-breadcrumbs__item">—</span>
                                )}
                            </div>

                            {/* Right: quickjumps + fold controls */}
                            <div className="yaml-viewer-toolbar-right">
                                {/* Скрытие затенённых строк при фокусе */}
                                {focusTarget && focusResult && dimmedCount > 0 && (
                                    <button
                                        type="button"
                                        className={
                                            "yaml-viewer-fold-btn yaml-viewer-focus-hide-btn" +
                                            (hideDimmed ? " yaml-viewer-fold-btn--active" : "")
                                        }
                                        onClick={() => setHideDimmed((v) => !v)}
                                        title={
                                            hideDimmed
                                                ? "Показать все строки"
                                                : `Скрыть ${dimmedCount} ${pluralFew(dimmedCount, "строку", "строки", "строк")} вне фокуса`
                                        }
                                    >
                                        <MIcon
                                            name={hideDimmed ? "unfold_more" : "visibility_off"}
                                            size="sm"
                                        />
                                        <span className="yaml-viewer-focus-hide-btn__count">
                                            {dimmedCount}
                                        </span>
                                    </button>
                                )}

                                <Hint info={HINTS.quickjump} className="yaml-viewer-quickjump-anchor">
                                    <button
                                        type="button"
                                        className="yaml-viewer-fold-btn yaml-viewer-quickjump-btn"
                                        onClick={() => {
                                            setQuickJumpInitialQuery(null);
                                            setQuickJumpOpen(true);
                                        }}
                                    >
                                        <MIcon name="my_location" size="sm" />
                                    </button>
                                </Hint>
                                <div className="yaml-viewer-fold-controls">
                                    {([1, 2, 3, 4, 5] as const).map((lvl) => (
                                        <Hint key={lvl} info={HINTS.fold}>
                                            <button
                                                className={
                                                    "yaml-viewer-fold-btn" +
                                                    (activeFoldLevel === lvl ? " yaml-viewer-fold-btn--active" : "")
                                                }
                                                onClick={() => {
                                                    if (activeFoldLevel === lvl) unfoldAll();
                                                    else foldToLevel(lvl);
                                                }}
                                            >
                                                {lvl}
                                            </button>
                                        </Hint>
                                    ))}
                                    <Hint info={HINTS["fold-unfold"]}>
                                        <button className="yaml-viewer-fold-btn" onClick={unfoldAll}>
                                            <MIcon name="unfold_more" size="sm" />
                                        </button>
                                    </Hint>
                                    <Popover
                                        align="right"
                                        width={280}
                                        trigger={(open) => (
                                            <Hint info={HINTS["fold-more"]}>
                                                <button
                                                    className={
                                                        "yaml-viewer-fold-btn" +
                                                        (open ? " yaml-viewer-fold-btn--active" : "")
                                                    }
                                                >
                                                    <MIcon name="more_horiz" size="sm" />
                                                </button>
                                            </Hint>
                                        )}
                                    >
                                        {(close) => (
                                            <div className="menu">
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldAll(); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="unfold_less" size="sm" />
                                                    </span>
                                                    <span className="menu__text">Свернуть всё</span>
                                                </button>
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { unfoldAll(); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="unfold_more" size="sm" />
                                                    </span>
                                                    <span className="menu__text">Развернуть всё</span>
                                                </button>
                                                <div className="menu__divider" />
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldSiblings(); close(); }}
                                                    title="Свернуть все элементы списка того же уровня, кроме текущего"
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="splitscreen" size="sm" />
                                                    </span>
                                                    <span className="menu__text">Свернуть сиблингов курсора</span>
                                                </button>
                                                <div className="menu__divider" />
                                                <div className="menu__label">Свернуть все блоки</div>
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldBlocksByKey("attributes"); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="view_list" size="sm" />
                                                    </span>
                                                    <span className="menu__text">attributes</span>
                                                </button>
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldBlocksByKey("widgets"); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="widgets" size="sm" />
                                                    </span>
                                                    <span className="menu__text">widgets</span>
                                                </button>
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldBlocksByKey("groups"); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="view_module" size="sm" />
                                                    </span>
                                                    <span className="menu__text">groups</span>
                                                </button>
                                                <button
                                                    className="menu__item"
                                                    onClick={() => { foldBlocksByKey("views"); close(); }}
                                                >
                                                    <span className="menu__icon">
                                                        <MIcon name="view_quilt" size="sm" />
                                                    </span>
                                                    <span className="menu__text">views</span>
                                                </button>
                                                <div className="menu__divider" />
                                                <label className="menu__checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={!yamlQuickNavEnabled}
                                                        onChange={() => setYamlQuickNavEnabled(!yamlQuickNavEnabled)}
                                                    />
                                                    <span className="menu__check" />
                                                    <span className="menu__text">
                                                        Скрыть оглавление при скролле
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </Popover>
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
                            {diffAgainst !== null && (
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

                        {lineMap && (
                            <SectionQuickNav
                                lineMap={lineMap}
                                topLine={editorTopLine}
                                autoOpenSignal={scrollSignal}
                                onJump={jumpTo}
                                enabled={yamlQuickNavEnabled}
                            />
                        )}

                        {/* ═══════════ Footer / Status bar ═══════════ */}
                        <div className="yaml-viewer-statusbar">
                            {/* ── Левая зона: контекст курсора ── */}
                            <div className="yaml-viewer-statusbar__left">
                                <span
                                    className="yaml-viewer-statusbar__item"
                                    title="Позиция курсора (строка, колонка)"
                                >
                                    Ln {cursorLine}, Col {cursorColumn}
                                </span>

                                {selection && (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--muted"
                                        title="Выделенный фрагмент"
                                    >
                                        Выделено: {selection.chars}{" "}
                                        {pluralFew(selection.chars, "символ", "символа", "символов")}
                                        {selection.lines > 1 && ` · ${selection.lines} стр.`}
                                    </span>
                                )}

                                {currentIndent && currentIndent.total > 0 && (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--muted"
                                        title="Отступ текущей строки"
                                    >
                                        {currentIndent.tabs > 0
                                            ? `Tabs: ${currentIndent.tabs}`
                                            : `Spaces: ${currentIndent.spaces}`}
                                    </span>
                                )}

                                <span
                                    className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--muted"
                                    title="Всего строк в файле"
                                >
                                    {totalLines} {pluralFew(totalLines, "строка", "строки", "строк")}
                                </span>
                            </div>

                            {/* ── Центр: валидация ── */}
                            <div className="yaml-viewer-statusbar__center">
                                {yamlSyntaxIssue ? (
                                    <button
                                        type="button"
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--err yaml-viewer-statusbar__item--clickable"
                                        onClick={() => {
                                            const ln = yamlSyntaxIssue.line || 1;
                                            jumpTo(ln);
                                        }}
                                        title="Перейти к ошибке YAML"
                                    >
                                        <MIcon name="error" size="sm" />
                                        YAML: ошибка (стр. {yamlSyntaxIssue.line || "?"})
                                    </button>
                                ) : (
                                    <span className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--ok">
                                        <MIcon name="check_circle" size="sm" />
                                        YAML валиден
                                    </span>
                                )}

                                {issueCount > 0 && (
                                    <button
                                        type="button"
                                        className={
                                            "yaml-viewer-statusbar__item yaml-viewer-statusbar__item--clickable " +
                                            (lintBreakdown.errs > 0
                                                ? "yaml-viewer-statusbar__item--err"
                                                : "yaml-viewer-statusbar__item--warn")
                                        }
                                        onClick={() => setRightTab("issues")}
                                        title="Открыть список проблем в правой панели"
                                    >
                                        <MIcon name="warning" size="sm" />
                                        {lintBreakdown.errs > 0 && `${lintBreakdown.errs}E`}
                                        {lintBreakdown.errs > 0 && lintBreakdown.warns > 0 && " · "}
                                        {lintBreakdown.warns > 0 && `${lintBreakdown.warns}W`}
                                        {lintBreakdown.errs === 0 && lintBreakdown.warns === 0 && `${issueCount}`}
                                    </button>
                                )}
                            </div>

                            {/* ── Правая зона: состояние + главная подсказка ── */}
                            <div className="yaml-viewer-statusbar__right">
                                {yamlContentSource === "draft" && (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--warn"
                                        title="Открыт черновик с сервера (не опубликован)"
                                    >
                                        <MIcon name="edit_note" size="sm" />
                                        черновик
                                    </span>
                                )}

                                {isDirty && (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--warn"
                                        title="Есть несохранённые изменения"
                                    >
                                        ● не сохранён
                                    </span>
                                )}

                                {isLocked ? (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--muted"
                                        title="Файл заблокирован (двойной Shift — разблокировать)"
                                    >
                                        <MIcon name="lock" size="sm" />
                                        locked
                                    </span>
                                ) : (
                                    <span
                                        className="yaml-viewer-statusbar__item yaml-viewer-statusbar__item--ok"
                                        title="Режим редактирования"
                                    >
                                        <MIcon name="lock_open" size="sm" />
                                        editing
                                    </span>
                                )}

                                <button
                                    type="button"
                                    className="yaml-viewer-statusbar__hint"
                                    onClick={() => {
                                        const ed = editorRef.current;
                                        if (!ed) return;
                                        try {
                                            ed.trigger(
                                                "dg-force-suggest",
                                                "editor.action.triggerSuggest",
                                                null,
                                            );
                                        } catch {
                                            /* ignore */
                                        }
                                    }}
                                    title="Открыть автодополнение в текущей позиции (Shift+Esc)"
                                >
                                    <kbd>Shift</kbd>
                                    <span className="yaml-viewer-statusbar__hint-sep">+</span>
                                    <kbd>Esc</kbd>
                                    <span className="yaml-viewer-statusbar__hint-label">
                                        автодополнение
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right panel with tabs */}
                    <div className={"yaml-viewer-issues" + (rightCollapsed ? " yaml-viewer-issues--collapsed" : "")}>
                        <div className="yaml-viewer-tabs">
                            <Hint className='yaml-viewer-tab' info={HINTS["tab-issues"]} style={{ padding: 0 }}>
                                <button
                                    className={"yaml-viewer-tab" + (rightTab === "issues" ? " active" : "")}
                                    onClick={() => setRightTab("issues")}
                                >
                                    <MIcon name="rule" size="sm" />
                                    {issueCount > 0 && (
                                        <span className="yaml-viewer-tab__badge">{issueCount}</span>
                                    )}
                                </button>
                            </Hint>
                            <Hint className='yaml-viewer-tab' info={HINTS["tab-refs"]} style={{ padding: 0 }}>
                                <button
                                    className={"yaml-viewer-tab" + (rightTab === "refs" ? " active" : "")}
                                    onClick={() => setRightTab("refs")}
                                >
                                    <MIcon name="link" size="sm" />
                                    {refsCount > 0 && (
                                        <span className="yaml-viewer-tab__badge">{refsCount}</span>
                                    )}
                                </button>
                            </Hint>
                            <Hint className='yaml-viewer-tab' info={HINTS["tab-backlinks"]} style={{ padding: 0 }}>
                                <button
                                    className={"yaml-viewer-tab" + (rightTab === "backlinks" ? " active" : "")}
                                    onClick={() => setRightTab("backlinks")}
                                >
                                    <MIcon name="call_received" size="sm" />
                                    {backlinks.entity.length + backlinks.attribute.length > 0 && (
                                        <span className="yaml-viewer-tab__badge">
                                            {backlinks.entity.length + backlinks.attribute.length}
                                        </span>
                                    )}
                                </button>
                            </Hint>
                            {serverAvailable && (
                                <Hint className='yaml-viewer-tab' info={HINTS["tab-server"]} style={{ padding: 0 }}>
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
                                </Hint>
                            )}
                        </div>

                        {rightTab === 'issues' && (
                            <IssuesPanel
                                issues={filteredIssues}
                                allIssues={effectiveIssues}
                                onJump={jumpTo}
                                lineMap={lineMap}
                                severityFilter={severityFilter}
                                setSeverityFilter={setSeverityFilter}
                                domainId={domainId}
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
                            <BacklinksPanel
                                backlinks={backlinks}
                                onJump={jumpTo}
                                currentDomain={domainId}
                            />
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

            {quickJumpOpen && lineMap && (
                <YamlQuickJump
                    lineMap={lineMap}
                    content={content}
                    index={index}
                    domainId={domainId}
                    cursorLine={cursorLine}
                    domainIssues={effectiveIssues}
                    initialQuery={quickJumpInitialQuery}
                    onSelect={handleQuickJumpSelect}
                    onClose={() => {
                        setQuickJumpOpen(false);
                        setQuickJumpInitialQuery(null);
                    }}
                />
            )}

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

            {historyOpen && (
                <SchemaHistoryModal
                    filePath={filePath}
                    currentContent={content}
                    mode={mode}
                    onClose={() => setHistoryOpen(false)}
                    onApply={handleApplyHistory}
                />
            )}
        </div>
    );
}

// ============ ExternalRefsPanel ============

type ExtKind =
    | "entity"
    | "view"
    | "action"
    | "linkage"
    | "dataType"
    | "sequence"
    | "scenario"
    | "other";

interface ExtKindMeta {
    id: ExtKind;
    label: string;
    color: string;
    icon: string;
}

const EXT_KIND_META: Record<ExtKind, ExtKindMeta> = {
    entity: { id: "entity", label: "entity", color: "#6366f1", icon: "data_object" },
    view: { id: "view", label: "view", color: "#10b981", icon: "view_quilt" },
    action: { id: "action", label: "action", color: "#f59e0b", icon: "bolt" },
    linkage: { id: "linkage", label: "linkage", color: "#a78bfa", icon: "link" },
    dataType: { id: "dataType", label: "dataType", color: "#ec4899", icon: "category" },
    sequence: { id: "sequence", label: "sequence", color: "#06b6d4", icon: "linear_scale" },
    scenario: { id: "scenario", label: "scenario", color: "#8b5cf6", icon: "movie" },
    other: { id: "other", label: "other", color: "#64748b", icon: "help" },
};

function classifyExtField(field: string): ExtKind {
    switch (field) {
        case "entity":
        case "inherits":
        case "side1":
        case "side2":
        case "attribute":
            return "entity";
        case "view":
        case "modal":
        case "panel":
        case "form":
        case "tab":
        case "list":
        case "page":
        case "addLinksView":
        case "fromView":
        case "viewId":
            return "view";
        case "action":
        case "widget":
            return "action";
        case "linkage":
        case "join":
            return "linkage";
        case "dataType":
            return "dataType";
        case "sequence":
            return "sequence";
        default:
            return "other";
    }
}

interface FlatExtItem {
    type: "ref" | "scenario";
    key: string;
    line: number;
    kind: ExtKindMeta;

    // ref
    domain?: string;
    target?: string;
    field?: string;
    raw?: string;
    lineText?: string;
    targetCount?: number;

    // scenario
    scenarioId?: string;
    actionId?: string;
    actionName?: string;
    workerTag?: string;
}

interface ExtGroup {
    key: string;
    label: string;
    labelIcon?: string;
    labelColor?: string;
    sublabel?: string;
    domain?: string;
    kind?: ExtKind;
    items: FlatExtItem[];
}

function extRefKey(r: any): string {
    return `ref:${r.line}:${r.field}:${r.domain}:${r.target}`;
}

function extScenarioKey(s: any, a: any): string {
    return `sc:${s.scenarioId}:${a.actionId}:${a.line}`;
}

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
    const { goto } = useNavigation();
    const nodes = useGraphStore((s) => s.nodes);

    const [query, setQuery] = useState("");
    const [groupMode, setGroupMode] = useState<"domain" | "kind" | "flat">(
        "domain",
    );
    const [kindFilter, setKindFilter] = useState<Set<ExtKind>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // ── Плоский список refs ──
    const allRefs = useMemo<FlatExtItem[]>(() => {
        const counts = new Map<string, number>();
        for (const g of groups) {
            for (const r of g.refs) {
                const k = `${g.domain}|${r.target}`;
                counts.set(k, (counts.get(k) || 0) + 1);
            }
        }
        const out: FlatExtItem[] = [];
        for (const g of groups) {
            for (const r of g.refs) {
                const kind = classifyExtField(r.field);
                out.push({
                    type: "ref",
                    key: extRefKey(r),
                    line: r.line,
                    kind: EXT_KIND_META[kind],
                    domain: g.domain,
                    target: r.target,
                    field: r.field,
                    raw: r.raw,
                    lineText: r.lineText,
                    targetCount: counts.get(`${g.domain}|${r.target}`) || 1,
                });
            }
        }
        return out;
    }, [groups]);

    // ── Плоский список scenario ──
    const allScenarios = useMemo<FlatExtItem[]>(() => {
        const out: FlatExtItem[] = [];
        for (const s of scenarioRefs) {
            for (const a of s.actions) {
                out.push({
                    type: "scenario",
                    key: extScenarioKey(s, a),
                    line: a.line,
                    kind: EXT_KIND_META.scenario,
                    scenarioId: s.scenarioId,
                    actionId: a.actionId,
                    actionName: a.actionName,
                    workerTag: a.workerTag,
                });
            }
        }
        return out;
    }, [scenarioRefs]);

    const allItems = useMemo(
        () => [...allRefs, ...allScenarios],
        [allRefs, allScenarios],
    );

    // ── Фильтрация ──
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allItems.filter((it) => {
            if (kindFilter.size > 0 && !kindFilter.has(it.kind.id)) return false;
            if (!q) return true;
            const hay = [
                it.domain,
                it.target,
                it.field,
                it.raw,
                it.lineText,
                it.scenarioId,
                it.actionId,
                it.actionName,
                it.workerTag,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [allItems, query, kindFilter]);

    // ── Счётчики по типам ──
    const kindCounts = useMemo(() => {
        const c = new Map<ExtKind, number>();
        for (const it of allItems) {
            c.set(it.kind.id, (c.get(it.kind.id) || 0) + 1);
        }
        return c;
    }, [allItems]);

    // ── Группировка ──
    const grouped = useMemo<ExtGroup[]>(() => {
        if (filtered.length === 0) return [];

        if (groupMode === "flat") {
            const sorted = [...filtered].sort((a, b) => a.line - b.line);
            return [
                {
                    key: "__flat__",
                    label: "Все ссылки",
                    sublabel: `${sorted.length}`,
                    items: sorted,
                },
            ];
        }

        if (groupMode === "kind") {
            const map = new Map<ExtKind, FlatExtItem[]>();
            for (const it of filtered) {
                if (!map.has(it.kind.id)) map.set(it.kind.id, []);
                map.get(it.kind.id)!.push(it);
            }
            return Array.from(map.entries())
                .sort((a, b) => b[1].length - a[1].length)
                .map(([k, items]) => ({
                    key: `kind:${k}`,
                    label: EXT_KIND_META[k].label,
                    labelIcon: EXT_KIND_META[k].icon,
                    labelColor: EXT_KIND_META[k].color,
                    sublabel: `${items.length}`,
                    items: items.slice().sort((a, b) => a.line - b.line),
                }));
        }

        // domain
        const map = new Map<string, FlatExtItem[]>();
        for (const it of filtered) {
            const d = it.type === "ref" ? it.domain! : "__scenario__";
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(it);
        }
        return Array.from(map.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([domain, items]) => {
                if (domain === "__scenario__") {
                    return {
                        key: "domain:__scenario__",
                        label: "Playbooks / сценарии",
                        labelIcon: "movie",
                        labelColor: EXT_KIND_META.scenario.color,
                        sublabel: `${items.length}`,
                        items: items.slice().sort((a, b) => a.line - b.line),
                    };
                }
                const uniqueTargets = new Set(
                    items.filter((i) => i.type === "ref").map((i) => i.target!),
                ).size;
                return {
                    key: `domain:${domain}`,
                    label: domain,
                    labelIcon: "folder",
                    labelColor: "#64748b",
                    domain,
                    sublabel: `${items.length} · ${uniqueTargets} уник.`,
                    items: items.slice().sort((a, b) => a.line - b.line),
                };
            });
    }, [filtered, groupMode]);

    // ── Плоский список для навигации (только развёрнутые) ──
    const navList = useMemo(() => {
        const out: FlatExtItem[] = [];
        for (const g of grouped) {
            if (!expanded.has(g.key)) continue;
            for (const it of g.items) out.push(it);
        }
        return out;
    }, [grouped, expanded]);

    const activeIdx = useMemo(
        () => navList.findIndex((x) => x.key === activeKey),
        [navList, activeKey],
    );

    // ── Авто-раскрытие групп при первом показе ──
    useEffect(() => {
        if (grouped.length === 0) {
            setExpanded(new Set());
            return;
        }
        if (grouped.length <= 12) {
            setExpanded(new Set(grouped.map((g) => g.key)));
        } else {
            setExpanded(new Set(grouped.slice(0, 3).map((g) => g.key)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupMode, allItems.length]);

    // ── Автоскролл активного ──
    useEffect(() => {
        if (!activeKey || !listRef.current) return;
        const el = listRef.current.querySelector(
            `[data-ext-key="${CSS.escape(activeKey)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeKey]);

    // ── Handlers ──
    const selectItem = useCallback(
        (item: FlatExtItem) => {
            setActiveKey(item.key);
            onJump(item.line);
        },
        [onJump],
    );

    const stepItem = useCallback(
        (delta: 1 | -1) => {
            if (navList.length === 0) return;
            let idx = activeIdx;
            if (idx < 0) idx = delta > 0 ? -1 : 0;
            const next = (idx + delta + navList.length) % navList.length;
            selectItem(navList[next]);
        },
        [navList, activeIdx, selectItem],
    );

    const toggleKind = (k: ExtKind) => {
        setKindFilter((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    };

    const toggleGroup = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const expandAll = () =>
        setExpanded(new Set(grouped.map((g) => g.key)));
    const collapseAll = () => setExpanded(new Set());

    const copyAll = async () => {
        if (filtered.length === 0) return;
        const lines = filtered.map((it) => formatExtItem(it));
        try {
            await navigator.clipboard.writeText(lines.join("\n\n"));
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${filtered.length}`);
        } catch {
            /* ignore */
        }
    };

    const copyOne = async (item: FlatExtItem) => {
        try {
            await navigator.clipboard.writeText(formatExtItem(item));
            useGraphStore.getState().showSnackbar("Ссылка скопирована");
        } catch {
            /* ignore */
        }
    };

    const copyGroup = async (g: ExtGroup) => {
        const text = g.items.map((it) => formatExtItem(it)).join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${g.items.length}`);
        } catch {
            /* ignore */
        }
    };

    const exportMd = () => {
        if (filtered.length === 0) return;
        const lines: string[] = [];
        lines.push("# Внешние ссылки");
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        if (currentDomain) lines.push(`**Из домена:** \`${currentDomain}\``);
        lines.push("");
        lines.push(
            `**Всего:** ${filtered.length} · **Доменов:** ${new Set(filtered.filter((i) => i.type === "ref").map((i) => i.domain)).size}`,
        );
        if (query) lines.push(`**Поиск:** «${query}»`);
        lines.push("");

        for (const g of grouped) {
            lines.push(`## ${g.label}${g.sublabel ? ` (${g.sublabel})` : ""}`);
            lines.push("");
            for (const it of g.items) {
                if (it.type === "ref") {
                    lines.push(
                        `- \`:${it.line}\` **[${it.field}]** → \`${it.domain}/${it.target}\`${it.targetCount! > 1 ? ` ×${it.targetCount}` : ""}`,
                    );
                } else {
                    lines.push(
                        `- \`:${it.line}\` **[scenario]** \`${it.actionId}\` → \`${it.scenarioId}\`${it.workerTag ? ` · worker: ${it.workerTag}` : ""}`,
                    );
                }
            }
            lines.push("");
        }

        const blob = new Blob([lines.join("\n")], {
            type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `external-refs-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        useGraphStore.getState().showSnackbar("Отчёт сохранён");
    };

    const openInGraph = (domain: string) => {
        const node = nodes.find(
            (n) =>
                (n.data.domainId || "").toLowerCase() === domain.toLowerCase(),
        );
        if (node) {
            goto(domain);
        } else {
            useGraphStore.getState().showSnackbar(
                `Домен ${domain} не найден в графе`,
            );
        }
    };

    const openInCatalog = (domain: string, target: string) => {
        const entityId = target.split(".")[0];
        const fqid = `${domain}/${entityId}`.toLowerCase();
        const st = useGraphStore.getState();
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    const openScenario = (scenarioId: string) => {
        // Сценарий — глобальная сущность; откроем в отдельной модалке (Cheatsheet)
        // или просто покажем snackbar с id для копирования.
        // TODO: открыть каталог сценариев (сейчас такой нет)
        useGraphStore
            .getState()
            .showSnackbar(`Сценарий: ${scenarioId}`);
    };

    // ── Keyboard ──
    const onKeyDown = (e: React.KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            stepItem(1);
        } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            stepItem(-1);
        } else if (e.key === "Home") {
            e.preventDefault();
            if (navList.length > 0) selectItem(navList[0]);
        } else if (e.key === "End") {
            e.preventDefault();
            if (navList.length > 0) selectItem(navList[navList.length - 1]);
        } else if (e.key === "Escape") {
            setActiveKey(null);
        }
    };

    // ── Empty state ──
    if (allItems.length === 0) {
        return (
            <div className="yaml-issues-empty">
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔗</div>
                <div style={{ color: "var(--text-400)", fontSize: 12 }}>
                    Нет ссылок на другие домены
                </div>
                <div
                    style={{
                        marginTop: 4,
                        fontSize: 11,
                        color: "var(--text-500)",
                    }}
                >
                    Домен изолирован в графе зависимостей
                </div>
            </div>
        );
    }

    // ── Сводка ──
    const totalDomains = new Set(
        allRefs.map((r) => r.domain).filter(Boolean),
    ).size;
    const totalUnique = new Set(
        allRefs.map((r) => `${r.domain}|${r.target}`),
    ).size;

    let itemOffset = 0;

    return (
        <div
            className="yaml-issues yaml-ext-refs"
            onKeyDown={onKeyDown}
            tabIndex={-1}
        >
            {/* ── Поиск + группировка ── */}
            <div className="yaml-issues__toolbar">
                <div className="yaml-issues__search">
                    <MIcon name="search" size="sm" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск: FQID, домен, target, поле…"
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            type="button"
                            className="yaml-issues__search-clear"
                            onClick={() => setQuery("")}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <select
                    className="yaml-issues__group-select"
                    value={groupMode}
                    onChange={(e) =>
                        setGroupMode(e.target.value as typeof groupMode)
                    }
                    title="Группировка"
                >
                    <option value="domain">По домену</option>
                    <option value="kind">По типу</option>
                    <option value="flat">Плоский</option>
                </select>
            </div>

            {/* ── Фильтры по типу ── */}
            {kindCounts.size > 1 && (
                <div className="yaml-ext-refs__kinds">
                    <button
                        type="button"
                        className={
                            "yaml-ext-refs__kind-chip" +
                            (kindFilter.size === 0
                                ? " yaml-ext-refs__kind-chip--active"
                                : "")
                        }
                        onClick={() => setKindFilter(new Set())}
                    >
                        Все
                        <span className="yaml-ext-refs__kind-count">
                            {allItems.length}
                        </span>
                    </button>
                    {Array.from(kindCounts.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, count]) => {
                            const meta = EXT_KIND_META[k];
                            const active = kindFilter.has(k);
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    className={
                                        "yaml-ext-refs__kind-chip" +
                                        (active
                                            ? " yaml-ext-refs__kind-chip--active"
                                            : "")
                                    }
                                    onClick={() => toggleKind(k)}
                                    style={{
                                        borderColor: active
                                            ? meta.color
                                            : undefined,
                                        color: active
                                            ? meta.color
                                            : undefined,
                                        background: active
                                            ? `${meta.color}18`
                                            : undefined,
                                    }}
                                >
                                    <span
                                        className="yaml-ext-refs__kind-dot"
                                        style={{ background: meta.color }}
                                    />
                                    {meta.label}
                                    <span className="yaml-ext-refs__kind-count">
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                </div>
            )}

            {/* ── Навигация ── */}
            <div className="yaml-issues__navbar">
                <button
                    type="button"
                    className="yaml-issues__nav-btn"
                    onClick={() => stepItem(-1)}
                    disabled={navList.length === 0}
                    title="Предыдущая (↑ / k)"
                >
                    <MIcon name="expand_less" size="sm" />
                </button>
                <button
                    type="button"
                    className="yaml-issues__nav-btn"
                    onClick={() => stepItem(1)}
                    disabled={navList.length === 0}
                    title="Следующая (↓ / j)"
                >
                    <MIcon name="expand_more" size="sm" />
                </button>
                <span className="yaml-issues__nav-counter">
                    {activeIdx >= 0
                        ? `${activeIdx + 1} / ${navList.length}`
                        : `— / ${navList.length}`}
                </span>
                <div className="yaml-issues__nav-actions">
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={expandAll}
                        title="Развернуть всё"
                        disabled={grouped.length === 0}
                    >
                        <MIcon name="unfold_more" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={collapseAll}
                        title="Свернуть всё"
                        disabled={expanded.size === 0}
                    >
                        <MIcon name="unfold_less" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={copyAll}
                        title="Копировать все ссылки"
                        disabled={filtered.length === 0}
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={exportMd}
                        title="Экспорт в Markdown"
                        disabled={filtered.length === 0}
                    >
                        <MIcon name="description" size="sm" />
                    </button>
                </div>
            </div>

            {/* ── Заголовок-сводка ── */}
            <div className="yaml-issues__header">
                Ссылки (
                {filtered.length}
                {filtered.length !== allItems.length
                    ? ` / ${allItems.length}`
                    : ""}
                ) · <strong>{totalDomains}</strong> дом.
                {" · "}
                <strong>{totalUnique}</strong> уник.
                {kindFilter.size > 0 && (
                    <>
                        {" · "}
                        <span style={{ color: "var(--accent-hover)" }}>
                            фильтр: {kindFilter.size}
                        </span>
                    </>
                )}
            </div>

            {/* ── Список ── */}
            {filtered.length === 0 ? (
                <div className="yaml-issues-empty">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <div>
                        {query
                            ? `Ничего не найдено по «${query}»`
                            : "Нет ссылок с выбранным типом"}
                    </div>
                    {(query || kindFilter.size > 0) && (
                        <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => {
                                setQuery("");
                                setKindFilter(new Set());
                            }}
                            style={{ marginTop: 8 }}
                        >
                            Сбросить фильтры
                        </button>
                    )}
                </div>
            ) : (
                <div className="yaml-issues__list" ref={listRef}>
                    {grouped.map((g) => {
                        const isExpanded = expanded.has(g.key);
                        const startOffset = itemOffset;
                        if (isExpanded) itemOffset += g.items.length;
                        const isDomain = g.domain != null;
                        const isScenario = g.key === "domain:__scenario__";
                        return (
                            <div
                                key={g.key}
                                className={
                                    "yaml-issues__group" +
                                    (isExpanded ? " open" : "")
                                }
                            >
                                <div className="yaml-issues__group-title">
                                    <button
                                        type="button"
                                        className="yaml-issues__group-toggle"
                                        onClick={() => toggleGroup(g.key)}
                                        title={
                                            isExpanded
                                                ? "Свернуть"
                                                : "Развернуть"
                                        }
                                    >
                                        <span className="yaml-issues__group-chevron">
                                            {isExpanded ? "▾" : "▸"}
                                        </span>
                                        {g.labelIcon && (
                                            <MIcon
                                                name={g.labelIcon}
                                                size="sm"
                                                style={{
                                                    color: g.labelColor,
                                                }}
                                            />
                                        )}
                                        <span
                                            className={
                                                "yaml-issues__group-label" +
                                                (isDomain
                                                    ? " yaml-ext-refs__group-domain"
                                                    : "")
                                            }
                                            onClick={(e) => {
                                                if (!isDomain) return;
                                                e.stopPropagation();
                                                openInGraph(g.domain!);
                                            }}
                                            title={
                                                isDomain
                                                    ? `Открыть ${g.domain} на графе`
                                                    : undefined
                                            }
                                        >
                                            {g.label}
                                        </span>
                                        <span className="yaml-issues__group-count">
                                            {g.sublabel || g.items.length}
                                        </span>
                                    </button>
                                    <div className="yaml-issues__group-actions">
                                        <button
                                            type="button"
                                            className="yaml-issues__group-action"
                                            onClick={() => copyGroup(g)}
                                            title="Копировать группу"
                                        >
                                            <MIcon
                                                name="content_copy"
                                                size="sm"
                                            />
                                        </button>
                                        {isDomain && (
                                            <button
                                                type="button"
                                                className="yaml-issues__group-action"
                                                onClick={() =>
                                                    openInGraph(g.domain!)
                                                }
                                                title="Открыть домен на графе"
                                            >
                                                <MIcon
                                                    name="my_location"
                                                    size="sm"
                                                />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="yaml-issues__group-body">
                                        {g.items.map((it, i) => {
                                            const idx = startOffset + i;
                                            const isActive =
                                                it.key === activeKey;
                                            return (
                                                <ExtRefItem
                                                    key={it.key}
                                                    item={it}
                                                    isActive={isActive}
                                                    onClick={() =>
                                                        selectItem(it)
                                                    }
                                                    onCopy={() => copyOne(it)}
                                                    onOpenDomain={
                                                        it.domain
                                                            ? () =>
                                                                openInGraph(
                                                                    it.domain!,
                                                                )
                                                            : undefined
                                                    }
                                                    onOpenCatalog={
                                                        it.type === "ref" &&
                                                            it.kind.id === "entity"
                                                            ? () =>
                                                                openInCatalog(
                                                                    it.domain!,
                                                                    it.target!,
                                                                )
                                                            : undefined
                                                    }
                                                    onOpenScenario={
                                                        it.type ===
                                                            "scenario"
                                                            ? () =>
                                                                openScenario(
                                                                    it.scenarioId!,
                                                                )
                                                            : undefined
                                                    }
                                                />
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
    );
}

// ── Один item ──
interface ExtRefItemProps {
    item: FlatExtItem;
    isActive: boolean;
    onClick: () => void;
    onCopy: () => void;
    onOpenDomain?: () => void;
    onOpenCatalog?: () => void;
    onOpenScenario?: () => void;
}

function ExtRefItem({
    item,
    isActive,
    onClick,
    onCopy,
    onOpenDomain,
    onOpenCatalog,
    onOpenScenario,
}: ExtRefItemProps) {
    if (item.type === "scenario") {
        return (
            <div
                data-ext-key={item.key}
                className={
                    "yaml-ext-ref yaml-ext-ref--scenario" +
                    (isActive ? " yaml-ext-ref--active" : "")
                }
                onClick={onClick}
                title={`${item.actionId}: ${item.actionName}\n${item.scenarioId}`}
            >
                <span className="yaml-ext-ref__line">:{item.line}</span>
                <span
                    className="yaml-ext-ref__kind"
                    style={{
                        color: item.kind.color,
                        background: item.kind.color + "18",
                    }}
                >
                    <MIcon name={item.kind.icon} size="sm" />
                    scenario
                </span>
                <code className="yaml-ext-ref__action">
                    {item.actionId}
                </code>
                <span className="yaml-ext-ref__arrow">→</span>
                <button
                    type="button"
                    className="yaml-ext-ref__target-link"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenScenario?.();
                    }}
                    title="Открыть сценарий"
                >
                    {item.scenarioId}
                </button>
                {item.workerTag && (
                    <span className="yaml-ext-ref__worker">
                        worker: {item.workerTag}
                    </span>
                )}
                <div className="yaml-ext-ref__actions">
                    <button
                        type="button"
                        className="yaml-ext-ref__action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopy();
                        }}
                        title="Копировать"
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            data-ext-key={item.key}
            className={
                "yaml-ext-ref" + (isActive ? " yaml-ext-ref--active" : "")
            }
            onClick={onClick}
            title={`${item.lineText?.trim()}\n\n${item.field}: ${item.raw}`}
        >
            <span className="yaml-ext-ref__line">:{item.line}</span>
            <span
                className="yaml-ext-ref__kind"
                style={{
                    color: item.kind.color,
                    background: item.kind.color + "18",
                }}
            >
                <MIcon name={item.kind.icon} size="sm" />
                {item.field}
            </span>
            <span className="yaml-ext-ref__arrow">→</span>
            <code
                className="yaml-ext-ref__target"
                title={`${item.domain}/${item.target}`}
            >
                {item.target}
            </code>
            {item.targetCount! > 1 && (
                <span
                    className="yaml-ext-ref__count"
                    title={`Встречается ${item.targetCount} раз в домене`}
                >
                    ×{item.targetCount}
                </span>
            )}
            <div className="yaml-ext-ref__actions">
                {onOpenCatalog && (
                    <button
                        type="button"
                        className="yaml-ext-ref__action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenCatalog();
                        }}
                        title="Открыть сущность в каталоге"
                    >
                        <MIcon name="data_object" size="sm" />
                    </button>
                )}
                {onOpenDomain && (
                    <button
                        type="button"
                        className="yaml-ext-ref__action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenDomain();
                        }}
                        title="Открыть домен на графе"
                    >
                        <MIcon name="my_location" size="sm" />
                    </button>
                )}
                <button
                    type="button"
                    className="yaml-ext-ref__action"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCopy();
                    }}
                    title="Копировать"
                >
                    <MIcon name="content_copy" size="sm" />
                </button>
            </div>
        </div>
    );
}

function formatExtItem(it: FlatExtItem): string {
    if (it.type === "scenario") {
        const parts: string[] = [];
        parts.push(`[scenario] строка :${it.line}`);
        parts.push(`  action: ${it.actionId} (${it.actionName})`);
        parts.push(`  scenario: ${it.scenarioId}`);
        if (it.workerTag) parts.push(`  worker: ${it.workerTag}`);
        return parts.join("\n");
    }
    return [
        `[${it.field}] строка :${it.line}`,
        `  → ${it.domain}/${it.target}`,
        `  ${it.raw}`,
    ].join("\n");
}

function isIgnored(issue: any, ignoredSet: Set<string>): boolean {
    const sig = `dg-linter|${issue.message || ''}`;
    return ignoredSet.has(sig);
}

// ============ SectionNav / NavItem / FilteredNavList / IssuesPanel ============
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

// ============ Issues ============

// ============ Issues panel helpers ============

function getIssueSource(issue: any): {
    id: "yaml" | "rql" | "lint";
    label: string;
    color: string;
} {
    const ruleId = String(issue.ruleId || "");
    if (ruleId === "yaml-syntax")
        return { id: "yaml", label: "YAML", color: "#f59e0b" };
    if (ruleId === "rql-check" || ruleId.startsWith("rql-"))
        return { id: "rql", label: "RQL", color: "#8b5cf6" };
    return { id: "lint", label: "LINT", color: "#3b82f6" };
}

function issueKey(issue: any, line: number | null): string {
    return [
        issue.ruleId || "",
        line || 0,
        issue.entityFqid || "",
        issue.attributeId || "",
        (issue.message || "").slice(0, 80),
    ].join("|");
}

function issueMatchesQuery(issue: any, q: string): boolean {
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
        (issue.ruleId || "").toLowerCase().includes(ql) ||
        (issue.rule || "").toLowerCase().includes(ql) ||
        (issue.message || "").toLowerCase().includes(ql) ||
        (issue.hint || "").toLowerCase().includes(ql) ||
        (issue.entityFqid || "").toLowerCase().includes(ql) ||
        (issue.attributeId || "").toLowerCase().includes(ql) ||
        (issue.domainId || "").toLowerCase().includes(ql) ||
        (issue.propertyPath || "").toLowerCase().includes(ql)
    );
}

function formatIssueText(issue: any, line: number | null): string {
    const sev = (issue.severity || "info").toUpperCase();
    const out: string[] = [];
    out.push(
        `[${sev}] ${issue.ruleId || issue.rule || "?"}: ${issue.message || ""}`,
    );
    if (line) out.push(`  Строка: ${line}`);
    if (issue.entityFqid) out.push(`  Сущность: ${issue.entityFqid}`);
    if (issue.attributeId) out.push(`  Атрибут: ${issue.attributeId}`);
    if (issue.propertyPath) out.push(`  Путь: ${issue.propertyPath}`);
    if (issue.hint) out.push(`  Подсказка: ${issue.hint}`);
    return out.join("\n");
}

interface IssuesPanelProps {
    issues: any[];
    allIssues: any[];
    onJump: (line: number, opts?: { focus?: boolean; column?: number }) => void;
    lineMap: LineMap | null;
    severityFilter: Set<"error" | "warning" | "info">;
    setSeverityFilter: (s: Set<"error" | "warning" | "info">) => void;
    domainId: string | null;
}

// ============ Issues panel ============

const IssuesPanel = React.memo(
    function IssuesPanel(props: IssuesPanelProps) {
        const {
            issues,
            allIssues,
            onJump,
            lineMap,
            severityFilter,
            setSeverityFilter,
            domainId,
        } = props;

        const [query, setQuery] = useState("");
        const [issueGroupMode, setIssueGroupMode] = useState<
            "rule" | "entity" | "source"
        >("rule");
        const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
            new Set(),
        );
        const [activeKey, setActiveKey] = useState<string | null>(null);
        const listRef = useRef<HTMLDivElement>(null);

        // ── Поиск ──
        const filtered = useMemo(
            () => issues.filter((i) => issueMatchesQuery(i, query)),
            [issues, query],
        );

        const autoFixableCount = useMemo(
            () =>
                filtered.filter((i) => isAutoFixable(i.ruleId, i.message)).length,
            [filtered],
        );

        const handleFixAll = useCallback(() => {
            if (autoFixableCount === 0) return;
            document.dispatchEvent(
                new CustomEvent("dg:lint-fix-all", { detail: { domainId } }),
            );
        }, [autoFixableCount, domainId]);

        const handleFixGroup = useCallback(
            (items: any[]) => {
                if (!domainId || !lineMap) return;

                const keys: Array<{ ruleId: string; line: number }> = [];
                for (const issue of items) {
                    if (!isAutoFixable(issue.ruleId, issue.message)) continue;
                    const line = findIssueLine(issue, lineMap);
                    if (line == null) continue;
                    keys.push({ ruleId: issue.ruleId, line });
                }
                if (keys.length === 0) return;

                document.dispatchEvent(
                    new CustomEvent("dg:lint-fix-all", {
                        detail: { domainId, filter: { keys } },
                    }),
                );
            },
            [domainId, lineMap],
        );

        // ── Счётчики по severity (по всем) ──
        const sevCounts = useMemo(() => {
            const c = { error: 0, warning: 0, info: 0 };
            for (const i of allIssues) {
                if (i.severity in c) c[i.severity as keyof typeof c]++;
            }
            return c;
        }, [allIssues]);

        // ── Счётчики по источнику (по отфильтрованным) ──
        const srcCounts = useMemo(() => {
            const c = { yaml: 0, rql: 0, lint: 0 };
            for (const i of filtered) {
                const src = getIssueSource(i);
                c[src.id]++;
            }
            return c;
        }, [filtered]);

        // ── Группировка ──
        const grouped = useMemo(() => {
            const map = new Map<string, any[]>();
            const getKey = (i: any) => {
                if (issueGroupMode === "rule") return i.ruleId || "(без правила)";
                if (issueGroupMode === "entity")
                    return i.entityFqid
                        ? i.entityFqid.split("/")[1] +
                        (i.attributeId ? "." + i.attributeId : "")
                        : "(без сущности)";
                return getIssueSource(i).label;
            };
            for (const i of filtered) {
                const k = getKey(i);
                if (!map.has(k)) map.set(k, []);
                map.get(k)!.push(i);
            }
            return Array.from(map.entries()).sort(
                (a, b) => b[1].length - a[1].length,
            );
        }, [filtered, issueGroupMode]);

        // ── Плоский список ──
        const flatIssues = useMemo(() => {
            const out: Array<{
                issue: any;
                line: number | null;
                key: string;
            }> = [];
            for (const [, items] of grouped) {
                for (const i of items) {
                    const line = findIssueLine(i, lineMap);
                    out.push({ issue: i, line, key: issueKey(i, line) });
                }
            }
            return out;
        }, [grouped, lineMap]);

        const activeIdx = useMemo(
            () => flatIssues.findIndex((x) => x.key === activeKey),
            [flatIssues, activeKey],
        );

        // ── Автораскрытие групп ──
        useEffect(() => {
            if (filtered.length <= 200 && grouped.length <= 20) {
                setExpandedGroups(new Set(grouped.map(([k]) => k)));
            } else {
                setExpandedGroups(
                    new Set(grouped.slice(0, 3).map(([k]) => k)),
                );
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [issueGroupMode, allIssues.length]);

        const toggleSeverity = (sev: "error" | "warning" | "info") => {
            const next = new Set(severityFilter);
            if (next.has(sev)) next.delete(sev);
            else next.add(sev);
            setSeverityFilter(next);
        };

        const toggleGroup = (k: string) => {
            setExpandedGroups((prev) => {
                const next = new Set(prev);
                if (next.has(k)) next.delete(k);
                else next.add(k);
                return next;
            });
        };

        const expandAll = () =>
            setExpandedGroups(new Set(grouped.map(([k]) => k)));
        const collapseAll = () => setExpandedGroups(new Set());

        const jumpToIssue = useCallback(
            (idx: number) => {
                const item = flatIssues[idx];
                if (!item || item.line == null) return;
                setActiveKey(item.key);
                onJump(item.line, { focus: true });
            },
            [flatIssues, onJump],
        );

        const stepIssue = useCallback(
            (delta: 1 | -1) => {
                if (flatIssues.length === 0) return;
                let idx = activeIdx;
                if (idx < 0) idx = delta > 0 ? -1 : 0;
                const next =
                    (idx + delta + flatIssues.length) % flatIssues.length;
                jumpToIssue(next);
            },
            [flatIssues.length, activeIdx, jumpToIssue],
        );

        const copyIssue = useCallback(
            async (item: { issue: any; line: number | null }) => {
                try {
                    await navigator.clipboard.writeText(
                        formatIssueText(item.issue, item.line),
                    );
                    useGraphStore
                        .getState()
                        .showSnackbar("Проблема скопирована");
                } catch {
                    /* ignore */
                }
            },
            [],
        );

        const copyAll = useCallback(async () => {
            if (flatIssues.length === 0) return;
            const text = flatIssues
                .map((x) => formatIssueText(x.issue, x.line))
                .join("\n\n");
            try {
                await navigator.clipboard.writeText(text);
                useGraphStore
                    .getState()
                    .showSnackbar(
                        `Скопировано: ${flatIssues.length} ${pluralFew(flatIssues.length, "проблема", "проблемы", "проблем")}`,
                    );
            } catch {
                /* ignore */
            }
        }, [flatIssues]);

        const copyGroup = useCallback(
            async (items: any[]) => {
                const text = items
                    .map((i) => {
                        const line = findIssueLine(i, lineMap);
                        return formatIssueText(i, line);
                    })
                    .join("\n\n");
                try {
                    await navigator.clipboard.writeText(text);
                    useGraphStore
                        .getState()
                        .showSnackbar(`Скопировано: ${items.length}`);
                } catch {
                    /* ignore */
                }
            },
            [lineMap],
        );

        const exportMd = useCallback(() => {
            if (flatIssues.length === 0) return;
            const lines: string[] = [];
            lines.push("# Проблемы в файле");
            lines.push("");
            lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
            if (domainId) lines.push(`**Домен:** \`${domainId}\``);
            lines.push("");
            lines.push(
                `**Всего:** ${flatIssues.length} (${sevCounts.error} error · ${sevCounts.warning} warning · ${sevCounts.info} info)`,
            );
            if (query) lines.push(`**Поиск:** «${query}»`);
            lines.push("");
            for (const [groupKey, items] of grouped) {
                lines.push(`## ${groupKey} (${items.length})`);
                lines.push("");
                for (const i of items) {
                    const line = findIssueLine(i, lineMap);
                    const sev = (i.severity || "info").toUpperCase();
                    const src = getIssueSource(i);
                    let row = `- **[${sev}]** ${i.message || ""}`;
                    if (line) row += ` — строка \`:${line}\``;
                    row += ` _(${src.label})_`;
                    lines.push(row);
                    if (i.entityFqid)
                        lines.push(`  - Сущность: \`${i.entityFqid}\``);
                    if (i.attributeId)
                        lines.push(`  - Атрибут: \`${i.attributeId}\``);
                    if (i.hint) lines.push(`  - 💡 ${i.hint}`);
                }
                lines.push("");
            }
            const md = lines.join("\n");
            const blob = new Blob([md], {
                type: "text/markdown;charset=utf-8",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `file-issues-${Date.now()}.md`;
            a.click();
            URL.revokeObjectURL(url);
            useGraphStore.getState().showSnackbar("Отчёт сохранён");
        }, [flatIssues, grouped, lineMap, sevCounts, query, domainId]);

        const openInCatalog = useCallback((fqid: string) => {
            const st = useGraphStore.getState();
            st.setEntityCatalogInitialFqid(fqid);
            st.setEntityCatalogOpen(true);
        }, []);

        const openInLinter = useCallback(() => {
            useGraphStore.getState().setLintOpen(true);
        }, []);

        const onKeyDown = (e: React.KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))
                return;
            if (e.key === "ArrowDown" || e.key === "j") {
                e.preventDefault();
                stepIssue(1);
            } else if (e.key === "ArrowUp" || e.key === "k") {
                e.preventDefault();
                stepIssue(-1);
            } else if (e.key === "Home") {
                e.preventDefault();
                jumpToIssue(0);
            } else if (e.key === "End") {
                e.preventDefault();
                jumpToIssue(flatIssues.length - 1);
            } else if (e.key === "Escape") {
                setActiveKey(null);
            }
        };

        useEffect(() => {
            if (!activeKey || !listRef.current) return;
            const el = listRef.current.querySelector(
                `[data-issue-key="${CSS.escape(activeKey)}"]`,
            ) as HTMLElement | null;
            el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, [activeKey]);

        return (
            <div
                className="yaml-issues"
                onKeyDown={onKeyDown}
                tabIndex={-1}
            >
                {/* ── Severity-чипы ── */}
                <div className="yaml-issues__severity">
                    {(["error", "warning", "info"] as const).map((sev) => {
                        const count = sevCounts[sev];
                        const active = severityFilter.has(sev);
                        return (
                            <button
                                key={sev}
                                className={
                                    "yaml-issues__severity-btn yaml-issues__severity-btn--" +
                                    sev +
                                    (active ? " active" : "")
                                }
                                onClick={() => toggleSeverity(sev)}
                                title={
                                    active
                                        ? `Скрыть ${sev}`
                                        : `Показать ${sev}`
                                }
                                disabled={count === 0 && !active}
                            >
                                <span className="yaml-issues__severity-dot" />
                                <span>
                                    {sev === "error"
                                        ? "Ошибки"
                                        : sev === "warning"
                                            ? "Предупр."
                                            : "Инфо"}
                                </span>
                                <span className="yaml-issues__severity-count">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Поиск + группировка ── */}
                <div className="yaml-issues__toolbar">
                    <div className="yaml-issues__search">
                        <MIcon name="search" size="sm" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Поиск: правило, сообщение, сущность, атрибут…"
                            spellCheck={false}
                        />
                        {query && (
                            <button
                                type="button"
                                className="yaml-issues__search-clear"
                                onClick={() => setQuery("")}
                                title="Очистить"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <select
                        className="yaml-issues__group-select"
                        value={issueGroupMode}
                        onChange={(e) =>
                            setIssueGroupMode(e.target.value as any)
                        }
                        title="Группировка"
                    >
                        <option value="rule">По правилу</option>
                        <option value="entity">По сущности</option>
                        <option value="source">По источнику</option>
                    </select>
                </div>

                {/* ── Навигация и действия ── */}
                <div className="yaml-issues__navbar">
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={() => stepIssue(-1)}
                        disabled={flatIssues.length === 0}
                        title="Предыдущая (↑ / k)"
                    >
                        <MIcon name="expand_less" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={() => stepIssue(1)}
                        disabled={flatIssues.length === 0}
                        title="Следующая (↓ / j)"
                    >
                        <MIcon name="expand_more" size="sm" />
                    </button>
                    <span className="yaml-issues__nav-counter">
                        {activeIdx >= 0
                            ? `${activeIdx + 1} / ${flatIssues.length}`
                            : `— / ${flatIssues.length}`}
                    </span>
                    <div className="yaml-issues__nav-actions">
                        <button
                            type="button"
                            className="yaml-issues__nav-btn yaml-issues__nav-btn--primary"
                            style={{ width: "auto", padding: "0 4px" }}
                            onClick={handleFixAll}
                            disabled={autoFixableCount === 0}
                            title={
                                autoFixableCount === 0
                                    ? "Для текущих проблем автофиксов нет"
                                    : `Применить ${autoFixableCount} ${autoFixableCount === 1 ? "автофикс" : "автофикса"}`
                            }
                        >
                            <MIcon name="auto_fix_high" size="sm" />
                            {autoFixableCount > 0 && (
                                <span className="yaml-issues__nav-count">{autoFixableCount}</span>
                            )}
                        </button>
                        <button
                            type="button"
                            className="yaml-issues__nav-btn"
                            onClick={expandAll}
                            title="Развернуть всё"
                            disabled={grouped.length === 0}
                        >
                            <MIcon name="unfold_more" size="sm" />
                        </button>
                        <button
                            type="button"
                            className="yaml-issues__nav-btn"
                            onClick={collapseAll}
                            title="Свернуть всё"
                            disabled={expandedGroups.size === 0}
                        >
                            <MIcon name="unfold_less" size="sm" />
                        </button>
                        <button
                            type="button"
                            className="yaml-issues__nav-btn"
                            onClick={copyAll}
                            title="Копировать все проблемы"
                            disabled={flatIssues.length === 0}
                        >
                            <MIcon name="content_copy" size="sm" />
                        </button>
                        <button
                            type="button"
                            className="yaml-issues__nav-btn"
                            onClick={exportMd}
                            title="Экспорт в Markdown"
                            disabled={flatIssues.length === 0}
                        >
                            <MIcon name="description" size="sm" />
                        </button>
                    </div>
                </div>

                {/* ── Header ── */}
                <div className="yaml-issues__header">
                    Проблемы ({filtered.length}
                    {filtered.length !== allIssues.length
                        ? ` / ${allIssues.length}`
                        : ""}
                    )
                    {srcCounts.lint > 0 && (
                        <span className="yaml-issues__src-stat">
                            <span
                                className="yaml-issues__src-dot"
                                style={{ background: "#3b82f6" }}
                            />
                            LINT {srcCounts.lint}
                        </span>
                    )}
                    {srcCounts.rql > 0 && (
                        <span className="yaml-issues__src-stat">
                            <span
                                className="yaml-issues__src-dot"
                                style={{ background: "#8b5cf6" }}
                            />
                            RQL {srcCounts.rql}
                        </span>
                    )}
                    {srcCounts.yaml > 0 && (
                        <span className="yaml-issues__src-stat">
                            <span
                                className="yaml-issues__src-dot"
                                style={{ background: "#f59e0b" }}
                            />
                            YAML {srcCounts.yaml}
                        </span>
                    )}
                </div>

                {/* ── Список ── */}
                {filtered.length === 0 ? (
                    <div className="yaml-issues-empty">
                        <div style={{ fontSize: 32, marginBottom: 8 }}>
                            {allIssues.length > 0 ? "🔍" : "✅"}
                        </div>
                        {allIssues.length === 0
                            ? "Проблем не найдено"
                            : query
                                ? `Ничего не найдено по «${query}»`
                                : "Нет проблем с выбранной severity"}
                        {query && (
                            <button
                                type="button"
                                className="btn btn--small"
                                onClick={() => setQuery("")}
                                style={{ marginTop: 8 }}
                            >
                                Сбросить поиск
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="yaml-issues__list" ref={listRef}>
                        {grouped.map(([groupKey, items]) => (
                            <IssuesGroup
                                key={groupKey}
                                title={
                                    issueGroupMode === "rule"
                                        ? items[0].rule || groupKey
                                        : groupKey
                                }
                                ruleId={
                                    issueGroupMode === "rule"
                                        ? groupKey
                                        : undefined
                                }
                                items={items}
                                lineMap={lineMap}
                                onJump={onJump}
                                expanded={expandedGroups.has(groupKey)}
                                onToggle={() => toggleGroup(groupKey)}
                                activeKey={activeKey}
                                onActivate={setActiveKey}
                                onCopyGroup={() => copyGroup(items)}
                                onCopyIssue={copyIssue}
                                onOpenCatalog={openInCatalog}
                                onOpenLinter={openInLinter}
                                onFixGroup={() => handleFixGroup(items)}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    },
    (prev, next) => {
        return (
            prev.issues === next.issues &&
            prev.allIssues === next.allIssues &&
            prev.lineMap === next.lineMap &&
            prev.severityFilter === next.severityFilter &&
            prev.onJump === next.onJump &&
            prev.setSeverityFilter === next.setSeverityFilter &&
            prev.domainId === next.domainId
        );
    },
);

interface IssuesGroupProps {
    title: string;
    ruleId?: string;
    items: any[];
    lineMap: LineMap | null;
    onJump: (line: number, opts?: { focus?: boolean; column?: number }) => void;
    expanded: boolean;
    onToggle: () => void;
    activeKey: string | null;
    onActivate: (k: string) => void;
    onCopyGroup: () => void;
    onCopyIssue: (item: { issue: any; line: number | null }) => void;
    onOpenCatalog: (fqid: string) => void;
    onOpenLinter: () => void;
    onFixGroup?: () => void;
}

function IssuesGroup({
    title,
    ruleId,
    items,
    lineMap,
    onJump,
    expanded,
    onToggle,
    activeKey,
    onActivate,
    onCopyGroup,
    onCopyIssue,
    onOpenCatalog,
    onOpenLinter,
    onFixGroup,
}: IssuesGroupProps) {
    const fixableCount = items.filter((i) =>
        isAutoFixable(i.ruleId, i.message),
    ).length;
    const totalCount = items.length;
    const fixTitle =
        fixableCount === totalCount
            ? `Применить ${fixableCount} автофикс${fixableCount === 1 ? "" : "ов"} в этой группе`
            : `Применить ${fixableCount} из ${totalCount} — остальные правятся вручную`;

    return (
        <div className={"yaml-issues__group" + (expanded ? " open" : "")}>
            <div className="yaml-issues__group-title">
                <button
                    type="button"
                    className="yaml-issues__group-toggle"
                    onClick={onToggle}
                    title={expanded ? "Свернуть" : "Развернуть"}
                >
                    <span className="yaml-issues__group-chevron">
                        {expanded ? "▾" : "▸"}
                    </span>
                    <span className="yaml-issues__group-label">{title}</span>
                    <span className="yaml-issues__group-count">
                        {items.length}
                    </span>
                </button>
                <div className="yaml-issues__group-actions">
                    {onFixGroup && fixableCount > 0 && (
                        <button
                            type="button"
                            className="yaml-issues__group-action yaml-issues__group-action--fix"
                            onClick={(e) => {
                                e.stopPropagation();
                                onFixGroup();
                            }}
                            title={fixTitle}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                color: "var(--accent-hover)",
                                fontWeight: 600,
                                width: "auto",
                                padding: "0 4px",
                                margin: "0 4px",
                            }}
                        >
                            <MIcon name="auto_fix_high" size="sm" />
                            <span>{fixableCount}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        className="yaml-issues__group-action"
                        onClick={onCopyGroup}
                        title="Копировать группу"
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                    {ruleId && (
                        <button
                            type="button"
                            className="yaml-issues__group-action"
                            onClick={onOpenLinter}
                            title="Открыть в линтере"
                        >
                            <MIcon name="open_in_new" size="sm" />
                        </button>
                    )}
                </div>
            </div>
            {expanded &&
                items.map((issue, i) => {
                    const line = findIssueLine(issue, lineMap);
                    const src = getIssueSource(issue);
                    const key = issueKey(issue, line);
                    const isActive = key === activeKey;
                    const disabled = line == null;
                    const fixable = isAutoFixable(issue.ruleId, issue.message);

                    return (
                        <div
                            key={i}
                            data-issue-key={key}
                            className={
                                "yaml-issue yaml-issue--" +
                                issue.severity +
                                (disabled ? " yaml-issue--disabled" : "") +
                                (isActive ? " yaml-issue--active" : "")
                            }
                            onClick={() => {
                                if (line == null) return;
                                onActivate(key);
                                onJump(line, { focus: true });
                            }}
                        >
                            <span
                                className={
                                    "yaml-issue__dot yaml-issue__dot--" +
                                    issue.severity
                                }
                            />
                            <div className="yaml-issue__body">
                                <div className="yaml-issue__text-row">
                                    <span
                                        className={
                                            "yaml-issue__source yaml-issue__source--" +
                                            src.id
                                        }
                                        title={`Источник: ${src.label}`}
                                    >
                                        {src.label}
                                    </span>
                                    <span
                                        className={
                                            "yaml-issue__text" +
                                            (issue.__isUnknown
                                                ? " yaml-issue__text--stale"
                                                : "")
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
                                    {line != null && (
                                        <span className="yaml-issue__line">
                                            :{line}
                                        </span>
                                    )}
                                </div>
                                {issue.entityFqid && (
                                    <div className="yaml-issue__meta">
                                        <button
                                            type="button"
                                            className="yaml-issue__meta-link"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpenCatalog(
                                                    issue.entityFqid!,
                                                );
                                            }}
                                            title="Открыть сущность в каталоге"
                                        >
                                            <MIcon
                                                name="data_object"
                                                size="sm"
                                            />
                                            {issue.entityFqid.split("/")[1]}
                                            {issue.attributeId &&
                                                `.${issue.attributeId}`}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="yaml-issue__actions">
                                <span
                                    className={
                                        "yaml-issue__fix-badge" +
                                        (fixable ? " yaml-issue__fix-badge--yes" : " yaml-issue__fix-badge--no")
                                    }
                                    title={fixable ? "Есть автофикс (Alt+Enter в редакторе)" : "Требует ручного исправления"}
                                >
                                    {fixable ? "🔧" : "✋"}
                                </span>

                                <button
                                    type="button"
                                    className="yaml-issue__action"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onCopyIssue({ issue, line });
                                    }}
                                    title="Копировать проблему"
                                >
                                    <MIcon
                                        name="content_copy"
                                        size="sm"
                                    />
                                </button>
                            </div>
                        </div>
                    );
                })}
        </div>
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
    type:
    | 'entity' | 'attribute'
    | 'linkage' | 'action' | 'view'
    | 'dataRule' | 'mixin'
    | 'dataType' | 'sequence' | 'media' | 'tree'
    | 'counterColorPattern' | 'uiPreset' | 'permission' | 'menuItem'
    | null;
    id: string | null;
    parentId?: string;
    section?: string;
    line: number;
}

interface Backlink {
    kind:
    | 'inheritance' | 'reference' | 'linkage' | 'view'
    | 'dataRule' | 'mixin' | 'action' | 'widget'
    | 'dataType' | 'sequence' | 'media' | 'tree'
    | 'counterColorPattern' | 'uiPreset' | 'permission' | 'menuItem'
    | 'filter' | 'join';
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
    dataType: 'тип данных',
    sequence: 'последовательность',
    media: 'иконка',
    tree: 'дерево',
    counterColorPattern: 'цветовая схема',
    uiPreset: 'пресет',
    permission: 'разрешение',
    menuItem: 'пункт меню',
    filter: 'фильтр',
    join: 'транзитивная связь',
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
                    line: i,
                };
            }
        }
    }

    if (section === "entities") return { type: "entity", id: root.id, section, line: root.line + 1 };
    if (section === "linkages") return { type: "linkage", id: root.id, section, line: root.line + 1 };
    if (section === "actions") return { type: "action", id: root.id, section, line: root.line + 1 };
    if (section === "views") return { type: "view", id: root.id, section, line: root.line + 1 };
    if (section === "dataRules") return { type: "dataRule", id: root.id, section, line: root.line + 1 };
    if (section === "mixins") return { type: "mixin", id: root.id, section, line: root.line + 1 };
    if (section === "dataTypes") return { type: "dataType", id: root.id, section, line: root.line + 1 };
    if (section === "sequences") return { type: "sequence", id: root.id, section, line: root.line + 1 };
    if (section === "medias") return { type: "media", id: root.id, section, line: root.line + 1 };
    if (section === "trees") return { type: "tree", id: root.id, section, line: root.line + 1 };
    if (section === "counterColorPattern" || section === "counterColorPatterns") {
        return { type: "counterColorPattern", id: root.id, section, line: root.line + 1 };
    }
    if (section === "uiPresets") return { type: "uiPreset", id: root.id, section, line: root.line + 1 };
    if (section === "permissions") return { type: "permission", id: root.id, section, line: root.line + 1 };
    if (section === "menus") {
        // menuItem — если между root_group и текущим - id: встретили items:
        if (chain.length >= 2 && inner.line > root.line) {
            const itemsRegex = /^\s*items\s*:\s*$/;
            for (let i = root.line + 1; i < inner.line; i++) {
                if (itemsRegex.test(lines[i])) {
                    return { type: "menuItem", id: inner.id, section, line: i };
                }
            }
        }
        return null; // корневой пункт меню — не цель
    }
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

// ============ Extended backlink resolvers ============

interface FieldOccurrence {
    line: number;
    fieldName: string;
    value: string;
    isItemStart: boolean;
    section: string;
    parentChain: Array<{ kind: string; id: string; depth: number }>;
}

/** Один линейный проход по YAML. Возвращает только совпадения по value. */
function walkFields(
    lines: string[],
    fieldNames: string[],
    valueLower: string,
): FieldOccurrence[] {
    const out: FieldOccurrence[] = [];
    const wanted = new Set(fieldNames);
    let section = '';
    const stack: Array<{ indent: number; kind: string; id: string }> = [];

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

        while (stack.length && stack[stack.length - 1].indent >= indent) {
            stack.pop();
        }

        const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idm) {
            stack.push({ indent, kind: 'item', id: idm[2].replace(/["']/g, '') });
            continue;
        }

        const cm = line.match(/^(\s*)([a-zA-Z_][\w]*)\s*:\s*$/);
        if (cm) {
            stack.push({ indent, kind: cm[2], id: cm[2] });
            continue;
        }

        const fm = line.match(/^(\s*)(?:-\s+)?([a-zA-Z_][\w]*)\s*:\s*(.+)$/);
        if (!fm || !wanted.has(fm[2])) continue;

        let v = fm[3].split(' #')[0].trim();
        if ((v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        if (v.toLowerCase() !== valueLower) continue;

        out.push({
            line: i + 1,
            fieldName: fm[2],
            value: v,
            isItemStart: /^\s*-\s+\S/.test(line),
            section,
            parentChain: stack.map((s, idx) => ({
                kind: s.kind,
                id: s.id,
                depth: idx,
            })),
        });
    }

    return out;
}

// ---- linkage ----
function resolveLinkageBacklinks(lines: string[], linkageId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['linkage'], linkageId.toLowerCase());

    for (const h of hits) {
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);
        const rootId = items[0]?.id || '';

        if (h.section === 'views') {
            if (!h.isItemStart) {
                // widget.linkage (singular) — type: linkage
                out.push({
                    kind: 'widget',
                    line: h.line,
                    label: rootId,
                    detail: `widget ${items[1]?.id || ''}.linkage`,
                    icon: 'view_quilt',
                });
            } else if (containers.includes('filter')) {
                out.push({ kind: 'filter', line: h.line, label: rootId, detail: 'filter.linkages.use', icon: 'filter_alt' });
            } else if (containers.includes('source')) {
                out.push({ kind: 'join', line: h.line, label: rootId, detail: 'source.joins', icon: 'alt_route' });
            } else if (containers.includes('widgets') && containers.includes('linkages')) {
                out.push({
                    kind: 'widget',
                    line: h.line,
                    label: rootId,
                    detail: `widget ${items[1]?.id || ''}.linkages`,
                    icon: 'view_quilt',
                });
            }
        } else if (h.section === 'dataRules') {
            const inRule = h.parentChain.some(c => c.kind === 'rule');
            out.push({
                kind: 'dataRule',
                line: h.line,
                label: rootId,
                detail: inRule ? 'rule.linkages' : 'dataRule.linkage',
                icon: 'rule',
            });
        } else if (h.section === 'mixins') {
            out.push({ kind: 'mixin', line: h.line, label: rootId, detail: 'mixin.linkage', icon: 'merge' });
        } else if (h.section === 'actions') {
            out.push({ kind: 'action', line: h.line, label: rootId, detail: 'action.linkage (open_list)', icon: 'bolt' });
        } else if (h.section === 'trees') {
            out.push({ kind: 'tree', line: h.line, label: rootId, detail: 'hierarchy.children', icon: 'account_tree' });
        } else if (h.section === 'transitiveLinkages') {
            out.push({ kind: 'join', line: h.line, label: rootId, detail: 'joins', icon: 'conversion_path' });
        }
    }

    return out;
}

// ---- action ----
function resolveActionBacklinks(lines: string[], actionId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['action'], actionId.toLowerCase());

    for (const h of hits) {
        if (h.section !== 'views') continue;
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);
        const viewId = items[0]?.id || '';

        if (!h.isItemStart) {
            out.push({
                kind: 'widget',
                line: h.line,
                label: viewId,
                detail: `widget ${items[1]?.id || ''}.action`,
                icon: 'view_quilt',
            });
            continue;
        }

        if (containers.includes('widgets')) {
            out.push({ kind: 'widget', line: h.line, label: viewId, detail: `widget ${items[1]?.id || ''}.actions`, icon: 'view_quilt' });
        } else if (containers.includes('columns')) {
            out.push({ kind: 'action', line: h.line, label: items[1]?.id || '', detail: 'column.actions', icon: 'view_column' });
        } else if (containers.includes('footer')) {
            out.push({ kind: 'action', line: h.line, label: items[1]?.id || '', detail: 'modal.footer', icon: 'open_in_new' });
        } else if (containers.includes('buttons')) {
            out.push({ kind: 'action', line: h.line, label: items[1]?.id || '', detail: 'modal.buttons.actions', icon: 'open_in_new' });
        } else if (containers.includes('views') && containers.includes('menu')) {
            out.push({ kind: 'action', line: h.line, label: items[1]?.id || '', detail: 'panel.menu', icon: 'view_sidebar' });
        } else if (containers.includes('table') && containers.includes('menu')) {
            out.push({ kind: 'action', line: h.line, label: viewId, detail: 'table.actions.menu', icon: 'table_rows' });
        } else if (containers.includes('table') && containers.includes('actions')) {
            out.push({ kind: 'action', line: h.line, label: viewId, detail: 'table.actions', icon: 'table_rows' });
        }
    }

    // accessRules с target: action
    let section = '';
    const stack: Array<{ indent: number; kind: string }> = [];
    let pendingAccessRule = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;

        if (indent === 0) {
            const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            section = sm ? sm[1] : '';
            stack.length = 0;
            pendingAccessRule = false;
            continue;
        }
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

        const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idm && section === 'accessRules') {
            pendingAccessRule = true;
            stack.push({ indent, kind: 'item' });
            continue;
        }
        if (idm) {
            stack.push({ indent, kind: 'item' });
            continue;
        }
        if (!pendingAccessRule || section !== 'accessRules') continue;

        const tm = line.match(/^\s*target\s*:\s*action\b/);
        if (tm) continue; // просто отметка, что это action-rule

        const idAction = line.match(/^\s*id\s*:\s*([^\s#]+)/);
        if (idAction) {
            const actionVal = idAction[1].replace(/["']/g, '');
            if (actionVal.toLowerCase() === actionId.toLowerCase()) {
                out.push({ kind: 'action', line: i + 1, label: 'accessRule', detail: 'accessRules[target: action]', icon: 'lock' });
            }
        }
    }

    return out;
}

// ---- view ----
function resolveViewBacklinks(lines: string[], viewId: string): Backlink[] {
    const out: Backlink[] = [];
    const target = viewId.toLowerCase();
    const hits = walkFields(
        lines,
        ['modal', 'panel', 'view', 'pageView', 'addLinksView', 'fromView', 'inherits'],
        target,
    );

    for (const h of hits) {
        const rootId = h.parentChain.find(c => c.kind === 'item')?.id || '';

        if (h.section === 'actions') {
            out.push({ kind: 'action', line: h.line, label: rootId, detail: `action.${h.fieldName}`, icon: 'bolt' });
        } else if (h.section === 'menus') {
            out.push({ kind: 'menuItem', line: h.line, label: rootId, detail: 'menus[].view', icon: 'menu' });
        } else if (h.section === 'mixins') {
            out.push({ kind: 'mixin', line: h.line, label: rootId, detail: `mixin.${h.fieldName}`, icon: 'merge' });
        } else if (h.section === 'views') {
            const detail = h.fieldName === 'addLinksView'
                ? 'widget.control.addLinksView'
                : 'view.inherits';
            out.push({ kind: 'view', line: h.line, label: rootId, detail, icon: 'view_quilt' });
        }
    }

    return out;
}

// ---- dataType ----
function resolveDataTypeBacklinks(lines: string[], dataTypeId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['dataType'], dataTypeId.toLowerCase());

    for (const h of hits) {
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);

        if (h.section === 'dataTypes') {
            // skip `dataTypes[].dataType: Enum | Table | Workflow` — это kind, а не ссылка
            if (!containers.includes('attributes')) continue;
            out.push({ kind: 'dataType', line: h.line, label: items[0]?.id || '', detail: `table.${items[0]?.id || ''}.columns`, icon: 'data_object' });
        } else if (h.section === 'entities') {
            out.push({ kind: 'dataType', line: h.line, label: items[0]?.id || '', detail: `attribute ${items[1]?.id || ''}`, icon: 'category' });
        } else if (h.section === 'linkages') {
            out.push({ kind: 'dataType', line: h.line, label: items[0]?.id || '', detail: `linkage attribute`, icon: 'link' });
        }
    }

    return out;
}

// ---- sequence ----
function resolveSequenceBacklinks(lines: string[], sequenceId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['sequence'], sequenceId.toLowerCase());
    for (const h of hits) {
        const items = h.parentChain.filter(c => c.kind === 'item');
        out.push({ kind: 'sequence', line: h.line, label: items[0]?.id || '', detail: `attribute ${items[1]?.id || ''}`, icon: 'linear_scale' });
    }
    return out;
}

// ---- media / icon ----
function resolveMediaBacklinks(lines: string[], mediaId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['icon'], mediaId.toLowerCase());
    for (const h of hits) {
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);

        if (h.section === 'menus') {
            out.push({ kind: 'menuItem', line: h.line, label: items[items.length - 1]?.id || '', detail: 'menu icon', icon: 'menu' });
        } else if (h.section === 'views') {
            if (containers.includes('widgets')) {
                out.push({ kind: 'media', line: h.line, label: items[0]?.id || '', detail: `widget ${items[1]?.id || ''}.icon`, icon: 'widgets' });
            } else if (containers.includes('columns')) {
                out.push({ kind: 'media', line: h.line, label: items[1]?.id || '', detail: 'column action icon', icon: 'view_column' });
            } else if (containers.includes('footer')) {
                out.push({ kind: 'media', line: h.line, label: items[1]?.id || '', detail: 'modal.footer icon', icon: 'open_in_new' });
            } else if (containers.includes('buttons')) {
                out.push({ kind: 'media', line: h.line, label: items[1]?.id || '', detail: 'modal.button icon', icon: 'open_in_new' });
            } else if (containers.includes('menu')) {
                out.push({ kind: 'media', line: h.line, label: items[0]?.id || '', detail: 'table menu icon', icon: 'table_rows' });
            }
        }
    }
    return out;
}

// ---- tree ----
function resolveTreeBacklinks(lines: string[], treeId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['tree'], treeId.toLowerCase());
    for (const h of hits) {
        if (h.section !== 'views') continue;
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);
        if (containers.includes('control')) {
            out.push({ kind: 'tree', line: h.line, label: items[1]?.id || '', detail: 'column.control.tree_path', icon: 'view_column' });
        } else {
            out.push({ kind: 'tree', line: h.line, label: items[0]?.id || '', detail: 'tree-view', icon: 'account_tree' });
        }
    }
    return out;
}

// ---- counterColorPattern ----
function resolveCounterColorBacklinks(lines: string[], patternId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['counterColorPattern'], patternId.toLowerCase());
    for (const h of hits) {
        if (h.section !== 'views') continue;
        const items = h.parentChain.filter(c => c.kind === 'item');
        const containers = h.parentChain.filter(c => c.kind !== 'item').map(c => c.kind);
        if (containers.includes('widgets')) {
            out.push({ kind: 'counterColorPattern', line: h.line, label: items[0]?.id || '', detail: `widget ${items[1]?.id || ''}`, icon: 'widgets' });
        } else if (containers.includes('columns')) {
            out.push({ kind: 'counterColorPattern', line: h.line, label: items[1]?.id || '', detail: 'column', icon: 'view_column' });
        }
    }
    return out;
}

// ---- uiPreset ----
function resolveUiPresetBacklinks(lines: string[], presetId: string): Backlink[] {
    const out: Backlink[] = [];
    const target = presetId.toLowerCase();

    let section = '';
    const stack: Array<{ indent: number; kind: string; id: string }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const indent = (line.match(/^(\s*)/) || ['', ''])[1].length;

        if (indent === 0) {
            const sm = line.match(/^([a-zA-Z_][\w]*)\s*:/);
            section = sm ? sm[1] : '';
            stack.length = 0;
            continue;
        }

        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

        const idm = line.match(/^(\s*)-\s+id\s*:\s*([^\s#]+)/);
        if (idm) {
            stack.push({ indent, kind: 'item', id: idm[2].replace(/["']/g, '') });
            continue;
        }

        // `presets: [X, Y]` inline
        const inlineArr = line.match(/^\s*presets\s*:\s*\[([^\]]+)\]/);
        if (inlineArr && section === 'uiRules') {
            const vals = inlineArr[1].split(',').map(s => s.trim().replace(/["']/g, '').toLowerCase());
            if (vals.includes(target)) {
                const uiRuleId = stack.find(s => s.kind === 'item')?.id || '';
                out.push({ kind: 'uiPreset', line: i + 1, label: uiRuleId, detail: 'uiRule.presets', icon: 'rule' });
            }
            continue;
        }

        // `- X` элемент внутри presets: контейнера
        const itemOnly = line.match(/^(\s*)-\s+([^\s#:]+)\s*$/);
        if (itemOnly && section === 'uiRules') {
            const v = itemOnly[2].replace(/["']/g, '');
            if (v.toLowerCase() === target && stack.some(s => s.kind === 'presets')) {
                const uiRuleId = stack.find(s => s.kind === 'item')?.id || '';
                out.push({ kind: 'uiPreset', line: i + 1, label: uiRuleId, detail: 'uiRule.presets', icon: 'rule' });
            }
            continue;
        }

        const cm = line.match(/^(\s*)([a-zA-Z_][\w]*)\s*:\s*$/);
        if (cm) {
            stack.push({ indent, kind: cm[2], id: cm[2] });
            continue;
        }
    }

    return out;
}

// ---- permission ----
function resolvePermissionBacklinks(lines: string[], permissionId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['permission'], permissionId.toLowerCase());
    for (const h of hits) {
        if (h.section !== 'accessRules') continue;
        out.push({ kind: 'permission', line: h.line, label: 'accessRule', detail: `scope ${h.parentChain.find(c => c.kind !== 'item' && c.kind !== 'linkages')?.kind || ''}`, icon: 'lock' });
    }
    return out;
}

// ---- menuItem ----
function resolveMenuItemBacklinks(lines: string[], menuItemId: string): Backlink[] {
    const out: Backlink[] = [];
    const hits = walkFields(lines, ['menuItem'], menuItemId.toLowerCase());
    for (const h of hits) {
        if (h.section !== 'views') continue;
        const items = h.parentChain.filter(c => c.kind === 'item');
        out.push({ kind: 'menuItem', line: h.line, label: items[1]?.id || items[0]?.id || '', detail: 'page.menuItem', icon: 'open_in_new' });
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

    const isLocked = useGraphStore((s) => s.yamlViewerLocked);

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
            {kind === "entity" && (
                <button
                    type="button"
                    className="yaml-nav-ctx-menu__item"
                    disabled={isLocked}
                    title={isLocked ? "Файл заблокирован — снимите блокировку (двойной Shift)" : undefined}
                    onClick={() => {
                        const st = useGraphStore.getState();
                        const domainId = st.yamlViewerDomainId;
                        if (domainId) {
                            st.setGenerateSchemaDomainId(domainId);
                            st.setGenerateSchemaEntityId(state.node.id);
                            st.setGenerateSchemaOpen(true);
                        }
                        onClose();
                    }}
                >
                    <MIcon name="auto_fix_high" size="sm" />
                    Сгенерировать типовой блок
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

function pushBlockDecoration(
    out: any[],
    monaco: any,
    section: { nodes: Array<{ line: number }>; line: number; linesCount: number },
    idx: number,
    hoverText: string,
): void {
    const startLine = section.nodes[idx].line;
    const nextNode = section.nodes[idx + 1];
    const endLine = nextNode
        ? nextNode.line - 1
        : section.line + section.linesCount - 1;

    out.push({
        range: new monaco.Range(
            startLine,
            1,
            Math.max(startLine, endLine),
            1,
        ),
        options: {
            isWholeLine: true,
            className: "unused-entity-line",
            inlineClassName: "unused-entity-text",
            hoverMessage: { value: hoverText },
        },
    });
}

function targetLabel(target: CursorTarget | null): string {
    if (!target) return 'элемент';
    const labels: Record<string, string> = {
        entity: 'сущность',
        attribute: 'атрибут',
        linkage: 'связь',
        action: 'действие',
        view: 'представление',
        dataRule: 'правило',
        mixin: 'примесь',
        dataType: 'тип данных',
        sequence: 'последовательность',
        media: 'иконку',
        tree: 'дерево',
        counterColorPattern: 'цветовую схему',
        uiPreset: 'пресет',
        permission: 'разрешение',
        menuItem: 'пункт меню',
    };
    return labels[target.type || ''] || 'элемент';
}

// ============ Backlinks panel ============

const BACKLINK_KIND_COLORS: Record<Backlink["kind"], string> = {
    inheritance: "#a78bfa",
    reference: "#6366f1",
    linkage: "#10b981",
    view: "#06b6d4",
    dataRule: "#f59e0b",
    mixin: "#ec4899",
    action: "#f97316",
    widget: "#0ea5e9",
    dataType: "#8b5cf6",
    sequence: "#0891b2",
    media: "#f472b6",
    tree: "#84cc16",
    counterColorPattern: "#fbbf24",
    uiPreset: "#a3e635",
    permission: "#ef4444",
    menuItem: "#fb923c",
    filter: "#94a3b8",
    join: "#14b8a6",
};

type BacklinkGroup = "entity" | "attribute";

interface FlatBacklink {
    group: BacklinkGroup;
    key: string;
    backlink: Backlink;
}

function backlinkKey(group: BacklinkGroup, bl: Backlink, idx: number): string {
    return `${group}:${bl.kind}:${bl.line}:${bl.label}:${idx}`;
}

function formatBacklinkText(bl: Backlink): string {
    const out: string[] = [];
    out.push(
        `[${BACKLINK_KIND_LABELS[bl.kind] || bl.kind}] строка :${bl.line}`,
    );
    out.push(`  id: ${bl.label}`);
    if (bl.detail) out.push(`  ${bl.detail}`);
    return out.join("\n");
}

function targetLabelForType(t: CursorTarget | null): string {
    if (!t) return "элемент";
    switch (t.type) {
        case "entity":
            return "сущность";
        case "attribute":
            return "атрибут";
        case "linkage":
            return "связь";
        case "action":
            return "действие";
        case "view":
            return "представление";
        case "dataRule":
            return "правило";
        case "mixin":
            return "примесь";
        case "dataType":
            return "тип данных";
        case "sequence":
            return "последовательность";
        case "media":
            return "иконка";
        case "tree":
            return "дерево";
        case "counterColorPattern":
            return "цветовая схема";
        case "uiPreset":
            return "пресет";
        case "permission":
            return "разрешение";
        case "menuItem":
            return "пункт меню";
        default:
            return "элемент";
    }
}

interface BacklinksPanelProps {
    backlinks: {
        entity: Backlink[];
        attribute: Backlink[];
        target: CursorTarget | null;
    };
    onJump: (line: number) => void;
    currentDomain: string | null;
}

const BacklinksPanel = React.memo(function BacklinksPanel({
    backlinks,
    onJump,
    currentDomain,
}: BacklinksPanelProps) {
    const [query, setQuery] = useState("");
    const [groupFilter, setGroupFilter] = useState<"all" | BacklinkGroup>(
        "all",
    );
    const [kindFilter, setKindFilter] = useState<Set<Backlink["kind"]>>(
        new Set(),
    );
    const [groupMode, setGroupMode] = useState<"kind" | "group" | "flat">(
        "kind",
    );
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // ── Плоский список ──
    const allItems = useMemo<FlatBacklink[]>(() => {
        const out: FlatBacklink[] = [];
        backlinks.entity.forEach((bl, i) =>
            out.push({ group: "entity", key: backlinkKey("entity", bl, i), backlink: bl }),
        );
        backlinks.attribute.forEach((bl, i) =>
            out.push({ group: "attribute", key: backlinkKey("attribute", bl, i), backlink: bl }),
        );
        return out;
    }, [backlinks]);

    // ── Счётчики по kind (по всем) ──
    const kindCounts = useMemo(() => {
        const c = new Map<Backlink["kind"], number>();
        for (const it of allItems) {
            c.set(it.backlink.kind, (c.get(it.backlink.kind) || 0) + 1);
        }
        return c;
    }, [allItems]);

    // ── Фильтрация ──
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return allItems.filter((it) => {
            if (groupFilter !== "all" && it.group !== groupFilter) return false;
            if (kindFilter.size > 0 && !kindFilter.has(it.backlink.kind))
                return false;
            if (!q) return true;
            const hay = [
                it.backlink.label,
                it.backlink.detail,
                BACKLINK_KIND_LABELS[it.backlink.kind],
                it.backlink.kind,
                String(it.backlink.line),
                it.group === "entity" ? "сущность" : "атрибут",
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [allItems, groupFilter, kindFilter, query]);

    // ── Группировка ──
    const grouped = useMemo<Array<{
        key: string;
        label: string;
        color?: string;
        sublabel?: string;
        items: FlatBacklink[];
    }>>(() => {
        if (filtered.length === 0) return [];

        if (groupMode === "flat") {
            return [
                {
                    key: "__flat__",
                    label: "Все ссылки",
                    sublabel: `${filtered.length}`,
                    items: filtered
                        .slice()
                        .sort((a, b) => a.backlink.line - b.backlink.line),
                },
            ];
        }

        if (groupMode === "group") {
            const map = new Map<BacklinkGroup, FlatBacklink[]>();
            for (const it of filtered) {
                if (!map.has(it.group)) map.set(it.group, []);
                map.get(it.group)!.push(it);
            }
            return Array.from(map.entries()).map(([g, items]) => ({
                key: `group:${g}`,
                label:
                    g === "entity"
                        ? "На сущность"
                        : `На атрибут${backlinks.target?.id ? ` ${backlinks.target.id}` : ""}`,
                color: g === "entity" ? "#6366f1" : "#10b981",
                sublabel: `${items.length}`,
                items: items
                    .slice()
                    .sort((a, b) => a.backlink.line - b.backlink.line),
            }));
        }

        // kind
        const map = new Map<Backlink["kind"], FlatBacklink[]>();
        for (const it of filtered) {
            if (!map.has(it.backlink.kind)) map.set(it.backlink.kind, []);
            map.get(it.backlink.kind)!.push(it);
        }
        return Array.from(map.entries())
            .sort((a, b) => b[1].length - a[1].length)
            .map(([k, items]) => ({
                key: `kind:${k}`,
                label: BACKLINK_KIND_LABELS[k] || k,
                color: BACKLINK_KIND_COLORS[k],
                sublabel: `${items.length}`,
                items: items
                    .slice()
                    .sort((a, b) => a.backlink.line - b.backlink.line),
            }));
    }, [filtered, groupMode, backlinks.target]);

    // ── Плоский список для навигации ──
    const navList = useMemo(() => {
        const out: FlatBacklink[] = [];
        for (const g of grouped) {
            if (!expanded.has(g.key)) continue;
            for (const it of g.items) out.push(it);
        }
        return out;
    }, [grouped, expanded]);

    const activeIdx = useMemo(
        () => navList.findIndex((x) => x.key === activeKey),
        [navList, activeKey],
    );

    // ── Автораскрытие ──
    useEffect(() => {
        if (grouped.length === 0) {
            setExpanded(new Set());
            return;
        }
        if (grouped.length <= 12) {
            setExpanded(new Set(grouped.map((g) => g.key)));
        } else {
            setExpanded(new Set(grouped.slice(0, 3).map((g) => g.key)));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupMode, allItems.length]);

    // ── Автоскролл активного ──
    useEffect(() => {
        if (!activeKey || !listRef.current) return;
        const el = listRef.current.querySelector(
            `[data-backlink-key="${CSS.escape(activeKey)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [activeKey]);

    // ── Handlers ──
    const selectItem = useCallback(
        (item: FlatBacklink) => {
            setActiveKey(item.key);
            onJump(item.backlink.line);
        },
        [onJump],
    );

    const stepItem = useCallback(
        (delta: 1 | -1) => {
            if (navList.length === 0) return;
            let idx = activeIdx;
            if (idx < 0) idx = delta > 0 ? -1 : 0;
            const next = (idx + delta + navList.length) % navList.length;
            selectItem(navList[next]);
        },
        [navList, activeIdx, selectItem],
    );

    const toggleKind = (k: Backlink["kind"]) => {
        setKindFilter((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else next.add(k);
            return next;
        });
    };

    const toggleGroup = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const expandAll = () => setExpanded(new Set(grouped.map((g) => g.key)));
    const collapseAll = () => setExpanded(new Set());

    const copyAll = async () => {
        if (filtered.length === 0) return;
        const text = filtered
            .map((it) => formatBacklinkText(it.backlink))
            .join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${filtered.length}`);
        } catch {
            /* ignore */
        }
    };

    const copyOne = async (bl: Backlink) => {
        try {
            await navigator.clipboard.writeText(formatBacklinkText(bl));
            useGraphStore.getState().showSnackbar("Ссылка скопирована");
        } catch {
            /* ignore */
        }
    };

    const copyGroup = async (items: FlatBacklink[]) => {
        const text = items
            .map((it) => formatBacklinkText(it.backlink))
            .join("\n\n");
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${items.length}`);
        } catch {
            /* ignore */
        }
    };

    const copyPath = async (bl: Backlink) => {
        const path = currentDomain
            ? `${currentDomain}:${bl.line}`
            : `:${bl.line}`;
        try {
            await navigator.clipboard.writeText(path);
            useGraphStore.getState().showSnackbar(`Скопировано: ${path}`);
        } catch {
            /* ignore */
        }
    };

    const exportMd = () => {
        if (filtered.length === 0) return;
        const lines: string[] = [];
        lines.push("# Обратные ссылки");
        lines.push("");
        lines.push(`_${new Date().toLocaleString("ru-RU")}_`);
        if (currentDomain) lines.push(`**Домен:** \`${currentDomain}\``);
        if (backlinks.target?.id) {
            lines.push(
                `**Элемент:** \`${backlinks.target.type === "attribute" && backlinks.target.parentId ? `${backlinks.target.parentId}.${backlinks.target.id}` : backlinks.target.id}\``,
            );
        }
        lines.push("");
        lines.push(
            `**Всего:** ${filtered.length} из ${allItems.length}`,
        );
        if (query) lines.push(`**Поиск:** «${query}»`);
        lines.push("");
        for (const g of grouped) {
            lines.push(`## ${g.label} (${g.items.length})`);
            lines.push("");
            for (const it of g.items) {
                const bl = it.backlink;
                let row = `- \`:${bl.line}\` **[${BACKLINK_KIND_LABELS[bl.kind]}]** \`${bl.label}\``;
                if (bl.detail) row += ` — ${bl.detail}`;
                lines.push(row);
            }
            lines.push("");
        }
        const blob = new Blob([lines.join("\n")], {
            type: "text/markdown;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backlinks-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
        useGraphStore.getState().showSnackbar("Отчёт сохранён");
    };

    // ── Копировать FQID target (если target — сущность/атрибут) ──
    const copyTarget = async () => {
        const t = target;
        if (!t || !t.id) return;
        const text =
            t.type === "attribute" && t.parentId
                ? `${currentDomain ? currentDomain + "/" : ""}${t.parentId}.${t.id}`
                : `${currentDomain ? currentDomain + "/" : ""}${t.id}`;
        try {
            await navigator.clipboard.writeText(text);
            useGraphStore.getState().showSnackbar(`Скопировано: ${text}`);
        } catch {
            /* ignore */
        }
    };

    // ── Keyboard ──
    const onKeyDown = (e: React.KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        if (e.key === "ArrowDown" || e.key === "j") {
            e.preventDefault();
            stepItem(1);
        } else if (e.key === "ArrowUp" || e.key === "k") {
            e.preventDefault();
            stepItem(-1);
        } else if (e.key === "Home") {
            e.preventDefault();
            if (navList.length > 0) selectItem(navList[0]);
        } else if (e.key === "End") {
            e.preventDefault();
            if (navList.length > 0) selectItem(navList[navList.length - 1]);
        } else if (e.key === "Escape") {
            setActiveKey(null);
        }
    };

    const target = backlinks.target;

    // ── Пустые состояния ──
    if (!target) {
        return (
            <div className="yaml-issues yaml-backlinks" onKeyDown={onKeyDown}>
                <div className="yaml-issues-empty" style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center"
                }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                    <div style={{ color: "var(--text-300)", fontSize: 13 }}>
                        Поставьте курсор на элемент
                    </div>
                    <div
                        style={{
                            color: "var(--text-500)",
                            fontSize: 11,
                            marginTop: 6,
                            maxWidth: 280,
                            textAlign: "center",
                        }}
                    >
                        Сущность, атрибут, linkage, action, view, dataType,
                        sequence, tree, media, uiPreset, permission, menuItem…
                    </div>
                </div>
            </div>
        );
    }

    if (allItems.length === 0) {
        return (
            <div className="yaml-issues yaml-backlinks" onKeyDown={onKeyDown}>
                <div className="yaml-issues-empty">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <div style={{ color: "var(--text-300)", fontSize: 13 }}>
                        На {targetLabelForType(target)} ничего не
                        ссылается
                    </div>
                    <div
                        style={{
                            color: "var(--text-500)",
                            fontSize: 11,
                            marginTop: 6,
                            maxWidth: 280,
                            textAlign: "center",
                        }}
                    >
                        Это нормально — элемент самодостаточный. Проверьте его
                        использование в других инструментах: lint, schema,
                        каталог.
                    </div>
                </div>
            </div>
        );
    }

    const totalKinds = kindCounts.size;
    const totalGroups = (backlinks.entity.length > 0 ? 1 : 0) + (backlinks.attribute.length > 0 ? 1 : 0);

    const targetTitle = (() => {
        if (target.type === "attribute" && target.parentId)
            return `${target.parentId}.${target.id}`;
        return target.id || "?";
    })();

    let itemOffset = 0;

    return (
        <div
            className="yaml-issues yaml-backlinks"
            onKeyDown={onKeyDown}
            tabIndex={-1}
        >
            {/* ── Заголовок с target ── */}
            <div className="yaml-backlinks__target">
                <div className="yaml-backlinks__target-info">
                    <div className="yaml-backlinks__target-type">
                        {targetLabelForType(backlinks.target)}
                    </div>
                    <code className="yaml-backlinks__target-id">
                        {targetTitle}
                    </code>
                </div>
                <div className="yaml-backlinks__target-actions">
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={() => {
                            if (
                                typeof target.line === "number"
                            ) {
                                onJump(target.line);
                            }
                        }}
                        title="Перейти к объявлению в YAML"
                    >
                        <MIcon name="my_location" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={copyTarget}
                        title="Копировать FQID элемента"
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                </div>
            </div>

            {/* ── Поиск + группировка ── */}
            <div className="yaml-issues__toolbar">
                <div className="yaml-issues__search">
                    <MIcon name="search" size="sm" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск: id, вид, строка…"
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            type="button"
                            className="yaml-issues__search-clear"
                            onClick={() => setQuery("")}
                            title="Очистить"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <select
                    className="yaml-issues__group-select"
                    value={groupMode}
                    onChange={(e) =>
                        setGroupMode(e.target.value as typeof groupMode)
                    }
                    title="Группировка"
                >
                    <option value="kind">По виду ссылки</option>
                    <option value="group">По группе</option>
                    <option value="flat">Плоский</option>
                </select>
            </div>

            {/* ── Групповой фильтр ── */}
            {totalGroups > 1 && (
                <div className="yaml-ext-refs__kinds">
                    <button
                        type="button"
                        className={
                            "yaml-ext-refs__kind-chip" +
                            (groupFilter === "all"
                                ? " yaml-ext-refs__kind-chip--active"
                                : "")
                        }
                        onClick={() => setGroupFilter("all")}
                    >
                        Все
                        <span className="yaml-ext-refs__kind-count">
                            {allItems.length}
                        </span>
                    </button>
                    {backlinks.entity.length > 0 && (
                        <button
                            type="button"
                            className={
                                "yaml-ext-refs__kind-chip" +
                                (groupFilter === "entity"
                                    ? " yaml-ext-refs__kind-chip--active"
                                    : "")
                            }
                            onClick={() =>
                                setGroupFilter(
                                    groupFilter === "entity" ? "all" : "entity",
                                )
                            }
                            style={{
                                borderColor:
                                    groupFilter === "entity"
                                        ? "#6366f1"
                                        : undefined,
                                color:
                                    groupFilter === "entity"
                                        ? "#6366f1"
                                        : undefined,
                                background:
                                    groupFilter === "entity"
                                        ? "#6366f118"
                                        : undefined,
                            }}
                        >
                            <span
                                className="yaml-ext-refs__kind-dot"
                                style={{ background: "#6366f1" }}
                            />
                            На сущность
                            <span className="yaml-ext-refs__kind-count">
                                {backlinks.entity.length}
                            </span>
                        </button>
                    )}
                    {backlinks.attribute.length > 0 && (
                        <button
                            type="button"
                            className={
                                "yaml-ext-refs__kind-chip" +
                                (groupFilter === "attribute"
                                    ? " yaml-ext-refs__kind-chip--active"
                                    : "")
                            }
                            onClick={() =>
                                setGroupFilter(
                                    groupFilter === "attribute"
                                        ? "all"
                                        : "attribute",
                                )
                            }
                            style={{
                                borderColor:
                                    groupFilter === "attribute"
                                        ? "#10b981"
                                        : undefined,
                                color:
                                    groupFilter === "attribute"
                                        ? "#10b981"
                                        : undefined,
                                background:
                                    groupFilter === "attribute"
                                        ? "#10b98118"
                                        : undefined,
                            }}
                        >
                            <span
                                className="yaml-ext-refs__kind-dot"
                                style={{ background: "#10b981" }}
                            />
                            На атрибут
                            <span className="yaml-ext-refs__kind-count">
                                {backlinks.attribute.length}
                            </span>
                        </button>
                    )}
                </div>
            )}

            {/* ── Фильтр по виду ── */}
            {totalKinds > 1 && (
                <div className="yaml-ext-refs__kinds">
                    <button
                        type="button"
                        className={
                            "yaml-ext-refs__kind-chip" +
                            (kindFilter.size === 0
                                ? " yaml-ext-refs__kind-chip--active"
                                : "")
                        }
                        onClick={() => setKindFilter(new Set())}
                    >
                        Все виды
                    </button>
                    {Array.from(kindCounts.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, count]) => {
                            const color = BACKLINK_KIND_COLORS[k];
                            const active = kindFilter.has(k);
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    className={
                                        "yaml-ext-refs__kind-chip" +
                                        (active
                                            ? " yaml-ext-refs__kind-chip--active"
                                            : "")
                                    }
                                    onClick={() => toggleKind(k)}
                                    style={{
                                        borderColor: active
                                            ? color
                                            : undefined,
                                        color: active ? color : undefined,
                                        background: active
                                            ? `${color}18`
                                            : undefined,
                                    }}
                                >
                                    <span
                                        className="yaml-ext-refs__kind-dot"
                                        style={{ background: color }}
                                    />
                                    {BACKLINK_KIND_LABELS[k] || k}
                                    <span className="yaml-ext-refs__kind-count">
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                </div>
            )}

            {/* ── Навигация ── */}
            <div className="yaml-issues__navbar">
                <button
                    type="button"
                    className="yaml-issues__nav-btn"
                    onClick={() => stepItem(-1)}
                    disabled={navList.length === 0}
                    title="Предыдущая (↑ / k)"
                >
                    <MIcon name="expand_less" size="sm" />
                </button>
                <button
                    type="button"
                    className="yaml-issues__nav-btn"
                    onClick={() => stepItem(1)}
                    disabled={navList.length === 0}
                    title="Следующая (↓ / j)"
                >
                    <MIcon name="expand_more" size="sm" />
                </button>
                <span className="yaml-issues__nav-counter">
                    {activeIdx >= 0
                        ? `${activeIdx + 1} / ${navList.length}`
                        : `— / ${navList.length}`}
                </span>
                <div className="yaml-issues__nav-actions">
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={expandAll}
                        title="Развернуть всё"
                    >
                        <MIcon name="unfold_more" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={collapseAll}
                        title="Свернуть всё"
                        disabled={expanded.size === 0}
                    >
                        <MIcon name="unfold_less" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={copyAll}
                        title="Копировать все"
                        disabled={filtered.length === 0}
                    >
                        <MIcon name="content_copy" size="sm" />
                    </button>
                    <button
                        type="button"
                        className="yaml-issues__nav-btn"
                        onClick={exportMd}
                        title="Экспорт в Markdown"
                        disabled={filtered.length === 0}
                    >
                        <MIcon name="description" size="sm" />
                    </button>
                </div>
            </div>

            {/* ── Сводка ── */}
            <div className="yaml-issues__header">
                Ссылки ({filtered.length}
                {filtered.length !== allItems.length
                    ? ` / ${allItems.length}`
                    : ""}
                ) · <strong>{totalKinds}</strong> вид.
                {totalGroups > 1 && (
                    <>
                        {" · "}
                        <strong>{totalGroups}</strong> групп
                    </>
                )}
                {(kindFilter.size > 0 || groupFilter !== "all") && (
                    <>
                        {" · "}
                        <button
                            type="button"
                            className="yaml-backlinks__reset"
                            onClick={() => {
                                setQuery("");
                                setKindFilter(new Set());
                                setGroupFilter("all");
                            }}
                        >
                            сбросить фильтры
                        </button>
                    </>
                )}
            </div>

            {/* ── Список ── */}
            {filtered.length === 0 ? (
                <div className="yaml-issues-empty">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <div>Ничего не найдено по фильтрам</div>
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            setQuery("");
                            setKindFilter(new Set());
                            setGroupFilter("all");
                        }}
                        style={{ marginTop: 8 }}
                    >
                        Сбросить фильтры
                    </button>
                </div>
            ) : (
                <div className="yaml-issues__list" ref={listRef}>
                    {grouped.map((g) => {
                        const isExpanded = expanded.has(g.key);
                        const startOffset = itemOffset;
                        if (isExpanded) itemOffset += g.items.length;
                        return (
                            <div
                                key={g.key}
                                className={
                                    "yaml-issues__group" +
                                    (isExpanded ? " open" : "")
                                }
                            >
                                <div className="yaml-issues__group-title">
                                    <button
                                        type="button"
                                        className="yaml-issues__group-toggle"
                                        onClick={() => toggleGroup(g.key)}
                                    >
                                        <span className="yaml-issues__group-chevron">
                                            {isExpanded ? "▾" : "▸"}
                                        </span>
                                        {g.color && (
                                            <span
                                                className="yaml-backlinks__group-dot"
                                                style={{ background: g.color }}
                                            />
                                        )}
                                        <span className="yaml-issues__group-label">
                                            {g.label}
                                        </span>
                                        <span className="yaml-issues__group-count">
                                            {g.sublabel || g.items.length}
                                        </span>
                                    </button>
                                    <div className="yaml-issues__group-actions">
                                        <button
                                            type="button"
                                            className="yaml-issues__group-action"
                                            onClick={() => copyGroup(g.items)}
                                            title="Копировать группу"
                                        >
                                            <MIcon
                                                name="content_copy"
                                                size="sm"
                                            />
                                        </button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="yaml-issues__group-body">
                                        {g.items.map((it, i) => {
                                            const bl = it.backlink;
                                            const isActive =
                                                it.key === activeKey;
                                            const color =
                                                BACKLINK_KIND_COLORS[bl.kind] ||
                                                "#64748b";
                                            return (
                                                <div
                                                    key={it.key}
                                                    data-backlink-key={it.key}
                                                    className={
                                                        "yaml-backlink" +
                                                        (isActive
                                                            ? " yaml-backlink--active"
                                                            : "")
                                                    }
                                                    onClick={() =>
                                                        selectItem(it)
                                                    }
                                                    title={
                                                        bl.detail ||
                                                        `${bl.label} · :${bl.line}`
                                                    }
                                                >
                                                    <span className="yaml-backlink__line">
                                                        :{bl.line}
                                                    </span>
                                                    <span
                                                        className="yaml-backlink__kind-chip"
                                                        style={{
                                                            color,
                                                            background: `${color}18`,
                                                            borderColor: `${color}40`,
                                                        }}
                                                    >
                                                        <MIcon
                                                            name={bl.icon}
                                                            size="sm"
                                                        />
                                                        {BACKLINK_KIND_LABELS[
                                                            bl.kind
                                                        ] || bl.kind}
                                                    </span>
                                                    <code className="yaml-backlink__id">
                                                        {bl.label}
                                                    </code>
                                                    {bl.detail && (
                                                        <span className="yaml-backlink__detail">
                                                            {bl.detail}
                                                        </span>
                                                    )}
                                                    {it.group ===
                                                        "attribute" && (
                                                            <span
                                                                className="yaml-backlink__group-badge"
                                                                title="На атрибут"
                                                            >
                                                                attr
                                                            </span>
                                                        )}
                                                    <div className="yaml-backlink__actions">
                                                        <button
                                                            type="button"
                                                            className="yaml-backlink__action"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onJump(
                                                                    bl.line,
                                                                );
                                                            }}
                                                            title="Перейти к строке"
                                                        >
                                                            <MIcon
                                                                name="my_location"
                                                                size="sm"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="yaml-backlink__action"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyPath(bl);
                                                            }}
                                                            title="Копировать путь (домен:строка)"
                                                        >
                                                            <MIcon
                                                                name="link"
                                                                size="sm"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="yaml-backlink__action"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyOne(bl);
                                                            }}
                                                            title="Копировать"
                                                        >
                                                            <MIcon
                                                                name="content_copy"
                                                                size="sm"
                                                            />
                                                        </button>
                                                    </div>
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
    );
});