import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { UiRuleForm } from './UiRuleForm';

export const UiRuleDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);

    if (!selectionKey?.startsWith('uiRule:')) {
        return <DetailCard title="" empty emptyText="Выберите правило слева" children={null} />;
    }

    const id = selectionKey.slice('uiRule:'.length);
    const rule = schema.uiRules.find((r) => r.id === id);
    if (!rule) {
        return <DetailCard title="" empty emptyText="Правило не найдено" children={null} />;
    }

    return (
        <DetailCard
            title={rule.name || rule.id}
            subtitle={`ID: ${rule.id} · target: ${rule.target} · view: ${rule.view} · effect: ${rule.effect}`}
        >
            <UiRuleForm rule={rule} />
        </DetailCard>
    );
};