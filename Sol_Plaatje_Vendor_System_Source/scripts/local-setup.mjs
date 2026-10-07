import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { localPersistPath } from './local-persist.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
run(['scripts/run-framework.mjs','build']);
const marker=path.join(localPersistPath,'cursor-initial-migration-applied');
const state=path.join(localPersistPath,'v3','d1');
if(existsSync(marker)&&existsSync(state)){
 console.log('Initial local migration already applied. Start development with pnpm dev.');
}else{
 run(['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',localPersistPath,'--file','drizzle/0000_easy_silhouette.sql']);
 mkdirSync(path.dirname(marker),{recursive:true});
 writeFileSync(marker,new Date().toISOString()+'\n');
 console.log('Local database ready. Start development with pnpm dev.');
}
