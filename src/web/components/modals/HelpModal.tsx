import React, { useEffect, useState } from 'react';
import { useMarked } from '../../hooks/useMarked';

export interface HelpModalProps {
    open: boolean;
    onClose: () => void;
}

export function HelpModal({ open, onClose }: HelpModalProps) {
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const { parse, ready } = useMarked();

    useEffect(() => {
        if (!open || content) return;
        setLoading(true);
        fetch('/user-guide')
            .then((r) => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            })
            .then((md) => setContent(md))
            .catch((err) => setContent('# Ошибка\n\n' + err.message))
            .finally(() => setLoading(false));
    }, [open, content]);

    useEffect(() => {
        if (!open || !content || !ready || !parse) return;
        if (loading) setLoading(false);
    }, [open, content, ready, parse, loading]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onEsc, true);
        return () => document.removeEventListener('keydown', onEsc, true);
    }, [open, onClose]);

    if (!open) return null;

    const html = ready && parse && content ? parse(content) : '';

    return (
        <div className="help-overlay" onMouseDown={onClose}>
            <div className="help-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">📖 Руководство пользователя</div>
                    <button className="help-modal__close" onClick={onClose} title="Закрыть (Esc)">
                        ✕
                    </button>
                </div>
                <div className="help-modal__body">
                    {loading || !html ? (
                        <div className="help-modal__loading">Загрузка...</div>
                    ) : (
                        <div className="help-content" dangerouslySetInnerHTML={{ __html: html }} />
                    )}
                </div>
            </div>
        </div>
    );
}