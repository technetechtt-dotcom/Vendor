import {createHash} from 'node:crypto';
import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const field = new URL('../Field_Officer_App/', root);
const {version} = JSON.parse(await readFile(new URL('package.json', field), 'utf8'));
const file = `LED-Field-Visits-${version}.apk`;
let status = {version, available: false, sha256: '', certificateSha256: ''};
try {
  const metadata = JSON.parse(await readFile(new URL(`releases/${file.replace(/\.apk$/, '.json')}`, field), 'utf8'));
  const bytes = await readFile(new URL(`releases/${file}`, field));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (metadata.signatureVerified !== true || metadata.version !== version || metadata.file !== file || metadata.sha256 !== hash || !/^[a-f0-9]{64}$/i.test(metadata.certificateSha256 || '')) throw new Error('The signed field release does not match its verification manifest. Rebuild and verify it with apk:release.');
  await mkdir(new URL('public/releases/', root), {recursive: true});
  await copyFile(new URL(`releases/${file}`, field), new URL(`public/releases/${file}`, root));
  status = {version, available: true, sha256: hash, certificateSha256: metadata.certificateSha256};
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await writeFile(new URL('lib/field-release.json', root), JSON.stringify(status, null, 2) + '\n');
