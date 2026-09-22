// Geografischer Adapter für FERNWERK.
// Reale Koordinaten [Längengrad, Breitengrad] für MapLibre/GeoJSON,
// versionierte Routengeometrien (vorab von OSRM ermittelt) und
// Positionsableitung ausschließlich aus gespeichertem Spielzustand.

import { CITY_LATLON, dachRoute } from "./simulation/dachGeography.ts";
export const CITY_GEO=CITY_LATLON;

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
  const r = routeData?.routes?.[`${fromCity}->${toCity}`];
  if(r?.coordinates)return r;
  if(!CITY_GEO[fromCity]||!CITY_GEO[toCity])return null;
  return dachRoute(fromCity,toCity);
}

export function hasRealGeometry(fromCity, toCity, routeData) {
  return !!routeData?.routes?.[`${fromCity}->${toCity}`]?.coordinates;
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
    const phases = trip.phases || trip.legs || [];
    const idx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
    if (idx === undefined || idx >= phases.length) return cityGeo || null;
    const phase = phases[idx];

    // Laden/Entladen: an der Stadt
    if (phase.type === "load" || phase.type === "loading" || phase.type === "unload" || phase.type === "unloading") {
      return CITY_GEO[phase.fromCity] || cityGeo || null;
    }

    // Fahrt: entlang Route interpolieren
    if (phase.type === "empty_drive" || phase.type === "loaded_drive" || phase.type === "empty" || phase.type === "drive") {
      const dur = phase.endMin - phase.startMin;
      const progress = dur > 0 ? Math.min(1, Math.max(0, (state.gameTime - phase.startMin) / dur)) : 0;
      const route = phase.routeCoordinates?{coordinates:phase.routeCoordinates,approximate:true}:getRouteGeometry(phase.fromCity, phase.toCity, routeData);
      if (route) return interpolateAlongRoute(route.coordinates, progress);
      const from = CITY_GEO[phase.fromCity], to = CITY_GEO[phase.toCity];
      if (!from || !to) return cityGeo || null;
      return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
    }

    // Pause/Ruhe: an Position des letzten Fahr-Abschnitts bleiben
    if (["break","daily_rest","customs","wait","charging"].includes(phase.type)) {
      let lastDrive = null;
      for (let i = idx - 1; i >= 0; i--) {
        const p = phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive" || p.type === "empty" || p.type === "drive") { lastDrive = p; break; }
      }
      if (lastDrive?.routeCoordinates) return lastDrive.routeCoordinates.at(-1);
      if (lastDrive) {
        const stepFrom = lastDrive.fromCity, stepTo = lastDrive.toCity;
        let totalDur = 0, cumDur = 0;
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          const isDrive = p.type === "empty_drive" || p.type === "loaded_drive" || p.type === "empty" || p.type === "drive";
          if (isDrive && p.fromCity === stepFrom && p.toCity === stepTo) {
            totalDur += (p.endMin - p.startMin);
            if (i < idx) cumDur += (p.endMin - p.startMin);
          }
        }
        const progress = totalDur > 0 ? cumDur / totalDur : 0;
        const route = getRouteGeometry(stepFrom, stepTo, routeData);
        if (route) return interpolateAlongRoute(route.coordinates, progress);
        const from = CITY_GEO[stepFrom], to = CITY_GEO[stepTo];
        if (!from || !to) return cityGeo || null;
        return [from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress];
      }
      return cityGeo || null;
    }
  }
  return cityGeo || null;
}

// --- GeoJSON für Tour-Routen ---

export function buildTripRouteGeoJSON(trip, routeData) {
  const phases = trip?.phases || trip?.legs || [];
  if (!phases || phases.length === 0) return { type: "FeatureCollection", features: [] };
  const idx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
  const features = [];
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const t = phase.type;
    // Nur Fahr-Phasen zeichnen; Pause/Ruhe/Laden/Entladen überspringen
    if (!["empty","empty_drive","drive","loaded_drive"].includes(t)) continue;
    const route = phase.routeCoordinates?{coordinates:phase.routeCoordinates,approximate:true}:getRouteGeometry(phase.fromCity, phase.toCity, routeData);
    const isCurrent = i === idx;
    const isPast = i < idx;
    const legType = (t === "empty" || t === "empty_drive") ? "empty" : "drive";
    if (route) {
      // Echte Straßenroute in Segmente unterteilen, damit die Verkehrslage
      // entlang der Strecke variieren kann (Stau in der Stadt, frei auf der
      // Autobahn). Die Segment-Properties werden in DispatchMap für die
      // segmentweise Verkehrslage-Färbung genutzt.
      const SEGMENT_COUNT = 6;
      const coords = route.coordinates;
      if (coords.length < SEGMENT_COUNT * 2) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: { tripId: trip.id, legType, fromCity: phase.fromCity, toCity: phase.toCity, isCurrent, isPast, fallback: !!route.approximate }
        });
      } else {
        const segLen = Math.floor(coords.length / SEGMENT_COUNT);
        for (let s = 0; s < SEGMENT_COUNT; s++) {
          const startIdx = s * segLen;
          const endIdx = s === SEGMENT_COUNT - 1 ? coords.length - 1 : (s + 1) * segLen;
          const segCoords = coords.slice(startIdx, endIdx + 1);
          if (segCoords.length < 2) continue;
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: segCoords },
            properties: { tripId: trip.id, legType, fromCity: phase.fromCity, toCity: phase.toCity, isCurrent, isPast, fallback: !!route.approximate, segmentIndex: s, segmentCount: SEGMENT_COUNT }
          });
        }
      }
    } else {
      const from = CITY_GEO[phase.fromCity], to = CITY_GEO[phase.toCity];
      if (from && to) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [from, to] },
          properties: { tripId: trip.id, legType, fromCity: phase.fromCity, toCity: phase.toCity, isCurrent, isPast, fallback: true }
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

