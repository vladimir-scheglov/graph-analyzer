import { run } from "./cli";

run(process.argv.slice(2)).catch((err: any) => {
  console.error("❌ Fatal: " + err.message);
  console.error(err.stack);
  process.exit(1);
});
