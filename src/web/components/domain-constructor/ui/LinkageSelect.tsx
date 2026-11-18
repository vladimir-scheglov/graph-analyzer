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

export const LinkageSelect: FC<Props> = ({
    value, onChange, domainId, allowOtherDomains = true, placeholder, disabled,
}) => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const currentDomainId = (domainId ?? schema.metadata.id).toLowerCase();

    const options = useMemo((): SchemaSelectOption[] => {
        const all: SchemaSelectOption[] = [];
        const seen = new Set<string>();

        // Из YAML (текущий домен)
        for (const l of schema.linkages) {
            const key = `${schema.metadata.id.toLowerCase()}::${l.id}`;
            seen.add(key);
            all.push({
                value: l.id,
                name: l.name ?? '',
                id: l.id,
                domain: schema.metadata.id.toLowerCase(),
                hint: l.type,
            });
        }

        // Из ModelIndex (могут быть связи других доменов)
        const linkages = (modelIndex as any).entityLinkages as
            | Array<{ id: string; domainId: string; name?: string; type: string }>
            | undefined;
        if (allowOtherDomains && linkages) {
            for (const l of linkages) {
                const domain = l.domainId.toLowerCase();
                const key = `${domain}::${l.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push({
                    value: domain === currentDomainId ? l.id : `${domain}/${l.id}`,
                    name: l.name ?? '',
                    id: l.id,
                    domain,
                    hint: l.type,
                });
            }
        }

        return all;
    }, [schema.linkages, modelIndex, currentDomainId, allowOtherDomains]);

    return (
        <SchemaSelect
            value={value}
            onChange={onChange}
            options={options}
            currentDomainId={currentDomainId}
            placeholder={placeholder ?? '— выберите связь —'}
            disabled={disabled}
        />
    );
};