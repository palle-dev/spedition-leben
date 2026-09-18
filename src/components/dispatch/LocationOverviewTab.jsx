import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import {
  Truck, Users, Headset, Wrench, Sparkles, Calculator, MapPin,
  AlertTriangle, Building2, Crown,
} from "lucide-react";

// Standort-Filter-Ansicht für den Dispo-Bereich.
// Zeigt LKW und Personal pro Filiale mit Engpass-Kennzeichnung.
export default function LocationOverviewTab() {
  const { state } = useGame();
  const [branchFilter, setBranchFilter] = useState("all");

  const activeBranches = (state.branches || []).filter(b => b.status === "active");

  // Ressourcen pro Filiale gruppieren
  const branchData = useMemo(() => {
    return activeBranches.map(b => {
      const vehicles = (state.vehicles || []).filter(
        v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived"
      );
      const drivers = (state.drivers || []).filter(
        d => d.branchId === b.id && d.employmentStatus === "employed"
      );
      const staff = (state.employees || []).filter(
        e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed"
      );

      const vFree = vehicles.filter(v => v.status === "free").length;
      const vTrip = vehicles.filter(v => v.status === "on_trip").length;
      const vMaint = vehicles.filter(v => v.status === "maintenance").length;

      const dFree = drivers.filter(d => d.status === "free").length;
      const dTrip = drivers.filter(d => d.status === "on_trip").length;
      const dRest = drivers.filter(d => d.status === "resting").length;

      const dispatchers = staff.filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior");
      const mechanics = staff.filter(e => e.role === "mechanic");
      const cleaners = staff.filter(e => e.role === "cleaner");
      const accountants = staff.filter(e => e.role === "accountant" || e.role === "accountant_senior");
      const manager = staff.find(e => e.role === "branch_manager");

      // Engpass-Erkennung
      const bottlenecks = [];
      if (vFree > 0 && dFree === 0) {
        bottlenecks.push({
          type: "no_drivers",
          label: `${vFree} LKW bereit, aber kein Fahrer frei`,
          severity: "high",
        });
      }
      if (vFree === 0 && dFree > 0) {
        bottlenecks.push({
          type: "no_vehicles",
          label: `${dFree} Fahrer frei, aber kein LKW bereit`,
          severity: "medium",
        });
      }
      if (vMaint > 0 && mechanics.length === 0) {
        bottlenecks.push({
          type: "no_mechanic",
          label: `${vMaint} LKW in Wartung, kein Werkstatt-Personal`,
          severity: "medium",
        });
      }
      if (vehicles.length > 0 && dispatchers.length === 0 && !b.isHeadquarters) {
        bottlenecks.push({
          type: "no_dispatcher",
          label: "Kein Disponent zugewiesen",
          severity: "low",
        });
      }

      return {
        branch: b,
        vehicles, drivers, staff,
        vFree, vTrip, vMaint,
        dFree, dTrip, dRest,
        dispatchers, mechanics, cleaners, accountants, manager,
        bottlenecks,
      };
    });
  }, [state.vehicles, state.drivers, state.employees, state.branches, activeBranches]);

  const filtered = branchFilter === "all"
    ? branchData
    : branchData.filter(bd => bd.branch.id === branchFilter);

  return (
    <div className="space-y-3">
      {/* Filter-Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip
          active={branchFilter === "all"}
          onClick={() => setBranchFilter("all")}
          icon={Building2}
          label="Alle Standorte"
        />
        {activeBranches.map(b => (
          <FilterChip
            key={b.id}
            active={branchFilter === b.id}
            onClick={() => setBranchFilter(b.id)}
            icon={b.isHeadquarters ? Crown : MapPin}
            label={`${b.name} · ${b.city}`}
          />
        ))}
      </div>

      {/* Standort-Karten */}
      {filtered.map(bd => (
        <BranchResourceCard key={bd.branch.id} data={bd} />
      ))}

      {filtered.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-6">
          Keine aktiven Filialen.
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition ${
        active
          ? "bg-lime/15 border-lime/40 text-lime"
          : "bg-surface-2/40 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
      }`}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

function BranchResourceCard({ data }) {
  const { branch: b, vehicles, drivers, staff, vFree, vTrip, vMaint, dFree, dTrip, dRest,
    dispatchers, mechanics, cleaners, accountants, manager, bottlenecks } = data;

  return (
    <div className="glass border border-white/10 rounded-xl p-3.5 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {b.isHeadquarters ? <Crown className="w-4 h-4 text-amber-300" /> : <Building2 className="w-4 h-4 text-lime/70" />}
          <span className="text-sm font-medium">{b.name}</span>
          <span className="text-xs text-muted-foreground">· {b.city}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {vehicles.length}</span>
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {drivers.length + staff.length}</span>
        </div>
      </div>

      {/* Engpässe */}
      {bottlenecks.length > 0 && (
        <div className="space-y-1">
          {bottlenecks.map((bn, i) => (
            <div
              key={i}
              className={`flex items-start gap-1.5 text-[11px] rounded-lg px-2.5 py-1.5 border ${
                bn.severity === "high"
                  ? "bg-coral/10 border-coral/30 text-coral"
                  : bn.severity === "medium"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-sky-400/10 border-sky-400/30 text-sky-300"
              }`}
            >
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{bn.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* LKW + Fahrer */}
      <div className="grid grid-cols-2 gap-2">
        {/* LKW */}
        <div className="rounded-lg bg-surface-2/30 border border-white/5 p-2.5 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1">
            <Truck className="w-3 h-3" /> LKW
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-lime flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {vFree} frei</span>
            <span className="text-amber-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {vTrip} unterwegs</span>
            {vMaint > 0 && <span className="text-sky-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {vMaint} Wartung</span>}
          </div>
          {vFree > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-white/5">
              {vehicles.filter(v => v.status === "free").slice(0, 4).map(v => (
                <div key={v.id} className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>{vehicleDisplayName(v)}</span>
                  <span>{v.locationCity}</span>
                </div>
              ))}
              {vFree > 4 && <div className="text-[10px] text-muted-foreground/50">+{vFree - 4} weitere</div>}
            </div>
          )}
        </div>

        {/* Fahrer */}
        <div className="rounded-lg bg-surface-2/30 border border-white/5 p-2.5 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1">
            <Users className="w-3 h-3" /> Fahrer
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-lime flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {dFree} frei</span>
            <span className="text-amber-300 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {dTrip} unterwegs</span>
            {dRest > 0 && <span className="text-muted-foreground flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-current" /> {dRest} Pause</span>}
          </div>
          {dFree > 0 && (
            <div className="space-y-0.5 pt-1 border-t border-white/5">
              {drivers.filter(d => d.status === "free").slice(0, 4).map(d => (
                <div key={d.id} className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span className="truncate">{driverDisplayName(d)}</span>
                  <span className="shrink-0 ml-1">{d.locationCity}</span>
                </div>
              ))}
              {dFree > 4 && <div className="text-[10px] text-muted-foreground/50">+{dFree - 4} weitere</div>}
            </div>
          )}
        </div>
      </div>

      {/* Personal (nicht-fahrend) */}
      {(dispatchers.length > 0 || mechanics.length > 0 || cleaners.length > 0 || accountants.length > 0 || manager) && (
        <div className="rounded-lg bg-surface-2/30 border border-white/5 p-2.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">Personal</div>
          <div className="flex items-center gap-2 flex-wrap">
            {manager && (
              <StaffPill icon={Crown} label="Filialleiter" name={manager.name} portraitId={manager.portraitId} />
            )}
            {dispatchers.length > 0 && (
              <StaffPill icon={Headset} label="Dispo" count={dispatchers.length} />
            )}
            {mechanics.length > 0 && (
              <StaffPill icon={Wrench} label="Werkstatt" count={mechanics.length} />
            )}
            {cleaners.length > 0 && (
              <StaffPill icon={Sparkles} label="Reinigung" count={cleaners.length} />
            )}
            {accountants.length > 0 && (
              <StaffPill icon={Calculator} label="Buchhaltung" count={accountants.length} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffPill({ icon: Icon, label, count, name, portraitId }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2 py-1">
      {portraitId ? (
        <Portrait portraitId={portraitId} name={name} size="sm" className="!w-6 !h-6" />
      ) : (
        <Icon className="w-3 h-3 text-muted-foreground" />
      )}
      <span className="text-[11px] text-muted-foreground">
        {name || (count != null ? `${count} ${label}` : label)}
      </span>
    </div>
  );
}