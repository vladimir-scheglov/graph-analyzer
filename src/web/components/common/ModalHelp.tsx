import React, { ReactNode, useLayoutEffect, useRef } from 'react';
import { MIcon } from './MIcon';

export interface HelpButtonProps {
    open: boolean;
    onToggle: () => void;
    label?: string;
}

export function HelpButton({ open, onToggle, label = 'Что это?' }: HelpButtonProps) {
    return (
        <button
            type="button"
            className={'help-modal__help-btn' + (open ? ' active' : '')}
            onClick={onToggle}
            title={open ? 'Скрыть справку' : label}
        >
            <MIcon name="help" />
            <span>{open ? 'Скрыть' : label}</span>
        </button>
    );
}

export interface ModalHelpProps {
    visible: boolean;
    children: React.ReactNode;
}

export function ModalHelp({ visible, children }: ModalHelpProps) {
    const ref = useRef<HTMLDivElement>(null);

    // useLayoutEffect — до paint'а. Иначе на один кадр help успевает
    // отрисоваться «в потоке», пока родитель ещё не relative.
    useLayoutEffect(() => {
        if (!visible) return;
        const parent = ref.current?.parentElement as HTMLElement | null;
        if (!parent) return;

        const prev = {
            position: parent.style.position,
            overflow: parent.style.overflow,
            scrollTop: parent.scrollTop,
        };

        // Гарантируем overlay-контекст.
        parent.style.position = "relative";
        parent.style.overflow = "hidden";   // отключаем скролл родителя
        parent.scrollTop = 0;               // help всегда в начале

        return () => {
            parent.style.position = prev.position;
            parent.style.overflow = prev.overflow;
            parent.scrollTop = prev.scrollTop;
        };
    }, [visible]);

    if (!visible) return null;

    return (
        <div
            ref={ref}
            className="modal-help"
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 100,

                // Непрозрачный фон — fallback на случай, если var(--bg-800)
                // не определён в этой точке DOM
                background: "var(--bg-800, #0d1424)",

                // Скролл — у самой справки, не у родителя
                overflowY: "auto",
                overflowX: "hidden",

                // Отступы — как у тела модалки (mode `--flush` больше не влияет
                // на справку, это ок: у неё свой контент-дизайн)
                padding: "20px 24px",

                // Убираем возможные артефакты наследования
                borderRadius: 0,
                margin: 0,
                border: "none",
                boxShadow: "none",
                boxSizing: "border-box",
            }}
        >
            {children}
        </div>
    );
}
export function HelpSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="modal-help__section">
            <h3 className="modal-help__title">{title}</h3>
            {children}
        </div>
    );
}

export function HelpText({ children }: { children: ReactNode }) {
    return <p className="modal-help__text">{children}</p>;
}

export function HelpList({ children }: { children: ReactNode }) {
    return <ul className="modal-help__list">{children}</ul>;
}

export function HelpCard({
    letter,
    title,
    formula,
    wide,
    children
}: {
    letter?: string;
    title: string;
    formula?: string;
    wide?: boolean;
    children: ReactNode;
}) {
    return (
        <div className={'modal-help__card' + (wide ? ' modal-help__card--wide' : '')}>
            <div className="modal-help__card-head">
                {letter && <span className="modal-help__letter">{letter}</span>}
                <span className="modal-help__name">{title}</span>
            </div>
            {formula && <div className="modal-help__formula">{formula}</div>}
            <div className="modal-help__desc">{children}</div>
        </div>
    );
}

export function HelpZones({ children }: { children: ReactNode }) {
    return <div className="modal-help__zones">{children}</div>;
}

export function HelpZone({
    color,
    title,
    children
}: {
    color: 'green' | 'red' | 'orange';
    title: string;
    children: ReactNode;
}) {
    return (
        <div className={'modal-help__zone modal-help__zone--' + color}>
            <div className="modal-help__zone-title">{title}</div>
            <div className="modal-help__zone-desc">{children}</div>
        </div>
    );
}