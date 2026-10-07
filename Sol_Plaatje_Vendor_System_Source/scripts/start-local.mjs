import { spawn } from "node:child_process";
import { localPersistPath } from "./local-persist.mjs";

const child = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
  "dev",
  "--config", "dist/server/wrangler.json",
  "--local",
  "--persist-to", localPersistPath,
  "--ip", "127.0.0.1",
  "--inspector-port", "0",
  ...process.argv.slice(2),
], { stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 1));
