import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {chromium} from 'playwright';
import {runScenarios} from './scenarios.mjs';

const base = 'http://127.0.0.1:5173';
async function waitFor(url) {
  for (let attempt = 0; attempt < 45; attempt++) {
    try {const response = await fetch(url); if (response.ok) return response;} catch { /* wait for isolated preview */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Preview did not become ready: ' + url);
}
assert.equal((await (await waitFor(base + '/api/auth')).json()).setupRequired, true, 'Browser acceptance requires an empty isolated register.');
const scenario = await runScenarios(request => fetch(request), base);
await waitFor('http://127.0.0.1:5174');
await mkdir('test-results', {recursive: true});
const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
const page = await context.newPage();
const errors = [];
const accessibility = [];
async function audit(screen, target = page) {
  const result = await new AxeBuilder({page: target}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  for (const violation of result.violations) accessibility.push({screen,id:violation.id,impact:violation.impact,nodes:violation.nodes.map(node => ({target:node.target,summary:node.failureSummary,html:node.html}))});
}
let field;
page.on('pageerror', error => errors.push(error.message));
await context.addCookies([{name: 'led_session', value: scenario.ownerToken, url: base, httpOnly: true}]);
try {
  await page.goto(base);
  await page.getByRole('heading', {name: 'A clear view of your trading community.'}).waitFor();
  await audit('Overview');
  await page.screenshot({path: 'test-results/01-office-overview.png', fullPage: true});
  const workspaces = ['Vendor register', 'Business hubs', 'Trading locations', 'Fees & payments', 'Compliance', 'Users', 'Follow-ups', 'Unit inventory', 'Permits & cards', 'Tariffs & reconciliation', 'Reports', 'Notice queue', 'Audit', 'Settings', 'Import', 'Backup', 'Sessions'];
  for (const name of workspaces) {
    await page.getByRole('button', {name, exact: true}).click();
    await page.getByRole('heading', {name, exact: true, level: 1}).waitFor();
    assert.equal(await page.getByRole('main').count(), 1);
    await audit(name);
  }
  await page.getByRole('button', {name: 'Vendor register', exact: true}).click();
  await page.getByRole('button', {name: /Open Synthetic Test Business/}).click();
  for (const name of ['Fees & payments', 'Compliance', 'History', 'Profile']) {
    await page.getByRole('tab', {name, exact: true}).click();
    assert.equal(await page.getByRole('tab', {name, exact: true}).getAttribute('aria-selected'), 'true');
  }
  await audit('Vendor profile');
  await page.getByRole('tab',{name:'Profile',exact:true}).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab',{name:'Fees & payments',exact:true}).getAttribute('aria-selected'),'true');
  await page.getByRole('tab',{name:'Profile',exact:true}).click();
  await page.screenshot({path: 'test-results/02-vendor-profile.png', fullPage: true});
  await page.getByRole('button', {name: 'Close profile', exact: true}).click();
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Mobile page overflows horizontally');
  await audit('Mobile register');
  await page.screenshot({path: 'test-results/03-office-mobile.png', fullPage: true});
  await page.getByRole('button', {name: 'Register vendor', exact: true}).click();
  await page.getByRole('dialog', {name: 'Vendor registration'}).waitFor();
  await audit('Mobile registration');
  await page.screenshot({path: 'test-results/04-registration-mobile.png', fullPage: true});
  await page.getByLabel('Vendor full name', {exact:true}).fill('Second Acceptance Trader');
  await page.getByLabel('Business / trading name', {exact:true}).fill('Second Synthetic Business');
  await page.getByLabel('Sector / products sold', {exact:true}).fill('Testing');
  await page.getByLabel('Business hub', {exact:true}).selectOption({label:'Acceptance Test Hub'});
  await page.getByLabel('Allocated unit number', {exact:true}).fill('QA-02');
  await page.getByLabel('Permit expiry date', {exact:true}).fill('2099-03-31');
  await page.getByRole('button', {name:'Save registration',exact:true}).click();
  await page.getByRole('dialog',{name:'Vendor registration'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:/Open Second Synthetic Business/}).waitFor();
  await page.goto(base + '/not-a-real-page');
  await page.getByRole('heading', {name: 'Page not found'}).waitFor();

  field = await context.newPage();
  field.on('pageerror', error => errors.push(error.message));
  await field.setViewportSize({width: 390, height: 844});
  await field.goto('http://127.0.0.1:5174');
  await field.getByRole('heading', {name: 'Choose a device PIN'}).waitFor();
  await field.locator('#new-pin').fill('82649137');
  await field.locator('#confirm-pin').fill('82649137');
  await field.getByRole('button', {name: 'Set PIN and continue'}).click();
  await field.getByLabel('Vendor register address').fill(base);
  await field.getByLabel('Email address', {exact: true}).fill(scenario.fieldCredentials.email);
  await field.getByLabel('Password', {exact: true}).fill(scenario.fieldCredentials.password);
  await field.getByRole('button', {name: 'Sign in', exact: true}).click();
  await field.getByLabel('Vendor ID', {exact: true}).fill(scenario.vendorId);
  await field.getByRole('button', {name: 'Find vendor', exact: true}).click();
  await field.getByRole('heading', {name: 'Synthetic Test Business', exact: true}).waitFor();
  await audit('Field profile', field);
  await field.screenshot({path: 'test-results/05-field-profile.png', fullPage: true});
  await field.getByRole('tab',{name:'Profile',exact:true}).focus();
  await field.keyboard.press('ArrowRight');
  assert.equal(await field.getByRole('tab',{name:'Fees',exact:true}).getAttribute('aria-selected'),'true');
  const encrypted = await field.evaluate(() => localStorage.getItem('solplaatje.field.encryptedVault'));
  assert.ok(encrypted && !encrypted.includes('Synthetic Test Business'), 'Vendor record is not encrypted');
  assert.equal(await field.evaluate(() => localStorage.getItem('solplaatje.field.vendorCache')), null);
  await field.reload();
  await field.getByRole('heading', {name: 'Enter your PIN'}).waitFor();
  await field.locator('#field-pin').fill('82649137');
  await field.getByRole('button', {name: 'Unlock', exact: true}).click();
  await field.getByLabel('Vendor ID', {exact: true}).fill(scenario.vendorId);
  await field.getByRole('button', {name:'Find vendor',exact:true}).click();
  await field.getByRole('button', {name:'Record this site visit',exact:true}).click();
  const offlineFinding = 'Synthetic offline inspection ' + crypto.randomUUID();
  await field.getByLabel('Findings and action taken').fill(offlineFinding);
  await audit('Field visit form',field);
  await context.setOffline(true);
  await field.getByRole('button',{name:'Save visit to vendor record',exact:true}).click();
  await field.getByText('Saved on this phone.',{exact:false}).waitFor();
  const readVisits = async () => (await (await fetch(base+'/api/register?vendorId='+encodeURIComponent(scenario.vendorId),{headers:{authorization:'Bearer '+scenario.fieldToken}})).json()).events.filter(row=>row.note.includes(offlineFinding));
  assert.equal((await readVisits()).length,0,'Offline visit unexpectedly reached the register');
  await context.setOffline(false);
  for(let attempt=0;attempt<40 && !(await readVisits()).length;attempt++) await new Promise(resolve=>setTimeout(resolve,500));
  assert.equal((await readVisits()).length,1,'Offline visit was not synchronized exactly once');
  assert.deepEqual(errors, [], 'Client runtime errors were raised');
  await writeFile('test-results/accessibility.json', JSON.stringify(accessibility,null,2));
  assert.equal(accessibility.length, 0, 'Accessibility violations: ' + JSON.stringify(accessibility.map(row=>({screen:row.screen,id:row.id,targets:row.nodes.slice(0,3).map(node=>node.target)}))));
  console.log(JSON.stringify({ok: true, workspaces: 18, profileTabs: 4, field: ['PIN creation', 'sign-in', 'lookup', 'encrypted cache', 'reload lock', 'unlock', 'offline visit persistence', 'exactly-once synchronization'], apiChecks: scenario.checks}, null, 2));
} catch (error) {
  await page.screenshot({path: 'test-results/failure-office.png', fullPage: true}).catch(() => {});
  if(field) await field.screenshot({path: 'test-results/failure-field.png', fullPage: true}).catch(() => {});
  throw error;
} finally {await browser.close();}
