import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { ListForm } from './ListForm';
import { EntityForm } from './EntityForm';
import { TabsListForm } from './TabsListForm';
import { TreeForm } from './TreeForm';
import { DashboardForm } from './DashboardForm';

export const ViewDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);

    if (!selectionKey?.startsWith('view:')) {
        return <DetailCard title="" empty emptyText="Выберите представление слева" children={null} />;
    }

    const id = selectionKey.slice('view:'.length);
    const view = schema.views.find((v) => v.id === id);

    if (!view) {
        return <DetailCard title="" empty emptyText="Не найдено" children={null} />;
    }

    return (
        <DetailCard
            title={view.label || view.id}
            subtitle={`ID: ${view.id} · ${view.type}`}
            badge={<span className="dc-badge">{view.type}</span>}
        >
            {view.type === 'list' && <ListForm view={view} />}
            {view.type === 'entity' && <EntityForm view={view} />}
            {view.type === 'tabs_list' && <TabsListForm view={view} />}
            {view.type === 'tree' && <TreeForm view={view} />}
            {view.type === 'dashboard' && <DashboardForm view={view} />}
            {view.type === 'dashboard_tree' && (
                <div className="dc-muted dc-constraints__empty">
                    dashboard_tree — в следующем релизе
                </div>
            )}
        </DetailCard>
    );
};