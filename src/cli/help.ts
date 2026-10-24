export function printHelp(): void {
  console.log(`Usage:

  Локальный режим:
    node graph-analyzer.js <directory-path> [port]

  Гибридный режим (локальные файлы + серверная валидация):
    node graph-analyzer.js <directory-path> --server <url> --login <user> --password <pass> [options]

  Удалённый режим (кэш + публикация на сервер):
    node graph-analyzer.js --server <url> --login <user> --password <pass> [options]

Опции:
  --server <url>       Базовый URL сервера
  --login <user>       Имя пользователя
  --password <pass>    Пароль
  --port <port>        HTTP-порт (по умолчанию 3000)
  --refresh            Обновить кэш (только удалённый режим)
  --reset-cache        Удалить кэш перед загрузкой (только удалённый режим)
  --secure             Проверять TLS-сертификат
  --help               Показать справку

Режимы:
  • Локальный    — файлы из каталога, только локальное сохранение, без валидации.
  • Гибридный    — файлы из каталога, серверная валидация (массовая + inline),
                   только локальное сохранение. Публикация недоступна (нет кэша).
  • Удалённый    — файлы из кэша, серверная валидация, сохранение = публикация
                   через publishExpertise. Требует повышения version в схеме.

Кэш: .cache/domains/<host>__<hash>/

Примеры:
  node graph-analyzer.js ./domains
  node graph-analyzer.js ./domains --server https://your.server.com --login admin --password "qwerty"
  node graph-analyzer.js --server https://your.server.com --login admin --password "qwerty"
  node graph-analyzer.js --server https://your.server.com  # если кэш уже есть`);
}
