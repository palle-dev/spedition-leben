import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useGame } from "@/lib/gameContext";
import {
  CITY_GEO, HQ_CITY, getVehicleGeoPosition, buildTripRouteGeoJSON,
  getTripBounds, getFleetBounds
} from "@/lib/geoData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { getTrafficLevel, getSegmentTrafficLevel } from "@/lib/trafficSystem";
import { AlertTriangle } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const MAP_CENTER = [10.2, 51.0];
const MAP_ZOOM = 5.0;
const MAX_BOUNDS = [[4, 46], [16, 56]];

// Verkehrsbasierte Farbexpression für MapLibre
const TRAFFIC_COLOR_EXPR = [
  "match", ["get", "trafficLevel"],
  0, "#4ADE80",
  1, "#FBBF24",
  2, "#FB923C",
  3, "#EF4444",
  "#D5FB83"
];

export default function DispatchMap({
  routeData,
  selectedTripId,
  selectedVehicleId,
  planRoute,
  showTraffic = true,
  onSelectTrip,
  onSelectVehicle,
  focusAction,
  onFocusDone
}) {
  const { state } = useGame();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onSelectTrip, onSelectVehicle };
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // --- Karteninitialisierung (einmalig) ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    let map;
    let mounted = true;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE,
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        maxBounds: MAX_BOUNDS,
        attributionControl: false
      });
    } catch (e) {
      console.error("Karteninitialisierung fehlgeschlagen:", e);
      setMapError(true);
      return;
    }

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }), "top-left");

    const styleTimer = setTimeout(() => { if (!mounted) return; setMapError(true); }, 8000);

    map.on("load", () => {
      if (!mounted) return;
      clearTimeout(styleTimer);
      setMapError(false);
      setupSources(map);
      setupLayers(map);
      setupClickHandlers(map, cbRef);
      setMapLoaded(true);
    });

    map.on("error", (e) => {
      if (!mounted) return;
      if (e?.error?.message?.includes("style")) {
        clearTimeout(styleTimer);
        setMapError(true);
      }
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => { if (mounted) map?.resize(); });
    ro.observe(container);

    return () => {
      mounted = false;
      clearTimeout(styleTimer);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // --- Verkehrslage ein/ausschalten ---
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const driveColor = showTraffic ? TRAFFIC_COLOR_EXPR : "#D5FB83";
    const emptyColor = showTraffic ? TRAFFIC_COLOR_EXPR : "#FF9E7A";
    try {
      map.setPaintProperty("tour-drive", "line-color", driveColor);
      map.setPaintProperty("tour-empty", "line-color", emptyColor);
      map.setPaintProperty("plan-drive", "line-color", driveColor);
      map.setPaintProperty("plan-empty", "line-color", emptyColor);
    } catch (e) { /* Layer evtl. noch nicht ready */ }
  }, [mapLoaded, showTraffic]);

  // --- Daten-Update bei Zustandsänderung ---
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    updateCities(map);
    updateVehicles(map, state, routeData, selectedTripId, selectedVehicleId);
    updateTours(map, state, routeData, selectedTripId);
    updatePlanRoute(map, planRoute, state);
  }, [mapLoaded, state, routeData, selectedTripId, selectedVehicleId, planRoute]);

  // --- Fokus-Aktionen (fitBounds / flyTo) ---
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !focusAction) return;
    const map = mapRef.current;
    const padding = { top: 40, bottom: 40, left: 40, right: 420 };
    const mobilePadding = { top: 40, bottom: 200, left: 40, right: 40 };
    const isMobile = window.innerWidth < 1024;
    const pad = isMobile ? mobilePadding : padding;

    if (focusAction.type === "trip") {
      const trip = state.trips.find(t => t.id === focusAction.tripId);
      if (trip) {
        const bounds = getTripBounds(trip, routeData);
        if (bounds) map.fitBounds(bounds, { padding: pad, duration: 600 });
      }
    } else if (focusAction.type === "fleet") {
      const bounds = getFleetBounds(state, routeData);
      if (bounds) map.fitBounds(bounds, { padding: pad, duration: 600 });
    } else if (focusAction.type === "hq") {
      map.flyTo({ center: CITY_GEO[HQ_CITY], zoom: 8, duration: 600 });
    } else if (focusAction.type === "vehicle") {
      const v = state.vehicles.find(x => x.id === focusAction.vehicleId);
      const pos = v && getVehicleGeoPosition(v, state, routeData);
      if (pos) map.flyTo({ center: pos, zoom: 9, duration: 600 });
    }
    onFocusDone?.();
  }, [mapLoaded, focusAction, state, routeData]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink ring-1 ring-white/[0.06]">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Vignette für Tiefenwirkung */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(0,0,0,0.55)] z-[1]" />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 bg-ink/80">
          <div className="glass border border-white/15 rounded-xl p-5 max-w-sm text-center">
            <AlertTriangle className="w-7 h-7 text-amber-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-foreground">Karte nicht verfügbar</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Die Basiskarte konnte nicht geladen werden. Die Disposition bleibt über die Listen nutzbar.
            </p>
            <button
              onClick={() => { setMapError(false); setMapLoaded(false); setTimeout(() => window.location.reload(), 100); }}
              className="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium transition"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- MapLibre Setup ---

