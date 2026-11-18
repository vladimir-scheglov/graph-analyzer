import { create } from "zustand";
import { YamlDocument } from "../yaml/document";
import { parseDomainSchema, type ParsedDomain } from "../yaml/parser";
import type { DomainSchema, ElementKey, PathMap } from "../types";
import type { ModelIndexLike } from "../resolver/ref-resolver";
import { RefResolver } from "../resolver/ref-resolver";
import { InheritanceResolver } from "../resolver/inheritance";
import { MixinResolver } from "../resolver/mixins";

// ============ Снимок ============

export interface Snapshot {
  /** YAML-текст (источник истины). */
  yaml: string;
  /** Выделенный элемент (для restore selection после undo). */
  selectionKey: ElementKey | null;
  /** Timestamp — для UI. */
  ts: number;
}

const HISTORY_LIMIT = 50;

const EMPTY_SCHEMA: DomainSchema = {
  metadata: { id: "", type: "domain", version: "0.0.0", name: "" },
  metadataPath: [],
  entities: [],
  dataTypes: [],
  sequences: [],
  counterColorPatterns: [],
  linkages: [],
  trees: [],
  transitiveLinkages: [],
  actions: [],
  views: [],
  menus: [],
  medias: [],
  dataRules: [],
  uiRules: [],
  uiPresets: [],
  mixins: [],
  exchangeSettings: undefined,
};

// ============ Store ============

export interface EditorStore {
  // ---------- Состояние ----------
  initialized: boolean;
  doc: YamlDocument;
  schema: DomainSchema;
  pathMap: PathMap;
  structuralErrors: ParsedDomain["structuralErrors"];

  modelIndex: ModelIndexLike;
  isPublished: boolean;

  /** id выделенного элемента (entity:..., attribute:..., linkage:...). */
  selectionKey: ElementKey | null;
  /** id открытой вкладки. */
  activeTab: string;

  // ---------- Undo/Redo ----------
  undoStack: Snapshot[];
  redoStack: Snapshot[];
  /** Последний сохранённый yaml (для dirty-check). */
  lastCommittedYaml: string;
  onYamlChange?: (yaml: string) => void;
  commit: (fn: (doc: YamlDocument) => string | void) => void;

  // ---------- Actions ----------
  init: (args: InitArgs) => void;
  /** Изменить yaml (вызывается из DomainConstructor после commit). */
  applyYaml: (yaml: string, opts?: { pushHistory?: boolean }) => void;
  /** Отменить последнее изменение. */
  undo: () => void;
  /** Повторить отменённое. */
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /** Выделение. */
  select: (key: ElementKey | null) => void;
  setActiveTab: (tab: string) => void;

  /** Пере-парсинг после удаления из seq (pathMap сдвигается). */
  reparse: () => void;

  /** Резолверы (создаются лениво). */
  refResolver: () => RefResolver;
  inheritanceResolver: () => InheritanceResolver;
  mixinResolver: () => MixinResolver;
}

interface InitArgs {
  yaml: string;
  modelIndex: ModelIndexLike;
  isPublished?: boolean;
  initialTab?: string;
  onYamlChange?: (yaml: string) => void;
}

// Кэш резолверов — по modelIndex.generatedAt (пересоздаются, когда ModelIndex обновится).
let resolverCache: {
  ref: RefResolver;
  inh: InheritanceResolver;
  mix: MixinResolver;
  modelIndexGeneratedAt: string;
} | null = null;

function getResolvers(modelIndex: ModelIndexLike) {
  if (
    resolverCache &&
    resolverCache.modelIndexGeneratedAt === modelIndex.generatedAt
  ) {
    return resolverCache;
  }
  resolverCache = {
    ref: new RefResolver(modelIndex),
    inh: new InheritanceResolver(modelIndex),
    mix: new MixinResolver(modelIndex),
    modelIndexGeneratedAt: modelIndex.generatedAt,
  };
  return resolverCache;
}

// ============ Store ============

