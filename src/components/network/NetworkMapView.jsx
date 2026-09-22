import React, { useRef, useEffect, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useGame } from "@/lib/gameContext";
import { CITY_GEO, HQ_CITY } from "@/lib/geoData";
import { getNetworkMapElements } from "@/lib/networkData";
import { AlertTriangle } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
/** @type {[number, number]} */
const MAP_CENTER = [10.8, 50.0];
const MAP_ZOOM = 5.0;
/** @type {[[number, number], [number, number]]} */
const MAX_BOUNDS = [[4, 45], [18, 56]];

// Strategische Netzkarte für FERNWERK.
// Erweitert die vorhandene MapLibre-Infrastruktur um Ebenen für
// Filialen, Kunden, Aufträge, Touren, Fahrzeuge und Marktregionen.
// Verwendet unterscheidbare Symbole (Form + Farbe), nicht nur Farbe.
export default function NetworkMapView({
  routeData,
  layers,
  filters,
  selectedElement,
  onSelectElement,
  focusAction,
  onFocusDone,
  simTimeLabel,
}) {
  const { state, backgroundAdvance } = useGame();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { onSelectElement };
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Karten-Elemente berechnen (memoized)
  const elements = useMemo(
    () => getNetworkMapElements(state, routeData, { layers, ...filters }),
    [state, routeData, layers, filters]
  );

  // --- Karteninitialisierung ---
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
        attributionControl: false,
      });
    } catch (e) {
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

  // --- Daten-Update ---
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    updateCities(map);
    updateBranches(map, elements.branches, selectedElement);
    updateCustomers(map, elements.customers, selectedElement);
    updateOrders(map, elements.orders, selectedElement);
    updateTours(map, elements.tours, selectedElement, routeData);
    updateVehicles(map, elements.vehicles, selectedElement);
  }, [mapLoaded, elements, selectedElement, routeData]);

  // --- Fokus-Aktionen ---
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !focusAction) return;
    const map = mapRef.current;
    const pad = { top: 40, bottom: 40, left: 40, right: 420 };
    const mobilePad = { top: 40, bottom: 200, left: 40, right: 40 };
    const padding = window.innerWidth < 1024 ? mobilePad : pad;

    if (focusAction.type === "city") {
      const geo = CITY_GEO[focusAction.city];
      if (geo) map.flyTo({ center: geo, zoom: 8, duration: 600 });
    } else if (focusAction.type === "fleet") {
      map.flyTo({ center: MAP_CENTER, zoom: MAP_ZOOM, duration: 600 });
    } else if (focusAction.type === "element" && focusAction.coordinates) {
      map.flyTo({ center: focusAction.coordinates, zoom: 9, duration: 600 });
    }
    onFocusDone?.();
  }, [mapLoaded, focusAction, onFocusDone]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink ring-1 ring-white/[0.06]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_140px_rgba(0,0,0,0.55)] z-[1]" />

      {/* Simulationszeit-Hinweis während Hintergrundvorlauf */}
      {backgroundAdvance?.active && simTimeLabel && (
        <div className="absolute top-3 left-3 z-10 glass border border-amber-400/30 rounded-lg px-3 py-2 text-xs text-amber-200">
          Karte zeigt Stand vom {simTimeLabel}
        </div>
      )}

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 bg-ink/80">
          <div className="glass border border-white/15 rounded-xl p-5 max-w-sm text-center">
            <AlertTriangle className="w-7 h-7 text-amber-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-foreground">Karte nicht verfügbar</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Die Basiskarte konnte nicht geladen werden. Listen, Relationsdaten und Standortvergleiche bleiben nutzbar.
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
  for (const src of ["cities", "branches", "customers", "orders", "tours", "vehicles"]) {
    map.addSource(src, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
}

function setupLayers(map) {
  // Städte (Hintergrund)
  map.addLayer({
    id: "cities", type: "circle", source: "cities",
    paint: {
      "circle-radius": ["case", ["get", "isHQ"], 6, 3],
      "circle-color": ["case", ["get", "isHQ"], "#D5FB83", "#444"],
      "circle-stroke-width": ["case", ["get", "isHQ"], 2, 1],
      "circle-stroke-color": ["case", ["get", "isHQ"], "rgba(213,251,131,0.3)", "rgba(255,255,255,0.08)"]
    }
  });
  map.addLayer({
    id: "city-labels", type: "symbol", source: "cities",
    layout: { "text-field": ["get", "name"], "text-size": 9, "text-offset": [0, -1.2], "text-anchor": "bottom", "text-transform": "uppercase", "text-letter-spacing": 0.08 },
    paint: { "text-color": "#666", "text-halo-color": "#000", "text-halo-width": 2 }
  });

  // Tour-Linien (laufende Touren)
  map.addLayer({
    id: "tour-lines", type: "line", source: "tours",
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["match", ["get", "legType"], "empty", "#FF9E7A", "#D5FB83"],
      "line-width": ["case", ["get", "isSelected"], 4, 2.5],
      "line-opacity": ["case", ["get", "isSelected"], 0.9, 0.4],
      "line-dasharray": ["case", ["==", ["get", "legType"], "empty"], [3, 2], [1, 0]]
    }
  });

  // Auftrags-Linien (geplante Verbindungen)
  map.addLayer({
    id: "order-lines", type: "line", source: "orders",
    filter: ["==", ["get", "featureType"], "line"],
    layout: { "line-cap": "round" },
    paint: {
      "line-color": ["match", ["get", "orderStatus"], "offered", "#60A5FA", "angenommen", "#FCD34D", "#888"],
      "line-width": 2,
      "line-opacity": 0.5,
      "line-dasharray": [2, 3]
    }
  });

  // Filialen — Quadrat mit Rahmen
  map.addLayer({
    id: "branches", type: "symbol", source: "branches",
    layout: {
      "icon-image": "branch-square",
      "icon-size": 1,
      "icon-allow-overlap": true,
    },
  });
  // Da wir keine benutzerdefinierten Icons haben, nutzen wir Circle + Symbol
  map.addLayer({
    id: "branch-markers", type: "circle", source: "branches",
    paint: {
      "circle-radius": ["case", ["get", "isSelected"], 12, 9],
      "circle-color": "#D5FB83",
      "circle-stroke-width": ["case", ["get", "isSelected"], 3, 2],
      "circle-stroke-color": ["case", ["get", "isSelected"], "#fff", "#0b1011"]
    }
  });
  map.addLayer({
    id: "branch-symbols", type: "symbol", source: "branches",
    layout: {
      "text-field": "B",
      "text-size": 10,
      "text-anchor": "center",
      "text-offset": [0, 0.05],
    },
    paint: { "text-color": "#0b1011", "text-halo-color": "#0b1011", "text-halo-width": 0 }
  });
  map.addLayer({
    id: "branch-labels", type: "symbol", source: "branches",
    layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, -1.8], "text-anchor": "bottom" },
    paint: { "text-color": "#D5FB83", "text-halo-color": "#000", "text-halo-width": 2.5 }
  });

  // Kunden — Dreieck (Symbol mit "K")
  map.addLayer({
    id: "customer-markers", type: "circle", source: "customers",
    paint: {
      "circle-radius": ["case", ["get", "isSelected"], 10, 7],
      "circle-color": ["case", ["get", "isStammkunde"], "#A78BFA", "#7DD3FC"],
      "circle-stroke-width": ["case", ["get", "isSelected"], 3, 1.5],
      "circle-stroke-color": ["case", ["get", "isSelected"], "#fff", "#0b1011"]
    }
  });
  map.addLayer({
    id: "customer-symbols", type: "symbol", source: "customers",
    layout: { "text-field": "K", "text-size": 8, "text-anchor": "center", "text-offset": [0, 0.05] },
    paint: { "text-color": "#0b1011" }
  });
  map.addLayer({
    id: "customer-labels", type: "symbol", source: "customers",
    filter: ["==", ["get", "isSelected"], true],
    layout: { "text-field": ["get", "name"], "text-size": 9, "text-offset": [0, -1.5], "text-anchor": "bottom" },
    paint: { "text-color": "#7DD3FC", "text-halo-color": "#000", "text-halo-width": 2 }
  });

  // Aufträge — Rhombus/Diamant (Symbol mit Pfeil)
  map.addLayer({
    id: "order-markers", type: "circle", source: "orders",
    filter: ["==", ["get", "featureType"], "marker"],
    paint: {
      "circle-radius": ["case", ["get", "isSelected"], 9, 6],
      "circle-color": ["match", ["get", "orderStatus"], "offered", "#60A5FA", "angenommen", "#FCD34D", "#888"],
      "circle-stroke-width": ["case", ["get", "isSelected"], 3, 1.5],
      "circle-stroke-color": ["case", ["get", "isSelected"], "#fff", "#0b1011"]
    }
  });
  map.addLayer({
    id: "order-symbols", type: "symbol", source: "orders",
    filter: ["==", ["get", "featureType"], "marker"],
    layout: {
      "text-field": ["match", ["get", "orderStatus"], "offered", "A", "angenommen", "!", "?"],
      "text-size": 8,
      "text-anchor": "center",
    },
    paint: { "text-color": "#0b1011" }
  });

  // Fahrzeuge — Glow + Marker
  map.addLayer({
    id: "vehicles-glow", type: "circle", source: "vehicles",
    filter: ["==", ["get", "isSelected"], true],
    paint: { "circle-radius": 16, "circle-color": "#FCD34D", "circle-opacity": 0.18, "circle-blur": 1.5 }
  });
  map.addLayer({
    id: "vehicle-markers", type: "circle", source: "vehicles",
    paint: {
      "circle-radius": ["case", ["get", "isSelected"], 10, 7],
      "circle-color": ["match", ["get", "status"], "free", "#D5FB83", "on_trip", "#FCD34D", "maintenance", "#7DD3FC", "resting", "#94A3B8", "#888"],
      "circle-stroke-width": ["case", ["get", "isSelected"], 3, 2],
      "circle-stroke-color": ["case", ["get", "isSelected"], "#fff", "rgba(0,0,0,0.6)"]
    }
  });
  map.addLayer({
    id: "vehicle-symbols", type: "symbol", source: "vehicles",
    layout: { "text-field": "F", "text-size": 8, "text-anchor": "center", "text-offset": [0, 0.05] },
    paint: { "text-color": "#0b1011" }
  });
  map.addLayer({
    id: "vehicle-labels", type: "symbol", source: "vehicles",
    filter: ["==", ["get", "isSelected"], true],
    layout: { "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, -1.7], "text-anchor": "bottom" },
    paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 2.5 }
  });
}

