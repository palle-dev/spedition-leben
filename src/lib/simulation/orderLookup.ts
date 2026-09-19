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
  return index?.get(id) ?? state.orders.find(order => order.id === id);
}
