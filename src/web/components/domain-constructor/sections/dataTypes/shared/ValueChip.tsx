import type { FC } from 'react';

interface Props {
    id: string;
    name?: string;
    color?: string;
    hidden?: boolean;
}

export const ValueChip: FC<Props> = ({ id, name, color, hidden }) => (
    <span
        className={'dc-value-chip' + (hidden ? ' dc-value-chip--hidden' : '')}
        style={
            color
                ? { borderColor: color, color, background: `${color}1a` }
                : undefined
        }
    >
        {color && <span className="dc-value-chip__dot" style={{ background: color }} />}
        <span className="dc-value-chip__name">{name || id}</span>
        {name && name !== id && (
            <code className="dc-value-chip__id">{id}</code>
        )}
        {hidden && <span className="dc-value-chip__badge">скрыт</span>}
    </span>
);