import React, { useMemo, useState } from 'react';
import { useGraphStore } from '../../state/useGraphStore';
import { useModelIndex } from '../../hooks/useModelIndex';
import { buildAttributeMatrix, AttributeMatrixColumn } from '../../lib/model/attribute-matrix';
import { DomainCombobox } from '../common/DomainCombobox';
import { MIcon } from '../common';
import {
    ModalHelp,
    HelpSection,
    HelpText,
    HelpList,
    HelpButton,
} from '../common/ModalHelp';

export function AttributeMatrixModal() {
    const { index, loading, error } = useModelIndex();

    const open = useGraphStore((s) => s.attributeMatrixOpen);
    const [showHelp, setShowHelp] = useState(false);

    const [domainFilter, setDomainFilter] = useState('');
    const [minOccurrences, setMinOccurrences] = useState(2);
    const [onlyInconsistent, setOnlyInconsistent] = useState(false);

    const allDomains = useMemo(() => {
        if (!index) return [] as Array<[string, number]>;
        const map = new Map<string, number>();
        index.entities.forEach((e) => {
            map.set(e.domainId, (map.get(e.domainId) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    }, [index]);

    const matrix = useMemo(() => {
        if (!index) return null;
        return buildAttributeMatrix(index, {
            domains: domainFilter ? new Set([domainFilter.toLowerCase()]) : undefined,
            minOccurrences,
            maxColumns: 40,
            maxRows: 100
        });
    }, [index, domainFilter, minOccurrences]);

    const visibleColumns = useMemo(() => {
        if (!matrix) return [];
        if (!onlyInconsistent) return matrix.columns;
        return matrix.columns.filter((c) => !c.consistentType);
    }, [matrix, onlyInconsistent]);

    const openEntity = (fqid: string) => {
        const st = useGraphStore.getState();
        st.setAttributeMatrixOpen(false);
        st.setEntityCatalogInitialFqid(fqid);
        st.setEntityCatalogOpen(true);
    };

    if (!open) return null;

    return (
        <div
            className="help-overlay help-overlay--fullscreen"
            onMouseDown={() => useGraphStore.getState().setAttributeMatrixOpen(false)}
        >
            <div
                className="help-modal entity-matrix-modal"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="help-modal__header">
                    <div className="help-modal__title">
                        <MIcon name="grid_view" size="sm" />
                        <span className="icon-label">Матрица атрибутов</span>
                        {matrix && (
                            <span className="help-modal__badge">
                                {matrix.rows.length} × {visibleColumns.length}
                            </span>
                        )}
                    </div>
                    <div className="help-modal__actions">
                        <HelpButton
                            open={showHelp}
                            onToggle={() => setShowHelp(!showHelp)}
                            label="Как читать?"
                        />
                        <button
                            className="help-modal__close"
                            onClick={() => useGraphStore.getState().setAttributeMatrixOpen(false)}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="help-modal__body">
                        <div className="help-modal__loading">Загрузка индекса...</div>
                    </div>
                )}
                {error && (
                    <div className="help-modal__body">
                        <div style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
                    </div>
                )}

                {index && matrix && (
                    <div className="attribute-matrix-body">
                        <ModalHelp visible={showHelp}>
                            <HelpSection title="Как читать матрицу">
                                <HelpText>
                                    Строки — сущности, столбцы — имена атрибутов (по{" "}
                                    <code>name</code>, если оно задано, иначе по <code>id</code>;
                                    сравнение регистронезависимое). Точка в ячейке означает, что у
                                    сущности есть атрибут с таким именем.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>⚠ на заголовке столбца</strong> — атрибут с таким
                                        именем встречается у разных сущностей с <em>разными</em>{" "}
                                        типами данных. Это и есть главный сигнал матрицы.
                                    </li>
                                    <li>
                                        Строки отсортированы по количеству атрибутов (сверху —
                                        «богатые» сущности), чтобы первыми были те, у кого вероятнее
                                        всего есть общие атрибуты.
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Фильтр «Минимум упоминаний»">
                                <HelpText>
                                    Числовое поле над таблицей. Скрывает столбцы, которые встречаются
                                    меньше чем у указанного числа сущностей. Работает как нижний
                                    порог «популярности» атрибута.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>По умолчанию — 2.</strong> Атрибуты с единственным
                                        упоминанием (синглтоны) в матрицу не попадают: иначе таблица
                                        забивается сотнями уникальных колонок, и общие паттерны
                                        утонут в шуме.
                                    </li>
                                    <li>
                                        <strong>Значение 1</strong> — показать вообще всё, включая
                                        синглтоны. Полезно для поиска опечаток: <code>emial</code>{" "}
                                        vs <code>email</code> — обе колонки будут видны.
                                    </li>
                                    <li>
                                        <strong>Значение 5–10</strong> — оставить только «паттерны
                                        модели»: общие имена вроде <code>name</code>,{" "}
                                        <code>description</code>, <code>createdAt</code>. Убирает шум,
                                        оставляет суть.
                                    </li>
                                    <li>
                                        Поле принимает <strong>целые от 1 до 20</strong>. Выход за
                                        пределы молча обрезается (например, 100 → 20, 0 → 1).
                                    </li>
                                    <li>
                                        Сколько синглтонов скрыто — видно в подсказке справа от поля:{" "}
                                        <em>«Одиночных атрибутов: N»</em>. Это подсказка «может,
                                        стоит снизить порог до 1».
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Галочка «Только с разными типами»">
                                <HelpText>
                                    Оставляет в таблице только те столбцы, где атрибут с одним и тем
                                    же именем встречается у разных сущностей с <strong>разными</strong>{" "}
                                    <code>dataType</code>. Всё, что консистентно, скрывается.
                                </HelpText>
                                <HelpList>
                                    <li>
                                        <strong>Цифра в бейдже</strong> рядом с галочкой — общее
                                        количество таких «неконсистентных» колонок (совпадает с{" "}
                                        <code>matrix.stats.inconsistentTypes.length</code>). Бейдж
                                        виден, даже когда галочка не нажата, — чтобы вы знали,
                                        «есть ли что искать».
                                    </li>
                                    <li>
                                        <strong>Как определяется тип:</strong> по <code>dataType</code>{" "}
                                        атрибута (<code>String</code>, <code>Reference</code>,{" "}
                                        <code>enumSeverity</code>, <code>Table</code> …). Базовые и
                                        кастомные типы сравниваются в одном пространстве имён:{" "}
                                        <code>String</code> vs <code>enumStatus</code> — это разные
                                        типы, колонка попадёт в фильтр.
                                    </li>
                                    <li>
                                        <strong>Зачем:</strong> это самый быстрый способ найти баги
                                        консистентности. Пример: атрибут <code>status</code> у 15
                                        сущностей — <code>enumStatus</code>, а у 3 — <code>String</code>.
                                        Галочка покажет только эту колонку — остальные 199 столбцов
                                        уйдут. Дальше чините 3 «выпадающих» сущности.
                                    </li>
                                    <li>
                                        <strong>Работает вместе с «Минимум упоминаний»:</strong>{" "}
                                        сначала отсекаются редкие колонки (по порогу), потом — консистентные.
                                        Оба фильтра комбинируются по AND.
                                    </li>
                                    <li>
                                        <strong>Пустой результат</strong> — модель консистентна по
                                        всем атрибутам с таким порогом. Хороший знак: снизьте порог
                                        до 1, чтобы проверить синглтоны (там тип может отличаться,
                                        потому что всего 2 упоминания с разными типами).
                                    </li>
                                </HelpList>
                            </HelpSection>

                            <HelpSection title="Ограничения">
                                <HelpList>
                                    <li>
                                        Колонки ограничены 40, строки — 100 (топ по количеству
                                        упоминаний). Защита от тормозов на больших доменах.
                                    </li>
                                    <li>
                                        Вложенные атрибуты <code>Table</code> не участвуют в матрице —
                                        сравниваются только верхнеуровневые атрибуты сущностей. Для
                                        колонок таблиц используйте «Поиск атрибутов».
                                    </li>
                                    <li>
                                        Фильтр по домену сужает выборку. Чтобы сравнить домен с
                                        другими — переключите <code>DomainCombobox</code> в «Все
                                        домены».
                                    </li>
                                    <li>
                                        Синглтоны (атрибуты с одним упоминанием) в матрицу не попадают
                                        ни при каких настройках: в одном столбце всегда будет одна
                                        точка, что бесполезно. Их количество видно в подсказке под
                                        фильтром.
                                    </li>
                                </HelpList>
                            </HelpSection>
                        </ModalHelp>

                        <div className="attribute-matrix-toolbar">
                            <div className="attribute-matrix-toolbar__filters">
                                <DomainCombobox
                                    value={domainFilter}
                                    onChange={setDomainFilter}
                                    domains={allDomains}
                                    placeholder="Все домены"
                                />

                                <label className="entity-matrix-filter">
                                    <span>Минимум упоминаний:</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={20}
                                        value={minOccurrences}
                                        onChange={(e) =>
                                            setMinOccurrences(Math.max(1, parseInt(e.target.value, 10) || 1))
                                        }
                                        style={{ width: 60 }}
                                    />
                                </label>

                                <label className="entity-graph-toggle">
                                    <input
                                        type="checkbox"
                                        checked={onlyInconsistent}
                                        onChange={() => setOnlyInconsistent(!onlyInconsistent)}
                                    />
                                    Только с разными типами
                                    {matrix.stats.inconsistentTypes.length > 0 && (
                                        <span className="attribute-matrix-badge">
                                            {matrix.stats.inconsistentTypes.length}
                                        </span>
                                    )}
                                </label>
                            </div>

                            <div className="attribute-matrix-toolbar__stats">
                                {matrix.stats.singletons.length > 0 && (
                                    <span className="attribute-matrix-hint">
                                        Одиночных атрибутов: {matrix.stats.singletons.length}
                                    </span>
                                )}
                            </div>
                        </div>

                        {visibleColumns.length === 0 ? (
                            <div className="entity-matrix-empty">
                                Нет атрибутов, удовлетворяющих фильтрам
                            </div>
                        ) : (
                            <div className="attribute-matrix-scroll">
                                <table className="attribute-matrix-table">
                                    <thead>
                                        <tr>
                                            <th className="attribute-matrix-corner">Сущность</th>
                                            {visibleColumns.map((col) => (
                                                <th
                                                    key={col.key}
                                                    className={
                                                        'attribute-matrix-col-head' +
                                                        (!col.consistentType ? ' inconsistent' : '')
                                                    }
                                                    title={
                                                        col.dataTypes.join(', ') +
                                                        '\nвстречается у ' + col.count + ' сущностей'
                                                    }
                                                >
                                                    <span className="attribute-matrix-col-head__text">
                                                        {col.label}
                                                    </span>
                                                    {!col.consistentType && (
                                                        <span className="attribute-matrix-col-head__warn">⚠</span>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matrix.rows.map((row) => (
                                            <tr key={row.entityFqid}>
                                                <th
                                                    className="attribute-matrix-row-head"
                                                    title={row.entityFqid}
                                                    onClick={() => openEntity(row.entityFqid)}
                                                >
                                                    <span className="attribute-matrix-row-head__id">
                                                        {row.entityId}
                                                    </span>
                                                    <span className="attribute-matrix-row-head__domain">
                                                        {row.domainId}
                                                    </span>
                                                </th>
                                                {visibleColumns.map((col) => {
                                                    const has = row.present.has(col.key);
                                                    return (
                                                        <td
                                                            key={col.key}
                                                            className={
                                                                'attribute-matrix-cell' +
                                                                (has ? ' present' : '')
                                                            }
                                                            title={has ? `есть ${col.label}` : ''}
                                                        >
                                                            {has && <span className="attribute-matrix-cell__dot" />}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}