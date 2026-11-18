import { useEffect, useState, type FC } from 'react';

interface Props {
    open: boolean;
    title: string;
    hint: string;
    placeholder: string;
    onClose: () => void;
    onSubmit: (lines: string[]) => void;
}

export const BulkPasteDialog: FC<Props> = ({
    open, title, hint, placeholder, onClose, onSubmit,
}) => {
    const [text, setText] = useState('');

    useEffect(() => {
        if (open) setText('');
    }, [open]);

    if (!open) return null;

    const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div
                className="dc-modal dc-modal--wide"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="dc-modal__title">{title}</h3>
                <div className="dc-modal__body">
                    <div className="dc-field__hint">{hint}</div>
                    <textarea
                        className="dc-input dc-input--textarea"
                        style={{ minHeight: 180, fontFamily: 'ui-monospace, monospace' }}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={placeholder}
                        autoFocus
                    />
                    {lines.length > 0 && (
                        <div className="dc-field__hint">
                            Будет добавлено строк: <b>{lines.length}</b>
                        </div>
                    )}
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={lines.length === 0}
                        onClick={() => {
                            onSubmit(lines);
                            onClose();
                        }}
                    >
                        Добавить {lines.length > 0 ? `(${lines.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};