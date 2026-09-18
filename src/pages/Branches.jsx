import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import SiteExpansionCard from "@/components/branches/SiteExpansionCard";
import BranchCard from "@/components/branches/BranchCard";
import BranchMapLibre from "@/components/branches/BranchMapLibre";
import BranchOverview from "@/components/branches/BranchOverview";
import OpenBranchDialog from "@/components/branches/OpenBranchDialog";
import MoveResourceDialog from "@/components/branches/MoveResourceDialog";
import AssignEmployeeDialog from "@/components/branches/AssignEmployeeDialog";
import BranchDecisionsPanel from "@/components/branches/BranchDecisionsPanel";
import { Building2, Plus, Truck, Users, MapPin, ArrowRight, LayoutGrid, List, Briefcase, Network } from "lucide-react";
import { Link } from "react-router-dom";
import PageHint from "@/components/help/PageHint";

export default function Branches() {
  const { state, send, showToast } = useGame();
  const [showOpen, setShowOpen] = useState(false);
  const [moveContext, setMoveContext] = useState(null); // { type, branchId }
  const [selectedResource, setSelectedResource] = useState(null); // resource object
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [tab, setTab] = useState("overview"); // "overview" | "map"

  const activeBranches = (state.branches || []).filter(b => b.status === "active");
  const totalDailyCost = activeBranches.reduce((s, b) => s + (b.costPerDayCents || 0), 0);
  const totalRevenue = activeBranches.reduce((s, b) => s + (b.stats?.revenueCents || 0), 0);
  const totalDeliveries = activeBranches.reduce((s, b) => s + (b.stats?.deliveries || 0), 0);

  // When moveContext is set, show resource picker
  const branchForMove = moveContext ? activeBranches.find(b => b.id === moveContext.branchId) : null;
  const availableResources = useMemo(() => {
    if (!moveContext || !branchForMove) return [];
    if (moveContext.type === "vehicle") {
      return (state.vehicles || []).filter(v =>
        v.branchId === moveContext.branchId &&
        v.status === "free" &&
        v.status !== "sold" && v.status !== "archived"
      );
    } else if (moveContext.type === "driver") {
      return (state.drivers || []).filter(d =>
        d.branchId === moveContext.branchId &&
        d.employmentStatus === "employed" &&
        d.status === "free"
      );
    } else {
      // Personal: alle Angestellten an dieser Filiale
      return (state.employees || []).filter(e =>
        (e.assignedBranchId || e.branchId) === moveContext.branchId &&
        e.employmentStatus === "employed"
      );
    }
  }, [moveContext, branchForMove, state.vehicles, state.drivers, state.employees]);

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-6">
      <PageHint pageKey="branches" />
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Filialen</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeBranches.length} aktive Standort{activeBranches.length !== 1 ? "e" : ""} · {formatEuro(totalDailyCost)}/Tag · {totalDeliveries} Lieferungen gesamt
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/netzwerk"
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-lime/30 hover:bg-lime/5 transition"
            title="Standorte auf der strategischen Netzkarte analysieren"
          >
            <Network className="w-4 h-4" /> <span className="hidden sm:inline">Netzkarte</span>
          </Link>
          <button
            onClick={() => setShowOpen(true)}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 transition active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Filiale eröffnen
          </button>
        </div>
      </div>

      {/* Filialleiter-Entscheidungen */}
      <BranchDecisionsPanel />

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={List} label="Übersicht" />
        <TabButton active={tab === "map"} onClick={() => setTab("map")} icon={LayoutGrid} label="Standorte & Karte" />
        <TabButton active={tab === "expansion"} onClick={() => setTab("expansion")} icon={Building2} label="Standortausbau" />
      </div>

      {tab === "expansion" ? (
        <div className="grid lg:grid-cols-2 gap-4 items-start">{activeBranches.map(b => <SiteExpansionCard key={b.id} branchId={b.id} />)}</div>
      ) : tab === "overview" ? (
        <BranchOverview />
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Standorte" value={activeBranches.length} icon={Building2} />
            <SummaryCard label="Gesamtumsatz" value={formatEuro(totalRevenue)} icon={ArrowRight} />
            <SummaryCard label="Lieferungen" value={totalDeliveries} icon={Truck} />
            <SummaryCard label="Tageskosten" value={formatEuro(totalDailyCost)} icon={Users} />
          </div>

          <div className="grid lg:grid-cols-[380px_1fr] gap-6">
            {/* Map */}
            <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className="h-[500px]">
                <BranchMapLibre branches={activeBranches} selectedId={selectedBranchId} onSelect={setSelectedBranchId} />
              </div>
              <div className="text-xs text-muted-foreground/60 text-center">
                Klicke auf einen Marker, um die Filialkarte zu fokussieren.
              </div>
            </div>

            {/* Branch Cards */}
            <div className="grid md:grid-cols-2 gap-3">
              {activeBranches.map(b => (
                <BranchCard
                  key={b.id}
                  branch={{ ...b, totalDailyCostCents: computeBranchDailyCost(state, b) }}
                  onMoveResource={(ctx) => { setMoveContext(ctx); setSelectedBranchId(b.id); }}
                />
              ))}
              {activeBranches.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8 col-span-2">
                  Keine aktiven Filialen. Eröffne deinen ersten Standort.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Open Branch Dialog */}
      {showOpen && <OpenBranchDialog onClose={() => setShowOpen(false)} />}

      {/* Resource Picker (when moveContext is set but no resource selected yet) */}
      {moveContext && !selectedResource && (
        <ResourcePicker
          moveContext={moveContext}
          branch={branchForMove}
          resources={availableResources}
          onSelect={(r) => setSelectedResource(r)}
          onClose={() => setMoveContext(null)}
        />
      )}

      {/* Move Resource Dialog (when a resource is selected) */}
      {selectedResource && moveContext.type === "employee" ? (
        <AssignEmployeeDialog
          employee={selectedResource}
          onClose={() => { setSelectedResource(null); setMoveContext(null); }}
        />
      ) : selectedResource ? (
        <MoveResourceDialog
          resource={selectedResource}
          resourceType={moveContext.type}
          onClose={() => { setSelectedResource(null); setMoveContext(null); }}
        />
      ) : null}
    </div>
  );
}

