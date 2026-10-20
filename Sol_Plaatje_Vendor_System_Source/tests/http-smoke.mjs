import {runScenarios} from './scenarios.mjs';

const base = process.env.VENDOR_TEST_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw new Error('Acceptance tests create synthetic accounts and records. Use an isolated loopback preview.');
let ready = false;
for (let attempt = 0; attempt < 45; attempt++) {
  try {
    const response = await fetch(base + '/api/auth');
    if (response.ok) {
      const body = await response.json();
      if (!body.setupRequired) throw new Error('Acceptance tests require an empty isolated database.');
      ready = true; break;
    }
  } catch (error) {if (/empty isolated/.test(error.message)) throw error;}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) throw new Error('The isolated Workers/D1 preview did not become ready.');
const result = await runScenarios(request => fetch(request), base);
console.log(JSON.stringify({ok: true, checks: result.checks}, null, 2));
