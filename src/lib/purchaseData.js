// Frontend-Spiegel der Anschaffungs-Engine (Auftrag 26).

export const PURCHASE_CATALOG = [
  { id: "coffee", name: "Espressomaschine", priceCents: 60000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "coffee", label: "Kaffeezeit", durationMin: 60, costCents: 0, stressDelta: -3, happinessDelta: 1 } },
  { id: "bike", name: "Fahrrad", priceCents: 90000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "bike_ride", label: "Radtour", durationMin: 120, costCents: 0, stressDelta: -9, happinessDelta: 3 } },
  { id: "sofa", name: "Hochwertige Sofaecke", priceCents: 220000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5 },
  { id: "media", name: "Heimkino", priceCents: 350000, maintenancePerDayCents: 100, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "movie_night", label: "Gemeinsamer Filmabend", durationMin: 120, costCents: 1500, stressDelta: -6, happinessDelta: 3, contactDelta: 3 } },
  { id: "music", name: "Musikecke", priceCents: 400000, maintenancePerDayCents: 100, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "music", label: "Musik machen", durationMin: 120, costCents: 0, stressDelta: -7, happinessDelta: 3 } },
  { id: "fitness", name: "Fitnessausstattung", priceCents: 550000, maintenancePerDayCents: 200, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "fitness_home", label: "Training zuhause", durationMin: 120, costCents: 0, stressDelta: -8, happinessDelta: 3 } },
  { id: "watch", name: "Mechanische Uhr", priceCents: 800000, maintenancePerDayCents: 0, category: "watch", resaleFactor: 0.8 },
  { id: "compact", name: "Privater Kompaktwagen", priceCents: 1500000, maintenancePerDayCents: 300, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "tourer", name: "Reisewagen", priceCents: 4500000, maintenancePerDayCents: 800, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "coupe", name: "Sportcoupé", priceCents: 8500000, maintenancePerDayCents: 1500, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "sport", name: "Sportwagen", priceCents: 18000000, maintenancePerDayCents: 3000, category: "vehicle", resaleFactor: 0.7, isCar: true, isSportCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "supercar", name: "Supersportwagen", priceCents: 65000000, maintenancePerDayCents: 10000, category: "vehicle", resaleFactor: 0.7, isCar: true, isSportCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "art", name: "Kunstsammlung", priceCents: 2500000, maintenancePerDayCents: 100, category: "art", resaleFactor: 0.8 },
  { id: "motorboat", name: "Motorboot", priceCents: 9000000, maintenancePerDayCents: 2500, category: "boat", resaleFactor: 0.7, isBoat: true,
    activity: { type: "boat_trip", label: "Bootsausflug", durationMin: 180, costCents: 6000, stressDelta: -10, happinessDelta: 5 } },
  { id: "apartment", name: "Eigentumswohnung", priceCents: 18000000, maintenancePerDayCents: 3500, category: "property", resaleFactor: 0.9, isHome: true },
  { id: "house", name: "Haus mit Garten", priceCents: 35000000, maintenancePerDayCents: 7000, category: "property", resaleFactor: 0.9, isHome: true,
    activity: { type: "garden", label: "Gartenzeit", durationMin: 120, costCents: 1000, stressDelta: -8, happinessDelta: 3 } },
  { id: "penthouse", name: "Penthouse", priceCents: 85000000, maintenancePerDayCents: 18000, category: "property", resaleFactor: 0.9, isHome: true },
  { id: "holidayhome", name: "Ferienhaus", priceCents: 28000000, maintenancePerDayCents: 5500, category: "property", resaleFactor: 0.9,
    activity: { type: "short_trip", label: "Kurzurlaub", durationMin: 2880, costCents: 45000, stressDelta: -20, happinessDelta: 8, isTrip: true } },
  { id: "villa", name: "Villa", priceCents: 150000000, maintenancePerDayCents: 35000, category: "property", resaleFactor: 0.9, isHome: true, isVilla: true,
    activity: { type: "garden", label: "Gartenzeit", durationMin: 120, costCents: 1000, stressDelta: -8, happinessDelta: 3 } },
  { id: "yacht", name: "Yacht", priceCents: 250000000, maintenancePerDayCents: 60000, category: "boat", resaleFactor: 0.7, isBoat: true,
    activity: { type: "boat_trip", label: "Bootsausflug", durationMin: 180, costCents: 6000, stressDelta: -10, happinessDelta: 5 } },
];

export const BASIC_ACTIVITIES = [
  { type: "walk", label: "Spaziergang", durationMin: 120, costCents: 0, stressDelta: -8, happinessDelta: 2, maxPerDay: 1 },
  { type: "read", label: "Lesen", durationMin: 60, costCents: 0, stressDelta: -4, happinessDelta: 1, maxPerDay: 1 },
  { type: "wellness", label: "Wellnessnachmittag", durationMin: 240, costCents: 12000, stressDelta: -14, happinessDelta: 5, maxPerDay: 1 },
  { type: "cooking", label: "Gemeinsam kochen", durationMin: 120, costCents: 3500, stressDelta: -5, happinessDelta: 3, contactDelta: 4, maxPerDay: 1, requiresContact: true },
  { type: "concert", label: "Konzertabend", durationMin: 240, costCents: 10000, stressDelta: -10, happinessDelta: 4, contactDelta: 5, maxPerWeek: 1, requiresContact: true },
  { type: "short_trip", label: "Kurzurlaub", durationMin: 2880, costCents: 90000, stressDelta: -20, happinessDelta: 8, isTrip: true, maxPerDay: 1 },
];

export const CATEGORY_LABELS = {
  furnishing: "Einrichtung & Hobby",
  watch: "Uhren & Schmuck",
  art: "Kunst",
  vehicle: "Privatautos",
  boat: "Boote",
  property: "Immobilien",
};

export const CATEGORY_ICONS = {
  furnishing: "Sofa",
  watch: "Watch",
  art: "Palette",
  vehicle: "Car",
  boat: "Ship",
  property: "Home",
};

export function getCatalogEntry(id) {
  return PURCHASE_CATALOG.find(p => p.id === id);
}

export function getResalePrice(item) {
  return Math.round(item.purchasePriceCents * item.resaleFactor);
}

export function getActivityOptions(state) {
  const options = [...BASIC_ACTIVITIES.map(a => ({ ...a, source: "basic", itemId: null }))];
  for (const item of (state.private?.purchases?.items || []).filter(i => i.status === "active")) {
    const entry = getCatalogEntry(item.catalogId);
    if (entry?.activity) {
      options.push({ ...entry.activity, source: "possession", itemId: item.id, itemName: item.name });
    }
  }
  return options;
}