import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import SiteExpansionCard from "@/components/branches/SiteExpansionCard";
import {
  Building2, MapPin, Truck, Users, Headset, TrendingUp, Wallet, Edit2, X,
  Crown, Check, Zap, ShieldCheck, Wrench, Sparkles, Calculator, Briefcase,
  ArrowRight, Activity, Gauge, Percent, Wrench as WrenchIcon, Package, Clock,
} from "lucide-react";

const ROLE_LABELS = {
  dispatcher: "Disponent", dispatcher_senior: "Senior-Disponent",
  mechanic: "Mechaniker", cleaner: "Reinigung",
  accountant: "Buchhalter", accountant_senior: "Senior-Buchhalter",
  branch_manager: "Filialleiter", assistant: "Assistent",
};

const VEHICLE_STATUS_LABELS = {
  free: "Frei", on_trip: "Auf Tour", maintenance: "In Wartung",
  traveling: "Unterwegs", loading: "Beladung", unloading: "Entladung",
};

const DRIVER_STATUS_LABELS = {
  free: "Frei", on_trip: "Auf Tour", resting: "Pause", traveling: "Unterwegs",
  loading: "Beladung", unloading: "Entladung", sick: "Krank", on_leave: "Urlaub",
};

export default function BranchDetailDialog({ branch, onClose, onMoveResource }) {
  const { state, send, showToast } = useGame();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(branch.name);
  const [savingName, setSavingName] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [subTab, setSubTab] = useState("overview");

  const vehicles = useMemo(() =>
    (state.vehicles || []).filter(v => v.branchId === branch.id && v.status !== "sold" && v.status !== "archived"),
    [state.vehicles, branch.id]);
  const drivers = useMemo(() =>
    (state.drivers || []).filter(d => d.branchId === branch.id && d.employmentStatus === "employed"),
    [state.drivers, branch.id]);
  const allStaff = useMemo(() =>
    (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === branch.id && e.employmentStatus === "employed"),
    [state.employees, branch.id]);

  const dispatchers = allStaff.filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior");
  const mechanics = allStaff.filter(e => e.role === "mechanic");
  const cleaners = allStaff.filter(e => e.role === "cleaner");
  const accountants = allStaff.filter(e => e.role === "accountant" || e.role === "accountant_senior");
  const manager = allStaff.find(e => e.role === "branch_manager");

  const activeVehicles = vehicles.filter(v => v.status === "on_trip").length;
  const freeVehicles = vehicles.filter(v => v.status === "free").length;
  const maintVehicles = vehicles.filter(v => v.status === "maintenance").length;
  const utilization = vehicles.length > 0 ? Math.round(activeVehicles / vehicles.length * 100) : 0;

  const freeDrivers = drivers.filter(d => d.status === "free").length;
  const restDrivers = drivers.filter(d => d.status === "resting").length;

  const avgCondition = vehicles.length > 0
    ? Math.round(vehicles.reduce((s, v) => s + (v.condition || 100), 0) / vehicles.length)
    : 100;

  const stats = branch.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
  const profit = stats.revenueCents - stats.expensesCents;
  const margin = stats.revenueCents > 0 ? Math.round(profit / stats.revenueCents * 100) : 0;

  const healthScore = Math.round(
    (utilization * 0.3) +
    (avgCondition * 0.3) +
    (vehicles.length > 0 ? Math.min(100, (freeDrivers / vehicles.length) * 100) * 0.2 : 50) +
    (dispatchers.length > 0 ? 20 : 0)
  );

  const dailyCost = (branch.costPerDayCents || 0)
    + drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)
    + allStaff.reduce((s, e) => s + (e.costPerDayCents || 0), 0);

  async function saveName() {
    if (!editName.trim()) return;
    setSavingName(true);
    try {
      await send("renameBranch", { branchId: branch.id, name: editName.trim() });
      showToast("Filiale umbenannt.", "success");
      setEditing(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSavingName(false);
    }
  }

  async function closeBranch() {
    setClosing(true);
    try {
      await send("closeBranch", { branchId: branch.id });
      showToast("Filiale stillgelegt.", "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setClosing(false);
    }
  }

  async function toggleManagerMode() {
    if (!manager) return;
    setModeBusy(true);
    try {
      await send("setBranchManagerMode", {
        employeeId: manager.id,
        mode: manager.managementMode === "autonomous" ? "requests_approval" : "autonomous",
      });
      showToast(manager.managementMode === "autonomous" ? "Modus: Freigaben erforderlich" : "Modus: Autonom", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setModeBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="glass border border-white/15 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 ${branch.isHeadquarters ? "bg-amber-300/10 border border-amber-300/20" : "bg-lime/10 border border-lime/20"}`}>
              {branch.isHeadquarters ? <Crown className="w-5 h-5 text-amber-300" /> : <Building2 className="w-5 h-5 text-lime" />}
            </div>
            <div className="min-w-0">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text" value={editName} onChange={e => setEditName(e.target.value)}
                    className="bg-surface-2/50 border border-white/10 rounded px-2 py-1 text-sm focus:border-lime/40 focus:outline-none w-48"
                    autoFocus
                  />
                  <button onClick={saveName} disabled={savingName} className="text-lime hover:brightness-110">
                    {savingName ? <span className="w-4 h-4 border-2 border-lime/30 border-t-lime rounded-full animate-spin block" /> : <Check className="w-4 h-4" />}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="text-lg font-medium truncate">{branch.name}</h2>
                  {!branch.isHeadquarters && (
                    <button onClick={() => { setEditing(true); setEditName(branch.name); }} className="text-muted-foreground hover:text-foreground transition shrink-0">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" /> {branch.city}
                {branch.isHeadquarters && <span className="text-amber-300">· Hauptsitz</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-5 border-b border-white/10 flex items-center gap-1 shrink-0">
          {[
            { id: "overview", label: "Übersicht", icon: Gauge },
            { id: "vehicles", label: `Fahrzeuge (${vehicles.length})`, icon: Truck },
            { id: "staff", label: `Personal (${allStaff.length + drivers.length})`, icon: Users },
            { id: "finances", label: "Finanzen", icon: Wallet },
            { id: "expansion", label: "Ausbau", icon: Building2 },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition -mb-px ${
                subTab === t.id ? "border-lime text-lime" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-4">
          {subTab === "overview" && (
            <>
              {/* Score-Balken */}
              <div className="grid grid-cols-2 gap-3">
                <ScoreBar label="Gesundheit" value={healthScore} />
                <ScoreBar label="Auslastung" value={utilization} suffix="%" />
              </div>

              {/* Ressourcen-Übersicht */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DetailStat icon={Truck} label="Fahrzeuge" value={vehicles.length} sub={`${freeVehicles} frei · ${activeVehicles} aktiv · ${maintVehicles} Wartung`} />
                <DetailStat icon={Users} label="Fahrer" value={drivers.length} sub={`${freeDrivers} frei · ${restDrivers} Pause`} />
                <DetailStat icon={Headset} label="Disponenten" value={dispatchers.length} sub={dispatchers.length > 0 ? "Aktiv" : "Fehlt"} subColor={dispatchers.length > 0 ? "text-lime" : "text-coral"} />
                <DetailStat icon={Wrench} label="Mechaniker" value={mechanics.length} sub={mechanics.length > 0 ? "Aktiv" : "—"} />
              </div>

              {/* Flottenzustand */}
              {vehicles.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2/30 border border-white/5">
                  <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Flottenzustand</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${avgCondition >= 70 ? "bg-lime" : avgCondition >= 40 ? "bg-amber-300" : "bg-coral"}`} style={{ width: `${avgCondition}%` }} />
                  </div>
                  <span className={`text-sm font-medium tabular-nums ${avgCondition >= 70 ? "text-lime" : avgCondition >= 40 ? "text-amber-300" : "text-coral"}`}>{avgCondition}%</span>
                </div>
              )}

              {/* Filialleiter */}
              {manager && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2/40 border border-white/5">
                  <Portrait portraitId={manager.portraitId} name={manager.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{manager.name}</div>
                    <div className="text-xs text-muted-foreground">Filialleiter</div>
                  </div>
                  <button
                    onClick={toggleManagerMode}
                    disabled={modeBusy}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition disabled:opacity-50 ${
                      manager.managementMode === "autonomous"
                        ? "bg-lime/10 border-lime/30 text-lime hover:bg-lime/20"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                    }`}
                  >
                    {manager.managementMode === "autonomous" ? <Zap className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                    {manager.managementMode === "autonomous" ? "Autonom" : "Freigabe"}
                  </button>
                </div>
              )}

              {/* Kennzahlen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCell icon={TrendingUp} label="Umsatz" value={formatEuro(stats.revenueCents)} />
                <MetricCell icon={ArrowRight} label="Lieferungen" value={stats.deliveries} />
                <MetricCell icon={Percent} label="Marge" value={`${margin}%`} valueClass={margin >= 30 ? "text-lime" : margin >= 10 ? "text-amber-300" : "text-coral"} />
                <MetricCell icon={Wallet} label="Kosten/Tag" value={formatEuro(dailyCost)} />
              </div>
            </>
          )}

          {subTab === "vehicles" && (
            <div className="space-y-2">
              {vehicles.length === 0 ? (
                <EmptyState icon={Truck} text="Keine Fahrzeuge an diesem Standort." />
              ) : vehicles.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2/30 border border-white/5">
                  <div className="grid place-items-center w-9 h-9 rounded-lg bg-white/5 border border-white/10 shrink-0">
                    <Truck className="w-4 h-4 text-foreground/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{vehicleDisplayName(v)}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{v.type === "regional" ? "Regional" : v.type === "standard" ? "Standard" : "Schwer"}</span>
                      <span>·</span>
                      <span>{v.bodyType === "box" ? "Planen" : v.bodyType === "reefer" ? "Kühlwagen" : v.bodyType === "tank" ? "Tankwagen" : v.bodyType === "tipper" ? "Kipper" : v.bodyType}</span>
                      {v.licensePlate && <><span>·</span><span>{v.licensePlate}</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-xs font-medium ${v.status === "free" ? "text-lime" : v.status === "on_trip" ? "text-amber-300" : "text-coral"}`}>
                      {VEHICLE_STATUS_LABELS[v.status] || v.status}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{v.odometerKm ? `${(v.odometerKm).toLocaleString("de-DE")} km` : "—"}</div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Zustand</div>
                    <div className={`text-xs font-medium tabular-nums ${(v.condition || 100) >= 70 ? "text-lime" : (v.condition || 100) >= 40 ? "text-amber-300" : "text-coral"}`}>{v.condition || 100}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {subTab === "staff" && (
            <div className="space-y-4">
              {/* Fahrer */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Fahrer ({drivers.length})</h3>
                {drivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 px-4 py-3">Keine Fahrer an diesem Standort.</p>
                ) : (
                  <div className="space-y-2">
                    {drivers.map(d => (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2/30 border border-white/5">
                        <Portrait portraitId={d.portraitId} name={d.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{DRIVER_STATUS_LABELS[d.status] || d.status}</div>
                        </div>
                        {d.costPerDayCents > 0 && <div className="text-xs text-muted-foreground tabular-nums shrink-0">{formatEuro(d.costPerDayCents)}/Tag</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Angestellte */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Angestellte ({allStaff.length})</h3>
                {allStaff.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 px-4 py-3">Keine Angestellte an diesem Standort.</p>
                ) : (
                  <div className="space-y-2">
                    {allStaff.map(e => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2/30 border border-white/5">
                        <Portrait portraitId={e.portraitId} name={e.name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{e.name}</div>
                          <div className="text-xs text-muted-foreground">{ROLE_LABELS[e.role] || e.role}</div>
                        </div>
                        {e.managementMode && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${e.managementMode === "autonomous" ? "bg-lime/10 text-lime" : "bg-amber-500/10 text-amber-300"}`}>
                            {e.managementMode === "autonomous" ? "Autonom" : "Freigabe"}
                          </span>
                        )}
                        {e.costPerDayCents > 0 && <div className="text-xs text-muted-foreground tabular-nums shrink-0">{formatEuro(e.costPerDayCents)}/Tag</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {subTab === "finances" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MetricCell icon={TrendingUp} label="Umsatz (kumulierter Zeitraum)" value={formatEuro(stats.revenueCents)} />
                <MetricCell icon={Wallet} label="Ausgaben (kumulierter Zeitraum)" value={formatEuro(stats.expensesCents)} />
                <MetricCell icon={ArrowRight} label="Lieferungen" value={stats.deliveries} />
                <MetricCell icon={Percent} label="Marge" value={`${margin}%`} valueClass={margin >= 30 ? "text-lime" : margin >= 10 ? "text-amber-300" : "text-coral"} />
              </div>
              <div className="rounded-xl bg-surface-2/30 border border-white/5 p-4 space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Tageskosten (Aufschlüsselung)</h3>
                <CostRow label="Standort (Miete)" value={branch.costPerDayCents || 0} />
                <CostRow label="Fahrerlöhne" value={drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)} />
                <CostRow label="Angestellte" value={allStaff.reduce((s, e) => s + (e.costPerDayCents || 0), 0)} />
                <div className="border-t border-white/10 pt-2">
                  <CostRow label="Gesamt / Tag" value={dailyCost} bold />
                </div>
              </div>
              <div className="rounded-xl bg-surface-2/30 border border-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Gewinn / Verlust (Zeitraum)</div>
                <div className={`text-2xl font-semibold tabular-nums ${profit >= 0 ? "text-lime" : "text-coral"}`}>{formatEuro(profit)}</div>
              </div>
            </div>
          )}

          {subTab === "expansion" && (
            <SiteExpansionCard branchId={branch.id} />
          )}
        </div>

        {/* Action Bar */}
        <div className="px-5 py-3.5 border-t border-white/10 flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => onMoveResource({ type: "vehicle", branchId: branch.id })}
            disabled={vehicles.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
          >
            <Truck className="w-3.5 h-3.5" /> Lkw verschieben
          </button>
          <button
            onClick={() => onMoveResource({ type: "driver", branchId: branch.id })}
            disabled={drivers.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
          >
            <Users className="w-3.5 h-3.5" /> Fahrer verschieben
          </button>
          <button
            onClick={() => onMoveResource({ type: "employee", branchId: branch.id })}
            disabled={allStaff.length === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
          >
            <Briefcase className="w-3.5 h-3.5" /> Personal verschieben
          </button>
          {!branch.isHeadquarters && (
            <button
              onClick={closeBranch}
              disabled={closing}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-coral/10 border border-coral/30 text-coral text-xs hover:bg-coral/20 disabled:opacity-40 transition ml-auto"
            >
              {closing ? <span className="w-3.5 h-3.5 border-2 border-coral/30 border-t-coral rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Stilllegen
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ScoreBar({ label, value, suffix = "" }) {
  const color = value >= 70 ? "text-lime" : value >= 40 ? "text-amber-300" : "text-coral";
  const bgColor = value >= 70 ? "bg-lime" : value >= 40 ? "bg-amber-300" : "bg-coral";
  return (
    <div className="rounded-xl bg-surface-2/30 border border-white/5 px-4 py-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full ${bgColor} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
        </div>
        <span className={`text-sm font-medium tabular-nums ${color}`}>{value}{suffix}</span>
      </div>
    </div>
  );
}

function DetailStat({ icon: Icon, label, value, sub, subColor = "text-muted-foreground" }) {
  return (
    <div className="rounded-xl bg-surface-2/30 border border-white/5 px-3 py-2.5">
      <Icon className="w-3.5 h-3.5 text-foreground/40 mb-1" />
      <div className="text-xl font-semibold tabular-nums leading-tight">{value}</div>
      <div className={`text-[10px] leading-tight ${subColor}`}>{sub}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function MetricCell({ icon: Icon, label, value, valueClass = "" }) {
  return (
    <div className="rounded-xl bg-surface-2/30 border border-white/5 px-3.5 py-2.5">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-sm font-medium tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function CostRow({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={bold ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-foreground" : "text-foreground/80"}`}>{formatEuro(value)}</span>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="text-center py-10">
      <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}