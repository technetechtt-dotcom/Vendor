import {database} from '../../../lib/server';
import {FIELD_APP_FILE, FIELD_APP_VERSION, FIELD_APP_AVAILABLE, FIELD_APP_CHECKSUM} from '../../../lib/field-app';
import {passwordPending, sessionUser} from '../../../lib/accounts';
import {can} from '../../../lib/capabilities';
import {mutationOriginError} from '../../../lib/cors';

export const dynamic = 'force-dynamic';

const VERSION = FIELD_APP_VERSION;
const FILE_NAME = FIELD_APP_FILE;

const RELEASE_NOTES = [
  'Place the verified APK and its generated JSON verification manifest in Field_Officer_App/releases/, then rebuild the office register.',
  'Get the signed package with: cd Field_Officer_App && npm run apk:release',
  'A release build needs the municipality key in android/keystore.properties (see keystore.properties.example).',
  'The office build publishes the package only when its version, signature manifest and checksum agree. Until then installation status is pending.',
];

function json(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
}

export async function GET() {
  return json({version: VERSION, available: FIELD_APP_AVAILABLE, sha256: FIELD_APP_CHECKSUM, expected: 'releases/' + FILE_NAME, publish: RELEASE_NOTES});
}

/** Static release packages are published through the deployment build. */
export async function POST(req: Request) {
  const rejected = mutationOriginError(req);
  if (rejected) return rejected;
  try {
    const db = database();
    const account = await sessionUser(db, req);
    if (!account) return json({error: 'Sign in required.'}, 401);
    if (passwordPending(account)) return json({error: 'Change your password before continuing.'}, 403);
    if (!can(account.role, 'settings.write')) return json({error: 'Only the super user can manage app releases.'}, 403);
    return json({error: 'App upload is unavailable. Publish a signed package through the deployment build. No file was saved.', version: VERSION, publish: RELEASE_NOTES}, 501);
  } catch (error) {
    console.error(error);
    return json({error: 'Release information could not be loaded.'}, 503);
  }
}
