# Domains Analyzer

**Настольный веб-инструмент для работы со схемами R‑EVO: IDE для YAML‑схем, аналитическая платформа и «второй пилот» бизнес‑аналитика.**

Domains Analyzer — это локальное веб‑приложение (Node.js + React + Monaco), которое читает `.ro`‑файлы схем R‑EVO, строит граф зависимостей доменов, находит проблемы, проверяет PII, считает архитектурные метрики и помогает безопасно публиковать изменения на сервер. Один инструмент заменяет ручной grep по 40 000 строк YAML, консольные скрипты проверки и «а мы не знали, что на неё ссылается другой домен».

---

## Какие задачи решает

| Боль | Что делает Domains Analyzer |
|---|---|
| «Я впервые на проекте — не понимаю, как устроены схемы» | Граф доменов, путь изучения, глоссарий, каталог сущностей, схемы доменов |
| «Где вообще используется это поле?» | Поиск атрибутов по всему проекту + backlinks в редакторе |
| «Что сломается, если я удалю сущность?» | Симуляция удаления с планом миграции |
| «Не появилось ли новых проблем после моего PR?» | Линтер + baseline (сравнение с «принятым» состоянием) |
| «Нет ли персональных данных в неожиданном месте?» | PII‑детектор с отчётом для DPO (152‑ФЗ / GDPR) |
| «Какие домены в зоне архитектурного риска?» | Метрики Мартина, Health Dashboard, Sonar‑оценка |
| «Как безопасно опубликовать схему, чтобы ничего не сломать?» | Draft → Publish Preview с diff → публикация, серверная валидация без сохранения |
| «Нужно 20 сущностям раздать типовой CRUD» | Пакетная генерация блоков с preflight‑проверкой |
| «Что изменилось после обновления с сервера?» | Model Diff (по доменам и по типам изменений) |
| «Нужно показать заказчику модель данных» | Экспорт в Markdown / Mermaid / PNG / CSV |

---

## Возможности

### 🕸️ Граф и анализ зависимостей

- **Граф доменов** — узлы = домены, рёбра = FQID‑ссылки и linkages. Missing и broken узлы подсвечены.
- **Фокус** — N‑hop окружение выбранного узла (глубина 1–4).
- **Путь** — кратчайший путь между двумя доменами.
- **Циклы** — Tarjan SCC, подсветка компонент сильной связности.
- **Topo Sort** — порядок установки доменов по зависимостям.
- **Путь изучения** — этапы чтения от «фундамента» к верхним слоям + экскурсия по графу.
- **Heatmap** — раскраска по health / degree / entities / fqid.
- **Агрегация по неймспейсам**, группировка в рамки‑кластеры.
- **Bidirectional merge** — объединение A↔B в одно ребро.
- **Snapshots + diff** — сохранить состояние «до», сравнить «после».
- **Cache Diff** — что изменилось при обновлении кэша с сервера.

### 🔬 Анализ модели

- **Модельный индекс** — все сущности, атрибуты, связи, views, actions, dataRules, миксины, деревья, UI rules, accessRules, exchangeSettings.
- **Каталог сущностей** — фильтры: домены, теги, миксины, сироты, min refs.
- **Поиск атрибутов** — кросс‑сущностный по id / name / description / типу / constraints / PII.
- **Матрица связей** — «сущность × сущность», визуализация кластеров.
- **Матрица атрибутов** — «сущность × имя атрибута», детект несогласованности типов.
- **Граф сущностей** — внутри одного домена (наследование, Reference, linkage).
- **Иерархия наследования** — родители / наследники с автофитом.
- **Impact analysis** — кто ссылается на сущность/атрибут и куда ссылается она.
- **Симуляция удаления** — что сломается, что станет «висячим», пошаговый план миграции.
- **Глоссарий** — алфавитный указатель сущностей, атрибутов, типов данных.
- **Схема домена** — структурированный обзор секций: сущности с атрибутами, связи, типы данных (с workflow‑графом), действия, views, меню, миксины, правила, иконки, деревья, UI rules, локализации, обмен.
- **Сравнение доменов** — только в A, только в B, общие с различиями.

### 🛡️ Качество и соответствие

