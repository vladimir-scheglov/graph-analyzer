import type { FC } from 'react';
import { useToastStore, type ToastKind } from './toast';

const ICONS: Record<ToastKind, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
};

export const ToastContainer: FC = () => {
    const toasts = useToastStore((s) => s.toasts);
    const dismiss = useToastStore((s) => s.dismiss);

    if (toasts.length === 0) return null;

    return (
        <div className="dc-toast-container" role="region" aria-label="Уведомления">
            {toasts.map((t) => (
                <div
                    key={t.id}
                    className={`dc-toast dc-toast--${t.kind}`}
                    role={t.kind === 'error' ? 'alert' : 'status'}
                >
                    <span className="dc-toast__icon" aria-hidden="true">{ICONS[t.kind]}</span>
                    <div className="dc-toast__content">
                        <div className="dc-toast__message">{t.message}</div>
                        {t.description && (
                            <div className="dc-toast__description">{t.description}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="dc-toast__close"
                        onClick={() => dismiss(t.id)}
                        aria-label="Закрыть"
                    >×</button>
                </div>
            ))}
        </div>
    );
};