function setupSources(map) {
  map.addSource("cities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("vehicles", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("tours", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("plan-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
}

function setupLayers(map) {
  // Tour-Glow (nur ausgewählte Tour — breiter, halbtransparenter Halo)
  map.addLayer({
    id: "tour-glow", type: "line", source: "tours",
    filter: ["all", ["==", ["get", "isSelected"], true], ["==", ["get", "legType"], "drive"]],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#D5FB83", "line-width": 16, "line-opacity": 0.15, "line-blur": 6 }
  });
  // Tour-Linien: Leerfahrt (gestrichelt) — nicht ausgewählt fast unsichtbar
  map.addLayer({
    id: "tour-empty", type: "line", source: "tours",
    filter: ["==", ["get", "legType"], "empty"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#FF9E7A",
      "line-width": ["case", ["get", "isSelected"], 4, 1.5],
      "line-opacity": ["case", ["get", "isSelected"], 0.85, 0.03],
      "line-dasharray": [3, 2]
    }
  });
  // Tour-Linien: Beladene Fahrt (durchgezogen) — nicht ausgewählt fast unsichtbar
  map.addLayer({
    id: "tour-drive", type: "line", source: "tours",
    filter: ["==", ["get", "legType"], "drive"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": "#D5FB83",
      "line-width": ["case", ["get", "isSelected"], 5.5, 2.5],
      "line-opacity": ["case", ["get", "isSelected"], 1, 0.03]
    }
  });
  // Planungs-Vorschau
  map.addLayer({
    id: "plan-empty", type: "line", source: "plan-route",
    filter: ["match", ["get", "legType"], ["empty", "empty_drive"], true, false],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#FF9E7A", "line-width": 3.5, "line-opacity": 0.75, "line-dasharray": [3, 2] }
  });
  map.addLayer({
    id: "plan-drive", type: "line", source: "plan-route",
    filter: ["==", ["get", "legType"], "drive"],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#D5FB83", "line-width": 4.5, "line-opacity": 0.75 }
  });
  // Tour-Stopps (nummeriert)
  map.addLayer({
    id: "plan-stops", type: "circle", source: "plan-route",
    filter: ["==", ["get", "stopType"], "stop"],
    paint: {
      "circle-radius": 9,
      "circle-color": ["case", ["get", "isReturn"], "#FF9E7A", "#D5FB83"],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#0b1011"
    }
  });
  map.addLayer({
    id: "plan-stop-labels", type: "symbol", source: "plan-route",
    filter: ["==", ["get", "stopType"], "stop"],
    layout: {
      "text-field": ["to-string", ["get", "stopIndex"]],
      "text-size": 12,
      "text-anchor": "center",
      "text-offset": [0, 0.05]
    },
    paint: { "text-color": "#0b1011" }
  });
  // Städte — HQ hervorgehoben, Rest dezent
  map.addLayer({
    id: "cities", type: "circle", source: "cities",
    paint: {
      "circle-radius": ["case", ["get", "isHQ"], 7, 4],
      "circle-color": ["case", ["get", "isHQ"], "#D5FB83", "#555"],
      "circle-stroke-width": ["case", ["get", "isHQ"], 2.5, 1],
      "circle-stroke-color": ["case", ["get", "isHQ"], "rgba(213,251,131,0.4)", "rgba(255,255,255,0.12)"]
    }
  });
  map.addLayer({
    id: "city-labels", type: "symbol", source: "cities",
    layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, -1.4], "text-anchor": "bottom", "text-transform": "uppercase", "text-letter-spacing": 0.1 },
    paint: { "text-color": "#888", "text-halo-color": "#000", "text-halo-width": 2.5 }
  });
  // Fahrzeuge — Glow für ausgewählte
  map.addLayer({
    id: "vehicles-glow", type: "circle", source: "vehicles",
    filter: ["==", ["get", "isSelected"], true],
    paint: { "circle-radius": 18, "circle-color": "#FCD34D", "circle-opacity": 0.18, "circle-blur": 1.5 }
  });
  map.addLayer({
    id: "vehicles", type: "circle", source: "vehicles",
    paint: {
      "circle-radius": ["case", ["get", "isSelected"], 10, 7],
      "circle-color": ["match", ["get", "status"], "free", "#D5FB83", "on_trip", "#FCD34D", "maintenance", "#7DD3FC", "#888"],
      "circle-stroke-width": ["case", ["get", "isSelected"], 3, 2],
      "circle-stroke-color": ["case", ["get", "isSelected"], "#fff", "rgba(0,0,0,0.6)"]
    }
  });
  map.addLayer({
    id: "vehicle-labels", type: "symbol", source: "vehicles",
    filter: ["==", ["get", "isSelected"], true],
    layout: { "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, -1.7], "text-anchor": "bottom" },
    paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 2.5 }
  });
}

