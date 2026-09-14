// Adapter für die Simulations-Ausführung.
// Ruft die Backend-Funktion applyCommandRemote auf — diese wendet den Befehl
// auf den übergebenen Zustand an OHNE Datenbankzugriff (reine Computation).
// Persistierung erfolgt ausschließlich clientseitig via IndexedDB.

import { applyCommandRemote } from "@/lib/gameClient";

export async function executeCommand(state, command, params) {
  return applyCommandRemote({ state, command, params: params || {} });
}