import React, { ReactNode } from 'react';
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
    children: ReactNode;
}

export function ModalHelp({ visible, children }: ModalHelpProps) {
    if (!visible) return null;
    return <div className="modal-help">{children}</div>;
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