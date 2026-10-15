import React, { useEffect, useRef, useState } from 'react';

export interface ToastAction {
    command?: string;
}

export interface ToastProps {
    message: string;
    actions?: ToastAction[];
    onClose?: () => void;
    duration?: number;
}

export function Toast({ message, actions = [], onClose, duration = 20000 }: ToastProps) {
    const [visible, setVisible] = useState(true);
    const [copied, setCopied] = useState(false);

    // Ref — чтобы effect не перезапускался при новой ссылке на onClose
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!duration) return;
        const t = setTimeout(() => {
            setVisible(false);
            onCloseRef.current?.();
        }, duration);
        return () => clearTimeout(t);
    }, [duration]);   // ← onClose убран из deps

    if (!visible) return null;

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div className="toast">
            <div className="toast__body">
                <div className="toast__message" dangerouslySetInnerHTML={{ __html: message }} />
                {actions.map((a, i) => (
                    <div key={i} className="toast__action">
                        {a.command && <code className="toast__command">{a.command}</code>}
                        {a.command && (
                            <button className="toast__btn" onClick={() => copyToClipboard(a.command!)}>
                                {copied ? '✓ Скопировано' : '📋 Копировать'}
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <button
                className="toast__close"
                onClick={() => {
                    setVisible(false);
                    onCloseRef.current?.();
                }}
            >
                ✕
            </button>
        </div>
    );
}