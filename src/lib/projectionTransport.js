// A response can reference immutable historical days in this request's source.
// Revision/session ownership is enforced by simulationWorkerClient/Runtime.
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export function packProjection(projection, source) {
  if (projection?.version !== 1 || source?.version !== 1 || !object(projection.days) || !object(source.days) || !Number.isSafeInteger(source.count)) return { projection };
  let reused = 0;
  const rows = Object.entries(projection.days).map(([day, value]) => {
    if (object(value) && Object.hasOwn(source.days, day) && source.days[day] === value) { reused++; return [day, null]; }
    return [day, value];
  });
  if (!reused) return { projection };
  const metadata = { ...projection }; delete metadata.days;
  return { projection: metadata, projectionDays: { version: 1, baseCount: source.count, rows } };
}
export function unpackProjection(cold, source) {
  if (!Object.hasOwn(cold, 'projectionDays')) return cold.reuseProjection ? source?.projection : cold.projection;
  const delta = cold.projectionDays, base = source?.projection, metadata = cold.projection;
  if (cold.reuseProjection || !cold.hasProjection || delta?.version !== 1 || base?.version !== 1 ||
      !Number.isSafeInteger(delta.baseCount) || delta.baseCount !== base.count || !object(base.days) ||
      !object(metadata) || metadata.version !== 1 || Object.hasOwn(metadata, 'days') || !Array.isArray(delta.rows)) throw Error('Ungültige Finanzhistorienantwort.');
  const seen = new Set(), entries = [];
  for (const row of delta.rows) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || seen.has(row[0])) throw Error('Ungültiger Historientag.');
    const [day, value] = row; seen.add(day);
    if (value === null) {
      if (!Object.hasOwn(base.days, day) || !object(base.days[day])) throw Error('Ungültiger Historienverweis.');
      entries.push([day, base.days[day]]);
    } else {
      if (!object(value)) throw Error('Ungültiger Historientag.');
      entries.push([day, value]);
    }
  }
  return { ...metadata, days: Object.fromEntries(entries) };
}