export const useEditorStore = create<EditorStore>((set, get) => ({
  initialized: false,
  doc: new YamlDocument(""),
  schema: EMPTY_SCHEMA,
  pathMap: new Map(),
  structuralErrors: [],
  modelIndex: {
    generatedAt: "",
    domains: [],
    entitiesByFqid: {},
    entityChildrenByFqid: {},
    mixinsByEntityFqid: {},
    entityLinkages: [],
    dataTypes: [],
    actionsById: {},
    viewElementsByDomain: {},
    schemasByDomain: {},
    viewWidgets: [],
    viewGroups: [],
  },
  isPublished: false,
  selectionKey: null,
  activeTab: "entities",
  undoStack: [],
  redoStack: [],
  lastCommittedYaml: "",

  init: ({
    yaml,
    modelIndex,
    isPublished = false,
    initialTab,
    onYamlChange,
  }) => {
    const doc = new YamlDocument(yaml);
    const parsed = parseDomainSchema(doc);
    set({
      initialized: true,
      doc,
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
      modelIndex,
      isPublished,
      selectionKey: null,
      activeTab: initialTab ?? "entities",
      undoStack: [],
      redoStack: [],
      lastCommittedYaml: yaml,
      onYamlChange,
    });
  },

  commit: (fn) => {
    const { doc, undoStack, selectionKey, onYamlChange } = get();
    const before = doc.toString();
    const result = fn(doc);
    const after = typeof result === "string" ? result : doc.toString();
    if (after === before) return;

    const newUndo = [
      ...undoStack,
      { yaml: before, selectionKey, ts: Date.now() },
    ].slice(-HISTORY_LIMIT);

    // doc уже мутирован — пересобираем schema/pathMap из него.
    const parsed = parseDomainSchema(doc);
    set({
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
      undoStack: newUndo,
      redoStack: [],
    });
    onYamlChange?.(after);
  },

  applyYaml: (yaml, opts) => {
    const { undoStack, selectionKey, doc, modelIndex } = get();
    const pushHistory = opts?.pushHistory ?? true;

    // Если это первое изменение — кладём «начальный» снимок в undoStack.
    const stack = pushHistory
      ? [
          ...undoStack,
          { yaml: doc.toString(), selectionKey, ts: Date.now() },
        ].slice(-HISTORY_LIMIT)
      : undoStack;

    const newDoc = new YamlDocument(yaml);
    const parsed = parseDomainSchema(newDoc);

    set({
      doc: newDoc,
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
      modelIndex,
      undoStack: stack,
      redoStack: pushHistory ? [] : get().redoStack,
    });
  },

  undo: () => {
    const { undoStack, doc, selectionKey, redoStack } = get();
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const current: Snapshot = {
      yaml: doc.toString(),
      selectionKey,
      ts: Date.now(),
    };

    const newDoc = new YamlDocument(last.yaml);
    const parsed = parseDomainSchema(newDoc);

    set({
      doc: newDoc,
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
      selectionKey: last.selectionKey,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, current],
    });
  },

  redo: () => {
    const { redoStack, doc, selectionKey, undoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current: Snapshot = {
      yaml: doc.toString(),
      selectionKey,
      ts: Date.now(),
    };

    const newDoc = new YamlDocument(next.yaml);
    const parsed = parseDomainSchema(newDoc);

    set({
      doc: newDoc,
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
      selectionKey: next.selectionKey,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, current].slice(-HISTORY_LIMIT),
    });
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  select: (key) => set({ selectionKey: key }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  reparse: () => {
    const { doc } = get();
    const parsed = parseDomainSchema(doc);
    set({
      schema: parsed.schema,
      pathMap: parsed.pathMap,
      structuralErrors: parsed.structuralErrors,
    });
  },

  refResolver: () => getResolvers(get().modelIndex).ref,
  inheritanceResolver: () => getResolvers(get().modelIndex).inh,
  mixinResolver: () => getResolvers(get().modelIndex).mix,
}));

// ============ Селекторы ============

export const selectIsDirty = (s: EditorStore): boolean =>
  s.doc.toString() !== s.lastCommittedYaml;

export const selectSelectedEntity = (s: EditorStore) => {
  if (!s.selectionKey?.startsWith("entity:")) return null;
  const id = s.selectionKey.slice("entity:".length).split("/")[0];
  return s.schema.entities.find((e) => e.id === id) ?? null;
};

export const selectSelectedLinkage = (s: EditorStore) => {
  if (!s.selectionKey?.startsWith("linkage:")) return null;
  const id = s.selectionKey.slice("linkage:".length);
  return s.schema.linkages.find((l) => l.id === id) ?? null;
};
