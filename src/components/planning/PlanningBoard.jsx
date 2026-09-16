import React, { useState, useMemo } from "react";
import { Truck, Users, Wrench, Calendar, AlertTriangle, Search, Eye, EyeOff } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { collectPlanningData } from "@/lib/planningData";
import PlanningTimeline from "./PlanningTimeline";
import UnplannedOrders from "./UnplannedOrders";
import PlanningHelpers from "./PlanningHelpers";
import PlanningChangeForm from "./PlanningChangeForm";
import TrainingRescheduleDialog from "./TrainingRescheduleDialog";

// Hauptkomponente: Die Wochenplanungstafel.
// Verbindet die vorhandene Disposition mit Fahrzeugverfügbarkeit,
// Personalabwesenheiten, Wartung, Weiterbildung und angenommenen
// Transportverpflichtungen in einer 7-Tage-Zeitachse.
export default function PlanningBoard({ onPlanOrder }) {
  const { state } = useGame();
  const [view, setView] = useState("vehicles");
  const [showPrivate, setShowPrivate] = useState(true);
  const [showExpected, setShowExpected] = useState(true);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [helpersOpen, setHelpersOpen] = useState(false);
  const [helperType, setHelperType] = useState("resources");
  const [helperOrderId, setHelperOrderId] = useState("");
  const [helperVehicleId, setHelperVehicleId] = useState("");
  const [changeFormOpen, setChangeFormOpen] = useState(false);
  const [changeTourId, setChangeTourId] = useState("");
  const [trainingRescheduleOpen, setTrainingRescheduleOpen] = useState(false);
  const [trainingEnrollmentId, setTrainingEnrollmentId] = useState("");

  const planningData = useMemo(() => {
    if (!state) return null;
    return collectPlanningData(state, { horizonDays: 7 });
  }, [state]);

  if (!planningData) return null;

  const rows = view === "vehicles" ? planningData.vehicles
    : view === "personnel" ? planningData.personnel
    : planningData.workshop;

  function handleSelectBlock(block) {
    setSelectedBlock(block);
    if (block.sourceType === "tour" && block.certainty === "planned") {
      const tour = (state.tours || []).find(t => t.id === block.linkedRef?.id);
      if (tour && tour.status === "active") {
        setChangeTourId(tour.id);
        setChangeFormOpen(true);
      }
    }
    if (block.sourceType === "training" && block.linkedRef?.id) {
      setTrainingEnrollmentId(block.linkedRef.id);
      setTrainingRescheduleOpen(true);
    }
  }

  function handleFindResources(orderId) {
    setHelperType("resources");
    setHelperOrderId(orderId);
    setHelperVehicleId("");
    setHelpersOpen(true);
  }

  function handleCheckConflicts() {
    setHelperType("conflicts");
    setHelperOrderId("");
    setHelperVehicleId("");
    setHelpersOpen(true);
  }

  return (
    <div className="space-y-3">
      <Toolbar
        view={view}
        setView={setView}
        showPrivate={showPrivate}
        setShowPrivate={setShowPrivate}
        showExpected={showExpected}
        setShowExpected={setShowExpected}
        conflictCount={planningData.conflicts.length}
        onResources={() => { setHelperType("resources"); setHelpersOpen(true); }}
        onMaintenance={() => { setHelperType("maintenance"); setHelpersOpen(true); }}
        onConflicts={handleCheckConflicts}
      />
      {planningData.conflicts.length > 0 && (
        <ConflictSummary conflicts={planningData.conflicts} />
      )}
      <UnplannedOrders
        orders={planningData.unplanned}
        onFindResources={handleFindResources}
        onPlan={onPlanOrder}
      />
      {showExpected && planningData.expectedDemand.length > 0 && (
        <ExpectedDemand demands={planningData.expectedDemand} />
      )}
      <PlanningTimeline
        rows={rows}
        horizonStart={planningData.horizonStart}
        horizonEnd={planningData.horizonEnd}
        selectedBlockId={selectedBlock?.sourceId}
        onSelectBlock={handleSelectBlock}
        showPrivateBar={showPrivate}
        privateAppointments={planningData.privateAppointments}
      />
      <PlanningLegend />
      <PlanningHelpers
        open={helpersOpen}
        onClose={() => setHelpersOpen(false)}
        initialHelper={helperType}
        initialOrderId={helperOrderId}
        initialVehicleId={helperVehicleId}
      />
      <PlanningChangeForm
        open={changeFormOpen}
        onClose={() => setChangeFormOpen(false)}
        tourId={changeTourId}
      />
      <TrainingRescheduleDialog
        open={trainingRescheduleOpen}
        onClose={() => setTrainingRescheduleOpen(false)}
        enrollmentId={trainingEnrollmentId}
      />
    </div>
  );
}

