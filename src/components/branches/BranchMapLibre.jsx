import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CITY_GEO } from "@/lib/geoData";
import { AlertTriangle, Building2 } from "lucide-react";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
/** @type {[number, number]} */
const MAP_CENTER = [10.2, 51.0];
const MAP_ZOOM = 5.2;
/** @type {[[number, number], [number, number]]} */
const MAX_BOUNDS = [[4, 46], [16, 56]];

// Echte MapLibre-Karte für Filialstandorte.
// Zeigt aktive Filialen als Lime-Marker mit Popup-Details.
export default function BranchMapLibre({ branches, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const popupRef = useRef(null);
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
        container,
        style: MAP_STYLE,
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        maxBounds: MAX_BOUNDS,
        attributionControl: false,
        dragRotate: false,
        pitch: 0,
      });
    } catch (e) {
      console.error("Karteninitialisierung fehlgeschlagen:", e);
      setMapError(true);
      return;
    }

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    const styleTimer = setTimeout(() => { if (!mounted) return; setMapError(true); }, 8000);

    map.on("load", () => {
      if (!mounted) return;
      clearTimeout(styleTimer);
      setMapError(false);
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
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Marker bei Änderungen aktualisieren
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;

    // Alte Marker entfernen
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    for (const b of branches) {
      const coords = CITY_GEO[b.city];
      if (!coords) continue;

      // Custom HTML-Marker
      const el = document.createElement("div");
      el.className = "branch-map-marker";
      el.dataset.branchId = b.id;
      el.innerHTML = `
        <div class="relative flex flex-col items-center cursor-pointer transition-transform" style="transform: scale(1);">
          <div class="absolute -top-8 px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap ${b.id === selectedId ? "bg-lime text-ink" : "bg-surface-2/90 text-foreground/80 border border-white/15"}">
            ${b.name}
          </div>
          <div class="w-4 h-4 rounded-full ${b.isHeadquarters ? "bg-amber-300" : "bg-lime"} ring-2 ${b.id === selectedId ? "ring-white ring-4" : "ring-ink"}"></div>
          <div class="w-0.5 h-4 ${b.isHeadquarters ? "bg-amber-300" : "bg-lime"}"></div>
        </div>
      `;

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        onSelect?.(b.id);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat(coords)
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [mapLoaded, branches, selectedId, onSelect]);

  // Auswahl fokussieren
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedId) return;
    const branch = branches.find(b => b.id === selectedId);
    if (!branch) return;
    const coords = CITY_GEO[branch.city];
    if (!coords) return;
    mapRef.current.flyTo({ center: coords, zoom: 7, duration: 600 });
  }, [mapLoaded, selectedId, branches]);

  return (
    <div className="relative w-full h-full min-h-[400px] overflow-hidden glass border border-white/10 rounded-xl">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Vignette */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.5)] z-[1]" />
      {/* Header-Label */}
      <div className="absolute top-3 left-3 z-[2] flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ink/70 backdrop-blur-sm border border-white/10">
        <Building2 className="w-3 h-3 text-lime" />
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Filialstandorte</span>
      </div>
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-20 bg-ink/80">
          <div className="glass border border-white/15 rounded-xl p-5 max-w-sm text-center">
            <AlertTriangle className="w-7 h-7 text-amber-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-foreground">Karte nicht verfügbar</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Die Basiskarte konnte nicht geladen werden. Die Filialübersicht bleibt über die Karten rechts nutzbar.
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