function computeBranchDailyCost(state, branch) {
  const drivers = (state.drivers || []).filter(d => d.branchId === branch.id && d.employmentStatus === "employed");
  const dispatchers = (state.employees || []).filter(e => e.assignedBranchId === branch.id && e.employmentStatus === "employed");
  return branch.costPerDayCents
    + drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)
    + dispatchers.reduce((s, e) => s + (e.costPerDayCents || 0), 0);
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-lg font-medium tabular-nums">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? "border-lime text-lime"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ResourcePicker({ moveContext, branch, resources, onSelect, onClose }) {
  const isEmployee = moveContext.type === "employee";
  const Icon = moveContext.type === "vehicle" ? Truck : isEmployee ? Briefcase : Users;
  const title = moveContext.type === "vehicle" ? "Lkw verschieben" : isEmployee ? "Personal verschieben" : "Fahrer verschieben";
  const emptyLabel = isEmployee ? "Kein Personal an diesem Standort." : `Keine freie ${moveContext.type === "vehicle" ? "Fahrzeuge" : "Fahrer"} an diesem Standort.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-5 h-5 text-lime" />
          <h2 className="text-lg font-medium">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Wähle eine Ressource aus {branch?.name} ({branch?.city}):
        </p>
        {resources.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">{emptyLabel}</div>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {resources.map(r => (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                className="w-full text-left rounded-lg px-3 py-2.5 border border-white/10 hover:border-lime/30 hover:bg-lime/5 transition flex items-center justify-between"
              >
                <span className="flex items-center gap-2 text-sm">
                  {moveContext.type === "vehicle" ? <Truck className="w-3.5 h-3.5 text-muted-foreground" /> : isEmployee ? <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
                  {moveContext.type === "vehicle" ? vehicleDisplayName(r) : r.name}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {r.locationCity}
                </span>
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-4 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
          Abbrechen
        </button>
      </div>
    </div>
  );
}