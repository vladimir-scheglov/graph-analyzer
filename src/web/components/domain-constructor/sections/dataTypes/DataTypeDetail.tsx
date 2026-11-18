import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { EnumEditor } from './forms/EnumEditor';
import { WorkflowEditor } from './forms/WorkflowEditor';
import { TableEditor } from './forms/TableEditor';

type Tab = 'editor' | 'raw';

export const DataTypeDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const doc = useEditorStore((s) => s.doc);
    const [tab, setTab] = useState<Tab>('editor');

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
            tabs={[
                { key: 'editor', label: 'Редактор' },
                { key: 'raw', label: 'YAML' },
            ]}
            activeTab={tab}
            onTabChange={(k) => setTab(k as Tab)}
        >
            {tab === 'editor' && (
                <>
                    {dt.kind === 'Enum' && <EnumEditor dataType={dt} />}
                    {dt.kind === 'Workflow' && <WorkflowEditor dataType={dt} />}
                    {dt.kind === 'Table' && <TableEditor dataType={dt} />}
                </>
            )}
            {tab === 'raw' && (
                <pre className="dc-dt-raw">
                    {doc.get(['dataTypes',
                        (doc.get(['dataTypes']) as any[]).findIndex((d: any) => d?.id === dt.id)]) ?
                        JSON.stringify(
                            doc.get(['dataTypes', (doc.get(['dataTypes']) as any[]).findIndex((d: any) => d?.id === dt.id)]),
                            null, 2,
                        ) : '—'}
                </pre>
            )}
        </DetailCard>
    );
};