export function printHelp(): void {
  console.log(`Usage:

  Локальный режим:
    node graph-analyzer.js <directory-path> [port]

  Удалённый режим:
    node graph-analyzer.js --server <url> --login <user> --password <pass> [options]

Опции:
  --server <url>       Базовый URL сервера
  --login <user>       Имя пользователя
  --password <pass>    Пароль
  --port <port>        HTTP-порт (по умолчанию 3000)
  --refresh            Обновить кэш
  --reset-cache        Удалить кэш перед загрузкой
  --secure             Проверять TLS-сертификат
  --help               Показать справку

Кэш: .cache/domains/<host>__<hash>/

Примеры:
  node graph-analyzer.js ./domains
  node graph-analyzer.js --server https://your.server.com --login admin --password "qwerty"
  node graph-analyzer.js --server https://your.server.com  # если кэш уже есть`);
}
