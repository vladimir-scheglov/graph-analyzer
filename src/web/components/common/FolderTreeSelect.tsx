import React, {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { MIcon } from "./MIcon";

export interface FolderNode {
    id: string;
    name: string;
    parentFolderId: string | null;
}

interface TreeNode extends FolderNode {
    children: TreeNode[];
    depth: number;
}

export interface FolderTreeSelectProps {
    value: string;
    onChange: (id: string, name: string) => void;
    folders: FolderNode[];
    placeholder?: string;
    disabled?: boolean;
}

const DROPDOWN_MAX_HEIGHT = 360;
const DROPDOWN_MIN_HEIGHT = 160;
const VIEWPORT_MARGIN = 8;
const DROPDOWN_WIDTH_MIN = 320;

function buildTree(folders: FolderNode[]): TreeNode[] {
    const byId = new Map<string, TreeNode>();
    for (const f of folders) byId.set(f.id, { ...f, children: [], depth: 0 });

    const roots: TreeNode[] = [];
    for (const f of folders) {
        const node = byId.get(f.id)!;
        if (f.parentFolderId && byId.has(f.parentFolderId)) {
            byId.get(f.parentFolderId)!.children.push(node);
        } else {
            roots.push(node);
        }
    }
    const sort = (nodes: TreeNode[], depth: number) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name));
        for (const n of nodes) {
            n.depth = depth;
            sort(n.children, depth + 1);
        }
    };
    sort(roots, 0);
    return roots;
}

function flattenVisible(
    nodes: TreeNode[],
    expanded: Set<string>,
    filter: string,
): TreeNode[] {
    const out: TreeNode[] = [];
    const q = filter.trim().toLowerCase();

    const matches = (n: TreeNode): boolean => {
        if (!q) return true;
        if (n.name.toLowerCase().includes(q)) return true;
        return n.children.some(matches);
    };

    const walk = (list: TreeNode[]) => {
        for (const n of list) {
            if (!matches(n)) continue;
            out.push(n);
            const isExpanded = q ? true : expanded.has(n.id);
            if (isExpanded && n.children.length > 0) walk(n.children);
        }
    };
    walk(nodes);
    return out;
}

