import { type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { EnumForm } from './EnumForm';
import { WorkflowForm } from './WorkflowForm';
import { TableForm } from './TableForm';

export const DataTypeDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);

    if (!selectionKey?.startsWith('dataType:')) {
        return <DetailCard title="" empty emptyText="Выберите тип слева" children={null} />;
    }

    const dtId = selectionKey.slice('dataType:'.length);
    const dt = schema.dataTypes.find((d) => d.id === dtId);

    if (!dt) {
        return <DetailCard title="" empty emptyText={`Тип ${dtId} не найден`} children={null} />;
    }

    return (
        <DetailCard
            title={dt.name || dt.id}
            subtitle={`ID: ${dt.id} · ${dt.kind}`}
            badge={<span className="dc-badge">{dt.kind}</span>}
        >
            {dt.kind === 'Enum' && <EnumForm dataType={dt} />}
            {dt.kind === 'Workflow' && <WorkflowForm dataType={dt} />}
            {dt.kind === 'Table' && <TableForm dataType={dt} />}
        </DetailCard>
    );
};