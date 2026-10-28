import { parseArgs } from "./args";
import { printHelp } from "./help";
import { serveLocal } from "./commands/serve-local";
import { serveRemote } from "./commands/serve-remote";
import { serveHybrid } from "./commands/serve-hybrid";
import { error, warn } from "console";
import { getCliInvocation } from "./constants";

const DEFAULT_PORT = 3000;

function parsePort(raw: unknown): number {
  if (raw === undefined || raw === null || raw === "") return DEFAULT_PORT;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) {
    warn(`Некорректный порт «${s}». Использую ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  const n = parseInt(s, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    warn(`Порт ${s} вне диапазона 0..65535. Использую ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return n;
}

export async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  // Признак того, что npm съел --server/--login/--password:
  // позиционных > 2 (было бы "dir" [port]), при этом --server не задан,
  // а positional[1] не выглядит как порт.
  if (
    args.positional.length > 2 &&
    !args.flags.server &&
    args.positional[1] &&
    !/^\d+$/.test(args.positional[1])
  ) {
    warn(
      "Похоже, npm перехватил флаги (--server, --login, --password).\n" +
        "  Используйте: npm start -- <аргументы>  (обязательно -- после start)\n" +
        "  Например:   npm start -- ./domains --server https://... --login u --password p",
    );
  }

  if (args.flags.help) {
    printHelp();
    process.exit(0);
  }

  const serverArg = args.flags.server ? String(args.flags.server) : undefined;
  const localArg = args.positional[0];

  if (!serverArg && !localArg) {
    printHelp();
    process.exit(1);
  }

  const port = parsePort(args.flags.port ?? args.positional[1]);

  const username = (args.flags.login || args.flags.username) as
    | string
    | undefined;
  const password = args.flags.password as string | undefined;

  // ============ Гибрид: локальный каталог + сервер ============
  if (serverArg && localArg) {
    if (!username || !password) {
      error(
        "Для режима «локальный каталог + сервер» нужны --login и --password.",
      );
      error("");
      const CMD = getCliInvocation();
      error("  Только локально (без валидации):");
      error(`    ${CMD} ${localArg}`);
      error("");
      error("  Только из кэша (с валидацией, без локальных файлов):");
      error(
        `    ${CMD} --server ${serverArg} --login <user> --password <pass>`,
      );
      process.exit(1);
    }

    if (args.flags.refresh || args.flags["reset-cache"]) {
      warn(
        "Флаги --refresh / --reset-cache игнорируются в гибридном режиме " +
          "(файлы локальные, кэш не используется)",
      );
    }

    await serveHybrid({
      localDir: localArg,
      server: serverArg,
      username,
      password,
      port,
      secure: !!args.flags.secure,
    });
    return;
  }

  // ============ Только сервер (кэш) ============
  if (serverArg) {
    await serveRemote({
      server: serverArg,
      username,
      password,
      login: args.flags.login as string | undefined,
      port,
      refresh: args.flags.refresh as boolean | string | undefined,
      resetCache: !!args.flags["reset-cache"],
      secure: !!args.flags.secure,
    });
    return;
  }

  // ============ Только локально ============
  serveLocal(localArg, port);
}
