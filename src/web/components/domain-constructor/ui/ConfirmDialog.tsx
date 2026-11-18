import { useEffect, type FC, type ReactNode } from 'react';

interface Props {
    open: boolean;
    title: string;
    /** Доп. пояснение (например, «будут удалены N дочерних элементов»). */
    description?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmDialog: FC<Props> = ({
    open, title, description, confirmLabel = 'Удалить', cancelLabel = 'Отмена',
    danger = true, onConfirm, onCancel,
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, onCancel]);

    if (!open) return null;

    return (
        <div className="dc-modal-backdrop" onClick={onCancel}>
            <div className="dc-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">{title}</h3>
                {description && <div className="dc-modal__body">{description}</div>}
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onCancel}>{cancelLabel}</button>
                    <button
                        className={'dc-btn ' + (danger ? 'dc-btn--danger' : 'dc-btn--primary')}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};