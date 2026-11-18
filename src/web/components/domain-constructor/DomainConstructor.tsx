import { useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { debounce } from './yaml/debounce';
import { useEditorStore } from './store/editor-store';
import { EntitiesSection } from './sections/entities/EntitiesSection';
import { ModelIndexLike } from './resolver/ref-resolver';
import { ModelIndex } from '../../../shared/model-types';
import { DataTypesSection } from './sections/dataTypes/DataTypesSection';
import { SequencesSection } from './sections/sequences/SequencesSection';
import { CounterColorPatternsSection } from './sections/counterColorPatterns/CounterColorPatternsSection';
import { LinkagesSection } from './sections/linkages/LinkagesSection';
import { MenusSection } from './sections/menus/MenusSection';
import { ActionsSection } from './sections/actions/ActionsSection';
import { TransitiveLinkagesSection } from './sections/transitiveLinkages/TransitiveLinkagesSection';
import { ViewsSection } from './sections/views/ViewsSection';
import { DataRulesSection } from './sections/dataRules/DataRulesSection';
import { UiRulesSection } from './sections/uiRules/UiRulesSection';
import { UiPresetsSection } from './sections/uiPresets/UiPresetsSection';
import { TreesSection } from './sections/trees/TreesSection';
import { MixinsSection } from './sections/mixins/MixinsSection';
import { ExchangeSettingsSection } from './sections/exchangeSettings/ExchangeSettingsSection';
import { YamlDocument } from './yaml/document';
import { MetadataModal } from './sections/metadata/MetadataModal';
import { ToastContainer } from './ui/ToastContainer';
import { toast } from './ui/toast';
import { DomainGraph } from './graph/DomainGraph';


// ============ Типы ============

type Mode = 'visual' | 'code';
type ViewMode = 'list' | 'map';

const TABS = [
    { key: 'entities', label: 'Сущности' },
    { key: 'dataTypes', label: 'Расширенные атрибуты' },
    { key: 'linkages', label: 'Связи' },
    { key: 'transitiveLinkages', label: 'Транзитивные связи' },
    { key: 'trees', label: 'Деревья' },
    { key: 'actions', label: 'Действия' },
    { key: 'views', label: 'Формы и представления' },
    { key: 'menus', label: 'Разделы меню' },
    { key: 'dataRules', label: 'Правила данных' },
    { key: 'uiRules', label: 'UI-правила' },
    { key: 'uiPresets', label: 'Пресеты UI' },
    { key: 'mixins', label: 'Примеси' },
    { key: 'sequences', label: 'Последовательности' },
    { key: 'counterColorPatterns', label: 'Цветовые схемы' },
    { key: 'exchangeSettings', label: 'Обмен данными' },
] as const;


type TabKey = (typeof TABS)[number]['key'];

// ============ Основной компонент ============

export interface DomainConstructorProps {
    /** YAML-текст схемы домена. */
    yaml: string;
    /** Глобальный ModelIndex (статичен до серверного сохранения). */
    modelIndex: ModelIndex;
    /** Колбэк с новым YAML (debounce внутри компонента, 400ms). */
    onChange: (yaml: string) => void;
    /** Схема уже опубликована → блокировки id/порядка и т.д. */
    isPublished?: boolean;
    /** Задержка onChange, мс. По умолчанию 400. */
    debounceMs?: number;
    /** Класс для внешней стилизации корня. */
    className?: string;
    initialTab?: TabKey;
}

export const DomainConstructor: FC<DomainConstructorProps> = ({
    yaml,
    modelIndex,
    onChange,
    isPublished = false,
    debounceMs = 400,
    className,
    initialTab = 'entities',
}) => {
    // ---------- Store ----------
    const schema = useEditorStore((s) => s.schema);
    const doc = useEditorStore((s) => s.doc);
    const structuralErrors = useEditorStore((s) => s.structuralErrors);
    const initialized = useEditorStore((s) => s.initialized);
    const activeTab = useEditorStore((s) => s.activeTab);
    const setActiveTab = useEditorStore((s) => s.setActiveTab);
    const init = useEditorStore((s) => s.init);
    const [metadataOpen, setMetadataOpen] = useState(false);

    // ---------- onChange (debounced) ----------
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const lastEmittedYamlRef = useRef<string | null>(null);

    const emitChange = useMemo(
        () => debounce<string>((v) => {
            lastEmittedYamlRef.current = v;
            onChangeRef.current(v);
        }, debounceMs),
        [debounceMs],
    );

    // ---------- Локальный UI-стейт ---------
    const [viewMode, setViewMode] = useState<ViewMode>('list');

    const undoStack = useEditorStore((s) => s.undoStack);
    const redoStack = useEditorStore((s) => s.redoStack);
    const canUndo = undoStack.length > 0;
    const canRedo = redoStack.length > 0;

    const handleUndo = useCallback(() => {
        if (!canUndo) return;
        emitChange.flush();
        useEditorStore.getState().undo();
        toast.info('Отменено');
    }, [canUndo, emitChange]);

    const handleRedo = useCallback(() => {
        if (!canRedo) return;
        emitChange.flush();
        useEditorStore.getState().redo();
        toast.info('Повторено');
    }, [canRedo, emitChange]);

    // Горячие клавиши
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;

            // Не перехватываем, если фокус в Monaco / input / textarea
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName.toLowerCase();
                if (
                    tag === 'input' ||
                    tag === 'textarea' ||
                    target.isContentEditable ||
                    target.classList.contains('monaco-editor') ||
                    target.closest('.monaco-editor')
                ) {
                    return;
                }
            }

            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleUndo, handleRedo]);

    // ---------- Init ----------
    // Переинициализация — только при смене yaml «снаружи» (не от нашего onChange).
    const initialYamlRef = useRef<string | null>(null);
    const initialModelIndexRef = useRef<string | null>(null);

    useEffect(() => {
        if (!modelIndex?.generatedAt) return;
        const modelKey = modelIndex.generatedAt;
        if (
            initialYamlRef.current === yaml &&
            initialModelIndexRef.current === modelKey
        ) {
            return; // ничего не поменялось
        }

        // ⚠ Если yaml — это наш последний emit, store уже знает состояние.
        // Пересоздавать doc НЕ надо — иначе сломаем !rql-блоки, которые
        // doc.toString() отдал в неидеальном виде.
        if (yaml === lastEmittedYamlRef.current) {
            initialYamlRef.current = yaml;
            initialModelIndexRef.current = modelKey;
            return;
        }

        initialYamlRef.current = yaml;
        initialModelIndexRef.current = modelKey;

        init({
            yaml,
            modelIndex: modelIndex as ModelIndexLike,
            isPublished,
            initialTab,
            onYamlChange: emitChange,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yaml, modelIndex.generatedAt]);

    // ---------- Flush при unmount ----------
    useEffect(() => () => emitChange.flush(), [emitChange]);

    // ---------- Sync activeTab → store ----------
    const handleTabChange = (key: TabKey) => {
        setActiveTab(key);
    };

    // ---------- Errors ----------
    const yamlErrors = doc.errors;
    const allErrors = [
        ...yamlErrors.map((e) => ({
            kind: 'yaml' as const,
            message: `Строка ${e.line}, колонка ${e.col}: ${e.message}`,
        })),
        ...structuralErrors.map((e) => ({
            kind: 'structural' as const,
            message: `${e.key}: ${e.message}`,
        })),
    ];

    useEffect(() => {
        if (!initialized) return;
        const roundTrip = new YamlDocument(doc.toString());
        console.log('[round-trip errors]', roundTrip.errors);
        // и сравнить фрагмент с !rql:
        const idx = doc.toString().indexOf('!rql');
        console.log('[toString sample around !rql]', doc.toString().slice(idx - 50, idx + 200));
    }, [initialized]);

    return (
        <div className={`dc-root ${className ?? ''}`}>
            <Toolbar
                viewMode={viewMode}
                isPublished={isPublished}
                canUndo={canUndo}
                canRedo={canRedo}
                onViewModeChange={setViewMode}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onOpenMetadata={() => setMetadataOpen(true)}
            />

            {initialized && allErrors.length > 0 && (
                <div className="dc-banner dc-banner--error" role="alert">
                    <strong>Ошибки схемы:</strong>
                    <ul>
                        {allErrors.map((e, i) => (
                            <li key={i}>{e.message}</li>
                        ))}
                    </ul>
                </div>
            )}

            {!initialized ? (
                <div className="dc-content">
                    <div className="dc-placeholder">
                        <p>Загрузка схемы…</p>
                    </div>
                </div>
            ) : (
                viewMode === 'map' ? (
                    <div className="dc-content dc-content--map">
                        <DomainGraph />
                    </div>
                ) : (
                    <>
                        <TabBar tab={activeTab as TabKey} onChange={(t) => setActiveTab(t)} />
                        <div className="dc-content dc-content--section">
                            {renderSection(activeTab)}
                        </div>
                    </>
                )
            )}
            <MetadataModal
                open={metadataOpen}
                onClose={() => setMetadataOpen(false)}
            />
            <ToastContainer />
        </div>
    );
};

// ============ Рендер секции по ключу ============

function renderSection(tab: string): React.ReactNode {
    switch (tab) {
        case 'entities': return <EntitiesSection />;
        case 'dataTypes': return <DataTypesSection />;
        case 'linkages': return <LinkagesSection />;
        case 'transitiveLinkages': return <TransitiveLinkagesSection />;
        case 'trees': return <TreesSection />;
        case 'actions': return <ActionsSection />;
        case 'views': return <ViewsSection />;
        case 'menus': return <MenusSection />;
        case 'dataRules': return <DataRulesSection />;
        case 'uiRules': return <UiRulesSection />;
        case 'uiPresets': return <UiPresetsSection />;
        case 'mixins': return <MixinsSection />;
        case 'sequences': return <SequencesSection />;
        case 'counterColorPatterns': return <CounterColorPatternsSection />;
        case 'exchangeSettings': return <ExchangeSettingsSection />;
        default: return null;
    }
}

// ============ Toolbar ============

interface ToolbarProps {
    viewMode: ViewMode;
    isPublished: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onViewModeChange: (v: ViewMode) => void;
    onUndo: () => void;
    onRedo: () => void;
    onOpenMetadata: () => void;
}

const Toolbar: FC<ToolbarProps> = ({
    viewMode, isPublished, canUndo, canRedo,
    onViewModeChange, onUndo, onRedo, onOpenMetadata,
}) => (
    <div className="dc-toolbar">
        <div className="dc-toolbar__group">
            <button
                className={`dc-btn ${viewMode === 'list' ? 'dc-btn--active' : ''}`}
                onClick={() => onViewModeChange('list')}
            >Список</button>
            <button
                className={`dc-btn ${viewMode === 'map' ? 'dc-btn--active' : ''}`}
                onClick={() => onViewModeChange('map')}
            >Карта</button>
        </div>

        <div className="dc-toolbar__spacer" />

        <div className="dc-toolbar__group">
            <button
                type="button"
                className="dc-btn dc-btn--icon"
                onClick={onUndo}
                disabled={!canUndo}
                title="Отменить (Ctrl+Z / ⌘Z)"
            >↶</button>
            <button
                type="button"
                className="dc-btn dc-btn--icon"
                onClick={onRedo}
                disabled={!canRedo}
                title="Повторить (Ctrl+Shift+Z / Ctrl+Y)"
            >↷</button>
        </div>

        <div className="dc-toolbar__group">
            <button className="dc-btn dc-btn--primary">Опубликовать</button>
            <button className="dc-btn">Сохранить</button>
            <button className="dc-btn">Отменить</button>
            <button className="dc-btn" onClick={onOpenMetadata}>
                Настройки метаданных
            </button>
        </div>
    </div>
);

// ============ TabBar ============

interface TabBarProps {
    tab: TabKey;
    onChange: (t: TabKey) => void;
}

const TabBar: FC<TabBarProps> = ({ tab, onChange }) => (
    <div className="dc-tabs" role="tablist">
        {TABS.map((t) => (
            <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={`dc-tab ${tab === t.key ? 'dc-tab--active' : ''}`}
                onClick={() => onChange(t.key)}
            >
                {t.label}
            </button>
        ))}
    </div>
);

export default DomainConstructor;