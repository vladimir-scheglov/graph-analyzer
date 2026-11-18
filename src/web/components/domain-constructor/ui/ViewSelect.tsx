import { useMemo, type FC } from 'react';
import { useEditorStore } from '../store/editor-store';
import { SchemaSelect, type SchemaSelectOption } from './SchemaSelect';

interface Props {
    value: string | null;
    onChange: (v: string | null) => void;
    /** Фильтр по типу view: строка или массив. */
    filterType?: string | string[];
    domainId?: string;
    allowOtherDomains?: boolean;
    placeholder?: string;
    disabled?: boolean;
}

export const ViewSelect: FC<Props> = ({
    value, onChange, filterType, domainId, allowOtherDomains = true, placeholder, disabled,
}) => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);
    const refResolver = useEditorStore((s) => s.refResolver);

    const currentDomainId = (domainId ?? schema.metadata.id).toLowerCase();
    const types = filterType
        ? Array.isArray(filterType) ? filterType : [filterType]
        : null;

    const allowType = (t: string) => !types || types.includes(t);

    const options = useMemo((): SchemaSelectOption[] => {
        const all: SchemaSelectOption[] = [];
        const seen = new Set<string>();

        // Из YAML текущего домена
        for (const v of schema.views) {
            if (!allowType(v.type)) continue;
            const key = `${schema.metadata.id.toLowerCase()}::${v.id}`;
            seen.add(key);
            all.push({
                value: v.id,
                name: v.label ?? v.id,
                id: v.id,
                domain: schema.metadata.id.toLowerCase(),
                hint: v.type,
            });
        }

        // Из ModelIndex других доменов
        if (allowOtherDomains) {
            for (const d of modelIndex.domains) {
                const domain = d.id.toLowerCase();
                if (domain === currentDomainId) continue;
                const views = refResolver().listViewsInDomain(domain);
                for (const v of views) {
                    if (!allowType(v.type)) continue;
                    const key = `${domain}::${v.id}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    all.push({
                        value: `${domain}/${v.id}`,
                        name: v.label ?? v.id,
                        id: v.id,
                        domain,
                        hint: v.type,
                    });
                }
            }
        }

        return all;
    }, [schema.views, modelIndex, currentDomainId, allowOtherDomains, types, refResolver]);

    return (
        <SchemaSelect
            value={value}
            onChange={onChange}
            options={options}
            currentDomainId={currentDomainId}
            placeholder={placeholder ?? '— выберите представление —'}
            disabled={disabled}
        />
    );
};