function setupClickHandlers(map, cbRef) {
  const cursor = (enter) => () => { map.getCanvas().style.cursor = enter ? "pointer" : ""; };
  for (const layer of ["branch-markers", "customer-markers", "order-markers", "vehicle-markers", "tour-lines"]) {
    map.on("mouseenter", layer, cursor(true));
    map.on("mouseleave", layer, cursor(false));
  }
  map.on("click", "branch-markers", (e) => {
    if (e.features.length) cbRef.current.onSelectElement?.({ type: "branch", id: e.features[0].properties.id });
  });
  map.on("click", "customer-markers", (e) => {
    if (e.features.length) cbRef.current.onSelectElement?.({ type: "customer", id: e.features[0].properties.id, city: e.features[0].properties.city });
  });
  map.on("click", "order-markers", (e) => {
    if (e.features.length) cbRef.current.onSelectElement?.({ type: "order", id: e.features[0].properties.id });
  });
  map.on("click", "vehicle-markers", (e) => {
    if (e.features.length) cbRef.current.onSelectElement?.({ type: "vehicle", id: e.features[0].properties.id });
  });
  map.on("click", "tour-lines", (e) => {
    if (e.features.length) cbRef.current.onSelectElement?.({ type: "tour", id: e.features[0].properties.tripId });
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

function updateBranches(map, branches, selected) {
  const features = branches.map(b => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: b.coordinates },
    properties: {
      id: b.id, name: b.name, city: b.city, isHQ: b.isHQ,
      isSelected: selected?.type === "branch" && selected?.id === b.id,
    }
  }));
  map.getSource("branches").setData({ type: "FeatureCollection", features });
}

