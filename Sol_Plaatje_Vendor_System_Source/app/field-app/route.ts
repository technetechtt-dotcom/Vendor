import {FIELD_APP_ASSET_PATH, FIELD_APP_AVAILABLE} from '../../lib/field-app';

/** Keep older installation links pointing to the single published package. */
export function GET(req: Request) {
  if (!FIELD_APP_AVAILABLE) return Response.json({error: 'The updated signed field app has not been published. Visit /field for installation status.'}, {status: 503, headers: {'Cache-Control':'no-store'}});
  return Response.redirect(new URL(FIELD_APP_ASSET_PATH, req.url), 307);
}
