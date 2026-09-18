import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CITY_GEO } from "@/lib/geoData";
import { AlertTriangle } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
/** @type {[number, number]} */
const MAP_CENTER = [10.2, 51.0];
const MAP_ZOOM = 5.2;
/** @type {[[number, number], [number, number]]} */
const MAX_BOUNDS = [[4, 46], [16, 56]];
const COVERAGE_RADIUS_KM = 250;

// Haversine-Distanz in km
function haversineKm([lng1, lat1], [lng2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Kreis-Polygon als GeoJSON-Koordinaten
function circlePolygon([lng, lat], radiusKm, steps = 64) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = lat + (radiusKm / 6371) * (180 / Math.PI) * Math.cos(bearing);
    const lng2 = lng + (radiusKm / 6371) * (180 / Math.PI) * Math.sin(bearing) / Math.cos(lat * Math.PI / 180);
    coords.push([lng2, lat2]);
  }
  return coords;
}

// Planungskarte für Filial-Eröffnung.
// Zeigt verfügbare Städte, bestehende Filialen und bei Auswahl
// Entfernungs-Linien + Abdeckungs-Radius zu allen Standorten.
export default function BranchPlanningMap({
  availableCities,
  existingBranches,
  selectedCity,
  onSelectCity,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mapError, setMapError] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialisierung
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);

    let map;
    let mounted = true;
    try {
      map = new maplibregl.Map({
        container, style: MAP_STYLE, center: MAP_CENTER, zoom: MAP_ZOOM,
        maxBounds: MAX_BOUNDS, attributionControl: false, dragRotate: false, pitch: 0,
      });
    } catch (e) {
      setMapError(true);
      return;
    }

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const styleTimer = setTimeout(() => { if (mounted) return; setMapError(true); }, 8000);

    map.on("load", () => {
      if (!mounted) return;
      clearTimeout(styleTimer);
      setMapError(false);
      setupSourcesAndLayers(map);
      setMapLoaded(true);
    });
    map.on("error", (e) => {
      if (!mounted) return;
      if (e?.error?.message?.includes("style")) { clearTimeout(styleTimer); setMapError(true); }
    });

    mapRef.current = map;
    const ro = new ResizeObserver(() => { if (mounted) map?.resize(); });
    ro.observe(container);
    return () => {
      mounted = false; clearTimeout(styleTimer); ro.disconnect();
      markersRef.current.forEach(m => m.remove()); markersRef.current = [];
      map.remove(); mapRef.current = null; setMapLoaded(false);
    };
  }, []);

  // Marker + Daten-Update
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Marker entfernen
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Bestehende Filialen als Marker
    for (const b of existingBranches) {
      const coords = CITY_GEO[b.city];
      if (!coords) continue;
      const el = document.createElement("div");
      el.className = "branch-plan-marker-existing";
      el.innerHTML = `<div class="w-3.5 h-3.5 rounded-full bg-lime ring-2 ring-ink shadow-lg"></div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(coords).addTo(map);
      markersRef.current.push(marker);
    }

    // Verfügbare Städte als Marker (klickbar)
    for (const city of availableCities) {
      const coords = CITY_GEO[city];
      if (!coords) continue;
      const el = document.createElement("div");
      el.className = "branch-plan-marker-available";
      el.style.cursor = "pointer";
      const isSel = city === selectedCity;
      el.innerHTML = `<div class="w-3 h-3 rounded-full ${isSel ? "bg-amber-300 ring-2 ring-white" : "bg-white/40 ring-1 ring-white/20"} hover:bg-amber-300 transition-colors"></div>`;
      el.addEventListener("click", (ev) => { ev.stopPropagation(); onSelectCity?.(city); });
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(coords).addTo(map);
      markersRef.current.push(marker);
    }

    // Radius + Linien aktualisieren
    updatePlanningOverlay(map, selectedCity, existingBranches);
  }, [mapLoaded, availableCities, existingBranches, selectedCity, onSelectCity]);

  // Auf Auswahl zoomen
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedCity) return;
    const coords = CITY_GEO[selectedCity];
    if (!coords) return;
    mapRef.current.flyTo({ center: coords, zoom: 6, duration: 500 });
  }, [mapLoaded, selectedCity]);

  return (
    <div className="relative w-full h-full min-h-[360px] overflow-hidden glass border border-white/10 rounded-xl">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_100px_rgba(0,0,0,0.45)] z-[1]" />
      {/* Legende */}
      <div className="absolute top-3 left-3 z-[2] flex flex-col gap-1 px-2.5 py-2 rounded-lg bg-ink/70 backdrop-blur-sm border border-white/10 text-[10px]">
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime" /> Bestehende Filiale</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-300" /> Ausgewählt</div>
        <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white/40" /> Verfügbar</div>
        <div className="flex items-center gap-1.5 mt-0.5 pt-0.5 border-t border-white/10">
          <span className="w-3 h-0.5 bg-amber-300/60" /> Entfernung
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full border border-amber-300/40 bg-amber-300/10" /> {COVERAGE_RADIUS_KM} km Radius
        </div>
      </div>
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 bg-ink/80">
          <div className="glass border border-white/15 rounded-xl p-5 max-w-sm text-center">
            <AlertTriangle className="w-7 h-7 text-amber-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-foreground">Karte nicht verfügbar</div>
            <p className="text-xs text-muted-foreground mt-2">Die Stadtliste rechts bleibt nutzbar.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function setupSourcesAndLayers(map) {
  map.addSource("coverage", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

  // Abdeckungs-Radius (gefüllter Kreis)
  map.addLayer({
    id: "coverage-fill", type: "fill", source: "coverage",
    paint: { "fill-color": "#FCD34D", "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "coverage-stroke", type: "line", source: "coverage",
    paint: { "line-color": "#FCD34D", "line-width": 1.5, "line-opacity": 0.4, "line-dasharray": [3, 2] },
  });

  // Entfernungs-Linien
  map.addLayer({
    id: "dist-lines", type: "line", source: "lines",
    layout: { "line-cap": "round" },
    paint: { "line-color": "#FCD34D", "line-width": 2, "line-opacity": 0.5, "line-dasharray": [2, 2] },
  });

  // Distanz-Labels
  map.addLayer({
    id: "dist-labels", type: "symbol", source: "labels",
    layout: {
      "text-field": ["get", "dist"], "text-size": 11, "text-anchor": "center",
      "text-offset": [0, -0.6], "text-allow-overlap": true,
    },
    paint: { "text-color": "#FCD34D", "text-halo-color": "#000", "text-halo-width": 2.5 },
  });
}

function updatePlanningOverlay(map, selectedCity, existingBranches) {
  const coverageSrc = map.getSource("coverage");
  const linesSrc = map.getSource("lines");
  const labelsSrc = map.getSource("labels");

  if (!selectedCity) {
    coverageSrc?.setData({ type: "FeatureCollection", features: [] });
    linesSrc?.setData({ type: "FeatureCollection", features: [] });
    labelsSrc?.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const center = CITY_GEO[selectedCity];
  if (!center) return;

  // Coverage-Kreis
  const circleCoords = circlePolygon(center, COVERAGE_RADIUS_KM);
  coverageSrc?.setData({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circleCoords] },
      properties: {},
    }],
  });

  // Linien zu bestehenden Filialen + Labels
  const lineFeatures = [];
  const labelFeatures = [];
  for (const b of existingBranches) {
    const target = CITY_GEO[b.city];
    if (!target) continue;
    const dist = haversineKm(center, target);
    const midLng = (center[0] + target[0]) / 2;
    const midLat = (center[1] + target[1]) / 2;
    lineFeatures.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [center, target] },
      properties: { dist: Math.round(dist) },
    });
    labelFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [midLng, midLat] },
      properties: { dist: `${Math.round(dist)} km` },
    });
  }
  linesSrc?.setData({ type: "FeatureCollection", features: lineFeatures });
  labelsSrc?.setData({ type: "FeatureCollection", features: labelFeatures });
}