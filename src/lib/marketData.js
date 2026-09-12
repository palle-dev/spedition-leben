// Client-seitige Markt-Daten für FERNWERK (Auftrag 19).
// Spiegelt die serverseitigen Konstanten für die Anzeige.

export const OFFER_TYPE_LABELS = {
  normal: "Standard",
  express: "Express",
  advance: "Vorlauf",
};

export const OFFER_TYPE_STYLES = {
  normal: "bg-white/5 text-muted-foreground border-white/10",
  express: "bg-red-500/15 text-red-300 border-red-400/30",
  advance: "bg-sky-500/15 text-sky-300 border-sky-400/30",
};

export const OFFER_TYPE_ICONS = {
  normal: "Package",
  express: "Zap",
  advance: "CalendarClock",
};

export function getOfferTypeLabel(type) {
  return OFFER_TYPE_LABELS[type] || "Standard";
}

export function getOfferTypeStyle(type) {
  return OFFER_TYPE_STYLES[type] || OFFER_TYPE_STYLES.normal;
}

export function formatPaymentTerms(days) {
  if (!days || days === 0) return "Sofortzahlung";
  if (days === 3) return "Zahlungsziel 3 Tage";
  if (days === 7) return "Zahlungsziel 7 Tage";
  return `Zahlungsziel ${days} Tage`;
}

// Kundenprofile für die Anzeige
export const CUSTOMER_PROFILES = [
  { id: "c01", name: "Hanse Handelskontor", industry: "Handel", contact: "Frau Brandt", depots: ["Hamburg"] },
  { id: "c02", name: "Norddeutsche Feinkost", industry: "Lebensmittel", contact: "Herr Petersen", depots: ["Hamburg"] },
  { id: "c03", name: "Ostsee Frischlief", industry: "Getränke", contact: "Frau Jansen", depots: ["Rostock","Kiel"] },
  { id: "c04", name: "Weser Handel", industry: "Möbel", contact: "Herr Meyer", depots: ["Bremen"] },
  { id: "c05", name: "Hauptstadt-Express", industry: "Elektronik", contact: "Frau Schwarz", depots: ["Berlin"] },
  { id: "c06", name: "Ostsee-Vertrieb", industry: "Textilien", contact: "Herr Lange", depots: ["Rostock"] },
  { id: "c07", name: "Elbe-Logistik", industry: "Bauteile", contact: "Herr Wagner", depots: ["Hamburg","Magdeburg"] },
  { id: "c08", name: "Schleswig-Spedition", industry: "Verpackung", contact: "Frau Hansen", depots: ["Lübeck"] },
  { id: "c09", name: "Nordwind Transport", industry: "Baustoffe", contact: "Herr Storm", depots: ["Hannover"] },
  { id: "c10", name: "Salzstein GmbH", industry: "Stückgut", contact: "Frau Keller", depots: ["Magdeburg"] },
  { id: "c11", name: "Müller & Söhne", industry: "Maschinenteile", contact: "Herr Müller", depots: ["Hannover","Bremen"] },
  { id: "c12", name: "Havel-Spedition", industry: "Lebensmittel", contact: "Frau Weber", depots: ["Berlin"] },
  { id: "c13", name: "Alsterwerk", industry: "Maschinenteile", contact: "Herr Becker", depots: ["Hamburg"] },
  { id: "c14", name: "Prien Paketdienst", industry: "Stückgut", contact: "Frau Stahl", depots: ["Lübeck","Kiel"] },
  { id: "c15", name: "Eldena Export", industry: "Getränke", contact: "Herr Greif", depots: ["Rostock"] },
];

export function getCustomerProfile(customerId) {
  return CUSTOMER_PROFILES.find(c => c.id === customerId) || null;
}

// Markt-Statistik aus dem Spielzustand lesen
export function getMarketStats(state) {
  const market = state?.market;
  if (!market) return { n: 0, t: 24, openOffers: 0, nextWaveMin: 0, nextWaveLabel: "—" };
  const stats = market.stats || {};
  const openOffers = (state.orders || []).filter(o => o.status === "offered").length;
  const nextWaveMin = market.nextWaveMin || 0;
  return {
    n: stats.lastN || 0,
    t: stats.lastT || 24,
    b: stats.lastB || 0,
    openOffers,
    nextWaveMin,
    wavesProcessed: stats.wavesProcessed || 0,
    offersGenerated: stats.offersGenerated || 0,
  };
}