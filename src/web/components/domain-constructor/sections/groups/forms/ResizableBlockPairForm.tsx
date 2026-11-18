import type { FC } from 'react';
import { useEditorStore } from '../../../store/editor-store';
import { updateGroupLayoutField, updateGroupComponentField } from '../groups-handlers';

interface Props {
    viewId: string;
    group: any;
}

export const ResizableBlockPairForm: FC<Props> = ({ viewId, group }) => {
    const commit = useEditorStore((s) => s.commit);
    const schema = useEditorStore((s) => s.schema);

    const view = schema.views.find((v) => v.id === viewId);
    const allGroups = ((view as any)?.groups ?? []) as any[];
    // Разрешаем ссылаться на block или tabs (не на себя)
    const candidates = allGroups.filter(
        (g) => (g.type === 'block' || g.type === 'tabs') && g.id !== group.id,
    );

    const components = group.components ?? [];
    const left = components[0];
    const right = components[1];

    const layout = group.layout ?? {};
    const sizeRatio = layout.sizeRatio ?? {};

    const setLayout = (field: string, value: unknown) =>
        commit((doc) => updateGroupLayoutField(doc, viewId, group.id, field, value));

    const setSizeRatio = (side: 'left' | 'right', value: number | undefined) => {
        const next: any = { ...sizeRatio };
        if (value === undefined) delete next[side];
        else next[side] = value;
        setLayout('sizeRatio', Object.keys(next).length ? next : undefined);
    };

    const setSection = (index: 0 | 1, id: string) => {
        // Если компонент не создан — создаём пустой { block: '' }
        if (!components[index]) {
            commit((doc) => {
                const vIdx = findViewIdx(doc, viewId);
                if (vIdx < 0) return;
                const gIdx = findGroupIdx(doc, viewId, group.id);
                if (gIdx < 0) return;
                doc.set(['views', vIdx, 'groups', gIdx, 'components', index], { block: id });
            });
        } else {
            commit((doc) => updateGroupComponentField(doc, viewId, group.id, index, 'block', id));
        }
    };

    return (
        <div>
            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Секции</h4>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Левая секция</label>
                    <select
                        className="dc-input"
                        value={left?.block ?? ''}
                        onChange={(e) => setSection(0, e.target.value)}
                    >
                        <option value="">— выберите —</option>
                        {candidates.map((g) => (
                            <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                        ))}
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Правая секция</label>
                    <select
                        className="dc-input"
                        value={right?.block ?? ''}
                        onChange={(e) => setSection(1, e.target.value)}
                    >
                        <option value="">— выберите —</option>
                        {candidates.map((g) => (
                            <option key={g.id} value={g.id}>{g.id} ({g.type})</option>
                        ))}
                    </select>
                </div>
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>Размеры</h4>

            <div className="dc-field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="dc-field">
                    <label className="dc-field__label">sizeRatio.left (%)</label>
                    <input
                        className="dc-input"
                        type="number"
                        value={sizeRatio.left ?? ''}
                        onChange={(e) =>
                            setSizeRatio('left', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                        placeholder="60"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">sizeRatio.right (%)</label>
                    <input
                        className="dc-input"
                        type="number"
                        value={sizeRatio.right ?? ''}
                        onChange={(e) =>
                            setSizeRatio('right', e.target.value === '' ? undefined : Number(e.target.value))
                        }
                        placeholder="40"
                    />
                </div>
            </div>

            <div className="dc-field-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="dc-field">
                    <label className="dc-field__label">minHeight</label>
                    <input
                        className="dc-input"
                        value={layout.minHeight ?? ''}
                        onChange={(e) => setLayout('minHeight', e.target.value || undefined)}
                        placeholder="200px"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">maxHeight</label>
                    <input
                        className="dc-input"
                        value={layout.maxHeight ?? ''}
                        onChange={(e) => setLayout('maxHeight', e.target.value || undefined)}
                        placeholder="800px"
                    />
                </div>
            </div>
        </div>
    );
};

// helpers
function findViewIdx(doc: any, viewId: string): number {
    const arr = doc.get(['views']);
    return Array.isArray(arr) ? arr.findIndex((v: any) => v && v.id === viewId) : -1;
}
function findGroupIdx(doc: any, viewId: string, groupId: string): number {
    const vIdx = findViewIdx(doc, viewId);
    if (vIdx < 0) return -1;
    const gs = doc.get(['views', vIdx, 'groups']);
    return Array.isArray(gs) ? gs.findIndex((g: any) => g && g.id === groupId) : -1;
}