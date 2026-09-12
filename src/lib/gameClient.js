import { base44 } from "@/api/base44Client";

// Dünner Wrapper zur zentralen Backend-Funktion. Der Browser sendet Absichten und IDs,
// keine verbindlichen Preise oder Kontostände – das Backend prüft alles.
export async function gameCommand(payload) {
  try {
    const res = await base44.functions.invoke("gameCommand", payload);
    return res.data;
  } catch (e) {
    // Extrahiere die tatsächliche Fehlermeldung aus der Backend-Antwort
    if (e.response?.data?.error) {
      const err = new Error(e.response.data.error);
      err.conflict = e.response.data.conflict;
      throw err;
    }
    throw e;
  }
}