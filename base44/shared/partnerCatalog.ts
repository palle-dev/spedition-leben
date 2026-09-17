// Partner-Speditionen für FERNWERK.
// Statischer Katalog fiktiver Partner-Unternehmen mit unterschiedlichen Profilen.
// Die externe Betriebsorganisation wird abstrahiert — keine vollständigen
// Unternehmen mit eigenen Buchhaltungen, sondern kontingentbasierte Profile.
//
// Jeder Partner enthält:
// - Name und Beschreibung
// - Bediente Regionen/Relationen
// - Unterstützte Transportarten
// - Maximale Frachtmenge
// - Spezialqualifikationen (Gefahrgut etc.)
// - Preisregeln (Basispreis + km-Satz + Tonnen-Satz, ggf. Zuschläge)
// - Planbare Leistungszeiten (min. Vorlauf, max. Lieferzeit)
// - Begrenztes Kontingent (max. Transportstarts pro Spieltag)
// - Standard-Stornierungsbedingungen

export const PARTNER_CATALOG = [
  {
    id: "p01",
    name: "NordExpress Logistik GmbH",
    description: "Zuverlässiger Partner für norddeutsche Relationen. Solide Mittelpreis-Klasse mit angemessener Pünktlichkeit.",
    regions: ["Hamburg", "Bremen", "Kiel", "Lübeck", "Hannover", "Rostock", "Braunschweig", "Osnabrück", "Münster", "Bielefeld"],
    // Relationen: [von, nach] — Partner kann nur Transporte bedienen, bei denen
    // entweder Abgang oder Ziel in seinen Regions-Städten liegt.
    transportTypes: ["standard", "regional", "express"],
    maxTons: 24,
    qualifications: {
      dangerousGoods: false,
      refrigerated: false,
      oversized: false,
    },
    pricing: {
      baseCents: 8000,        // 80 € Grundpreis
      perKmCents: 180,         // 1,80 €/km
      perTonCents: 400,        // 4 €/t
      expressSurcharge: 0.20,  // +20% bei Express
      dgSurcharge: 0,          // kein Gefahrgut
    },
    timing: {
      minLeadMin: 120,         // frühester Beginn: 2h nach Beauftragung
      deliveryHoursPer100km: 2.0, // 2h pro 100 km (inkl. Be-/Entladung)
      maxDurationMin: 4320,    // max. 3 Tage bis Lieferung
    },
    dailyCapacity: 4,          // max. 4 Transportstarts pro Spieltag
    cancellation: {
      freeUntilMin: 180,       // kostenlos stornierbar bis 3h vor Beginn
      feePct: 30,              // danach 30% des Preises
    },
  },
  {
    id: "p02",
    name: "SüdTrans Spedition",
    description: "Spezialist für süd- und mitteldeutsche Strecken. Flexibel, etwas teurer, dafür breite Qualifikationen.",
    regions: ["München", "Stuttgart", "Nürnberg", "Frankfurt", "Mannheim", "Freiburg", "Würzburg", "Regensburg", "Ulm", "Kassel", "Erfurt", "Leipzig"],
    transportTypes: ["standard", "regional", "express", "dangerousGoods"],
    maxTons: 18,
    qualifications: {
      dangerousGoods: true,
      refrigerated: false,
      oversized: false,
    },
    pricing: {
      baseCents: 10000,
      perKmCents: 220,
      perTonCents: 500,
      expressSurcharge: 0.25,
      dgSurcharge: 0.15,       // +15% Gefahrgutzuschlag
    },
    timing: {
      minLeadMin: 180,         // 3h Vorlauf
      deliveryHoursPer100km: 2.2,
      maxDurationMin: 4320,
    },
    dailyCapacity: 3,
    cancellation: {
      freeUntilMin: 240,       // 4h kostenlos
      feePct: 25,
    },
  },
  {
    id: "p03",
    name: "RheinCargo Transport",
    description: "Westdeutscher Vollservice-Partner. Gefahrgut-zertifiziert, höhere Kapazität, Premium-Preise.",
    regions: ["Köln", "Düsseldorf", "Dortmund", "Essen", "Münster", "Bonn", "Aachen", "Wuppertal", "Bielefeld", "Kassel", "Frankfurt", "Mannheim", "Saarbrücken"],
    transportTypes: ["standard", "regional", "express", "dangerousGoods"],
    maxTons: 24,
    qualifications: {
      dangerousGoods: true,
      refrigerated: false,
      oversized: false,
    },
    pricing: {
      baseCents: 12000,
      perKmCents: 250,
      perTonCents: 600,
      expressSurcharge: 0.30,
      dgSurcharge: 0.20,
    },
    timing: {
      minLeadMin: 240,         // 4h Vorlauf
      deliveryHoursPer100km: 2.5,
      maxDurationMin: 5760,    // 4 Tage
    },
    dailyCapacity: 5,
    cancellation: {
      freeUntilMin: 360,       // 6h kostenlos
      feePct: 20,
    },
  },
  {
    id: "p04",
    name: "OstWind Fracht",
    description: "Kompakter Partner für ostdeutsche Relationen. Günstig, aber begrenzte Kapazität und keine Spezialqualifikationen.",
    regions: ["Berlin", "Magdeburg", "Leipzig", "Dresden", "Erfurt", "Rostock", "Hannover", "Braunschweig"],
    transportTypes: ["standard", "regional"],
    maxTons: 12,
    qualifications: {
      dangerousGoods: false,
      refrigerated: false,
      oversized: false,
    },
    pricing: {
      baseCents: 6000,
      perKmCents: 150,
      perTonCents: 350,
      expressSurcharge: 0.15,
      dgSurcharge: 0,
    },
    timing: {
      minLeadMin: 90,          // 1,5h Vorlauf — schnell
      deliveryHoursPer100km: 1.8,
      maxDurationMin: 2880,    // 2 Tage
    },
    dailyCapacity: 2,
    cancellation: {
      freeUntilMin: 120,       // 2h kostenlos
      feePct: 40,
    },
  },
  {
    id: "p05",
    name: "TransEuropa Logistik",
    description: "Überregionaler Großpartner. Hohe Kapazität, alle Transportarten, aber teuer und längerer Vorlauf.",
    regions: [], // leer = deckt alle Städte ab (überregional)
    transportTypes: ["standard", "regional", "express", "dangerousGoods"],
    maxTons: 24,
    qualifications: {
      dangerousGoods: true,
      refrigerated: false,
      oversized: false,
    },
    pricing: {
      baseCents: 15000,
      perKmCents: 280,
      perTonCents: 700,
      expressSurcharge: 0.35,
      dgSurcharge: 0.25,
    },
    timing: {
      minLeadMin: 360,         // 6h Vorlauf
      deliveryHoursPer100km: 2.8,
      maxDurationMin: 5760,
    },
    dailyCapacity: 6,
    cancellation: {
      freeUntilMin: 480,       // 8h kostenlos
      feePct: 15,
    },
  },
];

