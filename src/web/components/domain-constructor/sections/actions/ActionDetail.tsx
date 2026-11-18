import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { ActionForm } from './ActionForm';

export const ActionDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);

    if (!selectionKey?.startsWith('action:')) {
        return <DetailCard title="" empty emptyText="Выберите действие слева" children={null} />;
    }

    const id = selectionKey.slice('action:'.length);
    const action = schema.actions.find((a) => a.id === id);

    if (!action) {
        return <DetailCard title="" empty emptyText="Действие не найдено" children={null} />;
    }

    return (
        <DetailCard
            title={action.name || action.id}
            subtitle={`ID: ${action.id} · тип: ${action.type}`}
            badge={<span className="dc-badge">{action.type}</span>}
        >
            <ActionForm action={action} />
        </DetailCard>
    );
};