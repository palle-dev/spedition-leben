// Adapter für die Simulations-Ausführung.
// Ruft die Backend-Funktion applyCommandRemote auf — diese wendet den Befehl
// auf den übergebenen Zustand an OHNE Datenbankzugriff (reine Computation).
// Persistierung erfolgt ausschließlich clientseitig via IndexedDB.

import { applyCommandRemote } from "@/lib/gameClient";

// Reduziert die Zustandsgröße vor dem Netzwerk-Call.
// Entfernt gesehene Events (>1 Tag alt) und kappt das Legacy-Buchungs-Array.
// Diese Daten werden für die Simulation nicht benötigt — der Server arbeitet
// mit dem reduzierten Zustand und gibt ihn zurück. Dadurch bleibt die
// Netzwerk-Payload auch bei langer Spielzeit klein und schnell.
function slimState(state) {
  if (!state) return state;
  let slim = state;
  // Events: nur gesehene + älter als 1 Tag entfernen (unsichtbar für User + Dedup)
  if (state.events && state.events.length > 80) {
    const cutoff = state.gameTime - 1440;
    const slimEvents = state.events.filter(e => !(e.seen && e.gameTime < cutoff));
    if (slimEvents.length < state.events.length) {
      slim = { ...slim, events: slimEvents };
    }
  }
  // Bookings (Legacy-Array): auf letzte 50 kappen — wird nur für Kompatibilität gebraucht
  if (state.bookings && state.bookings.length > 50) {
    slim = { ...slim, bookings: state.bookings.slice(-50) };
  }
  return slim;
}

export async function executeCommand(state, command, params) {
  const slim = slimState(state);
  return applyCommandRemote({ state: slim, command, params: params || {} });
}