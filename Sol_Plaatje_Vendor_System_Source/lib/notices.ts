import {Vendor, Entry} from './data';

function template(kind: string) {
  if (kind === 'Violation') return 'APPROVED TEMPLATE - VIOLATION NOTICE\nThe LED Office records that a site visit found a trading condition was not met. The findings below are the official record of what was observed and the action the trader must take. This notice does not set a fine, cancel a permit, or confirm that an email was delivered.';
  if (kind === 'Warning') return 'APPROVED TEMPLATE - WARNING NOTICE\nThe LED Office records that a site visit requires the trader to correct the findings below before the follow-up date. This notice does not set a fine or confirm that an email was delivered.';
  return '';
}

export function noticeText(v: Vendor, e: Entry) {
  return [
    'SOL PLAATJE MUNICIPALITY',
    'LOCAL ECONOMIC DEVELOPMENT OFFICE',
    e.kind.toUpperCase() + ' NOTICE',
    v.sample ? 'SAMPLE NOTICE - NOT A MUNICIPAL ENFORCEMENT NOTICE' : '',
    template(e.kind),
    '',
    'Notice reference: ' + e.id,
    'Recorded: ' + new Date(e.createdAt).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'}),
    'Officer / recorded by: ' + e.actor,
    'Vendor ID: ' + v.id,
    'Vendor: ' + v.name,
    'Business: ' + v.business,
    'Trading type: ' + v.type,
    'Location: ' + (v.type === 'Formal' ? v.hub + ' - Unit ' + v.unit : v.address + ' - Pitch ' + v.unit),
    '',
    'FINDINGS AND ACTION REQUIRED',
    e.note,
    '',
    'Follow-up date: ' + (e.due || 'Not specified'),
    'Case status: ' + (e.resolved ? 'Resolved' : 'Open'),
    '',
    'Please contact the LED Office to discuss this notice or provide the requested information.',
    'An email draft is a fallback. It is not a delivery record until an official records handover, acknowledgement, or an accepted municipal send.',
  ].filter(line => line !== undefined).join('\n');
}

export function noticeEmail(v: Vendor, e: Entry) {
  const recipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? v.email : '';
  return 'mailto:' + encodeURIComponent(recipient) + '?subject=' + encodeURIComponent('Sol Plaatje LED ' + e.kind.toLowerCase() + ' — ' + v.id) + '&body=' + encodeURIComponent(noticeText(v, e));
}

function pdfEscape(text: string) {
  return text.replace(/[^\x20-\x7E]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function noticePdf(lines: string[]) {
  const wrapped: string[] = [];
  for (const line of lines) {
    const clean = line.replace(/[^\x20-\x7E]/g, ' ');
    if (!clean) {
      wrapped.push('');
      continue;
    }
    for (let index = 0; index < clean.length; index += 90) wrapped.push(clean.slice(index, index + 90));
  }
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += 46) pages.push(wrapped.slice(index, index + 46));
  if (!pages.length) pages.push(['']);
  const objects: string[] = [];
  const pageIds: number[] = [];
  let nextId = 3;
  const fontId = 3 + pages.length * 2;
  for (const page of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    let y = 760;
    const commands = ['BT', '/F1 11 Tf'];
    for (const line of page) {
      commands.push(`1 0 0 1 50 ${y} Tm`, `(${pdfEscape(line)}) Tj`);
      y -= 14;
    }
    commands.push('ET');
    const stream = commands.join('\n');
    objects.push(`${contentId} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`);
    objects.push(`${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>endobj`);
  }
  const catalog = `1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj`;
  const pageList = `2 0 obj<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] >>endobj`;
  const font = `${fontId} 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj`;
  const all = [catalog, pageList, ...objects, font];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of all) {
    offsets.push(body.length);
    body += object + '\n';
  }
  const xref = body.length;
  body += `xref\n0 ${all.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index++) body += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  body += `trailer<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}
