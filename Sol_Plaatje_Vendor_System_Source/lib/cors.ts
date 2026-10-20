export function isFieldAppOrigin(origin: string | null) {
  if (!origin) return false;
  if (origin === 'capacitor://localhost' || origin === 'ionic://localhost') return true;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

/** Cookie sessions may mutate only from this site. Native clients use bearer tokens. */
export function mutationOriginError(req: Request, allowField = false): Response | null {
  const origin = req.headers.get('origin');
  const sameOrigin = origin === new URL(req.url).origin;
  const bearer = /^Bearer\s+\S+$/i.test(req.headers.get('authorization') || '');
  if (sameOrigin || (!origin && (bearer || req.headers.get('sec-fetch-site') !== 'cross-site'))) return null;
  if (allowField && isFieldAppOrigin(origin) && bearer) return null;
  return Response.json({error: 'Invalid request origin.'}, {status: 403, headers: {'Cache-Control': 'no-store'}});
}

export function fieldCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin');
  if (!isFieldAppOrigin(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin!,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

export function withFieldCors(req: Request, res: Response) {
  const extra = fieldCorsHeaders(req);
  if (!extra) return res;
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(res.body, {status: res.status, statusText: res.statusText, headers});
}
