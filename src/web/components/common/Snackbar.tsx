import React from 'react';
import { MIcon } from './MIcon';

export interface SnackbarProps {
    snackbar: { message: string; ts: number } | null;
}

export function Snackbar({ snackbar }: SnackbarProps) {
    if (!snackbar) return null;
    return (
        <div className="snackbar">
            <MIcon name="check_circle" size="sm" />
            <span>{snackbar.message}</span>
        </div>
    );
}