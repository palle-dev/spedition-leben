import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { vehicleDisplayName, roleLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import { Building2, MapPin, Truck, Users, Headset, TrendingUp, Wallet, Edit2, X, ArrowRight, Crown, Check, Zap, ShieldCheck } from "lucide-react";

export default function BranchCard({ branch, onMoveResource }) {
  const { state, send, showToast } = useGame();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(branch.name);
  const [savingName, setSavingName] = useState(false);
  const [closing, setClosing] = useState(false);

  const vehicles = (state.vehicles || []).filter(v => v.branchId === branch.id && v.status !== "sold" && v.status !== "archived");
  const drivers = (state.drivers || []).filter(d => d.branchId === branch.id && d.employmentStatus === "employed");
  const dispatchers = (state.employees || []).filter(e => e.assignedBranchId === branch.id && e.employmentStatus === "employed");
  const manager = (state.employees || []).find(e => e.role === "branch_manager" && e.assignedBranchId === branch.id && e.employmentStatus === "employed");
  const [modeBusy, setModeBusy] = useState(false);
  const activeVehicles = vehicles.filter(v => v.status === "on_trip").length;
  const utilization = vehicles.length > 0 ? Math.round(activeVehicles / vehicles.length * 100) : 0;
  const stats = branch.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };

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
    <div className="glass border border-white/10 rounded-xl p-4 hover:border-lime/20 transition">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {branch.isHeadquarters ? <Crown className="w-4 h-4 text-amber-300" /> : <Building2 className="w-4 h-4 text-lime/70" />}
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="bg-surface-2/50 border border-white/10 rounded px-2 py-1 text-sm focus:border-lime/40 focus:outline-none w-32"
                autoFocus
              />
              <button onClick={saveName} disabled={savingName} className="text-lime hover:brightness-110">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{branch.name}</span>
              {!branch.isHeadquarters && (
                <button onClick={() => { setEditing(true); setEditName(branch.name); }} className="text-muted-foreground hover:text-foreground transition">
                  <Edit2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" /> {branch.city}
        </div>
      </div>

      {/* Ressourcen */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <ResourceChip icon={Truck} label="Lkw" value={vehicles.length} active={activeVehicles} />
        <ResourceChip icon={Users} label="Fahrer" value={drivers.length} />
        <ResourceChip icon={Headset} label="Dispo" value={dispatchers.length} />
      </div>

      {/* Filialleiter */}
      {manager && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-surface-2/40 border border-white/5">
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
            title={manager.managementMode === "autonomous" ? "Autonom: Kleine Entscheidungen selbstständig" : "Freigaben: Alle Entscheidungen müssen freigegeben werden"}
          >
            {manager.managementMode === "autonomous" ? <Zap className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
            {manager.managementMode === "autonomous" ? "Autonom" : "Freigabe"}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Umsatz</div>
          <div className="font-medium tabular-nums">{formatEuro(stats.revenueCents)}</div>
        </div>
        <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground">Lieferungen</div>
          <div className="font-medium tabular-nums">{stats.deliveries}</div>
        </div>
        <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground">Auslastung</div>
          <div className="font-medium tabular-nums">{utilization}%</div>
        </div>
        <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Kosten/Tag</div>
          <div className="font-medium tabular-nums">{formatEuro(branch.totalDailyCostCents || branch.costPerDayCents)}</div>
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex gap-1.5">
        <button
          onClick={() => onMoveResource({ type: "vehicle", branchId: branch.id })}
          disabled={vehicles.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
        >
          <Truck className="w-3.5 h-3.5" /> Lkw verschieben
        </button>
        <button
          onClick={() => onMoveResource({ type: "driver", branchId: branch.id })}
          disabled={drivers.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition"
        >
          <Users className="w-3.5 h-3.5" /> Fahrer verschieben
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
  );
}

function ResourceChip({ icon: Icon, label, value, active }) {
  return (
    <div className="rounded-lg bg-surface-2/30 border border-white/5 px-2 py-1.5 text-center">
      <Icon className="w-3.5 h-3.5 text-foreground/40 mx-auto mb-0.5" />
      <div className="text-sm font-medium tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground">{label}{active != null && active > 0 ? ` (${active} aktiv)` : ""}</div>
    </div>
  );
}