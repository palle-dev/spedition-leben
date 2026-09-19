// A read-only operation owns this index. Never persisted or reused after mutation.
const contexts = new WeakMap<object, Map<string, any>>();
export function withOrderLookup<T>(state, orders, action: () => T): T {
  const previous = contexts.get(state);
  const index = new Map<string, any>();
  for (const order of orders) index.set(order.id, order);
  contexts.set(state, index);
  try { return action(); }
  finally { if (previous) contexts.set(state, previous); else contexts.delete(state); }
}
export function findOrder(state, id) {
  const index = contexts.get(state);
  return index?.get(id) ?? refreshRuntime(state)?.byId.get(id) ?? state.orders.find(order => order.id === id);
}

// A dispatcher round changes order fields, but does not create/remove orders.
// Keep references (not copies), so later employees see earlier confirmations.
const planningContexts = new WeakMap<object, any[]>();
export function withDispatchLookup<T>(state, action: () => T): T {
  const previous = planningContexts.get(state);
  planningContexts.set(state, currentOrders(state).filter(o => o.status === "angenommen" || o.status === "offered"));
  try { return runtimes.has(state) ? action() : withOrderLookup(state, state.orders, action); }
  finally { if (previous) planningContexts.set(state, previous); else planningContexts.delete(state); }
}
export function planningOrdersFor(state) {
  return planningContexts.get(state) || currentOrders(state);
}

// Advance-only working set. Histories remain intact in the save. During an
// advance the engine appends orders or replaces the array when pruning; it
// never replaces individual entries or reopens terminal orders. Live object
// references preserve status changes, including unterwegs -> angenommen.
// Every accessor observes appended orders/replaced arrays before using data.
type OrderRuntime = { source: any[], length: number, live: any[], byId: Map<any, any> };
const runtimes = new WeakMap<object, OrderRuntime>();
function refreshRuntime(state): OrderRuntime | undefined {
  const context = runtimes.get(state);
  if (!context) return;
  const source = state.orders || [];
  if (context.source !== source || source.length < context.length) {
    context.source = source; context.length = 0; context.live = []; context.byId.clear();
  }
  for (let i = context.length; i < source.length; i++) {
    const order = source[i];
    context.byId.set(order.id, order);
    if (["offered", "angenommen", "unterwegs"].includes(order.status)) context.live.push(order);
  }
  context.length = source.length;
  return context;
}
export function currentOrders(state) {
  return refreshRuntime(state)?.live || state.orders || [];
}
export function withSimulationOrders<T>(state, action: () => T): T {
  const previous = runtimes.get(state);
  runtimes.set(state, { source: state.orders, length: 0, live: [], byId: new Map() });
  try { return action(); }
  finally { if (previous) runtimes.set(state, previous); else runtimes.delete(state); }
}