export function FolderTreeSelect({
    value,
    onChange,
    folders,
    placeholder = "Выберите папку",
    disabled = false,
}: FolderTreeSelectProps) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState("");
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const triggerRef = useRef<HTMLButtonElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [pos, setPos] = useState<{
        left: number;
        top: number;
        width: number;
        maxHeight: number;
    } | null>(null);

    const tree = useMemo(() => buildTree(folders), [folders]);
    const flat = useMemo(
        () => flattenVisible(tree, expanded, filter),
        [tree, expanded, filter],
    );

    const current = useMemo(
        () => folders.find((f) => f.id === value) || null,
        [folders, value],
    );

    const currentPath = useMemo(() => {
        if (!current) return "";
        const byId = new Map(folders.map((f) => [f.id, f]));
        const parts: string[] = [];
        let cur: FolderNode | undefined = current;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
            seen.add(cur.id);
            parts.unshift(cur.name);
            cur = cur.parentFolderId
                ? byId.get(cur.parentFolderId)
                : undefined;
        }
        return parts.join(" / ");
    }, [current, folders]);

    const computePosition = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const vh = window.innerHeight;
        const vw = window.innerWidth;

        const width = Math.max(rect.width, DROPDOWN_WIDTH_MIN);
        let left = rect.left;
        if (left + width > vw - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN);
        }

        const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
        const spaceAbove = rect.top - VIEWPORT_MARGIN;

        let top: number;
        let maxHeight: number;
        if (spaceBelow >= DROPDOWN_MIN_HEIGHT || spaceBelow >= spaceAbove) {
            top = rect.bottom + 4;
            maxHeight = Math.min(
                DROPDOWN_MAX_HEIGHT,
                Math.max(DROPDOWN_MIN_HEIGHT, spaceBelow),
            );
        } else {
            maxHeight = Math.min(
                DROPDOWN_MAX_HEIGHT,
                Math.max(DROPDOWN_MIN_HEIGHT, spaceAbove),
            );
            top = rect.top - maxHeight - 4;
        }
        setPos({ left, top, width, maxHeight });
    };

    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        computePosition();
        const onScroll = () => computePosition();
        const onResize = () => computePosition();
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [open]);

    // На открытии — раскрыть предков текущего значения
    useEffect(() => {
        if (!open) return;
        setFilter("");
        setTimeout(() => inputRef.current?.focus(), 30);
        if (!value) {
            setExpanded(new Set());
            return;
        }
        const byId = new Map(folders.map((f) => [f.id, f]));
        const next = new Set<string>();
        let cur = byId.get(value);
        const seen = new Set<string>();
        while (cur && cur.parentFolderId && !seen.has(cur.parentFolderId)) {
            seen.add(cur.id);
            next.add(cur.parentFolderId);
            cur = byId.get(cur.parentFolderId);
        }
        setExpanded(next);
    }, [open, value, folders]);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (wrapRef.current?.contains(target)) return;
            if (dropdownRef.current?.contains(target)) return;
            setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const commit = (folder: FolderNode) => {
        onChange(folder.id, folder.name);
        setOpen(false);
    };

    return (
        <div className="folder-tree-select" ref={wrapRef}>
            <button
                ref={triggerRef}
                type="button"
                className={
                    "folder-tree-select__trigger" + (open ? " open" : "")
                }
                onClick={() => !disabled && setOpen(!open)}
                disabled={disabled}
                title={currentPath || placeholder}
            >
                <MIcon name="folder" size="sm" />
                <span className="folder-tree-select__trigger-text">
                    {currentPath || placeholder}
                </span>
                <MIcon
                    name={open ? "expand_less" : "expand_more"}
                    size="sm"
                />
            </button>

            {open && pos && createPortal(
                <div
                    ref={dropdownRef}
                    className="folder-tree-select__dropdown"
                    style={{
                        position: "fixed",
                        left: pos.left,
                        top: pos.top,
                        width: pos.width,
                        maxHeight: pos.maxHeight,
                        zIndex: 10000,
                    }}
                >
                    <div className="folder-tree-select__search">
                        <MIcon name="search" size="sm" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Поиск папки..."
                            spellCheck={false}
                            autoComplete="off"
                        />
                        {filter && (
                            <button
                                type="button"
                                className="folder-tree-select__clear"
                                onClick={() => {
                                    setFilter("");
                                    inputRef.current?.focus();
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div className="folder-tree-select__list">
                        {flat.length === 0 ? (
                            <div className="folder-tree-select__empty">
                                {filter ? "Ничего не найдено" : "Нет папок"}
                            </div>
                        ) : (
                            flat.map((node) => {
                                const hasChildren = node.children.length > 0;
                                const isExpanded = filter
                                    ? true
                                    : expanded.has(node.id);
                                const isSelected = node.id === value;
                                const isMatch =
                                    !!filter &&
                                    node.name
                                        .toLowerCase()
                                        .includes(filter.toLowerCase());
                                return (
                                    <div
                                        key={node.id}
                                        className={
                                            "folder-tree-select__item" +
                                            (isSelected
                                                ? " folder-tree-select__item--selected"
                                                : "") +
                                            (isMatch
                                                ? " folder-tree-select__item--match"
                                                : "")
                                        }
                                        style={{
                                            paddingLeft: 6 + node.depth * 16,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            className="folder-tree-select__chevron"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (hasChildren)
                                                    toggleExpand(node.id);
                                            }}
                                            disabled={!hasChildren}
                                        >
                                            {hasChildren ? (
                                                <MIcon
                                                    name={
                                                        isExpanded
                                                            ? "expand_more"
                                                            : "chevron_right"
                                                    }
                                                    size="sm"
                                                />
                                            ) : (
                                                <span className="folder-tree-select__chevron-spacer" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            className="folder-tree-select__label"
                                            onClick={() => commit(node)}
                                        >
                                            <MIcon
                                                name={
                                                    hasChildren
                                                        ? isExpanded
                                                            ? "folder_open"
                                                            : "folder"
                                                        : "insert_drive_file"
                                                }
                                                size="sm"
                                            />
                                            <span>{node.name}</span>
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}