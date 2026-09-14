// Web-Worker für die FERNWERK-Simulation.
// Ruft die Backend-Funktion applyCommandRemote per SDK auf — der Main-Thread
// bleibt während der Server-Berechnung frei. Empfängt { id, state, command, params }
// und gibt { id, state, result } bzw. { id, error } zurück.

import { createClient } from "@base44/sdk";

let client = null;

self.onmessage = async (e) => {
  const data = e.data;

  if (data.type === "init") {
    client = createClient({
      appId: data.appId,
      token: data.token,
      functionsVersion: data.functionsVersion,
      serverUrl: "",
      appBaseUrl: data.appBaseUrl,
    });
    self.postMessage({ type: "ready" });
    return;
  }

  const { id, state, command, params } = data;
  try {
    const res = await client.functions.invoke("applyCommandRemote", { state, command, params });
    self.postMessage({ id, state: res.data.state, result: res.data.result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};