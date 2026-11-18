import type { FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { EntitySelect } from '../../ui/EntitySelect';
import type { LinkageSchema } from '../../types';
import { updateLinkageField, updateLinkageNameFrom } from './linkages-handlers';

interface Props {
    linkage: LinkageSchema;
}

export const LinkageMainTab: FC<Props> = ({ linkage }) => {
    const commit = useEditorStore((s) => s.commit);

    const set = (field: string, value: unknown) =>
        commit((doc) => updateLinkageField(doc, linkage.id, field, value));

    const isNN = linkage.type === 'n_n';

    return (
        <div>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">ID</label>
                    {/* ID связи менять не рекомендуется (используется в ссылках) */}
                    <input className="dc-input" value={linkage.id} disabled />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Название</label>
                    <input
                        className="dc-input"
                        value={linkage.name ?? ''}
                        onChange={(e) => set('name', e.target.value)}
                    />
                </div>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Описание</label>
                <textarea
                    className="dc-input dc-input--textarea"
                    value={linkage.description ?? ''}
                    onChange={(e) => set('description', e.target.value)}
                />
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Сторона 1</label>
                    <EntitySelect
                        value={linkage.side1}
                        onChange={(v) => set('side1', v ?? '')}
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Сторона 2</label>
                    <EntitySelect
                        value={linkage.side2}
                        onChange={(v) => set('side2', v ?? '')}
                    />
                </div>
            </div>

            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Тип</label>
                    <select
                        className="dc-input"
                        value={linkage.type}
                        onChange={(e) => {
                            const t = e.target.value as '1_1' | '1_n' | 'n_n';
                            set('type', t);
                            if (t !== 'n_n' && linkage.undirected) set('undirected', undefined);
                        }}
                    >
                        <option value="1_1">1–1</option>
                        <option value="1_n">1–N</option>
                        <option value="n_n">N–N</option>
                    </select>
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">
                        <input
                            type="checkbox"
                            className="dc-checkbox"
                            checked={!!linkage.undirected}
                            onChange={(e) => set('undirected', e.target.checked ? true : undefined)}
                            disabled={!isNN}
                        />{' '}
                        Ненаправленная (только n_n)
                    </label>
                </div>
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Глагольные формы (nameFrom)
            </h4>
            <div className="dc-field-row">
                <div className="dc-field">
                    <label className="dc-field__label">Со стороны 1</label>
                    <input
                        className="dc-input"
                        value={linkage.nameFrom?.side1 ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateLinkageNameFrom(doc, linkage.id, 'side1', e.target.value))
                        }
                        placeholder="Содержит"
                    />
                </div>
                <div className="dc-field">
                    <label className="dc-field__label">Со стороны 2</label>
                    <input
                        className="dc-input"
                        value={linkage.nameFrom?.side2 ?? ''}
                        onChange={(e) =>
                            commit((doc) => updateLinkageNameFrom(doc, linkage.id, 'side2', e.target.value))
                        }
                        placeholder="Связан с"
                    />
                </div>
            </div>

            <h4 className="dc-constraints__title" style={{ marginTop: 16 }}>
                Отображение и поиск
            </h4>
            <div className="dc-field">
                <label className="dc-field__label">
                    <input
                        type="checkbox"
                        className="dc-checkbox"
                        checked={!!linkage.useForSearch}
                        onChange={(e) => set('useForSearch', e.target.checked ? true : undefined)}
                    />{' '}
                    Доступна для поиска
                </label>
            </div>

            <div className="dc-field">
                <label className="dc-field__label">Отображение на графе</label>
                <select
                    className="dc-input"
                    value={
                        linkage.excludeOnGraph === 'off'
                            ? 'off'
                            : linkage.excludeOnGraph === true
                                ? 'hidden'
                                : 'show'
                    }
                    onChange={(e) => {
                        const v = e.target.value;
                        set('excludeOnGraph',
                            v === 'off' ? 'off' : v === 'hidden' ? true : undefined);
                    }}
                >
                    <option value="show">Показывать</option>
                    <option value="hidden">Показывать, но скрыть по умолчанию</option>
                    <option value="off">Не показывать</option>
                </select>
            </div>
        </div>
    );
};