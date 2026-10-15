import { parseArgs } from "./args";
import { printHelp } from "./help";
import { serveLocal } from "./commands/serve-local";
import { serveRemote } from "./commands/serve-remote";

export async function run(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.flags.help) {
    printHelp();
    process.exit(0);
  }

  if (args.positional.length === 0 && !args.flags.server) {
    printHelp();
    process.exit(1);
  }

  const port = parseInt(args.flags.port || args.positional[1] || "3000", 10);

  if (args.flags.server) {
    await serveRemote({
      server: String(args.flags.server),
      username: (args.flags.login || args.flags.username) as string | undefined,
      password: args.flags.password as string | undefined,
      login: args.flags.login as string | undefined,
      port,
      refresh: !!args.flags.refresh,
      resetCache: !!args.flags["reset-cache"],
      secure: !!args.flags.secure,
    });
  } else {
    serveLocal(args.positional[0], port);
  }
}
