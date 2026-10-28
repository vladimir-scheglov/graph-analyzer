import React from 'react';
import { useNavigation } from '../../../hooks/useNavigation';
import { MIcon } from '../../common/MIcon';
import { Section } from '../Section';
import type { MissingRefItem } from '../../../hooks/useSidebarStats';

export function MissingRefsSection({ items }: { items: MissingRefItem[] }) {
    const { goto } = useNavigation();
    if (items.length === 0) return null;

    return (
        <Section id="missing-refs" title="Битые FQID-ссылки" icon="link_off" badge={items.length}>
            <div className="rank-list">
                {items.map((item, i) => (
                    <div key={item.node.id} className="missing-ref-item">
                        <div
                            className="rank-item"
                            onClick={() => goto(item.node.data.domainId)}
                            style={{ cursor: 'pointer', padding: '4px 6px' }}
                            title={`${item.count} битых ссылок из этого домена`}
                        >
                            <span className="rank-item__num">{i + 1}</span>
                            <span className="rank-item__label">{item.node.data.domainId}</span>
                            <span className="rank-item__value" style={{ color: 'var(--warning)' }}>
                                {item.count}
                            </span>
                        </div>
                        {item.uniqueTargets.length > 0 && (
                            <div className="missing-ref-targets">
                                {item.uniqueTargets.slice(0, 3).map((t, ti) => (
                                    <div
                                        key={ti}
                                        className="missing-ref-target missing-ref-target--clickable"
                                        onClick={() => {
                                            // target — "domain.tld/Entity".
                                            // Берём только домен: goto найдёт узел
                                            // по domainId (включая missing_*).
                                            const slash = t.indexOf("/");
                                            if (slash > 0) goto(t.slice(0, slash));
                                        }}
                                        title={`Перейти к ${t}`}
                                    >
                                        <MIcon name="warning" size="sm" />
                                        <span>{t}</span>
                                    </div>
                                ))}
                                {item.uniqueTargets.length > 3 && (
                                    <div className="missing-ref-target missing-ref-target--more">
                                        ...и ещё {item.uniqueTargets.length - 3}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    );
}