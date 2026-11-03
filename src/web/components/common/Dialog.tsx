import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogStore } from "../../lib/dialogs";
import { MIcon } from "./MIcon";
import "../../styles/dialog.css";

const VARIANT_ICON: Record<string, string> = {
    info: "info",
    warning: "warning",
    danger: "dangerous",
};

export function Dialog() {
    const dialog = useDialogStore((s) => s.current);
    const close = useDialogStore((s) => s._close);
    const confirmBtnRef = useRef<HTMLButtonElement>(null);

    // Автофокус на primary-кнопке
    useEffect(() => {
        if (!dialog) return;
        const t = setTimeout(() => confirmBtnRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [dialog]);

    // Esc → cancel / dismiss; Enter → confirm
    useEffect(() => {
        if (!dialog) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                // alert всегда закрывается как «OK», confirm — как «Отмена»
                close(dialog.kind === "alert");
            } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                close(true);
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, [dialog, close]);

    if (!dialog) return null;

    const icon = VARIANT_ICON[dialog.variant] || "info";
    const isDanger = dialog.variant === "danger";

    return createPortal(
        <div
            className="dialog-overlay"
            onMouseDown={() => close(dialog.kind === "alert")}
        >
            <div
                className="dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="dg-dialog-title"
                aria-describedby="dg-dialog-message"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="dialog__header">
                    <div className={"dialog__icon dialog__icon--" + dialog.variant}>
                        <MIcon name={icon} />
                    </div>
                    <div id="dg-dialog-title" className="dialog__title">
                        {dialog.title}
                    </div>
                </div>

                <div className="dialog__body">
                    <div id="dg-dialog-message" className="dialog__message">
                        {dialog.message}
                    </div>
                    {dialog.detail && (
                        <pre className="dialog__detail">{dialog.detail}</pre>
                    )}
                </div>

                <div className="dialog__footer">
                    {dialog.cancelLabel !== null && (
                        <button className="btn" onClick={() => close(false)}>
                            {dialog.cancelLabel}
                        </button>
                    )}
                    <button
                        ref={confirmBtnRef}
                        className={"btn btn--primary" + (isDanger ? " btn--danger" : "")}
                        onClick={() => close(true)}
                    >
                        {dialog.confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}