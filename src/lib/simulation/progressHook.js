// Progress-Hook für die Simulations-Engine.
// Der Web Worker setzt vor der Ausführung einen Callback, über den
// advanceTo Live-Fortschrittsmeldungen an den Haupt-Thread sendet.
// Ohne gesetzten Callback (z.B. Backend-Funktion) ist reportProgress ein No-Op.

let _cb = null;

export function setProgressHook(cb) {
  _cb = cb;
}

export function reportProgress(current, total, eventCount, recentEvents) {
  if (_cb) _cb({ current, total, eventCount, recentEvents: recentEvents || [] });
}