import {readFile} from 'node:fs/promises';
import path from 'node:path';

export async function GET() {
  const file = path.resolve(process.cwd(), '../Field_Officer_App/LED-Field-Visits.apk');
  try {
    const data = await readFile(file);
    return new Response(data, {headers: {'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="LED-Field-Visits.apk"', 'Cache-Control': 'no-store'}});
  } catch {
    return Response.json({error: 'The release APK is not on this server. Build it from Field_Officer_App with npm run apk. Version 1.0.0 is the app recorded in that project.'}, {status: 404});
  }
}