// --- GeoJSON für Planungs-Vorschau ---

function _segmentRoute(features, fromCity, toCity, legType, routeData) {
  const r = getRouteGeometry(fromCity, toCity, routeData);
  const coords = r ? r.coordinates : [CITY_GEO[fromCity], CITY_GEO[toCity]].filter(Boolean);
  if (!coords || coords.length < 2) return;
  if (r && coords.length >= 12) {
    const SEGMENT_COUNT = 6;
    const segLen = Math.floor(coords.length / SEGMENT_COUNT);
    for (let s = 0; s < SEGMENT_COUNT; s++) {
      const startIdx = s * segLen;
      const endIdx = s === SEGMENT_COUNT - 1 ? coords.length - 1 : (s + 1) * segLen;
      const segCoords = coords.slice(startIdx, endIdx + 1);
      if (segCoords.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: segCoords },
        properties: { legType, fromCity, toCity, fallback: false, segmentIndex: s, segmentCount: SEGMENT_COUNT }
      });
    }
  } else {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: { legType, fromCity, toCity, fallback: !r }
    });
  }
}

export function buildPlanRouteGeoJSON(fromCity, toCity, hasEmpty, emptyFrom, emptyTo, routeData) {
  const features = [];
  if (hasEmpty && emptyFrom && emptyTo) {
    _segmentRoute(features, emptyFrom, emptyTo, "empty", routeData);
  }
  _segmentRoute(features, fromCity, toCity, "drive", routeData);
  return { type: "FeatureCollection", features };
}

// --- GeoJSON für Tour-Ketten (Mehrfachauftrags-Touren) ---

export function buildTourRouteGeoJSON(plan, routeData) {
  if (!plan || !plan.deployments) return { type: "FeatureCollection", features: [] };
  const features = [];
  const allDeps = [...plan.deployments];
  if (plan.returnDeployment) allDeps.push(plan.returnDeployment);

  for (let di = 0; di < allDeps.length; di++) {
    const dep = allDeps[di];
    const isReturn = di > 0 || dep.orderId === null;
    const depPhases = dep.phases || dep.legs || [];
    for (const phase of depPhases) {
      const t = phase.type;
      if (!["empty","empty_drive","drive","loaded_drive"].includes(t)) continue;
      const route = phase.routeCoordinates?{coordinates:phase.routeCoordinates,approximate:true}:getRouteGeometry(phase.fromCity, phase.toCity, routeData);
      const coords = route ? route.coordinates : [CITY_GEO[phase.fromCity], CITY_GEO[phase.toCity]].filter(Boolean);
      if (!coords || coords.length < 2) continue;
      const legType = (t === "empty" || t === "empty_drive") ? "empty" : "drive";
      // Echte Straßenroute in Segmente unterteilen für segmentweise Verkehrslage
      if (route && coords.length >= 12) {
        const SEGMENT_COUNT = 6;
        const segLen = Math.floor(coords.length / SEGMENT_COUNT);
        for (let s = 0; s < SEGMENT_COUNT; s++) {
          const startIdx = s * segLen;
          const endIdx = s === SEGMENT_COUNT - 1 ? coords.length - 1 : (s + 1) * segLen;
          const segCoords = coords.slice(startIdx, endIdx + 1);
          if (segCoords.length < 2) continue;
          features.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: segCoords },
            properties: {
              legType,
              fromCity: phase.fromCity,
              toCity: phase.toCity,
              depIndex: di,
              isReturn,
              isOutbound: di === 0 && t !== "empty_drive" && t !== "empty",
              fallback: false,
              tourLeg: true,
              segmentIndex: s,
              segmentCount: SEGMENT_COUNT,
            },
          });
        }
      } else {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: coords },
          properties: {
            legType,
            fromCity: phase.fromCity,
            toCity: phase.toCity,
            depIndex: di,
            isReturn,
            isOutbound: di === 0 && t !== "empty_drive" && t !== "empty",
            fallback: !route,
            tourLeg: true,
          },
        });
      }
    }
  }

  // Stop-Marker (numeriert)
  const stops = [];
  const seenCities = new Set();
  for (let di = 0; di < allDeps.length; di++) {
    const dep = allDeps[di];
    const depPhases = dep.phases || dep.legs || [];
    const startCity = depPhases[0]?.fromCity || dep.fromCity;
    const endCity = depPhases[depPhases.length - 1]?.toCity || dep.toCity;
    const startKey = `${di}_start_${startCity}`;
    const endKey = `${di}_end_${endCity}`;
    const depIsReturn = di > 0 || (allDeps[di].orderId === null);
    if (!seenCities.has(startKey)) {
      const geo = CITY_GEO[startCity];
      if (geo) features.push({ type: "Feature", geometry: { type: "Point", coordinates: geo }, properties: { stopType: "stop", stopIndex: stops.length + 1, city: startCity, depIndex: di, isReturn: depIsReturn } });
      seenCities.add(startKey);
      stops.push(startCity);
    }
    if (!seenCities.has(endKey)) {
      const geo = CITY_GEO[endCity];
      if (geo) features.push({ type: "Feature", geometry: { type: "Point", coordinates: geo }, properties: { stopType: "stop", stopIndex: stops.length + 1, city: endCity, depIndex: di, isReturn: depIsReturn } });
      seenCities.add(endKey);
      stops.push(endCity);
    }
  }

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