function setupClickHandlers(map, cbRef) {
  const cursor = (enter) => () => { map.getCanvas().style.cursor = enter ? "pointer" : ""; };
  for (const layer of ["vehicles", "tour-glow", "tour-empty", "tour-drive", "cities"]) {
    map.on("mouseenter", layer, cursor(true));
    map.on("mouseleave", layer, cursor(false));
  }
  map.on("click", "vehicles", (e) => {
    if (e.features.length) cbRef.current.onSelectVehicle?.(e.features[0].properties.vehicleId);
  });
  map.on("click", "tour-glow", (e) => {
    if (e.features.length) cbRef.current.onSelectTrip?.(e.features[0].properties.tripId);
  });
  map.on("click", "tour-empty", (e) => {
    if (e.features.length) cbRef.current.onSelectTrip?.(e.features[0].properties.tripId);
  });
  map.on("click", "tour-drive", (e) => {
    if (e.features.length) cbRef.current.onSelectTrip?.(e.features[0].properties.tripId);
  });
}

// --- Daten-Updates ---

function updateCities(map) {
  const features = Object.entries(CITY_GEO).map(([name, coords]) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: { name, isHQ: name === HQ_CITY }
  }));
  map.getSource("cities").setData({ type: "FeatureCollection", features });
}

function updateVehicles(map, state, routeData, selectedTripId, selectedVehicleId) {
  const features = state.vehicles.map(v => {
    const pos = getVehicleGeoPosition(v, state, routeData);
    if (!pos) return null;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: pos },
      properties: {
        vehicleId: v.id,
        name: vehicleDisplayName(v),
        status: v.status,
        isSelected: v.id === selectedVehicleId
      }
    };
  }).filter(Boolean);
  map.getSource("vehicles").setData({ type: "FeatureCollection", features });
}

function updateTours(map, state, routeData, selectedTripId) {
  const features = [];
  for (const trip of state.trips) {
    if (trip.status !== "in_progress") continue;
    const geo = buildTripRouteGeoJSON(trip, routeData);
    for (const f of geo.features) {
      f.properties.isSelected = trip.id === selectedTripId;
      // Verkehrslage für Fahr-Abschnitte berechnen
      const t = f.properties.legType;
      if (t === "drive" || t === "empty") {
        if (f.properties.segmentIndex !== undefined) {
          f.properties.trafficLevel = getSegmentTrafficLevel(state.gameTime, f.properties.fromCity, f.properties.toCity, f.properties.segmentIndex, f.properties.segmentCount);
        } else {
          f.properties.trafficLevel = getTrafficLevel(state.gameTime, f.properties.fromCity, f.properties.toCity);
        }
      } else {
        f.properties.trafficLevel = 0;
      }
      features.push(f);
    }
  }
  map.getSource("tours").setData({ type: "FeatureCollection", features });
}

function updatePlanRoute(map, planRoute, state) {
  if (!planRoute) {
    map.getSource("plan-route").setData({ type: "FeatureCollection", features: [] });
    return;
  }
  // Verkehrslage zu Plan-Route-Features hinzufügen
  for (const f of (planRoute.features || [])) {
    if (f.properties && f.properties.fromCity && f.properties.toCity) {
      if (f.properties.segmentIndex !== undefined) {
        f.properties.trafficLevel = getSegmentTrafficLevel(state.gameTime, f.properties.fromCity, f.properties.toCity, f.properties.segmentIndex, f.properties.segmentCount);
      } else {
        f.properties.trafficLevel = getTrafficLevel(state.gameTime, f.properties.fromCity, f.properties.toCity);
      }
    }
  }
  map.getSource("plan-route").setData(planRoute);
}