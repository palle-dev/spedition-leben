import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Check, Headset, Clock, Moon, Truck } from "lucide-react";
import { SHIFT_TEMPLATES } from "@/lib/personnelMarketData";

// Disponenten-Einrichtung: Arbeitsweise und Schicht festlegen.
// Alle Lkw gehören dem Firmenpool — verschiedene Disponenten in
// verschiedenen Schichten greifen auf denselben Pool zu (24/7-Betrieb).
export default function DispatcherSetup({ employee, onClose }) {
  const { send, showToast } = useGame();
  const [workMode, setWorkMode] = useState(employee.workMode || "suggestions");
  const [shiftId, setShiftId] = useState(
    SHIFT_TEMPLATES.find(s => s.startMin === (employee.shiftStart ?? 480) && s.endMin === (employee.shiftEnd ?? 960))?.id || "day"
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const shift = SHIFT_TEMPLATES.find(s => s.id === shiftId) || SHIFT_TEMPLATES[1];
      await send("setupDispatcher", {
        employeeId: employee.id,
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
      {/* Firmenpool-Hinweis */}
      <div className="rounded-lg border border-lime/20 bg-lime/5 px-3 py-2.5">
        <div className="text-[10px] tracking-[0.14em] uppercase text-lime/80 mb-1 flex items-center gap-1.5">
          <Truck className="w-3 h-3" /> Firmenpool
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed">
          Alle Lkw gehören dem Firmenpool. Dieser Disponent greift automatisch auf alle verfügbaren Fahrzeuge zu — verschiedene Schichten teilen sich die Flotte für den 24/7-Betrieb.
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