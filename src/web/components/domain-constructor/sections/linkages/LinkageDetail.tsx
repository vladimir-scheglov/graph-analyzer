import { useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { DetailCard } from '../../ui/DetailCard';
import { LinkageMainTab } from './LinkageMainTab';
import { LinkageAttributesTab } from './LinkageAttributesTab';
import { LinkageWidgetsTab } from './LinkageWidgetsTab';

type Tab = 'main' | 'attributes' | 'widgets';

export const LinkageDetail: FC = () => {
    const schema = useEditorStore((s) => s.schema);
    const selectionKey = useEditorStore((s) => s.selectionKey);
    const [tab, setTab] = useState<Tab>('main');

    if (!selectionKey?.startsWith('linkage:')) {
        return <DetailCard title="" empty emptyText="Выберите связь слева" children={null} />;
    }

    const id = selectionKey.slice('linkage:'.length);
    const linkage = schema.linkages.find((l) => l.id === id);

    if (!linkage) {
        return <DetailCard title="" empty emptyText="Связь не найдена" children={null} />;
    }

    return (
        <DetailCard
            title={linkage.name || linkage.id}
            subtitle={`${short(linkage.side1)} → ${short(linkage.side2)} · ${linkage.type}`}
            badge={
                linkage.undirected
                    ? <span className="dc-badge">ненаправленная</span>
                    : undefined
            }
            tabs={[
                { key: 'main', label: 'Основное' },
                { key: 'attributes', label: `Атрибуты (${linkage.attributes?.length ?? 0})` },
                { key: 'widgets', label: 'Виджеты' },
            ]}
            activeTab={tab}
            onTabChange={(k) => setTab(k as Tab)}
        >
            {tab === 'main' && <LinkageMainTab linkage={linkage} />}
            {tab === 'attributes' && <LinkageAttributesTab linkage={linkage} />}
            {tab === 'widgets' && <LinkageWidgetsTab linkage={linkage} />}
        </DetailCard>
    );
};

function short(fqid: string): string {
    const slash = fqid.lastIndexOf('/');
    return slash < 0 ? fqid : fqid.slice(slash + 1);
}