- **Линтер** — 150+ правил в 7 категориях (naming, required, recommended, reference, semantic, validation, uirules).
- **Sonar‑оценка** — взвешенный балл 0–100 с грейдом A–E и раскладкой по категориям.
- **Baseline** — принять текущее состояние как «норму» и видеть только новые проблемы. Baseline переживает `--refresh` и `--reset-cache`.
- **Валидация модели** — циклы наследования, битые ссылки, дубликаты entityId, конфликты миксинов, сироты, атрибуты без views.
- **PII‑детектор** — эвристика по именам + контекст сущности, категории (identity / contact / document / financial / biometric / special / location / technical), severity critical → low. **Экспорт отчёта для DPO** с нормативной базой и рекомендациями.
- **Массовая валидация** — SSE‑стриминг, прогон всех доменов через сервер с прогрессом.

### 🏛️ Архитектурные метрики

- **Метрики Мартина** — Ca, Ce, Instability, Abstractness, Distance. Классификация зон: Main Sequence / Pain Zone / Uselessness. Scatter‑plot I × A.
- **Health Dashboard** — сводка по всем доменам: сущности, атрибуты, lint‑score, PII, размер, дата обновления. Проверка outdated, CSV‑экспорт.
- **Model Diff** — что изменилось в модели (по доменам и по типам: entities, mixins, dataTypes, metadata, generic sections).
- **Health Score в графе** — интегральная оценка домена прямо на узле.

### ✍️ Редактор YAML (Monaco)

- **Автокомплит по контексту** — поля, значения, ref‑поля с учётом path (views → widgets → control, entities → sorting → by и т.д.), наследования и dataType.
- **50+ сниппетов** — `newentity`, `newattr`, `newview`, `newlistfull`, `newentityview`, `newbulkdelete`, `newmixin`, `newenum`, `newuirule` и т.д.
- **Inline‑валидация** — FQID, dataType, view refs, attribute refs, enum values, RQL, action required fields, uiRule refs, системные id.
- **Серверный линтер в редакторе** — маркеры автоматически обновляются при правках (classifyIssue: still / resolved / unknown).
- **Quick Fix** — 💡 лампочки: переименовать в camelCase, добавить label / description, справка, игнор.
- **Go to definition** — Ctrl+Click / Ctrl+Shift+F12 по `inherits`, `entity`, `attribute`, `view`, `action`, `linkage`. FQID в чужом домене открывает сущность в каталоге.
- **Quick Jump (Shift+Tab)** — режимы `#секция`, `:строка`, `>содержимое`, `>/regex/`, `@атрибут`, `!проблема`, `~соседи`, `?справка`, точный FQID. История, избранное, preview.
- **Поиск с группировкой** (Ctrl+Shift+F) — multi‑line, regex, whole‑word, include‑comments.
- **Навигация** — дерево секций с подсветкой проблем, фильтр «только проблемные», поиск по id.
- **Закладки** (F2) — на строку, сохраняются per‑file.
- **Breadcrumbs** — путь до курсора с кликабельными сегментами.
- **Folding controls** — свернуть до уровня 1–5, сиблингов, все блоки по имени контейнера.
- **Мини‑карта секций** — цвета по проблемам, клик для перехода.
- **Правая панель**: Проблемы · Внешние ссылки · Backlinks («Используется») · Серверная валидация.
- **Diff previous / diff published** — side‑by‑side сравнение.
- **Автосохранение** — при аварийном закрытии бэкап в sessionStorage, предложение восстановить.
- **Lock / Edit** — по умолчанию заблокирован, двойной Shift переключает. Quick Fix работает и в заблокированном режиме (авторазблокировка при применении).
- **Tabs** — несколько файлов одновременно.
- **Серверная валидация «на лету»** — ☁ кнопка, проверяет текущий (несохранённый) YAML.

### ⚙️ Генератор схем

- **12 профилей для сущности** — CRUD, CRUD+Page, Dictionary, No‑Modals, Tree‑View, Technical, Tabs‑List, Sorting/Searching, Transitive‑Chain, Defaults, Auto, Linked‑Groups.
- **5 профилей для домена** — Domain‑Extras (меню + иконки), Enum/Workflow Builder, UI Status Colors, ExchangeSettings, CounterColor.
- **Пакетная генерация** — SSE‑стриминг с прогрессом по сущностям.
- **Preflight** — прогон линтера на «модель + сгенерированные блоки», блокировка при новых errors.
- **Манифест** (`_generated.json`) — статусы блоков: актуален / изменён вручную / удалён из YAML. Восстановление удалённых блоков в один клик.
- **Разумные умолчания** — skipExisting, защита ручных правок, обязательное подтверждение при `replaceModified`.

### 🌐 Работа с сервером

