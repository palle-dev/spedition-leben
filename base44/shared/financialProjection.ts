// Exact monetary read model. Sparse minute totals retain inclusive boundaries
// and backdated postings; full days use their precomputed totals.
const DAY = 1440;
const empty = () => ({ accounts: {}, cash: [0, 0, 0], branches: {} });
function cashClass(entry, accounts) {
  const others = entry.lines.filter(l => l.account !== '1000').map(l => l.account);
  if (others.some(a => accounts[a]?.group === 'fixed_assets')) return 1;
  if (others.some(a => ['2010','2020','2200','2210','2230','5610','1300'].includes(a))) return 2;
  return 0;
}
function add(target, entry, accounts) {
  const category = cashClass(entry, accounts);
  for (const l of entry.lines) {
    const delta = l.debitCents - l.creditCents;
    target.accounts[l.account] = (target.accounts[l.account] || 0) + delta;
    if (l.account === '1000') target.cash[category] += delta;
    if (['revenue', 'expense'].includes(accounts[l.account]?.type)) {
      const id = entry.branchId || '__unallocated__';
      if (!Object.hasOwn(target.branches, id)) Object.defineProperty(target.branches, id, { value: {}, enumerable: true, writable: true, configurable: true });
      const branch = target.branches[id];
      branch[l.account] = (branch[l.account] || 0) + delta;
    }
  }
}
export function projectJournal(previous, entries, accounts) {
  const p = previous ? structuredClone(previous) : { version: 1, count: 0, days: {}, types: [] };
  if (p.version !== 1) throw Error('Unbekannte Finanzprojektion.');
  const types = new Set(p.types);
  for (const e of entries) {
    if (!Number.isFinite(e.gameTime)) throw Error('Ungültige Buchungszeit.');
    const day = Math.floor(e.gameTime / DAY);
    const d = p.days[day] || (p.days[day] = { total: empty(), minutes: {} });
    const m = d.minutes[e.gameTime] || (d.minutes[e.gameTime] = empty());
    add(d.total, e, accounts); add(m, e, accounts);
    p.count++; types.add(e.type);
    if (e.entryNo < (p.firstEntryNo ?? Infinity)) { p.firstEntryNo = e.entryNo; p.firstEntryMin = e.gameTime; }
    p.firstMin = Math.min(p.firstMin ?? Infinity, e.gameTime);
    p.lastMin = Math.max(p.lastMin ?? -Infinity, e.gameTime);
  }
  p.types = [...types].sort();
  return p;
}
function merge(to, from) {
  for (const [a, n] of Object.entries(from.accounts)) to.accounts[a] = (to.accounts[a] || 0) + Number(n);
  for (let i = 0; i < 3; i++) to.cash[i] += from.cash[i];
  for (const [id, values] of Object.entries(from.branches)) {
    if (!Object.hasOwn(to.branches, id)) Object.defineProperty(to.branches, id, { value: {}, enumerable: true, writable: true, configurable: true });
    const b = to.branches[id];
    for (const [a, n] of Object.entries(values)) b[a] = (b[a] || 0) + Number(n);
  }
}
export function projectionRange(projection, from = -Infinity, to = Infinity) {
  const result = empty();
  if (!projection || from > to) return result;
  if (projection.version !== 1) throw Error('Unbekannte Finanzprojektion.');
  for (const [day, d] of Object.entries(projection.days) as any) {
    const start = Number(day) * DAY, end = start + DAY;
    if (start > to || end <= from) continue;
    if (start >= from && to >= end) merge(result, d.total);
    else for (const [minute, m] of Object.entries(d.minutes)) if (Number(minute) >= from && Number(minute) <= to) merge(result, m);
  }
  return result;
}
export function journalRange(entries, accounts, from, to) {
  const result = empty();
  for (const e of entries || []) if (e.gameTime >= from && e.gameTime <= to) add(result, e, accounts);
  return result;
}
export function financialRange(state, accounts, from, to) {
  const result = projectionRange(state.accounting?.journalProjection, from, to);
  merge(result, journalRange(state.accounting?.journal, accounts, from, to));
  return result;
}
