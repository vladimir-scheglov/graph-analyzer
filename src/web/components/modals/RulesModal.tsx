import React, { useEffect, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useNavigation } from '../../hooks/useNavigation';
import { MIcon } from '../common/MIcon';
import type { RuleDefinition, RuleViolation } from '../../lib/types';

export interface RulesModalProps {
    violations: RuleViolation[];
}

export function RulesModal({ violations }: RulesModalProps) {
    const store = useGraphStore();
    const { goto } = useNavigation();
    const [draft, setDraft] = useState({
        from: '',
        to: '',
        action: 'warn' as 'warn' | 'forbid',
        message: ''
    });

    const open = store.rulesOpen;

    useEffect(() => {
        if (!open) setDraft({ from: '', to: '', action: 'warn', message: '' });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') store.setRulesOpen(false);
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open, store]);

    if (!open) return null;

    const addRule = () => {
        if (!draft.from.trim() || !draft.to.trim()) return;
        const newRule: RuleDefinition = {
            id: 'r' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            from: draft.from.trim(),
            to: draft.to.trim(),
            action: draft.action,
            message: draft.message.trim()
        };
        store.setRules((prev) => prev.concat([newRule]));
        setDraft({ from: '', to: '', action: 'warn', message: '' });
    };

    const removeRule = (id: string) => {
        store.setRules((prev) => prev.filter((r) => r.id !== id));
    };

    const toggleAction = (id: string) => {
        store.setRules((prev) =>
            prev.map((r) =>
                r.id === id
                    ? { ...r, action: r.action === 'forbid' ? 'warn' : 'forbid' }
                    : r
            )
        );
    };

    const clearAllRules = () => {
        if (!confirm('Удалить все правила?')) return;
        store.setRules([]);
    };

    const onFormKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addRule();
        }
    };

    return (
        <div className="help-overlay" onMouseDown={() => store.setRulesOpen(false)}>
            <div className="help-modal rules-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="block" />
                        <span style={{ marginLeft: 8 }}>Правила зависимостей</span>
                        {violations.length > 0 && (
                            <span className="help-modal__badge">{violations.length}</span>
                        )}
                    </div>
                    <button
                        className="help-modal__close"
                        onClick={() => store.setRulesOpen(false)}
                        title="Закрыть (Esc)"
                    >
                        <MIcon name="close" />
                    </button>
                </div>

                <div className="help-modal__body rules-modal__body">
                    <div className="rules-form">
                        <div className="rules-form__label">Новое правило</div>
                        <div className="rules-form__row">
                            <input
                                className="rules-form__input"
                                type="text"
                                placeholder="from (например: ui.*)"
                                value={draft.from}
                                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                                onKeyDown={onFormKeyDown}
                            />
                            <span className="rules-form__arrow">
                                <MIcon name="arrow_forward" size="sm" />
                            </span>
                            <input
                                className="rules-form__input"
                                type="text"
                                placeholder="to (например: db.*)"
                                value={draft.to}
                                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                                onKeyDown={onFormKeyDown}
                            />
                        </div>
                        <div className="rules-form__row">
                            <select
                                className="rules-form__select"
                                value={draft.action}
                                onChange={(e) =>
                                    setDraft({ ...draft, action: e.target.value as 'warn' | 'forbid' })
                                }
                            >
                                <option value="warn">⚠️ Warning</option>
                                <option value="forbid">⛔ Forbid</option>
                            </select>
                            <input
                                className="rules-form__input"
                                type="text"
                                placeholder="Комментарий (необязательно)"
                                value={draft.message}
                                onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                                onKeyDown={onFormKeyDown}
                            />
                            <button
                                className="btn btn--primary"
                                onClick={addRule}
                                disabled={!draft.from.trim() || !draft.to.trim()}
                            >
                                <MIcon name="add" size="sm" /> Добавить
                            </button>
                        </div>
                        <div className="rules-form__hint">
                            Маски: <code>sgrc.evo.*</code>, <code>ui.*</code>, <code>!test.*</code>.
                            Поддерживается <b>*</b> и <b>!</b>.
                        </div>
                    </div>

                    <div className="rules-list">
                        <div className="rules-list__header">
                            <span className="rules-form__label">
                                Активные правила ({store.rules.length})
                            </span>
                            {store.rules.length > 0 && (
                                <button className="rules-list__clear" onClick={clearAllRules}>
                                    Очистить все
                                </button>
                            )}
                        </div>

                        {store.rules.length === 0 ? (
                            <div className="rules-list__empty">Правила не заданы</div>
                        ) : (
                            store.rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className={'rules-item rules-item--' + (rule.action || 'warn')}
                                >
                                    <button
                                        className={
                                            'rules-item__action rules-item__action--' + (rule.action || 'warn')
                                        }
                                        onClick={() => toggleAction(rule.id)}
                                        title={
                                            rule.action === 'forbid'
                                                ? 'Нажмите, чтобы сделать Warning'
                                                : 'Нажмите, чтобы сделать Forbid'
                                        }
                                    >
                                        <MIcon
                                            name={rule.action === 'forbid' ? 'block' : 'warning'}
                                            size="sm"
                                        />
                                    </button>
                                    <div className="rules-item__body">
                                        <div className="rules-item__pattern">
                                            <code>{rule.from}</code>
                                            <span className="rules-item__arrow"> → </span>
                                            <code>{rule.to}</code>
                                        </div>
                                        {rule.message && (
                                            <div className="rules-item__message">{rule.message}</div>
                                        )}
                                    </div>
                                    <button
                                        className="rules-item__remove"
                                        onClick={() => removeRule(rule.id)}
                                        title="Удалить"
                                    >
                                        <MIcon name="close" size="sm" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="rules-toggles">
                        <label className="rules-toggle">
                            <input
                                type="checkbox"
                                checked={store.rulesHighlighted}
                                onChange={() => store.setRulesHighlighted(!store.rulesHighlighted)}
                            />
                            <span className="rules-toggle__check" />
                            <span>Подсвечивать нарушения на графе</span>
                        </label>
                        <label className="rules-toggle">
                            <input
                                type="checkbox"
                                checked={store.showViolationsOnly}
                                onChange={() => store.setShowViolationsOnly(!store.showViolationsOnly)}
                            />
                            <span className="rules-toggle__check" />
                            <span>Показать только нарушения</span>
                        </label>
                    </div>

                    {violations.length > 0 && (
                        <div className="rules-violations">
                            <div className="rules-form__label">
                                Найденные нарушения ({violations.length})
                            </div>
                            <div className="rules-violations__list">
                                {violations.slice(0, 50).map((v, idx) => (
                                    <div
                                        key={idx}
                                        className={'rules-violation rules-violation--' + (v.severity || 'warn')}
                                    >
                                        <MIcon
                                            name={v.severity === 'forbid' ? 'block' : 'warning'}
                                            size="sm"
                                        />
                                        <span
                                            className="rules-violation__from"
                                            onClick={() => {
                                                goto(v.fromId);
                                                store.setRulesOpen(false);
                                            }}
                                        >
                                            {v.fromId}
                                        </span>
                                        <span className="rules-violation__arrow"> → </span>
                                        <span
                                            className="rules-violation__to"
                                            onClick={() => {
                                                goto(v.toId);
                                                store.setRulesOpen(false);
                                            }}
                                        >
                                            {v.toId}
                                        </span>
                                        {v.rule && v.rule.message && (
                                            <span className="rules-violation__message">{v.rule.message}</span>
                                        )}
                                    </div>
                                ))}
                                {violations.length > 50 && (
                                    <div className="rules-violations__more">
                                        ...и ещё {violations.length - 50}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rules-modal__footer">
                    <div className="rules-modal__stats">
                        Правил: {store.rules.length}
                        {violations.length > 0 && (
                            <span className="rules-modal__stats--err">
                                {' · Нарушений: ' + violations.length}
                            </span>
                        )}
                    </div>
                    <button className="btn" onClick={() => store.setRulesOpen(false)}>
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
}