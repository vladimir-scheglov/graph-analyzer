import { useMemo, type FC } from 'react';
import { useEditorStore } from '../store/editor-store';
import { SchemaSelect, type SchemaSelectOption } from './SchemaSelect';

interface Props {
    value: string | null;
    onChange: (v: string | null) => void;
    domainId?: string;
    allowOtherDomains?: boolean;
    placeholder?: string;
    disabled?: boolean;
    /** Ограничить типы действий. */
    filterTypes?: string[];
}

export const ActionSelect: FC<Props> = ({
    value, onChange, domainId, allowOtherDomains = true, placeholder, disabled, filterTypes,
}) => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const currentDomainId = (domainId ?? schema.metadata.id).toLowerCase();

    const options = useMemo((): SchemaSelectOption[] => {
        const all: SchemaSelectOption[] = [];
        const seen = new Set<string>();

        const allowType = (t: string) => !filterTypes || filterTypes.includes(t);

        // Из YAML
        for (const a of schema.actions) {
            if (!allowType(a.type)) continue;
            const key = `${schema.metadata.id.toLowerCase()}::${a.id}`;
            seen.add(key);
            all.push({
                value: a.id,
                name: a.name ?? '',
                id: a.id,
                domain: schema.metadata.id.toLowerCase(),
                hint: a.type,
            });
        }

        // Из ModelIndex (других доменов)
        const actions = (modelIndex as any).actions as
            | Array<{ id: string; domainId: string; name?: string; type: string }>
            | undefined;
        if (allowOtherDomains && actions) {
            for (const a of actions) {
                if (!allowType(a.type)) continue;
                const domain = a.domainId.toLowerCase();
                const key = `${domain}::${a.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push({
                    value: domain === currentDomainId ? a.id : `${domain}/${a.id}`,
                    name: a.name ?? '',
                    id: a.id,
                    domain,
                    hint: a.type,
                });
            }
        }

        return all;
    }, [schema.actions, modelIndex, currentDomainId, allowOtherDomains, filterTypes]);

    return (
        <SchemaSelect
            value={value}
            onChange={onChange}
            options={options}
            currentDomainId={currentDomainId}
            placeholder={placeholder ?? '— выберите действие —'}
            disabled={disabled}
        />
    );
};