// Prüft, ob ein Partner eine gegebene Relation bedienen kann.
// Ein Partner mit leeren regions deckt alle Städte ab (überregional).
// Sonst muss Abgang ODER Ziel in seinen Regions-Städten liegen.
export function canServeRelation(partner, fromCity, toCity) {
  if (!partner.regions || partner.regions.length === 0) return true; // überregional
  return partner.regions.includes(fromCity) || partner.regions.includes(toCity);
}

// Prüft, ob ein Partner die Transportart des Auftrags unterstützt.
export function supportsTransportType(partner, orderType) {
  return partner.transportTypes.includes(orderType);
}

// Prüft, ob ein Partner die Qualifikationsanforderungen eines Auftrags erfüllt.
export function meetsQualifications(partner, order) {
  if (order.isDangerousGoods && !partner.qualifications.dangerousGoods) return false;
  return true;
}

// Prüft, ob ein Partner die Frachtmenge eines Auftrags bewältigen kann.
export function canCarryTons(partner, tons) {
  return tons <= partner.maxTons;
}

// Komplette Eignungsprüfung für einen Auftrag.
export function isPartnerEligible(partner, order, orderType) {
  if (!canServeRelation(partner, order.fromCity, order.toCity)) return false;
  if (!supportsTransportType(partner, orderType)) return false;
  if (!meetsQualifications(partner, order)) return false;
  if (!canCarryTons(partner, order.tons)) return false;
  return true;
}

export function getPartnerById(id) {
  return PARTNER_CATALOG.find(p => p.id === id) || null;
}

export const PARTNER_VERSION = 1;