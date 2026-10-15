import React from 'react';

export interface HighlightedTextProps {
    text: string | null | undefined;
    query: string;
}

export function HighlightedText({ text, query }: HighlightedTextProps) {
    if (text === null || text === undefined) return null;

    const str = String(text);
    const q = (query || '').trim();
    if (!q) return <>{str}</>;

    const lower = str.toLowerCase();
    const qLower = q.toLowerCase();
    const parts: React.ReactNode[] = [];
    let pos = 0;
    let idx = lower.indexOf(qLower, pos);
    let key = 0;

    while (idx !== -1) {
        if (idx > pos) parts.push(str.slice(pos, idx));
        parts.push(
            <mark key={'m' + key++} className="search-hl">
                {str.slice(idx, idx + q.length)}
            </mark>
        );
        pos = idx + q.length;
        idx = lower.indexOf(qLower, pos);
    }
    if (pos < str.length) parts.push(str.slice(pos));

    return <>{parts}</>;
}