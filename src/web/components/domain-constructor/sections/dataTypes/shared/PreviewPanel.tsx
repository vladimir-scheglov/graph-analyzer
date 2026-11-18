import type { FC } from 'react';
import type { DataTypeSchema } from '../../../types';
import { ValueChip } from './ValueChip';

interface Props {
    dataType: DataTypeSchema;
    enumView?: Array<{ value: string; color?: string }>;
    workflowView?: Array<{ status: string; color?: string }>;
}

export const PreviewPanel: FC<Props> = ({ dataType, enumView, workflowView }) => {
    if (dataType.kind === 'Enum') {
        const view = new Map((enumView ?? []).map((v) => [v.value, v.color]));
        return (
            <div className="dc-dt-preview">
                <div className="dc-dt-preview__label">Превью</div>
                <div className="dc-dt-preview__row">
                    {(dataType.values ?? []).length === 0 && (
                        <span className="dc-muted">— значения не заданы —</span>
                    )}
                    {(dataType.values ?? []).map((v) => (
                        <ValueChip
                            key={v.id}
                            id={v.id}
                            name={v.name}
                            color={view.get(v.id)}
                            hidden={v.hidden}
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (dataType.kind === 'Workflow') {
        const view = new Map((workflowView ?? []).map((v) => [v.status, v.color]));
        return (
            <div className="dc-dt-preview">
                <div className="dc-dt-preview__label">Превью статусов</div>
                <div className="dc-dt-preview__row">
                    {(dataType.statuses ?? []).map((s, i) => (
                        <span key={s.id} className="dc-dt-preview__status">
                            {i > 0 && <span className="dc-dt-preview__arrow">→</span>}
                            <ValueChip
                                id={s.id}
                                name={s.name}
                                color={view.get(s.id)}
                                hidden={s.hidden}
                            />
                            {dataType.initial === s.id && (
                                <span className="dc-dt-preview__star" title="Начальный статус">★</span>
                            )}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (dataType.kind === 'Table') {
        const attrs = dataType.attributes ?? [];
        const cols = ((dataType as any).view?.columns ?? []) as any[];
        return (
            <div className="dc-dt-preview">
                <div className="dc-dt-preview__label">Превью таблицы</div>
                {attrs.length === 0 ? (
                    <span className="dc-muted">— колонок нет —</span>
                ) : (
                    <table className="dc-table dc-dt-preview__table">
                        <thead>
                            <tr>
                                {attrs.map((a: any) => (
                                    <th key={a.id}>{a.name || a.id}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                {attrs.map((a: any) => (
                                    <td key={a.id} className="dc-muted">
                                        <em>{a.dataType}</em>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                )}
                {cols.length > 0 && (
                    <div className="dc-field__hint">
                        Столбцов в представлении: {cols.length} из {attrs.length}
                    </div>
                )}
            </div>
        );
    }

    return null;
};