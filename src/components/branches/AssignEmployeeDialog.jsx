import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { roleLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import { ArrowRight, Users, MapPin, Check, Briefcase } from "lucide-react";

// Dialog zur sofortigen Zuweisung eines Angestellten (Mechaniker, Reinigung,
// Buchhaltung, Disponent, Filialleiter) zu einer anderen Filiale.
// Im Gegensatz zu Fahrern/Lkw erfolgt die Verschiebung sofort – Angestellte
// pendeln selbstständig.
export default function AssignEmployeeDialog({ employee, onClose }) {
  const { state, send, showToast } = useGame();
  const [targetBranchId, setTargetBranchId] = useState("");
  const [saving, setSaving] = useState(false);

  const activeBranches = (state.branches || []).filter(
    b => b.status === "active" && b.id !== (employee.assignedBranchId || employee.branchId)
  );
  const currentBranch = (state.branches || []).find(
    b => b.id === (employee.assignedBranchId || employee.branchId)
  );

  async function submit() {
    if (!targetBranchId) return;
    setSaving(true);
    try {
      await send("assignEmployeeToBranch", { employeeId: employee.id, branchId: targetBranchId });
      const target = state.branches.find(b => b.id === targetBranchId);
      showToast(`${employee.name} wurde nach ${target?.city} versetzt.`, "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-5 h-5 text-lime" />
          <h2 className="text-lg font-medium">Personal verschieben</h2>
        </div>

        {/* Mitarbeiter-Info */}
        <div className="flex items-center gap-3 mb-4 mt-3 rounded-lg bg-surface-2/40 border border-white/5 px-3 py-2.5">
          <Portrait portraitId={employee.portraitId} name={employee.name} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground truncate">{employee.name}</div>
            <div className="text-xs text-muted-foreground">{roleLabel(employee.role)}</div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {currentBranch?.city || employee.locationCity || "—"}
          </div>
        </div>

        {/* Zielfiliale wählen */}
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Zielfiliale</label>
        <div className="space-y-1.5 mb-4">
          {activeBranches.map(b => (
            <button
              key={b.id}
              onClick={() => setTargetBranchId(b.id)}
              className={`w-full text-left rounded-lg px-3 py-2.5 border transition flex items-center justify-between ${
                targetBranchId === b.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-2 text-sm">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                {b.name} · {b.city}
              </span>
              {targetBranchId === b.id && <Check className="w-4 h-4 text-lime" />}
            </button>
          ))}
          {activeBranches.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-3">Keine weiteren aktiven Filialen verfügbar.</div>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground/70 mb-4 flex items-start gap-1.5">
          <Users className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Die Versetzung erfolgt sofort. Der Angestellte pendelt selbstständig zur neuen Filiale.</span>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={!targetBranchId || saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {saving ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Versetzen</>}
          </button>
        </div>
      </div>
    </div>
  );
}