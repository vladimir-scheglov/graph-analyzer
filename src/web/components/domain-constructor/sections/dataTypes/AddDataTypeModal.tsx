import { useEffect, useState, type FC } from 'react';
import { useEditorStore } from '../../store/editor-store';
import { addDataType, validateDataTypeId } from './dataType-handlers';

type Template = 'blank' | 'enum-3' | 'workflow-basic' | 'table-2col';

interface TemplateOption {
    id: Template;
    label: string;
    description: string;
    kind: 'Enum' | 'Workflow' | 'Table';
}

const TEMPLATES: TemplateOption[] = [
    { id: 'blank', label: 'Пустой Enum', description: 'Перечисление без значений', kind: 'Enum' },
    { id: 'enum-3', label: 'Enum с 3 значениями', description: 'low / medium / high', kind: 'Enum' },
    { id: 'workflow-basic', label: 'Workflow базовый', description: 'Новый → В работе → Закрыт', kind: 'Workflow' },
    { id: 'table-2col', label: 'Table 2 колонки', description: 'Параметр + Значение', kind: 'Table' },
];

interface Props { open: boolean; onClose: () => void; }

export const AddDataTypeModal: FC<Props> = ({ open, onClose }) => {
    const schema = useEditorStore((s) => s.schema);
    const commit = useEditorStore((s) => s.commit);
    const select = useEditorStore((s) => s.select);

    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [template, setTemplate] = useState<Template>('blank');

    useEffect(() => {
        if (open) { setId(''); setName(''); setTemplate('blank'); }
    }, [open]);

    const idError = id ? validateDataTypeId(id, 'Enum') : null;
    const duplicate = schema.dataTypes.some((d) => d.id === id);
    const canSubmit = !!id && !idError && !duplicate;

    if (!open) return null;

    const handleCreate = () => {
        const tmpl = TEMPLATES.find((t) => t.id === template)!;

        const extra: Record<string, unknown> = {};

        if (template === 'enum-3') {
            extra.values = [
                { id: 'low', name: 'Низкий' },
                { id: 'medium', name: 'Средний' },
                { id: 'high', name: 'Высокий' },
            ];
            extra.view = [
                { value: 'low', color: '#6BA3FF' },
                { value: 'medium', color: '#FADD5C' },
                { value: 'high', color: '#F5790C' },
            ];
        }

        if (template === 'workflow-basic') {
            extra.statuses = [
                { id: 'new', name: 'Новый' },
                { id: 'inProgress', name: 'В работе' },
                { id: 'closed', name: 'Закрыт' },
            ];
            extra.initial = 'new';
            extra.transitions = [
                { from: 'new', to: 'inProgress' },
                { from: 'inProgress', to: 'closed' },
                { from: 'closed', to: 'inProgress' },
            ];
            extra.view = [
                { status: 'new', color: '#3B82F6' },
                { status: 'inProgress', color: '#22C55E' },
                { status: 'closed', color: '#9CA3AF' },
            ];
        }

        if (template === 'table-2col') {
            extra.attributes = [
                { id: 'parameter', name: 'Параметр', dataType: 'String' },
                { id: 'value', name: 'Значение', dataType: 'String' },
            ];
            extra.view = {
                columns: [
                    { id: 'parameter', attribute: 'parameter' },
                    { id: 'value', attribute: 'value' },
                ],
            };
        }

        commit((doc) => {
            addDataType(doc, {
                id,
                kind: tmpl.kind,
                name: name || undefined,
                extra,
            });
        });

        select(`dataType:${id}`);
        onClose();
    };

    return (
        <div className="dc-modal-backdrop" onClick={onClose}>
            <div className="dc-modal dc-modal--wide" onClick={(e) => e.stopPropagation()}>
                <h3 className="dc-modal__title">Новый тип</h3>
                <div className="dc-modal__body">
                    <div className="dc-field">
                        <label className="dc-field__label">Шаблон</label>
                        <div className="dc-dt-templates">
                            {TEMPLATES.map((t) => (
                                <label
                                    key={t.id}
                                    className={'dc-dt-template' + (template === t.id ? ' dc-dt-template--active' : '')}
                                >
                                    <input
                                        type="radio"
                                        name="dt-template"
                                        checked={template === t.id}
                                        onChange={() => setTemplate(t.id)}
                                    />
                                    <div>
                                        <div className="dc-dt-template__name">{t.label}</div>
                                        <div className="dc-dt-template__desc">{t.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">ID <span className="dc-field__required">*</span></label>
                        <input
                            className="dc-input dc-input--mono"
                            value={id}
                            onChange={(e) => setId(e.target.value)}
                            placeholder="enumIocTypes, Priority, AutomationMetrics, …"
                            autoFocus
                        />
                        {idError && <div className="dc-field__error">{idError}</div>}
                        {duplicate && <div className="dc-field__error">Тип с таким ID уже есть</div>}
                    </div>

                    <div className="dc-field">
                        <label className="dc-field__label">Название</label>
                        <input
                            className="dc-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                </div>
                <div className="dc-modal__actions">
                    <button className="dc-btn" onClick={onClose}>Отмена</button>
                    <button
                        className="dc-btn dc-btn--primary"
                        disabled={!canSubmit}
                        onClick={handleCreate}
                    >Создать</button>
                </div>
            </div>
        </div>
    );
};