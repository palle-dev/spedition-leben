import { base44 } from "@/api/base44Client";

// Dünner Wrapper zur zentralen Backend-Funktion. Der Browser sendet Absichten und IDs,
// keine verbindlichen Preise oder Kontostände – das Backend prüft alles.
export async function gameCommand(payload) {
  const res = await base44.functions.invoke("gameCommand", payload);
  return res.data;
}