// Tab-Schreibsperre über localStorage.
// Verhindert, dass mehrere Tabs gleichzeitig in IndexedDB/Server schreiben.

const LOCK_KEY = "fernwerk_lock";
const LOCK_TTL = 5000;     // Lock verfällt nach 5 s ohne Heartbeat
const LOCK_REFRESH = 2000; // Heartbeat alle 2 s

export function getTabId() {
  let id = sessionStorage.getItem("fernwerk_tab_id");
  if (!id) {
    id = "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem("fernwerk_tab_id", id);
  }
  return id;
}

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

// Erneuert den Lock, wenn dieser Tab ihn hält. Versucht ggf. erneut zu erwerben.
export function refreshLock() {
  const tabId = getTabId();
  const lock = readLock();
  if (lock && lock.tabId === tabId) {
    writeLock(tabId);
    return true;
  }
  // Lock ist frei oder abgelaufen — versuchen zu erwerben
  if (!lock || Date.now() - lock.timestamp >= LOCK_TTL) {
    writeLock(tabId);
    return true;
  }
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