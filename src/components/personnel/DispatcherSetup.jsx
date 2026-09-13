import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { formatEuro } from "@/lib/gameData";
import { Truck, Check, X, Headset, Clock, Moon } from "lucide-react";
import { SHIFT_TEMPLATES } from "@/lib/personnelMarketData";

// Disponenten-Einrichtung: Lkw zuweisen, Arbeitsweise festlegen.
export default function DispatcherSetup({ employee, onClose }) {
  const { state, send, showToast } = useGame();
  const [selectedVehicles, setSelectedVehicles] = useState(employee.assignedVehicleIds || []);
  const [workMode, setWorkMode] = useState(employee.workMode || "suggestions");
  const [shiftId, setShiftId] = useState(
    SHIFT_TEMPLATES.find(s => s.startMin === (employee.shiftStart ?? 480) && s.endMin === (employee.shiftEnd ?? 960))?.id || "day"
  );
  const [saving, setSaving] = useState(false);

  const capacity = employee.capacity || 6;
  const allVehicles = state.vehicles;
  // LKWs, die keinem ANDEREN Disponenten zugewiesen sind.
  // Bereits diesem Disponenten zugewiesene LKWs bleiben auswählbar.
  const otherAssignedIds = new Set(
    (state.employees || [])
      .filter(e => e.id !== employee.id && (e.role === "dispatcher" || e.role === "dispatcher_senior"))
      .flatMap(e => e.assignedVehicleIds || [])
  );
  const availableVehicles = allVehicles.filter(v =>
    selectedVehicles.includes(v.id) || !otherAssignedIds.has(v.id)
  );

  function toggleVehicle(vid) {
    setSelectedVehicles(prev => {
      if (prev.includes(vid)) return prev.filter(v => v !== vid);
      if (prev.length >= capacity) return prev; // Überlastung verhindern
      return [...prev, vid];
    });
  }

  async function save() {
    setSaving(true);
    try {
      const shift = SHIFT_TEMPLATES.find(s => s.id === shiftId) || SHIFT_TEMPLATES[1];
      await send("setupDispatcher", {
        employeeId: employee.id,
        vehicleIds: selectedVehicles,
        workMode,
        shiftStart: shift.startMin,
        shiftEnd: shift.endMin,
      });
      showToast("Disponent eingerichtet.", "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  const modes = [
    { id: "suggestions", label: "Vorschläge", desc: "Bereitet Vorschläge vor – du bestätigst." },
    { id: "dispatch_accepted", label: "Disponiert", desc: "Darf angenommene Aufträge verbindlich planen." },
    { id: "autonomous", label: "Selbstständig", desc: "Darf Marktangebote annehmen und disponieren." },
  ];

  return (
    <div className="space-y-5">
      {/* Lkw-Zuweisung */}
      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
          <Truck className="w-3 h-3" /> Zugewiesene Lkw
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          {selectedVehicles.length}/{capacity} zugewiesen · Maximal {capacity} Lkw
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-none">
          {availableVehicles.map(v => {
            const selected = selectedVehicles.includes(v.id);
            const disabled = !selected && selectedVehicles.length >= capacity;
            return (
              <button
                key={v.id}
                onClick={() => toggleVehicle(v.id)}
                disabled={disabled}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm border transition ${
                  selected ? "border-lime/40 bg-lime/10 text-lime" : "border-white/10 text-foreground hover:border-white/20"
                } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  {vehicleDisplayName(v)}
                </span>
                <span className="text-[10px] text-muted-foreground">{v.locationCity}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Arbeitsweise */}
      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
          <Headset className="w-3 h-3" /> Arbeitsweise
        </div>
        <div className="space-y-1.5">
          {modes.map(m => (
            <button
              key={m.id}
              onClick={() => setWorkMode(m.id)}
              className={`w-full text-left rounded-lg px-3 py-2.5 border transition ${
                workMode === m.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className={`text-sm font-medium ${workMode === m.id ? "text-lime" : "text-foreground"}`}>{m.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Schicht */}
      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
          <Clock className="w-3 h-3" /> Schicht (8 Stunden)
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {SHIFT_TEMPLATES.map(s => (
            <button
              key={s.id}
              onClick={() => setShiftId(s.id)}
              className={`text-left rounded-lg px-3 py-2 border transition ${
                shiftId === s.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className={`text-sm font-medium flex items-center gap-1.5 ${shiftId === s.id ? "text-lime" : "text-foreground"}`}>
                {s.id === "night" && <Moon className="w-3.5 h-3.5" />}
                {s.label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
            </button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-2">
          Mehrere Disponenten in verschiedenen Schichten ermöglichen 24/7-Betrieb.
        </div>
      </div>

      {/* Speichern */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
      >
        {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Einrichtung bestätigen</>}
      </button>
    </div>
  );
}