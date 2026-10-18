import React, { useEffect, useRef, useState } from 'react';
import { MIcon } from './MIcon';

export interface ToastAction {
    command?: string;
}

export interface ToastProps {
    message: string;
    actions?: ToastAction[];
    onClose?: () => void;
    duration?: number;
}

export interface ToastAction {
    command?: string;
}

export interface ToastDontShowAgain {
    label?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export interface ToastProps {
    message: string;
    actions?: ToastAction[];
    onClose?: () => void;
    duration?: number;
    dontShowAgain?: ToastDontShowAgain;
}

export function Toast({ message, actions = [], onClose, duration = 20000, dontShowAgain }: ToastProps) {
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
                                {copied ? '✓ Скопировано' : <span><MIcon name="content_copy" size='sm' /> Копировать</span>}
                            </button>
                        )}
                    </div>
                ))}
                {dontShowAgain && (
                    <label className="toast__dont-show">
                        <input
                            type="checkbox"
                            checked={dontShowAgain.checked}
                            onChange={(e) => dontShowAgain.onChange(e.target.checked)}
                        />
                        <span>{dontShowAgain.label || 'Больше не показывать'}</span>
                    </label>
                )}
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