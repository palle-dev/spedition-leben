import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { loadRouteGeometries, buildPlanRouteGeoJSON } from "@/lib/geoData";
import DispatchMap from "@/components/dispatch/DispatchMap";
import DispatchWorkspace from "@/components/dispatch/DispatchWorkspace";
import { Truck, Home, Route as RouteIcon, TrafficCone, Sparkles } from "lucide-react";
import { useHeaderSlot } from "@/lib/headerSlot";
import DispatchToolbar from "@/components/dispatch/DispatchToolbar";
import RouteDetailOverlay from "@/components/dispatch/RouteDetailOverlay";
import AutoOptimizePanel from "@/components/dispatch/AutoOptimizePanel";
import MapLegend from "@/components/dispatch/MapLegend";

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
  const [showTraffic, setShowTraffic] = useState(true);
  const [overlayTripId, setOverlayTripId] = useState(null);
  const [optimizeOpen, setOptimizeOpen] = useState(false);

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
    setOverlayTripId(tripId);
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

  // Steuerleiste in den globalen Header injizieren (kein separater Toolbar-Row)
  const { setSlot } = useHeaderSlot();
  useEffect(() => {
    setSlot(
      <DispatchToolbar
        runningCount={runningCount}
        acceptedCount={acceptedCount}
        onPlan={handlePlanClick}
        onZuzuweisen={handleZuzuweisenClick}
        onTouren={() => { setActiveTab("touren"); setSelectedTripId(null); if (window.innerWidth < 1024) setMobileView("list"); }}
        onOptimize={() => setOptimizeOpen(true)}
        search={search}
        setSearch={setSearch}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        mobileView={mobileView}
        setMobileView={setMobileView}
      />
    );
    return () => setSlot(null);
  }, [runningCount, acceptedCount, search, searchOpen, mobileView, state, setSlot]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Karte + Arbeitsbereich */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Karte */}
        <div className={`min-h-0 min-w-0 relative ${mobileView === "list" ? "hidden" : "flex-1"} lg:block lg:flex-1`}>
          <DispatchMap
            routeData={routeData}
            selectedTripId={selectedTripId}
            selectedVehicleId={selectedVehicleId}
            showTraffic={showTraffic}
            planRoute={planRoute}
            onSelectTrip={handleSelectTrip}
            onSelectVehicle={handleSelectVehicle}
            focusAction={focusAction}
            onFocusDone={() => setFocusAction(null)}
          />
          {/* Karten-Aktionen */}
          {routeData && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <MapActionButton onClick={() => setShowTraffic(v => !v)} title="Verkehrslage" highlight={showTraffic}><TrafficCone className="w-4 h-4" /></MapActionButton>
              <MapActionButton onClick={() => setFocusAction({ type: "fleet" })} title="Flotte zeigen"><Truck className="w-4 h-4" /></MapActionButton>
              <MapActionButton onClick={() => setFocusAction({ type: "hq" })} title="Hauptsitz"><Home className="w-4 h-4" /></MapActionButton>
              {selectedTripId && (
                <MapActionButton onClick={() => setFocusAction({ type: "trip", tripId: selectedTripId })} title="Route zeigen" highlight><RouteIcon className="w-4 h-4" /></MapActionButton>
              )}
            </div>
          )}
          {routeData && <MapLegend showTraffic={showTraffic} />}
          {overlayTripId && state.trips.find(t => t.id === overlayTripId) && (
            <RouteDetailOverlay
              trip={state.trips.find(t => t.id === overlayTripId)}
              state={state}
              routeData={routeData}
              onClose={() => setOverlayTripId(null)}
              onShowOnMap={() => setFocusAction({ type: "trip", tripId: overlayTripId })}
              onShowInWorkspace={() => { setSelectedTripId(overlayTripId); setActiveTab("touren"); if (window.innerWidth < 1024) setMobileView("list"); }}
            />
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
      <AutoOptimizePanel open={optimizeOpen} onClose={() => setOptimizeOpen(false)} />
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