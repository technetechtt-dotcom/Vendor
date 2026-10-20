import {FIELD_APP_ASSET_PATH} from '../../lib/field-app';

/** Keep older installation links pointing to the single published package. */
export function GET(req: Request) {
  return Response.redirect(new URL(FIELD_APP_ASSET_PATH, req.url), 307);
}
