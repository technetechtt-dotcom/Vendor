import os from "node:os";
import path from "node:path";

// The project path is long enough that Windows cannot open the D1 database
// file plus its SQLite journal. Keep local state in a short directory.
export const localPersistPath = path.join(os.homedir(), "sp-vendor-state");
