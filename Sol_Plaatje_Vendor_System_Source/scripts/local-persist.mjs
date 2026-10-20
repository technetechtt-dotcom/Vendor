import os from "node:os";
import path from "node:path";

// The project path is long enough that Windows cannot open the D1 database
// file plus its SQLite journal. Keep local state in a short directory.
// SITES_LOCAL_PERSIST_PATH lets a second preview run against its own short
// state directory without disturbing the default one.
const configured = (process.env.SITES_LOCAL_PERSIST_PATH || "").trim();

export const localPersistPath = configured ? path.resolve(configured) : path.join(os.homedir(), "sp-vendor-state");
