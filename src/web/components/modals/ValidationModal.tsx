import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useValidation } from "../../hooks/useValidation";
import { useNavigation } from "../../hooks/useNavigation";
import { generateValidationMarkdown } from "../../lib/markdown";
import { formatDuration, plural } from "../../lib/format";
import { MIcon } from "../common/MIcon";
import { openFileInEditor } from "../../lib/open-file";
import { alertDialog } from "../../lib/dialogs";
import type { ValidationRecord, ValidationDiagnostic } from "../../lib/types";

// ============ helpers ============

function escapeCsv(v: any): string {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function stamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
}

function diagStats(diags: ValidationDiagnostic[] | undefined) {
    const d = diags ?? [];
    return {
        total: d.length,
        error: d.filter((x) => x.severity === "ERROR").length,
        warning: d.filter((x) => x.severity === "WARNING").length,
        info: d.filter((x) => x.severity === "INFO").length,
    };
}

function computePartialStats(logs: ValidationRecord[], total: number) {
    return {
        total,
        processed: logs.length,
        valid: logs.filter((l) => l.status === "valid").length,
        invalid: logs.filter((l) => l.status === "invalid").length,
        errors: logs.filter((l) => l.status === "error").length,
        elapsedMs: 0,
    };
}

// ============ Donut ============

interface DonutSegment {
    value: number;
    color: string;
    label: string;
}