function Toolbar({ view, setView, showPrivate, setShowPrivate, showExpected, setShowExpected, conflictCount, onResources, onMaintenance, onConflicts }) {
  const views = [
    { id: "vehicles", label: "Fahrzeuge", icon: Truck },
    { id: "personnel", label: "Personal", icon: Users },
    { id: "workshop", label: "Werkstatt", icon: Wrench },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Ansichts-Tabs */}
      <div className="flex rounded-lg border border-white/10 overflow-hidden">
        {views.map(v => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition ${
                view === v.id ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          );
        })}
      </div>
      {/* Filter */}
      <button
        onClick={() => setShowPrivate(s => !s)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
          showPrivate ? "border-coral/30 text-coral" : "border-white/10 text-muted-foreground"
        }`}
      >
        {showPrivate ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        Privat
      </button>
      <button
        onClick={() => setShowExpected(s => !s)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
          showExpected ? "border-violet-500/30 text-violet-300" : "border-white/10 text-muted-foreground"
        }`}
      >
        {showExpected ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        Erwartet
      </button>
      {/* Aktionen */}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onResources}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
        >
          <Search className="w-3.5 h-3.5" />
          Ressourcen
        </button>
        <button
          onClick={onMaintenance}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
        >
          <Wrench className="w-3.5 h-3.5" />
          Wartung
        </button>
        <button
          onClick={onConflicts}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition ${
            conflictCount > 0 ? "border-red-500/30 text-red-400" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Konflikte {conflictCount > 0 && `(${conflictCount})`}
        </button>
      </div>
    </div>
  );
}

function ConflictSummary({ conflicts }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 space-y-1.5">
      {conflicts.slice(0, 3).map((c, i) => (
        <div key={i} className="text-[11px] text-red-300/80 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{c.message}</span>
        </div>
      ))}
      {conflicts.length > 3 && (
        <div className="text-[10px] text-muted-foreground">
          … und {conflicts.length - 3} weitere — siehe „Konflikte prüfen"
        </div>
      )}
    </div>
  );
}

function ExpectedDemand({ demands }) {
  return (
    <div className="rounded-lg border border-violet-500/15 bg-violet-500/5 px-3 py-2.5 space-y-1.5">
      <div className="text-[11px] font-medium text-violet-300 flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5" />
        Erwarteter Bedarf aus Rahmenverträgen — {demands.length} Transporte
      </div>
      <div className="text-[10px] text-muted-foreground">
        Diese Transporte werden automatisch erzeugt, wenn der Vertragstag beginnt. Sie sind noch keine disponierten Aufträge.
      </div>
      <div className="flex flex-wrap gap-1 mt-1">
        {demands.slice(0, 10).map((d) => (
          <div key={d.id} className="text-[10px] rounded border border-violet-500/20 bg-violet-500/5 px-1.5 py-0.5">
            T{d.expectedDay}: {d.customerName} {d.fromCity}→{d.toCity}
          </div>
        ))}
        {demands.length > 10 && (
          <div className="text-[10px] text-muted-foreground">… +{demands.length - 10} weitere</div>
        )}
      </div>
    </div>
  );
}

function PlanningLegend() {
  const items = [
    { icon: "🚛", label: "Fahrt", color: "text-lime" },
    { icon: "🔄", label: "Leerfahrt", color: "text-cyan-300" },
    { icon: "📦", label: "Beladung", color: "text-amber-300" },
    { icon: "😴", label: "Ruhe", color: "text-indigo-300" },
    { icon: "🔧", label: "Wartung", color: "text-orange-300" },
    { icon: "🏖️", label: "Urlaub", color: "text-teal-300" },
    { icon: "🤒", label: "Krankheit", color: "text-rose-300" },
    { icon: "🎓", label: "Weiterbildung", color: "text-violet-300" },
    { icon: "✈️", label: "Reise", color: "text-sky-300" },
    { icon: "✓", label: "Verfügbar", color: "text-green-300" },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground pt-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1">
          <span>{item.icon}</span>
          <span className={item.color}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}