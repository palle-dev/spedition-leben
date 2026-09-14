// Adapter für die Simulations-Ausführung.
// Kapselt den Aufruf der Backend-Funktion applyCommandRemote über das SDK.
//
// Die Web-Worker-Variante ist vorbereitet: @base44/sdk greift jedoch beim
// Modul-Ladevorgang auf browser-exklusive Globals (window, localStorage) zu,
// die in Web-Workern nicht existieren — der Worker-Bundle schlägt daher fehl.
// Die Simulation läuft vorerst über den SDK-Aufruf auf dem Main-Thread.
// Die executeCommand-Schnittstelle bleibt identisch, sodass ein Worker
// später ohne Änderungen in gameContext aktiviert werden kann.

import { applyCommandRemote } from "@/lib/gameClient";

export async function executeCommand(state, command, params) {
  return applyCommandRemote({ state, command, params: params || {} });
}