import React, { useState, useEffect, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { useHeaderSlot } from "@/lib/headerSlot";
import { loadRouteGeometries, CITY_GEO } from "@/lib/geoData";
import { dayOf, clockOf, formatGameTime } from "@/lib/gameData";
import NetworkMapView from "@/components/network/NetworkMapView";
import NetworkMapLegend from "@/components/network/NetworkMapLegend";
import NetworkLayerControl from "@/components/network/NetworkLayerControl";
import RelationsPanel from "@/components/network/RelationsPanel";
import ReturnLoadPanel from "@/components/network/ReturnLoadPanel";
import LocationAnalysisPanel from "@/components/network/LocationAnalysisPanel";
import LocationComparisonPanel from "@/components/network/LocationComparisonPanel";
import PageHint from "@/components/help/PageHint";
import { Network, TrendingUp, Package, MapPin, GitCompare, Layers, Home, Truck } from "lucide-react";

export default function NetworkMap() {
  const { state, backgroundAdvance, send, showToast } = useGame();
  const [routeData, setRouteData] = useState(null);
  const [activeTab, setActiveTab] = useState("relations");
  const [layers, setLayers] = useState(new Set(["branches", "customers", "orders", "tours", "vehicles"]));
  const [filters, setFilters] = useState({ branchId: null, vehicleId: null, customerId: null, orderStatus: null, segments: new Set() });
  const [selectedElement, setSelectedElement] = useState(null);
  const [focusAction, setFocusAction] = useState(null);
  const [mobileView, setMobileView] = useState("map");
  const [compareCities, setCompareCities] = useState([]);

  // URL-Parameter auswerten (für Links aus anderen Ansichten)
  const urlParams = new URLSearchParams(window.location.search);
  useEffect(() => {
    const focusVehicle = urlParams.get("vehicle");
    const focusTrip = urlParams.get("trip");
    const focusCity = urlParams.get("city");
    const focusCustomer = urlParams.get("customer");
    const tab = urlParams.get("tab");
    const layer = urlParams.get("layer");

    if (tab && ["relations", "returns", "location", "compare"].includes(tab)) {
      setActiveTab(tab);
    }
    if (focusVehicle) {
      setFilters(f => ({ ...f, vehicleId: focusVehicle }));
      setActiveTab("returns");
      setLayers(new Set(["vehicles", "orders", "tours"]));
    }
    if (focusTrip) {
      setActiveTab("returns");
      setLayers(new Set(["tours", "vehicles", "orders"]));
    }
    if (focusCity) {
      setActiveTab("location");
      setFocusAction({ type: "city", city: focusCity });
    }
    if (focusCustomer) {
      setFilters(f => ({ ...f, customerId: focusCustomer }));
    }
    if (layer) {
      setLayers(new Set([layer]));
    }
  }, []);

  // Routengeometrien laden
  useEffect(() => {
    loadRouteGeometries().then(setRouteData);
  }, []);

  const toggleLayer = (key) => {
    setLayers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleFilterChange = (changes) => {
    setFilters(prev => ({ ...prev, ...changes }));
  };

  const handleFocusCity = (city) => {
    setFocusAction({ type: "city", city });
    if (window.innerWidth < 1024) setMobileView("map");
  };

  const handleSelectElement = (el) => {
    setSelectedElement(el);
    if (el.type === "order") {
      // Zur Rückladungs-Ansicht wechseln
      const order = (state.orders || []).find(o => o.id === el.id);
      if (order) {
        setActiveTab("returns");
      }
    }
  };

  const handleOpenBranch = async (city) => {
    // Filialeröffnung über den bestehenden Befehl
    try {
      await send("openBranch", { city });
      showToast("Filiale in " + city + " eröffnet.", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  // Simulationszeit-Label für Hintergrundvorlauf-Hinweis
  const simTimeLabel = useMemo(() => {
    const t = state?.gameTime || 0;
    return `Tag ${dayOf(t)}, ${clockOf(t)} Uhr`;
  }, [state?.gameTime]);

  const tabs = [
    { key: "relations", label: "Relationen", icon: TrendingUp },
    { key: "returns", label: "Rückladungen", icon: Package },
    { key: "location", label: "Standort", icon: MapPin },
    { key: "compare", label: "Vergleich", icon: GitCompare },
  ];

  // Header-Slot
  const { setSlot } = useHeaderSlot();
  useEffect(() => {
    setSlot(
      <div className="flex items-center gap-2">
        <Network className="w-4 h-4 text-lime" />
        <span className="text-sm font-medium text-foreground">Netzkarte</span>
      </div>
    );
    return () => setSlot(null);
  }, [setSlot]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 sm:px-6 lg:px-12 pt-3 shrink-0"><PageHint pageKey="network" /></div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Karte */}
        <div className={`min-h-0 min-w-0 relative ${mobileView === "list" ? "hidden" : "flex-1"} lg:block lg:flex-1`}>
          <NetworkMapView
            routeData={routeData}
            layers={layers}
            filters={filters}
            selectedElement={selectedElement}
            onSelectElement={handleSelectElement}
            focusAction={focusAction}
            onFocusDone={() => setFocusAction(null)}
            simTimeLabel={simTimeLabel}
          />
          {/* Karten-Aktionen */}
          {routeData && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <MapActionButton onClick={() => setFocusAction({ type: "fleet" })} title="Übersicht"><Home className="w-4 h-4" /></MapActionButton>
            </div>
          )}
          {routeData && <NetworkMapLegend layers={layers} />}
        </div>

        {/* Seitenpanel */}
        <div className={`min-h-0 flex flex-col ${mobileView === "map" ? "hidden" : "flex-1"} lg:flex lg:flex-none lg:w-[440px] xl:w-[480px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-surface/90 backdrop-blur-2xl lg:shadow-[-12px_0_40px_-8px_rgba(0,0,0,0.6)] lg:relative lg:z-20`}>
          {/* Ebenen-Steuerung */}
          <div className="shrink-0 p-3 border-b border-white/10">
            <NetworkLayerControl
              layers={layers}
              onToggleLayer={toggleLayer}
              filters={filters}
              onFilterChange={handleFilterChange}
              state={state}
            />
          </div>

          {/* Tab-Auswahl */}
          <div className="shrink-0 flex border-b border-white/10">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition ${activeTab === t.key ? "text-lime border-b-2 border-lime bg-lime/5" : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"}`}
                >
                  <Icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab-Inhalt */}
          <div className="flex-1 min-h-0 p-3">
            {activeTab === "relations" && (
              <RelationsPanel focusAction={focusAction} onFocusCity={handleFocusCity} />
            )}
            {activeTab === "returns" && (
              <ReturnLoadPanel
                initialVehicleId={filters.vehicleId}
                initialTripId={urlParams.get("trip")}
                initialDestCity={urlParams.get("city")}
              />
            )}
            {activeTab === "location" && (
              <LocationAnalysisPanel
                initialCity={urlParams.get("city")}
                onCompareCity={(c) => { setCompareCities(prev => prev.length < 3 && !prev.includes(c) ? [...prev, c] : prev); setActiveTab("compare"); }}
              />
            )}
            {activeTab === "compare" && (
              <LocationComparisonPanel
                initialCities={compareCities}
                onOpenBranch={handleOpenBranch}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Ansicht-Umschaltung */}
      <div className="lg:hidden shrink-0 flex border-t border-white/10 bg-surface/90">
        <button onClick={() => setMobileView("map")} className={`flex-1 py-2 text-xs ${mobileView === "map" ? "text-lime" : "text-muted-foreground"}`}>Karte</button>
        <button onClick={() => setMobileView("list")} className={`flex-1 py-2 text-xs ${mobileView === "list" ? "text-lime" : "text-muted-foreground"}`}>Listen</button>
      </div>
    </div>
  );
}

function MapActionButton({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-10 h-10 rounded-xl grid place-items-center transition backdrop-blur-xl border shadow-lg shadow-black/40 bg-surface/80 text-foreground/80 border-white/15 hover:border-white/30 hover:text-foreground hover:bg-surface active:scale-95"
    >
      {children}
    </button>
  );
}