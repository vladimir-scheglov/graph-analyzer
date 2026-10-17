import React from 'react';

export interface YamlViewerHelpProps {
    onClose: () => void;
}

export function YamlViewerHelp({ onClose }: YamlViewerHelpProps) {
    return (
        <div
            className="help-overlay"
            style={{ zIndex: 600 }}
            onMouseDown={onClose}
        >
            <div
                className="help-modal"
                style={{ width: 640, maxWidth: '90vw' }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">📖 Навигация в редакторе</div>
                    <button className="help-modal__close" onClick={onClose}>✕</button>
                </div>
                <div className="help-modal__body">
                    <div className="modal-help" style={{ padding: 0, background: 'transparent', border: 0 }}>
                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Навигация по коду</h3>
                            <ul className="modal-help__list">
                                <li>
                                    <code>Ctrl+Shift+O</code> — список всех символов файла (секции, сущности, атрибуты). Клик по элементу — переход к строке.
                                </li>
                                <li>
                                    <strong><code>Ctrl+Click</code></strong> — переход к определению. Работает для:
                                    <ul>
                                        <li><code>id: Device</code> — к определению сущности;</li>
                                        <li><code>inherits: Device</code> — к сущности-родителю;</li>
                                        <li><code>attribute: Requirement.identifier</code> — Ctrl+Click по <code>Requirement</code> → к сущности, по <code>identifier</code> → к атрибуту;</li>
                                        <li><code>action: some_action</code>, <code>view: list_x</code>, <code>linkage: link_y</code> — к элементу.</li>
                                    </ul>
                                </li>
                                <li>
                                    <code>Ctrl+Shift+F12</code> или <code>Alt+F12</code> — переход к определению (альтернатива F12, так как F12 в браузере открывает DevTools).
                                </li>
                                <li>
                                    <code>Ctrl+Alt+F12</code> — открыть сущность из чужого домена (<code>other.domain/Entity</code>) в каталоге.
                                </li>
                                <li>
                                    <em>Совет:</em> если F12 привычнее, в <code>chrome://settings</code> → DevTools можно отключить глобальную комбинацию, но это не рекомендуется.
                                </li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Поиск и перемещение</h3>
                            <ul className="modal-help__list">
                                <li><code>Ctrl+F</code> — поиск по файлу.</li>
                                <li><code>Ctrl+G</code> — перейти к строке.</li>
                                <li><code>Alt+↑</code> / <code>Alt+↓</code> — предыдущая / следующая строка.</li>
                                <li><code>Ctrl+Home</code> / <code>Ctrl+End</code> — начало / конец файла.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Левая панель навигации</h3>
                            <ul className="modal-help__list">
                                <li>Клик по треугольнику <code>▸</code> — свернуть/развернуть секцию.</li>
                                <li>Клик по <code>→</code> справа от названия секции — перейти к началу секции.</li>
                                <li>Поле поиска сверху — фильтр по id; результат — плоский список с номерами строк.</li>
                                <li>Кнопки <code>⤢ ⤡</code> — развернуть / свернуть всё.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Клавиатура в навигации</h3>
                            <ul className="modal-help__list">
                                <li><code>↑</code> / <code>↓</code> — навигация по элементам (когда фокус не в редакторе).</li>
                                <li><code>Enter</code> — переход к выбранному элементу.</li>
                                <li><code>←</code> — свернуть активную секцию.</li>
                                <li><code>→</code> — развернуть активную секцию.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Правая панель</h3>
                            <ul className="modal-help__list">
                                <li><strong>Проблемы</strong> — все lint-issues домена. Клик по проблеме — переход к строке.</li>
                                <li><strong>Ссылки</strong> — все ссылки из этого домена в другие домены. Клик — переход к строке.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Редактирование</h3>
                            <ul className="modal-help__list">
                                <li><code>🔒</code> — разблокировать файл для редактирования (кнопка в шапке).</li>
                                <li><code>📋</code> — копировать содержимое в буфер обмена.</li>
                                <li><code>💾</code> или <code>Ctrl+S</code> — сохранить изменения (доступно только в локальном режиме).</li>
                            </ul>
                            <p className="modal-help__text" style={{ marginTop: 8 }}>
                                В режиме <code>--server</code> файлы доступны только для чтения. Используйте копирование,
                                чтобы перенести изменения вручную.
                            </p>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Подсказки при наведении</h3>
                            <ul className="modal-help__list">
                                <li>Наведите на <code>id: Device</code> — тултип с названием, описанием, числом атрибутов, FQID.</li>
                                <li>Наведите на <code>attribute: Requirement.identifier</code> — тултип с типом, ограничениями, ссылками.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Code Actions (лампочка)</h3>
                            <ul className="modal-help__list">
                                <li>На маркере ошибки/предупреждения кликните на <strong>💡 лампочку</strong> слева от строки.</li>
                                <li><strong>📖 Показать справку</strong> — текст правила и рекомендация.</li>
                                <li><strong>🔇 Игнорировать</strong> — скрыть это правило для текущего домена (сохраняется в браузере).</li>
                                <li><strong>🔬 Открыть линтер</strong> — перейти к списку всех проблем домена.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Diff с предыдущим сохранением</h3>
                            <ul className="modal-help__list">
                                <li>Кнопка <code>🔍 Diff</code> в шапке появляется, если файл сохранялся хотя бы раз.</li>
                                <li>Показывает side-by-side сравнение с предыдущей версией на диске.</li>
                                <li>После сохранения — diff автоматически обновится.</li>
                            </ul>
                        </div>

                        <div className="modal-help__section">
                            <h3 className="modal-help__title">Проверки RQL</h3>
                            <ul className="modal-help__list">
                                <li><strong>Синтаксис</strong> — незакрытые скобки, кавычки, обрезанные операторы.</li>
                                <li><strong>Поля</strong> — <code>@field</code> проверяется на существование в контекстной сущности.</li>
                                <li><strong>Типы</strong> — сравнение с числом для строкового поля и наоборот.</li>
                                <li><strong>FROM(...)</strong> — поля в <code>IN SELECT(...)</code> проверяются так же.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}