import { useMemo, type FC } from 'react';
import { useEditorStore } from '../store/editor-store';
import { SchemaSelect, type SchemaSelectOption } from './SchemaSelect';

interface Props {
    value: string | null;
    onChange: (v: string | null) => void;
    domainId?: string;
    disabled?: boolean;
}

export const SequenceSelect: FC<Props> = ({ value, onChange, domainId, disabled }) => {
    const schema = useEditorStore((s) => s.schema);
    const modelIndex = useEditorStore((s) => s.modelIndex);

    const currentDomainId = (domainId ?? schema.metadata.id).toLowerCase();

    const options = useMemo((): SchemaSelectOption[] => {
        const all: SchemaSelectOption[] = [];
        const seen = new Set<string>();

        for (const s of schema.sequences) {
            seen.add(`${schema.metadata.id.toLowerCase()}::${s.id}`);
            all.push({
                value: s.id,
                name: s.id,
                id: s.id,
                domain: schema.metadata.id.toLowerCase(),
                hint: `start: ${s.startFrom}`,
            });
        }

        const sequences = (modelIndex as any).sequences as
            | Array<{ id: string; domainId: string; startFrom?: number }>
            | undefined;
        if (sequences) {
            for (const s of sequences) {
                const domain = s.domainId.toLowerCase();
                const key = `${domain}::${s.id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                all.push({
                    value: domain === currentDomainId ? s.id : `${domain}/${s.id}`,
                    name: s.id,
                    id: s.id,
                    domain,
                    hint: `start: ${s.startFrom ?? 1}`,
                });
            }
        }

        return all;
    }, [schema.sequences, modelIndex, currentDomainId]);

    return (
        <SchemaSelect
            value={value}
            onChange={onChange}
            options={options}
            currentDomainId={currentDomainId}
            placeholder="— выберите последовательность —"
            disabled={disabled}
        />
    );
};