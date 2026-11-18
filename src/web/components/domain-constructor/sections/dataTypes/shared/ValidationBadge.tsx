import type { FC } from 'react';
import type { DataTypeValidationResult } from '../dataType-handlers';

interface Props {
    result: DataTypeValidationResult;
}

export const ValidationBadge: FC<Props> = ({ result }) => {
    if (result.errors.length === 0 && result.warnings.length === 0) return null;

    return (
        <div className="dc-dt-issues">
            {result.errors.map((e, i) => (
                <div key={`e${i}`} className="dc-dt-issue dc-dt-issue--error">
                    <span className="dc-dt-issue__icon">✕</span> {e}
                </div>
            ))}
            {result.warnings.map((w, i) => (
                <div key={`w${i}`} className="dc-dt-issue dc-dt-issue--warning">
                    <span className="dc-dt-issue__icon">⚠</span> {w}
                </div>
            ))}
        </div>
    );
};