import type { FC, ReactNode } from 'react';

interface Props {
    title: string;
    subtitle?: string;
    /** Иконка/бейдж рядом с заголовком. */
    badge?: ReactNode;
    /** Кнопки справа (редактировать, удалить). */
    actions?: ReactNode;
    /** Вкладки внутри карточки. */
    tabs?: Array<{ key: string; label: string }>;
    activeTab?: string;
    onTabChange?: (key: string) => void;
    children: ReactNode;
    empty?: boolean;
    emptyText?: string;
}

export const DetailCard: FC<Props> = ({
    title, subtitle, badge, actions, tabs, activeTab, onTabChange, children,
    empty, emptyText = 'Ничего не выбрано',
}) => {
    if (empty) {
        return (
            <div className="dc-detail dc-detail--empty">
                <p>{emptyText}</p>
            </div>
        );
    }

    return (
        <section className="dc-detail">
            <header className="dc-detail__header">
                <div className="dc-detail__title-block">
                    <h2 className="dc-detail__title">{title}</h2>
                    {badge && <span className="dc-detail__badge">{badge}</span>}
                    {subtitle && <div className="dc-detail__subtitle">{subtitle}</div>}
                </div>
                {actions && <div className="dc-detail__actions">{actions}</div>}
            </header>

            {tabs && tabs.length > 0 && (
                <div className="dc-detail__tabs" role="tablist">
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={activeTab === t.key}
                            className={'dc-detail__tab' + (activeTab === t.key ? ' dc-detail__tab--active' : '')}
                            onClick={() => onTabChange?.(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="dc-detail__body">{children}</div>
        </section>
    );
};