function Donut({
    segments,
    size = 96,
    thickness = 12,
    center,
    sub,
}: {
    segments: DonutSegment[];
    size?: number;
    thickness?: number;
    center: React.ReactNode;
    sub?: React.ReactNode;
}) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    const radius = (size - thickness) / 2;
    const C = 2 * Math.PI * radius;
    let offset = 0;

    return (
        <div
            style={{
                position: "relative",
                width: size,
                height: size,
                flexShrink: 0,
            }}
        >
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--bg-700)"
                    strokeWidth={thickness}
                />
                {total > 0 &&
                    segments.map((s, i) => {
                        if (s.value === 0) return null;
                        const len = (s.value / total) * C;
                        const el = (
                            <circle
                                key={i}
                                cx={size / 2}
                                cy={size / 2}
                                r={radius}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={thickness}
                                strokeDasharray={`${len} ${C - len}`}
                                strokeDashoffset={-offset}
                                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                style={{
                                    transition:
                                        "stroke-dasharray 0.3s, stroke-dashoffset 0.3s",
                                }}
                            >
                                <title>
                                    {s.label}: {s.value}
                                </title>
                            </circle>
                        );
                        offset += len;
                        return el;
                    })}
            </svg>
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    lineHeight: 1.1,
                }}
            >
                <div
                    style={{
                        fontSize: 20,
                        fontWeight: 700,
                        fontFamily: "JetBrains Mono, monospace",
                        color: "var(--text-100)",
                    }}
                >
                    {center}
                </div>
                {sub && (
                    <div
                        style={{
                            fontSize: 9.5,
                            color: "var(--text-500)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginTop: 2,
                        }}
                    >
                        {sub}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============ KPI Card ============

function KpiCard({
    icon,
    label,
    value,
    sub,
    tone = "neutral",
    onClick,
}: {
    icon: string;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    tone?: "ok" | "warn" | "err" | "info" | "neutral";
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            className={
                "valid-kpi-card valid-kpi-card--" +
                tone +
                (onClick ? " valid-kpi-card--clickable" : "")
            }
            onClick={onClick}
            disabled={!onClick}
        >
            <MIcon name={icon} size="sm" />
            <div className="valid-kpi-card__value">{value}</div>
            <div className="valid-kpi-card__label">{label}</div>
            {sub && <div className="valid-kpi-card__sub">{sub}</div>}
        </button>
    );
}

// ============ Main ============

export interface ValidationModalProps {
    allDomains: Array<{ id: string; domainId: string }>;
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
}

type Filter =
    | "problems"
    | "all"
    | "invalid"
    | "errors"
    | "valid"
    | "skipped";

type SortBy = "name" | "severity" | "diagnostics";
type GroupBy = "none" | "status";

export function ValidationModal(props: ValidationModalProps) {
    const { goto } = useNavigation();
    const v = useValidation();
    const nodes = useGraphStore((s) => s.nodes);

    const [scope, setScope] = useState<"all" | "visible" | "bookmarked">("all");
    const [filter, setFilter] = useState<Filter>("problems");
    const [sortBy, setSortBy] = useState<SortBy>("severity");
    const [groupBy, setGroupBy] = useState<GroupBy>("none");
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const [activeIdx, setActiveIdx] = useState(-1);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const contentCacheRef = useRef<Map<string, string>>(new Map());

    const open = useGraphStore((s) => s.validationOpen);

    // ── Tracking elapsed / ETA ──
    useEffect(() => {
        if (v.running && startedAt == null) setStartedAt(Date.now());
        if (!v.running && !v.started && startedAt != null) setStartedAt(null);
    }, [v.running, v.started, startedAt]);

    useEffect(() => {
        if (!v.running) return;
        const t = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(t);
    }, [v.running]);

    const elapsedMs = useMemo(() => {
        if (!startedAt) return v.stats?.elapsedMs ?? 0;
        if (!v.running) return v.stats?.elapsedMs ?? now - startedAt;
        return now - startedAt;
    }, [startedAt, v.running, v.stats, now]);

    const eta = useMemo(() => {
        if (!v.running) return null;
        if (v.progress.current === 0) return null;
        if (v.progress.current >= v.progress.total) return null;
        return Math.round(
            (elapsedMs / v.progress.current) *
            (v.progress.total - v.progress.current),
        );
    }, [v.running, v.progress, elapsedMs]);

    // ── Effective stats: реальные или частичные после stop ──
    const effectiveStats = useMemo(() => {
        if (v.stats) return v.stats;
        if (v.logs.length > 0) return computePartialStats(v.logs, v.progress.total);
        return null;
    }, [v.stats, v.logs, v.progress.total]);

    const failedDomains = useMemo(
        () =>
            v.logs
                .filter((l) => l.status === "invalid" || l.status === "error")
                .map((l) => l.domainId),
        [v.logs],
    );

    const isDone = !v.running && effectiveStats !== null;

    // ── Filtered / sorted / grouped ──
    const filteredLogs = useMemo(() => {
        let logs = v.logs;
        if (filter === "problems")
            logs = logs.filter(
                (l) => l.status === "invalid" || l.status === "error",
            );
        else if (filter === "invalid")
            logs = logs.filter((l) => l.status === "invalid");
        else if (filter === "errors")
            logs = logs.filter((l) => l.status === "error");
        else if (filter === "valid")
            logs = logs.filter((l) => l.status === "valid");
        else if (filter === "skipped")
            logs = logs.filter((l) => l.status === "skip");

        const q = query.trim().toLowerCase();
        if (q) logs = logs.filter((l) => l.domainId.toLowerCase().includes(q));

        const sorted = [...logs];
        if (sortBy === "name") {
            sorted.sort((a, b) => a.domainId.localeCompare(b.domainId));
        } else if (sortBy === "severity") {
            const rank = (s: string) =>
                s === "error" ? 0 : s === "invalid" ? 1 : s === "skip" ? 2 : 3;
            sorted.sort(
                (a, b) =>
                    rank(a.status) - rank(b.status) ||
                    a.domainId.localeCompare(b.domainId),
            );
        } else {
            sorted.sort(
                (a, b) =>
                    (b.diagnostics?.length ?? 0) - (a.diagnostics?.length ?? 0),
            );
        }
        return sorted;
    }, [v.logs, filter, query, sortBy]);

    const grouped = useMemo(() => {
        if (groupBy === "none") {
            return [{ key: "all", label: null as string | null, icon: "", logs: filteredLogs }];
        }
        const labels: Record<string, string> = {
            error: "Ошибки выполнения",
            invalid: "Невалидные",
            skip: "Пропущенные",
            valid: "Валидные",
        };
        const icons: Record<string, string> = {
            error: "warning",
            invalid: "cancel",
            skip: "skip_next",
            valid: "check_circle",
        };
        const groups = new Map<string, ValidationRecord[]>();
        filteredLogs.forEach((l) => {
            if (!groups.has(l.status)) groups.set(l.status, []);
            groups.get(l.status)!.push(l);
        });
        const order = ["error", "invalid", "skip", "valid"];
        return order
            .filter((k) => groups.has(k))
            .map((k) => ({
                key: k,
                label: labels[k] ?? k,
                icon: icons[k] ?? "info",
                logs: groups.get(k)!,
            }));
    }, [filteredLogs, groupBy]);

    const flatIds = useMemo(() => {
        const out: string[] = [];
        grouped.forEach((g) => g.logs.forEach((l) => out.push(l.domainId)));
        return out;
    }, [grouped]);

    // ── Helpers ──
    const findNodeByDomain = useCallback(
        (domainId: string) =>
            nodes.find(
                (n) =>
                    (n.data.domainId || "").toLowerCase() ===
                    domainId.toLowerCase(),
            ),
        [nodes],
    );

    const getFileContent = useCallback(async (filePath: string) => {
        if (contentCacheRef.current.has(filePath))
            return contentCacheRef.current.get(filePath)!;
        try {
            const res = await fetch(
                `/file?path=${encodeURIComponent(filePath)}`,
            );
            if (!res.ok) return null;
            const text = await res.text();
            contentCacheRef.current.set(filePath, text);
            return text;
        } catch {
            return null;
        }
    }, []);

    const openYamlForDomain = useCallback(
        async (domainId: string) => {
            const node = findNodeByDomain(domainId);
            if (!node?.data.filePath) {
                useGraphStore.getState().showSnackbar("Файл схемы не найден");
                return;
            }
            const ok = await openFileInEditor(node.data.filePath, null, domainId);
            if (ok) useGraphStore.getState().setValidationOpen(false);
        },
        [findNodeByDomain],
    );

    const openDiagnostic = useCallback(
        async (domainId: string, diag: ValidationDiagnostic) => {
            const node = findNodeByDomain(domainId);
            if (!node?.data.filePath) {
                useGraphStore.getState().showSnackbar("Файл схемы не найден");
                return;
            }
            const label = diag.labels?.find((l) => l.span);
            if (!label?.span) {
                const ok = await openFileInEditor(
                    node.data.filePath,
                    null,
                    domainId,
                );
                if (ok) useGraphStore.getState().setValidationOpen(false);
                return;
            }
            const content = await getFileContent(node.data.filePath);
            if (!content) {
                const ok = await openFileInEditor(
                    node.data.filePath,
                    null,
                    domainId,
                );
                if (ok) useGraphStore.getState().setValidationOpen(false);
                return;
            }
            const before = content.slice(0, label.span.start);
            const line = before.split("\n").length;
            const st = useGraphStore.getState();
            st.setYamlViewerPendingGoto({ kind: "line", line, column: 1 });
            const ok = await openFileInEditor(node.data.filePath, null, domainId);
            if (ok) useGraphStore.getState().setValidationOpen(false);
            else useGraphStore.getState().setYamlViewerPendingGoto(null);
        },
        [findNodeByDomain, getFileContent],
    );

    const copyDiagnostics = useCallback(async (log: ValidationRecord) => {
        const text = (log.diagnostics ?? [])
            .map((d) => {
                const label = d.labels?.[0];
                const extra = label?.message ? `\n  ${label.message}` : "";
                return `[${d.severity}] ${d.message}${extra}`;
            })
            .join("\n\n");
        try {
            await navigator.clipboard.writeText(text || log.error || "");
            useGraphStore.getState().showSnackbar("Скопировано");
        } catch {
            await alertDialog("Не удалось скопировать");
        }
    }, []);

    const copyDomainIds = useCallback(async (logs: ValidationRecord[]) => {
        try {
            await navigator.clipboard.writeText(
                logs.map((l) => l.domainId).join("\n"),
            );
            useGraphStore
                .getState()
                .showSnackbar(`Скопировано: ${logs.length}`);
        } catch { /* ignore */ }
    }, []);

    // ── Actions ──
    const startValidation = () => {
        let domains: Array<{ id: string; domainId: string }>;
        if (scope === "visible") domains = props.visibleDomains;
        else if (scope === "bookmarked") domains = props.bookmarkedDomains;
        else domains = props.allDomains;

        setExpanded(new Set());
        setStartedAt(Date.now());
        setActiveIdx(-1);
        v.start(scope, domains.map((d) => d.domainId));
    };

    const retryFailed = () => {
        if (failedDomains.length === 0) return;
        setExpanded(new Set());
        setStartedAt(Date.now());
        setActiveIdx(-1);
        v.start(scope, failedDomains);
    };

    const expandAll = () => setExpanded(new Set(filteredLogs.map((l) => l.domainId)));
    const collapseAll = () => setExpanded(new Set());

    const toggleExpanded = (domainId: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(domainId)) next.delete(domainId);
            else next.add(domainId);
            return next;
        });
    };

    // ── Exports ──
    const exportJSON = () => {
        if (!effectiveStats) return;
        downloadFile(
            JSON.stringify(
                {
                    generatedAt: new Date().toISOString(),
                    stats: effectiveStats,
                    cancelled: v.cancelled,
                    results: v.logs.map((l) => ({
                        domainId: l.domainId,
                        status: l.status,
                        diagnostics: l.diagnostics,
                        error: l.error,
                    })),
                },
                null,
                2,
            ),
            `validation-${stamp()}.json`,
            "application/json",
        );
    };

    const exportCSV = () => {
        const header = [
            "domainId",
            "status",
            "severity",
            "message",
            "labelMessage",
            "spanStart",
            "spanEnd",
        ];
        const lines = [header.join(",")];
        for (const log of v.logs) {
            if (!log.diagnostics || log.diagnostics.length === 0) {
                lines.push(
                    [
                        log.domainId,
                        log.status,
                        "",
                        log.error ?? "",
                        "",
                        "",
                        "",
                    ]
                        .map(escapeCsv)
                        .join(","),
                );
                continue;
            }
            for (const d of log.diagnostics) {
                const label = d.labels?.[0];
                lines.push(
                    [
                        log.domainId,
                        log.status,
                        d.severity,
                        d.message,
                        label?.message ?? "",
                        label?.span?.start ?? "",
                        label?.span?.end ?? "",
                    ]
                        .map(escapeCsv)
                        .join(","),
                );
            }
        }
        downloadFile(
            "\uFEFF" + lines.join("\n"),
            `validation-${stamp()}.csv`,
            "text/csv;charset=utf-8",
        );
    };

    const exportMD = () => {
        if (!effectiveStats) return;
        downloadFile(
            generateValidationMarkdown(effectiveStats, v.cancelled, v.logs),
            `validation-${stamp()}.md`,
            "text/markdown;charset=utf-8",
        );
    };

    // ── Keyboard ──
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const inInput =
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.tagName === "SELECT" ||
                    target.isContentEditable);
            const onButton = target && !!target.closest("button");

            if (e.key === "/" && !inInput) {
                e.preventDefault();
                searchInputRef.current?.focus();
                return;
            }
            if (e.key === "Escape") {
                if (query) {
                    setQuery("");
                    return;
                }
                if (!v.running) {
                    e.preventDefault();
                    useGraphStore.getState().setValidationOpen(false);
                }
                return;
            }
            if (inInput || onButton) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, flatIds.length - 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && activeIdx >= 0) {
                const id = flatIds[activeIdx];
                if (id) toggleExpanded(id);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, query, flatIds, activeIdx, v.running]);

    // Scroll active
    useEffect(() => {
        if (activeIdx < 0 || !listRef.current) return;
        const id = flatIds[activeIdx];
        if (!id) return;
        const el = listRef.current.querySelector(
            `[data-domain-id="${CSS.escape(id)}"]`,
        ) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest" });
    }, [activeIdx, flatIds]);

    // Reset on close
    useEffect(() => {
        if (open) return;
        setQuery("");
        setActiveIdx(-1);
    }, [open]);

    if (!open) return null;

    const pct =
        v.progress.total > 0
            ? Math.round((v.progress.current / v.progress.total) * 100)
            : 0;
    const total = effectiveStats?.total ?? v.progress.total;
    const processed = effectiveStats?.processed ?? v.progress.current;

    const scopeCount =
        scope === "visible"
            ? props.visibleDomains.length
            : scope === "bookmarked"
                ? props.bookmarkedDomains.length
                : props.allDomains.length;

    const scopeOption = (
        value: "all" | "visible" | "bookmarked",
        label: string,
        count: number,
    ) => (
        <label
            className={
                "validation-scope__option" +
                (scope === value ? " active" : "") +
                (v.running ? " validation-scope__option--disabled" : "")
            }
        >
            <input
                type="radio"
                checked={scope === value}
                onChange={() => setScope(value)}
                disabled={v.running}
            />
            <span className="validation-scope__radio" />
            <span className="validation-scope__text">{label}</span>
            <span className="validation-scope__count">{count}</span>
        </label>
    );

    return (
        <div
            className="help-overlay"
            onMouseDown={() => {
                if (!v.running) {
                    useGraphStore.getState().setValidationOpen(false);
                    v.reset();
                }
            }}
        >
            <div
                className="help-modal validation-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="cloud_upload" size="sm" />
                        <span className="icon-label">Массовая валидация доменов</span>
                        {effectiveStats && (
                            <span className="help-modal__badge">
                                {effectiveStats.processed} / {effectiveStats.total}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        {isDone && (
                            <>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportJSON}
                                    title="Экспорт JSON"
                                >
                                    <MIcon name="data_object" />
                                </button>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportCSV}
                                    title="Экспорт CSV"
                                >
                                    <MIcon name="table_view" />
                                </button>
                                <button
                                    className="help-modal__icon-btn"
                                    onClick={exportMD}
                                    title="Экспорт Markdown"
                                >
                                    <MIcon name="description" />
                                </button>
                            </>
                        )}
                        <button
                            className="help-modal__close"
                            onClick={() => {
                                if (v.running) v.stop();
                                else {
                                    useGraphStore.getState().setValidationOpen(false);
                                    v.reset();
                                }
                            }}
                            title={v.running ? "Остановить валидацию" : "Закрыть"}
                        >
                            {v.running ? "■" : "✕"}
                        </button>
                    </div>
                </div>

                <div className="validation-modal__body">
                    {/* ─── Scope (setup) ─── */}
                    {!v.started && (
                        <div className="validation-scope">
                            <div className="validation-scope__label">
                                Область валидации
                            </div>
                            {scopeOption(
                                "all",
                                "Все домены в кэше",
                                props.allDomains.length,
                            )}
                            {scopeOption(
                                "visible",
                                "Только видимые (после фильтров)",
                                props.visibleDomains.length,
                            )}
                            {scopeOption(
                                "bookmarked",
                                "Только избранные",
                                props.bookmarkedDomains.length,
                            )}
                            <button
                                className="btn btn--primary"
                                onClick={startValidation}
                                disabled={scopeCount === 0}
                                style={{
                                    marginTop: 16,
                                    width: "100%",
                                    justifyContent: "center",
                                }}
                            >
                                <MIcon name="play_arrow" size="sm" />
                                <span style={{ marginLeft: 6 }}>
                                    {scopeCount === 0
                                        ? "Нет доменов в области"
                                        : `Запустить валидацию (${scopeCount})`}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* ─── Progress + KPI + list (started) ─── */}
                    {v.started && (
                        <>
                            {/* Progress */}
                            <div className="validation-progress">
                                <div className="validation-progress__head">
                                    <span className="validation-progress__label">
                                        {v.running
                                            ? "Валидация…"
                                            : v.cancelled
                                                ? "Остановлено"
                                                : "Завершено"}
                                    </span>
                                    <span className="validation-progress__counter">
                                        {processed} / {total} ({pct}%)
                                    </span>
                                    <span className="validation-progress__time">
                                        ⏱ {formatDuration(elapsedMs)}
                                        {eta != null && (
                                            <span style={{ opacity: 0.75 }}>
                                                {" · осталось ~"}
                                                {formatDuration(eta)}
                                            </span>
                                        )}
                                    </span>
                                </div>
                                <div className="validation-progress__bar">
                                    <div
                                        className={
                                            "validation-progress__fill" +
                                            (!v.running
                                                ? v.cancelled
                                                    ? " validation-progress__fill--warn"
                                                    : " validation-progress__fill--done"
                                                : "")
                                        }
                                        style={{ width: pct + "%" }}
                                    />
                                </div>
                            </div>

                            {/* KPI dashboard */}
                            {effectiveStats && (
                                <div className="validation-kpi">
                                    <Donut
                                        size={96}
                                        thickness={12}
                                        center={pct + "%"}
                                        sub="прогресс"
                                        segments={[
                                            {
                                                value: effectiveStats.valid,
                                                color: "var(--success)",
                                                label: "Валидные",
                                            },
                                            {
                                                value: effectiveStats.invalid,
                                                color: "var(--danger)",
                                                label: "Невалидные",
                                            },
                                            {
                                                value: effectiveStats.errors,
                                                color: "var(--warning)",
                                                label: "Ошибки",
                                            },
                                            {
                                                value:
                                                    effectiveStats.total -
                                                    effectiveStats.processed,
                                                color: "var(--bg-600)",
                                                label: "Ожидают",
                                            },
                                        ]}
                                    />
                                    <div className="validation-kpi__cards">
                                        <KpiCard
                                            icon="check_circle"
                                            tone="ok"
                                            label="Валидные"
                                            value={effectiveStats.valid}
                                            onClick={() =>
                                                setFilter(
                                                    filter === "valid" ? "all" : "valid",
                                                )
                                            }
                                        />
                                        <KpiCard
                                            icon="cancel"
                                            tone="err"
                                            label="Невалидные"
                                            value={effectiveStats.invalid}
                                            onClick={() =>
                                                setFilter(
                                                    filter === "invalid" ? "all" : "invalid",
                                                )
                                            }
                                        />
                                        <KpiCard
                                            icon="warning"
                                            tone="warn"
                                            label="Ошибки"
                                            value={effectiveStats.errors}
                                            onClick={() =>
                                                setFilter(
                                                    filter === "errors" ? "all" : "errors",
                                                )
                                            }
                                        />
                                        <KpiCard
                                            icon="timelapse"
                                            tone="info"
                                            label="Время"
                                            value={formatDuration(
                                                effectiveStats.elapsedMs,
                                            )}
                                            sub={plural(
                                                effectiveStats.processed,
                                                "домен",
                                                "доменов",
                                            )}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Toolbar: chips + search + sort + group + expand/collapse */}
                            <div className="validation-toolbar">
                                <div className="validation-toolbar__chips">
                                    {(
                                        [
                                            "problems",
                                            "all",
                                            "invalid",
                                            "errors",
                                            "valid",
                                        ] as const
                                    ).map((f) => {
                                        const labels: Record<string, string> = {
                                            problems: "Проблемные",
                                            all: "Все",
                                            invalid: "Невалидные",
                                            errors: "Ошибки",
                                            valid: "Валидные",
                                        };
                                        return (
                                            <button
                                                key={f}
                                                className={
                                                    "validation-filter" +
                                                    (filter === f
                                                        ? " validation-filter--active"
                                                        : "")
                                                }
                                                onClick={() => setFilter(f)}
                                            >
                                                {labels[f]}
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="validation-toolbar__right">
                                    <div className="validation-search">
                                        <MIcon name="search" size="sm" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder="Поиск по домену… (/)"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            spellCheck={false}
                                        />
                                        {query && (
                                            <button
                                                className="validation-search__clear"
                                                onClick={() => setQuery("")}
                                                title="Очистить"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    <select
                                        className="validation-select"
                                        value={sortBy}
                                        onChange={(e) =>
                                            setSortBy(e.target.value as SortBy)
                                        }
                                        title="Сортировка"
                                    >
                                        <option value="severity">По severity</option>
                                        <option value="diagnostics">
                                            По числу проблем
                                        </option>
                                        <option value="name">По имени</option>
                                    </select>
                                    <select
                                        className="validation-select"
                                        value={groupBy}
                                        onChange={(e) =>
                                            setGroupBy(e.target.value as GroupBy)
                                        }
                                        title="Группировка"
                                    >
                                        <option value="none">Без группировки</option>
                                        <option value="status">По статусу</option>
                                    </select>
                                    <button
                                        className="btn btn--icon btn--small"
                                        onClick={expandAll}
                                        title="Развернуть всё"
                                    >
                                        <MIcon name="unfold_more" size="sm" />
                                    </button>
                                    <button
                                        className="btn btn--icon btn--small"
                                        onClick={collapseAll}
                                        title="Свернуть всё"
                                    >
                                        <MIcon name="unfold_less" size="sm" />
                                    </button>
                                </div>
                            </div>

                            {/* Logs */}
                            <div className="validation-logs" ref={listRef}>
                                {filteredLogs.length === 0 ? (
                                    <div className="validation-logs__empty">
                                        {v.logs.length === 0 && v.running
                                            ? "Валидация запущена…"
                                            : "Нет записей по фильтру"}
                                    </div>
                                ) : (
                                    grouped.map((group) => (
                                        <div key={group.key} className="validation-group">
                                            {group.label && (
                                                <div className="validation-group__head">
                                                    <MIcon name={group.icon} size="sm" />
                                                    <span className="validation-group__title">
                                                        {group.label}
                                                    </span>
                                                    <span className="validation-group__count">
                                                        {group.logs.length}
                                                    </span>
                                                    <button
                                                        className="validation-group__copy"
                                                        onClick={() =>
                                                            copyDomainIds(group.logs)
                                                        }
                                                        title="Копировать ID доменов"
                                                    >
                                                        <MIcon
                                                            name="content_copy"
                                                            size="sm"
                                                        />
                                                    </button>
                                                </div>
                                            )}
                                            {group.logs.map((log) => (
                                                <LogRow
                                                    key={log.domainId}
                                                    log={log}
                                                    isExpanded={expanded.has(log.domainId)}
                                                    isActive={
                                                        flatIds[activeIdx] ===
                                                        log.domainId
                                                    }
                                                    onToggle={() =>
                                                        toggleExpanded(log.domainId)
                                                    }
                                                    onHover={() =>
                                                        setActiveIdx(
                                                            flatIds.indexOf(
                                                                log.domainId,
                                                            ),
                                                        )
                                                    }
                                                    onCopy={() => copyDiagnostics(log)}
                                                    onOpenYaml={() =>
                                                        openYamlForDomain(log.domainId)
                                                    }
                                                    onOpenDiagnostic={(d) =>
                                                        openDiagnostic(log.domainId, d)
                                                    }
                                                    onGoto={() => {
                                                        goto(log.domainId);
                                                        useGraphStore
                                                            .getState()
                                                            .setValidationOpen(false);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {v.started && effectiveStats && (
                    <div className="validation-footer">
                        <div className="validation-stats">
                            <span className="validation-stat validation-stat--ok">
                                ✅ {effectiveStats.valid}
                            </span>
                            <span className="validation-stat validation-stat--err">
                                ❌ {effectiveStats.invalid}
                            </span>
                            <span className="validation-stat validation-stat--warn">
                                ⚠️ {effectiveStats.errors}
                            </span>
                            <span className="validation-stat">
                                ⏱ {formatDuration(effectiveStats.elapsedMs)}
                            </span>
                            {filteredLogs.length !== v.logs.length && (
                                <span
                                    className="validation-stat"
                                    style={{ opacity: 0.7 }}
                                    title="Скрыто фильтром"
                                >
                                    показано {filteredLogs.length} / {v.logs.length}
                                </span>
                            )}
                        </div>
                        <div className="validation-footer__actions">
                            {isDone && failedDomains.length > 0 && (
                                <button
                                    className="btn"
                                    onClick={retryFailed}
                                    title={`Перепроверить ${failedDomains.length} невалидных/ошибочных доменов (текущие результаты этих доменов будут заменены)`}
                                >
                                    <MIcon name="refresh" size="sm" />
                                    <span>Перепроверить ({failedDomains.length})</span>
                                </button>
                            )}
                            {isDone && failedDomains.length > 0 && (
                                <button
                                    className="btn btn--icon"
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(
                                                failedDomains.join("\n"),
                                            );
                                            useGraphStore
                                                .getState()
                                                .showSnackbar(
                                                    `Скопировано: ${failedDomains.length}`,
                                                );
                                        } catch { /* ignore */ }
                                    }}
                                    title="Копировать ID невалидных доменов"
                                >
                                    <MIcon name="content_copy" size="sm" />
                                </button>
                            )}
                            <button
                                className="btn"
                                onClick={() => {
                                    useGraphStore
                                        .getState()
                                        .setValidationOpen(false);
                                    v.reset();
                                }}
                                disabled={v.running}
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

// ============ LogRow ============

interface LogRowProps {
    log: ValidationRecord;
    isExpanded: boolean;
    isActive: boolean;
    onToggle: () => void;
    onHover: () => void;
    onCopy: () => void;
    onOpenYaml: () => void;
    onOpenDiagnostic: (d: ValidationDiagnostic) => void;
    onGoto: () => void;
}

function LogRow({
    log,
    isExpanded,
    isActive,
    onToggle,
    onHover,
    onCopy,
    onOpenYaml,
    onOpenDiagnostic,
    onGoto,
}: LogRowProps) {
    const icon =
        log.status === "valid"
            ? "✅"
            : log.status === "invalid"
                ? "❌"
                : log.status === "skip"
                    ? "⏭"
                    : "⚠️";
    const hasDiag =
        log.status === "invalid" && !!log.diagnostics && log.diagnostics.length > 0;
    const ds = diagStats(log.diagnostics);

    return (
        <div
            data-domain-id={log.domainId}
            className={
                "validation-log validation-log--" +
                log.status +
                (isExpanded ? " validation-log--open" : "") +
                (isActive ? " validation-log--active" : "")
            }
            onMouseEnter={onHover}
        >
            <div
                className={
                    "validation-log__head" +
                    (hasDiag ? " validation-log__head--clickable" : "")
                }
                onClick={hasDiag ? onToggle : undefined}
            >
                {hasDiag && (
                    <span className="validation-log__chevron">
                        {isExpanded ? "▾" : "▸"}
                    </span>
                )}
                <span className="validation-log__icon">{icon}</span>
                <button
                    type="button"
                    className="validation-log__domain"
                    onClick={(e) => {
                        e.stopPropagation();
                        onGoto();
                    }}
                    title="Перейти к домену на графе"
                >
                    {log.domainId}
                </button>

                {ds.total > 0 && (
                    <span className="validation-log__severity">
                        {ds.error > 0 && (
                            <span className="validation-log__sev validation-log__sev--err">
                                {ds.error}E
                            </span>
                        )}
                        {ds.warning > 0 && (
                            <span className="validation-log__sev validation-log__sev--warn">
                                {ds.warning}W
                            </span>
                        )}
                        {ds.info > 0 && (
                            <span className="validation-log__sev validation-log__sev--info">
                                {ds.info}I
                            </span>
                        )}
                    </span>
                )}

                {log.error && (
                    <span className="validation-log__error">{log.error}</span>
                )}

                {hasDiag && !isExpanded && (
                    <span className="validation-log__hint">
                        {ds.total} {plural(ds.total, "проблема", "проблем")}
                    </span>
                )}

                <div className="validation-log__actions">
                    <button
                        className="validation-log__action"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenYaml();
                        }}
                        title="Открыть файл в редакторе"
                    >
                        <MIcon name="description" size="sm" />
                    </button>
                    {(hasDiag || log.error) && (
                        <button
                            className="validation-log__action"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCopy();
                            }}
                            title="Скопировать диагностику"
                        >
                            <MIcon name="content_copy" size="sm" />
                        </button>
                    )}
                </div>
            </div>

            {isExpanded && hasDiag && (
                <div className="validation-log__diag">
                    {log.diagnostics!.map((d, di) => (
                        <div
                            key={di}
                            className={
                                "validation-diag validation-diag--" +
                                d.severity.toLowerCase()
                            }
                        >
                            <div className="validation-diag__head">
                                <span className="validation-diag__severity">
                                    {d.severity}
                                </span>
                                {d.labels?.[0]?.span && (
                                    <button
                                        className="validation-diag__open"
                                        onClick={() => onOpenDiagnostic(d)}
                                        title="Открыть в редакторе на этой позиции"
                                    >
                                        <MIcon name="open_in_new" size="sm" />
                                    </button>
                                )}
                            </div>
                            <div className="validation-diag__message">{d.message}</div>
                            {d.labels &&
                                d.labels.map((lb, li) => (
                                    <div key={li} className="validation-diag__label">
                                        {lb.message}
                                        {lb.span && (
                                            <span className="validation-diag__span">
                                                {" [" + lb.span.start + "-" + lb.span.end + "]"}
                                            </span>
                                        )}
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}