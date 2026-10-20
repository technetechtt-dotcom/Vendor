import {useState} from 'react';
import {money, balance, permit, Vendor, Entry} from '../lib/data';
import {hubReport, monthReport, categoryReport, collected, charged, toCsv, today, monthStart, monthEnd, monthsBack, Period} from '../lib/reports';
import {Capability} from '../lib/capabilities';

type Tariff = {id: string; category: string; amountCents: number; approvalRef: string};

export function Reports({vendors, entries, tariffs}: {vendors: Vendor[]; entries: Entry[]; tariffs: Tariff[]; can: (capability: Capability) => boolean}) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(monthEnd());
  const [months, setMonths] = useState(6);
  const [message, setMessage] = useState('');
  const period: Period = {from, to, label: from + ' to ' + to};
  const hubs = hubReport(vendors, entries, period);
  const monthly = monthReport(entries, months);
  const categories = categoryReport(entries, tariffs, period);
  const periodCharges = charged(entries, period);
  const periodPayments = collected(entries, period);
  const outstandingNow = vendors.reduce((total, vendor) => total + Math.max(0, balance(vendor.id, entries)), 0);
  const overdue = entries.filter(entry => entry.kind === 'Charge' && entry.due && entry.due < today() && balance(entry.vendorId, entries) > 0);

  function download(rows: (string | number)[][], name: string) {
    const blob = new Blob(['\uFEFF' + toCsv(rows)], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('Report downloaded as CSV.');
  }

  return <>
    <section className="panel">
      <div className="panel-head"><div><h2>Reporting period</h2><p>Choose the dates the collection and outstanding figures cover. Outstanding balances are always as at today.</p></div></div>
      <div className="form-grid">
        <label>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>
        <label>Months in trend<select value={months} onChange={event => setMonths(Number(event.target.value))}>{[3, 6, 12, 24].map(count => <option key={count} value={count}>{count} months</option>)}</select></label>
      </div>
      <div className="modal-foot">
        <button className="secondary" type="button" onClick={() => { setFrom(monthStart()); setTo(monthEnd()); }}>This month</button>
        <button className="secondary" type="button" onClick={() => { setFrom(monthsBack(3)); setTo(monthEnd()); }}>Last 3 months</button>
        <button className="secondary" type="button" onClick={() => { setFrom(monthsBack(12)); setTo(monthEnd()); }}>Last 12 months</button>
      </div>
      {message && <p className="hint" role="status">{message}</p>}
    </section>

    <div className="fee-summary">
      <section className="panel"><p>Charges raised in period</p><strong>{money(periodCharges)}</strong></section>
      <section className="panel"><p>Payments received in period</p><strong>{money(periodPayments)}</strong></section>
      <section className="panel"><p>Net movement</p><strong className={periodPayments - periodCharges < 0 ? 'due-text' : ''}>{money(periodPayments - periodCharges)}</strong></section>
      <section className="panel"><p>Outstanding now</p><strong className="due-text">{money(outstandingNow)}</strong></section>
    </div>

    <section className="panel">
      <div className="panel-head"><div><h2>Collections and outstanding by hub</h2><p>{period.label}. Street traders are grouped together. Outstanding is the live balance, not the period balance.</p></div>
        <button className="secondary" type="button" onClick={() => download([
          ['Hub', 'Vendors', 'Approved permits', 'Charges in period (ZAR)', 'Payments in period (ZAR)', 'Outstanding now (ZAR)', 'Open cases'],
          ...hubs.map(row => [row.hub, row.vendors, row.approved, (row.charges / 100).toFixed(2), (row.payments / 100).toFixed(2), (row.outstanding / 100).toFixed(2), row.openCases]),
          ['Total', hubs.reduce((n, r) => n + r.vendors, 0), hubs.reduce((n, r) => n + r.approved, 0), (periodCharges / 100).toFixed(2), (periodPayments / 100).toFixed(2), (outstandingNow / 100).toFixed(2), hubs.reduce((n, r) => n + r.openCases, 0)],
        ], `hub-report-${from}-to-${to}.csv`)}>Download hub report</button>
      </div>
      <div className="table-wrap stack"><table>
        <caption className="sr-only">Collections and outstanding balances by hub for {period.label}</caption>
        <thead><tr><th scope="col" data-label="Hub or area">Hub or area</th><th scope="col" className="num" data-label="Vendors">Vendors</th><th scope="col" className="num" data-label="Approved">Approved</th><th scope="col" className="num" data-label="Charges in period">Charges in period</th><th scope="col" className="num" data-label="Payments in period">Payments in period</th><th scope="col" className="num" data-label="Outstanding now">Outstanding now</th><th scope="col" className="num" data-label="Open cases">Open cases</th></tr></thead>
        <tbody>{hubs.map(row => <tr key={row.hub}><td data-label="Hub or area"><strong>{row.hub}</strong></td><td className="num" data-label="Vendors">{row.vendors}</td><td className="num" data-label="Approved">{row.approved} of {row.vendors}</td><td className="num" data-label="Charges in period">{money(row.charges)}</td><td className="num" data-label="Payments in period">{money(row.payments)}</td><td className="num" data-label="Outstanding now"><strong className={row.outstanding > 0 ? 'due-text' : ''}>{money(row.outstanding)}</strong></td><td className="num" data-label="Open cases">{row.openCases}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row">Total</th><td>{hubs.reduce((n, r) => n + r.vendors, 0)}</td><td>{hubs.reduce((n, r) => n + r.approved, 0)}</td><td>{money(periodCharges)}</td><td>{money(periodPayments)}</td><td>{money(outstandingNow)}</td><td>{hubs.reduce((n, r) => n + r.openCases, 0)}</td></tr></tfoot>
      </table>{!hubs.length && <div className="empty">No vendors to report on yet.</div>}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>Month by month</h2><p>Last {months} months of charges and payments, including reversals.</p></div>
        <button className="secondary" type="button" onClick={() => download([
          ['Month', 'Charges (ZAR)', 'Payments (ZAR)', 'Net (ZAR)'],
          ...monthly.map(row => [row.month, (row.charges / 100).toFixed(2), (row.payments / 100).toFixed(2), (row.net / 100).toFixed(2)]),
        ], `monthly-report-${months}-months.csv`)}>Download trend</button>
      </div>
      <div className="table-wrap stack"><table>
        <caption className="sr-only">Charges, payments and net movement by month</caption>
        <thead><tr><th scope="col" data-label="Month">Month</th><th scope="col" className="num" data-label="Charges">Charges</th><th scope="col" className="num" data-label="Payments">Payments</th><th scope="col" className="num" data-label="Net">Net</th></tr></thead>
        <tbody>{monthly.map(row => <tr key={row.month}><td data-label="Month"><strong>{row.month}</strong></td><td className="num" data-label="Charges">{money(row.charges)}</td><td className="num" data-label="Payments">{money(row.payments)}</td><td className={(row.net < 0 ? 'due-text' : '' + ' num')} data-label="Net">{money(row.net)}</td></tr>)}</tbody>
      </table></div>
    </section>

    <section className="panel">
      <h2>Money movement in the period</h2>
      <div className="table-wrap stack"><table>
        <caption className="sr-only">Charges and payments in the selected period</caption>
        <thead><tr><th scope="col" data-label="Line">Line</th><th scope="col" className="num" data-label="Charges">Charges</th><th scope="col" className="num" data-label="Payments">Payments</th></tr></thead>
        <tbody>{categories.map(row => <tr key={row.category}><td data-label="Line"><strong>{row.category}</strong></td><td className="num" data-label="Charges">{money(row.charges)}</td><td className="num" data-label="Payments">{money(row.payments)}</td></tr>)}</tbody>
      </table>{!categories.length && <div className="empty">Nothing was charged or paid in this period.</div>}</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h2>Charges past their due date</h2><p>{overdue.length} charge{overdue.length === 1 ? '' : 's'} on accounts that still owe money.</p></div>
        <button className="secondary" type="button" onClick={() => download([
          ['Vendor ID', 'Business', 'Location', 'Charge due', 'Charge note', 'Balance now (ZAR)'],
          ...overdue.map(entry => {
            const vendor = vendors.find(item => item.id === entry.vendorId);
            return [entry.vendorId, vendor?.business || '', vendor ? (vendor.type === 'Formal' ? vendor.hub + ' unit ' + vendor.unit : vendor.address || 'Street trading') : '', entry.due, entry.note, (balance(entry.vendorId, entries) / 100).toFixed(2)];
          }),
        ], `overdue-charges-${today()}.csv`)}>Download overdue list</button>
      </div>
      <div className="table-wrap"><table>
        <caption className="sr-only">Charges past their due date on accounts that still owe money</caption>
        <thead><tr><th scope="col" data-label="Vendor">Vendor</th><th scope="col" data-label="Location">Location</th><th scope="col" data-label="Charge due">Charge due</th><th scope="col" className="num" data-label="Balance now">Balance now</th><th scope="col" data-label="Permit">Permit</th></tr></thead>
        <tbody>{overdue.slice(0, 50).map(entry => {
          const vendor = vendors.find(item => item.id === entry.vendorId);
          return <tr key={entry.id}><td data-label="Vendor"><strong>{vendor?.business || entry.vendorId}</strong><small>{entry.vendorId}</small></td><td data-label="Location">{vendor ? (vendor.type === 'Formal' ? vendor.hub.replace(' Container Hub', '').replace(' SMME Village', '') + ' · unit ' + vendor.unit : vendor.address || 'Street trading') : 'Not recorded'}</td><td data-label="Charge due">{entry.due}</td><td className="num" data-label="Balance now"><strong className="due-text">{money(balance(entry.vendorId, entries))}</strong></td><td data-label="Permit">{vendor ? permit(vendor) : 'Not recorded'}</td></tr>;
        })}</tbody>
      </table>{!overdue.length && <div className="empty">No charge is past its due date on an account that still owes money.</div>}</div>
      <p className="hint">A balance on its own never changes a permit. Review the account and the compliance record before any permit decision.</p>
    </section>
  </>;
}
