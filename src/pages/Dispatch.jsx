import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { loadRouteGeometries, buildPlanRouteGeoJSON } from "@/lib/geoData";
import DispatchMap from "@/components/dispatch/DispatchMap";
import DispatchWorkspace from "@/components/dispatch/DispatchWorkspace";
import MarketPriorityControl from "@/components/dispatch/MarketPriorityControl";
import { Navigation, Truck, Home, Route as RouteIcon, Map, List, Search, X, Plus, Package } from "lucide-react";

export default function Dispatch() {
  const { state } = useGame();
  const [routeData, setRouteData] = useState(null);
  const [activeTab, setActiveTab] = useState(() => state.orders.some(o => o.status === "angenommen" && !state.trips.some(t => t.orderId === o.id && t.status === "in_progress")) ? "auftraege" : "touren");
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [planningOrderId, setPlanningOrderId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [focusAction, setFocusAction] = useState(null);
  const [planRoute, setPlanRoute] = useState(null);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState("map");
  const [searchOpen, setSearchOpen] = useState(false);

  // Routengeometrien laden (einmalig)
  useEffect(() => {
    loadRouteGeometries().then(setRouteData);
  }, []);

  // Trip aus URL-Parameter auswählen (von Büro "Zur Disposition")
  const urlParams = new URLSearchParams(window.location.search);
  const tripParam = urlParams.get("trip");
  const orderParam = urlParams.get("order");
  useEffect(() => {
    if (tripParam) {
      setSelectedTripId(tripParam);
      setActiveTab("touren");
      setFocusAction({ type: "trip", tripId: tripParam });
    }
  }, [tripParam]);

  useEffect(() => {
    if (!orderParam) return;
    const ord = state.orders.find(o => o.id === orderParam);
    if (ord && ord.status === "angenommen") {
      setPlanningOrderId(orderParam);
      setActiveTab("auftraege");
      setSelectedTripId(null);
    } else {
      setPlanningOrderId(null);
      setActiveTab("auftraege");
    }
    if (window.innerWidth < 1024) setMobileView("list");
  }, [orderParam]);

  const runningCount = state.trips.filter(t => t.status === "in_progress").length;
  const acceptedOrders = state.orders.filter(o => o.status === "angenommen" && !state.trips.some(t => t.orderId === o.id && t.status === "in_progress"));
  const acceptedCount = acceptedOrders.length;

  function handleSelectTrip(tripId) {
    setSelectedTripId(tripId);
    setSelectedVehicleId(null);
    if (tripId) {
      setActiveTab("touren");
      if (window.innerWidth < 1024) setMobileView("list");
    }
  }

  function handleSelectVehicle(vehicleId) {
    setSelectedVehicleId(vehicleId);
    if (vehicleId) {
      const v = state.vehicles.find(x => x.id === vehicleId);
      if (v?.tripId) {
        setSelectedTripId(v.tripId);
        setActiveTab("touren");
      } else {
        setActiveTab("flotte");
      }
      if (window.innerWidth < 1024) setMobileView("list");
    }
  }

  function handlePlanOrder(orderId) {
    setPlanningOrderId(orderId);
    if (orderId) {
      setSelectedTripId(null);
      setActiveTab("auftraege");
      if (window.innerWidth < 1024) setMobileView("list");
    }
    setPlanRoute(null);
  }

  function handlePlanChange(planInfo) {
    if (!planInfo?.plan || !routeData) { setPlanRoute(null); return; }
    const order = state.orders.find(o => o.id === planningOrderId);
    if (!order) { setPlanRoute(null); return; }
    const hasEmpty = planInfo.plan.emptyKm > 0;
    setPlanRoute(buildPlanRouteGeoJSON(
      order.fromCity, order.toCity, hasEmpty,
      hasEmpty ? planInfo.vehicle?.locationCity : null, order.fromCity, routeData
    ));
  }

  function handlePlanClick() {
    if (acceptedOrders.length === 1) {
      setPlanningOrderId(acceptedOrders[0].id);
    } else {
      setPlanningOrderId(null);
    }
    setActiveTab("auftraege");
    setSelectedTripId(null);
    if (window.innerWidth < 1024) setMobileView("list");
  }

  function handleZuzuweisenClick() {
    setPlanningOrderId(null);
    setActiveTab("auftraege");
    setSelectedTripId(null);
    if (window.innerWidth < 1024) setMobileView("list");
  }

  function handleStarted(result) {
    setPlanningOrderId(null);
    setPlanRoute(null);
    if (result?.tripId) {
      setSelectedTripId(result.tripId);
      setActiveTab("touren");
      setFocusAction({ type: "trip", tripId: result.tripId });
    }
  }

  const isMapVisible = mobileView === "map";

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Werkzeugleiste — klar gruppiert: Aktionen links, Werkzeuge rechts */}
      <div className="flex items-center gap-2 px-3 lg:px-4 py-2 border-b border-white/10 shrink-0 min-h-[48px]">
        {/* Gruppe 1: Seitenkennung + Hauptaktion */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Navigation className="w-4 h-4 text-lime" />
          <span className="text-sm font-medium hidden sm:inline">Disposition</span>
        </div>
        <div className="w-px h-5 bg-white/10 shrink-0 hidden sm:block" />
        <button
          onClick={handlePlanClick}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime text-ink text-xs font-semibold hover:brightness-110 transition active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Auftrag planen
        </button>

        {/* Gruppe 2: Status-Zähler (kompakte Pillen) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { setActiveTab("touren"); setSelectedTripId(null); if (window.innerWidth < 1024) setMobileView("list"); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-2/50 border border-white/10 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/20 transition"
            title={`${runningCount} Fahrten unterwegs`}
          >
            <Truck className="w-3.5 h-3.5" /> {runningCount}
          </button>
          <button
            onClick={handleZuzuweisenClick}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition ${
              acceptedCount > 0 ? "bg-lime/10 border-lime/30 text-lime hover:border-lime/50" : "bg-surface-2/50 border-white/10 text-muted-foreground hover:border-white/20"
            }`}
            title={`${acceptedCount} Aufträge zu disponieren`}
          >
            <Package className="w-3.5 h-3.5" /> {acceptedCount}
          </button>
        </div>

        {/* Gruppe 3: Werkzeuge (rechts) */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {searchOpen ? (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                onBlur={() => !search && setSearchOpen(false)}
                placeholder="Suchen…"
                className="w-36 sm:w-48 pl-8 pr-7 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : (
            <button onClick={() => setSearchOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2/50 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition">
              <Search className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Suchen</span>
            </button>
          )}
          <div className="w-px h-5 bg-white/10 shrink-0 hidden md:block" />
          <MarketPriorityControl />
          <div className="lg:hidden flex gap-1 bg-ink/60 border border-white/10 rounded-full p-0.5 shrink-0">
            <button onClick={() => setMobileView("map")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[36px] ${isMapVisible ? "bg-lime text-ink" : "text-muted-foreground"}`}>
              <Map className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setMobileView("list")} className={`px-3 py-1.5 rounded-full text-xs font-medium transition min-h-[36px] ${!isMapVisible ? "bg-lime text-ink" : "text-muted-foreground"}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Karte + Arbeitsbereich */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Karte */}
        <div className={`min-h-0 min-w-0 relative ${mobileView === "list" ? "hidden" : "flex-1"} lg:block lg:flex-1`}>
          <DispatchMap
            routeData={routeData}
            selectedTripId={selectedTripId}
            selectedVehicleId={selectedVehicleId}
            planRoute={planRoute}
            onSelectTrip={handleSelectTrip}
            onSelectVehicle={handleSelectVehicle}
            focusAction={focusAction}
            onFocusDone={() => setFocusAction(null)}
          />
          {/* Karten-Aktionen */}
          {routeData && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <MapActionButton onClick={() => setFocusAction({ type: "fleet" })} title="Flotte zeigen"><Truck className="w-4 h-4" /></MapActionButton>
              <MapActionButton onClick={() => setFocusAction({ type: "hq" })} title="Hauptsitz"><Home className="w-4 h-4" /></MapActionButton>
              {selectedTripId && (
                <MapActionButton onClick={() => setFocusAction({ type: "trip", tripId: selectedTripId })} title="Route zeigen" highlight><RouteIcon className="w-4 h-4" /></MapActionButton>
              )}
            </div>
          )}
        </div>

        {/* Arbeitsbereich */}
        <div className={`min-h-0 flex flex-col ${mobileView === "map" ? "hidden" : "flex-1"} lg:flex lg:flex-none lg:w-[460px] xl:w-[500px] 2xl:w-[560px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-ink/95 backdrop-blur-xl`}>
          <DispatchWorkspace
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedTripId={selectedTripId}
            onSelectTrip={handleSelectTrip}
            planningOrderId={planningOrderId}
            onPlanOrder={handlePlanOrder}
            onPlanChange={handlePlanChange}
            onStarted={handleStarted}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={handleSelectVehicle}
            onShowOnMap={(tripId) => { setFocusAction({ type: "trip", tripId }); if (window.innerWidth < 1024) setMobileView("map"); }}
            onShowVehicle={(vehicleId) => { setFocusAction({ type: "vehicle", vehicleId }); if (window.innerWidth < 1024) setMobileView("map"); }}
            onPlanRoute={(geojson) => setPlanRoute(geojson)}
            search={search}
            onResetSearch={() => setSearch("")}
            routeData={routeData}
          />
        </div>
      </div>
    </div>
  );
}

function MapActionButton({ onClick, title, children, highlight }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-10 h-10 rounded-lg grid place-items-center transition backdrop-blur-md border active:scale-95 ${
        highlight ? "bg-lime text-ink border-lime" : "bg-ink/70 text-foreground/80 border-white/15 hover:border-white/30 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}