import { env } from 'cloudflare:workers';
export const database=()=>{if(!env.DB)throw new Error('Database unavailable');return env.DB;};
export const bucket=()=>{if(!env.BUCKET)throw new Error('Photo storage unavailable');return env.BUCKET;};
