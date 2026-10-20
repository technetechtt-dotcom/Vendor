import {Vendor, Entry, balance, permit} from './data';

export type Period = {from: string; to: string; label: string};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStart(date = today()) {
  return date.slice(0, 8) + '01';
}

export function monthEnd(date = today()) {
  const [year, month] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0));
  return `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

export function monthsBack(count: number, date = today()) {
  const [year, month] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1 - (count - 1), 1));
  return `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`;
}

export function inPeriod(entry: Entry, period: Period) {
  const day = String(entry.createdAt || '').slice(0, 10);
  if (!day) return false;
  return day >= period.from && day <= period.to;
}

/**
 * Which kind an entry moves and with what sign. A normal charge adds to the
 * charge total, a normal payment adds to the payment total, and a reversal
 * moves the same kind as the entry it cancels in the opposite direction, so
 * reversing a charge reduces charges and reversing a payment reduces payments.
 * This mirrors balance() in data.ts, which is what the screens display.
 */
function effectsOf(entry: Entry, all: Entry[]): {kind: 'Charge' | 'Payment'; amount: number}[] {
  if (entry.kind === 'Charge') return [{kind: 'Charge', amount: entry.amount}];
  if (entry.kind === 'Payment') return [{kind: 'Payment', amount: entry.amount}];
  if (entry.kind !== 'Reversal') return [];
  const original = all.find(item => item.id === entry.reversalOf);
  return [{kind: original?.kind === 'Payment' ? 'Payment' : 'Charge', amount: -entry.amount}];
}

/** Net movement for one kind inside an optional period, reversals included. */
export function netFor(entries: Entry[], kind: 'Charge' | 'Payment', period?: Period) {
  return entries.reduce((total, entry) => {
    if (period && !inPeriod(entry, period)) return total;
    return total + effectsOf(entry, entries).reduce((sum, effect) => effect.kind === kind ? sum + effect.amount : sum, 0);
  }, 0);
}

export function collected(entries: Entry[], period: Period) {
  return netFor(entries, 'Payment', period);
}

export function charged(entries: Entry[], period: Period) {
  return netFor(entries, 'Charge', period);
}

export type HubRow = {
  hub: string;
  vendors: number;
  approved: number;
  charges: number;
  payments: number;
  outstanding: number;
  openCases: number;
};

/**
 * Collections and outstanding balances per hub for a period, plus compliance
 * load. Formal traders are grouped by hub; street traders form one group so
 * their totals are never hidden behind an empty hub name.
 */
export function hubReport(vendors: Vendor[], entries: Entry[], period: Period): HubRow[] {
  const groups = new Map<string, HubRow>();
  const keyOf = (vendor: Vendor) => vendor.type === 'Formal' ? (vendor.hub || 'Unassigned hub') : 'Street trading';
  const row = (key: string) => {
    let existing = groups.get(key);
    if (!existing) {
      existing = {hub: key, vendors: 0, approved: 0, charges: 0, payments: 0, outstanding: 0, openCases: 0};
      groups.set(key, existing);
    }
    return existing;
  };
  for (const vendor of vendors) {
    const target = row(keyOf(vendor));
    target.vendors += 1;
    if (permit(vendor) === 'Approved') target.approved += 1;
    target.charges += netFor(entries.filter(entry => entry.vendorId === vendor.id), 'Charge', period);
    target.payments += netFor(entries.filter(entry => entry.vendorId === vendor.id), 'Payment', period);
    target.outstanding += Math.max(0, balance(vendor.id, entries));
    target.openCases += entries.filter(entry => entry.vendorId === vendor.id && ['Warning', 'Violation'].includes(entry.kind) && !entry.resolved).length;
  }
  return [...groups.values()].sort((a, b) => b.outstanding - a.outstanding || a.hub.localeCompare(b.hub));
}

export type MonthRow = {month: string; charges: number; payments: number; net: number};

/** Month-by-month charge, payment and net movement for the last N months. */
export function monthReport(entries: Entry[], months: number, end = today()): MonthRow[] {
  const rows: MonthRow[] = [];
  for (let index = months - 1; index >= 0; index--) {
    const [year, month] = end.split('-').map(Number);
    const cursor = new Date(Date.UTC(year, month - 1 - index, 1));
    const label = `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`;
    const period: Period = {from: label + '-01', to: monthEnd(label + '-01'), label};
    const chargeTotal = netFor(entries, 'Charge', period);
    const paymentTotal = netFor(entries, 'Payment', period);
    rows.push({month: label, charges: chargeTotal, payments: paymentTotal, net: paymentTotal - chargeTotal});
  }
  return rows;
}

export type CategoryRow = {category: string; charges: number; payments: number};

/** Charges and payments grouped by the approved fee category they used. */
export function categoryReport(entries: Entry[], tariffs: {id: string; category: string}[] = [], period: Period): CategoryRow[] {
  void tariffs; // Classification uses historical entry references, not today's fee schedule.
  const groups = new Map<string, CategoryRow>();
  const row = (category: string) => {
    let existing = groups.get(category);
    if (!existing) {
      existing = {category, charges: 0, payments: 0};
      groups.set(category, existing);
    }
    return existing;
  };
  for (const entry of entries) {
    if (!inPeriod(entry, period)) continue;
    for (const effect of effectsOf(entry, entries)) {
      if (effect.kind === 'Charge') row('Charges raised').charges += effect.amount;
      else row('Payments received').payments += effect.amount;
    }
  }
  return [...groups.values()].filter(item => item.charges || item.payments).sort((a, b) => (b.charges + b.payments) - (a.charges + a.payments));
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map(row => row.map(cell => '"' + String(cell ?? '').replace(/"/g, '""').replace(/^[=+@-]/, "'") + '"').join(',')).join('\r\n');
}
