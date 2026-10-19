import React from 'react';

export interface YamlViewerHelpProps {
    onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="modal-help__section">
            <h3 className="modal-help__title">{title}</h3>
            {children}
        </div>
    );
}

function List({ children }: { children: React.ReactNode }) {
    return <ul className="modal-help__list">{children}</ul>;
}

function P({ children }: { children: React.ReactNode }) {
    return <p className="modal-help__text">{children}</p>;
}

export function YamlViewerHelp({ onClose }: YamlViewerHelpProps) {
    return (
        <div className="help-overlay" style={{ zIndex: 600 }} onMouseDown={onClose}>
            <div className="help-modal" style={{ width: 720, maxWidth: '92vw' }} onMouseDown={(e) => e.stopPropagation()}>
                <div className="help-modal__header">
                    <div className="help-modal__title">📖 Справка по редактору схем</div>
                    <button className="help-modal__close" onClick={onClose}>✕</button>
                </div>
                <div className="help-modal__body">
                    <div className="modal-help" style={{ padding: 0, background: 'transparent', border: 0 }}>

                        <Section title="Хлебные крошки и быстрые переходы">
                            <P>
                                Над редактором бежит полоса с текущей позицией курсора:
                                <code> entities › Device › hostname :42</code>. Каждый сегмент кликабельный —
                                клик перебрасывает к строке объявления.
                            </P>
                            <List>
                                <li><strong>Секции</strong> (entities, views, dataRules) — переход к началу секции.</li>
                                <li><strong>Сущности/атрибуты/виджеты</strong> — переход к строке их объявления.</li>
                                <li><strong>Номер строки</strong> справа — текущая позиция курсора.</li>
                                <li><strong>Quick Jumps</strong> (иконки справа от крошек) — быстрый переход к секциям (<code>📦 entities</code>, <code>🔗 linkages</code>, <code>👁 views</code>, и т.д.).</li>
                            </List>
                        </Section>

                        <Section title="Навигация по коду">
                            <List>
                                <li>
                                    <code>Ctrl+Shift+O</code> — список всех символов (секции, сущности, атрибуты).
                                </li>
                                <li>
                                    <strong><code>Ctrl+Click</code></strong> — переход к определению.
                                    Работает для <code>inherits</code>, <code>entity</code>, <code>attribute</code>, <code>view</code>, <code>action</code>, <code>linkage</code>.
                                </li>
                                <li>
                                    <code>Ctrl+Shift+F12</code> или <code>Alt+F12</code> — альтернатива Ctrl+Click
                                    (F12 в браузере открывает DevTools, поэтому основные хоткеи — эти).
                                </li>
                                <li>
                                    <code>Ctrl+Alt+F12</code> — открыть сущность из чужого домена (<code>other.domain/Entity</code>) в каталоге.
                                </li>
                            </List>
                        </Section>

                        <Section title="Поиск и перемещение">
                            <List>
                                <li><code>Ctrl+F</code> — поиск по файлу.</li>
                                <li><code>Ctrl+G</code> — перейти к строке.</li>
                                <li><code>Alt+↑</code> / <code>Alt+↓</code> — предыдущая / следующая строка.</li>
                                <li><code>Ctrl+Home</code> / <code>Ctrl+End</code> — начало / конец файла.</li>
                            </List>
                        </Section>

                        <Section title="Левая панель навигации">
                            <List>
                                <li>Клик по треугольнику — свернуть/развернуть секцию.</li>
                                <li>Клик по <code>→</code> — переход к началу секции.</li>
                                <li>
                                    Рядом с названием секции — <code>~N</code> строк и счётчик элементов.
                                </li>
                                <li>
                                    Кнопка <code>⚠ N</code> рядом с «Навигация» — toggle «только проблемные».
                                    Показывает только сущности и атрибуты с issues.
                                </li>
                                <li>
                                    Бейджи <code>⚠</code> на сущностях и атрибутах — наведите, чтобы увидеть,
                                    какие именно проблемы (до 5 + «...и ещё N»).
                                </li>
                                <li>Поле поиска сверху — фильтр по id.</li>
                                <li>Кнопки <code>⤢ ⤡</code> — развернуть / свернуть всё.</li>
                                <li>
                                    Ресайз: потяните за правую границу панели — ширина запоминается
                                    (180–600px).
                                </li>
                            </List>
                        </Section>

                        <Section title="Мини-карта секций">
                            <P>
                                Справа от редактора — узкая полоса. Каждый сегмент — одна секция,
                                пропорциональный её длине.
                            </P>
                            <List>
                                <li><strong style={{ color: '#6366f1' }}>Синий</strong> — секция без проблем.</li>
                                <li><strong style={{ color: '#f59e0b' }}>Жёлтый</strong> — есть warning.</li>
                                <li><strong style={{ color: '#ef4444' }}>Красный</strong> — есть error.</li>
                                <li>Клик по сегменту — переход к секции.</li>
                                <li>Учитывает фильтр severity в панели «Проблемы».</li>
                            </List>
                        </Section>

                        <Section title="Правая панель — 4 таба">
                            <List>
                                <li>
                                    <strong>🔧 Проблемы</strong> — issues из линтера. С фильтром severity
                                    (Ошибки / Предупр. / Инфо) и переключателем группировки
                                    «По правилу / По сущности».
                                </li>
                                <li>
                                    <strong>🔗 Ссылки</strong> — исходящие FQID-ссылки (на другие домены),
                                    сгруппированные по домену.
                                </li>
                                <li>
                                    <strong>📥 Используется</strong> (backlinks) — кто ссылается
                                    на текущую сущность или атрибут. Показывает:
                                    <ul style={{ marginTop: 4, marginBottom: 0 }}>
                                        <li><strong>Наследование</strong> — кто наследует сущность;</li>
                                        <li><strong>Reference</strong> — атрибуты, ссылающиеся на неё;</li>
                                        <li><strong>View</strong> — где сущность упомянута как <code>entity:</code>;</li>
                                        <li><strong>DataRule</strong> — правила данных;</li>
                                        <li><strong>Widget</strong> — виджеты, использующие атрибут;</li>
                                        <li><strong>Linkage</strong> — связи (side1/side2);</li>
                                        <li><strong>Mixin / Action</strong> — примеси и действия.</li>
                                    </ul>
                                    Все пункты кликабельные — переход к строке.
                                </li>
                                <li>
                                    <strong>☁ Сервер</strong> — валидация через R-Vision (только в режиме <code>--server</code>).
                                </li>
                            </List>
                        </Section>

                        <Section title="Действия (actions)">
                            <P>
                                Действия — операции над объектами сущности. Бывают простые (открытие панели / модалки),
                                массовые (bulk) и интеграционные (automation, scenario).
                            </P>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Простые действия</h4>
                            <List>
                                <li><strong>open_panel</strong> — <code>panel: &lt;viewId&gt;</code>, <code>entity</code>.</li>
                                <li><strong>open_modal</strong> — <code>modal: &lt;viewId&gt;</code>, <code>entity</code>, <code>operation: create | edit</code>.</li>
                                <li><strong>open_page</strong> — <code>view: &lt;viewId&gt;</code>, <code>entity</code>, <code>operation</code>.</li>
                                <li><strong>open_list</strong> — <code>view</code>, <code>contextPin</code>, <code>page</code>.</li>
                                <li><strong>remove</strong> — удаление объекта, нужен только <code>entity</code>.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Массовые действия (type: bulk)</h4>
                            <List>
                                <li><strong>operation: remove</strong> — удалить выбранные объекты.</li>
                                <li><strong>operation: edit</strong> — редактировать атрибуты выбранных. Требует:
                                    <ul style={{ marginTop: 4, marginBottom: 0 }}>
                                        <li><code>attributes.type: specific</code></li>
                                        <li><code>attributes.use[]</code> — список атрибутов (<code>attribute: attrId</code>)</li>
                                        <li>опционально <code>linkages[]</code> — для массового редактирования связей (<code>widget: widgetId</code>)</li>
                                    </ul>
                                </li>
                                <li><strong>operation: edit_attribute</strong> — установить значение атрибута (bool / workflow). Требует:
                                    <ul style={{ marginTop: 4, marginBottom: 0 }}>
                                        <li><code>values[]</code> — <code>attribute</code> + <code>value</code></li>
                                        <li><code>control</code> — для bool-атрибутов: <code>type</code>, <code>trueText</code>, <code>falseText</code></li>
                                    </ul>
                                </li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Интеграционные действия</h4>
                            <List>
                                <li><strong>automation</strong> — запуск автоматизации. Указывается <code>automation.id</code> (UUID).</li>
                                <li><strong>scenario</strong> — запуск сценария/скрипта: <code>scenario</code> (id) + <code>workerTag</code>.</li>
                                <li><strong>generate_qr_code</strong> — генерация QR, только <code>entity</code>.</li>
                                <li><strong>copy_entity_link</strong> — копировать URL объекта.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Валидация</h4>
                            <List>
                                <li><code>modal</code>, <code>panel</code>, <code>view</code> — проверяется, что view существует в домене.</li>
                                <li><code>automation.id</code> — предупреждение, если не UUID.</li>
                                <li><code>values[].attribute</code> — проверяется, что атрибут существует в <code>entity</code> действия.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Сниппеты</h4>
                            <List>
                                <li><code>✨ newbulkdelete</code> — массовое удаление.</li>
                                <li><code>✨ newbulkedit</code> — массовое редактирование атрибутов.</li>
                                <li><code>✨ newbulkattr</code> — изменить bool-атрибут у выбранных.</li>
                                <li><code>✨ newautomationaction</code> — запуск автоматизации по UUID.</li>
                                <li><code>✨ newscenarioaction</code> — запуск сценария.</li>
                            </List>
                        </Section>

                        <Section title="Views: List-view">
                            <P>
                                Список объектов сущности. Один из самых больших разделов схемы —
                                содержит таблицу, фильтры, сортировки и действия.
                            </P>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Базовые поля</h4>
                            <List>
                                <li><strong>source.type</strong>: <code>operational</code> (БД системы).</li>
                                <li><strong>source.entity</strong>: сущность, чьи объекты отображаются.</li>
                                <li><strong>source.joins[]</strong>: связи для отображения связанных сущностей.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Таблица (table)</h4>
                            <List>
                                <li><strong>columns[]</strong>: столбцы — <code>id</code>, <code>attribute</code>, <code>label</code>, <code>layout.width</code>, <code>control</code>, <code>aggregate</code>.</li>
                                <li><strong>filter</strong>: фильтрация — <code>attributes</code> (type: specific|all, use[]) и <code>linkages</code>.</li>
                                <li><strong>sortingBy</strong>: сортировка — <code>columns[]</code> (column + sorting) и <code>defaults</code> (column + direction).</li>
                                <li><strong>paging</strong>: <code>sizes[]</code> + <code>defaultSize</code>.</li>
                                <li><strong>refresh</strong>: <code>mode</code> (manual/auto/all) + <code>defaults</code> (unit, interval, enabled).</li>
                                <li><strong>selection</strong>: возможность выбора строк для массовых действий.</li>
                                <li><strong>actions[]</strong>: действия при клике — <code>row_click</code>, <code>row_double_click</code>, <code>row_context_menu</code>.</li>
                                <li><strong>empty.message</strong>: текст при отсутствии данных.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Типы редакторов в колонке</h4>
                            <List>
                                <li><strong>text</strong> / <strong>text_area</strong> — однострочное / многострочное поле.</li>
                                <li><strong>select</strong> / <strong>radio</strong> — выпадающий список / радиокнопки (для Enum, Workflow).</li>
                                <li><strong>tag</strong> / <strong>level</strong> — тег / уровень.</li>
                                <li><strong>bool_text</strong> — текст вместо true/false (нужны <code>trueText</code>, <code>falseText</code>).</li>
                                <li><strong>timestamp</strong> / <strong>date</strong> / <strong>time</strong> — форматирование дат.</li>
                                <li><strong>tree_path</strong> — путь в дереве (нужен <code>tree</code>).</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Сниппеты</h4>
                            <List>
                                <li><code>✨ newlisttable</code> — таблица с 3 колонками.</li>
                                <li><code>✨ newtablecolumn</code> — одна колонка с width.</li>
                                <li><code>✨ newtablefilter</code> — фильтр attributes+linkages (type: all).</li>
                                <li><code>✨ newtablesorting</code> — сортировка по колонке.</li>
                                <li><code>✨ newtablepaging</code> — пагинация 10/50/100.</li>
                                <li><code>✨ newtablerefresh</code> — автообновление 5 минут.</li>
                                <li><code>✨ newtablerowclick</code> — действие по клику на строку.</li>
                                <li><code>✨ newtablecontextmenu</code> — контекстное меню.</li>
                                <li><code>✨ newtableaggregate</code> — колонка с count по связи.</li>
                                <li><code>✨ newlistfull</code> — полный list-view с таблицей, фильтром, сортировкой, пагинацией.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Валидация</h4>
                            <List>
                                <li><code>column:</code> в <code>sortingBy</code> — проверяется, что столбец есть в <code>columns[]</code>.</li>
                            </List>
                        </Section>

                        <Section title="Views: Entity-view">
                            <P>
                                Карточка сущности. Содержит виджеты, группы (блоки/вкладки/формы) и вложенные карточки
                                (панели, модалки, полноэкранные представления).
                            </P>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Виджеты (widgets[])</h4>
                            <List>
                                <li><strong>attribute</strong> — виджет атрибута (нужен <code>attribute</code> + <code>control.type</code>).</li>
                                <li><strong>action</strong> — виджет действия (нужен <code>action</code> или <code>actions[]</code>).</li>
                                <li><strong>linkage</strong> — редактор связей (нужны <code>linkage</code>, <code>side</code>, <code>control</code>).</li>
                                <li><strong>join</strong> — транзитивная связь (нужны <code>joinId</code>, <code>attribute</code> / <code>aggregate</code>).</li>
                                <li><strong>history</strong> — история событий (<code>eventStorageId</code>).</li>
                                <li><strong>runs_history</strong> — история запусков сценариев.</li>
                                <li><strong>comments</strong>, <strong>conversation</strong>, <strong>card</strong>, <strong>visualization</strong>, <strong>linked_objects_groups</strong> и др.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Редакторы атрибутов (control.type)</h4>
                            <List>
                                <li><code>text</code>, <code>text_area</code> — однострочный / многострочный.</li>
                                <li><code>select</code>, <code>radio</code>, <code>tag</code>, <code>level</code> — для Enum/Workflow.</li>
                                <li><code>switch</code>, <code>checkbox</code>, <code>bool_text</code> — для Bool.</li>
                                <li><code>timestamp</code>, <code>date</code>, <code>time</code> — для дат.</li>
                                <li><code>link</code> — для URL.</li>
                                <li><code>file</code>, <code>drag_drop_area</code> — для Attachment.</li>
                                <li><code>slider</code> — для числовых с шагом.</li>
                                <li><code>tree_path</code> — путь в дереве (нужен <code>tree</code>).</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Редактор связей (widgets[].control)</h4>
                            <List>
                                <li><strong>select</strong> — для side: 1 (один объект).</li>
                                <li><strong>multi_select</strong> — компактный список тегов (side: 2).</li>
                                <li><strong>table</strong> — расширенная таблица (side: 2). Нужны <code>columns[]</code>, <code>addLinksView</code>.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Группы (groups[])</h4>
                            <List>
                                <li><strong>block</strong> — блок с <code>layout.direction: column</code> и <code>components[]</code>.</li>
                                <li><strong>tab</strong> — вкладка, содержит блоки (<code>components[].block</code>).</li>
                                <li><strong>form</strong> — форма создания/редактирования (для модалки).</li>
                                <li><strong>tabs</strong> — панель вкладок (для полноэкранной карточки).</li>
                                <li><strong>resizable_block_pair</strong> — две секции с ресайзом (<code>sizeRatio</code>, <code>minHeight</code>, <code>maxHeight</code>).</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Вложенные карточки (views[].views[])</h4>
                            <List>
                                <li><strong>panel</strong> — компактное представление, <code>tabs[]</code> + <code>menu[]</code> + <code>onView[]</code>.</li>
                                <li><strong>modal</strong> — модалка, <code>form</code> + <code>buttons[]</code> + <code>footer[]</code>.</li>
                                <li><strong>page</strong> — полноэкранная карточка, <code>actionPanel[]</code> + <code>tabs[]</code> / <code>block</code> + <code>pinnedView</code>.</li>
                            </List>

                            <h4 style={{ fontSize: 12, color: "var(--text-200)", marginTop: 12, marginBottom: 6 }}>Сниппеты</h4>
                            <List>
                                <li><code>✨ newentityview</code> — полный entity-view (widgets, groups, panel, modal).</li>
                                <li><code>✨ newwidgetattr</code> — виджет атрибута с control.</li>
                                <li><code>✨ newwidgetlinkage</code> — виджет связи с таблицей.</li>
                                <li><code>✨ newwidgetjoin</code> — транзитивная связь.</li>
                                <li><code>✨ newblock</code>, <code>✨ newtab</code>, <code>✨ newform</code> — группы.</li>
                                <li><code>✨ newpanel</code>, <code>✨ newmodal</code>, <code>✨ newpage</code> — карточки.</li>
                                <li><code>✨ newinherit</code> — наследование группы/меню/вкладок.</li>
                            </List>
                        </Section>

                        <Section title="Серверная валидация">
                            <P>
                                Кнопка <code>☁</code> в шапке отправляет <strong>текущую</strong> схему (включая
                                несохранённые изменения) на проверку в R-Vision.
                            </P>
                            <List>
                                <li>Работает только в режиме <code>--server</code> (нужны креды).</li>
                                <li>
                                    После проверки: зелёная иконка <code>☁✓</code> — валидна; красная
                                    <code>☁✗</code> — есть ошибки.
                                </li>
                                <li>
                                    Ошибки сервера подсвечиваются в редакторе (красные/жёлтые маркеры
                                    поверх локального линтера).
                                </li>
                                <li>Клик по ошибке в панели «Сервер» → переход к строке.</li>
                            </List>
                        </Section>

                        <Section title="Автокомплит полей">
                            <P>
                                В любом месте YAML при наборе буквы появляется панель подсказок
                                с полями, релевантными текущему контексту.
                            </P>
                            <List>
                                <li><strong>Поля</strong> — <code>id</code>, <code>name</code>, <code>dataType</code>,
                                    <code>description</code>, <code>constraints</code>, <code>readonly</code> и т.д.
                                    Порядок: сначала обязательные (<code>required</code>).</li>
                                <li><strong>Значения</strong> — <code>dataType: </code> → базовые и кастомные типы;
                                    <code>inherits: </code>, <code>entity: </code>, <code>side1/side2: </code> — сущности.</li>
                                <li><strong>Сниппеты</strong> — префикс <code>new*</code> → шаблон блока (см. ниже).</li>
                                <li>Наведите на подсказку — показывается тип, required-статус, описание.</li>
                            </List>
                        </Section>

                        <Section title="Сниппеты — шаблоны блоков">
                            <P>
                                Наберите префикс в нужном месте (под секцией или внутри неё) и выберите
                                подсказку с иконкой <code>✨</code>. Сниппет вставит готовый блок с корректными отступами.
                            </P>
                            <div className="snippets-table">
                                <div className="snippets-table__head">
                                    <span>Префикс</span>
                                    <span>Что вставляет</span>
                                    <span>Где</span>
                                </div>
                                {[
                                    ['newentity', 'Новая сущность с примером атрибута', 'entities'],
                                    ['newattr', 'Новый атрибут', 'entities[].attributes'],
                                    ['newref', 'Атрибут-Reference', 'entities[].attributes'],
                                    ['newarr', 'Атрибут-Array', 'entities[].attributes'],
                                    ['newidentifier', 'Атрибут-Identifier (шаблон + префикс)', 'entities[].attributes'],
                                    ['newlinkage', 'Новая связь 1_n с nameFrom', 'linkages'],
                                    ['newaction', 'Действие open_modal', 'actions'],
                                    ['newrule', 'Правило данных с RQL-условием', 'dataRules'],
                                    ['newview', 'Entity-view с виджетами и блоком', 'views'],
                                    ['newlist', 'List-view (список объектов)', 'views'],
                                    ['newwidget', 'Виджет атрибута', 'views[].widgets'],
                                    ['newgroup', 'Группа типа block', 'views[].groups'],
                                    ['newmixin', 'Миксин на панель', 'mixins'],
                                    ['newmenu', 'Пункт меню с подпунктом', 'menus'],
                                    ['newmedia', 'Иконка', 'medias'],
                                    ['newsequence', 'Последовательность идентификатора', 'sequences'],
                                    ['newenum', 'Enum-тип данных с примерами значений', 'dataTypes'],
                                    ['newworkflow', 'Workflow-тип с начальным статусом и переходами', 'dataTypes'],
                                    ['newtable', 'Table-тип с колонкой', 'dataTypes'],
                                    ['newenumvalue', 'Значение Enum', 'dataTypes[].values'],
                                    ['newworkflowstatus', 'Статус Workflow', 'dataTypes[].statuses'],
                                    ['newtransition', 'Переход Workflow', 'dataTypes[].transitions'],
                                    ['newconstraint', 'Constraint (required / range / regexp...)', 'entities[].attributes[].constraints'],
                                    ['newconstraintlen', 'Constraint: length с min/max', 'entities[].attributes[].constraints'],
                                    ['newprefixrule', 'Правило подстановки префикса', 'entities[].attributes[].prefixRules'],
                                    ['newprojection', 'Проекция сущности', 'entities (root)'],
                                    ['newsearching', 'Правила поиска сущности', 'entities (root)'],
                                    ['newcountercolor', 'Цветовая схема счётчика', 'counterColorPattern'],
                                    ['newtree', 'Дерево связей с 1 уровнем вложенности', 'trees'],
                                    ['newtransitive', 'Транзитивная связь (1 хоп)', 'transitiveLinkages'],
                                    ['newjoins', 'Следующий хоп цепочки', 'transitiveLinkages[].joins'],
                                    ['newuirule', 'UI Rule: скрыть виджет', 'uiRules'],
                                    ['newuirulevariant', 'UI Rule: вариант с пресетом', 'uiRules'],
                                    ['newuirulenested', 'UI Rule: скрыть колонку таблицы', 'uiRules'],
                                    ['newuipreset', 'UI Preset (стили)', 'uiPresets'],
                                    ['newpresetref', 'Ссылка на пресет в widgets/groups/columns', 'uiRules[].rule.*'],
                                    ['newbulkdelete', 'Массовое удаление объектов', 'actions'],
                                    ['newbulkedit', 'Массовое редактирование атрибутов', 'actions'],
                                    ['newbulkattr', 'Изменить bool-атрибут у выбранных', 'actions'],
                                    ['newautomationaction', 'Запуск автоматизации (UUID)', 'actions'],
                                    ['newscenarioaction', 'Запуск сценария/скрипта', 'actions'],
                                    ['newlisttable', 'Таблица с 3 колонками', 'views[].table'],
                                    ['newtablecolumn', 'Колонка таблицы', 'views[].table.columns'],
                                    ['newtablefilter', 'Фильтр по атрибутам и связям', 'views[].table'],
                                    ['newtablesorting', 'Сортировка по колонке', 'views[].table'],
                                    ['newtablepaging', 'Пагинация таблицы', 'views[].table'],
                                    ['newtablerefresh', 'Автообновление таблицы', 'views[].table'],
                                    ['newtablerowclick', 'Действие при клике на строку', 'views[].table'],
                                    ['newtablecontextmenu', 'Контекстное меню строки', 'views[].table'],
                                    ['newtableaggregate', 'Колонка с агрегацией count', 'views[].table'],
                                    ['newlistfull', 'Полный list-view с таблицей', 'views'],
                                    ['newentityview', 'Полный entity-view (panel + modal)', 'views'],
                                    ['newwidgetattr', 'Виджет атрибута с control', 'views[].widgets'],
                                    ['newwidgetlinkage', 'Виджет связи (table)', 'views[].widgets'],
                                    ['newwidgetjoin', 'Виджет транзитивной связи', 'views[].widgets'],
                                    ['newblock', 'Группа block', 'views[].groups'],
                                    ['newtab', 'Вкладка', 'views[].groups'],
                                    ['newform', 'Группа form', 'views[].groups'],
                                    ['newpanel', 'Панель (компактное)', 'views[].views'],
                                    ['newmodal', 'Модальное окно', 'views[].views'],
                                    ['newpage', 'Полноэкранная карточка', 'views[].views'],
                                    ['newinherit', 'Наследование группы/меню', 'views[].groups[].components'],
                                    ['newmenuroot', 'Корневая группа меню с подпунктом', 'menus'],
                                    ['newmenuitem', 'Пункт меню', 'menus[].items'],
                                    ['newmedia', 'Иконка', 'medias'],
                                    ['newmixinview', 'Миксин вкладки (type: view)', 'mixins'],
                                    ['newmixinlinkage', 'Миксин на связи (type: linkage)', 'mixins'],
                                    ['newexchange', 'Настройки обмена данными', 'exchangeSettings'],
                                    ['newexchangeentity', 'Обмен для одной сущности', 'exchangeSettings.entities'],
                                ].map(([prefix, desc, ctx]) => (
                                    <div key={prefix} className="snippets-table__row">
                                        <code>✨ {prefix}</code>
                                        <span>{desc}</span>
                                        <code className="snippets-table__ctx">{ctx}</code>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="Редактирование и блокировка">
                            <List>
                                <li>
                                    <code>🔒</code> — файл заблокирован (read-only). Кнопка в шапке.
                                    Лампочки Quick Fix доступны и в этом режиме: при применении фикса
                                    файл автоматически разблокируется.
                                </li>
                                <li>
                                    <strong>Двойной Shift</strong> — быстрая разблокировка / блокировка.
                                    Срабатывает, если между двумя нажатиями Shift не было других клавиш.
                                </li>
                                <li><code>📋</code> — копировать содержимое в буфер.</li>
                                <li><code>💾</code> или <code>Ctrl+S</code> — сохранить (только в локальном режиме).</li>
                            </List>
                        </Section>

                        <Section title="Валидация YAML">
                            <P>
                                Схема проверяется на синтаксис прямо в редакторе через <code>js-yaml</code>.
                                Ошибки YAML (неверные отступы, табы, дубликаты ключей, незакрытые кавычки)
                                показываются красным маркером в строке.
                            </P>
                            <List>
                                <li>Ошибка появляется первой в панели «Проблемы» с источником <code>yaml-syntax</code>.</li>
                                <li>При попытке сохранить файл с errors — предупреждение в модалке: «В схеме N ошибок. Всё равно сохранить?».</li>
                            </List>
                        </Section>

                        <Section title="Проверки RQL">
                            <List>
                                <li><strong>Синтаксис</strong> — незакрытые скобки, кавычки, обрезанные операторы.</li>
                                <li><strong>Поля</strong> — <code>@field</code> проверяется на существование в контекстной сущности.</li>
                                <li><strong>Типы</strong> — сравнение строки с числом, числа со строкой.</li>
                                <li><strong>@doc.attr</strong> — проверяется наличие атрибута в сущности.</li>
                                <li><strong>@DataType.value</strong> — проверяется членство в Enum/Workflow.</li>
                                <li><strong>FROM(...)</strong> / <strong>join(...)</strong> — поля внутри алиасов не ломают проверку.</li>
                            </List>
                        </Section>

                        <Section title="Code Actions (лампочки) и Quick Fix">
                            <P>
                                В строках с проблемой слева появляется <strong>💡 лампочка</strong>.
                                Клик или <code>Ctrl+.</code> / <code>Alt+Enter</code> открывает быстрые фиксы.
                            </P>
                            <List>
                                <li><strong>🐫 Переименовать в camelCase</strong> — <code>device_config</code> → <code>deviceConfig</code>,
                                    <code>Device_Config</code> → <code>DeviceConfig</code>.</li>
                                <li><strong>🏷️ Добавить label</strong> — вставляет <code>label: "&#123;id&#125;"</code> под сущностью.</li>
                                <li><strong>📝 Добавить description</strong> — вставляет <code>description: ""</code> в сущность
                                    или атрибут (с корректным отступом).</li>
                                <li><strong>📖 Показать справку</strong> — текст правила и рекомендация.</li>
                                <li><strong>🔬 Открыть линтер</strong> — переход к списку всех проблем домена.</li>
                                <li><strong>🔇 Игнорировать</strong> — скрыть это правило (сохраняется в localStorage, только для текущего файла).</li>
                            </List>
                        </Section>

                        <Section title="Diff с предыдущим сохранением">
                            <List>
                                <li>Кнопка <code>🔍 Diff</code> в шапке появляется, если файл сохранялся хотя бы раз.</li>
                                <li>Показывает side-by-side сравнение с предыдущей версией на диске.</li>
                                <li>После сохранения — diff автоматически обновится.</li>
                            </List>
                        </Section>

                        <Section title="Cross-domain счётчики">
                            <P>
                                В строке счётчиков под шапкой — бейджи <code>→ N исх.</code> и <code>← M вх.</code>.
                                Это ссылки на другие домены через <code>Reference</code> и <code>inherits</code>.
                            </P>
                            <List>
                                <li>Наведите на бейдж — тултип со списком доменов.</li>
                                <li>Клик по домену в тултипе — открывается схема этого домена поверх редактора.</li>
                                <li>После закрытия схемы — редактор остаётся на месте (с курсором и историей).</li>
                            </List>
                        </Section>

                        <Section title="Неиспользуемые атрибуты">
                            <P>
                                Атрибуты, которые не упомянуты ни в <code>views[].widgets[].attribute</code>,
                                ни в <code>dataRules[].attributes[].attribute</code>, подсвечиваются:
                            </P>
                            <List>
                                <li>Слева — жёлтая вертикальная полоса.</li>
                                <li>Текст — серый курсив.</li>
                                <li>Наведение — tooltip «Атрибут не используется ни в представлениях, ни в правилах данных».</li>
                            </List>
                        </Section>

                        <Section title="Подсказки при наведении">
                            <List>
                                <li>Наведите на <code>id: Device</code> или <code>inherits: Device</code> — тултип с полной цепочкой наследования и списком наследников.</li>
                                <li>Наведите на <code>dataType: enumIocTypes</code> — тип, значения (для Enum), статусы (для Workflow), колонки (для Table).</li>
                                <li>Наведите на <code>attribute: Requirement.identifier</code> — тип, ограничения, ссылки.</li>
                            </List>
                        </Section>

                        <Section title="Ресайз панелей">
                            <List>
                                <li>Левая панель навигации — тяните за правую границу (180–600px).</li>
                                <li>Кнопки <code>‹ ›</code> в шапке — свернуть / развернуть левую и правую панели.</li>
                            </List>
                        </Section>
                        <Section title="Деревья (trees)">
                            <P>
                                Древовидные связи — иерархии типа «Каталог», «Стандарты», «Оргструктура». Описывают
                                вложенность сущностей через связи с ограничениями по глубине и количеству.
                            </P>
                            <List>
                                <li><strong>type</strong>: <code>ordinary</code> | <code>orderable</code> (сортировка) | <code>multiparent</code> (лист в нескольких группах).</li>
                                <li><strong>hierarchy</strong> — корневая сущность и рекурсивное дерево <code>children</code>.</li>
                                <li><strong>sorting</strong> — правила сортировки по уровням (своя сортировка для каждой сущности в дереве).</li>
                                <li>Вложенность: <code>sorting[].by[]</code> может быть двухуровневым — внешний описывает сущность, внутренний — атрибуты.</li>
                            </List>
                            <P>
                                Сниппет: <code>✨ newtree</code> — дерево с 1 уровнем вложенности и сортировкой.
                            </P>
                        </Section>

                        <Section title="Транзитивные связи (transitiveLinkages)">
                            <P>
                                Цепочки связей через промежуточные сущности. Позволяют показывать данные связанных
                                объектов через несколько хопов (Equipment → City → Office → Country) в списках
                                и карточках.
                            </P>
                            <List>
                                <li><strong>entity</strong> — сущность-корень, для которой строится дерево.</li>
                                <li><strong>joins[]</strong> — цепочка связей. Вложенность через <code>joins[].joins[]</code>.</li>
                                <li><strong>search</strong> — включить поиск по узлу (<code>entity</code> / <code>linkage</code> / <code>both</code>).</li>
                                <li>В списочных представлениях используется через <code>join:</code> в колонках и фильтрах.</li>
                            </List>
                            <P>
                                Сниппеты: <code>✨ newtransitive</code> (1 хоп), <code>✨ newjoins</code> (следующий хоп).
                            </P>
                        </Section>

                        <Section title="UI Rules (uiRules + uiPresets)">
                            <P>
                                Правила представлений — условное скрытие, изменение стилей и доступности
                                элементов UI в зависимости от роли пользователя, данных объекта или контекста.
                            </P>
                            <List>
                                <li><strong>target</strong>: <code>list_view</code> (списочное), <code>entity_view</code> (карточка/модалка), <code>entity_attribute</code> (колонки таблиц/элементы массивов).</li>
                                <li><strong>view</strong> — представление, к которому применяется правило.</li>
                                <li><strong>context.views[]</strong> — ограничить применение правилом только перечисленными view (для entity_view).</li>
                                <li><strong>condition</strong> — RQL-условие. Если true — правило срабатывает.</li>
                                <li><strong>rule.effect</strong>: <code>hidden</code>, <code>show</code>, <code>hiddenEmpty</code>, <code>readonly</code>, <code>editable</code>, <code>inherit</code>, <code>variant</code>.</li>
                                <li><strong>rule.widgets[]</strong>, <strong>rule.groups[]</strong>, <strong>rule.columns[]</strong> — на что действует.</li>
                                <li><strong>nested</strong> — для виджетов Array/Table: применить к отдельным колонкам/элементам.</li>
                                <li><strong>presets</strong> — применить <code>uiPresets</code> (цвет, шрифт, свёрнутость).</li>
                            </List>
                            <P>
                                <strong>uiPresets</strong> — именованные наборы CSS-свойств: <code>color</code>, <code>font-weight</code>,
                                <code>background-color</code>, <code>collapsed</code> и т.д.
                            </P>
                            <P>
                                Сниппеты: <code>✨ newuirule</code> (hidden), <code>✨ newuirulevariant</code> (с пресетом),
                                <code>✨ newuirulenested</code> (колонка таблицы), <code>✨ newuipreset</code>,
                                <code>✨ newpresetref</code>.
                            </P>
                            <P>
                                <strong>Валидация:</strong> если в правиле указана ссылка на несуществующий view / widget / group / column / preset,
                                строка подсвечивается жёлтым маркером.
                            </P>
                            <P>
                                <strong>Автокомплит:</strong> в полях <code>view:</code>, <code>- widget:</code>, <code>- group:</code>, <code>- column:</code>, <code>- preset:</code>
                                подсказываются существующие id из текущего домена и индекса.
                            </P>
                            <P>
                                <strong>Backlinks:</strong> если курсор на атрибуте, который упоминается в <code>uiRules[].condition</code> (через <code>@doc.attr</code>)
                                или в <code>uiRules[].rule.widgets</code> (виджет <code>editors_attr</code>), это правило видно во вкладке «Используется».
                            </P>
                        </Section>

                        <Section title="Меню (menus)">
                            <P>
                                Левая навигационная панель. Может содержать <code>root_group</code>
                                (раскрывающийся раздел) с <code>items[]</code> — пунктами меню, каждый из которых
                                открывает свой <code>view</code>.
                            </P>
                            <List>
                                <li><strong>type</strong>: <code>root_group</code> (раздел с подразделами) или <code>root_menu</code> (пункт без подразделов).</li>
                                <li><strong>route</strong>: путь в URL, уникален в системе.</li>
                                <li><strong>placement</strong>: <code>top</code> (главное меню) или <code>settings</code>.</li>
                                <li><strong>priority</strong>: ≥1000, больше = выше в списке.</li>
                                <li><strong>view</strong>: списочное представление или представление с вкладками.</li>
                                <li><strong>items[]</strong>: дочерние пункты (для root_group), каждый требует <code>view</code>.</li>
                            </List>
                            <P>
                                Сниппеты: <code>✨ newmenuroot</code> (корневая группа с подпунктом),
                                <code>✨ newmenuitem</code> (пункт).
                            </P>
                        </Section>

                        <Section title="Иконки (medias)">
                            <P>
                                Медиа-ресурсы: иконки для виджетов и меню. В текущей реализации поддерживается
                                только <code>type: icon_name</code> — именованная иконка из дизайн-системы.
                            </P>
                            <List>
                                <li><strong>id</strong>: View ID (используется в <code>icon:</code> в группах/меню/кнопках).</li>
                                <li><strong>iconName</strong>: идентификатор в библиотеке иконок (<code>folder</code>, <code>star</code>, <code>device</code> и т.д.).</li>
                            </List>
                            <P>
                                Сниппет: <code>✨ newmedia</code>.
                            </P>
                        </Section>

                        <Section title="Примеси (mixins)">
                            <P>
                                Механизм расширения сущностей данными из другого домена. Позволяет переиспользовать
                                представления и логику без дублирования кода.
                            </P>
                            <List>
                                <li><strong>type: linkage</strong> — примесь на основе связи, расширяет через связанный объект.
                                    Требует <code>linkage</code> (1_1 или 1_n) + <code>entity: &#123; from, to &#125;</code>.</li>
                                <li><strong>type: view</strong> — примесь компонентов интерфейса. Требует <code>entity</code> + <code>views[]</code> с <code>fromView</code>.</li>
                                <li><strong>weight</strong>: приоритет (меньше = выше). При равных — сортировка по id, затем type:view вперёд.</li>
                                <li><strong>useForChild</strong>: наследовать примесь дочерним сущностям (по умолчанию true).</li>
                                <li><strong>views[].change.add</strong>: что добавить (<code>components</code>, <code>tabs</code>, <code>menu</code>).</li>
                                <li><strong>views[].change.delete</strong>: что удалить из целевого представления.</li>
                                <li><strong>views[].replace</strong>: полная замена компонентов.</li>
                                <li><strong>position.type</strong>: <code>begin</code> / <code>after</code> / <code>end</code> — где вставить.</li>
                            </List>
                            <P>
                                Сниппеты: <code>✨ newmixinview</code> (примесь вкладки), <code>✨ newmixinlinkage</code>
                                (примесь на связи).
                            </P>
                            <P>
                                Валидация: <code>linkage</code> и <code>fromView</code> проверяются на существование в домене.
                            </P>
                        </Section>

                        <Section title="Обмен данными (exchangeSettings)">
                            <P>
                                Настройки импорта/экспорта объектов домена. Позволяют управлять, как объекты
                                создаются и обновляются через API.
                            </P>
                            <List>
                                <li><strong>enable</strong>: глобальный переключатель (по умолчанию true).</li>
                                <li><strong>attributeFormats</strong>: форматы дат (Moment-синтаксис) — <code>Date</code>, <code>Time</code>, <code>Timestamp</code>, <code>TimestampRange</code>.</li>
                                <li><strong>entities</strong>: настройки по каждой сущности (переопределяют глобальные).</li>
                                <li><strong>forExport</strong>: атрибут-идентификатор для Reference (по умолчанию ищется identifier, потом name).</li>
                                <li><strong>upsertWith</strong>: атрибуты для идентификации при обновлении (если не указан — создаётся новая запись).</li>
                                <li><strong>ignoreAttributes</strong>: список игнорируемых атрибутов (id через запятую).</li>
                                <li><strong>exportSystemAttributes</strong>: id системных атрибутов для экспорта или <code>all</code>.</li>
                            </List>
                            <P>
                                Сниппеты: <code>✨ newexchange</code> (глобальные настройки), <code>✨ newexchangeentity</code>
                                (настройки для одной сущности).
                            </P>
                        </Section>
                    </div>
                </div>
            </div>
        </div>
    );
}