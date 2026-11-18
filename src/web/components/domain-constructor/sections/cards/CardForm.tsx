import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import {
    CARD_TYPES, CardType, changeCardType, updateCardField,
} from './cards-handlers';
import { PanelCardForm } from './forms/PanelCardForm';
import { ModalCardForm } from './forms/ModalCardForm';
import { PageCardForm } from './forms/PageCardForm';

interface Props {
    viewId: string;
    card: any;
}

export const CardForm: FC<Props> = ({ viewId, card }) => {
    const commit = useEditorStore((s) => s.commit);
    const isPublished = useEditorStore((s) => s.isPublished);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateCardField(doc, viewId, card.id, field, value));

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    <input className="dc-input" value={card.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Тип</label>
                    <select
                        className="dc-input"
                        value={card.type}
                        onChange={(e) => {
                            const newType = e.target.value as CardType;
                            if (newType === card.type) return;
                            if (!confirm(`Сменить тип на "${newType}"? Текущие настройки будут очищены.`)) return;
                            commit((doc) => changeCardType(doc, viewId, card.id, newType));
                        }}
                        disabled={isPublished}
                    >
                        {CARD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Лейбл</label>
                <input
                    className="dc-input"
                    value={card.label ?? ''}
                    onChange={(e) => set('label', e.target.value || undefined)}
                    placeholder="{name}: {type}"
                />
                <div className="dc-field__hint">
                    Поддерживаются подстановки {'{attrId}'} из атрибутов сущности.
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <input
                    className="dc-input"
                    value={card.description ?? ''}
                    onChange={(e) => set('description', e.target.value || undefined)}
                />
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Наследовать настройки из</label>
                <input
                    className="dc-input"
                    value={card.inherits ?? ''}
                    onChange={(e) => set('inherits', e.target.value || undefined)}
                    placeholder="id карточки в родительском view"
                />
            </div>

            {card.type === 'panel' && <PanelCardForm viewId={viewId} card={card} />}
            {card.type === 'modal' && <ModalCardForm viewId={viewId} card={card} />}
            {card.type === 'page' && <PageCardForm viewId={viewId} card={card} />}
        </div>
    );
};