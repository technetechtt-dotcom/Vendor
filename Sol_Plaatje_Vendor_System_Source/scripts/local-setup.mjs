import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { localPersistPath } from './local-persist.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
run(['scripts/run-framework.mjs','build']);
const recordPath=path.join(localPersistPath,'applied-migrations.json');
const applied=existsSync(recordPath)?JSON.parse(readFileSync(recordPath,'utf8')):[];
const oldMarker=path.join(localPersistPath,'cursor-initial-migration-applied');
if(existsSync(oldMarker)&&!applied.includes('0000_easy_silhouette'))applied.push('0000_easy_silhouette');
const files=readdirSync('drizzle').filter(name=>/^\d+.*\.sql$/.test(name)).sort();
mkdirSync(localPersistPath,{recursive:true});
let pending=false;
for(const file of files){
 const tag=file.replace(/\.sql$/,'');
 if(applied.includes(tag))continue;
 pending=true;
 run(['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to',localPersistPath,'--file',path.join('drizzle',file)]);
 applied.push(tag);
 // Persist each successful migration so a later failure can be retried safely.
 writeFileSync(recordPath,JSON.stringify(applied,null,2)+'\n');
}
mkdirSync(localPersistPath,{recursive:true});
writeFileSync(recordPath,JSON.stringify(applied,null,2)+'\n');
console.log(pending?'Local database migrations applied. Start development with pnpm dev.':'Local database migrations are already applied. Start development with pnpm dev.');
