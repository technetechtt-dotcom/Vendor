import {access, readFile} from 'node:fs/promises';
import path from 'node:path';

const VERSION = '1.0.0';
const FILE_NAME = 'LED-Field-Visits-' + VERSION + '.apk';

async function findApk() {
  const candidates = [
    path.resolve(process.cwd(), '../Field_Officer_App/releases/' + FILE_NAME),
    path.resolve(process.cwd(), '../Field_Officer_App/' + FILE_NAME),
    path.resolve(process.cwd(), '../Field_Officer_App/LED-Field-Visits.apk'),
  ];
  for (const file of candidates) {
    try {
      await access(file);
      return file;
    } catch { /* try next */ }
  }
  return '';
}

export async function GET() {
  const file = await findApk();
  if (!file) {
    return Response.json({
      error: 'No signed release APK is published on this server yet.',
      version: VERSION,
      expected: [
        'Field_Officer_App/releases/' + FILE_NAME,
        'Field_Officer_App/' + FILE_NAME,
        'Field_Officer_App/LED-Field-Visits.apk',
      ],
      build: 'From Field_Officer_App run npm run apk, sign the package, then place the versioned file under releases/.',
    }, {status: 404, headers: {'Cache-Control': 'no-store'}});
  }
  const data = await readFile(file);
  return new Response(data, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': 'attachment; filename="' + FILE_NAME + '"',
      'Cache-Control': 'no-store',
      'X-App-Version': VERSION,
    },
  });
}
