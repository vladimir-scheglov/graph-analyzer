import type { FC } from 'react';
import type { EntitySchema } from '../../types';

export const SortingTab: FC<{ entity: EntitySchema }> = ({ entity }) => (
    <div>
        <p className="dc-muted">
            Правила сортировки — в следующем релизе.
        </p>
        {entity.sorting && entity.sorting.length > 0 && (
            <table className="dc-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Название</th>
                        <th>По атрибутам</th>
                    </tr>
                </thead>
                <tbody>
                    {entity.sorting.map((s) => (
                        <tr key={s.id}>
                            <td><code className="dc-code">{s.id}</code></td>
                            <td>{s.name || <span className="dc-muted">—</span>}</td>
                            <td>
                                {s.by.map((b, i) => (
                                    <span key={i}>
                                        <code className="dc-code">{b.attribute}</code>{' '}
                                        ({b.direction})
                                        {i < s.by.length - 1 && ', '}
                                    </span>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);