- **Три режима** — local (без сервера), hybrid (локальные файлы + серверная валидация), remote (файлы из кэша + публикация).
- **Draft → Publish** — сохранение черновика (`saveDraft`) и публикация (`publishExpertise`) с атомарной записью `_index.json` и обновлением `.previous`.
- **Publish Preview** — diff с серверной версией; breaking changes (removed entities, changed types) помечаются отдельно.
- **Умный bump version** — при публикации предлагается MAJOR/MINOR/PATCH по impact изменений.
- **Refresh cache** — `--refresh` / `--refresh 1d` (TTL), `--reset-cache`, кнопка «Обновить кеш» в UI.
- **Outdated check** — какие домены обновились на сервере (по `updatedAt`/`version`).
- **Работа с токенами** — автоматический перелогин при 401.

### 📁 Управление доменами

- **Создание домена** — 6 шаблонов (empty, dictionary, asset‑registry, enum‑library, incident‑tracker, mixin‑container).
- **Удаление домена** — с симуляцией зависимостей (сколько доменов пострадает).
- **Toggle status** — enable/disable expertise на сервере (только remote).

### 📤 Экспорт и документация

- **Markdown‑отчёт по домену** — метаданные, сводка, Sonar, сущности с атрибутами, связи, типы, действия, views, меню, миксины, правила.
- **PII‑отчёт для DPO** — сводка, нормативная база, по серьёзности, по доменам, по категориям, полный список, рекомендации.
- **Mermaid** — `graph TD` для графа доменов и `classDiagram` для сущностей.
- **PNG** — скриншот графа.
- **JSON** — полный граф со stats, fqidReferences, cacheDiff.
- **CSV** — список доменов и Health Dashboard.

### 🎨 UX и вспомогательные инструменты

- **Command Palette** (Shift+Tab / Ctrl+K) — команды + model search с синтаксисом (`entity:`, `type:`, `has:mixin`, `pii:critical`, `lint:error`, `ref:`, `tag:`, `domain:`, `fqid:`).
- **Тёмная / светлая тема**, компактный режим, панель графа ↔ списка.
- **Навигация с историей** (Alt+←/→).
- **Избранное** — домены и сущности.
- **Правила зависимостей** — forbid / warn для пар `from → to` с подсветкой нарушений.
- **Тур** — экскурсия по графу по этапам пути изучения.
- **Шпаргалка** — 30+ секций с рецептами (identifier from dictionary, import with identification, multilingual schema, split tree catalog и т.д.), единый источник для Monaco и документации.
- **Справочник полей YAML** — все поля по контекстам (attributes, views, widgets, uiRules, exchangeSettings, accessRules…).
- **Матрица `control.type`** — какой редактор допустим для какого dataType в каком контексте.
- **Декодер ошибок валидации** — что значит `YamlParseError`, `UnreachableReference`, `InvalidDefinition`, `NotCompatible`, `MIXIN_*`.
- **Полное руководство пользователя** (F1) — с TOC, поиском по разделам и сценариями для БА.

---

## Быстрый старт

```bash
npm install -g domains-analyzer
domna --help
domna ./domains
domna --server https://rv.local --login admin --password pass
domna ./domains --server https://rv.local --login admin --password pass

# Локально, без сервера
domna ./my-domains

# Гибрид: локальные файлы + серверная валидация
domna ./my-domains --server https://your.server.com --login admin --password "qwerty"

# Remote: кэш + публикация
domna --server https://your.server.com --login admin --password "qwerty"
```

### `domna: command not found` после `npm install -g`

1. Проверьте, что установилась актуальная версия:
   `npm ls -g --depth=0 | grep domains-analyzer`
   Должно быть `domains-analyzer@2.0.1` (или новее).

2. Проверьте, что бинарник создан:
   macOS/Linux: `ls "$(npm prefix -g)/bin" | grep domna`
   Windows:     `ls "$(npm prefix -g)" | Select-String domna`

3. Запустите бинарник по абсолютному пути:
   macOS/Linux: `"$(npm prefix -g)/bin/domna" --help`
   Windows:     `& "$(npm prefix -g)\domna.cmd" --help`
   • Работает → проблема в PATH (см. ниже)
   • Не работает → напишите в issue с выводом команды

4. Добавьте глобальный bin в PATH:
   macOS (zsh):  echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
   Linux (bash): echo 'export PATH="$(npm prefix -g)/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
   Windows:      добавьте `npm prefix -g` в Path через «Переменные среды» и перезапустите терминал.

5. Перезапустите терминал (и IDE), выполните `which domna` (Windows: `where domna`).

Если используете nvm/fnm/volta: проверьте, что вы в той же версии Node, под которой устанавливали. `nvm use 22` может «спрятать» пакеты, установленные под `20`.