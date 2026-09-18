// Tab-Schreibsperre über localStorage.
// Verhindert, dass mehrere Tabs gleichzeitig in IndexedDB/Server schreiben.

const LOCK_KEY = "fernwerk_lock";
const LOCK_TTL = 5000;     // Lock verfällt nach 5 s ohne Heartbeat
const LOCK_REFRESH = 2000; // Heartbeat alle 2 s

// Pro Dokument neu: duplizierte Tabs kopieren sessionStorage und brauchen
// trotzdem unterschiedliche Sperren.
const tabId = "tab_" + (globalThis.crypto?.randomUUID?.() || Date.now() + "_" + Math.random());
export function getTabId() { return tabId; }

function readLock() {
  const raw = localStorage.getItem(LOCK_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function writeLock(tabId) {
  localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId, timestamp: Date.now() }));
}

// Versucht, den Lock zu erwerben. Gibt true zurück, wenn dieser Tab den Lock hält.
export function acquireLock() {
  const tabId = getTabId();
  const lock = readLock();
  if (lock && lock.tabId !== tabId && Date.now() - lock.timestamp < LOCK_TTL) {
    return false; // Anderer Tab hält den Lock
  }
  writeLock(tabId);
  return true;
}

// Erneuert ausschließlich die noch von diesem Dokument gehaltene Sperre.
export function refreshLock() {
  const tabId = getTabId();
  const lock = readLock();
  if (lock && lock.tabId === tabId) {
    writeLock(tabId);
    return true;
  }
  // Eine bestehende Sitzung darf eine zwischenzeitlich verlorene Sperre
  // nicht wieder übernehmen: ihr Spielstand könnte inzwischen veraltet sein.
  return false;
}

export function releaseLock() {
  const tabId = getTabId();
  const lock = readLock();
  if (lock && lock.tabId === tabId) {
    localStorage.removeItem(LOCK_KEY);
  }
}

export function isLockedByOtherTab() {
  const tabId = getTabId();
  const lock = readLock();
  return !!lock && lock.tabId !== tabId && Date.now() - lock.timestamp < LOCK_TTL;
}

export { LOCK_REFRESH };