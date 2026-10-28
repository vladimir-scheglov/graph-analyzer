import { getCliInvocation } from "./constants";

export function printHelp(): void {
  const CMD = getCliInvocation();

  console.log(`Usage:

  Локальный режим:
    ${CMD} <directory-path> [port]

  Гибридный режим (локальные файлы + серверная валидация):
    ${CMD} <directory-path> --server <url> --login <user> --password <pass> [options]

  Удалённый режим (кэш + публикация на сервер):
    ${CMD} --server <url> --login <user> --password <pass> [options]

Опции:
  --server <url>       Базовый URL сервера
  --login <user>       Имя пользователя
  --password <pass>    Пароль
  --port <port>        HTTP-порт (по умолчанию 3000)
  --refresh [ttl]      Обновить кэш. Без значения — всегда.
                       С TTL (1d / 10h / 30m / 5s) — только если
                       кэш старше указанного времени.
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
  ${CMD} ./domains
  ${CMD} ./domains --server https://your.server.com --login admin --password "qwerty"
  ${CMD} --server https://your.server.com --login admin --password "qwerty"
  ${CMD} --server https://your.server.com  # если кэш уже есть
`);
}
