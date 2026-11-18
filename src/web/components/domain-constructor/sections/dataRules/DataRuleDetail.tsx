import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { DataRuleForm } from './DataRuleForm';

export const DataRuleDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);

    if (!selectionKey?.startsWith('dataRule:')) {
        return <DetailCard title="" empty emptyText="Выберите правило слева" children={null} />;
    }

    const id = selectionKey.slice('dataRule:'.length);
    const rule = schema.dataRules.find((r) => r.id === id);
    if (!rule) {
        return <DetailCard title="" empty emptyText="Правило не найдено" children={null} />;
    }

    return (
        <DetailCard
            title={rule.name || rule.id}
            subtitle={`ID: ${rule.id} · target: ${rule.target} · effect: ${rule.effect}`}
        >
            <DataRuleForm rule={rule} />
        </DetailCard>
    );
};