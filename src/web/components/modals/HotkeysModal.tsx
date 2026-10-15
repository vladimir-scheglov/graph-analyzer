import React, { useEffect } from 'react';

export interface HotkeysModalProps {
    open: boolean;
    onClose: () => void;
}

interface HotkeyItem {
    keys: string[];
    label: string;
}

interface HotkeyGroup {
    title: string;
    items: HotkeyItem[];
}

const GROUPS: HotkeyGroup[] = [
    {
        title: 'Общее',
        items: [
            { keys: ['Shift', 'Tab'], label: 'Открыть командную палитру' },
            { keys: ['Ctrl', 'K'], label: 'Открыть командную палитру (альтернатива)' },
            { keys: ['F1'], label: 'Руководство пользователя' },
            { keys: ['?'], label: 'Это окно с хоткеями' },
            { keys: ['Esc'], label: 'Снять выделение / закрыть' }
        ]
    },
    {
        title: 'Навигация',
        items: [
            { keys: ['F'], label: 'Вписать граф в экран' },
            { keys: ['Alt', '←'], label: 'Назад по истории' },
            { keys: ['Alt', '→'], label: 'Вперёд по истории' },
            { keys: ['Ctrl', 'клик'], label: 'Мультивыбор узлов' },
            { keys: ['+'], label: 'Приблизить' },
            { keys: ['−'], label: 'Отдалить' },
            { keys: ['0'], label: 'Вписать в экран' }
        ]
    },
    {
        title: 'Анализ',
        items: [
            { keys: ['C'], label: 'Найти циклы' },
            { keys: ['I'], label: 'Только изолированные' },
            { keys: ['S'], label: 'Агрегация по семействам' },
            { keys: ['P'], label: 'Найти путь между двумя узлами' },
            { keys: ['B'], label: 'Добавить в закладки' }
        ]
    },
    {
        title: 'Вид',
        items: [
            { keys: ['T'], label: 'Скрыть/показать тултипы' },
            { keys: ['D'], label: 'Скрыть/показать правую панель' },
            { keys: ['E'], label: 'Скрыть/показать все связи' }
        ]
    },
    {
        title: 'Мышью',
        items: [
            { keys: ['Двойной клик'], label: 'Фокус на узле' },
            { keys: ['Правая кнопка'], label: 'Контекстное меню узла' },
            { keys: ['Клик по связи'], label: 'Детали связи в панели' },
            { keys: ['Клик по пустому месту'], label: 'Снять все выделения' }
        ]
    }
];

export function HotkeysModal({ open, onClose }: HotkeysModalProps) {
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onEsc, true);
        return () => document.removeEventListener('keydown', onEsc, true);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="help-overlay" onMouseDown={onClose}>
            <div className="help-modal hotkeys-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">⌨️ Горячие клавиши</div>
                    <button className="help-modal__close" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="hotkeys-body">
                    {GROUPS.map((g) => (
                        <div key={g.title} className="hotkeys-group">
                            <div className="hotkeys-group__title">{g.title}</div>
                            <div className="hotkeys-group__items">
                                {g.items.map((item, i) => (
                                    <div key={i} className="hotkey-row">
                                        <div className="hotkey-row__keys">
                                            {item.keys.map((k, ki) => (
                                                <React.Fragment key={ki}>
                                                    {ki > 0 && <span className="hotkey-plus">+</span>}
                                                    <kbd className="hotkey-key">{k}</kbd>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <div className="hotkey-row__label">{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="hotkeys-footer">
                    Все горячие клавиши работают, когда фокус не в поле ввода.
                </div>
            </div>
        </div>
    );
}