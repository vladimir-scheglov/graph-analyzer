import { useMemo, type FC } from 'react';
import { useEditorStore } from '../store/editor-store';
import { makeFqid } from '../resolver/ref-resolver';
import { SchemaSelect, type SchemaSelectOption } from './SchemaSelect';

interface Props {
    value: string | null;
    onChange: (v: string | null) => void;
    domainId?: string;
    allowOtherDomains?: boolean;
    placeholder?: string;
    disabled?: boolean;
}

export const EntitySelect: FC<Props> = ({
    value, onChange, domainId, allowOtherDomains = true, placeholder, disabled,
}) => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const refResolver = useEditorStore((s) => s.refResolver);

    const currentDomainId = (domainId ?? schema.metadata.id).toLowerCase();

    const options = useMemo((): SchemaSelectOption[] => {
        const domains = allowOtherDomains
            ? modelIndex.domains.map((d) => d.id.toLowerCase())
            : [currentDomainId];

        const all: SchemaSelectOption[] = [];
        const savedFqids = new Set<string>();

        for (const d of domains) {
            const local = refResolver().listEntitiesInDomain(d);
            for (const e of local) {
                const fqid = makeFqid(d, e.id).toLowerCase();
                savedFqids.add(fqid);
                all.push({
                    value: d === currentDomainId ? e.id : fqid,
                    name: e.name ?? '',
                    id: e.id,
                    domain: d,
                });
            }
        }

        // Локальные из YAML (только что созданные)
        if (allowOtherDomains || currentDomainId === schema.metadata.id.toLowerCase()) {
            for (const entity of schema.entities) {
                const fqid = makeFqid(schema.metadata.id, entity.id).toLowerCase();
                if (savedFqids.has(fqid)) continue;
                all.push({
                    value: currentDomainId === schema.metadata.id.toLowerCase()
                        ? entity.id
                        : fqid,
                    name: entity.name ?? '',
                    id: entity.id,
                    domain: schema.metadata.id.toLowerCase(),
                    unsaved: true,
                });
            }
        }

        return all;
    }, [modelIndex, schema, currentDomainId, allowOtherDomains, refResolver]);

    return (
        <SchemaSelect
            value={value}
            onChange={onChange}
            options={options}
            currentDomainId={currentDomainId}
            placeholder={placeholder ?? '— выберите сущность —'}
            disabled={disabled}
        />
    );
};