import React from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { openFileInEditor } from '../../lib/open-file';
import { HoverTooltip } from '../common/HoverTooltip';
import { ContextMenu, ContextAction } from '../common/ContextMenu';
import { Toast } from '../common/Toast';
import { Snackbar } from '../common/Snackbar';
import {
    HelpModal,
    HotkeysModal,
    CommandPalette,
    ValidationModal,
    TopoSortModal,
    LearningPathModal,
    TourOverlay,
    EntityHierarchyModal,
    RulesModal,
    EntitiesCatalogModal,
    AttributeFinderModal
} from '../modals';
import type { Command } from '../../lib/commands';
import { EntityMatrixModal } from '../modals/EntityMatrixModal';
import { ModelDiffModal } from '../modals/ModelDiffModal';
import { ModelValidationModal } from '../modals/ModelValidationModal';
import { GlossaryModal } from '../modals/GlossaryModal';
import { EntityGraphModal } from '../modals/EntityGraphModal';
import { DomainSchemaModal } from '../modals/DomainSchemaModal';
import { LintModal } from '../modals/LintModal';
import { AttributeMatrixModal } from '../modals/AttributeMatrixModal';
import { MartinMetricsModal } from '../modals/MartinMetricsModal';
import { DomainCompareModal } from '../modals/DomainCompareModal';
import { PiiModal } from '../modals/PiiModal';
import { YamlViewerModal } from '../modals/YamlViewerModal';


export interface AppModalsProps {
    commands: Command[];
    entities: any[];
    allDomains: Array<{ id: string; domainId: string }>;
    visibleDomains: Array<{ id: string; domainId: string }>;
    bookmarkedDomains: Array<{ id: string; domainId: string }>;
    ruleViolations: any[];
    onStartTour: (path: any) => void;
    onContextAction: (action: ContextAction, nodeId: string) => void;
    remoteInfo: any;
    refreshCommand: string | null;
    toastVisible: boolean;
    onToastClose: () => void;
    showDontShowAgain?: boolean;
    dontShowCacheToast?: boolean;
    onDontShowCacheToastChange?: (checked: boolean) => void;
}

export function AppModals(props: AppModalsProps) {
    const helpOpen = useGraphStore((s) => s.helpOpen);
    const hotkeysOpen = useGraphStore((s) => s.hotkeysOpen);
    const contextMenu = useGraphStore((s) => s.contextMenu);
    const snackbar = useGraphStore((s) => s.snackbar);

    return (
        <>
            <HoverTooltip />

            <CommandPalette
                commands={props.commands}
                onOpenFile={(filePath, fqid) => openFileInEditor(filePath, fqid)}
            />

            <HelpModal
                open={helpOpen}
                onClose={() => useGraphStore.getState().setHelpOpen(false)}
            />
            <HotkeysModal
                open={hotkeysOpen}
                onClose={() => useGraphStore.getState().setHotkeysOpen(false)}
            />

            <ValidationModal
                allDomains={props.allDomains}
                visibleDomains={props.visibleDomains}
                bookmarkedDomains={props.bookmarkedDomains}
            />

            <TopoSortModal
                allDomains={props.allDomains}
                visibleDomains={props.visibleDomains}
                bookmarkedDomains={props.bookmarkedDomains}
            />

            <LearningPathModal
                visibleDomains={props.visibleDomains}
                bookmarkedDomains={props.bookmarkedDomains}
                onStartTour={props.onStartTour}
            />

            <TourOverlay />

            <EntityHierarchyModal entities={props.entities} />

            <RulesModal violations={props.ruleViolations} />

            <ContextMenu
                menu={contextMenu}
                onClose={() => useGraphStore.getState().setContextMenu(null)}
                onAction={props.onContextAction}
            />

            {props.toastVisible && props.remoteInfo?.fromCache && (
                <Toast
                    message={
                        '📦 Граф построен из <b>кэша</b>' +
                        (props.remoteInfo.fetchedAt
                            ? ' (от ' +
                            new Date(props.remoteInfo.fetchedAt).toLocaleString('ru-RU') +
                            ')'
                            : '') +
                        '. Данные могут быть устаревшими.'
                    }
                    actions={
                        props.refreshCommand ? [{ command: props.refreshCommand }] : []
                    }
                    duration={15000}
                    onClose={props.onToastClose}
                    dontShowAgain={
                        props.showDontShowAgain
                            ? {
                                checked: props.dontShowCacheToast || false,
                                onChange:
                                    props.onDontShowCacheToastChange || (() => { }),
                                label: 'Больше не показывать для этого сервера',
                            }
                            : undefined
                    }
                />
            )}

            <Snackbar snackbar={snackbar} />
            <EntityGraphModal />
            <ModelValidationModal />
            <GlossaryModal />
            <ModelDiffModal />
            <EntitiesCatalogModal />
            <AttributeFinderModal />
            <EntityMatrixModal />
            <AttributeMatrixModal />
            <DomainSchemaModal />
            <LintModal /> 
            <MartinMetricsModal />
            <DomainCompareModal />
            <PiiModal />
            <YamlViewerModal />
        </>
    );
}