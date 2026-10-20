import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Some managed Windows temp directories deny esbuild's cleanup operation.
// Use a stable, project-owned temp directory for this process and its children.
if (process.platform === 'win32') {
  const temp = fileURLToPath(new URL('../.build-temp/', import.meta.url));
  mkdirSync(temp, {recursive: true});
  process.env.TEMP = temp;
  process.env.TMP = temp;
}
await import('../node_modules/vite/bin/vite.js');
