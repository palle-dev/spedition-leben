// Wendet einen Spielbefehl auf einen vom Client übergebenen Zustand an.
// Kein DB-Lesen, kein DB-Schreiben – nur reine Simulationslogik.
// Der Client erhält den neuen Zustand sofort (Echtzeit-Anzeige) und
// persistiert später separat über saveGameState.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { applyCommand } from "../../shared/simulationEngine.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { state, command, params } = body || {};
    if (!state || !command) return Response.json({ error: "state und command erforderlich" }, { status: 400 });

    // serverNowMs für Zeitautomatik-Befehle ergänzen
    const isTimeCommand = ["enableAutomation", "pauseAutomation", "syncAutomation", "getAutomationStatus"].includes(command);
    const paramsWithTime = isTimeCommand ? { ...(params || {}), serverNowMs: Date.now() } : (params || {});

    let newState, result;
    try {
      const r = applyCommand(state, command, paramsWithTime);
      newState = r.state; result = r.result;
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    return Response.json({ state: newState, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}