/**
 * The one place the published field-app package is named.
 *
 * Bump the version in Field_Officer_App/package.json and here together, then run
 * `npm run apk:release` there. The register build publishes the file from
 * Field_Officer_App/releases/ into its own static assets as /releases/<file>.
 */
import release from './field-release.json';
export const FIELD_APP_VERSION = release.version;
export const FIELD_APP_AVAILABLE = release.available;
export const FIELD_APP_CHECKSUM = release.sha256;
export const FIELD_APP_FILE = 'LED-Field-Visits-' + FIELD_APP_VERSION + '.apk';
export const FIELD_APP_ASSET_PATH = '/releases/' + FIELD_APP_FILE;
