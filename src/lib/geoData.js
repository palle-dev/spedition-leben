// Geografischer Adapter für FERNWERK.
// Reale Koordinaten [Längengrad, Breitengrad] für MapLibre/GeoJSON,
// versionierte Routengeometrien (vorab von OSRM ermittelt) und
// Positionsableitung ausschließlich aus gespeichertem Spielzustand.

export const CITY_GEO = {
  Hamburg:   [9.9937, 53.5511],
  Bremen:    [8.8072, 53.0758],
  Kiel:      [10.1394, 54.3233],
  Lübeck:    [10.6866, 53.8697],
  Hannover:  [9.7322, 52.3759],
  Berlin:    [13.4050, 52.5200],
  Rostock:   [12.0989, 54.0922],
  Magdeburg: [11.6276, 52.1205]
};

export const HQ_CITY = "Hamburg";

// --- Routengeometrien (versioniert, vorab ermittelt) ---

let _routeData = null;
let _routePromise = null;

export async function loadRouteGeometries() {
  if (_routeData) return _routeData;
  if (_routePromise) return _routePromise;
  _routePromise = (async () => {
    try {
      const mod = await import("@/data/routeGeometries.json");
      _routeData = mod.default;
    } catch (e) {
      console.warn("Routengeometrien nicht ladbar:", e);
      _routeData = { version: 0, routes: {} };
    }
    return _routeData;
  })();
  return _routePromise;
}

export function getRouteGeometry(fromCity, toCity, routeData) {
  if (!routeData?.routes) return null;
  const r = routeData.routes[`${fromCity}->${toCity}`];
  return r?.coordinates ? r : null;
}

export function hasRealGeometry(fromCity, toCity, routeData) {
  return !!getRouteGeometry(fromCity, toCity, routeData);
}

// --- Interpolation entlang einer GeoJSON-LineString-Geometrie ---

export function interpolateAlongRoute(coordinates, progress) {
  if (!coordinates || coordinates.length < 2) return coordinates?.[0] || null;
  if (progress <= 0) return coordinates[0];
  if (progress >= 1) return coordinates[coordinates.length - 1];
  const d = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const dx = coordinates[i][0] - coordinates[i - 1][0];
    const dy = coordinates[i][1] - coordinates[i - 1][1];
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = d[d.length - 1];
  if (total === 0) return coordinates[0];
  const target = progress * total;
  for (let i = 1; i < d.length; i++) {
    if (d[i] >= target) {
      const t = (target - d[i - 1]) / (d[i] - d[i - 1] || 1);
      return [
        coordinates[i - 1][0] + (coordinates[i][0] - coordinates[i - 1][0]) * t,
        coordinates[i - 1][1] + (coordinates[i][1] - coordinates[i - 1][1]) * t
      ];
    }
  }
  return coordinates[coordinates.length - 1];
}

// --- Fahrzeug-Geo-Position aus Spielzustand ---

export function getVehicleGeoPosition(vehicle, state, routeData) {
  if (!vehicle) return null;
  const cityGeo = CITY_GEO[vehicle.locationCity];
  if (vehicle.status === "free" || vehicle.status === "maintenance") return cityGeo || null;
  if (vehicle.status === "on_trip" && vehicle.tripId) {
    const trip = state.trips.find(t => t.id === vehicle.tripId);
    if (!trip || trip.status !== "in_progress") return cityGeo || null;
    const leg = trip.legs[trip.currentLeg];
    if (!leg) return cityGeo || null;
    if (leg.type === "load" || leg.type === "unload") return CITY_GEO[leg.fromCity] || cityGeo || null;
    const dur = leg.endMin - leg.startMin;
    const progress = dur > 0 ? Math.min(1, Math.max(0, (state.gameTime - leg.startMin) / dur)) : 0;
    const route = getRouteGeometry(leg.fromCity, leg.toCity, routeData);
    if (route) return interpolateAlongRoute(route.coordinates, progress);
    const from = CITY_GEO[leg.fromCity], to = CITY_GEO[leg.toCity];
    if (!from || !to) return cityGeo || null;
    return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
  }
  return cityGeo || null;
}

// --- GeoJSON für Tour-Routen ---

export function buildTripRouteGeoJSON(trip, routeData) {
  if (!trip?.legs) return { type: "FeatureCollection", features: [] };
  const features = [];
  for (const leg of trip.legs) {
    if (leg.type === "load" || leg.type === "unload") continue;
    const route = getRouteGeometry(leg.fromCity, leg.toCity, routeData);
    const isCurrent = trip.legs[trip.currentLeg] === leg;
    const isPast = trip.legs.indexOf(leg) < trip.currentLeg;
    if (route) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: route.coordinates },
        properties: { tripId: trip.id, legType: leg.type, fromCity: leg.fromCity, toCity: leg.toCity, isCurrent, isPast, fallback: false }
      });
    } else {
      const from = CITY_GEO[leg.fromCity], to = CITY_GEO[leg.toCity];
      if (from && to) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [from, to] },
          properties: { tripId: trip.id, legType: leg.type, fromCity: leg.fromCity, toCity: leg.toCity, isCurrent, isPast, fallback: true }
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

// --- GeoJSON für Planungs-Vorschau ---

export function buildPlanRouteGeoJSON(fromCity, toCity, hasEmpty, emptyFrom, emptyTo, routeData) {
  const features = [];
  if (hasEmpty && emptyFrom && emptyTo) {
    const r = getRouteGeometry(emptyFrom, emptyTo, routeData);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: r ? r.coordinates : [CITY_GEO[emptyFrom], CITY_GEO[emptyTo]].filter(Boolean) },
      properties: { legType: "empty", fromCity: emptyFrom, toCity: emptyTo, fallback: !r }
    });
  }
  const r = getRouteGeometry(fromCity, toCity, routeData);
  features.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: r ? r.coordinates : [CITY_GEO[fromCity], CITY_GEO[toCity]].filter(Boolean) },
    properties: { legType: "drive", fromCity, toCity, fallback: !r }
  });
  return { type: "FeatureCollection", features };
}

// --- Bounding Box ---

export function getTripBounds(trip, routeData) {
  const geo = buildTripRouteGeoJSON(trip, routeData);
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const f of geo.features) {
    for (const [lng, lat] of f.geometry.coordinates) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLng === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

export function getFleetBounds(state, routeData) {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const v of state.vehicles) {
    const pos = getVehicleGeoPosition(v, state, routeData);
    if (!pos) continue;
    if (pos[0] < minLng) minLng = pos[0];
    if (pos[1] < minLat) minLat = pos[1];
    if (pos[0] > maxLng) maxLng = pos[0];
    if (pos[1] > maxLat) maxLat = pos[1];
  }
  if (minLng === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}