function updateCustomers(map, customers, selected) {
  const features = customers.map(c => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: c.coordinates },
    properties: {
      id: c.id, name: c.name, city: c.city, isStammkunde: c.isStammkunde,
      isSelected: selected?.type === "customer" && selected?.id === c.id && selected?.city === c.city,
    }
  }));
  map.getSource("customers").setData({ type: "FeatureCollection", features });
}

function updateOrders(map, orders, selected) {
  const features = [];
  for (const o of orders) {
    // Linie von fromCity nach toCity
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [o.fromCoords, o.toCoords] },
      properties: { featureType: "line", id: o.id, orderStatus: o.status, isSelected: selected?.type === "order" && selected?.id === o.id }
    });
    // Marker am Zielort
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: o.toCoords },
      properties: { featureType: "marker", id: o.id, orderStatus: o.status, isSelected: selected?.type === "order" && selected?.id === o.id }
    });
  }
  map.getSource("orders").setData({ type: "FeatureCollection", features });
}

function updateTours(map, tours, selected, routeData) {
  const features = [];
  for (const tour of tours) {
    for (const f of (tour.geoJSON?.features || [])) {
      f.properties.tripId = tour.id;
      f.properties.legType = f.properties.legType || "drive";
      f.properties.isSelected = selected?.type === "tour" && selected?.id === tour.id;
      features.push(f);
    }
  }
  map.getSource("tours").setData({ type: "FeatureCollection", features });
}

function updateVehicles(map, vehicles, selected) {
  const features = vehicles.map(v => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: v.coordinates },
    properties: {
      id: v.id, name: v.name, status: v.status,
      isSelected: selected?.type === "vehicle" && selected?.id === v.id,
    }
  }));
  map.getSource("vehicles").setData({ type: "FeatureCollection", features });
}