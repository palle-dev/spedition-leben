import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro, CITIES, getDistance, driveMinutes, fuelEur, tollEur, MAX_DUTY_MIN } from "@/lib/gameData";
import DispatchTourList from "./DispatchTourList";
import DispatchTourDetails from "./DispatchTourDetails";
import DispatchPlanner from "./DispatchPlanner";
import TourPlanner from "./TourPlanner";
import OrderMatchList from "./OrderMatchList";
import DispatchActiveTours from "./DispatchActiveTours";
import DriverWorkBudget from "./DriverWorkBudget";
import DispatcherPanel from "./DispatcherPanel";
import DispatchLiveLog from "./DispatchLiveLog";
import { Truck, Users, Package, ArrowRight, Play, AlertTriangle, Route, X, Headset, Activity } from "lucide-react";

// Vier gleichrangige Bereiche: Aufträge, Touren, Flotte, Disponenten.
// Tour-Planung und Assistent sind in den fachlichen Kontext integriert.
export default function DispatchWorkspace({
  activeTab, setActiveTab,
  selectedTripId, onSelectTrip,
  planningOrderId, onPlanOrder, onPlanChange, onStarted,
  selectedVehicleId, onSelectVehicle,
  onShowOnMap, onShowVehicle,
  onPlanRoute,
  search, onResetSearch, routeData
}) {
  const { state, send, showToast } = useGame();
  const [emptyMode, setEmptyMode] = useState(false);
  const [emptyFrom, setEmptyFrom] = useState("Hamburg");
  const [emptyTo, setEmptyTo] = useState("Bremen");
  const [emptyVehicleId, setEmptyVehicleId] = useState("");
  const [emptyDriverId, setEmptyDriverId] = useState("");
  const [startingEmpty, setStartingEmpty] = useState(false);
  const [tourOrderId, setTourOrderId] = useState(null);

  const running = state.trips.filter(t => t.status === "in_progress");
  const allAccepted = state.orders.filter(o => o.status === "angenommen");
  const accepted = allAccepted.filter(o => !state.trips.some(t => t.orderId === o.id && t.status === "in_progress"));
  const activeTours = (state.tours || []).filter(t => t.status === "active");
  const dispatchers = (state.employees || []).filter(e => (e.role === "dispatcher" || e.role === "dispatcher_senior") && e.employmentStatus === "employed");
  const pendingSuggestions = dispatchers.reduce((sum, emp) => sum + (emp.suggestions || []).filter(s => s.status === "pending").length, 0);
  const searchLower = (search || "").toLowerCase();
  const recentEvents = (state.events || []).slice(-30).reverse();

  const filteredTrips = running.filter(t => {
    if (!searchLower) return true;
    const v = state.vehicles.find(x => x.id === t.vehicleId);
    const d = state.drivers.find(x => x.id === t.driverId);
    const o = state.orders.find(x => x.id === t.orderId);
    return (v && vehicleDisplayName(v).toLowerCase().includes(searchLower))
      || (d && driverDisplayName(d).toLowerCase().includes(searchLower))
      || (o && o.customer.toLowerCase().includes(searchLower))
      || (o && o.fromCity.toLowerCase().includes(searchLower))
      || (o && o.toCity.toLowerCase().includes(searchLower));
  });

  const filteredOrders = accepted.filter(o => {
    if (!searchLower) return true;
    return o.customer.toLowerCase().includes(searchLower)
      || o.fromCity.toLowerCase().includes(searchLower)
      || o.toCity.toLowerCase().includes(searchLower);
  });

  const filteredVehicles = state.vehicles.filter(v => {
    if (!searchLower) return true;
    return vehicleDisplayName(v).toLowerCase().includes(searchLower) || v.locationCity.toLowerCase().includes(searchLower);
  });

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar – vier Bereiche */}
      <div className="flex border-b border-white/10 shrink-0 px-2 pt-1.5 overflow-x-auto scrollbar-none bg-surface-2/40">
        <TabButton active={activeTab === "auftraege"} onClick={() => setActiveTab("auftraege")} label="Aufträge" count={accepted.length} icon={Package} />
        <TabButton active={activeTab === "touren"} onClick={() => setActiveTab("touren")} label="Touren" count={running.length} icon={Truck} />
        <TabButton active={activeTab === "flotte"} onClick={() => setActiveTab("flotte")} label="Flotte" count={state.vehicles.length} icon={Users} />
        <TabButton active={activeTab === "disponenten"} onClick={() => setActiveTab("disponenten")} label="Disponenten" count={pendingSuggestions} icon={Headset} />
        <TabButton active={activeTab === "verlauf"} onClick={() => setActiveTab("verlauf")} label="Verlauf" icon={Activity} />
      </div>

      {/* Tab content – scrollbar */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {/* ---------- Aufträge ---------- */}
        {activeTab === "auftraege" && (
          planningOrderId ? (
            <DispatchPlanner
              orderId={planningOrderId}
              onBack={() => onPlanOrder(null)}
              onStarted={(r) => { onPlanOrder(null); onStarted?.(r); }}
              onPlanChange={onPlanChange}
              preselectedVehicleId={selectedVehicleId}
            />
          ) : tourOrderId ? (
            <TourPlanner
              primaryOrderId={tourOrderId}
              routeData={routeData}
              onBack={() => { setTourOrderId(null); onPlanRoute?.(null); }}
              onConfirmed={(r) => { setTourOrderId(null); onPlanRoute?.(null); onStarted?.(r); }}
              onPlanRoute={onPlanRoute}
            />
          ) : emptyMode ? (
            <EmptyTripPlanner
              state={state} onBack={() => setEmptyMode(false)}
              from={emptyFrom} setFrom={setEmptyFrom} to={emptyTo} setTo={setEmptyTo}
              vehicleId={emptyVehicleId} setVehicleId={setEmptyVehicleId}
              driverId={emptyDriverId} setDriverId={setEmptyDriverId}
              starting={startingEmpty} setStarting={setStartingEmpty}
              send={send} showToast={showToast}
            />
          ) : (
            <div className="space-y-3">
              {accepted.length === 0 ? (
                <div className="glass border border-white/10 rounded-xl p-5 text-center">
                  <Package className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                  {allAccepted.length === 0 ? (
                    <>
                      <p className="text-sm text-muted-foreground">Noch kein Auftrag zur Planung.</p>
                      <Link to="/auftraege" className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition">
                        <Package className="w-3.5 h-3.5" /> Auftragsmarkt öffnen
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">Alle angenommenen Aufträge sind verplant.</p>
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <button onClick={() => setActiveTab("touren")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-foreground text-xs font-medium hover:border-white/20 transition">
                          <Truck className="w-3.5 h-3.5" /> Touren ansehen
                        </button>
                        <Link to="/auftraege" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition">
                          <Package className="w-3.5 h-3.5" /> Auftragsmarkt
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <OrderMatchList
                  orders={accepted}
                  onPlanOrder={onPlanOrder}
                  onTourPlan={(oid) => { setTourOrderId(oid); onPlanRoute?.(null); }}
                  searchLower={searchLower}
                />
              )}
              <button
                onClick={() => setEmptyMode(true)}
                className="w-full rounded-xl p-3 border border-dashed border-white/20 hover:border-coral/40 hover:bg-coral/5 text-xs text-muted-foreground hover:text-coral transition flex items-center justify-center gap-2"
              >
                <Truck className="w-4 h-4" /> Leerfahrt planen
              </button>
            </div>
          )
        )}

        {/* ---------- Touren ---------- */}
        {activeTab === "touren" && (
          selectedTripId && running.find(t => t.id === selectedTripId) ? (
            <DispatchTourDetails
              trip={running.find(t => t.id === selectedTripId)}
              state={state}
              routeData={routeData}
              onBack={() => onSelectTrip(null)}
              onShowOnMap={() => onShowOnMap?.(selectedTripId)}
              onShowVehicle={() => onShowVehicle?.(running.find(t => t.id === selectedTripId)?.vehicleId)}
            />
          ) : (
            <div className="space-y-3">
              <DispatchActiveTours tours={activeTours} state={state} onSelectTrip={onSelectTrip} />
              <DriverWorkBudget state={state} />
              <DispatchTourList trips={filteredTrips} state={state} selectedTripId={selectedTripId} onSelectTrip={onSelectTrip} />
            </div>
          )
        )}

        {/* ---------- Flotte ---------- */}
        {activeTab === "flotte" && (
          <div className="space-y-2">
            {filteredVehicles.map(v => {
              const trip = v.tripId ? state.trips.find(t => t.id === v.tripId) : null;
              const driver = trip ? state.drivers.find(d => d.id === trip.driverId) : null;
              const isSelected = v.id === selectedVehicleId;
              return (
                <button
                  key={v.id}
                  onClick={() => { onSelectVehicle(v.id); if (v.tripId) { onSelectTrip(v.tripId); setActiveTab("touren"); } }}
                  className={`w-full text-left rounded-xl p-3 border transition ${
                    isSelected ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20 bg-surface/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{vehicleDisplayName(v)}</span>
                    <StatusDot status={v.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {v.locationCity} · Zustand {v.condition} · {v.capacityTons} t
                  </div>
                  {trip && driver && (
                    <div className="text-xs text-amber-300 mt-1.5 flex items-center gap-1">
                      <Truck className="w-3 h-3" /> {driverDisplayName(driver)} · bis {formatGameTime(trip.endMin)}
                    </div>
                  )}
                  {v.status === "maintenance" && v.maintenanceUntil && (
                    <div className="text-xs text-sky-300 mt-1.5">Wartung bis {formatGameTime(v.maintenanceUntil)}</div>
                  )}
                  {v.status === "free" && v.idleReason && (
                    <div className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {v.idleReason}
                    </div>
                  )}
                </button>
              );
            })}
            {selectedVehicleId && (() => {
              const sv = state.vehicles.find(x => x.id === selectedVehicleId);
              if (!sv || sv.status !== "free") return null;
              return (
                <div className="mt-3 p-3 rounded-xl border border-lime/30 bg-lime/5">
                  <div className="text-xs text-muted-foreground mb-2">{vehicleDisplayName(sv)} in {sv.locationCity} zuweisen</div>
                  {accepted.length === 0 ? (
                    <Link to="/auftraege" className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition">
                      <Package className="w-3.5 h-3.5" /> Kein Auftrag – Auftragsmarkt
                    </Link>
                  ) : (
                    <button
                      onClick={() => { if (accepted.length === 1) onPlanOrder(accepted[0].id); else setActiveTab("auftraege"); }}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime text-ink text-xs font-semibold hover:brightness-110 transition active:scale-95"
                    >
                      <Route className="w-3.5 h-3.5" /> {accepted.length === 1 ? "Auftrag planen" : `${accepted.length} Aufträge wählen`}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ---------- Disponenten ---------- */}
        {activeTab === "disponenten" && <DispatcherPanel />}

        {/* ---------- Verlauf ---------- */}
        {activeTab === "verlauf" && <div className="h-full"><DispatchLiveLog events={recentEvents} /></div>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, count, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition min-h-[44px] ${
        active ? "border-lime text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-lime/20 text-lime" : "bg-white/10"}`}>{count}</span>}
    </button>
  );
}

function StatusDot({ status }) {
  const styles = { free: "text-lime", on_trip: "text-amber-300", maintenance: "text-sky-300" };
  const labels = { free: "Bereit", on_trip: "Unterwegs", maintenance: "Wartung" };
  return (
    <span className={`text-[10px] flex items-center gap-1 ${styles[status] || "text-muted-foreground"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {labels[status] || status}
    </span>
  );
}

function EmptyTripPlanner({ state, onBack, from, setFrom, to, setTo, vehicleId, setVehicleId, driverId, setDriverId, starting, setStarting, send, showToast }) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const freeVehicles = state.vehicles.filter(v => v.status === "free");
  const freeDrivers = state.drivers.filter(d => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime));

  const dist = from !== to ? getDistance(from, to) : 0;
  const dur = driveMinutes(dist);
  const fuel = vehicle ? fuelEur(dist, vehicle.consumptionPer100km) : 0;
  const toll = tollEur(dist);
  const tooLong = dur > MAX_DUTY_MIN;
  const canStart = vehicle && driverId && from !== to && !tooLong && vehicle.locationCity === from && vehicle.locationCity === state.drivers.find(d => d.id === driverId)?.locationCity;

  async function start() {
    if (!canStart) return;
    setStarting(true);
    try {
      const r = await send("startEmptyTrip", { fromCity: from, toCity: to, vehicleId, driverId });
      showToast(`Leerfahrt gestartet – Ankunft ${formatGameTime(r.endMin)}.`, "success");
      setVehicleId(""); setDriverId("");
      onBack();
    } catch (e) { showToast(e.message, "error"); }
    finally { setStarting(false); }
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition">
        ← Zurück zur Auftragsliste
      </button>
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Leerfahrt planen</div>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Von" value={from} onChange={setFrom}>{CITIES.map(c => <option key={c}>{c}</option>)}</Select>
        <Select label="Nach" value={to} onChange={setTo}>{CITIES.map(c => <option key={c}>{c}</option>)}</Select>
      </div>
      <Select label="Fahrzeug" value={vehicleId} onChange={setVehicleId}>
        <option value="">– wählen –</option>
        {freeVehicles.map(v => <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {v.locationCity} · Zustand {v.condition}</option>)}
      </Select>
      <Select label="Fahrer" value={driverId} onChange={setDriverId}>
        <option value="">– wählen –</option>
        {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.locationCity}</option>)}
      </Select>
      {from !== to && (
        <div className="space-y-1.5 border-t border-white/10 pt-3 text-xs">
          <div className="flex justify-between"><span className="text-muted-foreground">Distanz</span><span className="tabular-nums">{dist} km</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Dauer</span><span className={`tabular-nums ${tooLong ? "text-red-300" : ""}`}>{Math.floor(dur / 60)} h {dur % 60} min</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Kraftstoff</span><span className="tabular-nums">{formatEuro(fuel * 100)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Maut</span><span className="tabular-nums">{formatEuro(toll * 100)}</span></div>
        </div>
      )}
      {tooLong && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Einsatz überschreitet 8 Stunden.
        </div>
      )}
      <button
        onClick={start}
        disabled={!canStart || starting}
        className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
      >
        {starting ? "Startet…" : <><Play className="w-4 h-4" /> Leerfahrt starten</>}
      </button>
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
        {children}
      </select>
    </label>
  );
}