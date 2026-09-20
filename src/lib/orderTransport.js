// Orders are mutable inside the engine. Compare against a value copy captured
// BEFORE execution; object identity alone would miss in-place changes.
function equalPlain(a, b, seen = new WeakSet()) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (!Array.isArray(a) && (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype)) return false;
  if (seen.has(a)) return false; // Cycles/shared subtrees conservatively travel whole.
  seen.add(a);
  if (Array.isArray(a) && a.length !== b.length) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => Object.hasOwn(b, k) && equalPlain(a[k], b[k], seen));
}
export function captureOrders(state) {
  return Array.isArray(state?.orders) ? structuredClone(state.orders) : null;
}
export function packOrderResult(packet, base) {
  const orders = packet.data?.state?.orders;
  if (!base || !Array.isArray(orders)) return packet;
  const indices = new Map();
  base.forEach((o, i) => {
    if (typeof o?.id === 'string') indices.set(o.id, indices.has(o.id) ? -1 : i);
  });
  let reusedOrders = 0;
  const rows = orders.map(o => {
    const i = indices.get(o?.id);
    if (i >= 0 && equalPlain(base[i], o)) { reusedOrders++; return i; }
    return o;
  });
  if (!reusedOrders) return packet;
  const state = { ...packet.data.state }; delete state.orders;
  return { ...packet, data: { ...packet.data, state },
    orderDelta: { version: 1, baseLength: base.length, rows }, reusedOrders };
}
export function unpackOrderResult(packet, data, source) {
  if (!packet.orderDelta) return data;
  const delta = packet.orderDelta;
  if (delta.version !== 1 || !Array.isArray(source) || delta.baseLength !== source.length ||
      !Array.isArray(delta.rows) || !data?.state || Object.hasOwn(data.state, 'orders')) throw Error('Ungültige Auftragsantwort.');
  const orders = delta.rows.map(row => {
    if (typeof row === 'number') {
      if (!Number.isSafeInteger(row) || row < 0 || row >= source.length) throw Error('Ungültiger Auftragsverweis.');
      return source[row];
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Ungültiger Auftrag.');
    return row;
  });
  return { ...data, state: { ...data.state, orders } };
}
