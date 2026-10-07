function clip(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

const fields = ['name', 'business', 'type', 'sector', 'hub', 'unit', 'address', 'lat', 'lng', 'phone', 'email', 'issued', 'expires', 'status'] as const;

export function registrationAudit(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return 'Vendor registered';
  const lines: string[] = [];
  for (const field of fields) {
    const left = clip(before[field]);
    const right = clip(after[field]);
    if (left !== right) lines.push(`${field}: "${left}" → "${right}"`);
  }
  const photoBefore = String(before.photo || '');
  const photoAfter = String(after.photo || '');
  if (photoBefore !== photoAfter) {
    lines.push(!photoBefore && photoAfter ? 'profile picture: added' : photoBefore && !photoAfter ? 'profile picture: removed' : 'profile picture: replaced');
  }
  const checklist = (value: Record<string, unknown> | null) => Array.isArray(value?.documents) ? value.documents.map(item => String(item)).join(', ') : '';
  const beforeChecklist = checklist(before);
  const afterChecklist = checklist(after);
  if (beforeChecklist !== afterChecklist) lines.push(`checklist: "${clip(beforeChecklist)}" → "${clip(afterChecklist)}"`);
  const files = (value: Record<string, unknown> | null) => Array.isArray(value?.files)
    ? value.files.map(file => {
      const item = file as {label?: string; name?: string};
      return `${item.label || 'Document'}: ${item.name || ''}`;
    }).sort().join('; ')
    : '';
  const beforeFiles = files(before);
  const afterFiles = files(after);
  if (beforeFiles !== afterFiles) lines.push(`documents: "${clip(beforeFiles)}" → "${clip(afterFiles)}"`);
  if (!lines.length) return 'Vendor registration saved with no field changes';
  return ('Vendor registration updated\n' + lines.join('\n')).slice(0, 3500);
}
