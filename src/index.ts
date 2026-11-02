#!/usr/bin/env node
import { run } from "./cli";

if (require.main === module) {
  run(process.argv.slice(2)).catch((err: any) => {
    console.error("❌ Fatal: " + err.message);
    console.error(err.stack);
    process.exit(1);
  });
}
