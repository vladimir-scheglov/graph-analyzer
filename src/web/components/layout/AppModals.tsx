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
    RulesModal
} from '../modals';
import type { Command } from '../../lib/commands';

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
}

export function AppModals(props: AppModalsProps) {
    const store = useGraphStore();

    return (
        <>
            <HoverTooltip />

            <CommandPalette
                commands={props.commands}
                onOpenFile={(filePath, fqid) => openFileInEditor(filePath, fqid)}
            />

            <HelpModal
                open={store.helpOpen}
                onClose={() => store.setHelpOpen(false)}
            />
            <HotkeysModal
                open={store.hotkeysOpen}
                onClose={() => store.setHotkeysOpen(false)}
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
                menu={store.contextMenu}
                onClose={() => store.setContextMenu(null)}
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
                />
            )}

            <Snackbar snackbar={store.snackbar} />
        </>
    );
}