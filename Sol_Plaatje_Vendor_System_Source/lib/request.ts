export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  const value: unknown = await req.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Send a JSON object.');
  return value as Record<string, unknown>;
}
