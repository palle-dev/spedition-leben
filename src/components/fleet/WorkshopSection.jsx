import React, { useState } from "react";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import {
  WORKSHOP_SLOT_PRICE, INTERNAL_MAINT_PARTS, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, computeEstimatedEnd,
} from "@/lib/workshopData";
import Drawer from "@/components/ui/Drawer";
import {
  Wrench, Plus, Settings, Clock, AlertTriangle, Check,
  Truck, MapPin, User, Zap,
} from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

export default function WorkshopSection({ state, send, showToast }) {
  const [showBuySlot, setShowBuySlot] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [planVehicle, setPlanVehicle] = useState(null);
  const [filter, setFilter] = useState("all");

  const workshop = state.workshop || {};
  const slots = workshop.slots || [];
  const orders = workshop.maintenanceOrders || [];
  const profile = workshop.automationProfile || {};
  const stressed = state.private.stress >= 80;
  const partsCost = stressed ? Math.round(INTERNAL_MAINT_PARTS * 1.25) : INTERNAL_MAINT_PARTS;

  const activeOrders = orders.filter(o => !["completed", "cancelled"].includes(o.status));
  const completedOrders = orders.filter(o => o.status === "completed");
  const mechanics = (state.employees || []).filter(e => e.role === "mechanic");
  const branchesWithWorkshop = branchesWithSlots(state);

  const filteredOrders = filter === "all" ? activeOrders :
    filter === "urgent" ? activeOrders.filter(o => {
      const v = state.vehicles.find(x => x.id === o.vehicleId);
      return v && v.condition <= (profile.urgentThreshold || 30);
    }) :
    filter === "active" ? activeOrders.filter(o => o.status === "in_progress") :
    activeOrders.filter(o => o.status === filter);

  async function handleBuySlot(branchId) {
    try {
      await send("buildWorkshopSlot", { branchId });
      showToast("Werkstattplatz gebaut – 5.000 € als Anlage gebucht.", "success");
      setShowBuySlot(false);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleCancel(orderId) {
    try {
      await send("cancelMaintenance", { orderId });
      showToast("Wartungsauftrag storniert.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleToggleAutomation() {
    try {
      await send("updateAutomationProfile", { enabled: !profile.enabled });
      showToast(profile.enabled ? "Automatik ausgeschaltet." : "Automatik eingeschaltet.", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  const vehiclesNeedingMaint = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" &&
    v.status === "free" && v.condition < (profile.routineThreshold || 60) &&
    !orders.some(o => o.vehicleId === v.id && !["completed", "cancelled"].includes(o.status))
  );

  return (
    <div className="space-y-4">
      {/* Kopfzeile */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-medium tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-lime/70" /> Werkstatt
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {slots.length} Platz/Plätze · {mechanics.length} Mechaniker · {activeOrders.length} aktive Aufträge
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAutomation(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition">
            <Settings className="w-3.5 h-3.5" /> Automatik {profile.enabled ? <span className="text-lime">an</span> : <span className="text-muted-foreground">aus</span>}
          </button>
          <button onClick={() => setShowBuySlot(true)} disabled={state.company.accountCents < WORKSHOP_SLOT_PRICE}
            className="flex items-center gap-2 rounded-lg px-3 py-2 bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:bg-lime/20 disabled:opacity-40 transition">
            <Plus className="w-3.5 h-3.5" /> Platz bauen (5.000 €)
          </button>
        </div>
      </div>

      {/* Werkstattplätze */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {slots.length === 0 ? (
          <div className="col-span-full text-center py-6 glass border border-dashed border-white/15 rounded-xl">
            <Wrench className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">Noch kein Werkstattplatz vorhanden.</div>
            <div className="text-[10px] text-muted-foreground/70 mt-1">Ein Platz kostet 5.000 € (als Anlage) und erlaubt einen Lkw gleichzeitig.</div>
          </div>
        ) : (
          slots.map(slot => {
            const branch = state.branches.find(b => b.id === slot.branchId);
            const order = slot.currentOrderId ? orders.find(o => o.id === slot.currentOrderId) : null;
            const v = order ? state.vehicles.find(x => x.id === order.vehicleId) : null;
            const mech = order?.mechanicId ? state.employees.find(e => e.id === order.mechanicId) : null;
            return (
              <div key={slot.id} className={`glass border rounded-xl p-3 ${slot.status === "occupied" ? "border-lime/20" : "border-white/10"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <MapPin className="w-3 h-3 text-muted-foreground" /> {branch?.name || "—"}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${slot.status === "occupied" ? "bg-lime/15 text-lime" : "bg-white/5 text-muted-foreground"}`}>
                    {slot.status === "occupied" ? "Belegt" : "Frei"}
                  </span>
                </div>
                {order && v ? (
                  <div className="space-y-1">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-lime/60" /> {vehicleDisplayName(v)}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <User className="w-2.5 h-2.5" /> {mech?.name || "Kein Mechaniker"}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {order.completedMinutes}/{order.requiredMinutes} Min.
                      {order.working && <span className="text-lime"> · arbeitet</span>}
                    </div>
                    {order.status === "in_progress" && order.working && (
                      <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-lime rounded-full transition-all" style={{ width: `${(order.completedMinutes / order.requiredMinutes) * 100}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-muted-foreground/50 py-2 text-center">Bereit für Wartung</div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Wartungsbedürftige Flotte */}
      {vehiclesNeedingMaint.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Wartungsbedürftig ({vehiclesNeedingMaint.length})
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {vehiclesNeedingMaint.map(v => {
              const branch = state.branches.find(b => b.city === v.locationCity);
              const hasWorkshop = branch ? slots.some(s => s.branchId === branch.id) : false;
              const isUrgent = v.condition <= (profile.urgentThreshold || 30);
              return (
                <div key={v.id} className={`glass border rounded-xl p-3 ${isUrgent ? "border-red-400/30" : "border-amber-400/20"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" /> {vehicleDisplayName(v)}
                    </span>
                    <span className={`text-xs font-semibold ${isUrgent ? "text-red-300" : "text-amber-300"}`}>{v.condition}/100</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" /> {v.locationCity}
                    {!hasWorkshop && <span className="text-amber-400 ml-1">· keine Werkstatt am Ort</span>}
                  </div>
                  <button
                    onClick={() => setPlanVehicle({ vehicleId: v.id, branchId: hasWorkshop ? branch.id : branchesWithWorkshop[0]?.id })}
                    disabled={!hasWorkshop && branchesWithWorkshop.length === 0}
                    className="w-full mt-2 py-1.5 rounded-lg bg-coral/10 border border-coral/20 text-coral text-xs font-medium hover:bg-coral/20 disabled:opacity-40 transition"
                  >
                    Wartung planen
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warteschlange */}
      {activeOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Warteschlange</h3>
            <div className="flex gap-1">
              {["all", "urgent", "in_progress", "waiting", "interrupted"].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                    filter === f ? "bg-coral/15 text-coral" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {f === "all" ? "Alle" : f === "urgent" ? "Dringend" : ORDER_STATUS_LABELS[f] || f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            {filteredOrders.map(o => {
              const v = state.vehicles.find(x => x.id === o.vehicleId);
              const branch = state.branches.find(b => b.id === o.branchId);
              const mech = o.mechanicId ? state.employees.find(e => e.id === o.mechanicId) : null;
              const estEnd = computeEstimatedEnd(state, o);
              const pct = o.requiredMinutes > 0 ? (o.completedMinutes / o.requiredMinutes) * 100 : 0;
              return (
                <div key={o.id} className={`glass border rounded-xl p-3 ${ORDER_STATUS_COLORS[o.status] || ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-medium truncate">{vehicleDisplayName(v)}</span>
                        <span className="text-[10px] text-muted-foreground">{v?.condition || 0}/100</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {branch?.name || "—"}</span>
                        {mech && <span className="flex items-center gap-0.5"><User className="w-2.5 h-2.5" /> {mech.name}</span>}
                        {o.materialConsumed && <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" /> {formatEuro(o.actualPartsCostCents || 0)}</span>}
                        {o.status === "in_progress" && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" /> Ende ~{formatGameTime(estEnd)}</span>}
                      </div>
                      {o.blockReason && <div className="text-[10px] text-amber-300 mt-1">⚠ {o.blockReason}</div>}
                      {o.status === "in_progress" && (
                        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden mt-1.5">
                          <div className="h-full bg-lime rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap">{ORDER_STATUS_LABELS[o.status] || o.status}</span>
                      {["planned", "waiting", "interrupted"].includes(o.status) && (
                        <button onClick={() => handleCancel(o.id)} className="text-[10px] text-muted-foreground hover:text-red-300 transition">Stornieren</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Abgeschlossene Aufträge (zusammengefasst) */}
      {completedOrders.length > 0 && (
        <div className="text-[10px] text-muted-foreground/60">
          {completedOrders.length} abgeschlossene Wartung(en).
        </div>
      )}

      {/* Werkstattplatz bauen – Drawer */}
      <Drawer open={showBuySlot} onClose={() => setShowBuySlot(false)} title="Werkstattplatz bauen" maxWidth="max-w-md">
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Ein Werkstattplatz kostet <span className="text-foreground font-medium">5.000 €</span> als Anlage und gehört zu einem Standort. Er erlaubt die gleichzeitige Wartung eines Lkw.
          </div>
          {state.branches.map(b => {
            const existing = slots.filter(s => s.branchId === b.id).length;
            return (
              <button key={b.id} onClick={() => handleBuySlot(b.id)}
                disabled={state.company.accountCents < WORKSHOP_SLOT_PRICE}
                className="w-full text-left glass border border-white/10 rounded-xl p-3 hover:border-lime/30 disabled:opacity-40 transition">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-[10px] text-muted-foreground">{b.city} · {existing} vorhandene Platz/Plätze</div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">{formatEuro(WORKSHOP_SLOT_PRICE)}</div>
                </div>
              </button>
            );
          })}
          {state.company.accountCents < WORKSHOP_SLOT_PRICE && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
              Firmenkonto reicht für 5.000 € nicht aus.
            </div>
          )}
        </div>
      </Drawer>

      {/* Automatik konfigurieren – Drawer */}
      <Drawer open={showAutomation} onClose={() => setShowAutomation(false)} title="Wartungsautomatik" maxWidth="max-w-md">
        <AutomationConfig state={state} send={send} showToast={showToast} profile={profile} onToggle={handleToggleAutomation} />
      </Drawer>

      {/* Wartung planen – Drawer */}
      <Drawer open={!!planVehicle} onClose={() => setPlanVehicle(null)} title="Wartung planen" maxWidth="max-w-md">
        {planVehicle && (
          <MaintenancePlanForm
            state={state} send={send} showToast={showToast}
            vehicleId={planVehicle.vehicleId} branchId={planVehicle.branchId}
            partsCost={partsCost} stressed={stressed}
            onClose={() => setPlanVehicle(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

function branchesWithSlots(state) {
  const slotBranchIds = new Set((state.workshop?.slots || []).map(s => s.branchId));
  return (state.branches || []).filter(b => slotBranchIds.has(b.id));
}

// ---------- Automatik-Konfiguration ----------
function AutomationConfig({ state, send, showToast, profile, onToggle }) {
  const [routine, setRoutine] = useState(String(profile.routineThreshold || 60));
  const [urgent, setUrgent] = useState(String(profile.urgentThreshold || 30));
  const [maxCost, setMaxCost] = useState(String(profile.maxCostCents || 150000));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await send("updateAutomationProfile", {
        routineThreshold: Number(routine),
        urgentThreshold: Number(urgent),
        maxCostCents: Number(maxCost),
      });
      showToast("Automatikprofil gespeichert.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2/50 border border-white/10">
        <div>
          <div className="text-sm font-medium">Automatik aktiv</div>
          <div className="text-[10px] text-muted-foreground">Plant und führt Wartung automatisch durch.</div>
        </div>
        <button onClick={onToggle}
          className={`w-12 h-6 rounded-full transition relative ${profile.enabled ? "bg-lime" : "bg-white/10"}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${profile.enabled ? "left-6" : "left-0.5"}`} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground">Routinewartung bei Zustand unter</label>
          <input type="number" min="1" max="100" value={routine} onChange={e => setRoutine(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-coral/50 outline-none" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Dringende Wartung bei Zustand ≤</label>
          <input type="number" min="1" max="100" value={urgent} onChange={e => setUrgent(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-coral/50 outline-none" />
          {Number(routine) <= Number(urgent) && (
            <div className="text-[10px] text-red-300 mt-1">Routinegrenze muss über Dringlichkeitsgrenze liegen.</div>
          )}
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Max. Kosten pro automatischer Wartung (€)</label>
          <input type="number" min="900" value={maxCost / 100} onChange={e => setMaxCost(String(Number(e.target.value) * 100))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-coral/50 outline-none" />
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/70 p-2.5 rounded-lg bg-white/5 border border-white/5">
        Die Automatik stellt keine Mechaniker ein, kauft keine Werkstattplätze, nimmt keine Kredite auf und bucht keine fremden Werkstätten. Sie nutzt vorhandene Plätze und Mechaniker während der Dienstzeit (08:00–16:00).
      </div>

      <button onClick={handleSave} disabled={saving || Number(routine) <= Number(urgent)}
        className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Speichern</>}
      </button>
    </div>
  );
}

// ---------- Wartung planen Formular ----------
function MaintenancePlanForm({ state, send, showToast, vehicleId, branchId, partsCost, stressed, onClose }) {
  const v = state.vehicles.find(x => x.id === vehicleId);
  const branch = state.branches.find(b => b.id === branchId);
  const slots = (state.workshop?.slots || []).filter(s => s.branchId === branchId);
  const freeSlot = slots.find(s => s.status === "free");
  const mechanics = (state.employees || []).filter(e => e.role === "mechanic" && e.employmentStatus === "employed" && e.locationCity === branch?.city);
  const [mechanicId, setMechanicId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const atWorkshop = v?.locationCity === branch?.city;
  const vehicleFree = v?.status === "free";
  const canAfford = state.company.accountCents >= partsCost;

  async function handlePlan() {
    setSubmitting(true);
    try {
      await send("planMaintenance", { vehicleId, branchId, mechanicId: mechanicId || null });
      showToast("Wartungsauftrag erstellt. Die Arbeit beginnt bei nächster Gelegenheit.", "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5">
        <div className="text-sm font-medium flex items-center gap-1.5"><Truck className="w-4 h-4" /> {vehicleDisplayName(v)}</div>
        <div className="text-[10px] text-muted-foreground mt-1">Zustand {v?.condition || 0}/100 · Standort {v?.locationCity || "—"}</div>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Werkstattstandort</span><span>{branch?.name || "—"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fahrzeug am Ort?</span><span className={atWorkshop ? "text-lime" : "text-amber-300"}>{atWorkshop ? "Ja" : "Nein – Rückfahrt erforderlich"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Fahrzeug frei?</span><span className={vehicleFree ? "text-lime" : "text-red-300"}>{vehicleFree ? "Ja" : "Nein (" + v?.status + ")"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Freier Platz</span><span className={freeSlot ? "text-lime" : "text-amber-300"}>{freeSlot ? "Ja" : "Nein"}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Teile/Material</span><span className="tabular-nums">{formatEuro(partsCost)}{stressed && <span className="text-amber-300 ml-1">(+25 % Stress)</span>}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Arbeitszeit</span><span>8 Std. (08:00–16:00)</span></div>
      </div>

      {mechanics.length > 0 && (
        <div>
          <label className="text-[11px] text-muted-foreground">Mechaniker (optional – wird sonst automatisch zugewiesen)</label>
          <select value={mechanicId} onChange={e => setMechanicId(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-coral/50 outline-none">
            <option value="">Automatisch zuweisen</option>
            {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {mechanics.length === 0 && (
        <div className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          Kein Mechaniker am Standort. Die Arbeit beginnt, sobald ein Mechaniker verfügbar ist.
        </div>
      )}

      {!canAfford && (
        <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
          Firmenkonto reicht für Teile ({formatEuro(partsCost)}) nicht aus.
        </div>
      )}

      <button onClick={handlePlan} disabled={submitting || !canAfford}
        className="w-full flex items-center justify-center gap-2 bg-coral text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition">
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Wrench className="w-4 h-4" /> Wartung beauftragen</>}
      </button>
    </div>
  );
}