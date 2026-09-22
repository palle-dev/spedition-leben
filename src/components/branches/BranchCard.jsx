import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import Portrait from "@/components/ui/Portrait";
import {
  Building2, MapPin, Truck, Users, Headset, TrendingUp, Wallet, Edit2, X,
  Crown, Check, Zap, ShieldCheck, Wrench, Sparkles, Calculator, Briefcase,
  ArrowRight, Activity, Gauge, Percent,
} from "lucide-react";

export default function BranchCard({ branch, onMoveResource, onOpenDetail }) {
  const { state, send, showToast } = useGame();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(branch.name);
  const [savingName, setSavingName] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);

  const vehicles = (state.vehicles || []).filter(v => v.branchId === branch.id && v.status !== "sold" && v.status !== "archived");
  const drivers = (state.drivers || []).filter(d => d.branchId === branch.id && d.employmentStatus === "employed");
  const allStaff = (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === branch.id && e.employmentStatus === "employed");
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

  // Durchschnittlicher Fahrzeugzustand
  const avgCondition = vehicles.length > 0
    ? Math.round(vehicles.reduce((s, v) => s + (v.condition || 100), 0) / vehicles.length)
    : 100;

  const stats = branch.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
  const profit = stats.revenueCents - stats.expensesCents;
  const margin = stats.revenueCents > 0 ? Math.round(profit / stats.revenueCents * 100) : 0;

  // Gesundheitsscore (0-100)
  const healthScore = Math.round(
    (utilization * 0.3) +
    (avgCondition * 0.3) +
    (vehicles.length > 0 ? Math.min(100, (freeDrivers / vehicles.length) * 100) * 0.2 : 50) +
    (dispatchers.length > 0 ? 20 : 0)
  );

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
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="glass border border-white/10 rounded-xl overflow-hidden hover:border-lime/20 transition group">
      {/* Header mit Akzentleiste */}
      <div className={`h-0.5 ${branch.isHeadquarters ? "bg-amber-300/60" : "bg-lime/40"}`} />
      <div className="p-4 space-y-3.5">
        {/* Titel — klickbar für Detail-Ansicht */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={onOpenDetail}>
            {branch.isHeadquarters ? <Crown className="w-4 h-4 text-amber-300 shrink-0" /> : <Building2 className="w-4 h-4 text-lime/70 shrink-0" />}
            {editing ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="bg-surface-2/50 border border-white/10 rounded px-2 py-1 text-sm focus:border-lime/40 focus:outline-none w-32"
                  autoFocus
                />
                <button onClick={saveName} disabled={savingName} className="text-lime hover:brightness-110">
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium truncate group-hover:text-lime transition">{branch.name}</span>
                {!branch.isHeadquarters && (
                  <button onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(branch.name); }} className="text-muted-foreground hover:text-foreground transition shrink-0">
                    <Edit2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <MapPin className="w-3 h-3" /> {branch.city}
          </div>
        </div>

        {/* Gesundheitsscore + Auslastung */}
        <div className="grid grid-cols-2 gap-2">
          <HealthGauge score={healthScore} />
          <UtilizationBar value={utilization} />
        </div>

        {/* Ressourcen-Chips mit Aufschlüsselung */}
        <div className="grid grid-cols-3 gap-2">
          <ResourceStat icon={Truck} label="LKW" total={vehicles.length} sub={`${freeVehicles} frei · ${activeVehicles} aktiv`} subColor="text-muted-foreground" />
          <ResourceStat icon={Users} label="Fahrer" total={drivers.length} sub={`${freeDrivers} frei · ${restDrivers} Pause`} subColor="text-muted-foreground" />
          <ResourceStat icon={Headset} label="Dispo" total={dispatchers.length} sub={dispatchers.length > 0 ? "Aktiv" : "Fehlt"} subColor={dispatchers.length > 0 ? "text-lime" : "text-coral"} />
        </div>

        {/* Weiteres Personal */}
        {(mechanics.length > 0 || cleaners.length > 0 || accountants.length > 0 || maintVehicles > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {mechanics.length > 0 && <StaffChip icon={Wrench} label="Werkstatt" value={mechanics.length} />}
            {cleaners.length > 0 && <StaffChip icon={Sparkles} label="Reinigung" value={cleaners.length} />}
            {accountants.length > 0 && <StaffChip icon={Calculator} label="Buchhaltung" value={accountants.length} />}
            {maintVehicles > 0 && <StaffChip icon={Activity} label="In Wartung" value={maintVehicles} accent="sky" />}
          </div>
        )}

        {/* Filialleiter */}
        {manager && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2/40 border border-white/5">
            <Portrait portraitId={manager.portraitId} name={manager.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{manager.name}</div>
              <div className="text-[10px] text-muted-foreground">Filialleiter</div>
            </div>
            <button
              onClick={async () => {
                setModeBusy(true);
                try {
                  await send("setBranchManagerMode", {
                    employeeId: manager.id,
                    mode: manager.managementMode === "autonomous" ? "requests_approval" : "autonomous",
                  });
                  showToast(manager.managementMode === "autonomous" ? "Modus: Freigaben erforderlich" : "Modus: Autonom", "success");
                } catch (e) { showToast(e.message, "error"); }
                finally { setModeBusy(false); }
              }}
              disabled={modeBusy}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-medium border transition disabled:opacity-50 ${
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
        <div className="grid grid-cols-2 gap-2">
          <MetricCell icon={TrendingUp} label="Umsatz" value={formatEuro(stats.revenueCents)} />
          <MetricCell icon={ArrowRight} label="Lieferungen" value={stats.deliveries} />
          <MetricCell icon={Percent} label="Marge" value={`${margin}%`} valueClass={margin >= 30 ? "text-lime" : margin >= 10 ? "text-amber-300" : "text-coral"} />
          <MetricCell icon={Wallet} label="Kosten/Tag" value={formatEuro((branch.costPerDayCents || 0) + drivers.reduce((sum, d) => sum + (d.costPerDayCents || 0), 0) + allStaff.reduce((sum, e) => sum + (e.costPerDayCents || 0), 0))} />
        </div>

        {/* Fahrzeugzustand */}
        {vehicles.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2/30 border border-white/5">
            <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Flottenzustand</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${avgCondition >= 70 ? "bg-lime" : avgCondition >= 40 ? "bg-amber-300" : "bg-coral"}`}
                style={{ width: `${avgCondition}%` }}
              />
            </div>
            <span className={`text-xs font-medium tabular-nums ${avgCondition >= 70 ? "text-lime" : avgCondition >= 40 ? "text-amber-300" : "text-coral"}`}>{avgCondition}%</span>
          </div>
        )}

        {/* Aktionen */}
        <div className="flex gap-1.5 pt-1">
          <button
            onClick={onOpenDetail}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-lime/10 border border-lime/20 text-xs text-lime hover:bg-lime/20 transition"
          >
            <Building2 className="w-3.5 h-3.5" /> Details
          </button>
          <button
            onClick={() => onMoveResource({ type: "vehicle", branchId: branch.id })}
            disabled={vehicles.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-2.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
            title="Lkw verschieben"
          >
            <Truck className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMoveResource({ type: "driver", branchId: branch.id })}
            disabled={drivers.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-2.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
            title="Fahrer verschieben"
          >
            <Users className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMoveResource({ type: "employee", branchId: branch.id })}
            disabled={allStaff.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-2.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
            title="Personal verschieben"
          >
            <Briefcase className="w-3.5 h-3.5" />
          </button>
          {!branch.isHeadquarters && (
            <button
              onClick={closeBranch}
              disabled={closing}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 bg-coral/10 border border-coral/30 text-coral text-xs hover:bg-coral/20 disabled:opacity-40 transition"
              title="Filiale stilllegen"
            >
              {closing ? <span className="w-3.5 h-3.5 border-2 border-coral/30 border-t-coral rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthGauge({ score }) {
  const color = score >= 70 ? "text-lime" : score >= 40 ? "text-amber-300" : "text-coral";
  const bgColor = score >= 70 ? "bg-lime" : score >= 40 ? "bg-amber-300" : "bg-coral";
  return (
    <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Gesundheit</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full ${bgColor} transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className={`text-xs font-medium tabular-nums ${color}`}>{score}</span>
      </div>
    </div>
  );
}

function UtilizationBar({ value }) {
  const color = value >= 70 ? "text-lime" : value >= 40 ? "text-amber-300" : "text-coral";
  const bgColor = value >= 70 ? "bg-lime" : value >= 40 ? "bg-amber-300" : "bg-coral";
  return (
    <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Auslastung</div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full ${bgColor} transition-all`} style={{ width: `${value}%` }} />
        </div>
        <span className={`text-xs font-medium tabular-nums ${color}`}>{value}%</span>
      </div>
    </div>
  );
}

function ResourceStat({ icon: Icon, label, total, sub, subColor }) {
  return (
    <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2 py-1.5 text-center">
      <Icon className="w-3.5 h-3.5 text-foreground/40 mx-auto mb-0.5" />
      <div className="text-base font-semibold tabular-nums leading-tight">{total}</div>
      <div className={`text-[9px] leading-tight ${subColor}`}>{sub}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StaffChip({ icon: Icon, label, value, accent = undefined }) {
  const colorMap = {
    sky: "text-sky-300 border-sky-400/20 bg-sky-400/5",
  };
  const cls = accent ? colorMap[accent] : "text-muted-foreground border-white/5 bg-surface-2/30";
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${cls}`}>
      <Icon className="w-3 h-3" />
      <span className="text-xs font-medium tabular-nums">{value}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function MetricCell({ icon: Icon, label, value, valueClass = undefined }) {
  return (
    <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-sm font-medium tabular-nums ${valueClass || ""}`}>{value}</div>
    </div>
  );
}