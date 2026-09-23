import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { loadRouteGeometries, buildPlanRouteGeoJSON } from "@/lib/geoData";
import MapLegend from "@/components/dispatch/MapLegend";
import DispatchMap from "@/components/dispatch/DispatchMap";
import DispatchWorkspace from "@/components/dispatch/DispatchWorkspace";
import PlanningBoard from "@/components/planning/PlanningBoard";
import { Truck, Home, Route as RouteIcon, TrafficCone, Network } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useHeaderSlot } from "@/lib/headerSlot";
import DispatchToolbar from "@/components/dispatch/DispatchToolbar";
import RouteDetailOverlay from "@/components/dispatch/RouteDetailOverlay";
import AutoOptimizePanel from "@/components/dispatch/AutoOptimizePanel";
import PartnerOverview from "@/components/partners/PartnerOverview";

export default function Dispatch() {
  const { state } = useGame();
  const location = useLocation();
  const [routeData, setRouteData] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    const activeTripOrderIds = new Set();
    for (const t of state.trips) { if (t.status === "in_progress" && t.orderId) activeTripOrderIds.add(t.orderId); }
    return state.orders.some(o => o.status === "angenommen" && !activeTripOrderIds.has(o.id)) ? "auftraege" : "touren";
  });
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [planningOrderId, setPlanningOrderId] = useState(null);
  const [tourOrderId, setTourOrderId] = useState(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [focusAction, setFocusAction] = useState(null);
  const [planRoute, setPlanRoute] = useState(null);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState("map");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [overlayTripId, setOverlayTripId] = useState(null);
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [showPlanning, setShowPlanning] = useState(false);
  const [showPartners, setShowPartners] = useState(false);

  // Routengeometrien laden (einmalig)
  useEffect(() => {
    loadRouteGeometries().then(setRouteData);
  }, []);

  // Trip aus URL-Parameter auswählen (von Büro "Zur Disposition")
  const urlParams = new URLSearchParams(location.search);
  const tripParam = urlParams.get("trip");
  const orderParam = urlParams.get("order");
  const actionParam = urlParams.get("action");
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
    setTourOrderId(null);
    if (actionParam === "return" && ord && ["offered", "angenommen"].includes(ord.status)) {
      setPlanningOrderId(null);
      setTourOrderId(orderParam);
      setActiveTab("auftraege");
      setSelectedTripId(null);
    } else if (ord && ord.status === "angenommen") {
      setPlanningOrderId(orderParam);
      setActiveTab("auftraege");
      setSelectedTripId(null);
    } else {
      setPlanningOrderId(null);
      setActiveTab("auftraege");
    }
    if (window.innerWidth < 1024) setMobileView("list");
  }, [orderParam, actionParam]);

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
    setTourOrderId(null);
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
    setTourOrderId(null);
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
        onZuzuweisen={handleZuzuweisenClick}
        onTouren={() => { setActiveTab("touren"); setSelectedTripId(null); if (window.innerWidth < 1024) setMobileView("list"); }}
        search={search}
        setSearch={setSearch}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        mobileView={mobileView}
        setMobileView={setMobileView}
        showPlanning={showPlanning}
        onTogglePlanning={() => { setShowPlanning(s => !s); setShowPartners(false); }}
        showPartners={showPartners}
        onTogglePartners={() => { setShowPartners(s => !s); setShowPlanning(false); }}
        partnerTransportCount={((state?.partners?.transports || []).filter(t => t.status === "booked" || t.status === "in_progress").length)}
      />
    );
    return () => setSlot(null);
  }, [runningCount, acceptedCount, search, searchOpen, mobileView, state, setSlot, showPlanning, showPartners]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {showPlanning ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-12 pt-3 pb-6">
          <PlanningBoard onPlanOrder={(orderId) => { setShowPlanning(false); setPlanningOrderId(orderId); setActiveTab("auftraege"); }} />
        </div>
      ) : showPartners ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-12 pt-3 pb-6">
          <PartnerOverview onClose={() => setShowPartners(false)} />
        </div>
      ) : (
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
          <MapLegend showTraffic={showTraffic} gameTime={state.gameTime} />
          {/* Karten-Aktionen */}
          {routeData && (
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <MapActionButton onClick={() => setShowTraffic(v => !v)} title={showTraffic ? "Verkehrslage ausblenden" : "Verkehrslage einblenden"} pressed={showTraffic} highlight={showTraffic}><TrafficCone className="w-4 h-4" /></MapActionButton>
              <MapActionButton onClick={() => setFocusAction({ type: "fleet" })} title="Flotte zeigen"><Truck className="w-4 h-4" /></MapActionButton>
              <MapActionButton onClick={() => setFocusAction({ type: "hq" })} title="Hauptsitz"><Home className="w-4 h-4" /></MapActionButton>
              <Link to="/netzwerk" title="Strategische Netzkarte" className="w-10 h-10 rounded-xl grid place-items-center transition backdrop-blur-xl border shadow-lg shadow-black/40 active:scale-95 bg-surface/80 text-foreground/80 border-white/15 hover:border-lime/30 hover:text-foreground hover:bg-surface">
                <Network className="w-4 h-4" />
              </Link>
              {selectedTripId && (
                <MapActionButton onClick={() => setFocusAction({ type: "trip", tripId: selectedTripId })} title="Route zeigen" highlight><RouteIcon className="w-4 h-4" /></MapActionButton>
              )}
            </div>
          )}
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

        {/* Arbeitsbereich — eigenes Panel mit Höhenwirkung */}
        <div className={`min-h-0 flex flex-col ${mobileView === "map" ? "hidden" : "flex-1"} lg:flex lg:flex-none lg:w-[460px] xl:w-[500px] 2xl:w-[560px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-surface/90 backdrop-blur-2xl lg:shadow-[-12px_0_40px_-8px_rgba(0,0,0,0.6)] lg:relative lg:z-20`}>
          <DispatchWorkspace
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedTripId={selectedTripId}
            onSelectTrip={handleSelectTrip}
            planningOrderId={planningOrderId}
            tourOrderId={tourOrderId}
            onTourOrderChange={setTourOrderId}
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
      )}
      <AutoOptimizePanel open={optimizeOpen} onClose={() => setOptimizeOpen(false)} />
    </div>
  );
}

function MapActionButton({ onClick, title, children, highlight = undefined, pressed = undefined }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      className={`w-10 h-10 rounded-xl grid place-items-center transition backdrop-blur-xl border shadow-lg shadow-black/40 active:scale-95 ${
        highlight ? "bg-lime text-ink border-lime shadow-lime/20" : "bg-surface/80 text-foreground/80 border-white/15 hover:border-white/30 hover:text-foreground hover:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}