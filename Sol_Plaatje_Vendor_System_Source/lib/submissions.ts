const keyPattern = /^[A-Za-z0-9_-]{8,80}$/;

type Sql = {
  prepare: (query: string) => {
    bind: (...args: unknown[]) => {first: <T = Record<string, unknown>>() => Promise<T | null>};
  };
};

export function submissionKey(value: unknown) {
  if (value == null || value === '') return '';
  const key = String(value);
  if (!keyPattern.test(key)) throw new Error('Invalid submission key.');
  return key;
}

export async function existingSubmission(db: Sql, userId: string, key: string) {
  if (!key) return null;
  const row = await db.prepare('SELECT event_id FROM submission_keys WHERE user_id=? AND idempotency_key=?').bind(userId, key).first<{event_id: string}>();
  return row?.event_id ? String(row.event_id) : null;
}

export function rowChanges(result: unknown) {
  const record = result as {meta?: {changes?: number}; changes?: number} | null;
  return Number(record?.meta?.changes ?? record?.changes ?? 0);
}
